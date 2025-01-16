import React, { useEffect, useState, useRef, useCallback, useImperativeHandle } from 'react';
import Image from 'next/image';
import { Anthropic } from '@anthropic-ai/sdk';
import { Tool, CacheControlEphemeral, TextBlockParam } from '@anthropic-ai/sdk/resources/messages/messages';
import { Send, Square, X } from 'lucide-react';
import { FileUpload } from './FileUpload';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy';
import { Textarea } from '@/components/ui/textarea';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Message, MessageContent, ImageMessageContent, DocumentMessageContent } from './types';
import { ToolCallModal } from './ToolCallModal';
import { useProjects } from './context/ProjectContext';
import { useFocusControl } from './context/useFocusControl';
import { useMcp } from './context/McpContext';

const DEFAULT_MODEL = 'claude-3-5-sonnet-20241022';

export interface ChatViewRef {
  focus: () => void;
}

const ChatViewComponent = React.forwardRef<ChatViewRef>((props, ref) => {
  const [currentFileContent, setCurrentFileContent] = useState<MessageContent[]>([]);
  const {
    projects,
    activeProjectId,
    activeConversationId,
    updateProjectSettings,
    renameConversation,
  } = useProjects();

  const activeProject = projects.find(p => p.id === activeProjectId);
  const activeConversation = activeProject?.conversations.find(
    c => c.id === activeConversationId
  );

  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shouldCancelRef = useRef<boolean>(false);
  const streamRef = useRef<{ abort: () => void } | null>(null);
  const { servers, executeTool } = useMcp();
  const messagesEndRef = useRef<HTMLDivElement>(null);
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

  // Scroll handling logic
  useEffect(() => {
    if (!chatContainerRef.current) return;
    const container = chatContainerRef.current;
    container.scrollTop = container.scrollHeight;
  }, []);

  // Handle message updates
  useEffect(() => {
    if (!chatContainerRef.current || !activeConversation?.messages.length) {
      return;
    }

    const lastMessage = activeConversation.messages[activeConversation.messages.length - 1];

    if (lastMessage.role === 'assistant' || lastMessage.role === 'user') {
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      });
    }
  }, [activeConversation?.messages, activeConversation?.lastUpdated]);

  const getUniqueTools = (should_cache: boolean) => {
    if (!activeProject?.settings.mcpServers?.length) {
      return [];
    }

    const toolMap = new Map<string, Tool>();

    servers
      .filter(server =>
        activeProject.settings.mcpServers.some(
          configuredServer => configuredServer.id === server.id
        )
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
    updateProjectSettings(projectId, {
      conversations: activeProject!.conversations.map(conv =>
        conv.id === conversationId
          ? {
            ...conv,
            messages: newMessages,
            lastUpdated: new Date()
          }
          : conv
      )
    });
  };

  const cancelCurrentCall = useCallback(() => {
    shouldCancelRef.current = true;
    if (streamRef.current) {
      streamRef.current.abort();
    }
    setIsLoading(false);
    setError('Operation cancelled');
  }, []);

  const handleSendMessage = async () => {
    shouldCancelRef.current = false;
    if ((!inputMessage.trim() && currentFileContent.length === 0) || !activeProject || !activeConversationId) return;

    // Reset any previous error and show loading state
    setError(null);
    setIsLoading(true);

    if (!activeProject.settings.apiKey?.trim()) {
      setError('API key not found. Please set your Anthropic API key in the Settings panel.');
      setIsLoading(false);
      return;
    }
    // Reset the textarea height immediately after sending
    if (inputRef.current) {
      inputRef.current.style.height = '2.5em';
    }

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

      // retry enough times to always push past 60s (the rate limit timer):
      //  https://github.com/anthropics/anthropic-sdk-typescript/blob/dc2591fcc8847d509760a61777fc1b79e0eab646/src/core.ts#L645
      const anthropic = new Anthropic({
        apiKey: activeProject.settings.apiKey,
        dangerouslyAllowBrowser: true,
        maxRetries: 12,
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
        const cachedApiMessages = currentMessages.map((m, index, array) =>
          index < array.length - 3 ?
            {
              role: m.role,
              content: m.content,
              toolInput: m.toolInput ? m.toolInput : undefined,
            } :
            {
              role: m.role,
              content: (typeof m.content === 'string' ?
                [{ type: 'text' as const, text: m.content, cache_control: { type: 'ephemeral' } as CacheControlEphemeral }]
                : m.content.map((c, index, array) =>
                  index != array.length - 1 ? c :
                    {
                      ...c,
                      cache_control: { type: 'ephemeral' } as CacheControlEphemeral,
                    }
                )) as MessageContent[],
              toolInput: m.toolInput ? m.toolInput : undefined,
            }
        );

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
            const keepToolResponse = await anthropic.messages.create({
              model: DEFAULT_MODEL,
              max_tokens: 8192,
              messages: [
                ...cachedApiMessages.filter(msg => {
                  if (!Array.isArray(msg.content)) return false;
                  const toolResult = msg.content.find(c =>
                    c.type === 'tool_use' || c.type === 'tool_result'
                  );
                  return toolResult;
                }).map(msg =>
                  !(msg.content as MessageContent[]).find(c => c.type === 'tool_result') ?
                    {
                      ...msg,
                      content: [
                        msg.content[0],
                        {
                          type: 'text' as const,
                          text: `${JSON.stringify(msg.content[1])}`,
                        },
                      ],
                    } :
                    {
                      ...msg,
                      content: [
                        {
                          type: 'text' as const,
                          text: `${JSON.stringify({ ...(msg.content as MessageContent[])[0], content: 'elided' })}`,
                        },
                      ],
                    }
                ),
                {
                  role: 'user' as const,
                  content: [{
                    type: 'text' as const,
                    text: 'Rate each `message`: will the `type: tool_result` be required by `assistant` to serve the next response? Reply ONLY with `<tool_use_id>: Yes` or `<tool_use_id>: No` for each tool_result. DO NOT reply with code, prose, or commentary of any kind.\nExample output:\ntoolu_014huykAonadokihkrboFfqn: Yes\ntoolu_01APhxfkQZ1nT7Ayt8Vtyuz8: Yes\ntoolu_01PcgSwHbHinNrn3kdFaD82w: No\ntoolu_018Qosa8PHAZjUa312TXRwou: Yes',
                    cache_control: { type: 'ephemeral' } as CacheControlEphemeral,
                  }],
                },
              ] as Message[],
              system: [{
                type: 'text' as const,
                text: 'Rate each `message`: will the `type: tool_result` be required by `assistant` to serve the next response? Reply ONLY with `<tool_use_id>: Yes` or `<tool_use_id>: No` for each tool_result. DO NOT reply with code, prose, or commentary of any kind.\nExample output:\ntoolu_014huykAonadokihkrboFfqn: Yes\ntoolu_01APhxfkQZ1nT7Ayt8Vtyuz8: Yes\ntoolu_01PcgSwHbHinNrn3kdFaD82w: No\ntoolu_018Qosa8PHAZjUa312TXRwou: Yes',
                cache_control: { type: 'ephemeral' } as CacheControlEphemeral,
              }],
            });

            if (keepToolResponse.content[0].type === 'text') {
              console.log('a');
              const lines = keepToolResponse.content[0].text.split('\n');

              for (const line of lines) {
                const [key, value] = line.split(': ');

                if (value.trim() === 'Yes') {
                  console.log('b');
                  savedToolResults.add(key);
                } else if (value.trim() === 'No') {
                  console.log('c');
                  savedToolResults.delete(key);
                }
              }
            }
            console.log(`keepToolResponse: ${JSON.stringify(keepToolResponse)}\n${JSON.stringify(savedToolResults)}`);
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

        const stream = await anthropic.messages.stream({
          model: activeProject.settings.model || DEFAULT_MODEL,
          max_tokens: 8192,
          messages: apiMessagesToSend,
          ...(systemPromptContent && systemPromptContent.length > 0 && {
            system: systemPromptContent
          }),
          ...(tools.length > 0 && {
            tools: toolsCached
          })
        });

        streamRef.current = stream;

        stream.on('text', (text) => {
          textContent.text += text;

          // Update conversation with streaming message
          const updatedMessages = [...currentMessages, currentStreamMessage];
          updateConversationMessages(activeProject.id, activeConversationId, updatedMessages);
        });

        // Handle tool use in the final response if any
        // Filter and validate text content in the final response
        const finalResponse = await stream.finalMessage();

        // Process content to handle empty text blocks
        const processedContent = finalResponse.content.map((content: MessageContent) => {
          if (!content['type']) {
            return content;
          }
          // Keep non-text content
          if (content.type !== 'text') {
            return content;
          }

          // Check if text content is purely whitespace
          const isWhitespace = content.text.trim().length === 0;

          // If there's only one content block and it's whitespace, replace with "empty"
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
            // Keep non-text content
            if (content.type !== 'text') {
              return true;
            }

            // Check if text content is purely whitespace
            const isWhitespace = content.text.trim().length === 0;

            // If there's only one content block and it's whitespace, replace with "empty"
            if (isWhitespace && finalResponse.content.length === 1) {
              console.log(`got unexpected whitespace case from assistant: ${JSON.stringify(finalResponse)}`);
              content.text = 'empty';
              return true;
            }

            // For multiple content blocks, drop purely whitespace ones
            return !isWhitespace;
          });

        const processedResponse = {
          ...finalResponse,
          content: processedContent
        };

        currentMessages.push(processedResponse);
        updateConversationMessages(activeProject.id, activeConversationId, currentMessages);

          // Only rename if this is a new chat getting its first messages
          if (activeConversation && currentMessages.length === 2 && activeConversation.name === 'New Chat') {
          const userFirstMessage = currentMessages[0].content;
          const assistantFirstMessage = currentMessages[1].content;

          const summaryResponse = await anthropic.messages.create({
            model: activeProject.settings.model || DEFAULT_MODEL,
            max_tokens: 20,
            messages: [{
              role: "user",
              content: `Generate a concise, specific title (3-4 words max) that accurately captures the main topic or purpose of this conversation. Use key technical terms when relevant. Avoid generic words like 'conversation', 'chat', or 'help'.

User message: ${JSON.stringify(userFirstMessage)}
Assistant response: ${Array.isArray(assistantFirstMessage)
  ? assistantFirstMessage.filter(c => c.type === 'text').map(c => c.type === 'text' ? c.text : '').join(' ')
  : assistantFirstMessage}

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
            const suggestedTitle = summaryResponse.content[0].text
              .replace(/["']/g, '')
              .replace('title:', '')
              .replace('Title:', '')
              .replace('title', '')
              .replace('Title', '')
              .trim();
            if (suggestedTitle) {
              renameConversation(activeProject.id, activeConversationId, suggestedTitle);
            }
          }
        }

        // Check for and handle tool use
        const toolUseContent = finalResponse.content.find((c: MessageContent) => c.type === 'tool_use');
        if (toolUseContent && toolUseContent.type === 'tool_use') {
          try {
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

            // Continue the conversation with the tool result
            continue;
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
              className={`flex max-w-full`}
            >
              <div className="relative group w-full max-w-full overflow-hidden">
                <div className="absolute right-2 top-2 z-10">
                  <CopyButton
                    text={content.text.trim()}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                  />
                </div>
                <div
                  className={`w-full max-w-full rounded-lg px-4 py-2 ${message.role === 'user'
                    ? 'bg-accent !text-accent-foreground'
                    : 'bg-muted text-foreground'
                    }`}
                >
                  <ReactMarkdown
                    className={`prose dark:prose-invert break-words max-w-full ${message.role === 'user' ? '[&_pre]:!bg-accent-foreground/10 [&_p]:!text-accent-foreground [&_code]:!text-accent-foreground' : ''}`}
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
                          <div className="group/code relative max-w-full overflow-x-auto">
                            <div className="sticky top-2 float-right -mr-2 z-10">
                              <CopyButton
                                text={text}
                                className="opacity-0 group-hover/code:opacity-100 transition-opacity"
                              />
                            </div>
                            <pre className="overflow-x-auto max-w-full" {...props}>{children}</pre>
                          </div>
                        );
                      },
                      code({ inline, children, ...props }) {
                        return inline ? (
                          <code className="text-inherit whitespace-nowrap" {...props}>{children}</code>
                        ) : (
                          <code className="block overflow-x-auto whitespace-pre" {...props}>{children}</code>
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
  };

  if (!activeConversation) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="mb-4 text-muted-foreground">Select a conversation or start a new chat</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full relative">
      <div ref={chatContainerRef} className="h-[calc(100vh-4rem)] overflow-y-auto p-4">
        <div className="space-y-4 mb-4">
          {activeConversation.messages.map((message, index) => (
            renderMessage(message, index)
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {error && (
        <div className="px-4 py-2 text-sm text-red-500">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-2 p-2 bg-background fixed bottom-0 left-0 right-0 z-50 md:left-[280px] md:w-[calc(100%-280px)]">
        {currentFileContent.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {currentFileContent.map((content, index) => (
              <div key={index} className="flex items-center gap-2 bg-muted rounded px-2 py-1">
                <span className="text-sm">
                  {content.type === 'text' ? 'Text file' :
                    ((content as ImageMessageContent | DocumentMessageContent).fileName || 'Untitled')}
                </span>
                <button
                  onClick={() => {
                    setCurrentFileContent(prev => prev.filter((_, i) => i !== index));
                  }}
                  className="hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <div className="flex items-end">
            <FileUpload
              onFileSelect={(content) => {
                setCurrentFileContent(prev => [...prev, { ...content }]);
              }}
            />
          </div>
          <Textarea
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder={!activeProject?.settings.apiKey?.trim() ? "⚠️ Set your API key in Settings to start chatting" : "Type your message"}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !isLoading) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            ref={inputRef}
            className={`flex-1 ${!activeProject?.settings.apiKey?.trim() ? "placeholder:text-red-500/90 dark:placeholder:text-red-400/90 placeholder:font-medium" : ""}`}
            maxRows={8}
            disabled={isLoading || !activeProject?.settings.apiKey?.trim()}
          />
          <Button
            onClick={isLoading ? cancelCurrentCall : handleSendMessage}
            disabled={!activeProjectId || !activeConversationId}
            className="self-end relative"
          >
            {isLoading ? (
              <Square className="w-4 h-4" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
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
