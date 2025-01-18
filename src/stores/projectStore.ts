import { create } from 'zustand';
import { Project, ProjectSettings, ConversationBrief, ProjectState } from '../components/LlmChat/context/types';
import { loadState, saveState } from '../lib/db';
import { useMcpStore } from './mcpStore';

const generateId = () => Math.random().toString(36).substring(7);

const getDefaultModelForProvider = (provider?: string): string => {
  switch (provider) {
    case 'openai':
      return 'gpt-4o';
    case 'openrouter':
      return 'openai/gpt-4-turbo-preview';
    case 'anthropic':
    default:
      return 'claude-3-5-sonnet-20241022';
  }
};

const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  apiKey: '',
  model: getDefaultModelForProvider('anthropic'),
  systemPrompt: '',
  mcpServers: [],
  elideToolResults: false,
};

interface ProjectStore extends ProjectState {
  initialized: boolean;
  initialize: () => Promise<void>;
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  activeProjectId: null,
  activeConversationId: null,
  initialized: false,

  initialize: async () => {
    if (get().initialized) return;
    
    try {
      const state = await loadState();
      const hasProjects = state.projects.length > 0;
      if (hasProjects) {
        set({
          projects: state.projects,
          activeProjectId: state.activeProjectId,
          activeConversationId: state.activeProjectId && state.activeConversationId
            ? state.activeConversationId
            : null,
          initialized: true,
        });
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
        set({
          projects: [defaultProject],
          activeProjectId: defaultProject.id,
          activeConversationId: defaultConversation.id,
          initialized: true,
        });
      }
    } catch {
      console.error('Error initializing data');
      const defaultProject = {
        id: generateId(),
        name: 'Default Project',
        settings: {
          ...DEFAULT_PROJECT_SETTINGS,
          mcpServers: []
        },
        conversations: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        order: Date.now()
      };
      set({
        projects: [defaultProject],
        activeProjectId: defaultProject.id,
        initialized: true,
      });
    }
  },

  createProject: (name: string, settings?: Partial<ProjectSettings>) => {
    const { projects, activeProjectId } = get();
    const currentProject = projects.find(p => p.id === activeProjectId);
    const projectId = generateId();

    // Get connected servers from McpStore
    const mcpStore = useMcpStore.getState();
    const connectedServers = mcpStore.servers
      .filter(server => server.status === 'connected')
      .map(server => ({
        id: server.id,
        name: server.name,
        uri: server.uri,
        status: 'connected' as const
      }));

    const newProject: Project = {
      id: projectId,
      name,
      settings: {
        ...DEFAULT_PROJECT_SETTINGS,
        ...(currentProject && {
          apiKey: currentProject.settings.apiKey,
          systemPrompt: '',
        }),
        // Use connected servers for new projects
        mcpServers: connectedServers,
        ...settings,
      },
      conversations: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      order: Math.max(...projects.map(p => p.order || 0), 0) + 1
    };

    set(state => ({
      projects: [...state.projects, newProject],
      activeProjectId: projectId,
    }));

    // Save state after updating
    saveState({
      projects: [...projects, newProject],
      activeProjectId: projectId,
      activeConversationId: null,
    }).catch(error => {
      console.error('Error saving state:', error);
    });

    // Create initial chat
    const conversationId = generateId();
    set(state => ({
      projects: state.projects.map(p => {
        if (p.id !== projectId) return p;
        return {
          ...p,
          conversations: [{
            id: conversationId,
            name: '(New Chat)',
            lastUpdated: new Date(),
            messages: [],
            createdAt: new Date()
          }],
          updatedAt: new Date()
        };
      }),
      activeConversationId: conversationId,
    }));

    // Save state after creating initial chat
    const updatedState = get();
    saveState({
      projects: updatedState.projects,
      activeProjectId: updatedState.activeProjectId,
      activeConversationId: updatedState.activeConversationId,
    }).catch(error => {
      console.error('Error saving state:', error);
    });
  },

  deleteProject: (id: string) => {
    const { projects, activeProjectId } = get();
    const newProject = projects.find(p => p.id !== id);
    
    const newState = {
      projects: projects.filter(p => p.id !== id),
      activeProjectId: activeProjectId === id && newProject ? newProject.id : activeProjectId,
      activeConversationId: activeProjectId === id && newProject
        ? newProject.conversations[0]?.id ?? null
        : get().activeConversationId,
    };

    set(newState);
    saveState(newState).catch(error => {
      console.error('Error saving state:', error);
    });
  },

