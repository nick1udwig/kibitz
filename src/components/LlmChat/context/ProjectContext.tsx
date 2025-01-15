"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { Project, ProjectSettings, ProjectState, ConversationBrief } from './types';
import { loadState, saveState, migrateFromLocalStorage } from '../../../lib/db';
import { useMcp } from './McpContext';

const ProjectContext = createContext<ProjectState | null>(null);

const generateId = () => Math.random().toString(36).substring(7);

const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  apiKey: '',
  model: 'claude-3-5-sonnet-20241022',
  systemPrompt: '',
  mcpServers: [],
  elideToolResults: false,
};

interface ProjectUpdates {
  settings?: Partial<ProjectSettings>;
  conversations?: ConversationBrief[];
}

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
  const mcpContextRef = useRef<ReturnType<typeof useMcp> | null>(null);

  useEffect(() => {
    try {
      mcpContextRef.current = useMcp();
    } catch (error) {
      console.error('MCP context not available:', error);
    }
  }, []);

  // Use ref to track if initial load has happened
  const initialized = useRef(false);

  const createDefaultProject = useCallback(() => {
    const defaultProject: Project = {
      id: generateId(),
      name: 'Default Project',
      settings: {
        ...DEFAULT_PROJECT_SETTINGS,
        mcpServers: []
      },
      conversations: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      order: Date.now()  // Use timestamp for order
    };
    setProjects([defaultProject]);
    setActiveProjectId(defaultProject.id);
  }, []);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const initializeData = async () => {
      try {
        // Check if we need to migrate from localStorage
        if (localStorage.getItem('chat_app_projects')) {
          await migrateFromLocalStorage();
          // Clear localStorage after successful migration
          localStorage.removeItem('chat_app_projects');
        }

        const state = await loadState();
        if (state.projects.length > 0) {
          setProjects(state.projects);
          setActiveProjectId(state.activeProjectId);
          setActiveConversationId(state.activeConversationId);
        } else {
          createDefaultProject();
        }
      } catch (error) {
        console.error('Error initializing data:', error);
        createDefaultProject();
      }
    };

    initializeData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save state changes with debounce
  useEffect(() => {
    if (projects.length === 0) return;

    const timeoutId = setTimeout(() => {
      saveState({
        projects,
        activeProjectId,
        activeConversationId
      }).catch(error => {
        console.error('Error saving state:', error);
      });
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [projects, activeProjectId, activeConversationId]);

  const updateProjectSettings = useCallback((id: string, updates: ProjectUpdates) => {
    setProjects(current =>
      current.map(p => {
        if (p.id !== id) return p;
        return {
          ...p,
          settings: updates.settings ? {
            ...p.settings,
            ...updates.settings,
            mcpServers: updates.settings.mcpServers !== undefined
              ? updates.settings.mcpServers
              : p.settings.mcpServers
          } : p.settings,
          conversations: updates.conversations || p.conversations,
          updatedAt: new Date()
        };
      })
    );
  }, []);

  const createProject = useCallback((name: string, settings?: Partial<ProjectSettings>) => {
    const currentProject = projects.find(p => p.id === activeProjectId);
    const projectId = generateId();
    const conversationId = generateId();
    const newProject: Project = {
      id: projectId,
      name,
      settings: {
        ...DEFAULT_PROJECT_SETTINGS,
        ...(currentProject && {
          apiKey: currentProject.settings.apiKey,
          systemPrompt: currentProject.settings.systemPrompt,
        }),
        ...settings,
      },
      conversations: [{
        id: conversationId,
        name: 'Conversation 1',
        lastUpdated: new Date(),
        messages: []
      }],
      createdAt: new Date(),
      updatedAt: new Date(),
      order: Date.now()  // Use timestamp for default order
    };

    // Add the project first
    setProjects(prev => {
        // Get highest order value
        const maxOrder = prev.reduce((max, p) => Math.max(max, p.order || 0), 0);
        // Place new project at the end with an order value greater than the highest
        newProject.order = maxOrder + 1;
        return [...prev, newProject];
      });
    setActiveProjectId(projectId);
    setActiveConversationId(conversationId);

    // Attempt to connect to local MCP
    if (mcpContextRef.current) {
      mcpContextRef.current.attemptLocalMcpConnection().then(server => {
        if (server) {
          updateProjectSettings(projectId, {
            settings: {
              ...newProject.settings,
              mcpServers: [...newProject.settings.mcpServers, server]
            }
          });
        }
      });
    }

    return projectId;
  }, [activeProjectId, projects, updateProjectSettings]);

  const deleteProject = useCallback((id: string) => {
    setProjects(current => {
      const updatedProjects = current.filter(p => p.id !== id);
      return updatedProjects;
    });

    if (activeProjectId === id) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      setActiveProjectId(prev => {
        const newActiveId = projects.find(p => p.id !== id)?.id ?? null;
        setActiveConversationId(null);
        return newActiveId;
      });
    }
  }, [activeProjectId, projects]);

  const createConversation = useCallback((projectId: string, name?: string) => {
    const conversationId = generateId();
    setProjects(current =>
      current.map(p => {
        if (p.id !== projectId) return p;
        return {
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
        };
      })
    );
    setActiveConversationId(conversationId);
  }, []);

  const deleteConversation = useCallback((projectId: string, conversationId: string) => {
    setProjects(current =>
      current.map(p => {
        if (p.id !== projectId) return p;
        return {
          ...p,
          conversations: p.conversations.filter(c => c.id !== conversationId),
          updatedAt: new Date()
        };
      })
    );

    if (activeConversationId === conversationId) {
      const project = projects.find(p => p.id === projectId);
      const nextConvoId = project?.conversations.find(c => c.id !== conversationId)?.id ?? null;
      setActiveConversationId(nextConvoId);
    }
  }, [activeConversationId, projects]);

  const renameConversation = useCallback((projectId: string, conversationId: string, newName: string) => {
    setProjects(current =>
      current.map(p => {
        if (p.id !== projectId) return p;
        return {
          ...p,
          conversations: p.conversations.map(c =>
            c.id === conversationId
              ? { ...c, name: newName }
              : c
          ),
          updatedAt: new Date()
        };
      })
    );
  }, []);

  const renameProject = useCallback((projectId: string, newName: string) => {
    setProjects(current =>
      current.map(p =>
        p.id === projectId
          ? { ...p, name: newName, updatedAt: new Date() }
          : p
      )
    );
  }, []);

  const value: ProjectState = {
    projects,
    activeProjectId,
    activeConversationId,
    createProject,
    deleteProject,
    updateProjectSettings,
    createConversation,
    deleteConversation,
    renameConversation,
    setActiveProject: setActiveProjectId,
    setActiveConversation: setActiveConversationId,
    renameProject
  };

  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  );
};
