import React from 'react';
// import SessionRestoreButton from './SessionRestoreButton'; // Temporarily disabled
import { CurrentBranchChip } from '@/components/ui/current-branch-chip';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface ChatHeaderProps {
  // Currently no props needed, but keeping interface for future extensibility
}

export const ChatHeader: React.FC<ChatHeaderProps> = () => {
  
  return (
    <div className="flex justify-end items-center p-2 bg-background/90 backdrop-blur-sm">
      <div className="flex items-center space-x-2">
{/* SessionRestoreButton temporarily removed - using per-message revert instead */}
        <CurrentBranchChip />
      </div>
      

    </div>
  );
}; 