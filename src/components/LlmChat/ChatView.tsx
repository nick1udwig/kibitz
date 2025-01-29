import React, { useEffect, useState, useRef, useCallback, useImperativeHandle } from 'react';
import Image from 'next/image';
import { Anthropic } from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type { Tool as AnthropicToolType, CacheControlEphemeral, TextBlockParam } from '@anthropic-ai/sdk/resources/messages/messages';
import { Send, Square, X, ChevronDown } from 'lucide-react';
import type { MessageCreateParams } from '@anthropic-ai/sdk/resources/messages/messages';
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
import { GenericMessage, toAnthropicFormat, toOpenAIFormat, sanitizeFunctionName, FunctionCall } from '@/components/LlmChat/types/genericMessage';

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

    const toolMap = new Map<string, AnthropicToolType>();

    servers
      .filter(server =>
        activeProject.settings.mcpServerIds.includes(server.id)
      )
      .flatMap(s => s.tools || [])
      .forEach((tool: AnthropicToolType) => {
        if (!toolMap.has(tool.name)) {
          toolMap.set(tool.name, {
            name: tool.name,
            description: tool.description || `Tool ${tool.name}`,  // Provide default description
            input_schema: {
              type: 'object',
              properties: tool.input_schema?.properties || {},
              required: tool.input_schema?.required || [],
            }
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

      console.log("Using provider:", activeProject.settings.provider);

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

      while (true) {
        const apiMessagesToSend = currentMessages.filter((message, index, array) => {
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
            activeProject.settings.provider !== 'anthropic' || index < array.length - 3 ?
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

        const genericMessagesToSend: GenericMessage[] = apiMessagesToSend.map(msg => ({
          role: msg.role,
          content: msg.content,
          name: msg.toolInput as string | undefined // If you need to pass tool input as 'name' in generic format, ensure type matches GenericMessage
        }));

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

        let stream;
        if (activeProject.settings.provider === 'openai') {
          const openai = new OpenAI({
            apiKey: activeProject.settings.openaiApiKey,
            dangerouslyAllowBrowser: true,
          });

          try {
            const openAIApiMessages = toOpenAIFormat(genericMessagesToSend, tools);
            stream = await openai.chat.completions.create({
              model: activeProject.settings.model || 'gpt-4o',
              messages: openAIApiMessages.messages,
              tools: openAIApiMessages.tools,
              stream: true,
              max_tokens: 4096,
            });

            let functionCallBuffer: FunctionCall | null = null;

            // TODO get types to play nice
            //streamRef.current = stream;

            for await (const chunk of stream) {
              if (shouldCancelRef.current) {
                // Break if cancel was requested
                break;
              }

              const content = chunk?.choices?.[0]?.delta?.content;
              const functionCallDelta = chunk?.choices?.[0]?.delta?.tool_calls;

              if (functionCallDelta) {
                const delta = functionCallDelta[0];
                if (!functionCallBuffer) {
                  // Create a new buffer with the initial function call
                  if (delta.function) {
                    functionCallBuffer = {
                      name: delta.function.name,
                      arguments: delta.function.arguments || '',
                    };
                  }
                } else if (delta.function) {
                  // Append to existing buffer
                  const currentName: string = functionCallBuffer?.name || '';
                  const currentArgs: string = functionCallBuffer?.arguments || '';
                  functionCallBuffer = {
                    name: currentName || delta.function.name,
                    arguments: currentArgs + (delta.function.arguments || ''),
                  };
                }
              }

              if (content) {
                textContent.text += content;
                const updatedMessages = [...currentMessages, currentStreamMessage];
                updateConversationMessages(activeProject.id, activeConversationId, updatedMessages);
              }
            }

            if (functionCallBuffer) {
              const functionName = functionCallBuffer.name;
              const functionArgs = JSON.parse(functionCallBuffer.arguments || '{}');

              const serverWithTool = servers.find(s =>
                s.tools?.some(t => sanitizeFunctionName(t.name) === functionName)
              );

              const unsanitizedTool = serverWithTool?.tools?.find(t => sanitizeFunctionName(t.name) === functionName);

              if (!serverWithTool || ! unsanitizedTool) {
                throw new Error(`No server found for tool ${functionName}`);
              }

              const toolUseContent: MessageContent = {
                type: 'tool_use',
                id: `tool_use_${Date.now()}`,
                name: unsanitizedTool.name as string,
                input: functionArgs,
              };

              if (currentStreamMessage.content.length == 1 && currentStreamMessage.content[0].type === 'text' && currentStreamMessage.content[0].text === '') {
                currentStreamMessage.content = [toolUseContent];
              } else {
                currentStreamMessage.content.push(toolUseContent);
              }
              updateConversationMessages(activeProject.id, activeConversationId, [...currentMessages, currentStreamMessage]);

              // Only rename if this is a new chat getting its first messages
              // Get the current conversation state directly from projects
              const currentConversation = activeProject?.conversations.find(c => c.id === activeConversationId);
              if (currentConversation && currentMessages.length === 3 && currentConversation.name === '(New Chat)') {
                const userFirstMessage = currentMessages[0].content;
                const assistantFirstMessage = currentMessages[1].content;


                const summaryResponse = await openai.chat.completions.create({
                  model: activeProject.settings.model || 'gpt-4o',
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
                  }],
                  max_tokens: 20,
                });

                if (summaryResponse.choices[0].message.content) {
                  const suggestedTitle = summaryResponse.choices[0].message.content
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

              try {
                const result = await executeTool(
                  serverWithTool.id,
                  unsanitizedTool.name as string,
                  functionArgs,
                );

                const toolResultMessage: Message = {
                  role: 'user', // Tool result is from the user/agent perspective
                  content: [{
                    type: 'tool_result',
                    tool_use_id: toolUseContent.id,
                    content: result,
                  }],
                  timestamp: new Date()
                };

                if (currentStreamMessage) {
                  currentMessages.push(currentStreamMessage);
                }
                currentMessages.push(toolResultMessage);
                updateConversationMessages(activeProject.id, activeConversationId, currentMessages);

              } catch (toolError) {
                const errorMessage: Message = {
                  role: 'user',
                  content: [{
                    type: 'tool_result',
                    tool_use_id: toolUseContent.id,
                    content: `Error: ${toolError instanceof Error ? toolError.message : 'Unknown error'}`,
                    is_error: true,
                  }],
                  timestamp: new Date()
                };
                const updatedMessagesWithError = [...currentMessages, currentStreamMessage, errorMessage];
                updateConversationMessages(activeProject.id, activeConversationId, updatedMessagesWithError);
              }
            } else {
              currentMessages.push(currentStreamMessage);
              updateConversationMessages(activeProject.id, activeConversationId, currentMessages);

              // Only rename if this is a new chat getting its first messages
              // Get the current conversation state directly from projects
              const currentConversation = activeProject?.conversations.find(c => c.id === activeConversationId);
              if (currentConversation && currentMessages.length === 3 && currentConversation.name === '(New Chat)') {
                const userFirstMessage = currentMessages[0].content;
                const assistantFirstMessage = currentMessages[1].content;

                const summaryResponse = await openai.chat.completions.create({
                  model: activeProject.settings.model || 'gpt-4o',
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
                  }],
                  max_tokens: 20,
                });

                if (summaryResponse.choices[0].message.content) {
                  const suggestedTitle = summaryResponse.choices[0].message.content
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

              break;
            }

          } catch (error) {
            const openaiError = error as Error;
            console.error("OpenAI API error:", openaiError);
            setError(`OpenAI API error: ${openaiError.message || 'Unknown error'}`);
          }

        } else if (activeProject.settings.provider === 'anthropic') {
          const anthropicApiMessages = toAnthropicFormat(
            genericMessagesToSend,
            systemPrompt,
          );

          stream = await streamWithRetry({
            model: activeProject.settings.model || DEFAULT_MODEL,
            max_tokens: 8192,
            messages: anthropicApiMessages.messages,
            ...(anthropicApiMessages.system && { system: anthropicApiMessages.system }),
            ...(systemPromptContent && systemPromptContent.length > 0 && {
              system: systemPromptContent
            }),
            ...(tools.length > 0 && {
              tools: toolsCached
            })
          });
          // **[NODE.JS STREAM HANDLING - ANTHROPIC]**
          stream.on('text', (text) => {
            textContent.text += text;

            // Update conversation with streaming message
            const updatedMessages = [...currentMessages, currentStreamMessage];
            updateConversationMessages(activeProject.id, activeConversationId, updatedMessages);
          });

          streamRef.current = stream;

          // Break if cancel was requested during setup
          if (shouldCancelRef.current) {
            break;
          }

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
          if (!toolUseContent) {
            break;
          }

        } else {
          // Should not reach here as provider is checked earlier
          setIsLoading(false);
          wakeLock.release();
          return;
        }

        if (shouldCancelRef.current) {
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

// Display name for debugging purposes
ChatViewComponent.displayName = 'ChatView';

// Export a memo'd version for better performance
export const ChatView = React.memo(ChatViewComponent);
