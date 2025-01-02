"use client";

import { PlusCircle, Download, FolderDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Conversation } from './types';

interface ConversationSidebarProps {
  conversations: Conversation[];
  activeConvoId: string;
  onNewConversation: () => void;
  onSelectConversation: (id: string) => void;
  onExportConversation: (id?: string) => void;
}

export const ConversationSidebar = ({
  conversations,
  activeConvoId,
  onNewConversation,
  onSelectConversation,
  onExportConversation
}: ConversationSidebarProps) => {
  return (
    <div className="w-64 border-r p-4 flex flex-col">
      <Button
        onClick={onNewConversation}
        className="mb-4 w-full"
        variant="outline"
      >
        <PlusCircle className="w-4 h-4 mr-2" />
        New Chat
      </Button>

      <div className="flex-1 overflow-y-auto">
        {conversations.map(convo => (
          <div
            key={convo.id}
            className={`p-2 rounded-lg mb-2 cursor-pointer flex justify-between items-center ${
              convo.id === activeConvoId ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
            }`}
            onClick={() => onSelectConversation(convo.id)}
          >
            <span className="truncate">{convo.name}</span>
            <Button
              size="icon"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                onExportConversation(convo.id);
              }}
            >
              <Download className="w-4 h-4" />
            </Button>
          </div>
        ))}
      </div>

      <Button
        onClick={() => onExportConversation()}
        className="mt-4"
        variant="outline"
      >
        <FolderDown className="w-4 h-4 mr-2" />
        Export All
      </Button>
    </div>
  );
};
