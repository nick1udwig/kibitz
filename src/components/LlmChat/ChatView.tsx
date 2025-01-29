import React, { useState, useRef, useImperativeHandle } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { useFocusControl } from './context/useFocusControl';
import { useStore } from '@/stores/rootStore';
import { Message, MessageContent } from './types';
import { ToolCallModal } from './ToolCallModal';
import { MessageContentRenderer } from './components/MessageContent';
import { FileContentList } from './components/FileContentList';
import { ChatInput } from './components/ChatInput';
import { ScrollToBottomButton } from './components/ScrollToBottomButton';
import { useMessageSender } from './hooks/useMessageSender';
import { useScrollControl } from './hooks/useScrollControl';

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
  } = useStore();

  const activeProject = projects.find(p => p.id === activeProjectId);
  const activeConversation = activeProject?.conversations.find(
    c => c.id === activeConversationId
  );

  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Use custom hooks
  useFocusControl();
  const { isLoading, error, handleSendMessage } = useMessageSender();
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
          message.content[contentIndex + 1] &&
          typeof message.content[contentIndex + 1] === 'object' &&
          'type' in message.content[contentIndex + 1] &&
          message.content[contentIndex + 1].type === 'tool_result'
            ? (message.content[contentIndex + 1] as { content: string })['content']
            : null
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
    await handleSendMessage(inputMessage, currentFileContent);
    setInputMessage('');
    setCurrentFileContent([]);
  };

  return (
    <div className="flex flex-col h-full relative">
      <div ref={chatContainerRef} className="h-[calc(100vh-4rem)] overflow-y-auto p-4">
        <div className="space-y-4 mb-4">
          {activeConversation.messages.map((message, index) => (
            renderMessageContent(message, index)
          ))}
        </div>
      </div>

      <ScrollToBottomButton
        onClick={scrollToBottom}
        visible={!isAtBottom}
      />

      {error && (
        <div className="px-4 py-2 text-sm text-red-500">
          {error}
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
