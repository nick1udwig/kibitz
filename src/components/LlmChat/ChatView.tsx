import React, { useEffect, useState, useRef, useCallback, useImperativeHandle } from 'react';
import { Anthropic } from '@anthropic-ai/sdk';
import { Tool, CacheControlEphemeral, TextBlockParam } from '@anthropic-ai/sdk/resources/messages/messages';
import { Send, Square, X, ChevronDown } from 'lucide-react';
import type { MessageCreateParams } from '@anthropic-ai/sdk/resources/messages/messages';
import { FileUpload } from './FileUpload';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Message, MessageContent } from './types';
import { MessageItem } from './MessageItem';
import { wakeLock } from '@/lib/wakeLock';
import { ToolCallModal } from './ToolCallModal';
import { VoiceRecorder } from './VoiceRecorder';
import { useFocusControl } from './context/useFocusControl';
import { useStore } from '@/stores/rootStore';
import { Spinner } from '@/components/ui/spinner';
import { throttle } from 'lodash';

const DEFAULT_MODEL = 'claude-3-5-sonnet-20241022';

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
    renameConversation,
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
  const streamRef = useRef<{ abort: () => void } | null>(null);
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
    // Find the current conversation to preserve its properties
    const currentConversation = activeProject?.conversations.find(c => c.id === conversationId);
    if (!currentConversation) return;

    updateProjectSettings(projectId, {
      conversations: activeProject!.conversations.map(conv =>
        conv.id === conversationId
          ? {
            ...currentConversation, // Preserve all existing properties including name
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

  // Function to handle loading more messages while preserving scroll position
  const handleLoadMore = async () => {
    if (!activeProject?.id || !activeConversation?.id) return;
    
    // Store current scroll position and height
    const container = chatContainerRef.current;
    if (!container) return;
    
    const oldScrollHeight = container.scrollHeight;
    
    // Load more messages
    await useStore.getState().loadMoreMessages(activeProject.id, activeConversation.id);
    
    // After messages are loaded, restore relative scroll position
    requestAnimationFrame(() => {
      const newScrollHeight = container.scrollHeight;
      const additionalHeight = newScrollHeight - oldScrollHeight;
      container.scrollTop = container.scrollTop + additionalHeight;
    });
  };

  const handleSendMessage = async () => {
    shouldCancelRef.current = false;
    if ((!inputMessage.trim() && currentFileContent.length === 0) || !activeProject || !activeConversationId) return;

    // Reset any previous error and show loading state
    setError(null);
    setIsLoading(true);

    const currentApiKey = activeProject.settings.provider === 'openrouter'
      ? activeProject.settings.openRouterApiKey
      : (activeProject.settings.anthropicApiKey || activeProject.settings.apiKey);  // Fallback for backward compatibility

    if (!currentApiKey?.trim()) {
      setError(`API key not found. Please set your ${activeProject.settings.provider === 'openrouter' ? 'OpenRouter' : 'Anthropic'} API key in the Settings panel.`);
      setIsLoading(false);
      return;
    }
    // Reset the textarea height immediately after sending
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

      // retry enough times to always push past 60s (the rate limit timer):
      //  https://github.com/anthropics/anthropic-sdk-typescript/blob/dc2591fcc8847d509760a61777fc1b79e0eab646/src/core.ts#L645
      const anthropic = new Anthropic({
        apiKey: activeProject.settings.anthropicApiKey || activeProject.settings.apiKey || '',  // Use anthropic key only
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
        const cachedApiMessages = currentMessages.filter((message, index, array) => {
          // Process messages and remove incomplete tool use interactions
          // If content is a string, keep it
          if (typeof message.content === 'string') return true;

          // At this point we know message.content is an array
          const messageContent = message.content as MessageContent[];

          // Check if this message has a tool_use
          const hasToolUse = messageContent.some(c => c.type === 'tool_use');
          if (!hasToolUse) return true;

          // Look for matching tool_result in next message
          const nextMessage = array[index + 1];
          if (!nextMessage) return false;

          // If next message has string content, can't have tool_result
          if (typeof nextMessage.content === 'string') return false;

          const nextMessageContent = nextMessage.content as MessageContent[];

          // Check if any tool_use in current message has matching tool_result in next message
          return messageContent.every(content => {
            if (content.type !== 'tool_use') return true;
            if (!('id' in content)) return true; // Skip if no id present
            const toolId = content.id;
            return nextMessageContent.some(
              nextContent =>
                nextContent.type === 'tool_result' &&
                'tool_use_id' in nextContent &&
                nextContent.tool_use_id === toolId
            );
          });
        })
        .map((m, index, array) =>
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

        // Helper function to handle stream with retries
        const streamWithRetry = async (params: MessageCreateParams) => {
          let lastError: unknown;
          for (let attempt = 0; attempt < 12; attempt++) { // Try for 1 minute (12 * 5 seconds)
            try {
              const stream = await anthropic.messages.stream(params);
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

        const stream = await streamWithRetry({
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

        // Break if cancel was requested during setup
        if (shouldCancelRef.current) {
          break;
        }

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
          // Get the current conversation state directly from projects
          const currentConversation = activeProject?.conversations.find(c => c.id === activeConversationId);
          if (currentConversation && currentMessages.length === 2 && currentConversation.name === '(New Chat)') {
          // Double check the name hasn't changed while we were processing
          const latestConversation = activeProject?.conversations.find(c => c.id === activeConversationId);
          if (latestConversation?.name !== '(New Chat)') {
            console.log('Title already changed, skipping generation');
            return;
          }

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
            // Break if cancel was requested before tool execution
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

            // Check cancel after tool execution
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

            // Continue the conversation with the tool result if not cancelled
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
        // Cast error to object with optional error and status properties
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


  if (!activeConversation) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full relative">
      <div ref={chatContainerRef} className="h-[calc(100vh-4rem)] overflow-y-auto p-4">
        {activeConversation.pagination?.hasMoreMessages && (
          <div className="flex justify-center mb-4">
            <Button
              variant="outline"
              onClick={handleLoadMore}
              disabled={activeConversation.pagination.isLoadingMore}
            >
              {activeConversation.pagination.isLoadingMore ? (
                <Spinner className="mr-2 h-4 w-4" />
              ) : null}
              Load Previous Messages
            </Button>
          </div>
        )}
        <div className="space-y-4 mb-4">
          {activeConversation.messages.map((message, index) => (
            <MessageItem 
              key={index}
              message={message}
              index={index}
              onToolClick={(name, input, result) => {
                setSelectedToolCall({ name, input, result });
              }}
            />
          ))}
        </div>
      </div>

      {/* Scroll to bottom button */}
      {!isAtBottom && (
        <button
          onClick={scrollToBottom}
          className="fixed bottom-[60px] right-2 md:right-8 z-[100] bg-primary/70 text-primary-foreground rounded-full p-3 shadow-lg hover:bg-primary/90 transition-all hover:scale-110 animate-in fade-in slide-in-from-right-2"
          aria-label="Scroll to bottom"
        >
          <ChevronDown className="w-6 h-6" />
        </button>
      )}

      {error && (
        <div className="px-4 py-2 text-sm text-red-500">
          {error}
        </div>
      )}

      {activeProject?.settings.provider === 'openrouter' && (
        <div className="px-4">
          <Alert>
            <AlertDescription>
              OpenRouter support is coming soon. Please switch to Anthropic provider in settings to chat.
            </AlertDescription>
          </Alert>
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
          <div className="relative flex-1">
            <Textarea
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder={
                activeProject?.settings.provider === 'openrouter'
                  ? "⚠️ OpenRouter support coming soon"
                  : !activeProject?.settings.apiKey?.trim()
                  ? "⚠️ Set your API key in Settings to start chatting"
                  : isLoading
                  ? "Processing response..."
                  : "Type your message"
              }
              onKeyDown={(e) => {
                // Only send on Enter in desktop mode
                const isMobile = window.matchMedia('(max-width: 768px)').matches;
                if (e.key === 'Enter' && !e.shiftKey && !isLoading && !isMobile) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              ref={inputRef}
              className={`pr-20 ${!activeProject?.settings.apiKey?.trim() ? "placeholder:text-red-500/90 dark:placeholder:text-red-400/90 placeholder:font-medium" : ""}`}
              maxRows={8}
              disabled={isLoading || !activeProject?.settings.apiKey?.trim() || activeProject?.settings.provider === 'openrouter'}
            />
            <div className="absolute right-2 bottom-2 flex gap-1">
              <FileUpload
                onFileSelect={(content) => {
                  setCurrentFileContent(prev => [...prev, { ...content }]);
                }}
                onUploadComplete={() => {
                  if (inputRef.current) {
                    inputRef.current.focus();
                  }
                }}
              />
              <VoiceRecorder
                onTranscriptionComplete={(text) => {
                  setInputMessage(prev => {
                    const newText = prev.trim() ? `${prev}\n${text}` : text;
                    return newText;
                  });
                }}
              />
            </div>
          </div>
          <Button
            onClick={isLoading ? cancelCurrentCall : handleSendMessage}
            disabled={!activeProjectId || !activeConversationId || activeProject?.settings.provider === 'openrouter'}
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
