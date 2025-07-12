import { useCallback, useEffect, useRef } from 'react';
import { useAutoCommitStore } from '../../../stores/autoCommitStore';
import { useStore } from '../../../stores/rootStore';
import { CommitInfo } from '../components/CommitDisplay';

export const useCommitTracking = () => {
  const { 
    lastCommitHash, 
    lastCommitTimestamp, 
    lastPushTimestamp, 
    config 
  } = useAutoCommitStore();
  
  const {
    projects,
    activeProjectId,
    activeConversationId,
    updateProjectSettings
  } = useStore();

  // Add refs to track processed commits and prevent duplicates
  const processedCommits = useRef(new Set<string>());
  const lastProcessedCommit = useRef<string | null>(null);

  const activeProject = projects.find(p => p.id === activeProjectId);
  const activeConversation = activeProject?.conversations.find(c => c.id === activeConversationId);

  // Add commit to conversation
  const addCommitToConversation = useCallback((commitInfo: CommitInfo) => {
    if (!activeProject || !activeConversationId) return;

    const updatedConversations = activeProject.conversations.map(conv => {
      if (conv.id === activeConversationId) {
        const commits = (conv as any).commits || [];
        return {
          ...conv,
          commits: [commitInfo, ...commits].slice(0, 10) // Keep last 10 commits
        };
      }
      return conv;
    });

    updateProjectSettings(activeProject.id, {
      conversations: updatedConversations
    });
  }, [activeProject, activeConversationId, updateProjectSettings]);

  // Get commits for current conversation
  const getConversationCommits = useCallback((): CommitInfo[] => {
    if (!activeConversation) return [];
    return (activeConversation as any).commits || [];
  }, [activeConversation]);

  // Trigger automatic branch detection and UI refresh
  const triggerBranchRefresh = useCallback(() => {
    console.log('🌿 Triggering automatic branch refresh after new commit');
    // Dispatch a custom event that CheckpointList can listen to
    window.dispatchEvent(new CustomEvent('newBranchDetected', {
      detail: {
        projectId: activeProject?.id,
        commitHash: lastCommitHash,
        timestamp: Date.now()
      }
    }));
  }, [activeProject?.id, lastCommitHash]);

  // Track new commits with duplicate prevention
  useEffect(() => {
    if (!lastCommitHash || !lastCommitTimestamp || !activeProject?.id) {
      return;
    }

    // Skip if we've already processed this commit
    if (processedCommits.current.has(lastCommitHash)) {
      return;
    }

    // Skip if this is the same as the last processed commit
    if (lastProcessedCommit.current === lastCommitHash) {
      return;
    }

    console.log('🎯 New commit detected in useCommitTracking:', {
      hash: lastCommitHash,
      timestamp: lastCommitTimestamp,
      projectId: activeProject.id
    });
    
    // Mark this commit as processed
    processedCommits.current.add(lastCommitHash);
    lastProcessedCommit.current = lastCommitHash;
    
    // Get the latest commit hash from the store
    const commitInfo: CommitInfo = {
      hash: lastCommitHash,
      message: `Auto-commit from ${new Date(lastCommitTimestamp).toLocaleTimeString()}`,
      timestamp: new Date(lastCommitTimestamp),
      projectId: activeProject.id,
      projectPath: '', // Will be filled by the auto-commit system
      trigger: 'tool_execution', // Default, can be enhanced
      pushed: !!lastPushTimestamp && lastPushTimestamp >= lastCommitTimestamp
    };

    // Check if this commit is already in the conversation
    const existingCommits = getConversationCommits();
    const hasCommit = existingCommits.some(c => c.hash === lastCommitHash);
    
    if (!hasCommit) {
      console.log('💾 Adding new commit to conversation:', commitInfo);
      addCommitToConversation(commitInfo);
    } else {
      console.log('ℹ️ Commit already exists in conversation, skipping');
    }

    // Trigger automatic branch refresh
    triggerBranchRefresh();
  }, [lastCommitHash, lastCommitTimestamp, lastPushTimestamp, activeProject?.id, addCommitToConversation, getConversationCommits, triggerBranchRefresh]);

  // Associate commit hash with the most recent user message
  const associateCommitWithLastUserMessage = useCallback(() => {
    if (!activeProject || !activeConversationId || !lastCommitHash) {
      console.log('❌ Cannot associate commit - missing data:', { 
        activeProject: !!activeProject, 
        activeConversationId, 
        lastCommitHash 
      });
      return;
    }

    // Skip if we've already processed this commit for association
    if (processedCommits.current.has(`assoc_${lastCommitHash}`)) {
      console.log('ℹ️ Commit already associated, skipping');
      return;
    }

    const conversation = activeProject.conversations.find(c => c.id === activeConversationId);
    if (!conversation) {
      console.log('❌ Conversation not found:', activeConversationId);
      return;
    }

    console.log('🔍 Looking for user message to associate with commit:', lastCommitHash);

    // Find the most recent user message that doesn't have a commit hash yet
    const messages = [...conversation.messages];
    let associatedMessage = false;
    
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      
      if (message.role === 'user' && !message.commitHash) {
        console.log('✅ Found user message to associate commit with:', {
          messageIndex: i,
          commitHash: lastCommitHash
        });
        
        // Associate this commit with this user message
        messages[i] = {
          ...message,
          commitHash: lastCommitHash,
          canRevert: true
        };

        // Update the conversation with the modified messages
        const updatedConversations = activeProject.conversations.map(conv => 
          conv.id === activeConversationId 
            ? { ...conv, messages }
            : conv
        );

        updateProjectSettings(activeProject.id, {
          conversations: updatedConversations
        });
        
        associatedMessage = true;
        
        // Mark this commit as associated
        processedCommits.current.add(`assoc_${lastCommitHash}`);
        console.log('🔗 Successfully associated commit with user message');
        break;
      }
    }
    
    if (!associatedMessage) {
      console.log('⚠️ No suitable user message found for commit association');
    }
  }, [activeProject, activeConversationId, lastCommitHash, updateProjectSettings]);

  // Auto-associate commits with messages when new commits are created
  useEffect(() => {
    if (!lastCommitHash || !lastCommitTimestamp) {
      return;
    }

    // Skip if already processed for association
    if (processedCommits.current.has(`assoc_${lastCommitHash}`)) {
      return;
    }

    console.log('🔗 New commit detected, associating with last user message:', lastCommitHash);
    
    // Small delay to ensure message has been added to conversation
    const timeoutId = setTimeout(() => {
      associateCommitWithLastUserMessage();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [lastCommitHash, lastCommitTimestamp, associateCommitWithLastUserMessage]);

  // Manual trigger for testing
  const manuallyAssociateLastCommit = useCallback(() => {
    if (lastCommitHash) {
      console.log('🔧 Manual trigger: Associating last commit with message:', lastCommitHash);
      // Remove from processed to allow re-association
      processedCommits.current.delete(`assoc_${lastCommitHash}`);
      associateCommitWithLastUserMessage();
    } else {
      console.log('❌ Manual trigger: No commit hash available');
    }
  }, [lastCommitHash, associateCommitWithLastUserMessage]);

  return {
    addCommitToConversation,
    getConversationCommits,
    hasAutoCommit: config.enabled,
    associateCommitWithLastUserMessage,
    manuallyAssociateLastCommit, // For testing
    lastCommitHash // For debugging
  };
}; 