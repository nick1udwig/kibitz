// src/components/LlmChat/hooks/useAnthropicChat.ts

import { useState } from 'react';
import { Anthropic } from '@anthropic-ai/sdk';
import { Message, Conversation } from '../types';
import { useMcp } from '../context/McpContext';

export const useAnthropicChat = (
  activeConvo: Conversation | undefined,
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>
) => {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { servers, executeTool } = useMcp();

  const sendMessage = async (inputMessage: string) => {
    if (!inputMessage.trim() || !activeConvo?.settings.apiKey) {
      setError(activeConvo?.settings.apiKey ? null : 'Please enter an API key in settings');
      return;
    }

    setError(null);
    setIsLoading(true);

    const newMessage: Message = {
      role: 'user',
      content: inputMessage,
      timestamp: new Date()
    };

    try {
      // Update conversation with user's message
      const updatedMessages = [...activeConvo.messages, newMessage];
      setConversations(convos => convos.map(convo =>
        convo.id === activeConvo.id
          ? { ...convo, messages: updatedMessages }
          : convo
      ));

      const anthropic = new Anthropic({
        apiKey: activeConvo.settings.apiKey,
        dangerouslyAllowBrowser: true,
      });

      // Function to prepare messages and check token count
      const prepareMessages = async (allMessages: Message[]) => {
        // Always keep the first message
        const firstMessage = allMessages[0];
        let currentMessages = allMessages.slice(1);
        let messagesToSend = [firstMessage, ...currentMessages];

        // Check token count of current messages
        const tokenCount = await anthropic.messages.countTokens({
          model: activeConvo.settings.model,
          messages: messagesToSend.map(msg => ({
            role: msg.role,
            content: msg.content
          }))
        });

        // If we're approaching the limit (leave 1000 tokens for response)
        while (tokenCount.input_tokens > 7000 && currentMessages.length > 0) {
          // Remove the oldest non-first message
          currentMessages = currentMessages.slice(1);
          messagesToSend = [firstMessage, ...currentMessages];

          // Recount tokens
          const newTokenCount = await anthropic.messages.countTokens({
            model: activeConvo.settings.model,
            messages: messagesToSend.map(msg => ({
              role: msg.role,
              content: msg.content
            }))
          });

          if (newTokenCount.input_tokens <= 7000) {
            break;
          }
        }

        return messagesToSend;
      };

      const allTools = [
        ...activeConvo.settings.tools,
        ...servers.flatMap(s => s.tools || []).map(tool => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema
        }))
      ];

      // Prepare messages with token count check
      const processedMessages = await prepareMessages(updatedMessages);

      // Initialize our message array with the processed conversation history
      let messages = processedMessages.map(msg => {
        // Handle special message types
        if (Array.isArray(msg.content)) {
          // This is a tool message
          return {
            role: msg.role,
            content: msg.content
          };
        }
        // Regular text message
        return {
          role: msg.role,
          content: msg.content
        };
      });

      // Keep getting responses and handling tools until we get a final response
      while (true) {
        const response = await anthropic.messages.create({
          model: activeConvo.settings.model,
          max_tokens: 8192,
          messages: messages,
          ...(activeConvo.settings.systemPrompt && { system: activeConvo.settings.systemPrompt }),
          ...(allTools.length > 0 && { tools: allTools })
        });

        // Add Claude's response to messages history AND to the chat display
        messages.push({
          role: 'assistant',
          content: response.content
        });

        // If response includes text content, show it in the chat
        for (const content of response.content) {
          if (content.type === 'text') {
            setConversations(convos => convos.map(convo =>
              convo.id === activeConvo.id
                ? {
                    ...convo,
                    messages: [...convo.messages, {
                      role: 'assistant',
                      content: content.text,
                      timestamp: new Date()
                    }]
                  }
                : convo
            ));
          }
        }

        // If there's no tool use, we're done
        if (!response.content.some(c => c.type === 'tool_use') || response.stop_reason !== 'tool_use') {
          break;
        }

        // Handle tool use
        for (const content of response.content) {
          if (content.type === 'tool_use') {
            try {
              const serverWithTool = servers.find(s =>
                s.tools?.some(t => t.name === content.name)
              );

              if (!serverWithTool) {
                throw new Error(`No server found for tool ${content.name}`);
              }

              // Show tool usage in chat
              setConversations(convos => convos.map(convo =>
                convo.id === activeConvo.id
                  ? {
                      ...convo,
                      messages: [...convo.messages, {
                        role: 'assistant',
                        content: [{
                            type: 'tool_use',
                            id: content.id,
                            name: content.name,
                            input: content.input,
                        }],
                        timestamp: new Date()
                      }]
                    }
                  : convo
              ));

              const result = await executeTool(
                serverWithTool.id,
                content.name,
                content.input
              );

              // Add tool result to messages array with correct formatting
              const toolResultMessage = {
                role: 'user',
                content: [{
                  type: 'tool_result',
                  tool_use_id: content.id,
                  content: result
                }]
              };
              messages.push(toolResultMessage);
              setConversations(convos => convos.map(convo =>
                convo.id === activeConvo.id
                  ? {
                      ...convo,
                      messages: [...convo.messages, toolResultMessage]
                    }
                  : convo
              ));

            } catch (error) {
              // Handle tool execution error
              const errorMessage = {
                role: 'user',
                content: [{
                  type: 'tool_result',
                  tool_use_id: content.id,
                  content: `Error: ${error.message}`,
                  is_error: true
                }]
              };
              messages.push(errorMessage);
            }
          }
        }
      }

    } catch (error) {
      setError(error instanceof Error ? error.message : 'An error occurred');
      console.error('Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    error,
    isLoading,
    sendMessage
  };
};
