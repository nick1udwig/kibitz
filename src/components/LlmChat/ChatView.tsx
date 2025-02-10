import React, { useState, useRef, useImperativeHandle, useMemo } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { useFocusControl } from './context/useFocusControl';
import { useStore } from '@/stores/rootStore';
import { Message, MessageContent } from './types';
import { ToolCallModal } from './ToolCallModal';
import { MessageContentRenderer } from './components/MessageContent';
import { FileContentList } from './components/FileContentList';
import { ChatInput } from './components/ChatInput';
import { ScrollToBottomButton } from './components/ScrollToBottomButton';
import { HistoryToggle } from './components/HistoryToggle';
import { useMessageSender } from './hooks/useMessageSender';
import { useScrollControl } from './hooks/useScrollControl';
import { useErrorDisplay } from './hooks/useErrorDisplay';

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

  const {
    projects,
    activeProjectId,
    activeConversationId,
    updateProjectSettings,
  } = useStore();

  const activeProject = projects.find(p => p.id === activeProjectId);
  const activeConversation = activeProject?.conversations.find(
    c => c.id === activeConversationId
  );

  const numMessages = activeConversation?.messages.length;
  const visibleMessages = useMemo(() => {
    if (!activeConversation?.messages) return [];

    if (activeProject?.settings.showAllMessages) {
      return activeConversation.messages;
    }

    const messageWindow = activeProject?.settings.messageWindowSize ?? DEFAULT_MESSAGE_WINDOW;
    const messages = activeConversation.messages.slice(numMessages ? numMessages - messageWindow : 0, numMessages);

    // Only add the hint if there are more messages than what we're showing
    if (numMessages && numMessages > messageWindow) {
      return [
        {
          role: 'assistant',
          content: [{
            type: 'text',
            text: `_Showing last ${messageWindow} messages. Enable "History" to see all ${numMessages} messages._`
          }],
          timestamp: new Date()
        } as Message,
        ...messages
      ];
    }

    return messages;
  }, [activeConversation?.messages, activeProject?.settings.showAllMessages, activeProject?.settings.messageWindowSize, numMessages]);

  //const [inputMessage, setInputMessage] = useState('');
  //const [isLoading, setIsLoading] = useState(false);
  //const [error, setError] = useState<string | null>(null);
  //const shouldCancelRef = useRef<boolean>(false);
  //const streamRef = useRef<{ abort: () => void } | null>(null);
  //const chatContainerRef = useRef<HTMLDivElement>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Use custom hooks
  useFocusControl();
  const { isLoading, error: sendError, handleSendMessage, cancelCurrentCall } = useMessageSender();
  const { error, showError, clearError } = useErrorDisplay();
  const { chatContainerRef, isAtBottom, scrollToBottom } = useScrollControl({
    messages: activeConversation?.messages || []
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
        />
      );
    }

    return message.content.map((content, contentIndex) => (
      <MessageContentRenderer
        key={`${content.type}-${index}-${contentIndex}`}
        content={content}
        isUserMessage={message.role === 'user'}
        onToolClick={(name: string, input: Record<string, unknown>, result: string | null) => {
          setSelectedToolCall({ name, input, result });
        }}
        toolResult={
          Array.isArray(message.content) &&
          typeof message.content[contentIndex] === 'object' &&
          'type' in message.content[contentIndex] &&
          message.content[contentIndex].type === 'tool_use' ?
            getToolResult(index, message.content[contentIndex].id) : null
        }
        contentIndex={contentIndex}
        messageIndex={index}
      />
    ));
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
      await handleSendMessage(inputMessage, currentFileContent);
      setInputMessage('');
      setCurrentFileContent([]);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  return (
    <div className="flex flex-col h-full relative">
      <div ref={chatContainerRef} className="h-[calc(100vh-4rem)] overflow-y-auto p-4">
        <div className="space-y-4 mb-4">
          {visibleMessages?.map((message, index) => (
            renderMessageContent(message, index)
          ))}
        </div>
      </div>

      <ScrollToBottomButton
        onClick={scrollToBottom}
        visible={!isAtBottom}
      />

      <HistoryToggle
        checked={activeProject?.settings.showAllMessages ?? false}
        onChange={(checked) => {
          if (activeProject) {
            updateProjectSettings(activeProject.id, {
              settings: {
                ...activeProject.settings,
                showAllMessages: checked
              }
            });
          }
        }}
      />

      {(error || sendError) && (
        <div
          onClick={clearError}
          className="fixed cursor-pointer top-4 left-1/2 transform -translate-x-1/2 z-50 w-auto min-w-[200px] max-w-[90vw]"
        >
          <div className="bg-destructive/10 dark:bg-destructive/20 text-destructive dark:text-destructive-foreground border-l-4 border-destructive p-4 rounded shadow-lg backdrop-blur-sm">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="break-words">
                <p className="text-sm font-mono">
                  {error || sendError}
                </p>
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
            !activeProject?.settings.apiKey?.trim()
              ? "⚠️ Set your API key in Settings to start chatting"
              : isLoading
                ? "Processing response..."
                : "Type your message"
          }
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
