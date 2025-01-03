"use client";

import { PlusCircle, Download, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { useState } from 'react';
import { Conversation } from './types';

interface ConversationSidebarProps {
  conversations: Conversation[];
  activeConvoId: string;
  onNewConversation: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string | string[]) => void;
  onExportConversation: (id?: string) => void;
}

export const ConversationSidebar = ({
  conversations,
  activeConvoId,
  onNewConversation,
  onSelectConversation,
  onDeleteConversation,
  onExportConversation
}: ConversationSidebarProps) => {
  const [selectedConvos, setSelectedConvos] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleDeleteSelected = () => {
    // Convert Set to Array and delete all at once
    onDeleteConversation(Array.from(selectedConvos));
    setSelectedConvos(new Set());
    setShowDeleteConfirm(false);
  };

  return (
    <div className="w-64 border-r p-4 flex flex-col h-full">
      {/* Top buttons */}
      <div className="flex gap-2 mb-4">
        <Button
          onClick={onNewConversation}
          className="flex-1"
          variant="outline"
        >
          <PlusCircle className="w-4 h-4 mr-2" />
          New Chat
        </Button>
        <Button
          onClick={() => onExportConversation()}
          variant="outline"
        >
          <Download className="w-4 h-4" />
        </Button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {conversations.map(convo => (
          <div
            key={convo.id}
            className={`p-2 rounded-lg mb-2 cursor-pointer flex items-center gap-2 transition-colors
              ${convo.id === activeConvoId
                ? 'bg-accent text-accent-foreground'
                : 'hover:bg-muted'}
              ${selectedConvos.has(convo.id) ? 'ring-2 ring-acct' : ''}`}
              onClick={() => onSelectConversation(convo.id)}
          >
            <input
              type="checkbox"
              checked={selectedConvos.has(convo.id)}
              onChange={(e) => {
                const newSelected = new Set(selectedConvos);
                if (e.target.checked) {
                  newSelected.add(convo.id);
                } else {
                  newSelected.delete(convo.id);
                }
                setSelectedConvos(newSelected);
              }}
              onClick={(e) => e.stopPropagation()}
              className="rounded"
            />
            <span className="truncate flex-1">
              {convo.name}
            </span>
          </div>
        ))}
      </div>

      {/* Delete button at bottom */}
      {selectedConvos.size > 0 && (
        <Button
          onClick={() => setShowDeleteConfirm(true)}
          variant="outline"
          className="mt-4 w-full border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
        >
          Delete Selected ({selectedConvos.size})
        </Button>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Selected Conversations</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedConvos.size} conversations? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowDeleteConfirm(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSelected}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
