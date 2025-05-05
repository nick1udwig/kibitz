import * as React from "react"

import { cn } from "@/lib/utils"

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  maxRows?: number;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, maxRows = 8, onChange, ...props }, ref) => {
    const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
    const hiddenTextareaRef = React.useRef<HTMLDivElement | null>(null);

    // Create a hidden div for measuring text height without causing visual bounce
    React.useEffect(() => {
      if (!hiddenTextareaRef.current) {
        const hiddenDiv = document.createElement('div');
        hiddenDiv.style.position = 'absolute';
        hiddenDiv.style.visibility = 'hidden';
        hiddenDiv.style.height = 'auto';
        hiddenDiv.style.width = textareaRef.current?.offsetWidth + 'px' || '100%';
        hiddenDiv.style.fontSize = '12px'; // Match textarea font size
        hiddenDiv.style.lineHeight = '1em';
        hiddenDiv.style.padding = '8px 12px'; // Match textarea padding
        hiddenDiv.style.boxSizing = 'border-box';
        hiddenDiv.style.whiteSpace = 'pre-wrap';
        hiddenDiv.style.overflowWrap = 'break-word';
        document.body.appendChild(hiddenDiv);
        hiddenTextareaRef.current = hiddenDiv;
      }
      
      return () => {
        if (hiddenTextareaRef.current) {
          document.body.removeChild(hiddenTextareaRef.current);
        }
      };
    }, []);

    const handleChange = React.useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const textarea = textareaRef.current;
      const hiddenDiv = hiddenTextareaRef.current;
      
      if (textarea && hiddenDiv) {
        // Update hidden div content to match textarea
        hiddenDiv.style.width = textarea.offsetWidth + 'px';
        hiddenDiv.textContent = event.target.value || ' '; // Ensure at least one character
        
        // Calculate required height without modifying the actual textarea
        const requiredHeight = Math.min(
          hiddenDiv.scrollHeight,
          maxRows * parseInt(getComputedStyle(textarea).lineHeight || '16')
        );
        
        // Only update height if it's different to avoid unnecessary reflows
        if (Math.abs(parseInt(textarea.style.height || '0') - requiredHeight) > 1) {
          textarea.style.height = `${Math.max(requiredHeight, 40)}px`; // Ensure minimum height
        }
      }
      
      onChange?.(event);
    }, [maxRows, onChange]);

    // Set initial height
    React.useEffect(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = '2.5em';
        textareaRef.current.style.lineHeight = '1em';
      }
    }, []);

    return (
      <textarea
        className={cn(
          "flex min-h-[2.5em] w-full rounded-md border border-input bg-transparent px-3 py-2 text-[12px] ring-offset-background placeholder:text-muted-foreground placeholder:text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 overflow-y-auto resize-none",
          className
        )}
        ref={(element) => {
          textareaRef.current = element;
          if (typeof ref === 'function') {
            ref(element);
          } else if (ref) {
            ref.current = element;
          }
        }}
        onChange={handleChange}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
