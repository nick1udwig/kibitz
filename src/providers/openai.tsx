import React from 'react';
import OpenAI from "openai";
import { CopyButton } from '@/components/ui/copy';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Image from 'next/image';

const DEFAULT_MODEL = 'gpt-4-turbo';

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
  isProviderLocked?: boolean;
}

interface StreamResponse {
  abort: () => void;
  finalMessage: () => Promise<{ content: MessageContent[] }>;
  on: (event: 'text', callback: (text: string) => void) => void;
}

export const createOpenAIClient = (config: OpenAIConfig) => {
  const apiKey = config.apiKey?.trim();
  if (!apiKey) {
    throw new Error('OpenAI API key is required. Please add your API key in the Settings panel under Project Configuration.');
  }

  const client = new OpenAI({
    apiKey: config.apiKey,
    organization: config.organizationId,
    baseURL: config.baseUrl,
    dangerouslyAllowBrowser: true,
  });

  return {
    generateChatTitle: async (userMessage: MessageContent[], assistantMessage: MessageContent[]): Promise<string> => {
      const completion = await client.chat.completions.create({
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
        }],
        store: true,
      });

      return completion.choices[0].message.content
        ?.replace(/["']/g, '')
        .replace('title:', '')
        .replace('Title:', '')
        .replace('title', '')
        .replace('Title', '')
        .trim() || 'Untitled Chat';
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

      // Convert tools to OpenAI format
      const openaiTools = tools.map(tool => ({
        type: 'function' as const,
        function: {
          name: tool.function.name,
          description: tool.function.description,
          parameters: tool.function.parameters
        }
      } satisfies OpenAI.ChatCompletionTool));

      const streamPromise = new Promise<{ content: MessageContent[] }>(async (resolve, reject) => {
        try {
          const stream = await client.chat.completions.create({
            model: config.model || DEFAULT_MODEL,
            messages: [...systemMessage, ...messages] as Array<OpenAI.ChatCompletionMessageParam>,
            max_tokens: 8192,
            stream: true,
            tools: tools.length > 0 ? openaiTools : undefined,
            tool_choice: tools.length > 0 ? 'auto' : undefined,
            store: true,
          });

          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta;

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
              if (toolCall.id && toolCall.function?.name && toolCall.function?.arguments) {
                content.push({
                  type: 'tool_use',
                  id: toolCall.id,
                  name: toolCall.function.name,
                  input: JSON.parse(toolCall.function.arguments)
                });
              }
            }
          }

          resolve({ content });
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
      if (content.length === 1 && 'text' in content[0] && !content[0].text.trim()) {
        return [{
          ...content[0],
          text: 'empty'
        }];
      }

      return content.filter(block => {
        return !('text' in block) || block.text.trim().length > 0;
      });
    },

    isOverloadedError: (error: unknown): boolean => {
      if (error instanceof OpenAI.APIError) {
        return error.status === 429 || error.error?.type === 'insufficient_quota';
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
