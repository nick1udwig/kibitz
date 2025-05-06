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

  // Set up a MutationObserver to monitor content changes
  React.useEffect(() => {
    if (!inputRef.current) return;

    // Helper function to adjust height directly
    const adjustHeight = (element: HTMLTextAreaElement) => {
      // Reset height first for accurate measurement
      element.style.height = 'auto';
      // Set height based on scroll height but respect max-height
      const maxHeight = parseInt(window.getComputedStyle(element).maxHeight || '150px', 10);
      element.style.height = `${Math.min(element.scrollHeight + 5, maxHeight)}px`;
      // Enable scrolling if content exceeds max height
      element.style.overflowY = element.scrollHeight > maxHeight ? 'auto' : 'hidden';
    };

    // Handle value changes
    const handleValueChange = () => {
      if (inputRef.current) {
        requestAnimationFrame(() => {
          adjustHeight(inputRef.current!);
        });
      }
    };

    // Set up mutation observer to detect content changes
    const observer = new MutationObserver((mutations) => {
      handleValueChange();
    });

    // Observe the textarea for attribute changes
    observer.observe(inputRef.current, { 
      attributes: true, 
      childList: false, 
      subtree: false,
      characterData: true,
      attributeFilter: ['value'] 
    });

    // Initial adjustment
    handleValueChange();

    // Clean up
    return () => {
      observer.disconnect();
    };
  }, []);

  // Also update on value changes from props
  React.useEffect(() => {
    if (inputRef.current) {
      // Reset height first
      inputRef.current.style.height = 'auto';
      // Get max height from CSS
      const maxHeight = parseInt(window.getComputedStyle(inputRef.current).maxHeight || '150px', 10);
      // Set height based on scroll height but respect max height
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight + 5, maxHeight)}px`;
      // Enable scrolling if needed
      inputRef.current.style.overflowY = inputRef.current.scrollHeight > maxHeight ? 'auto' : 'hidden';
    }
  }, [value]);

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
      
      // DIRECT APPROACH: Force the textarea to expand after improve prompt
      setTimeout(() => {
        if (inputRef.current) {
          // First reset height to ensure proper calculation
          inputRef.current.style.height = 'auto';
          
          // Get the maximum height from CSS
          const maxHeight = parseInt(window.getComputedStyle(inputRef.current).maxHeight || '150px', 10);
          
          // Then set height based on scrollHeight but respect max height
          inputRef.current.style.height = Math.min(inputRef.current.scrollHeight + 5, maxHeight) + 'px';
          
          // Enable scrolling if needed
          inputRef.current.style.overflowY = inputRef.current.scrollHeight > maxHeight ? 'auto' : 'hidden';
          
          console.log('Applied direct height:', inputRef.current.style.height);
          
          // Trigger additional adjustments after react updates
          setTimeout(() => {
            if (inputRef.current) {
              inputRef.current.style.height = Math.min(inputRef.current.scrollHeight + 5, maxHeight) + 'px';
              inputRef.current.style.overflowY = inputRef.current.scrollHeight > maxHeight ? 'auto' : 'hidden';
              console.log('Applied secondary height:', inputRef.current.style.height);
            }
          }, 100);
        }
      }, 10);
      
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
            // No need for manual height adjustment, handled by Textarea component
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
          className={`pr-20 transition-colors max-h-[150px] overflow-y-auto ${isLoading ? 'bg-muted text-muted-foreground resize-none' : ''}`}
          maxRows={8} // Reduced to limit vertical expansion
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
