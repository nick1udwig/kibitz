import React from 'react';
import { Anthropic } from '@anthropic-ai/sdk';
import { Tool, TextBlockParam, CacheControlEphemeral } from '@anthropic-ai/sdk/resources/messages/messages';
import type { MessageCreateParams, MessageParam } from '@anthropic-ai/sdk/resources/messages/messages';
import Image from 'next/image';
import { CopyButton } from '@/components/ui/copy';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const DEFAULT_MODEL = 'claude-3-5-sonnet-20241022';

export type ImageMessageContent = {
  type: 'image';
  source: {
    type: 'base64';
    media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
    data: string;
  };
  fileName?: string;
  cache_control?: CacheControlEphemeral | null;
};

export type DocumentMessageContent = {
  type: 'document';
  source: {
    type: 'base64';
    media_type: 'application/pdf';
    data: string;
  };
  fileName?: string;
  cache_control?: CacheControlEphemeral | null;
};

export type MessageContent = {
  type: 'text';
  text: string;
  cache_control?: CacheControlEphemeral | null;
} | {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
  cache_control?: CacheControlEphemeral | null;
} | {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean,
  cache_control?: CacheControlEphemeral | null;
} | ImageMessageContent | DocumentMessageContent;

export type Message = {
  role: 'user' | 'assistant';
  content: MessageContent[] | string;
  timestamp: Date;
  toolInput?: Record<string, unknown>;
};

interface AnthropicConfig {
  apiKey: string;
  model?: string;
  systemPrompt?: string;
}

interface StreamResponse {
  // For cancellation
  abort: () => void;
  // For checking final message
  finalMessage: () => Promise<{ content: MessageContent[] }>;
  // For streaming text
  on: (event: 'text', callback: (text: string) => void) => void;
}

export const createAnthropicClient = (config: AnthropicConfig) => {
  const client = new Anthropic({
    apiKey: config.apiKey,
    dangerouslyAllowBrowser: true,
    maxRetries: 12,
  });

  return {
    generateChatTitle: async (userMessage: MessageContent[], assistantMessage: MessageContent[]): Promise<string> => {
      const summaryResponse = await client.messages.create({
        model: config.model || DEFAULT_MODEL,
        max_tokens: 20,
        messages: [{
          role: "user",
          content: `Generate a concise, specific title (3-4 words max) that accurately captures the main topic or purpose of this conversation. Use key technical terms when relevant. Avoid generic words like 'conversation', 'chat', or 'help'.

User message: ${JSON.stringify(userMessage)}
Assistant response: ${Array.isArray(assistantMessage)
  ? assistantMessage.filter(c => c.type === 'text').map(c => c.type === 'text' ? c.text : '').join(' ')
  : assistantMessage}

Format: Only output the title, no quotes or explanation
Example good titles:
- React Router Setup
- Python Script Optimization
- Database Schema Design
- ML Model Training
- Docker Container Networking`
        }]
      });

      const type = summaryResponse.content[0].type;
      if (type == 'text') {
        return summaryResponse.content[0].text
          .replace(/["']/g, '')
          .replace('title:', '')
          .replace('Title:', '')
          .replace('title', '')
          .replace('Title', '')
          .trim();
      }
      return '';
    },

    streamChat: async (
      messages: MessageParam[],
      tools: Tool[] = [],
      onText?: (text: string) => void
    ): Promise<StreamResponse> => {
      // Helper function to handle stream with retries
      const streamWithRetry = async (params: MessageCreateParams) => {
        let lastError: unknown;
        for (let attempt = 0; attempt < 12; attempt++) { // Try for 1 minute (12 * 5 seconds)
          try {
            const stream = await client.messages.stream(params);
            return stream;
          } catch (error) {
            lastError = error;
            // Check if error has overloaded_error type
            if (typeof error === 'object' && error !== null) {
              const errorObj = error as { error?: { type?: string }; status?: number };
              const isOverloaded = errorObj.error?.type === 'overloaded_error' || errorObj.status === 429;
              if (isOverloaded && attempt < 11) { // Don't wait on last attempt
                await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
                continue;
              }
            }
            throw error; // Throw non-overloaded errors immediately
          }
        }
        throw lastError; // Throw last error if all retries failed
      };

      // Only include system content if there is a non-empty system prompt
      const systemPrompt = config.systemPrompt?.trim();
      const systemPromptContent = systemPrompt ? [
        {
          type: "text",
          text: systemPrompt,
        },
      ] as TextBlockParam[] : undefined;

      const params: MessageCreateParams = {
        model: config.model || DEFAULT_MODEL,
        max_tokens: 8192,
        messages,
        ...(systemPromptContent && systemPromptContent.length > 0 && {
          system: systemPromptContent
        }),
        ...(tools.length > 0 && {
          tools
        })
      };

      const stream = await streamWithRetry(params);

      if (onText) {
        stream.on('text', onText);
      }

      return stream;
    },

    // Process message content to handle empty/whitespace blocks
    processMessageContent: (content: MessageContent[]): MessageContent[] => {
      // If it's a single text content that's empty, mark as 'empty'
      if (content.length === 1 && content[0].type === 'text' && !content[0].text.trim()) {
        return [{
          ...content[0],
          text: 'empty'
        }];
      }

      // Otherwise filter out empty text blocks and keep non-text content as is
      return content.filter(block => {
        if (block.type !== 'text') {
          return true;
        }
        return block.text.trim().length > 0;
      });
    },

    // Check if an error is a rate limit/overload error
    isOverloadedError: (error: unknown): boolean => {
      if (typeof error === 'object' && error !== null) {
        const errorObj = error as { error?: { type?: string }; status?: number };
        return errorObj.error?.type === 'overloaded_error' || errorObj.status === 429;
      }
      return false;
    },

    renderMessage: (message: Message, index: number, conversation: { messages: Message[] }, onToolCall: (toolCall: {name: string, input: Record<string, unknown>, result: string | null}) => void) => {
      if (Array.isArray(message.content)) {
        return message.content.map((content, contentIndex) => {
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
                          // Extract text from the code block
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
            const nextMessage = conversation.messages[index + 1];
            let toolResult = null;
            if (nextMessage && Array.isArray(nextMessage.content)) {
              const resultContent = nextMessage.content.find(c =>
                c.type === 'tool_result' && c.tool_use_id === content.id
              );
              if (resultContent && resultContent.type === 'tool_result') {
                toolResult = resultContent.content;
              }
            }

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
                    onClick={() => onToolCall({
                      name: content.name,
                      input: content.input,
                      result: toolResult
                    })}
                    className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline"
                  >
                    Use tool: {content.name}
                  </button>
                </div>
              </div>
            );
          }
          return null;
        });
      }

      return (
        <div
          key={`string-${index}`}
          className={`flex`}
        >
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
    }
  };
};
