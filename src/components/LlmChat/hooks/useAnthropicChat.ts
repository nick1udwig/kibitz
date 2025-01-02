"use client";

import { useState } from 'react';
import { Anthropic } from '@anthropic-ai/sdk';
import { Message, Conversation } from '../types';
import { useMcpServers } from './useMcpServers';

export const useAnthropicChat = (
  activeConvo: Conversation | undefined,
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>
) => {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { servers, executeTool } = useMcpServers(activeConvo?.settings.mcpServers || []);


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
      const updatedMessages = [...activeConvo.messages, newMessage];
      setConversations(convos => convos.map(convo =>
        convo.id === activeConvo.id
          ? { ...convo, messages: updatedMessages }
          : convo
      ));

      // TODO
      //const anthropic = new Anthropic({
      //  apiKey: activeConvo.settings.apiKey,
      //});
      const anthropic = new Anthropic({
        apiKey: activeConvo.settings.apiKey,
        dangerouslyAllowBrowser: true,
      });

      const allTools = [
        ...activeConvo.settings.tools,
        ...servers.flatMap(s => s.tools || []).map(tool => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema
        }))
      ];

      const response = await anthropic.messages.create({
        model: activeConvo.settings.model,
        max_tokens: 1024,
        messages: updatedMessages.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        ...(activeConvo.settings.systemPrompt && { system: activeConvo.settings.systemPrompt }),
        ...(allTools.length > 0 && { tools: allTools })
      });

      // Handle tool use in the response
      if (response.content.some(c => c.type === 'tool_use')) {
        for (const content of response.content) {
          if (content.type === 'tool_use') {
            try {
              // Find the server that owns this tool
              const serverWithTool = servers.find(s =>
                s.tools?.some(t => t.name === content.name)
              );

              if (!serverWithTool) {
                throw new Error(`No server found for tool ${content.name}`);
              }

              const result = await executeTool(
                serverWithTool.id,
                content.name,
                content.input
              );

              // Add tool result to messages
              setConversations(convos => convos.map(convo =>
                convo.id === activeConvo.id
                  ? {
                      ...convo,
                      messages: [...convo.messages, {
                        role: 'assistant',
                        content: `Using tool ${content.name}:\n${result}`,
                        timestamp: new Date()
                      }]
                    }
                  : convo
              ));
            } catch (error) {
              console.error('Tool execution failed:', error);
              // Add error message to chat
              setConversations(convos => convos.map(convo =>
                convo.id === activeConvo.id
                  ? {
                      ...convo,
                      messages: [...convo.messages, {
                        role: 'assistant',
                        content: `Failed to execute tool ${content.name}: ${error.message}`,
                        timestamp: new Date()
                      }]
                    }
                  : convo
              ));
            }
          } else if (content.type === 'text') {
            // Add regular message content
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
