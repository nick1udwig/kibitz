"use client";

import { useState } from 'react';
import { Anthropic } from '@anthropic-ai/sdk';
import { Message, Conversation } from '../types';

export const useAnthropicChat = (
  activeConvo: Conversation | undefined,
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>
) => {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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

      const response = await anthropic.messages.create({
        model: activeConvo.settings.model,
        max_tokens: 1024,
        messages: updatedMessages.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        ...(activeConvo.settings.systemPrompt && { system: activeConvo.settings.systemPrompt }),
        ...(activeConvo.settings.tools.length > 0 && {
          tools: activeConvo.settings.tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            input_schema: tool.schema
          }))
        })
      });

      setConversations(convos => convos.map(convo =>
        convo.id === activeConvo.id
          ? {
              ...convo,
              messages: [...convo.messages, {
                role: 'assistant',
                content: response.content,
                timestamp: new Date()
              }]
            }
          : convo
      ));
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
