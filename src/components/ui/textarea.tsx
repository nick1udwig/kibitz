import * as React from "react"

import { cn } from "@/lib/utils"

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  maxRows?: number;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, maxRows = 8, onChange, ...props }, ref) => {
    const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
    
    // Directly handle height adjustments without using a hidden div
    const adjustHeight = React.useCallback((element: HTMLTextAreaElement) => {
      // Reset height to get correct scrollHeight
      element.style.height = 'auto';
      
      // Get calculated scrollHeight and cap it if needed
      const lineHeight = parseInt(getComputedStyle(element).lineHeight || '16');
      const maxHeight = maxRows * lineHeight;
      
      // Get the computed max-height from CSS (if any)
      const computedStyle = window.getComputedStyle(element);
      const cssMaxHeight = computedStyle.maxHeight;
      const effectiveMaxHeight = cssMaxHeight !== 'none' && cssMaxHeight !== 'auto' ? 
        parseInt(cssMaxHeight, 10) : maxHeight;
      
      // Set new height with extra buffer to prevent scrolling
      const newHeight = Math.min(element.scrollHeight + 5, effectiveMaxHeight);
      element.style.height = `${Math.max(newHeight, 40)}px`;
      
      // Show scrollbars if content exceeds the max height
      if (element.scrollHeight > effectiveMaxHeight) {
        element.style.overflowY = 'auto';
      } else {
        element.style.overflowY = 'hidden';
      }
    }, [maxRows]);

    // Handle direct input changes
    const handleChange = React.useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (textareaRef.current) {
        adjustHeight(textareaRef.current);
      }
      onChange?.(event);
    }, [adjustHeight, onChange]);

    // Set initial height and watch for content changes
    React.useEffect(() => {
      if (textareaRef.current) {
        // Set minimum height initially
        textareaRef.current.style.height = '2.5em';
        adjustHeight(textareaRef.current);
        
        // Use ResizeObserver to detect size changes
        const resizeObserver = new ResizeObserver(() => {
          if (textareaRef.current) {
            adjustHeight(textareaRef.current);
          }
        });
        
        resizeObserver.observe(textareaRef.current);
        
        // Clean up
        return () => {
          resizeObserver.disconnect();
        };
      }
    }, [adjustHeight]);
    
    // Update height when value changes from outside
    React.useEffect(() => {
      if (textareaRef.current) {
        // Adjust height for external value changes (with delay to ensure DOM is updated)
        requestAnimationFrame(() => {
          if (textareaRef.current) {
            adjustHeight(textareaRef.current);
            
            // Double-check after a short delay to catch any render issues
            setTimeout(() => {
              if (textareaRef.current) {
                adjustHeight(textareaRef.current);
              }
            }, 50);
          }
        });
      }
    }, [props.value, adjustHeight]);

    return (
      <textarea
        className={cn(
          "flex min-h-[2.5em] w-full rounded-md border border-input bg-transparent px-3 py-2 text-[12px] ring-offset-background placeholder:text-muted-foreground placeholder:text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 overflow-y-hidden resize-none",
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
        onInput={() => {
          // Also handle input events for immediate feedback during typing
          if (textareaRef.current) {
            adjustHeight(textareaRef.current);
          }
        }}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
