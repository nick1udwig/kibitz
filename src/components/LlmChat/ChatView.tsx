import React, { useState, useRef, useImperativeHandle, useMemo, useEffect, useCallback } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { useFocusControl } from './context/useFocusControl';
import { useStore } from '@/stores/rootStore';
import { Message, MessageContent } from './types';
import { ToolCallModal } from './ToolCallModal';
import { MessageContentRenderer } from './components/MessageContent';
import { FileContentList } from './components/FileContentList';
import { ChatInput } from './components/ChatInput';
import { ScrollToBottomButton } from './components/ScrollToBottomButton';
import { ChatHeader } from './components/ChatHeader';
import { useMessageSender } from './hooks/useMessageSender';
import { useScrollControl } from './hooks/useScrollControl';
import { useErrorDisplay } from './hooks/useErrorDisplay';
import { usePagination } from './hooks/usePagination';
import { MessagesLoadingIndicator } from './components/MessagesLoadingIndicator';
import { useCommitTracking } from './hooks/useCommitTracking';
import { CommitDisplay } from './components/CommitDisplay';
import { FileChangeCounter } from './components/FileChangeCounter';
import GitSessionService from '../../lib/gitSessionService';
import { ensureProjectDirectory } from '../../lib/projectPathService';
import { autoInitializeGitForProject } from '../../lib/gitAutoInitService';
import { getProjectPath } from '../../lib/projectPathService';
import { useAutoCommit } from './hooks/useAutoCommit';
import { useConversationGitHandler } from './hooks/useConversationGitHandler';
import { ConversationMetadataPanel } from './components/ConversationMetadataPanel';
import { useConversationMetadata } from './hooks/useConversationMetadata';

// Default message window size if not configured
const DEFAULT_MESSAGE_WINDOW = 30;

export interface ChatViewRef {
  focus: () => void;
}

