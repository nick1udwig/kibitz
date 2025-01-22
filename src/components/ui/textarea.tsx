import * as React from "react"

import { cn } from "@/lib/utils"

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  maxRows?: number;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, maxRows = 8, onChange, ...props }, ref) => {
    const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

    const handleChange = React.useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.style.height = '2.5em';

        if (textarea.scrollHeight > textarea.clientHeight) {
          const newHeight = Math.min(
            textarea.scrollHeight,
            maxRows * parseInt(getComputedStyle(textarea).lineHeight)
          );
          textarea.style.height = `${newHeight}px`;
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
          "flex h-[2.5em] w-full rounded-md border border-input bg-transparent px-3 py-2 text-[16px] ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 overflow-y-auto resize-none transition-height duration-150",
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
