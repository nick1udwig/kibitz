import { useCallback, useEffect } from 'react';
import { useProjects } from './ProjectContext';

export const useFocusControl = () => {
  const {
    projects,
    activeProjectId,
    createConversation,
    setActiveConversation,
    activeConversationId,
  } = useProjects();

  const activeProject = projects.find(p => p.id === activeProjectId);

  // Handle conversation focus when switching projects
  const handleProjectFocus = useCallback((projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    // If no conversations exist, create one
    if (project.conversations.length === 0) {
      createConversation(projectId);
      return;
    }

    // If last conversation is empty, use it
    const lastConvo = project.conversations[project.conversations.length - 1];
    if (lastConvo.messages.length === 0) {
      setActiveConversation(lastConvo.id);
      return;
    }

    // Create a new conversation
    createConversation(projectId);
  }, [projects, createConversation, setActiveConversation]);

  // Ensure focus management when project changes
  useEffect(() => {
    if (!activeProjectId) return;
    
    // Only take action if no conversation is active
    if (!activeConversationId) {
      const project = projects.find(p => p.id === activeProjectId);
      if (!project) return;

      if (project.conversations.length === 0) {
        createConversation(activeProjectId);
      } else {
        const lastConvo = project.conversations[project.conversations.length - 1];
        if (lastConvo.messages.length === 0) {
          setActiveConversation(lastConvo.id);
        } else {
          createConversation(activeProjectId);
        }
      }
    }
  }, [activeProjectId, activeConversationId, projects, createConversation, setActiveConversation]);

  return {
    handleProjectFocus,
    activeProject,
  };
};