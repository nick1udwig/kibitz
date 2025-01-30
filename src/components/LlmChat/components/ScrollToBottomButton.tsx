import React from 'react';
import { ChevronDown } from 'lucide-react';

interface ScrollToBottomButtonProps {
  onClick: () => void;
  visible: boolean;
}

export const ScrollToBottomButton: React.FC<ScrollToBottomButtonProps> = ({
  onClick,
  visible
}) => {
  if (!visible) return null;

  return (
    <button
      onClick={onClick}
      className="fixed bottom-[60px] right-2 md:right-8 z-[100] bg-primary/70 text-primary-foreground rounded-full p-3 shadow-lg hover:bg-primary/90 transition-all hover:scale-110 animate-in fade-in slide-in-from-right-2"
      aria-label="Scroll to bottom"
    >
      <ChevronDown className="w-6 h-6" />
    </button>
  );
};