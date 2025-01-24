import React, { useEffect, useState, useRef, useCallback, useImperativeHandle } from 'react';
import Image from 'next/image';
import { Anthropic } from '@anthropic-ai/sdk';
import { Tool, CacheControlEphemeral, TextBlockParam } from '@anthropic-ai/sdk/resources/messages/messages';
import { Send, Square, ChevronDown } from 'lucide-react';
import type { MessageCreateParams } from '@anthropic-ai/sdk/resources/messages/messages';
import { OpenAIWrapper } from '@/lib/openai';
import { isAnthropicProvider, MessageStream } from './types/provider';
import { FileUpload } from './FileUpload';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Message, MessageContent } from './types';
import { wakeLock } from '@/lib/wakeLock';
import { ToolCallModal } from './ToolCallModal';
import { VoiceRecorder } from './VoiceRecorder';
import { useFocusControl } from './context/useFocusControl';
import { useStore } from '@/stores/rootStore';
import { Spinner } from '@/components/ui/spinner';
import { throttle } from 'lodash';

const ANTHROPIC_DEFAULT_MODEL = 'claude-3-5-sonnet-20241022';
const OPENAI_DEFAULT_MODEL = 'gpt-4o';

export interface ChatViewRef {
  focus: () => void;
}

const ChatViewComponent = React.forwardRef<ChatViewRef>((props, ref) => {
  const [currentFileContent, setCurrentFileContent] = useState<MessageContent[]>([]);
  const [isAtBottom, setIsAtBottom] = useState(true);
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

  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shouldCancelRef = useRef<boolean>(false);
  const streamRef = useRef<MessageStream | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [selectedToolCall, setSelectedToolCall] = useState<{
    name: string;
    input: Record<string, unknown>;
    result: string | null;
  } | null>(null);

  // Use the focus control hook for managing conversation focus
  useFocusControl();

  // Expose the focus method to parent components
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

  // Focus input when opening a new chat or when a chat is selected
  useEffect(() => {
    if (inputRef.current && activeConversation) {
      inputRef.current.focus();
    }
  }, [activeConversation]);

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Scroll handling logic
  useEffect(() => {
    const makeHandleScroll = async () => {
      while (!chatContainerRef.current) {
        console.log(`no chatContainerRef`);
        await sleep(250);
      }
      console.log(`got chatContainerRef`);
      const container = chatContainerRef.current;

      // Only force scroll on initial load
      if (container.scrollTop === 0) {
        container.scrollTop = container.scrollHeight;
      }

      // Add scroll event listener
      const handleScroll = throttle(() => {
        const { scrollTop, scrollHeight, clientHeight } = container;
        const bottom = container.scrollHeight < container.clientHeight || Math.abs(scrollHeight - clientHeight - scrollTop) < 50;
        setIsAtBottom(bottom);
      }, 100);

      // Check initial scroll position
      handleScroll();

      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    };

    makeHandleScroll();
  }, []);

  // Handle message updates
  useEffect(() => {
    if (!chatContainerRef.current || !activeConversation?.messages.length) {
      return;
    }

    const lastMessage = activeConversation.messages[activeConversation.messages.length - 1];

    // Only scroll to bottom if already at bottom or if it's the first message
    const isInitialMessage = activeConversation.messages.length <= 1;
    if ((lastMessage.role === 'assistant' || lastMessage.role === 'user') && (isAtBottom || isInitialMessage)) {
      requestAnimationFrame(() => {
        const container = chatContainerRef.current;
        if (container) {
          container.scrollTop = container.scrollHeight;
        }
      });
    }
  }, [activeConversation?.messages, activeConversation?.lastUpdated, isAtBottom]);

  const scrollToBottom = useCallback(() => {
    const container = chatContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, []);

  const getUniqueTools = (should_cache: boolean) => {
    if (!activeProject?.settings.mcpServerIds?.length) {
      return [];
    }

    const toolMap = new Map<string, Tool>();

    servers
      .filter(server =>
        activeProject.settings.mcpServerIds.includes(server.id)
      )
      .flatMap(s => s.tools || [])
      .forEach((tool: Tool) => {
        if (!toolMap.has(tool.name)) {
          toolMap.set(tool.name, {
            name: tool.name,
            description: tool.description,
            input_schema: tool.input_schema
          });
        }
      });

    const tools = Array.from(toolMap.values());
    return !should_cache ? tools : tools.map((t, index, array) => index != array.length - 1 ? t : { ...t, cache_control: { type: 'ephemeral' } as CacheControlEphemeral });
  };

  const updateConversationMessages = (projectId: string, conversationId: string, newMessages: Message[]) => {
    const currentConversation = activeProject?.conversations.find(c => c.id === conversationId);
    if (!currentConversation) return;

    updateProjectSettings(projectId, {
      conversations: activeProject!.conversations.map(conv =>
        conv.id === conversationId
          ? {
            ...currentConversation,
            messages: newMessages,
            lastUpdated: new Date()
          }
          : conv
      )
    });
  };

  const handleSendMessage = async () => {
    shouldCancelRef.current = false;
    if ((!inputMessage.trim() && currentFileContent.length === 0) || !activeProject || !activeConversationId) return;

    setError(null);
    setIsLoading(true);

    const { provider } = activeProject.settings;
    const isAnthropicMode = isAnthropicProvider(provider);
    const currentApiKey = isAnthropicMode ?
      (activeProject.settings.anthropicApiKey || activeProject.settings.apiKey) :
      activeProject.settings.openaiApiKey;

    if (!currentApiKey?.trim()) {
      setError(`API key not found. Please set your ${isAnthropicMode ? 'Anthropic' : 'OpenAI'} API key in the Settings panel.`);
      setIsLoading(false);
      return;
    }

    if (inputRef.current) {
      inputRef.current.style.height = '2.5em';
    }

    await wakeLock.acquire();
    try {
      const userMessageContent: MessageContent[] = currentFileContent.map(c =>
        c.type === 'image' ? { ...c, fileName: undefined } : { ...c, fileName: undefined }
      );

      if (inputMessage.trim()) {
        userMessageContent.push({
          type: 'text' as const,
          text: inputMessage,
        });
      }

      const userMessage: Message = {
        role: 'user',
        content: userMessageContent,
        timestamp: new Date()
      };

      const currentMessages = [...(activeConversation?.messages || []), userMessage];
      updateConversationMessages(activeProject.id, activeConversationId, currentMessages);
      setInputMessage('');
      setCurrentFileContent([]);

      const client = isAnthropicMode ?
        new Anthropic({
          apiKey: activeProject.settings.anthropicApiKey || activeProject.settings.apiKey || '',
          dangerouslyAllowBrowser: true,
          maxRetries: 12,
        }) :
        new OpenAIWrapper({
          apiKey: activeProject.settings.openaiApiKey || '',
          baseUrl: activeProject.settings.openaiBaseUrl,
          organizationId: activeProject.settings.openaiOrgId
        });

      const savedToolResults = new Set<string>();

      const toolsCached = getUniqueTools(true);
      const tools = getUniqueTools(false);

      // Only include system content if there is a non-empty system prompt
      const systemPrompt = activeProject.settings.systemPrompt?.trim();
      const systemPromptContent = systemPrompt ? [
        {
          type: "text",
          text: systemPrompt,
        },
      ] as TextBlockParam[] : undefined;

      while (true) {
        const cachedApiMessages = currentMessages.filter((message, index, array) => {
          if (typeof message.content === 'string') return true;

          const messageContent = message.content as MessageContent[];
          const hasToolUse = messageContent.some(c => c.type === 'tool_use');
          if (!hasToolUse) return true;

          const nextMessage = array[index + 1];
          if (!nextMessage) return false;

          if (typeof nextMessage.content === 'string') return false;

          const nextMessageContent = nextMessage.content as MessageContent[];

          return messageContent.every(content => {
            if (content.type !== 'tool_use') return true;
            if (!('id' in content)) return true;
            const toolId = content.id;
            return nextMessageContent.some(
              nextContent =>
                nextContent.type === 'tool_result' &&
                'tool_use_id' in nextContent &&
                nextContent.tool_use_id === toolId
            );
          });
        })
        .map((m) => ({
          role: m.role,
          content: (typeof m.content === 'string' ?
            [{ type: 'text' as const, text: m.content }]
            : m.content) as MessageContent[],
          toolInput: m.toolInput,
          timestamp: new Date(),
        }));

        const newestToolResultId = currentMessages
          .filter((msg): msg is Message & { content: MessageContent[] } =>
            Array.isArray(msg.content)
          )
          .flatMap(msg => msg.content)
          .filter((content): content is MessageContent & { tool_use_id: string } =>
            'tool_use_id' in content && content.type === 'tool_result'
          )
          .map(content => content.tool_use_id)
          .pop();

        if (activeProject.settings.elideToolResults) {
          if ((cachedApiMessages[cachedApiMessages.length - 1].content as MessageContent[])[0].type === 'tool_result') {
            // Only Anthropic supports checking tool relevance currently
            const keepToolResponse = isAnthropicMode ? await (client as Anthropic).messages.create({
              model: ANTHROPIC_DEFAULT_MODEL,
              max_tokens: 8192,
                messages: [
                  ...cachedApiMessages.filter(msg => {
                    if (!Array.isArray(msg.content)) return false;
                    const toolResult = msg.content.find(c =>
                      c.type === 'tool_use' || c.type === 'tool_result'
                    );
                    return toolResult;
                  }).map(msg => {
                    // Convert all special roles to assistant for Anthropic
                    const role = msg.role === 'developer' || msg.role === 'system' || msg.role === 'function'
                      ? 'assistant'
                      : msg.role as 'user' | 'assistant';

                    return {
                      role,
                      content: !(msg.content as MessageContent[]).find(c => c.type === 'tool_result') ?
                        [
                          msg.content[0],
                          {
                            type: 'text' as const,
                            text: `${JSON.stringify(msg.content[1])}`,
                          },
                        ] :
                        [
                          {
                            type: 'text' as const,
                            text: `${JSON.stringify({ ...(msg.content as MessageContent[])[0], content: 'elided' })}`,
                          },
                        ]
                    };
                  }),
                {
                  role: 'user',
                  content: [{
                    type: 'text' as const,
                    text: 'Rate each `message`: will the `type: tool_result` be required by `assistant` to serve the next response? Reply ONLY with `<tool_use_id>: Yes` or `<tool_use_id>: No` for each tool_result. DO NOT reply with code, prose, or commentary of any kind.\nExample output:\ntoolu_014huykAonadokihkrboFfqn: Yes\ntoolu_01APhxfkQZ1nT7Ayt8Vtyuz8: Yes\ntoolu_01PcgSwHbHinNrn3kdFaD82w: No\ntoolu_018Qosa8PHAZjUa312TXRwou: Yes',
                    cache_control: { type: 'ephemeral' } as CacheControlEphemeral,
                  }]
                }
              ],
              system: [{
                type: 'text' as const,
                text: 'Rate each `message`: will the `type: tool_result` be required by `assistant` to serve the next response? Reply ONLY with `<tool_use_id>: Yes` or `<tool_use_id>: No` for each tool_result. DO NOT reply with code, prose, or commentary of any kind.\nExample output:\ntoolu_014huykAonadokihkrboFfqn: Yes\ntoolu_01APhxfkQZ1nT7Ayt8Vtyuz8: Yes\ntoolu_01PcgSwHbHinNrn3kdFaD82w: No\ntoolu_018Qosa8PHAZjUa312TXRwou: Yes',
                cache_control: { type: 'ephemeral' } as CacheControlEphemeral,
              }],
            }) : null;

            if (keepToolResponse?.content[0].type === 'text') {
              const lines = keepToolResponse.content[0].text.split('\n');

              for (const line of lines) {
                const [key, value] = line.split(': ');

                if (value.trim() === 'Yes') {
                  savedToolResults.add(key);
                } else if (value.trim() === 'No') {
                  savedToolResults.delete(key);
                }
              }
            }
          }
        }

        const apiMessagesToSend = !activeProject.settings.elideToolResults ? cachedApiMessages :
          cachedApiMessages
            .map(msg => {
              if (!Array.isArray(msg.content)) return msg;

              const toolResult = msg.content.find(c =>
                c.type === 'tool_result'
              );
              if (!toolResult) return msg;

              const toolUseId = (toolResult as { tool_use_id: string }).tool_use_id;
              return toolUseId === newestToolResultId || savedToolResults.has(toolUseId) ?
                msg :
                {
                  ...msg,
                  content: [{
                    ...msg.content[0],
                    content: 'elided',
                  }],
                };
            });

        const currentStreamMessage = {
          role: 'assistant' as const,
          content: [] as MessageContent[],
          timestamp: new Date(),
        };

        const textContent: MessageContent = {
          type: 'text',
          text: '',
        };
        currentStreamMessage.content.push(textContent);

        // Helper function to handle stream with retries for Anthropic
        const streamWithRetry = async (params: MessageCreateParams) => {
          let lastError: unknown;
          for (let attempt = 0; attempt < 12; attempt++) {
            try {
              const stream = await (client as Anthropic).messages.stream(params);
              return stream;
            } catch (error) {
              lastError = error;
              if (typeof error === 'object' && error !== null) {
                const errorObj = error as { error?: { type?: string }; status?: number };
                const isOverloaded = errorObj.error?.type === 'overloaded_error' || errorObj.status === 429;
                if (isOverloaded && attempt < 11) {
                  await new Promise(resolve => setTimeout(resolve, 5000));
                  continue;
                }
              }
              throw error;
            }
          }
          throw lastError;
        };

      const stream = isAnthropicMode ?
          await streamWithRetry({
            model: activeProject.settings.model || ANTHROPIC_DEFAULT_MODEL,
            max_tokens: 8192,
            messages: apiMessagesToSend.map(msg => ({
      role: (msg.role === 'developer' || msg.role === 'system' || msg.role === 'function')
                ? 'assistant' // Convert system/dev/function messages to assistant for Claude
                : (msg.role as 'user' | 'assistant'),
              content: msg.content
            })),
            ...(systemPromptContent && systemPromptContent.length > 0 && {
              system: systemPromptContent
            }),
            ...(tools.length > 0 && {
              tools: toolsCached
            })
          }) :
          await (client as OpenAIWrapper).streamMessages({
            model: activeProject.settings.model || OPENAI_DEFAULT_MODEL,
            messages: apiMessagesToSend,
            tools: tools,
            systemPrompt: systemPromptContent?.[0]?.text
          });

        streamRef.current = stream as unknown as MessageStream;

        if (shouldCancelRef.current) {
          break;
        }

        if ('on' in stream) {
          // Anthropic stream
          stream.on('text', (text) => {
            if (!shouldCancelRef.current) {
              textContent.text += text;

              // Update conversation with streaming message
              const updatedMessages = [...currentMessages, currentStreamMessage];
              updateConversationMessages(activeProject.id, activeConversationId, updatedMessages);
            }
          });
        } else {
          // OpenAI stream
          for await (const text of stream.content()) {
            textContent.text += text;

            // Update conversation with streaming message
            const updatedMessages = [...currentMessages, currentStreamMessage];
            updateConversationMessages(activeProject.id, activeConversationId, updatedMessages);
          }
        }

        // Handle tool use in the final response if any
        // Filter and validate text content in the final response
        const finalResponse = await stream.finalMessage();

        // Process content to handle empty text blocks
        const processedContent = finalResponse.content.map((content: MessageContent) => {
          if (!content['type']) {
            return content;
          }
          if (content.type !== 'text') {
            return content;
          }

          const isWhitespace = content.text.trim().length === 0;

          if (isWhitespace && finalResponse.content.length === 1) {
            return {
              ...content,
              text: 'empty',
            } as MessageContent;
          }
          return content;
        })
          .filter((content: MessageContent) => {
            if (!content['type']) {
              return true;
            }
            if (content.type !== 'text') {
              return true;
            }

            const isWhitespace = content.text.trim().length === 0;

            if (isWhitespace && finalResponse.content.length === 1) {
              console.log(`got unexpected whitespace case from assistant: ${JSON.stringify(finalResponse)}`);
              content.text = 'empty';
              return true;
            }

            return !isWhitespace;
          });

        const processedResponse = {
          ...finalResponse,
          content: processedContent
        };

        currentMessages.push(processedResponse);
        updateConversationMessages(activeProject.id, activeConversationId, currentMessages);

        // Check for and handle tool use
        const toolUseContent = finalResponse.content.find((c: MessageContent) => c.type === 'tool_use');
        if (toolUseContent && toolUseContent.type === 'tool_use') {
          try {
            if (shouldCancelRef.current) {
              break;
            }

            const serverWithTool = servers.find(s =>
              s.tools?.some(t => t.name === toolUseContent.name)
            );

            if (!serverWithTool) {
              throw new Error(`No server found for tool ${toolUseContent.name}`);
            }

            const result = await executeTool(
              serverWithTool.id,
              toolUseContent.name,
              toolUseContent.input as Record<string, unknown>,
            );

            if (shouldCancelRef.current) {
              break;
            }

            const toolResultMessage: Message = {
              role: 'user',
              content: [{
                type: 'tool_result',
                tool_use_id: toolUseContent.id,
                content: result,
              }],
              timestamp: new Date()
            };

            currentMessages.push(toolResultMessage);
            updateConversationMessages(activeProject.id, activeConversationId, currentMessages);

            if (!shouldCancelRef.current) {
              continue;
            }
            break;
          } catch (error) {
            const errorMessage: Message = {
              role: 'user',
              content: [{
                type: 'tool_result',
                tool_use_id: toolUseContent.id,
                content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                is_error: true,
              }],
              timestamp: new Date()
            };

            currentMessages.push(errorMessage);
            updateConversationMessages(activeProject.id, activeConversationId, currentMessages);
          }
        }

        // Break the loop if no tool use or should cancel
        if (shouldCancelRef.current || !toolUseContent) {
          break;
        }
      }

    } catch (error) {
      if (error && typeof error === 'object' && 'message' in error && error.message === 'Request was aborted.') {
        console.log('Request was cancelled by user');
      } else if (typeof error === 'object' && error !== null) {
        const errorObj = error as { error?: { type?: string }; status?: number };
        const isOverloaded = errorObj.error?.type === 'overloaded_error' || errorObj.status === 429;

        if (isOverloaded) {
          console.error('Server overloaded, all retries failed:', error);
          if (!shouldCancelRef.current) {
            setError('Server is currently overloaded. Message sending failed after multiple retries. Please try again later.');
          }
        } else {
          console.error('Failed to send message:', error);
          if (!shouldCancelRef.current) {
            setError(error instanceof Error ? error.message : 'An error occurred');
          }
        }
      } else {
        console.error('Failed to send message:', error);
        if (!shouldCancelRef.current) {
          setError(error instanceof Error ? error.message : 'An error occurred');
        }
      }
    } finally {
      shouldCancelRef.current = false;
      setIsLoading(false);
      streamRef.current = null;
      await wakeLock.release();

      // Focus the input field and reset height after the LLM finishes talking
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.style.height = '2.5em';
      }
    }
  };

  const renderMessage = (message: Message, index: number) => {
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
          const nextMessage = activeConversation?.messages[index + 1];
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
                  onClick={() => setSelectedToolCall({
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
        className={`flex pt-6`}
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
  };

  // Render the cancel button only when streaming
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  const handleCancel = useCallback(() => {
    shouldCancelRef.current = true;
    if (streamRef.current?.abort) {
      streamRef.current.abort();
    }
    setIsLoading(false);
    setError('Operation cancelled');
  }, []);

  const renderCancelButton = () => {
    if (!isLoading) return null;
    return (
      <Button
        ref={cancelButtonRef}
        variant="ghost"
        size="icon"
        className="absolute right-4 top-4 z-10"
        onClick={handleCancel}
      >
        <Square className="h-4 w-4" />
      </Button>
    );
  };

  // Handle scroll to bottom button visibility
  const renderScrollButton = () => {
    if (isAtBottom) return null;
    return (
      <Button
        variant="outline"
        size="icon"
        className="absolute right-4 bottom-20 z-10"
        onClick={scrollToBottom}
      >
        <ChevronDown className="h-4 w-4" />
      </Button>
    );
  };

  return (
    <div className="flex flex-col h-full relative">
      <div ref={chatContainerRef} className="h-[calc(100vh-4rem)] overflow-y-auto p-4">
        {/* Messages go here */}
        <div className="space-y-4">
          {activeConversation?.messages.map((message, index) =>
            renderMessage(message, index)
          )}
          {error && (
            <Alert variant="destructive" className="mt-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
        {renderCancelButton()}
        {renderScrollButton()}
      </div>
      {/* Input area */}
      <div className="w-full px-4 py-2 flex items-start space-x-2">
        <Textarea
          ref={inputRef}
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSendMessage();
            }
          }}
          placeholder="Type a message..."
          className="min-h-[2.5em] max-h-[10em] overflow-y-auto resize-none"
        />
        <div className="flex flex-col space-y-2">
          <Button
            size="icon"
            onClick={() => handleSendMessage()}
            disabled={isLoading}
          >
            {isLoading ? <Spinner /> : <Send className="h-4 w-4" />}
          </Button>
          <FileUpload onFileSelect={file => setCurrentFileContent([file])} />
          <VoiceRecorder onTranscriptionComplete={(text) => {
            setInputMessage(text);
          }} />
        </div>
      </div>
      {selectedToolCall && (
        <ToolCallModal
          onClose={() => setSelectedToolCall(null)}
          toolCall={selectedToolCall}
        />
      )}
    </div>
  );
});

ChatViewComponent.displayName = 'ChatView';

export const ChatView = ChatViewComponent;
