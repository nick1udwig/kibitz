/**
 * Hook for tracking conversation metadata and branch state
 * Integrates with existing git operations and provides UI state management
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useStore } from '@/stores/rootStore';
import { useBranchStore } from '@/stores/branchStore';
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
  const loadProjectMetadataRef = useRef<((projectId: string) => Promise<void>) | null>(null);

  // Get active project from store
  const activeProject = activeProjectId ? projects.find(p => p.id === activeProjectId) : null;

  // Centralized branch state from branch store (single source of truth)
  const { currentBranch, refreshCurrentBranch } = useBranchStore();
  const activeBranchFromStore = activeProject?.id ? (currentBranch[activeProject.id] || 'main') : 'main';

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
      // Use centralized store value to avoid divergent branch state
      branchName: activeBranchFromStore,
      startTime: Date.now(),
      messageCount: 0,
      status: 'active'
    };

    setMetadata(newMetadata);
    console.log('🔄 Started conversation tracking:', conversationId);
    
    // Kick an initial current-branch refresh to ensure store is up-to-date
    if (activeProject?.id) {
      void refreshCurrentBranch(activeProject.id);
    }

    return conversationId;
  }, [activeProject, generateConversationId, activeBranchFromStore, refreshCurrentBranch]);

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

      // Gracefully handle projects that don't have metadata yet
      if (response.status === 404) {
        setProjectMetadata(null);
        // Do not surface a scary error for a normal empty state
        return;
      }

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

  // Expose the stable reference so callers outside the hook body (like UI callbacks) can invoke it
  loadProjectMetadataRef.current = loadProjectMetadata;

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
  }, [activeProject, loadProjectMetadata]);

  // Keep conversation branchName in sync with centralized branch store
  useEffect(() => {
    if (!activeProject?.id) return;
    setMetadata(prev => prev ? { ...prev, branchName: activeBranchFromStore } : prev);
  }, [activeBranchFromStore, activeProject?.id]);

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
  }, [activeProject, executeTool, loadProjectMetadata]);

  // 🚀 UI REFRESH FIX: Listen for branch switch and project-data-ready events and refresh metadata
  useEffect(() => {
    const onBranchSwitched = async (evt: Event) => {
      const event = evt as CustomEvent;
      const { projectId: eventProjectId, branchName } = event.detail || {};
      if (eventProjectId === activeProject?.id) {
        console.log(`🔄 useConversationMetadata: Branch switched to ${branchName}, refreshing metadata...`);
        try {
          // Ensure branch store has the latest value
          await refreshCurrentBranch(eventProjectId);
          // Sync local metadata branch immediately for UI consistency
          setMetadata(prev => prev ? { ...prev, branchName: branchName || activeBranchFromStore } : prev);
          setMetadata(null);
          await loadProjectMetadata(eventProjectId);
          console.log(`✅ useConversationMetadata: Metadata refreshed after branch switch`);
        } catch (error) {
          console.warn('⚠️ useConversationMetadata: Failed to refresh metadata after branch switch:', error);
        }
      }
    };

    const onProjectDataReady = async (evt: Event) => {
      const event = evt as CustomEvent;
      const { projectId: eventProjectId } = event.detail || {};
      if (eventProjectId === activeProject?.id) {
        console.log('📥 useConversationMetadata: Project data ready, reloading metadata...');
        try {
          await loadProjectMetadata(eventProjectId);
        } catch (error) {
          console.warn('⚠️ useConversationMetadata: Failed to load metadata after project data generation:', error);
        }
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('branchSwitched', onBranchSwitched);
      window.addEventListener('projectDataReady', onProjectDataReady);
      return () => {
        window.removeEventListener('branchSwitched', onBranchSwitched);
        window.removeEventListener('projectDataReady', onProjectDataReady);
      };
    }
  }, [activeProject?.id, loadProjectMetadata, refreshCurrentBranch, activeBranchFromStore]);

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
    loadProjectMetadata: (projectId: string) => loadProjectMetadataRef.current ? loadProjectMetadataRef.current(projectId) : Promise.resolve(),

    // Computed values
    canRevert: Boolean(metadata?.commitHash),
    conversationDuration: metadata ? Date.now() - metadata.startTime : 0,
    availableBranches: projectMetadata?.branches || [],
    // Return ALL commits sorted by recency; UI components can slice or virtualize
    recentCommits: (projectMetadata?.branches
      ? [...projectMetadata.branches]
          .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
          .map(branch => ({
            commitHash: branch.commitHash,
            commitMessage: branch.commitMessage,
            timestamp: branch.timestamp,
            branchName: branch.branchName,
            filesChanged: branch.filesChanged
          }))
      : [])
  };
} 