const ChatViewComponent = React.forwardRef<ChatViewRef>((props, ref) => {
  const [currentFileContent, setCurrentFileContent] = useState<MessageContent[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [selectedToolCall, setSelectedToolCall] = useState<{
    name: string;
    input: Record<string, unknown>;
    result: string | null;
  } | null>(null);
  const [projectPath, setProjectPath] = useState<string | null>(null);

  const {
    projects,
    activeProjectId,
    activeConversationId,
    updateProjectSettings,
    servers,
    executeTool
  } = useStore();

  const activeProject = projects.find(p => p.id === activeProjectId);
  const activeConversation = activeProject?.conversations.find(
    c => c.id === activeConversationId
  );

  // Determine the API key based on the provider
  const apiKey = activeProject?.settings.provider === 'openrouter'
    ? activeProject?.settings.openRouterApiKey
    : activeProject?.settings.provider === 'openai'
      ? activeProject?.settings.openaiApiKey
      : activeProject?.settings.anthropicApiKey || activeProject?.settings.apiKey;

  const provider = activeProject?.settings.provider;
  const model = activeProject?.settings.model;

  // Get all messages 
  const allMessages = useMemo(() => {
    if (!activeConversation?.messages) return [];
    return activeConversation.messages;
  }, [activeConversation?.messages]);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  
  // Create a shared ref for the scroll container
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Use custom hooks
  useFocusControl();
  const { isLoading, error: sendError, handleSendMessage, cancelCurrentCall, clearError: clearSendError } = useMessageSender();
  const { error, showError, clearError } = useErrorDisplay();
  const { getConversationCommits, hasAutoCommit, manuallyAssociateLastCommit, lastCommitHash } = useCommitTracking();
  const { scheduleGitOperations, triggerImmediateGitOperations } = useConversationGitHandler();
  
  // 🚨 CRITICAL FIX: Add auto-commit hook
  const { triggerAutoCommit } = useAutoCommit();
  
  // 🔄 NEW: Conversation metadata tracking
  const { 
    startConversation, 
    incrementMessageCount, 
    completeConversation,
    conversationMetadata 
  } = useConversationMetadata();

  // Listen for auto-commit events to associate commits with messages
  useEffect(() => {
    const handleAutoCommit = (event: CustomEvent) => {
      const { commitHash, projectId, trigger } = event.detail;
      console.log('🔗 ChatView: Auto-commit event received:', event.detail);
      
      // Only handle commits for the current project
      if (projectId === activeProjectId) {
        console.log('✅ ChatView: Auto-commit for current project, associating with last message');
                 try {
           // The commit tracking hook will automatically associate the commit
           // since it's already in the auto-commit store
           manuallyAssociateLastCommit();
           console.log('✅ ChatView: Commit associated with message for revert functionality');
         } catch (error) {
           console.warn('⚠️ ChatView: Failed to associate commit with message:', error);
         }
      }
    };

    window.addEventListener('autoCommitCreated', handleAutoCommit as EventListener);
    
    return () => {
      window.removeEventListener('autoCommitCreated', handleAutoCommit as EventListener);
    };
  }, [activeProjectId, manuallyAssociateLastCommit]);

  // Get project path for revert functionality - Optimized approach
  useEffect(() => {
    const initProjectPath = async () => {
      if (activeProject && servers.length > 0) {
        try {
          const activeMcpServers = servers.filter(server => 
            server.status === 'connected' && 
            activeProject.settings.mcpServerIds?.includes(server.id)
          );
          
          if (activeMcpServers.length > 0) {
            console.log('📂 initProjectPath: Starting optimized Git initialization...');
            
            // 🚀 OPTIMIZED: Use the simplified Git auto-initialization system
            const projectPath = getProjectPath(activeProject.id, activeProject.name);
            const gitResult = await autoInitializeGitForProject(
              activeProject.id,
              activeProject.name,
              projectPath,
              activeMcpServers[0].id,
              executeTool
            );
            
            if (gitResult.success) {
              console.log('✅ initProjectPath: Git initialization successful');
              setProjectPath(projectPath);
            } else {
              console.error('❌ initProjectPath: Git initialization failed:', gitResult.message);
              // Still set the project path for basic functionality
              const projectPath = getProjectPath(activeProject.id, activeProject.name);
              setProjectPath(projectPath);
            }
          }
        } catch (error) {
          console.error('❌ initProjectPath: Error during initialization:', error);
          // Fallback to basic path setting
          const projectPath = getProjectPath(activeProject.id, activeProject.name);
          setProjectPath(projectPath);
        }
      }
    };

    initProjectPath();
  }, [activeProject, servers]);

  // Handle revert to commit
  const handleRevert = useCallback(async (commitHash: string) => {
    if (!projectPath || !activeProject) {
      showError('Project not available for revert');
      return;
    }

    const activeMcpServers = servers.filter(server => 
      server.status === 'connected' && 
      activeProject.settings.mcpServerIds?.includes(server.id)
    );

    if (!activeMcpServers.length) {
      showError('No active MCP servers available');
      return;
    }

    try {
      const sessionService = new GitSessionService(
        projectPath,
        activeMcpServers[0].id,
        executeTool
      );

      const result = await sessionService.rollbackToCommit(commitHash, {
        stashChanges: true,
        createBackup: true
      });

      if (result.success) {
        showError(`Reverted to commit ${commitHash.substring(0, 7)} successfully!`);
      } else {
        showError(result.error || 'Revert failed');
      }
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Revert failed');
    }
  }, [projectPath, activeProject, servers, executeTool, showError]);
  
  // Pagination hook with direct container ref
  const {
    visibleMessages,
    hasMoreMessages,
    isLoadingMore,
    loadMoreMessages,
    anchorRef,
    displayCount
  } = usePagination({
    allMessages: allMessages,
    initialPageSize: 15, // Initially show 15 messages
    containerRef: scrollContainerRef // Pass the ref directly
  });

  // Legacy scroll control for auto-scrolling on new messages
  const { isAtBottom, scrollToBottom } = useScrollControl({
    messages: activeConversation?.messages || [],
    scrollContainerRef: scrollContainerRef
  });

  // Expose focus method to parent components
  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      },
    }),
    []
  );

  // After a new conversation is loaded, scroll to the bottom to see latest messages
  useEffect(() => {
    if (scrollContainerRef.current) {
      // Wait for the DOM to update with new messages
      setTimeout(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
        }
      }, 100);
    }
  }, [activeConversationId]);

  const getToolResult = (toolUseIndex: number, toolId: string) => {
    const nextMessage = activeConversation?.messages[toolUseIndex + 1];
    let toolResult = null;
    if (nextMessage && Array.isArray(nextMessage.content)) {
      const resultContent = nextMessage.content.find(c =>
        c.type === 'tool_result' && c.tool_use_id === toolId
      );
      if (resultContent && resultContent.type === 'tool_result') {
        toolResult = resultContent.content;
      }
    }
    return toolResult;
  }

  const renderMessageContent = (message: Message, index: number) => {
    // Early return if message is null/undefined
    if (!message || !message.content) {
      console.warn('ChatView: renderMessageContent received null/invalid message', { message, index });
      return null;
    }

    // Check if this user message should show revert button
    // Only show if there's a subsequent assistant message (LLM has responded)
    const shouldShowRevert = message.role === 'user' && 
                            !!message.commitHash && 
                            !!message.canRevert &&
                            visibleMessages.length > index + 1 && 
                            visibleMessages[index + 1]?.role === 'assistant';

    // Create message object with updated canRevert flag
    const messageWithRevertFlag: Message = {
      ...message,
      canRevert: shouldShowRevert
    };

    if (!Array.isArray(message.content)) {
      return (
        <MessageContentRenderer
          key={`string-${index}`}
          content={{
            type: 'text',
            text: message.content as string
          }}
          isUserMessage={message.role === 'user'}
          onToolClick={() => {}}
          toolResult={null}
          contentIndex={0}
          messageIndex={index}
          message={messageWithRevertFlag}
          onRevert={handleRevert}
        />
      );
    }

    return message.content.map((content, contentIndex) => {
      // Skip null/undefined content items
      if (!content) {
        console.warn('ChatView: Skipping null content item', { messageIndex: index, contentIndex });
        return null;
      }

      return (
        <MessageContentRenderer
          key={`${content.type || 'unknown'}-${index}-${contentIndex}`}
          content={content}
          isUserMessage={message.role === 'user'}
          onToolClick={(name: string, input: Record<string, unknown>, result: string | null) => {
            setSelectedToolCall({ name, input, result });
          }}
          toolResult={
            Array.isArray(message.content) &&
            typeof message.content[contentIndex] === 'object' &&
            message.content[contentIndex] &&
            'type' in message.content[contentIndex] &&
            message.content[contentIndex].type === 'tool_use' ?
              getToolResult(index, message.content[contentIndex].id) : null
          }
          contentIndex={contentIndex}
          messageIndex={index}
          message={messageWithRevertFlag}
          onRevert={handleRevert}
        />
      );
    }).filter(Boolean); // Remove any null entries
  };

  if (!activeConversation) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner />
      </div>
    );
  }

  const handleSubmit = async () => {
    try {
      // 🔄 Start conversation tracking if not already started
      const isNewConversation = !conversationMetadata;
      if (isNewConversation) {
        startConversation();
      }
      
      await handleSendMessage(inputMessage, currentFileContent);
      setInputMessage('');
      setCurrentFileContent([]);
      
      // 🔄 Increment message count
      incrementMessageCount();
      
      // Schedule git operations after conversation activity
      // Use immediate trigger for new conversations to generate JSON files quickly
      if (isNewConversation) {
        triggerImmediateGitOperations();
      } else {
        scheduleGitOperations();
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  // Add a manual load more button for cases where auto-load fails
  const handleManualLoadMore = () => {
    console.log("Manual load triggered");
    if (hasMoreMessages && !isLoadingMore) {
      loadMoreMessages();
    }
  };

  return (
    <div id="chat-view" className="flex flex-col h-full relative">
      {activeProjectId && <ChatHeader projectId={activeProjectId} />}
      
      {/* 🔄 HIDDEN: Conversation metadata panel - moved to dedicated Branches tab */}
      {/* <ConversationMetadataPanel /> */}
      
      {/* File Change Counter */}
      <div className="px-4 pt-2">
        <FileChangeCounter />
      </div>
      
      <div 
        ref={scrollContainerRef} 
        className="h-[calc(100vh-4rem)] overflow-y-auto p-4"
        onScroll={(e) => {
          // Additional debugging for scroll position
          const el = e.currentTarget;
          console.log(`Scroll: top=${el.scrollTop}, height=${el.scrollHeight}, client=${el.clientHeight}`);
        }}
      >
        {/* Loading indicator for older messages at the top */}
        <MessagesLoadingIndicator visible={isLoadingMore} />
        
        {/* Message count info with manual load button */}
        {hasMoreMessages && !isLoadingMore && (
          <div className="text-center my-2">
            <div className="text-xs text-muted-foreground">
              Showing {displayCount} of {allMessages.length} messages
            </div>
            <div className="flex justify-center mt-1">
              <button 
                onClick={handleManualLoadMore}
                className="text-xs text-blue-500 hover:text-blue-700 underline"
              >
                Load older messages
              </button>
            </div>
          </div>
        )}
        
        <div className="space-y-4 mb-4">
          {visibleMessages.map((message, index) => {
            // Set a ref for the first visible message (which is now one of the newest)
            const isFirstMessage = index === 0;
            return (
              <div 
                key={`message-wrapper-${index}`} 
                ref={isFirstMessage ? anchorRef : null}
              >
                {renderMessageContent(message, index)}
              </div>
            );
          })}
        </div>

        {/* 🔒 DISABLED: Commit messages suppressed from Chat UI as requested */}
        {/* Temporary debug section for testing commit association */}
        {hasAutoCommit && lastCommitHash && (
          <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="text-sm">
                <div className="font-medium">Debug: Last commit hash</div>
                <div className="text-gray-600 dark:text-gray-400 font-mono text-xs">{lastCommitHash}</div>
              </div>
              <button
                onClick={manuallyAssociateLastCommit}
                className="px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Associate with Last Message
              </button>
            </div>
          </div>
        )}
        
        {/* Display recent commits if auto-commit is enabled */}
        {false && hasAutoCommit && (
          <div className="mb-4">
            {getConversationCommits().slice(0, 3).map((commit, index) => (
              <div key={commit.hash} className="mb-2">
                <CommitDisplay 
                  commit={commit}
                  compact={index > 0} // First commit is full display, others are compact
                  onRevert={(hash) => {
                    console.log(`Revert to commit ${hash}`);
                    // TODO: Implement revert functionality
                  }}
                  onViewDetails={(hash) => {
                    console.log(`View details for commit ${hash}`);
                    // TODO: Implement details view
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <ScrollToBottomButton
        onClick={scrollToBottom}
        visible={!isAtBottom}
      />

      {(error || sendError) && (
        <div
          onClick={() => {
            clearError();
            clearSendError();
          }}
          className="fixed top-0 left-0 right-0 z-50 cursor-pointer md:top-4"
        >
          <div className="mx-auto md:max-w-md md:mx-4">
            <div className="bg-destructive/15 dark:bg-destructive/25 border-b border-destructive/20 text-destructive dark:text-destructive-foreground px-4 py-3 md:rounded-lg shadow-lg backdrop-blur-sm">
              <div className="flex items-center gap-3 max-w-full">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-normal break-words">
                    {error || sendError}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 p-2 bg-background fixed bottom-0 left-0 right-0 z-50 md:left-[280px] md:w-[calc(100%-280px)]">
        <FileContentList
          files={currentFileContent}
          onRemove={(index) => {
            setCurrentFileContent(prev => prev.filter((_, i) => i !== index));
          }}
        />

        <ChatInput
          value={inputMessage}
          onChange={setInputMessage}
          onSend={handleSubmit}
          isLoading={isLoading}
          onStop={cancelCurrentCall}
          isDisabled={!activeProjectId || !activeConversationId}
          onFileSelect={(content) => {
            setCurrentFileContent(prev => [...prev, { ...content }]);
          }}
          placeholder={
            !activeProject?.settings.apiKey?.trim() && !activeProject?.settings.anthropicApiKey?.trim() && 
            !activeProject?.settings.openaiApiKey?.trim() && !activeProject?.settings.openRouterApiKey?.trim()
              ? "⚠️ Set your API key in Settings to start chatting"
              : isLoading
                ? "Processing response..."
                : "Type your message"
          }
          // Pass necessary props for prompt enhancement
          provider={provider}
          apiKey={apiKey}
          model={model}
          showError={showError}
        />
      </div>

      {selectedToolCall && (
        <ToolCallModal
          toolCall={selectedToolCall}
          onClose={() => setSelectedToolCall(null)}
        />
      )}
    </div>
  );
});

// Display name for debugging purposes
ChatViewComponent.displayName = 'ChatView';

// Export a memo'd version for better performance
export const ChatView = React.memo(ChatViewComponent);