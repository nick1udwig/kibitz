/**
 * Hook for tracking conversation metadata and branch state
 * Integrates with existing git operations and provides UI state management
 */

import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@/stores/rootStore';
import { getProjectPath } from '@/lib/projectPathService';

interface ConversationMetadata {
  conversationId: string;
  projectId: string;
  branchName: string;
  commitHash?: string;
  startTime: number;
  messageCount: number;
  status: 'active' | 'completed' | 'reverted';
}

interface BranchInfo {
  branchName: string;
  commitHash: string;
  commitMessage: string;
  timestamp: number;
  filesChanged: string[];
  linesAdded: number;
  linesRemoved: number;
  isMainBranch: boolean;
  tags: string[];
}

interface ProjectMetadata {
  projectId: string;
  projectName: string;
  totalBranches: number;
  totalCommits: number;
  lastActivity: number;
  conversations: ConversationMetadata[];
  branches: BranchInfo[];
}

export function useConversationMetadata() {
  const { executeTool, activeProjectId, projects } = useStore();
  const [metadata, setMetadata] = useState<ConversationMetadata | null>(null);
  const [projectMetadata, setProjectMetadata] = useState<ProjectMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get active project from store
  const activeProject = activeProjectId ? projects.find(p => p.id === activeProjectId) : null;

  // Generate conversation ID
  const generateConversationId = useCallback(() => {
    return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // Start new conversation tracking
  const startConversation = useCallback(() => {
    if (!activeProject) return null;

    const conversationId = generateConversationId();
    const newMetadata: ConversationMetadata = {
      conversationId,
      projectId: activeProject.id,
      branchName: 'main', // Default branch - will be updated by branch refresh
      startTime: Date.now(),
      messageCount: 0,
      status: 'active'
    };

    setMetadata(newMetadata);
    console.log('🔄 Started conversation tracking:', conversationId);
    
    // 🔄 NEW: Start auto-refresh of branch info every 30 seconds
    const refreshInterval = setInterval(async () => {
      if (activeProject?.id) {
        try {
          const response = await fetch(`/api/projects/${activeProject.id}/branches/current`);
          const data = await response.json();
          
          if (!data.error && data.currentBranch) {
            setMetadata(prev => prev ? {
              ...prev,
              branchName: data.currentBranch
            } : null);
          }
        } catch (error) {
          console.warn('Failed to auto-refresh branch in conversation metadata:', error);
        }
      }
    }, 30000); // 30 seconds
    
    // Store interval for cleanup
    (newMetadata as any)._refreshInterval = refreshInterval;
    
    return conversationId;
  }, [activeProject, generateConversationId]);

  // Update message count
  const incrementMessageCount = useCallback(() => {
    setMetadata(prev => prev ? {
      ...prev,
      messageCount: prev.messageCount + 1
    } : null);
  }, []);

  // Update branch info when git operations happen
  const updateBranchInfo = useCallback((branchName: string, commitHash?: string) => {
    setMetadata(prev => prev ? {
      ...prev,
      branchName,
      commitHash
    } : null);
  }, []);

  // Complete conversation
  const completeConversation = useCallback(() => {
    setMetadata(prev => {
      if (!prev) return null;
      
      // Clear auto-refresh interval
      if ((prev as any)._refreshInterval) {
        clearInterval((prev as any)._refreshInterval);
      }
      
      return {
        ...prev,
        status: 'completed' as const
      };
    });
  }, []);

  // Load project metadata from API
  const loadProjectMetadata = useCallback(async (projectId: string) => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/projects/${projectId}`);
      
      if (!response.ok) {
        throw new Error(`Failed to load project metadata: ${response.statusText}`);
      }

      const data = await response.json();
      setProjectMetadata(data);
      
      console.log('📊 Loaded project metadata:', {
        projectId,
        branches: data.branches?.length || 0,
        conversations: data.conversations?.length || 0
      });

    } catch (err) {
      console.error('Failed to load project metadata:', err);
      setError(err instanceof Error ? err.message : 'Failed to load metadata');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Revert to specific commit/branch
  const revertToCommit = useCallback(async (commitHash: string, branchName: string = 'main') => {
    if (!activeProject) return false;

    try {
      setIsLoading(true);
      setError(null);

      // Use existing git service to revert
      const serverId = 'localhost-mcp';
      const projectPath = getProjectPath(activeProject.id, activeProject.name);
      const result = await executeTool(serverId, 'BashCommand', {
        action_json: {
          command: `cd "${projectPath}" && git checkout ${commitHash}`,
          type: 'command'
        },
        thread_id: `revert_${Date.now()}`
      });

      if (result.includes('error') || result.includes('fatal')) {
        throw new Error('Failed to revert commit: ' + result);
      }

      // Update metadata to reflect revert
      if (metadata) {
        setMetadata({
          ...metadata,
          status: 'reverted',
          commitHash,
          branchName
        });
      }

      console.log('↩️ Successfully reverted to commit:', commitHash);
      
      // Reload project metadata
      await loadProjectMetadata(activeProject.id);
      
      return true;

    } catch (err) {
      console.error('Failed to revert commit:', err);
      setError(err instanceof Error ? err.message : 'Failed to revert');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [activeProject, executeTool, metadata, loadProjectMetadata]);

  // Auto-load project metadata when active project changes
  useEffect(() => {
    if (activeProject?.id) {
      loadProjectMetadata(activeProject.id);
    }
  }, [activeProject?.id, loadProjectMetadata]);

  // Auto-generate JSON files for projects that don't have them yet
  useEffect(() => {
    const generateInitialProjectData = async () => {
      if (!activeProject || !executeTool) return;

      try {
        // Try to load project metadata first
        const response = await fetch(`/api/projects/${activeProject.id}`);
        
        if (!response.ok) {
          console.log(`🔄 Generating initial project data for ${activeProject.id}...`);
          
          // Call server-side API to generate JSON files
          const generateResponse = await fetch(`/api/projects/${activeProject.id}/generate`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
          });
          
          if (generateResponse.ok) {
            const result = await generateResponse.json();
            console.log(`✅ Initial project data generated for ${activeProject.id}:`, {
              fileSize: result.fileSize,
              path: result.jsonFilePath
            });
            
            // Reload metadata after generation
            setTimeout(() => {
              loadProjectMetadata(activeProject.id);
            }, 1000);
          } else {
            console.warn('⚠️ Failed to generate initial project data via API');
          }
        }
      } catch (error) {
        console.warn('⚠️ Failed to generate initial project data:', error);
      }
    };

    if (activeProject?.id) {
      generateInitialProjectData();
    }
  }, [activeProject?.id, executeTool, loadProjectMetadata]);

  return {
    // Current conversation state
    conversationMetadata: metadata,
    projectMetadata,
    isLoading,
    error,

    // Actions
    startConversation,
    completeConversation,
    incrementMessageCount,
    updateBranchInfo,
    revertToCommit,
    loadProjectMetadata,

    // Computed values
    canRevert: Boolean(metadata?.commitHash),
    conversationDuration: metadata ? Date.now() - metadata.startTime : 0,
    availableBranches: projectMetadata?.branches || [],
    recentCommits: projectMetadata?.branches?.slice(0, 5).map(branch => ({
      commitHash: branch.commitHash,
      commitMessage: branch.commitMessage,
      timestamp: branch.timestamp,
      branchName: branch.branchName,
      filesChanged: branch.filesChanged
    })) || []
  };
} 