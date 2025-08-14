import React from 'react';
// import SessionRestoreButton from './SessionRestoreButton'; // Temporarily disabled

interface ChatHeaderProps {
  projectId: string;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({ projectId }) => {
  
  return (
    <div className="flex justify-end items-center p-2 bg-background/90 backdrop-blur-sm">
      <div className="flex items-center space-x-2">
{/* SessionRestoreButton temporarily removed - using per-message revert instead */}
      </div>
      

    </div>
  );
}; 