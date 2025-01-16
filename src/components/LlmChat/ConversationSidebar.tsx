"use client";

import { PlusCircle, Download, Trash2, ChevronDown, ChevronRight, FolderPlus, Menu, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useState, useEffect } from 'react';
import { useProjects } from './context/ProjectContext';

interface ConversationSidebarProps {
  onExportConversation: (projectId: string, conversationId?: string) => void;
  isMobileMenuOpen?: boolean;
  onMobileMenuToggle?: () => void;
  onConversationSelect?: () => void;
}

export const ConversationSidebar = ({
  onExportConversation,
  isMobileMenuOpen = true,
  onMobileMenuToggle,
  onConversationSelect
}: ConversationSidebarProps) => {
  const {
    projects,
    activeProjectId,
    activeConversationId,
    createProject,
    deleteProject,
    createConversation,
    deleteConversation,
    renameConversation,
    renameProject,
    setActiveProject,
    setActiveConversation
  } = useProjects();

  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Ensure active project is always expanded
  useEffect(() => {
    if (activeProjectId) {
      setExpandedProjects(prev => {
        const newExpanded = new Set(prev);
        newExpanded.add(activeProjectId);
        return newExpanded;
      });
    }
  }, [activeProjectId]);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ type: 'project' | 'conversation', projectId: string, conversationId?: string } | null>(null);
  const [renameItem, setRenameItem] = useState<{ type: 'project' | 'conversation', projectId: string, conversationId?: string, currentName: string } | null>(null);
  const [newName, setNewName] = useState('');

  const toggleProjectExpanded = (projectId: string) => {
    setExpandedProjects(prev => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(projectId)) {
        newExpanded.delete(projectId);
      } else {
        newExpanded.add(projectId);
      }
      return newExpanded;
    });
  };

  const handleProjectSelect = (projectId: string, shouldCreateChat: boolean = false) => {
    setActiveProject(projectId);
    if (shouldCreateChat && projects.find(p => p.id === projectId)?.conversations.length === 0) {
      createConversation(projectId);
    }
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

  // Sort projects by order
  const sortedProjects = [...projects].sort((a, b) => (a.order || 0) - (b.order || 0));

  return (
    <>
      {/* Floating Mobile Menu Toggle */}
      <Button
        variant="secondary"
        size="icon"
        className="fixed left-4 top-4 z-[100] md:hidden rounded-full shadow-lg hover:shadow-xl bg-background"
        onClick={onMobileMenuToggle}
        aria-label="Toggle mobile menu"
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 
        md:sticky md:top-0 md:left-auto
        w-[280px] max-w-[85vw]
        bg-background border-r 
        transition-transform duration-200 ease-in-out
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
        md:translate-x-0
        z-40 
        flex flex-col
        h-screen
      `}>
        {/* Top buttons */}
        <div className="flex gap-2 mb-2 p-4 pt-16 md:pt-4">
          <Button
            onClick={() => {
              createProject('New Project');
              // First conversation will be created automatically by ChatView
            }}
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
        <div className="flex-1 overflow-y-auto min-h-0 px-4">
          {sortedProjects.map(project => (
            <div key={project.id} className="mb-2">
              {/* Project header */}
              <div
                className={`p-2 rounded-lg cursor-pointer flex items-center gap-2 transition-colors
                ${project.id === activeProjectId ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'}
                text-sm`}
                onClick={() => handleProjectSelect(project.id, true)}
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
                    setRenameItem({
                      type: 'project',
                      projectId: project.id,
                      currentName: project.name
                    });
                    setNewName(project.name);
                    setShowRenameDialog(true);
                  }}
                >
                  <Pencil className="w-4 h-4" />
                </Button>
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
                <div className="ml-4 mt-1 space-y-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => createConversation(project.id)}
                  >
                    <PlusCircle className="w-4 h-4 mr-2" />
                    New Chat
                  </Button>
                  {project.conversations
                    .sort((a, b) => {
                      // Convert dates to timestamps, handling various formats
                      const getTimestamp = (date: Date | string | undefined): number => {
                        if (!date) return Date.now();
                        if (date instanceof Date) return date.getTime();
                        return new Date(date).getTime();
                      };

                      const timestampA = getTimestamp(a.createdAt || a.lastUpdated);
                      const timestampB = getTimestamp(b.createdAt || b.lastUpdated);
                      return timestampB - timestampA;
                    })
                    .map(convo => (
                      <div
                        key={convo.id}
                        className={`p-2 rounded-lg cursor-pointer flex items-center gap-2 transition-colors
                      ${convo.id === activeConversationId ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'}
                      text-sm truncate max-w-[250px]`}
                        onClick={() => {
                          handleProjectSelect(project.id);
                          setActiveConversation(convo.id);
                          onConversationSelect?.();
                        }}
                      >
                        <span className="truncate flex-1" title={convo.name}>{convo.name}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="p-1 h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenameItem({
                              type: 'conversation',
                              projectId: project.id,
                              conversationId: convo.id,
                              currentName: convo.name
                            });
                            setNewName(convo.name);
                            setShowRenameDialog(true);
                          }}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
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
              <AlertDialogAction onClick={handleDelete} className="bg-primary" autoFocus>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Rename dialog */}
        <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
          <DialogContent>
            <form onSubmit={(e) => {
              e.preventDefault();
              if (renameItem && newName.trim()) {
                if (renameItem.type === 'project') {
                  renameProject(renameItem.projectId, newName.trim());
                } else if (renameItem.conversationId) {
                  renameConversation(renameItem.projectId, renameItem.conversationId, newName.trim());
                }
                setShowRenameDialog(false);
                setRenameItem(null);
                setNewName('');
              }
            }}>
              <DialogHeader>
                <DialogTitle>Rename {renameItem?.type === 'project' ? 'Project' : 'Conversation'}</DialogTitle>
              </DialogHeader>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Enter new name"
                className="my-4"
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowRenameDialog(false);
                    setRenameItem(null);
                    setNewName('');
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="default"
                >
                  Save
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
};