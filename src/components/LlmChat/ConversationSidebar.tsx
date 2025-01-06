"use client";

import { PlusCircle, Download, Trash2, ChevronDown, ChevronRight, FolderPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { useState } from 'react';
import { useProjects } from './context/ProjectContext';


interface ConversationSidebarProps {
  onExportConversation: (projectId: string, conversationId?: string) => void;
}

export const ConversationSidebar = ({ onExportConversation }: ConversationSidebarProps) => {
  const {
    projects,
    activeProjectId,
    activeConversationId,
    createProject,
    deleteProject,
    createConversation,
    deleteConversation,
    setActiveProject,
    setActiveConversation
  } = useProjects();


  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set([activeProjectId!]));
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ type: 'project' | 'conversation', projectId: string, conversationId?: string } | null>(null);

  const toggleProjectExpanded = (projectId: string) => {
    const newExpanded = new Set(expandedProjects);
    if (newExpanded.has(projectId)) {
      newExpanded.delete(projectId);
    } else {
      newExpanded.add(projectId);
    }
    setExpandedProjects(newExpanded);
  };

  const handleDelete = () => {
    if (!itemToDelete) return;

    if (itemToDelete.type === 'project') {
      deleteProject(itemToDelete.projectId);
    } else if (itemToDelete.conversationId) {
      deleteConversation(itemToDelete.projectId, itemToDelete.conversationId);
    }
    setShowDeleteConfirm(false);
    setItemToDelete(null);
  };

  return (
    <div className="w-64 border-r p-4 flex flex-col h-full">
      {/* Top buttons */}
      <div className="flex gap-2 mb-4">
        <Button
          onClick={() => createProject('New Project')}
          className="flex-1"
          variant="outline"
        >
          <FolderPlus className="w-4 h-4 mr-2" />
          New Project
        </Button>
        <Button
          onClick={() => activeProjectId && onExportConversation(activeProjectId)}
          variant="outline"
          disabled={!activeProjectId}
        >
          <Download className="w-4 h-4" />
        </Button>
      </div>

      {/* Projects and Conversations list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {projects.map(project => (
          <div key={project.id} className="mb-2">
            {/* Project header */}
            <div
              className={`p-2 rounded-lg cursor-pointer flex items-center gap-2 transition-colors
                ${project.id === activeProjectId ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'}`}
              onClick={() => {
                setActiveProject(project.id);
                toggleProjectExpanded(project.id);
              }}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleProjectExpanded(project.id);
                }}
                className="p-1 hover:bg-muted-foreground/10 rounded"
              >
                {expandedProjects.has(project.id) ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>
              <span className="truncate flex-1">{project.name}</span>
              <Button
                variant="ghost"
                size="sm"
                className="p-1 h-6 w-6"
                onClick={(e) => {
                  e.stopPropagation();
                  setItemToDelete({ type: 'project', projectId: project.id });
                  setShowDeleteConfirm(true);
                }}
              >
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>

            {/* Conversations under project */}
            {expandedProjects.has(project.id) && (
              <div className="ml-6 mt-1 space-y-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => createConversation(project.id)}
                >
                  <PlusCircle className="w-4 h-4 mr-2" />
                  New Chat
                </Button>
                {project.conversations.map(convo => (
                  <div
                    key={convo.id}
                    className={`p-2 rounded-lg cursor-pointer flex items-center gap-2 transition-colors
                      ${convo.id === activeConversationId ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'}`}
                    onClick={() => {
                      setActiveProject(project.id);
                      setActiveConversation(convo.id);
                      const tabsList = document.querySelector('[role="tablist"]');
                      const chatTab = tabsList?.querySelector('[value="chat"]') as HTMLButtonElement;
                      if (chatTab) {
                        chatTab.click();
                      }
                    }}
                  >
                    <span className="truncate flex-1">{convo.name}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="p-1 h-6 w-6"
                      onClick={(e) => {
                        e.stopPropagation();
                        setItemToDelete({
                          type: 'conversation',
                          projectId: project.id,
                          conversationId: convo.id
                        });
                        setShowDeleteConfirm(true);
                      }}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {itemToDelete?.type === 'project' ? 'Project' : 'Conversation'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this {itemToDelete?.type}? This action cannot be undone.
              {itemToDelete?.type === 'project' && ' All conversations in this project will be deleted.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowDeleteConfirm(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
