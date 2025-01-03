"use client";

import { useState, useEffect } from 'react';
import { Conversation, ConversationSettings } from '../types';

const generateId = () => Math.random().toString(36).substring(7);

export const useConversations = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvoId, setActiveConvoId] = useState<string>('');

  // Initialize with a default conversation if none exists
  useEffect(() => {
    const savedConvos = localStorage.getItem('chat_app_conversations');
    if (savedConvos) {
      const parsed = JSON.parse(savedConvos).map((convo: any) => ({
        ...convo,
        messages: convo.messages.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        }))
      }));
      setConversations(parsed);
      setActiveConvoId(parsed[0]?.id || '');
    } else {
      const defaultConvo: Conversation = {
        id: generateId(),
        name: 'New Conversation',
        messages: [],
        settings: {
          apiKey: '',
          model: 'claude-3-5-sonnet-20241022',
          systemPrompt: '',
          tools: [],
          mcpServers: []
        }
      };
      setConversations([defaultConvo]);
      setActiveConvoId(defaultConvo.id);
    }
  }, []);

  // Save conversations to localStorage
  useEffect(() => {
    if (conversations.length > 0) {
      localStorage.setItem('chat_app_conversations', JSON.stringify(conversations));
    }
  }, [conversations]);

  const activeConvo = conversations.find(c => c.id === activeConvoId);

  const createNewConversation = () => {
    const currentConvo = conversations.find(c => c.id === activeConvoId);
    const newConvo: Conversation = {
      id: generateId(),
      name: `Conversation ${conversations.length + 1}`,
      messages: [],
      settings: { ...currentConvo?.settings! }
    };
    setConversations([...conversations, newConvo]);
    setActiveConvoId(newConvo.id);
  };

  const deleteConversation = (id: string) => {
    const newConversations = conversations.filter(c => c.id !== id);
    setConversations(newConversations);

    // If we're deleting the active conversation, switch to another one
    if (id === activeConvoId) {
      const nextConvo = newConversations[0];
      if (nextConvo) {
        setActiveConvoId(nextConvo.id);
      } else {
        // If no conversations left, create a new default one
        const defaultConvo: Conversation = {
          id: generateId(),
          name: 'New Conversation',
          messages: [],
          settings: {
            apiKey: '',
            model: 'claude-3-5-sonnet-20241022',
            systemPrompt: '',
            tools: [],
            mcpServers: []
          }
        };
        setConversations([defaultConvo]);
        setActiveConvoId(defaultConvo.id);
      }
    }
  };

  const updateConversationSettings = (settings: ConversationSettings) => {
    setConversations(convos => convos.map(convo =>
      convo.id === activeConvoId
        ? { ...convo, settings }
        : convo
    ));
  };

  return {
    conversations,
    activeConvoId,
    activeConvo,
    setActiveConvoId,
    setConversations,
    createNewConversation,
    deleteConversation,
    updateConversationSettings
  };
};
