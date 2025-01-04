"use client";

import React, { useEffect, useState, useRef } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import ReactMarkdown from 'react-markdown';
import { Message } from './types';
import { Spinner } from '@/components/ui/spinner';
import { ToolCallModal } from './ToolCallModal';
import { useProjects } from './context/ProjectContext';
import { useMcp } from './context/McpContext';
import { useAnthropicChat } from './hooks/useAnthropicChat';

export const ChatView: React.FC = () => {
  const {
    projects,
    activeProjectId,
    activeConversationId,
    updateProjectSettings
  } = useProjects();

  // Find active project and conversation
  const activeProject = projects.find(p => p.id === activeProjectId);
  const activeConversation = activeProject?.conversations.find(
    c => c.id === activeConversationId
  );

  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { servers, executeTool } = useMcp();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevMessagesLength = useRef(activeConversation?.messages.length || 0);

  const [selectedToolCall, setSelectedToolCall] = useState<{
    name: string;
    input: any;
    result: string | null;
  } | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    const currentLength = activeConversation?.messages.length || 0;
    if (currentLength > prevMessagesLength.current) {
      scrollToBottom();
    }
    prevMessagesLength.current = currentLength;
  }, [activeConversation?.messages]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !activeProject || !activeConversationId) return;

    setIsLoading(true);
    try {
      // Add user message
      const userMessage: Message = {
        role: 'user',
        content: inputMessage,
        timestamp: new Date()
      };

      const updatedMessages = [...(activeConversation?.messages || []), userMessage];

      // Update conversation with new message
      const updatedConversations = activeProject.conversations.map(conv =>
        conv.id === activeConversationId
          ? { ...conv, messages: updatedMessages, lastUpdated: new Date() }
          : conv
      );

      updateProjectSettings(activeProject.id, { conversations: updatedConversations });

      // Clear input and scroll
      setInputMessage('');
      scrollToBottom();

      // Get assistant response
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: updatedMessages,
          apiKey: activeProject.settings.apiKey,
          model: activeProject.settings.model,
          systemPrompt: activeProject.settings.systemPrompt,
          tools: activeProject.settings.mcpServers.flatMap(s => s.tools || [])
        })
      });

      if (!response.ok) {
        throw new Error('Failed to get response from API');
      }

      const assistantMessage = await response.json();

      // Update conversation with assistant's response
      const finalConversations = activeProject.conversations.map(conv =>
        conv.id === activeConversationId
          ? {
              ...conv,
              messages: [...updatedMessages, assistantMessage],
              lastUpdated: new Date()
            }
          : conv
      );

      updateProjectSettings(activeProject.id, { conversations: finalConversations });
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const renderMessage = (message: Message, index: number) => {
    if (Array.isArray(message.content)) {
      return message.content.map((content, contentIndex) => {
        if (content.type === 'tool_use') {
          // Find corresponding tool result in next message
          const nextMessage = activeConversation?.messages[index + 1];
          let toolResult = '';
          if (nextMessage && Array.isArray(nextMessage.content)) {
            const resultContent = nextMessage.content.find(c =>
              c.type === 'tool_result' && c.tool_use_id === content.id
            );
            if (resultContent) {
              toolResult = resultContent.content;
            }
          }

          return (
            <button
              key={`${index}-${contentIndex}`}
              onClick={() => setSelectedToolCall({
                name: content.name,
                input: content.input,
                result: toolResult
              })}
              className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline"
            >
              Calling tool: {content.name}
            </button>
          );
        } else if (content.type === 'text') {
          return (
            <ReactMarkdown key={`${index}-${contentIndex}`} className="prose dark:prose-invert max-w-none">
              {content.text}
            </ReactMarkdown>
          );
        }
        return null;
      });
    } else if (typeof message.content === 'string') {
      return (
        <ReactMarkdown className="prose dark:prose-invert max-w-none">
          {message.content}
        </ReactMarkdown>
      );
    }
    return null;
  };

  if (!activeConversation) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Select or create a conversation to begin chatting.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-4 mb-4 min-h-0 p-4">
        {activeConversation.messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${
              message.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            <div className={`max-w-[80%] ${
              message.role === 'user' ? 'bg-accent text-primary-foreground' : 'bg-muted'
            } rounded-lg px-4 py-2`}>
              {renderMessage(message, index)}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="flex gap-2 p-4 border-t">
        <Textarea
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          placeholder="Type your message... (Markdown supported)"
          onKeyPress={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !isLoading) {
              e.preventDefault();
              handleSendMessage();
            }
          }}
          className="flex-1 resize-none"
          rows={3}
          disabled={isLoading}
        />
        <Button
          onClick={handleSendMessage}
          disabled={isLoading || !activeProjectId || !activeConversationId}
          className="self-end"
        >
          {isLoading ? <Spinner /> : <Send className="w-4 h-4" />}
        </Button>
      </div>

      {selectedToolCall && (
        <ToolCallModal
          toolCall={selectedToolCall}
          onClose={() => setSelectedToolCall(null)}
        />
      )}
    </div>
  );
};
