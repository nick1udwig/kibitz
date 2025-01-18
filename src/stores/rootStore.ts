import { create } from 'zustand';
import { Project, ProjectSettings, ConversationBrief, ProjectState, McpState, McpServerConnection, Tool } from '../components/LlmChat/context/types';
import { McpServer } from '../components/LlmChat/types/mcp';
import { loadState, saveState, loadMcpServers, saveMcpServers } from '../lib/db';

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

interface RootState extends ProjectState, McpState {
  initialized: boolean;
  initialize: () => Promise<void>;
  // Project methods
  createProject: (name: string, settings?: Partial<ProjectSettings>) => void;
  deleteProject: (id: string) => void;
  updateProjectSettings: (id: string, updates: {
    settings?: Partial<ProjectSettings>;
    conversations?: ConversationBrief[];
  }) => void;
  createConversation: (projectId: string, name?: string) => void;
  deleteConversation: (projectId: string, conversationId: string) => void;
  renameConversation: (projectId: string, conversationId: string, newName: string) => void;
  renameProject: (projectId: string, newName: string) => void;
  setActiveProject: (projectId: string | null) => void;
  setActiveConversation: (conversationId: string | null) => void;
  // MCP methods
  addServer: (server: McpServer) => Promise<McpServerConnection | undefined>;
  removeServer: (serverId: string) => void;
  reconnectServer: (serverId: string) => Promise<McpServerConnection>;
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>;
  attemptLocalMcpConnection: () => Promise<McpServerConnection | null>;
}

