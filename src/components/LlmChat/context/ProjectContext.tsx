import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Project, ProjectSettings, ProjectState } from './types';
import { Message } from '../types';

const ProjectContext = createContext<ProjectState | null>(null);

const generateId = () => Math.random().toString(36).substring(7);

const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  apiKey: '',
  model: 'claude-3-5-sonnet-20241022',
  systemPrompt: '',
  mcpServers: []
};

export const useProjects = () => {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProjects must be used within a ProjectProvider');
  }
  return context;
};

export const ProjectProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  // Initialize with saved data or defaults
  useEffect(() => {
    const savedData = localStorage.getItem('chat_app_projects');
    if (savedData) {
      const parsed = JSON.parse(savedData);
      setProjects(parsed.projects.map((proj: any) => ({
        ...proj,
        conversations: proj.conversations.map((conv: any) => ({
          ...conv,
          lastUpdated: new Date(conv.lastUpdated),
          messages: conv.messages.map((msg: any) => ({
            ...msg,
            timestamp: new Date(msg.timestamp)
          }))
        })),
        createdAt: new Date(proj.createdAt),
        updatedAt: new Date(proj.updatedAt)
      })));
      setActiveProjectId(parsed.activeProjectId);
      setActiveConversationId(parsed.activeConversationId);
    } else {
      // Create default project
      const defaultProject: Project = {
        id: generateId(),
        name: 'Default Project',
        settings: DEFAULT_PROJECT_SETTINGS,
        conversations: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };
      setProjects([defaultProject]);
      setActiveProjectId(defaultProject.id);
    }
  }, []);

  // Save state changes
  useEffect(() => {
    if (projects.length > 0) {
      localStorage.setItem('chat_app_projects', JSON.stringify({
        projects,
        activeProjectId,
        activeConversationId
      }));
    }
  }, [projects, activeProjectId, activeConversationId]);

  const createProject = useCallback((name: string, settings?: Partial<ProjectSettings>) => {
    const newProject: Project = {
      id: generateId(),
      name,
      settings: { ...DEFAULT_PROJECT_SETTINGS, ...settings },
      conversations: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    setProjects(current => [...current, newProject]);
    setActiveProjectId(newProject.id);
  }, []);

  const deleteProject = useCallback((id: string) => {
    setProjects(current => current.filter(p => p.id !== id));
    if (activeProjectId === id) {
      setActiveProjectId(projects[0]?.id ?? null);
      setActiveConversationId(null);
    }
  }, [activeProjectId, projects]);

  const updateProjectSettings = useCallback((id: string, settings: Partial<ProjectSettings>) => {
    setProjects(current =>
      current.map(p => p.id === id
        ? {
            ...p,
            settings: { ...p.settings, ...settings },
            updatedAt: new Date()
          }
        : p
      )
    );
  }, []);

  const createConversation = useCallback((projectId: string, name?: string) => {
    const conversationId = generateId();
    setProjects(current =>
      current.map(p => p.id === projectId
        ? {
            ...p,
            conversations: [
              ...p.conversations,
              {
                id: conversationId,
                name: name || `Conversation ${p.conversations.length + 1}`,
                lastUpdated: new Date(),
                messages: []
              }
            ],
            updatedAt: new Date()
          }
        : p
      )
    );
    setActiveConversationId(conversationId);
  }, []);

  const deleteConversation = useCallback((projectId: string, conversationId: string) => {
    setProjects(current =>
      current.map(p => p.id === projectId
        ? {
            ...p,
            conversations: p.conversations.filter(c => c.id !== conversationId),
            updatedAt: new Date()
          }
        : p
      )
    );
    if (activeConversationId === conversationId) {
      const project = projects.find(p => p.id === projectId);
      setActiveConversationId(project?.conversations[0]?.id ?? null);
    }
  }, [activeConversationId, projects]);

  const value: ProjectState = {
    projects,
    activeProjectId,
    activeConversationId,
    createProject,
    deleteProject,
    updateProjectSettings,
    createConversation,
    deleteConversation,
    setActiveProject: setActiveProjectId,
    setActiveConversation: setActiveConversationId
  };

  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  );
};