  updateProjectSettings: (id: string, updates: {
    settings?: Partial<ProjectSettings>;
    conversations?: ConversationBrief[];
  }) => {
    set(state => {
      const newState = {
        ...state,
        projects: state.projects.map(p => {
          if (p.id !== id) return p;

          let updatedConversations = p.conversations;
          if (updates.conversations) {
            updatedConversations = updates.conversations.map(newConv => {
              const existingConv = p.conversations.find(c => c.id === newConv.id);
              return existingConv && existingConv.name !== '(New Chat)'
                ? { ...newConv, name: existingConv.name }
                : newConv;
            });
          }

          return {
            ...p,
            settings: updates.settings
              ? {
                  ...p.settings,
                  ...updates.settings,
                  mcpServers: updates.settings.mcpServers !== undefined
                    ? updates.settings.mcpServers
                    : p.settings.mcpServers
                }
              : p.settings,
            conversations: updatedConversations,
            updatedAt: new Date()
          };
        })
      };

      saveState(newState).catch(error => {
        console.error('Error saving state:', error);
      });

      return newState;
    });
  },

  createConversation: (projectId: string, name?: string) => {
    const conversationId = generateId();
    set(state => {
      const newState = {
        ...state,
        projects: state.projects.map(p => {
          if (p.id !== projectId) return p;
          return {
            ...p,
            conversations: [
              {
                id: conversationId,
                name: name || '(New Chat)',
                lastUpdated: new Date(),
                createdAt: new Date(),
                messages: []
              },
              ...p.conversations
            ],
            updatedAt: new Date()
          };
        }),
        activeConversationId: conversationId,
      };

      saveState(newState).catch(error => {
        console.error('Error saving state:', error);
      });

      return newState;
    });
  },

  deleteConversation: (projectId: string, conversationId: string) => {
    const newChatId = generateId();
    
    set(state => {
      const updatedProjects = state.projects.map(p => {
        if (p.id !== projectId) return p;
        const updatedConversations = p.conversations.filter(c => c.id !== conversationId);

        if (updatedConversations.length === 0) {
          const newChat = {
            id: newChatId,
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
      });

      const project = updatedProjects.find(p => p.id === projectId);
      const nextConvoId = project?.conversations.length === 1
        ? newChatId
        : state.activeConversationId === conversationId
          ? project?.conversations.find(c => c.id !== conversationId)?.id ?? null
          : state.activeConversationId;

      const newState = {
        ...state,
        projects: updatedProjects,
        activeConversationId: nextConvoId,
      };

      saveState(newState).catch(error => {
        console.error('Error saving state:', error);
      });

      return newState;
    });
  },

  renameConversation: (projectId: string, conversationId: string, newName: string) => {
    if (newName === '(New Chat)') return;

    set(state => {
      const newState = {
        ...state,
        projects: state.projects.map(p => {
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
      };

      saveState(newState).catch(error => {
        console.error('Error saving state:', error);
      });

      return newState;
    });
  },

  renameProject: (projectId: string, newName: string) => {
    set(state => {
      const newState = {
        ...state,
        projects: state.projects.map(p =>
          p.id === projectId
            ? { ...p, name: newName, updatedAt: new Date() }
            : p
        )
      };

      saveState(newState).catch(error => {
        console.error('Error saving state:', error);
      });

      return newState;
    });
  },

  setActiveProject: (projectId: string | null) => {
    const { projects } = get();
    const project = projectId ? projects.find(p => p.id === projectId) : null;
    
    set(state => {
      const newState = {
        ...state,
        activeProjectId: projectId,
        activeConversationId: project && project.conversations.length > 0 && !state.activeConversationId
          ? project.conversations[0].id
          : state.activeConversationId
      };

      saveState(newState).catch(error => {
        console.error('Error saving state:', error);
      });

      return newState;
    });
  },

  setActiveConversation: (conversationId: string | null) => {
    set(state => {
      const newState = {
        ...state,
        activeConversationId: conversationId
      };

      saveState(newState).catch(error => {
        console.error('Error saving state:', error);
      });

      return newState;
    });
  },
}));