export const useStore = create<RootState>((set, get) => {
  // Using refs outside the store to maintain WebSocket connections
  const connectionsRef = new Map<string, WebSocket>();
  const reconnectTimeoutsRef = new Map<string, NodeJS.Timeout>();

  const cleanupServer = (serverId: string) => {
    const existingTimeout = reconnectTimeoutsRef.get(serverId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      reconnectTimeoutsRef.delete(serverId);
    }

    const ws = connectionsRef.get(serverId);
    if (ws) {
      ws.close();
      connectionsRef.delete(serverId);
    }
  };

  const scheduleReconnect = (server: McpServer, delay: number = 5000) => {
    const existingTimeout = reconnectTimeoutsRef.get(server.id);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    const timeout = setTimeout(async () => {
      try {
        await connectToServer(server);
      } catch {
        console.error(`Reconnection failed for ${server.name}`);
        scheduleReconnect(server, Math.min(delay * 2, 30000));
      }
    }, delay);

    reconnectTimeoutsRef.set(server.id, timeout);
  };

  const connectToServer = async (server: McpServer): Promise<McpServerConnection> => {
    try {
      set(state => ({
        servers: state.servers.map(s => s.id === server.id
          ? { ...s, status: 'connecting', error: undefined }
          : s
        )
      }));

      const ws = new WebSocket(server.uri);

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          ws.close();
          reject(new Error('Connection timeout'));
        }, 10000);

        ws.onopen = () => {
          clearTimeout(timeout);
          connectionsRef.set(server.id, ws);

          ws.send(JSON.stringify({
            jsonrpc: '2.0',
            method: 'initialize',
            params: {
              protocolVersion: '0.1.0',
              clientInfo: { name: 'llm-chat', version: '1.0.0' },
              capabilities: { tools: {} }
            },
            id: 1
          }));
        };

        ws.onclose = () => {
          clearTimeout(timeout);
          cleanupServer(server.id);

          set(state => ({
            servers: state.servers.map(s => s.id === server.id
              ? { ...s, status: 'disconnected', error: 'Connection closed' }
              : s
            )
          }));

          scheduleReconnect(server);
        };

        ws.onerror = () => {
          clearTimeout(timeout);
          console.log('WebSocket error (trying to reconnect...)');
          cleanupServer(server.id);

          set(state => ({
            servers: state.servers.map(s => s.id === server.id
              ? { ...s, status: 'error', error: 'Connection error' }
              : s
            )
          }));

          scheduleReconnect(server, 0);
          reject(new Error('WebSocket connection error'));
        };

        ws.onmessage = (event) => {
          try {
            const response = JSON.parse(event.data);

            if (response.id === 1) {
              ws.send(JSON.stringify({
                jsonrpc: '2.0',
                method: 'notifications/initialized',
              }));

              ws.send(JSON.stringify({
                jsonrpc: '2.0',
                method: 'tools/list',
                id: 2
              }));
            } else if (response.id === 2) {
              if (response.error) {
                console.log('Received unexpected WS-MCP message:', response.results);
                return server;
              }
              const tools = response.result.tools.map((tool: Tool) => ({
                ...tool,
                input_schema: tool.inputSchema,
              }));
              const connectedServer = {
                ...server,
                status: 'connected' as const,
                error: undefined,
                tools,
                connection: ws
              };

              set(state => ({
                servers: state.servers.map(s => s.id === server.id ? connectedServer : s)
              }));

              saveMcpServers(get().servers).catch(() => {
                console.error('Error saving MCP servers');
              });

              resolve(connectedServer);
            }
          } catch {
            console.error('Error parsing WebSocket message');
            return {
              ...server,
              status: 'error',
              error: 'Error parsing WebSocket message'
            };
          }
        };
      });
    } catch {
      console.error(`Failed to connect to server ${server.name}`);
      return {
        ...server,
        status: 'error',
        error: 'Failed to connect'
      };
    }
  };

  return {
    // State
    projects: [],
    activeProjectId: null,
    activeConversationId: null,
    initialized: false,
    servers: [],

    // Initialization
    initialize: async () => {
      if (get().initialized) return;

      try {
        // Initialize project state
        const state = await loadState();
        const hasProjects = state.projects.length > 0;
        
        if (hasProjects) {
          set({
            projects: state.projects,
            activeProjectId: state.activeProjectId,
            activeConversationId: state.activeProjectId && state.activeConversationId
              ? state.activeConversationId
              : null,
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
          });
        }

        // Initialize MCP servers
        if (get().servers.length === 0) {
          try {
            const savedServers = await loadMcpServers();
            console.log('Loading servers from IndexedDB:', JSON.stringify(savedServers));

            const connectedServers: McpServerConnection[] = [];
            for (const server of savedServers) {
              try {
                const connectedServer = await connectToServer(server);
                connectedServers.push(connectedServer);
              } catch {
                console.error(`Initial connection failed for ${server.name}`);
                connectedServers.push({
                  ...server,
                  status: 'error',
                  error: 'Failed to connect'
                });
              }
            }

            set({ servers: connectedServers });

            // Attempt local MCP connection if no servers exist
            if (connectedServers.length === 0) {
              const localServer = await get().attemptLocalMcpConnection();
              if (localServer) {
                console.log('Connected to local MCP server');
              }
            }
          } catch {
            console.error('Error initializing MCP servers');
          }
        }

        set({ initialized: true });
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

    // Project methods
    createProject: (name: string, settings?: Partial<ProjectSettings>) => {
      const { projects, activeProjectId } = get();
      const currentProject = projects.find(p => p.id === activeProjectId);
      const projectId = generateId();

      // Get connected servers from state
      const connectedServers = get().servers
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

    // MCP methods
    addServer: async (server: McpServer) => {
      set(state => ({
        servers: [...state.servers, { ...server, status: 'connecting', error: undefined }]
      }));

      try {
        const connectedServer = await connectToServer(server);
        set(state => ({
          servers: state.servers.map(s => s.id === server.id ? connectedServer : s)
        }));
        await saveMcpServers(get().servers);
        return connectedServer;
      } catch {
        set(state => ({
          servers: state.servers.map(s => s.id === server.id
            ? { ...s, status: 'error', error: 'Connection failed' }
            : s
          )
        }));
        return get().servers.find(s => s.id === server.id);
      }
    },

    removeServer: (serverId: string) => {
      cleanupServer(serverId);
      set(state => ({
        servers: state.servers.filter(s => s.id !== serverId)
      }));
      saveMcpServers(get().servers).catch(() => {
        console.error('Error saving MCP servers');
      });
    },

    reconnectServer: async (serverId: string) => {
      const server = get().servers.find(s => s.id === serverId);
      if (!server) {
        throw new Error('Server not found');
      }

      try {
        const connectedServer = await connectToServer(server);
        set(state => ({
          servers: state.servers.map(s => s.id === serverId ? connectedServer : s)
        }));
        await saveMcpServers(get().servers);
        return connectedServer;
      } catch {
        set(state => ({
          servers: state.servers.map(s => s.id === serverId
            ? { ...s, status: 'error', error: 'Reconnection failed' }
            : s
          )
        }));
        throw new Error('Failed to reconnect');
      }
    },

    executeTool: async (serverId: string, toolName: string, args: Record<string, unknown>): Promise<string> => {
      const ws = connectionsRef.get(serverId);
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        throw new Error('Server not connected');
      }

      return new Promise((resolve, reject) => {
        const requestId = Math.random().toString(36).substring(7);

        const messageHandler = (event: MessageEvent) => {
          try {
            const response = JSON.parse(event.data);
            if (response.id === requestId) {
              ws.removeEventListener('message', messageHandler);
              if (response.error) {
                reject(new Error(response.error.message));
              } else {
                resolve(response.result.content[0].text as string);
              }
            }
          } catch {
            console.error('Error parsing tool response');
            reject(new Error('Failed to parse tool response'));
          }
        };

        ws.addEventListener('message', messageHandler);

        ws.send(JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: { name: toolName, arguments: args },
          id: requestId
        }));
      });
    },

    attemptLocalMcpConnection: async () => {
      const id = 'localhost-mcp';
      const wsProtocol = window.location.protocol.endsWith('s:') ? 'wss' : 'ws';
      const defaultWsUri = !process.env.NEXT_PUBLIC_DEFAULT_WS_ENDPOINT
        ? 'ws://localhost:10125'
        : `${wsProtocol}://${window.location.host}${process.env.NEXT_PUBLIC_DEFAULT_WS_ENDPOINT}`;
      const server: McpServer = {
        id: id,
        name: 'Local MCP',
        uri: defaultWsUri,
        status: 'disconnected',
      };

      const existingServer = get().servers.find(server => server.id === id);
      if (existingServer) {
        return existingServer;
      }

      try {
        const connectedServer = await connectToServer(server);
        if (connectedServer.status === 'connected') {
          set(state => ({ servers: [...state.servers, connectedServer] }));
          await saveMcpServers(get().servers);
          return connectedServer;
        }
        return null;
      } catch {
        console.log('Local MCP not available');
        return null;
      }
    },
  };
});