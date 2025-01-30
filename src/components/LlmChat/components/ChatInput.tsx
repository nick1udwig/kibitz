import React, { useRef } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { FileUpload } from '../FileUpload';
import { VoiceRecorder } from '../VoiceRecorder';
import { Button } from '@/components/ui/button';
import { Send, Square } from 'lucide-react';
import { MessageContent } from '../types';
import { Switch } from '@/components/ui/switch';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop?: () => void;
  isLoading: boolean;
  isDisabled: boolean;
  onFileSelect: (content: MessageContent) => void;
  placeholder?: string;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  value,
  onChange,
  onSend,
  onStop,
  isLoading,
  isDisabled,
  onFileSelect,
  placeholder = "Type your message"
}) => {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Reset height when loading starts
  React.useEffect(() => {
    if (isLoading && inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  }, [isLoading]);

  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Textarea
          value={isLoading ? "Processing..." : value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          readOnly={isLoading}
          onKeyDown={(e) => {
            // Only send on Enter in desktop mode
            const isMobile = window.matchMedia('(max-width: 768px)').matches;
            if (e.key === 'Enter' && !e.shiftKey && !isLoading && !isMobile) {
              e.preventDefault();
              onSend();
            }
          }}
          ref={inputRef}
          className={`pr-20 transition-colors text-xs ${isLoading ? 'bg-muted text-muted-foreground resize-none' : ''}`}
          maxRows={8}
          disabled={isDisabled || isLoading}
        />
        <div className="absolute right-2 bottom-2 flex gap-1">
          <div className="flex items-center gap-3">
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
      </div>
      <Button
        onClick={isLoading ? onStop : onSend}
        disabled={isDisabled || (isLoading && !onStop)}
        className={`self-end relative ${isLoading ? 'bg-destructive hover:bg-destructive/90' : ''}`}
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
