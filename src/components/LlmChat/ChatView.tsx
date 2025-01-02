"use client";

import React, { useEffect } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import ReactMarkdown from 'react-markdown';
import { Message } from './types';

interface ChatViewProps {
  messages: Message[];
  inputMessage: string;
  onInputChange: (value: string) => void;
  onSendMessage: () => void;
  isLoading: boolean;
}

export const ChatView = ({
  messages,
  inputMessage,
  onInputChange,
  onSendMessage,
  isLoading
}: ChatViewProps) => {
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <div className="flex flex-col h-[600px]">
      <div className="flex-1 overflow-y-auto space-y-4 mb-4">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${
              message.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            <div className={`max-w-[80%] ${
              message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
            } rounded-lg px-4 py-2`}>
              {typeof message.content === 'string' ? (
                <ReactMarkdown className="prose dark:prose-invert max-w-none">
                  {message.content}
                </ReactMarkdown>
              ) : (
                message.content.map((content, i) => (
                  <ReactMarkdown key={i} className="prose dark:prose-invert max-w-none">
                    {content.text}
                  </ReactMarkdown>
                ))
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="flex gap-2 mt-auto">
        <Textarea
          value={inputMessage}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder="Type your message... (Markdown supported)"
          onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && !isLoading && onSendMessage()}
          className="flex-1 min-h-[60px]"
          disabled={isLoading}
        />
        <Button
          onClick={onSendMessage}
          disabled={isLoading}
          className="self-end"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};
