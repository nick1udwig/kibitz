"use client";

import React, { useEffect, useState, useRef } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import ReactMarkdown from 'react-markdown';
import { Message } from './types';
import { Spinner } from '@/components/ui/spinner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ChatViewProps {
  messages: Message[];
  inputMessage: string;
  onInputChange: (value: string) => void;
  onSendMessage: () => void;
  isLoading: boolean;
}

export const ChatView: React.FC<ChatViewProps> = ({
  messages,
  inputMessage,
  onInputChange,
  onSendMessage,
  isLoading
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevMessagesLength = useRef(messages.length);
  const [selectedToolCall, setSelectedToolCall] = useState<{
    name: string;
    input: any;
    result: string;
  } | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    // Only scroll to bottom if new messages are added
    if (messages.length > prevMessagesLength.current) {
      scrollToBottom();
    }
    prevMessagesLength.current = messages.length;
  }, [messages]);

  const renderMessage = (message: Message, index: number) => {
    // Handle array of message content (from Anthropic API)
    if (Array.isArray(message.content)) {
      return message.content.map((content, contentIndex) => {
        if (content.type === 'tool_use') {
          // Find corresponding tool result in next message
          const nextMessage = messages[index + 1];
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
              onClick={(e) => {
                e.preventDefault();
                setSelectedToolCall({
                  name: content.name,
                  input: content.input,
                  result: toolResult
                });
              }}
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
    }

    if (typeof message.content === 'string') {
      if (message.content.startsWith('Calling tool:')) {
        const toolName = message.content.replace('Calling tool:', '').trim();
        const nextMessage = messages[index + 1];
        const toolResult = nextMessage && typeof nextMessage.content === 'string'
          ? nextMessage.content
          : '';

        return (
          <button
            onClick={(e) => {
              e.preventDefault();
              setSelectedToolCall({
                name: toolName,
                input: message.toolInput || {},
                result: toolResult
              });
            }}
            className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline"
          >
            {message.content}
          </button>
        );
      }
      return (
        <ReactMarkdown className="prose dark:prose-invert max-w-none">
          {message.content}
        </ReactMarkdown>
      );
    }
    return null;
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-4 mb-4 min-h-0">
        {messages.map((message, index) => (
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

      <div className="flex gap-2 mt-auto">
        <Textarea
          value={inputMessage}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder="Type your message... (Markdown supported)"
          onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && !isLoading && onSendMessage()}
          className="flex-1 resize-none"
          rows={3}
          disabled={isLoading}
        />
        <Button
          onClick={onSendMessage}
          disabled={isLoading}
          className="self-end"
        >
          {isLoading ? <Spinner /> : <Send className="w-4 h-4" />}
        </Button>
      </div>

      {selectedToolCall && (
        <Dialog open={true} onOpenChange={() => setSelectedToolCall(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Tool Call: {selectedToolCall.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Input:</h4>
                <pre className="bg-muted p-4 rounded-md overflow-x-auto">
                  {JSON.stringify(selectedToolCall.input, null, 2)}
                </pre>
              </div>
              <div>
                <h4 className="font-medium mb-2">Result:</h4>
                <pre className="bg-muted p-4 rounded-md overflow-x-auto">
                  {selectedToolCall.result}
                </pre>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};
