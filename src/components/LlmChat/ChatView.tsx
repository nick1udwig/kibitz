import React, { useEffect, useState, useRef, useCallback, useImperativeHandle } from 'react';
import { Send, Square, X, ChevronDown } from 'lucide-react';
import { FileUpload } from './FileUpload';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { wakeLock } from '@/lib/wakeLock';
import { ToolCallModal } from './ToolCallModal';
import { VoiceRecorder } from './VoiceRecorder';
import { useFocusControl } from './context/useFocusControl';
import { useStore } from '@/stores/rootStore';
import { Spinner } from '@/components/ui/spinner';
import { throttle } from 'lodash';
import { createAnthropicClient } from '@/providers/anthropic';
import { createOpenAIClient } from '@/providers/openai';
import type { Tool, CacheControlEphemeral } from '@anthropic-ai/sdk/resources/messages/messages';
import type { Message, MessageContent, ImageMessageContent, DocumentMessageContent } from '@/providers/anthropic';
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
  }, [activeProject?.settings.provider, activeConversation?.messages, activeConversation?.lastUpdated, isAtBottom]);

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

  const handleSendMessage = async () => {
    shouldCancelRef.current = false;
    if ((!inputMessage.trim() && currentFileContent.length === 0) || !activeProject || !activeConversationId) return;

    // Reset any previous error and show loading state
    setError(null);
    setIsLoading(true);

    const provider = activeProject.settings.provider || 'anthropic';
    let currentApiKey;

    if (provider === 'openai') {
      currentApiKey = activeProject.settings.openaiApiKey;
    } else if (provider === 'openrouter') {
      currentApiKey = activeProject.settings.openRouterApiKey;
    } else {
      currentApiKey = activeProject.settings.anthropicApiKey || activeProject.settings.apiKey;
    }

    if (!currentApiKey?.trim()) {
      let providerName;
      switch (provider) {
        case 'openai': providerName = 'OpenAI'; break;
        case 'openrouter': providerName = 'OpenRouter'; break;
        default: providerName = 'Anthropic';
      }
      setError(`API key not found. Please set your ${providerName} API key in the Settings panel.`);
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
      const anthropic = createAnthropicClient({
        apiKey: activeProject.settings.anthropicApiKey || activeProject.settings.apiKey || '',
        model: activeProject.settings.model,
        systemPrompt: activeProject.settings.systemPrompt
      });

      const toolsCached = getUniqueTools(true);

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
                : m.content.map((c: MessageContent, index: number, array: MessageContent[]) =>
                  index != array.length - 1 ? c :
                    {
                      ...c,
                      cache_control: { type: 'ephemeral' } as CacheControlEphemeral,
                    }
                )) as MessageContent[],
              toolInput: m.toolInput ? m.toolInput : undefined,
            }
        );

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

        const stream = await anthropic.streamChat(
          cachedApiMessages,
          toolsCached,
          (text) => {
            textContent.text += text;
            // Update conversation with streaming message
            const updatedMessages = [...currentMessages, currentStreamMessage];
            updateConversationMessages(activeProject.id, activeConversationId, updatedMessages);
          }
        );

        streamRef.current = stream;

        // Break if cancel was requested during setup
        if (shouldCancelRef.current) {
          break;
        }


        // Handle tool use in the final response if any
        // Filter and validate text content in the final response
        const finalResponse = await stream.finalMessage();

        // Process and update final response
        const processedResponse: Message = {
          role: 'assistant',
          content: anthropic.processMessageContent(finalResponse.content),
          timestamp: new Date()
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

          // Convert any string content to MessageContent array
          const userFirstMessage = typeof currentMessages[0].content === 'string' ?
            [{ type: 'text' as const, text: currentMessages[0].content }] : currentMessages[0].content;
          const assistantFirstMessage = typeof currentMessages[1].content === 'string' ?
            [{ type: 'text' as const, text: currentMessages[1].content }] : currentMessages[1].content;
          const suggestedTitle = await anthropic.generateChatTitle(userFirstMessage, assistantFirstMessage);
          if (suggestedTitle) {
            renameConversation(activeProject.id, activeConversationId, suggestedTitle);
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
      const isOverloadedError = (err: unknown) => {
        if (typeof err === 'object' && err !== null) {
          const errorObj = err as { error?: { type?: string }; status?: number };
          return errorObj.error?.type === 'overloaded_error' || errorObj.status === 429;
        }
        return false;
      };

      if (error && typeof error === 'object' && 'message' in error && error.message === 'Request was aborted.') {
        console.log('Request was cancelled by user');
      } else if (isOverloadedError(error)) {
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

  const provider = activeProject?.settings.provider || 'anthropic';

  let client;
  if (provider === 'anthropic') {
    client = createAnthropicClient({
      apiKey: activeProject?.settings.anthropicApiKey || activeProject?.settings.apiKey || '',
      model: activeProject?.settings.model,
      systemPrompt: activeProject?.settings.systemPrompt,
    });
  } else if (provider === 'openai') {
    const apiKey = activeProject?.settings.openaiApiKey?.trim() || '';
    if (!apiKey) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-4">
          <Alert>
            <AlertDescription>
              OpenAI API key not found. Please add your API key in Settings.
            </AlertDescription>
          </Alert>
        </div>
      );
    }
    try {
      client = createOpenAIClient({
        apiKey: apiKey,
        baseUrl: activeProject?.settings.openaiBaseUrl || 'https://api.openai.com/v1',
        organizationId: activeProject?.settings.openaiOrgId || '',
        model: activeProject?.settings.model,
        systemPrompt: activeProject?.settings.systemPrompt,
      });
    } catch (error) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-4">
          <Alert>
            <AlertDescription>
              {error instanceof Error ? error.message : 'Failed to initialize OpenAI client. Please check your settings.'}
            </AlertDescription>
          </Alert>
        </div>
      );
    }
  }

  if (!activeConversation || !client) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full relative">
      <div ref={chatContainerRef} className="h-[calc(100vh-4rem)] overflow-y-auto p-4">
        <div className="space-y-4 mb-4">
          {activeConversation.messages.map((message, index) => (
            client.renderMessage(message, index, activeConversation, setSelectedToolCall)
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
                !activeProject?.settings.apiKey?.trim() && !activeProject?.settings.openaiApiKey?.trim()
                  ? "⚠️ Set your API key in Settings to start chatting"
                  : activeProject?.settings.provider === 'openrouter'
                  ? "⚠️ OpenRouter support coming soon"
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
              disabled={isLoading || (!activeProject?.settings.apiKey?.trim() && !activeProject?.settings.openaiApiKey?.trim()) || activeProject?.settings.provider === 'openrouter'}
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
