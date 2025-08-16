import React from 'react';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CopyButton } from '@/components/ui/copy';
import { MessageContent as MessageContentType, Message } from '../types';
import { RevertButton } from './RevertButton';

interface MessageContentProps {
  content: MessageContentType;
  isUserMessage: boolean;
  onToolClick?: (name: string, input: Record<string, unknown>, result: string | null) => void;
  toolResult: string | null;
  contentIndex: number;
  messageIndex: number;
  message?: Message; // Full message object for revert functionality
  onRevert?: (commitHash: string) => Promise<void>; // Callback for revert action
}

export const MessageContentRenderer: React.FC<MessageContentProps> = ({
  content,
  isUserMessage,
  onToolClick,
  toolResult,
  contentIndex,
  messageIndex,
  message,
  onRevert
}) => {
  // Early return if content is null or undefined
  if (!content || !content.type) {
    console.warn('MessageContentRenderer: content is null or missing type', { content, messageIndex, contentIndex });
    return null;
  }

  if (content.type === 'text') {
    return (
      <div
        key={`text-${messageIndex}-${contentIndex}`}
        className="flex max-w-full pt-6"
      >
        <div className="relative group w-full max-w-full overflow-x-auto">
          {!content.text.match(/```[\s\S]*```/) && (
            <div className="absolute right-2 top-0 z-10 flex gap-1">
              {/* Revert button - only show for user messages with commit hash */}
              {isUserMessage && message?.commitHash && message?.canRevert && onRevert && (
                <RevertButton
                  commitHash={message.commitHash}
                  messageTimestamp={message.timestamp}
                  onRevert={onRevert}
                />
              )}
              {/* Debug: Show why revert button might not be showing */}
              {isUserMessage && (!message?.commitHash || !message?.canRevert) && (
                <div 
                  title={`Debug: commitHash=${!!message?.commitHash}, canRevert=${!!message?.canRevert}, onRevert=${!!onRevert}`}
                  className="opacity-0 group-hover:opacity-50 text-xs text-gray-400"
                >
                  {!message?.commitHash && '🚫 No commit'}
                  {message?.commitHash && !message?.canRevert && '🚫 Can\'t revert'}
                </div>
              )}
              <CopyButton
                text={content.text.trim()}
                light={isUserMessage}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
              />
            </div>
          )}
          <div
            className={`w-full max-w-full rounded-lg px-4 py-2 ${
              isUserMessage
                ? 'bg-accent !text-accent-foreground'
                : 'bg-muted text-foreground'
            }`}
          >
            <ReactMarkdown
              className={`prose dark:prose-invert break-words max-w-full inline-code-fix ${
                isUserMessage ? '[&_p]:!text-accent-foreground [&_code]:!text-accent-foreground' : ''
              }`}
              components={{
                p: ({ children }) => (
                  <p className="break-words whitespace-pre-wrap overflow-hidden">
                    {children}
                  </p>
                ),
                pre({ children, ...props }) {
                  const getCodeText = (node: unknown): string => {
                    if (typeof node === 'string') return node;
                    if (!node) return '';
                    if (Array.isArray(node)) {
                      return node.map(getCodeText).join('\n');
                    }
                    if (typeof node === 'object' && node !== null && 'props' in node) {
                      const element = node as { props?: { className?: string; children?: unknown } };
                      if (element.props?.className?.includes('language-')) {
                        return getCodeText(element.props.children);
                      }
                      if (element.props?.children) {
                        return getCodeText(element.props.children);
                      }
                    }
                    return '';
                  };

                  const text = getCodeText(children).trim();

                  return (
                    <div className="group/code relative max-w-full">
                      <div className="absolute top-2 right-2 z-10">
                        <CopyButton
                          text={text}
                          light={isUserMessage}
                          className="opacity-0 group-hover/code:opacity-100 transition-opacity"
                        />
                      </div>
                      <pre className="overflow-x-auto max-w-full whitespace-pre" {...props}>
                        {children}
                      </pre>
                    </div>
                  );
                },
                code(props: { className?: string } & React.HTMLProps<HTMLElement>) {
                  const { className, children } = props;
                  const isInline = className?.includes('language-') === false;
                  return isInline ? (
                    <code className="text-inherit inline-block align-baseline">
                      {children}
                    </code>
                  ) : (
                    <code className="block overflow-x-auto whitespace-pre-wrap">
                      {children}
                    </code>
                  );
                },
                a: ({ href, children }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    {children}
                  </a>
                ),
              }}
              remarkPlugins={[remarkGfm]}
            >
              {content.text}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    );
  }

  if (content.type === 'image') {
    return (
      <div
        key={`image-${messageIndex}-${contentIndex}`}
        className="flex"
      >
        <div
          className={`w-full rounded-lg px-4 py-2 ${
            isUserMessage
              ? 'bg-accent text-accent-foreground'
              : 'bg-muted text-foreground'
          }`}
        >
          <Image
            src={`data:${(content as Extract<MessageContentType, { type: 'image' }>).source.media_type};base64,${(content as Extract<MessageContentType, { type: 'image' }>).source.data}`}
            alt="User uploaded image"
            className="max-h-[150px] max-w-[300px] w-auto h-auto rounded object-contain"
            width={300}
            height={150}
          />
        </div>
      </div>
    );
  }

  if (content.type === 'document') {
    return (
      <div
        key={`document-${messageIndex}-${contentIndex}`}
        className="flex"
      >
        <div
          className={`w-full rounded-lg px-4 py-2 ${
            isUserMessage
              ? 'bg-accent text-accent-foreground'
              : 'bg-muted text-foreground'
          }`}
        >
          <embed
            src={`data:${(content as Extract<MessageContentType, { type: 'document' }>).source.media_type};base64,${(content as Extract<MessageContentType, { type: 'document' }>).source.data}`}
            type={(content as Extract<MessageContentType, { type: 'document' }>).source.media_type}
            width="100%"
            height="600px"
            className="rounded"
          />
        </div>
      </div>
    );
  }

  if (content.type === 'tool_use') {
    return (
      <div
        key={`tool_use-${messageIndex}-${contentIndex}`}
        className="flex"
      >
        <div
          className={`w-full rounded-lg px-4 py-2 relative group ${
            isUserMessage
              ? 'bg-accent text-accent-foreground'
              : 'bg-muted text-foreground'
          }`}
        >
          <div className="space-y-2">
            {(() => {
              const toolUse = content as Extract<MessageContentType, { type: 'tool_use' }>; 
              return (
                <button
                  onClick={() => onToolClick?.(toolUse.name, toolUse.input, toolResult)}
                  className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline group"
                >
                  🛠️: {toolUse.name}
                </button>
              );
            })()}
          </div>
        </div>
      </div>
    );
  }

  return null;
};
