import React from 'react';
import { cn } from '@/lib/utils';

type VisuallyHiddenProps = React.HTMLAttributes<HTMLSpanElement>;

const VisuallyHidden = React.forwardRef<HTMLSpanElement, VisuallyHiddenProps>(
  ({ className, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          'absolute h-px w-px p-0 -m-px overflow-hidden whitespace-nowrap border-0',
          // This ensures the element is hidden visually but still accessible to screen readers
          '[clip:rect(0,0,0,0)]',
          className
        )}
        {...props}
      />
    );
  }
);

VisuallyHidden.displayName = 'VisuallyHidden';

export { VisuallyHidden };