import React, { useRef, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { FileUpload } from '../FileUpload';
import { VoiceRecorder } from '../VoiceRecorder';
import { Button } from '@/components/ui/button';
import { Send, Square, Sparkles } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { MessageContent } from '../types';
import { enhancePrompt } from '../utils/promptEnhancer';
import type { LegacyProviderType } from '../types/provider';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop?: () => void;
  isLoading: boolean;
  isDisabled: boolean;
  onFileSelect: (content: MessageContent) => void;
  placeholder?: string;
  provider?: LegacyProviderType;
  apiKey?: string;
  model?: string;
  showError?: (message: string) => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  value,
  onChange,
  onSend,
  onStop,
  isLoading,
  isDisabled,
  onFileSelect,
  placeholder = "Type your message",
  provider,
  apiKey,
  model,
  showError,
}) => {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [isImproving, setIsImproving] = useState(false);
  const [hasUsedImprovePrompt, setHasUsedImprovePrompt] = useState(false);

  // Reset height when loading starts
  React.useEffect(() => {
    if (isLoading && inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  }, [isLoading]);

  // Function to manually adjust the height of the textarea
  const adjustTextareaHeight = React.useCallback(() => {
    if (!inputRef.current) return;
    
    // Reset height first to get accurate scrollHeight
    inputRef.current.style.height = 'auto';
    
    // Set height based on content - limit to maxRows (defined below as 12)
    const lineHeight = parseInt(getComputedStyle(inputRef.current).lineHeight);
    const maxHeight = 12 * (isNaN(lineHeight) ? 20 : lineHeight); // Default to 20px if lineHeight can't be parsed
    
    inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, maxHeight)}px`;
  }, []);

  // Function to handle prompt improvement
  const handleImprovePrompt = async () => {
    // Add specific checks
    if (!provider || !model) {
      // This case should ideally not happen if defaults are set, but check anyway
      showError?.('Cannot improve prompt. Provider or model configuration is missing. Please check settings.');
      return;
    }
    if (!value.trim()) {
      showError?.('Cannot improve an empty prompt.');
      return;
    }
    if (!apiKey) {
      // This is the most likely issue for new chats using defaults
      showError?.(`Cannot improve prompt. API Key for the selected provider ('${provider}') is missing. Please add it in Settings.`);
      return;
    }
    // Check if provider is supported
    if (provider !== 'openai' && provider !== 'anthropic' && provider !== 'openrouter') {
      showError?.(`Prompt improvement is not supported for the '${provider}' provider yet.`);
      return;
    }

    // Call the enhance prompt function
    setIsImproving(true);
    try {
      const improvedPrompt = await enhancePrompt(value, provider, apiKey, model);
      onChange(improvedPrompt);
      
      // Give the DOM a moment to update with the new text, then adjust height
      setTimeout(() => {
        adjustTextareaHeight();
      }, 50);
      
      // Mark that improve prompt has been used once
      setHasUsedImprovePrompt(true);
    } catch (error) {
      console.error("Improve prompt error:", error);
      showError?.(error instanceof Error ? error.message : 'An unknown error occurred while improving the prompt.');
    } finally {
      setIsImproving(false);
    }
  };

  return (
    <div className="flex gap-2 items-end">
      <div className="relative flex-1">
        <Textarea
          value={isLoading ? "Processing..." : value}
          onChange={(e) => {
            onChange(e.target.value);
            // Auto-adjust height on manual typing too
            setTimeout(adjustTextareaHeight, 0);
          }}
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
          className={`pr-20 transition-colors ${isLoading ? 'bg-muted text-muted-foreground resize-none' : ''}`}
          maxRows={12} // Increased from 8 to 12 to show more content
          disabled={isDisabled || isLoading}
        />
        <div className="absolute right-2 bottom-2 flex gap-1 items-center">
          {/* Improve Prompt Button - Only show if it hasn't been used yet */}
          {!hasUsedImprovePrompt && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleImprovePrompt}
              disabled={isLoading || isImproving || !value.trim()}
              className="w-8 h-8 p-1 text-muted-foreground hover:text-foreground"
              title="Improve prompt"
            >
              {isImproving ? <Spinner /> : <Sparkles className="w-4 h-4" />}
            </Button>
          )}
          {/* Existing icons container */}
          <div className="flex items-center gap-1">
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
