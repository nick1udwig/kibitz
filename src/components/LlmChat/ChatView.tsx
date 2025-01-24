"use client";

import React, { useEffect, useState, useRef, useCallback, useImperativeHandle } from 'react';
import Image from 'next/image';
import { ChatProviderFactory } from './providers/factory';
import { Tool } from '@anthropic-ai/sdk/resources/messages/messages';
import { Send, Square, X, ChevronDown } from 'lucide-react';
import { FileUpload } from './FileUpload';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Message, MessageContent, ImageMessageContent, DocumentMessageContent } from './types';
import { wakeLock } from '@/lib/wakeLock';
import { ToolCallModal } from './ToolCallModal';
import { VoiceRecorder } from './VoiceRecorder';
import { useFocusControl } from './context/useFocusControl';
import { useStore } from '@/stores/rootStore';
import { Spinner } from '@/components/ui/spinner';
import { throttle } from 'lodash';
import type { LegacyProviderType } from './types/provider';

// Create provider factory singleton
const providerFactory = new ChatProviderFactory();

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

  const getUniqueTools = () => {
    if (!activeProject?.settings.mcpServerIds?.length) {
      return [];
    }

    const toolMap = new Map<string, Tool>();

    const tools = Array.from(toolMap.values());
    return tools;
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

    // Determine provider and API key
    const provider = activeProject.settings.provider || 'anthropic';
    const apiKey = provider === 'anthropic' 
      ? (activeProject.settings.anthropicApiKey || activeProject.settings.apiKey) || ''
      : provider === 'openai'
      ? activeProject.settings.openaiApiKey || ''
      : activeProject.settings.openRouterApiKey || '';

    // Create provider config
    const config = {
      type: provider as LegacyProviderType,
      settings: {
        apiKey,
        ...(provider === 'openai' && {
          baseUrl: activeProject.settings.openaiBaseUrl || 'https://api.openai.com/v1',
          organizationId: activeProject.settings.openaiOrgId || '',
        }),
        ...(provider === 'openrouter' && {
          baseUrl: activeProject.settings.openRouterBaseUrl || '',
        }),
      }
    };

    try {
      providerFactory.validateConfig(config);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid provider configuration');
      setIsLoading(false);
      return;
    }

    // Verify API key
    if (!config.settings.apiKey?.trim()) {
      setError(`API key not found. Please set your ${provider} API key in the Settings panel.`);
      setIsLoading(false);
      return;
    }

    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = '2.5em';
    }

    await wakeLock.acquire();
    try {
      // Create user message
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

      // Create provider instance and send message
      const chatProvider = providerFactory.createProvider(config);
      const tools = getUniqueTools();
      const systemPrompt = activeProject.settings.systemPrompt?.trim();

      await chatProvider.sendMessage(
        currentMessages,
        tools,
        systemPrompt,
        // Text handler
        (text) => {
          const streamMessage: Message = {
            role: 'assistant',
            content: [{ type: 'text', text }],
            timestamp: new Date(),
          };
          const updatedMessages = [...currentMessages, streamMessage];
          updateConversationMessages(activeProject.id, activeConversationId, updatedMessages);
        },
        // Error handler
        (error) => {
          console.error('Error from provider:', error);
          setError(error.message);
        },
        // Completion handler
        async (finalResponse) => {
          // Update messages
          updateConversationMessages(
            activeProject.id, 
            activeConversationId,
            [...currentMessages, finalResponse]
          );

          // Handle chat title generation
          const currentConversation = activeProject?.conversations.find(c => c.id === activeConversationId);
          if (currentConversation && currentMessages.length === 2 && currentConversation.name === '(New Chat)') {
            // Double check name hasn't changed
            const latestConversation = activeProject?.conversations.find(c => c.id === activeConversationId);
            if (latestConversation?.name === '(New Chat)') {
              const title = await chatProvider.generateTitle(currentMessages[0].content, finalResponse.content);
              if (title) {
                renameConversation(activeProject.id, activeConversationId, title);
              }
            }
          }
        },
        shouldCancelRef
      );

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

      // Focus the input field and reset height
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
                  ? 'bg-accent !text-accent-foreground'
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
                  ? 'bg-accent !text-accent-foreground'
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
                  ? 'bg-accent !text-accent-foreground'
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
            ? 'bg-accent !text-accent-foreground'
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
        <Spinner />
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

ChatViewComponent.displayName = 'ChatView';

export const ChatView = React.memo(ChatViewComponent);