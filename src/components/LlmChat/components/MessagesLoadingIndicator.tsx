import React from 'react';
import { Spinner } from '@/components/ui/spinner';

interface MessagesLoadingIndicatorProps {
  visible: boolean;
}

export const MessagesLoadingIndicator: React.FC<MessagesLoadingIndicatorProps> = ({ 
  visible 
}) => {
  if (!visible) return null;

  return (
    <div className="flex justify-center py-2 opacity-90 transition-opacity duration-300">
      <div className="flex items-center space-x-2 text-muted-foreground text-xs">
        <div className="h-3 w-3">
          <Spinner />
        </div>
        <span>Loading older messages...</span>
      </div>
    </div>
  );
}; 