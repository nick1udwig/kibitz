import React from 'react';
import Image from 'next/image';
import { CopyButton } from '@/components/ui/copy';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Message, MessageContent } from './types';

interface MessageItemProps {
  message: Message;
  index: number;
  onToolClick: (name: string, input: Record<string, unknown>, result: string | null) => void;
}

export const MessageItem = React.memo(({ message, index, onToolClick }: MessageItemProps) => {
  if (Array.isArray(message.content)) {
    return (
      <div className="space-y-4">
        {message.content.map((content, contentIndex) => {
          if (content.type === 'text') {
            return (
              <div
                key={`text-${index}-${contentIndex}`}
                className={`flex max-w-full pt-6`}
              >
                <div className="relative group w-full max-w-full overflow-x-auto">
                  {!content.text.match(/```[\s\S]*```/) && (
                    <div className="absolute right-2 top-0 z-10">
                      <CopyButton
                        text={content.text.trim()}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      />
                    </div>
                  )}
                  <div
                    className={`w-full max-w-full rounded-lg px-4 py-2 ${message.role === 'user'
                      ? 'bg-accent !text-accent-foreground'
                      : 'bg-muted text-foreground'
                      }`}
                  >
                    <ReactMarkdown
                      className={`prose dark:prose-invert break-words max-w-full ${message.role === 'user' ? '[&_p]:!text-accent-foreground [&_code]:!text-accent-foreground' : ''}`}
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
                                  className="opacity-0 group-hover/code:opacity-100 transition-opacity"
                                />
                              </div>
                              <pre className="overflow-x-auto max-w-full whitespace-pre" {...props}>{children}</pre>
                            </div>
                          );
                        },
                        code({ inline, children, ...props }) {
                          return inline ? (
                            <code className="text-inherit whitespace-nowrap inline" {...props}>{children}</code>
                          ) : (
                            <code className="block overflow-x-auto whitespace-pre-wrap" {...props}>{children}</code>
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
          } else if (content.type === 'image') {
            return (
              <div
                key={`image-${index}-${contentIndex}`}
                className={`flex`}
              >
                <div
                  className={`w-full rounded-lg px-4 py-2 ${message.role === 'user'
                    ? 'bg-accent text-accent-foreground'
                    : 'bg-muted text-foreground'
                    }`}
                >
                  <Image
                    src={`data:${content.source.media_type};base64,${content.source.data}`}
                    alt="User uploaded image"
                    className="max-h-[150px] max-w-[300px] w-auto h-auto rounded object-contain"
                    width={300}
                    height={150}
                  />
                </div>
              </div>
            );
          } else if (content.type === 'document') {
            return (
              <div
                key={`document-${index}-${contentIndex}`}
                className={`flex`}
              >
                <div
                  className={`w-full rounded-lg px-4 py-2 ${message.role === 'user'
                    ? 'bg-accent text-accent-foreground'
                    : 'bg-muted text-foreground'
                    }`}
                >
                  <embed
                    src={`data:${content.source.media_type};base64,${content.source.data}`}
                    type={content.source.media_type}
                    width="100%"
                    height="600px"
                    className="rounded"
                  />
                </div>
              </div>
            );
          } else if (content.type === 'tool_use') {
            return (
              <div
                key={`tool_use-${index}-${contentIndex}`}
                className={`flex`}
              >
                <div
                  key={`message-${index}-content-${contentIndex}`}
                  className={`w-full rounded-lg px-4 py-2 relative group ${message.role === 'user'
                    ? 'bg-accent text-accent-foreground'
                    : 'bg-muted text-foreground'
                    }`}
                >
                  <button
                    onClick={() => onToolClick(content.name, content.input, null)}
                    className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline"
                  >
                    Use tool: {content.name}
                  </button>
                </div>
              </div>
            );
          }
          return null;
        })}
      </div>
    );
  }

  return (
    <div className={`flex`}>
      <div
        className={`w-full rounded-lg px-4 py-2 ${message.role === 'user'
          ? 'bg-accent text-accent-foreground'
          : 'bg-muted text-foreground'
          }`}
      >
        <ReactMarkdown
          className="prose dark:prose-invert break-words overflow-hidden whitespace-pre-wrap max-w-full"
          components={{
            a: ({ href, children }) => (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                {children}
              </a>
            )
          }}
          remarkPlugins={[remarkGfm]}
        >
          {message.content}
        </ReactMarkdown>
      </div>
    </div>
  );
});

MessageItem.displayName = 'MessageItem';