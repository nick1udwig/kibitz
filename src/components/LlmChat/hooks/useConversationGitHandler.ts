import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '../../../stores/rootStore';

/**
 * Hook for handling git operations at the end of conversations
 * Triggers git operations after a natural pause in the conversation
 * 🚀 ENHANCED: Now also captures and stores conversation metadata
 */
export const useConversationGitHandler = () => {
  const { activeProjectId, activeConversationId, projects, executeTool } = useStore();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastConversationActivity = useRef<number>(Date.now());
  
  const activeProject = projects.find(p => p.id === activeProjectId);
  const activeConversation = activeProject?.conversations.find(c => c.id === activeConversationId);

  /**
   * Captures conversation metadata and stores it in JSON files for API
   */
  const captureConversationMetadata = useCallback(async () => {
    if (!activeProject || !activeConversationId || !activeConversation) {
      console.log('🔧 ConversationMetadata: Missing required data, skipping');
      return;
    }

    try {
      console.log('📋 ConversationMetadata: DISABLED - JSON generation moved to delayed system');
      console.log('📋 JSON files will be generated 1 minute after assistant finishes responding');

      // 🚀 DISABLED: Moved to delayed system to prevent competition
      // const { extractAndSaveProjectData } = await import('../../../lib/projectDataExtractor');
      // await extractAndSaveProjectData(activeProject.id, activeProject.name, 'localhost-mcp', executeTool);

    } catch (error) {
      console.warn('⚠️ ConversationMetadata: Failed to capture metadata:', error);
    }
  }, [activeProject, activeConversationId, activeConversation, executeTool]);

  const triggerGitOperations = useCallback(async () => {
    if (!activeProject || !activeConversationId) {
      console.log('🔧 ConversationGitHandler: No active project or conversation, skipping');
      return;
    }

    try {
      console.log('🔄 ConversationGitHandler: Triggering end-of-conversation git operations...');
      const { triggerEndOfLlmCycleGit } = await import('../../../lib/llmAgentGitHandler');
      
      const gitResult = await triggerEndOfLlmCycleGit(
        activeProject.id,
        activeProject.name,
        activeProject.settings.mcpServerIds?.[0] || 'localhost-mcp',
        executeTool,
        {
          autoCommit: true,
          commitMessage: 'Initial commit',
          forceInit: false
        }
      );
      
      console.log('✅ ConversationGitHandler: Git operations result:', gitResult);
      if (gitResult.success) {
        if (gitResult.gitInitialized) {
          console.log('✅ Git repository initialized successfully');
        }
        if (gitResult.changesCommitted) {
          console.log(`✅ Changes committed successfully with SHA: ${gitResult.commitSha}`);
        }

        // 🚀 NEW: After successful git operations, capture conversation metadata
        await captureConversationMetadata();
      } else {
        console.warn('⚠️ ConversationGitHandler: Git operations failed:', gitResult.error);
      }
    } catch (gitError) {
      console.warn('⚠️ ConversationGitHandler: Failed to trigger git operations:', gitError);
    }
  }, [activeProject, activeConversationId, executeTool, captureConversationMetadata]);

  const scheduleGitOperations = useCallback((immediate = false) => {
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Update last activity time
    lastConversationActivity.current = Date.now();

    // Use immediate mode for new projects or normal delay for conversations
    const delay = immediate ? 2000 : 30000; // 2 seconds for immediate, 30 seconds for normal

    // Schedule git operations
    timeoutRef.current = setTimeout(() => {
      if (immediate) {
        console.log('🚀 ConversationGitHandler: Immediate git operations triggered');
        triggerGitOperations();
      } else {
        const timeSinceLastActivity = Date.now() - lastConversationActivity.current;
        
        // Only trigger if there's been no activity for at least 30 seconds
        if (timeSinceLastActivity >= 30000) {
          console.log('🕐 ConversationGitHandler: 30 seconds of inactivity detected, triggering git operations');
          triggerGitOperations();
        } else {
          console.log('🕐 ConversationGitHandler: Recent activity detected, delaying git operations');
          // Reschedule for remaining time
          timeoutRef.current = setTimeout(triggerGitOperations, 30000 - timeSinceLastActivity);
        }
      }
    }, delay);

    console.log(`🕐 ConversationGitHandler: Scheduled git operations for ${delay/1000} seconds from now${immediate ? ' (immediate mode)' : ''}`);
  }, [triggerGitOperations]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Add a function to trigger git operations immediately for new projects
  const triggerImmediateGitOperations = useCallback(() => {
    scheduleGitOperations(true);
  }, [scheduleGitOperations]);

  // 🚀 NEW: Manual conversation completion (for testing/debugging)
  const completeConversation = useCallback(async () => {
    console.log('🎯 ConversationGitHandler: Manual conversation completion triggered');
    await triggerGitOperations();
  }, [triggerGitOperations]);

  return {
    scheduleGitOperations,
    triggerGitOperations,
    triggerImmediateGitOperations,
    completeConversation, // New function for manual completion
    captureConversationMetadata // Expose for direct usage if needed
  };
}; 