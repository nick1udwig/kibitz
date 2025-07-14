import { useState, useRef, useCallback } from 'react';
import { Anthropic } from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type { Tool as AnthropicToolType, CacheControlEphemeral, TextBlockParam } from '@anthropic-ai/sdk/resources/messages/messages';
import { Message, MessageContent } from '../types';
import { useStore } from '@/stores/rootStore';
import { wakeLock } from '@/lib/wakeLock';
import { GenericMessage, toAnthropicFormat, toOpenAIFormat, sanitizeFunctionName } from '../types/genericMessage';
import { useAutoCommit, detectToolSuccess, detectFileChanges, detectBuildSuccess, detectTestSuccess } from './useAutoCommit';

const DEFAULT_MODEL = 'claude-3-7-sonnet-20250219';

export const useMessageSender = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shouldCancelRef = useRef<boolean>(false);
  const streamRef = useRef<{ abort: () => void } | null>(null);

  const {
    projects,
    activeProjectId,
    activeConversationId,
    updateProjectSettings,
    renameConversation,
    servers,
    executeTool,
    ensureActiveProjectDirectory
  } = useStore();

  // Add auto-commit functionality
  const { onToolExecution, onBuildSuccess, onTestSuccess } = useAutoCommit();

  const activeProject = projects.find(p => p.id === activeProjectId);

  const getUniqueTools = useCallback((should_cache: boolean) => {
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
            description: tool.description || `Tool ${tool.name}`,
            input_schema: tool.input_schema,
          });
        }
      });

    const tools = Array.from(toolMap.values());
    return !should_cache ? tools : tools.map((t, index, array) => index != array.length - 1 ? t : { ...t, cache_control: { type: 'ephemeral' } as CacheControlEphemeral });
  }, [activeProject?.settings.mcpServerIds, servers]);

  const updateConversationMessages = useCallback((projectId: string, conversationId: string, newMessages: Message[]) => {
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
  }, [activeProject, updateProjectSettings]);

  const cancelCurrentCall = useCallback(() => {
    shouldCancelRef.current = true;
    if (streamRef.current) {
      streamRef.current.abort();
    }
    setIsLoading(false);
    setError('Operation cancelled');
  }, []);

  const handleSendMessage = async (
    inputMessage: string,
    currentFileContent: MessageContent[]
  ): Promise<void> => {
    shouldCancelRef.current = false;
    if ((!inputMessage.trim() && currentFileContent.length === 0) || !activeProject || !activeConversationId) {
      return;
    }

    setError(null);
    setIsLoading(true);

    const currentApiKey = activeProject.settings.provider === 'openrouter'
      ? activeProject.settings.openRouterApiKey
      : (activeProject.settings.anthropicApiKey || activeProject.settings.apiKey);

    if (!currentApiKey?.trim()) {
      setError(`API key not found. Please set your ${activeProject.settings.provider === 'openrouter' ? 'OpenRouter' : 'Anthropic'} API key in the Settings panel.`);
      setIsLoading(false);
      return;
    }

    // Format error messages to be more user-friendly
    const formatErrorMessage = (error: unknown): string => {
      if (error instanceof Error) {
        // Handle API error responses
        try {
          const errorData = JSON.parse(error.message);
          if (errorData.error?.type === 'invalid_request_error') {
            if (errorData.error.message.includes('tokens > 200000')) {
              return 'Message is too long. Please reduce the length of your message or clear some conversation history.';
            }
            return `API Error: ${errorData.error.message}`;
          }
        } catch {
          // If error message isn't JSON, use it directly
          return error.message;
        }
        return error.message;
      }
      return 'An unknown error occurred';
    };

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

      const activeConversation = activeProject.conversations.find(c => c.id === activeConversationId);
      const userMessage: Message = {
        role: 'user',
        content: userMessageContent,
        timestamp: new Date()
      };

      const currentMessages = [...(activeConversation?.messages || []), userMessage];
      updateConversationMessages(activeProject.id, activeConversationId, currentMessages);

      const anthropic = new Anthropic({
        apiKey: activeProject.settings.anthropicApiKey || activeProject.settings.apiKey || '',
        dangerouslyAllowBrowser: true,
        maxRetries: 12,
      });

      const toolsCached = getUniqueTools(true);
      const tools = getUniqueTools(false);

      const systemPrompt = activeProject.settings.systemPrompt?.trim();
      const systemPromptContent = systemPrompt ? [
        {
          type: "text",
          text: systemPrompt,
        },
      ] as TextBlockParam[] : undefined;

      console.log("Using provider:", activeProject.settings.provider);

      // Calculate delay with exponential backoff and jitter
      const calculateBackoffDelay = (attempt: number, baseDelay = 1000) => {
        const exponentialDelay = baseDelay * Math.pow(2, attempt); // Exponential backoff
        const jitter = Math.random() * 1000; // Add up to 1s of random jitter
        return Math.min(exponentialDelay + jitter, 30000); // Cap at 30 seconds
      };

      const streamWithRetry = async (params: Parameters<typeof anthropic.messages.create>[0]) => {
        let lastError: unknown;
        const maxAttempts = 12;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          try {
            const stream = await anthropic.messages.stream(params);
            return stream;
          } catch (error) {
            lastError = error;
            console.log(`got error ${JSON.stringify(error)}`);
            if (typeof error === 'object' && error !== null) {
              const errorObj = error as { error?: { type?: string }; status?: number };
              const isOverloaded = errorObj.error?.type === 'overloaded_error' || errorObj.status === 429;

              if (isOverloaded && attempt < maxAttempts - 1) {
                const delay = calculateBackoffDelay(attempt);
                console.log(`Server overloaded. Retrying in ${Math.round(delay/1000)}s (attempt ${attempt + 1}/${maxAttempts})`);
                setError(`Server overloaded. Retrying in ${Math.round(delay/1000)}s (attempt ${attempt + 1}/${maxAttempts})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
              }
            }
            throw error;
          }
        }
        throw lastError;
      };

      while (true) {
        if (shouldCancelRef.current) break;

          const apiMessagesToSend = currentMessages.filter((message, index, array) => {
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
          name: msg.toolInput as string | undefined
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

        if (activeProject.settings.provider === 'openai' || activeProject.settings.provider === 'openrouter') {
          const baseURL = activeProject.settings.provider === 'openrouter' ? 'https://openrouter.ai/api/v1' : undefined;
          const apiKey = activeProject.settings.provider === 'openrouter' ? activeProject.settings.openRouterApiKey : activeProject.settings.openaiApiKey;
          const openai = new OpenAI({
            baseURL,
            apiKey,
            dangerouslyAllowBrowser: true,
          });

          try {
            const openAIApiMessages = toOpenAIFormat(genericMessagesToSend, tools);
            const stream = await openai.chat.completions.create({
              model: activeProject.settings.model || 'gpt-4',
              messages: openAIApiMessages.messages,
              tools: openAIApiMessages.tools,
              stream: true,
              //max_tokens: 4096,
            });

            let functionCallBuffer: { name: string; arguments: string } | null = null;

            for await (const chunk of stream) {
              if (shouldCancelRef.current) break;

              const content = chunk?.choices?.[0]?.delta?.content;
              const functionCallDelta = chunk?.choices?.[0]?.delta?.tool_calls;

              if (functionCallDelta) {
                const delta = functionCallDelta[0];
                if (!functionCallBuffer) {
                  if (delta.function) {
                    functionCallBuffer = {
                      name: delta.function.name || '',
                      arguments: delta.function.arguments || '',
                    };
                  }
                } else if (delta.function) {
                  const currentName: string = functionCallBuffer?.name || '';
                  const currentArgs: string = functionCallBuffer?.arguments || '';
                  functionCallBuffer = {
                  name: currentName || delta.function.name || '',
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

              if (!serverWithTool || !unsanitizedTool) {
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

              const currentConversation = activeProject?.conversations.find(c => c.id === activeConversationId);
              if (currentConversation && currentMessages.length === 3 && currentConversation.name === '(New Chat)') {
                const userFirstMessage = currentMessages[0].content;
                const assistantFirstMessage = currentMessages[1].content;

                const summaryResponse = await openai.chat.completions.create({
                  model: activeProject.settings.model || 'gpt-4',
                  messages: [{
                    role: "user",
                    content: `Generate a concise, specific title (3-4 words max) that accurately captures the main topic or purpose of this conversation. Use key technical terms when relevant. Avoid generic words like 'conversation', 'chat', or 'help'.

User message: ${JSON.stringify(userFirstMessage)}
Assistant response: ${Array.isArray(assistantFirstMessage)
                        ? assistantFirstMessage.filter(c => c.type === 'text').map(c => c.type === 'text' ? c.text : '').join(' ')
                        : assistantFirstMessage}

Format: Only output the title, no quotes or explanation`
                  }],
                  max_tokens: 20,
                });

                if (summaryResponse.choices[0].message.content) {
                  const suggestedTitle = summaryResponse.choices[0].message.content
                    .replace(/["']/g, '')
                    .replace(/title:?\s*/i, '')
                    .trim();
                  if (suggestedTitle) {
                    renameConversation(activeProject.id, activeConversationId, suggestedTitle);
                  }
                }
              }

              try {
                // Ensure project directory is set up before tool execution
                await ensureActiveProjectDirectory();
                
                const result = await executeTool(
                  serverWithTool.id,
                  unsanitizedTool.name as string,
                  functionArgs,
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

                currentMessages.push(currentStreamMessage);
                currentMessages.push(toolResultMessage);
                updateConversationMessages(activeProject.id, activeConversationId, currentMessages);

                // Trigger auto-commit after successful tool execution
                try {
                  const toolSuccess = detectToolSuccess(unsanitizedTool.name as string, result);
                  if (toolSuccess) {
                    const changedFiles = detectFileChanges(unsanitizedTool.name as string, result);
                    console.log(`Tool execution successful, triggering auto-commit for ${unsanitizedTool.name}`);
                    
                    // Prioritize build and test success over general tool execution
                    if (detectBuildSuccess(unsanitizedTool.name as string, result)) {
                      console.log('Detected build success, triggering build success auto-commit');
                      await onBuildSuccess(result);
                    } else if (detectTestSuccess(unsanitizedTool.name as string, result)) {
                      console.log('Detected test success, triggering test success auto-commit');
                      await onTestSuccess(result);
                    } else {
                      await onToolExecution(unsanitizedTool.name as string, result);
                    }
                  }
                } catch (autoCommitError) {
                  console.warn('Auto-commit failed after tool execution:', autoCommitError);
                  // Don't fail the whole operation for auto-commit failures
                }

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

              const currentConversation = activeProject?.conversations.find(c => c.id === activeConversationId);
              if (currentConversation && currentMessages.length === 3 && currentConversation.name === '(New Chat)') {
                const userFirstMessage = currentMessages[0].content;
                const assistantFirstMessage = currentMessages[1].content;

                const summaryResponse = await openai.chat.completions.create({
                  model: activeProject.settings.model || 'gpt-4',
                  messages: [{
                    role: "user",
                    content: `Generate a concise, specific title (3-4 words max) that accurately captures the main topic or purpose of this conversation. Use key technical terms when relevant. Avoid generic words like 'conversation', 'chat', or 'help'.

User message: ${JSON.stringify(userFirstMessage)}
Assistant response: ${Array.isArray(assistantFirstMessage)
                        ? assistantFirstMessage.filter(c => c.type === 'text').map(c => c.type === 'text' ? c.text : '').join(' ')
                        : assistantFirstMessage}

Format: Only output the title, no quotes or explanation`
                  }],
                  max_tokens: 20,
                });

                if (summaryResponse.choices[0].message.content) {
                  const suggestedTitle = summaryResponse.choices[0].message.content
                    .replace(/["']/g, '')
                    .replace(/title:?\s*/i, '')
                    .trim();
                  if (suggestedTitle) {
                    renameConversation(activeProject.id, activeConversationId, suggestedTitle);
                  }
                }
              }

              break;
            }

          } catch (error) {
            console.error("OpenAI API error:", error);
            setError(formatErrorMessage(error));
            setIsLoading(false);
            wakeLock.release();
            return;
          }

        } else if (activeProject.settings.provider === 'anthropic') {
          const anthropicApiMessages = toAnthropicFormat(
            genericMessagesToSend,
            systemPrompt,
          );

          const stream = await streamWithRetry({
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

          stream.on('text', (text) => {
            textContent.text += text;
            const updatedMessages = [...currentMessages, currentStreamMessage];
            updateConversationMessages(activeProject.id, activeConversationId, updatedMessages);
          });

          streamRef.current = stream;

          if (shouldCancelRef.current) break;

          const finalResponse = await stream.finalMessage();

          const processedContent = finalResponse.content.map((content: MessageContent) => {
            if (!content['type']) return content;
            if (content.type !== 'text') return content;

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
              if (!content['type']) return true;
              if (content.type !== 'text') return true;

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

Format: Only output the title, no quotes or explanation`
              }]
            });

            if (summaryResponse.content[0].type === 'text') {
              const suggestedTitle = summaryResponse.content[0].text
                .replace(/["']/g, '')
                .replace(/title:?\s*/i, '')
                .trim();
              if (suggestedTitle) {
                renameConversation(activeProject.id, activeConversationId, suggestedTitle);
              }
            }
          }

          const toolUseContent = finalResponse.content.find((c: MessageContent) => c.type === 'tool_use');
          if (toolUseContent && toolUseContent.type === 'tool_use') {
            try {
              if (shouldCancelRef.current) break;

              // Ensure project directory is set up before tool execution
              await ensureActiveProjectDirectory();

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

              if (shouldCancelRef.current) break;

              const toolResultMessage: Message = {
                role: 'user',
                content: [{
                  type: 'tool_result',
                  tool_use_id: toolUseContent.id,
                  content: typeof result === 'string' ? result : JSON.stringify(result),
                }],
                timestamp: new Date()
              };

              currentMessages.push(toolResultMessage);
              updateConversationMessages(activeProject.id, activeConversationId, currentMessages);

              // Trigger auto-commit after successful tool execution
              try {
                const toolSuccess = detectToolSuccess(toolUseContent.name, result);
                if (toolSuccess) {
                  const changedFiles = detectFileChanges(toolUseContent.name, result);
                  console.log(`Tool execution successful, triggering auto-commit for ${toolUseContent.name}`);
                  
                  // Prioritize build and test success over general tool execution
                  if (detectBuildSuccess(toolUseContent.name, result)) {
                    console.log('Detected build success, triggering build success auto-commit');
                    await onBuildSuccess(result);
                  } else if (detectTestSuccess(toolUseContent.name, result)) {
                    console.log('Detected test success, triggering test success auto-commit');
                    await onTestSuccess(result);
                  } else {
                    await onToolExecution(toolUseContent.name, result);
                  }
                }
              } catch (autoCommitError) {
                console.warn('Auto-commit failed after tool execution:', autoCommitError);
                // Don't fail the whole operation for auto-commit failures
              }

              if (!shouldCancelRef.current) continue;
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

          if (!toolUseContent) break;

        } else {
          setIsLoading(false);
          wakeLock.release();
          return;
        }

        if (shouldCancelRef.current) break;
      }

    } catch (error) {
        console.error('Failed to send message:', error);

        // Use our new error formatting function
        const errorMessage = formatErrorMessage(error);
      if (error instanceof Error && error.message === 'Request was aborted.') {
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
          if (!shouldCancelRef.current) {
            setError(errorMessage);
          }
        }
      } else {
        if (!shouldCancelRef.current) {
          setError(errorMessage);
        }
      }
    } finally {
      shouldCancelRef.current = false;
      setIsLoading(false);
      streamRef.current = null;
      await wakeLock.release();
    }
  };

  const clearError = () => {
    setError(null);
  };

  return {
    isLoading,
    error,
    handleSendMessage,
    cancelCurrentCall,
    clearError
  };
};
