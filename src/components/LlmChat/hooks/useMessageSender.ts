import { useState, useCallback } from 'react';
import { Message, MessageContent } from '../types';
import { useStore } from '@/stores/rootStore';

export const useMessageSender = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    projects,
    activeProjectId,
    activeConversationId,
    updateProjectSettings
  } = useStore();

  const activeProject = projects.find(p => p.id === activeProjectId);

  const cancelCurrentCall = useCallback(() => {
    setIsLoading(false);
    setError('Operation cancelled');
  }, []);

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

  const handleSendMessage = async (
    inputMessage: string,
    currentFileContent: MessageContent[]
  ): Promise<void> => {
if ((!inputMessage.trim() && currentFileContent.length === 0) || !activeProject || !activeConversationId) {
      return;
    }

    setError(null);
    setIsLoading(true);

    const currentApiKey = activeProject.settings.provider === 'openrouter'
      ? activeProject.settings.openRouterApiKey
      : activeProject.settings.anthropicApiKey || activeProject.settings.apiKey;

    if (!currentApiKey?.trim()) {
      setError(`API key not found. Please set your ${activeProject.settings.provider === 'openrouter' ? 'OpenRouter' : 'Anthropic'} API key in the Settings panel.`);
      setIsLoading(false);
      return;
    }

    
    try {
      const userMessageContent: MessageContent[] = [
        ...currentFileContent.map(c =>
          c.type === 'image' ? { ...c, fileName: undefined } : { ...c, fileName: undefined }
        ),
        ...(inputMessage.trim() ? [{
          type: 'text' as const,
          text: inputMessage,
        }] : [])
      ];

      const userMessage: Message = {
        role: 'user',
        content: userMessageContent,
        timestamp: new Date()
      };

      const currentMessages = [...(activeProject.conversations.find(c => c.id === activeConversationId)?.messages || []), userMessage];
      updateConversationMessages(activeProject.id, activeConversationId, currentMessages);

      console.log("Using provider:", activeProject.settings.provider);

      // TODO: Implement provider-specific message handling
      console.log('Message sending not implemented yet');

    } catch (error) {
      console.error('Error sending message:', error);
      setError(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isLoading,
    error,
    handleSendMessage,
    cancelCurrentCall
  };
};

// Helper functions follow here...
// (Implementation details of handleOpenAIMessages, handleAnthropicMessages, etc.)