import React from 'react';
import { CopyButton } from '@/components/ui/copy';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Image from 'next/image';

const DEFAULT_MODEL = 'gpt-4o';

export type ImageMessageContent = {
  type: 'image_url';
  image_url: {
    url: string;
    detail?: 'auto' | 'low' | 'high';
  };
};

export type TextMessageContent = {
  type: 'text';
  text: string;
};

export type ToolCallFunctionContent = {
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
};

export type ToolContent = {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
} | {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
};

export type MessageContent = TextMessageContent | ImageMessageContent | ToolContent;

export type Message = {
  role: 'user' | 'assistant' | 'developer';
  content: MessageContent[] | string;
  timestamp: Date;
  toolInput?: Record<string, unknown>;
};

interface OpenAIConfig {
  apiKey: string;
  model?: string;
  systemPrompt?: string;
  baseUrl?: string;
  organizationId?: string;
}

interface StreamResponse {
  abort: () => void;
  finalMessage: () => Promise<{ content: MessageContent[] }>;
  on: (event: 'text', callback: (text: string) => void) => void;
}

export const createOpenAIClient = (config: OpenAIConfig) => {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.apiKey}`,
    ...(config.organizationId && { 'OpenAI-Organization': config.organizationId }),
  };

  const baseUrl = config.baseUrl || 'https://api.openai.com/v1';

  return {
    generateChatTitle: async (userMessage: MessageContent[], assistantMessage: MessageContent[]): Promise<string> => {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: config.model || DEFAULT_MODEL,
          max_tokens: 20,
          messages: [{
            role: "user",
            content: `Generate a concise, specific title (3-4 words max) that accurately captures the main topic or purpose of this conversation. Use key technical terms when relevant. Avoid generic words like 'conversation', 'chat', or 'help'.

User message: ${JSON.stringify(userMessage)}
Assistant response: ${Array.isArray(assistantMessage)
  ? assistantMessage.filter(c => 'text' in c).map(c => 'text' in c ? c.text : '').join(' ')
  : assistantMessage}

Format: Only output the title, no quotes or explanation
Example good titles:
- React Router Setup
- Python Script Optimization
- Database Schema Design
- ML Model Training
- Docker Container Networking`
          }]
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to generate title: ${response.statusText}`);
      }

      const data = await response.json();
      return data.choices[0].message.content
        .replace(/["']/g, '')
        .replace('title:', '')
        .replace('Title:', '')
        .replace('title', '')
        .replace('Title', '')
        .trim();
    },

    streamChat: async (
      messages: Array<{ role: string; content: string | MessageContent[] }>,
      tools: Array<{
        type: 'function';
        function: { name: string; description: string; parameters: Record<string, unknown> };
      }> = [],
      onText?: (text: string) => void
    ): Promise<StreamResponse> => {
      const abortController = new AbortController();
      const content: MessageContent[] = [];

      const systemMessage = config.systemPrompt?.trim() ? [{
        role: 'developer',
        content: config.systemPrompt
      }] : [];

      const streamPromise = new Promise<{ content: MessageContent[] }>(async (resolve, reject) => {
        try {
          const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              model: config.model || DEFAULT_MODEL,
              messages: [...systemMessage, ...messages],
              max_tokens: 8192,
              stream: true,
              ...(tools.length > 0 && {
                tools,
                tool_choice: 'auto'
              }),
              store: true
            }),
            signal: abortController.signal
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          if (!response.body) {
            throw new Error('Response body is null');
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = line.slice(6);
                  if (data === '[DONE]') continue;

                  const parsed = JSON.parse(data);
                  const delta = parsed.choices[0]?.delta;

                  if (delta?.content) {
                    if (onText) {
                      onText(delta.content);
                    }
                    
                    if (content.length === 0 || content[content.length - 1].type !== 'text') {
                      content.push({ type: 'text', text: delta.content });
                    } else {
                      const lastContent = content[content.length - 1];
                      if (lastContent.type === 'text') {
                        lastContent.text += delta.content;
                      }
                    }
                  }

                  if (delta?.tool_calls) {
                    const toolCall = delta.tool_calls[0];
                    content.push({
                      type: 'tool_use',
                      id: toolCall.id,
                      name: toolCall.function.name,
                      input: JSON.parse(toolCall.function.arguments)
                    });
                  }
                }
              }
            }

            resolve({ content });
          } catch (error) {
            reader.cancel();
            reject(error);
          }
        } catch (error) {
          reject(error);
        }
      });

      return {
        abort: () => {
          abortController.abort();
        },
        finalMessage: () => streamPromise,
        on: (event: 'text', callback: (text: string) => void) => {
          if (event === 'text') {
            onText = callback;
          }
        }
      };
    },

    processMessageContent: (content: MessageContent[]): MessageContent[] => {
      // Single empty text block handling
      if (content.length === 1 && 'text' in content[0] && !content[0].text.trim()) {
        return [{
          ...content[0],
          text: 'empty'
        }];
      }

      // Remove empty text blocks, keep non-text content
      return content.filter(block => {
        return !('text' in block) || block.text.trim().length > 0;
      });
    },

    isOverloadedError: (error: unknown): boolean => {
      if (typeof error === 'object' && error !== null) {
        const errorObj = error as { error?: { type?: string }; status?: number };
        return errorObj.status === 429 || errorObj.error?.type === 'insufficient_quota';
      }
      return false;
    },

    renderMessage: (message: Message, index: number, conversation: { messages: Message[] }, onToolCall: (toolCall: {name: string, input: Record<string, unknown>, result: string | null}) => void) => {
      if (Array.isArray(message.content)) {
        return message.content.map((content, contentIndex) => {
          if ('text' in content) {
            return (
              <div
                key={`text-${index}-${contentIndex}`}
                className={`flex max-w-full pt-6`}
              >
                <div className="relative group w-full max-w-full overflow-x-auto">
                  {!content.text.match(/```[\\s\\S]*```/) && (
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
          } else if ('image_url' in content) {
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
                    src={content.image_url.url}
                    alt="User uploaded image"
                    className="max-h-[150px] max-w-[300px] w-auto h-auto rounded object-contain"
                    width={300}
                    height={150}
                  />
                </div>
              </div>
            );
          } else if (content.type === 'tool_use') {
            const nextMessage = conversation.messages[index + 1];
            let toolResult = null;
            if (nextMessage && Array.isArray(nextMessage.content)) {
              const resultContent = nextMessage.content.find(c =>
                'type' in c && c.type === 'tool_result' && 'tool_use_id' in c && c.tool_use_id === content.id
              );
              if (resultContent && 'type' in resultContent && resultContent.type === 'tool_result') {
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