"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { Project, ProjectSettings, ProjectState, ConversationBrief } from './types';
import { loadState, saveState } from '../../../lib/db';
import { LegacyProviderType } from '../types/provider';

const ProjectContext = createContext<ProjectState | null>(null);

const generateId = () => Math.random().toString(36).substring(7);

// Get default model for a provider
function getDefaultModelForProvider(provider?: LegacyProviderType): string {
  switch (provider) {
    case 'openai':
      return 'gpt-4o';
    case 'openrouter':
      return 'openai/gpt-4-turbo-preview';
    case 'anthropic':
    default:
      return 'claude-3-5-sonnet-20241022';
  }
}

const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  apiKey: '',
  model: getDefaultModelForProvider('anthropic'),
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
        const state = await loadState();
        const hasProjects = state.projects.length > 0;
        if (hasProjects) {
          setProjects(state.projects);
          setActiveProjectId(state.activeProjectId);
          // Only restore active conversation if it exists
          if (state.activeProjectId && state.activeConversationId) {
            const project = state.projects.find(p => p.id === state.activeProjectId);
            if (project?.conversations.some(c => c.id === state.activeConversationId)) {
              setActiveConversationId(state.activeConversationId);
            }
          }
        } else {
          // Create default project with an initial conversation
          const defaultConversation = {
            id: generateId(),
            name: '(New Chat)',
            lastUpdated: new Date(),
            messages: [],
            createdAt: new Date()
          };
          const defaultProject = {
            id: generateId(),
            name: 'Default Project',
            settings: {
              ...DEFAULT_PROJECT_SETTINGS,
              mcpServers: []
            },
            conversations: [defaultConversation],
            createdAt: new Date(),
            updatedAt: new Date(),
            order: Date.now()
          };
          setProjects([defaultProject]);
          setActiveProjectId(defaultProject.id);
          setActiveConversationId(defaultConversation.id);
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
    setProjects(current => {
      const currentProject = current.find(p => p.id === id);
      if (!currentProject) return current;

      return current.map(p => {
        if (p.id !== id) return p;

        // If we're updating conversations, preserve names of existing conversations
        let updatedConversations = p.conversations;
        if (updates.conversations) {
          updatedConversations = updates.conversations.map(newConv => {
            const existingConv = currentProject.conversations.find(c => c.id === newConv.id);
            // If conversation exists and was previously renamed (not New Chat), keep its name
            if (existingConv && existingConv.name !== '(New Chat)') {
              return { ...newConv, name: existingConv.name };
            }
            return newConv;
          });
        }

        return {
          ...p,
          settings: updates.settings ? {
            ...p.settings,
            ...updates.settings,
            mcpServers: updates.settings.mcpServers !== undefined
              ? updates.settings.mcpServers
              : p.settings.mcpServers
          } : p.settings,
          conversations: updatedConversations,
          updatedAt: new Date()
        };
      });
    });
  }, []);

  const createInitialChat = useCallback((projectId: string) => {
    const conversationId = generateId();
          const initialChat = {
            id: conversationId,
            name: '(New Chat)',
            lastUpdated: new Date(),
      messages: [],
      createdAt: new Date()
    };

    setProjects(current =>
      current.map(p => {
        if (p.id !== projectId) return p;
        return {
          ...p,
          conversations: [initialChat],
          updatedAt: new Date()
        };
      })
    );
    setActiveConversationId(conversationId);
    return conversationId;
  }, []);

  const createProject = useCallback((name: string, settings?: Partial<ProjectSettings>) => {
    const currentProject = projects.find(p => p.id === activeProjectId);
    const projectId = generateId();
    const newProject: Project = {
      id: projectId,
      name,
      settings: {
        ...DEFAULT_PROJECT_SETTINGS,
        ...(currentProject && {
          apiKey: currentProject.settings.apiKey,
          systemPrompt: '',
          // Preserve default MCP server settings
          mcpServers: currentProject.settings.mcpServers.filter(server =>
            server.name === 'Local MCP' && server.id === 'localhost-mcp'
          ),
        }),
        ...settings,
      },
      conversations: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      order: Date.now()  // Use timestamp for default order
    };
    setProjects(prev => {
      // Get highest order value
      const maxOrder = prev.reduce((max, p) => Math.max(max, p.order || 0), 0);
      // Place new project at the end with an order value greater than the highest
      newProject.order = maxOrder + 1;
      return [...prev, newProject];
    });
    setActiveProjectId(projectId);

    // Create initial chat
    createInitialChat(projectId);

    return projectId;
  }, [activeProjectId, projects, createInitialChat]);

  const deleteProject = useCallback((id: string) => {
    // First find the new project and its first conversation if any
    const newProject = projects.find(p => p.id !== id);

    setProjects(current => current.filter(p => p.id !== id));

    if (activeProjectId === id && newProject) {
      const firstConversationId = newProject.conversations[0]?.id ?? null;
      setActiveProjectId(newProject.id);
      setActiveConversationId(firstConversationId);
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
            {
              id: conversationId,
              name: name || `(New Chat)`,
              lastUpdated: new Date(),
              createdAt: new Date(),
              messages: []
            },
            ...p.conversations
          ],
          updatedAt: new Date()
        };
      })
    );
    setActiveConversationId(conversationId);
  }, []);

  const deleteConversation = useCallback((projectId: string, conversationId: string) => {
    // Generate new chat ID outside the update function so we can use it consistently
    const newChatId = generateId();

    setProjects(current =>
      current.map(p => {
        if (p.id !== projectId) return p;
        const updatedConversations = p.conversations.filter(c => c.id !== conversationId);

        // If this would leave the project with no conversations, create a new one immediately
        if (updatedConversations.length === 0) {
          const newChat = {
            id: newChatId, // Use the pre-generated ID
            name: '(New Chat)',
            lastUpdated: new Date(),
            messages: [],
            createdAt: new Date()
          };
          return {
            ...p,
            conversations: [newChat],
            updatedAt: new Date()
          };
        }

        return {
          ...p,
          conversations: updatedConversations,
          updatedAt: new Date()
        };
      })
    );

    const project = projects.find(p => p.id === projectId);
    if (project) {
      if (project.conversations.length === 1) {
        // If we just deleted the last conversation, select the new one we created
        setActiveConversationId(newChatId);
      } else if (activeConversationId === conversationId) {
        // If we deleted the active conversation but there are others, select the next available one
        const nextConvoId = project.conversations.find(c => c.id !== conversationId)?.id ?? null;
        setActiveConversationId(nextConvoId);
      }
    }
  }, [activeConversationId, projects]);

  const renameConversation = useCallback((projectId: string, conversationId: string, newName: string) => {
    // Don't allow renaming to "(New Chat)" after it's been changed
    if (newName === '(New Chat)') {
      console.log('Prevented rename to (New Chat)');
      return;
    }

    console.log(`Renaming conversation ${conversationId} to "${newName}"`);

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

  // Ensure a chat is selected when switching projects
  const setActiveProjectWithChat = useCallback((projectId: string | null) => {
    setActiveProjectId(projectId);
    if (!projectId) {
      setActiveConversationId(null);
      return;
    }
    const project = projects.find(p => p.id === projectId);
    if (project && project.conversations.length > 0 && !activeConversationId) {
      // Project has chats but none selected - select the first one (newest)
      setActiveConversationId(project.conversations[0].id);
    }
  }, [projects, activeConversationId]);

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
    setActiveProject: setActiveProjectWithChat,
    setActiveConversation: setActiveConversationId,
    renameProject
  };

  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  );
};
