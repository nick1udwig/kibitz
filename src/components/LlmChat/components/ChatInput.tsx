import React, { useRef } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { FileUpload } from '../FileUpload';
import { VoiceRecorder } from '../VoiceRecorder';
import { Button } from '@/components/ui/button';
import { Send, Square } from 'lucide-react';
import { MessageContent } from '../types';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  isLoading: boolean;
  isDisabled: boolean;
  onFileSelect: (content: MessageContent) => void;
  placeholder?: string;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  value,
  onChange,
  onSend,
  isLoading,
  isDisabled,
  onFileSelect,
  placeholder = "Type your message"
}) => {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => {
            // Only send on Enter in desktop mode
            const isMobile = window.matchMedia('(max-width: 768px)').matches;
            if (e.key === 'Enter' && !e.shiftKey && !isLoading && !isMobile) {
              e.preventDefault();
              onSend();
            }
          }}
          ref={inputRef}
          className="pr-20"
          maxRows={8}
          disabled={isDisabled || isLoading}
        />
        <div className="absolute right-2 bottom-2 flex gap-1">
          <FileUpload
            onFileSelect={onFileSelect}
            onUploadComplete={() => {
              if (inputRef.current) {
                inputRef.current.focus();
              }
            }}
          />
          <VoiceRecorder
            onTranscriptionComplete={(text) => {
              const newText = value.trim() ? `${value}\n${text}` : text;
              onChange(newText);
            }}
          />
        </div>
      </div>
      <Button
        onClick={onSend}
        disabled={isDisabled}
        className="self-end relative"
      >
        {isLoading ? (
          <Square className="w-4 h-4" />
        ) : (
          <Send className="w-4 h-4" />
        )}
      </Button>
    </div>
  );
};