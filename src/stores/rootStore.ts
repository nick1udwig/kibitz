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

const DEFAULT_PAGE_SIZE = 50;

const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  apiKey: '',
  groqApiKey: '',
  model: getDefaultModelForProvider('anthropic'),
  systemPrompt: '',
  mcpServerIds: [],
  elideToolResults: false,
};

interface RootState extends ProjectState, McpState {
  initialized: boolean;
  apiKeys: Record<string, string>;
  hasLoadedApiKeysFromServer: boolean;
  saveApiKeysToServer: (keys: Record<string, string>) => void;
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

// Helper function to initialize pagination state
  const initializePagination = (messages: any[]) => ({
    pageSize: DEFAULT_PAGE_SIZE,
    hasMoreMessages: messages.length > DEFAULT_PAGE_SIZE,
    isLoadingMore: false
  });

  // Helper function to save API keys to server
  const saveApiKeysToServer = (keys: Record<string, string>) => {
    console.log(`saving ${JSON.stringify({ keys })}`);
    const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';
    fetch(`${BASE_PATH}/api/keys`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keys }),
    }).catch(error => {
      console.error('Failed to save API keys:', error);
    });
  };

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

          const updatedState = {
            servers: get().servers.map(s => s.id === server.id
              ? { ...s, status: 'disconnected' as const, error: 'Connection closed' }
              : s
            )
          };
          set(updatedState);

          saveMcpServers(updatedState.servers).catch((err) => {
            console.error('Error saving MCP servers on disconnect:', err);
          });

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

              const updatedState = {
                servers: get().servers.map(s => s.id === server.id ? connectedServer : s)
              };
              set(updatedState);

              saveMcpServers(updatedState.servers).catch((err) => {
                console.error('Error saving MCP servers:', err);
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
    apiKeys: {},
    hasLoadedApiKeysFromServer: false,
    saveApiKeysToServer,

    // Initialization
    initialize: async () => {
      if (get().initialized) return;

      try {
        // Try to load API keys from server if none exist locally
        const { apiKeys } = get();
        if (Object.keys(apiKeys).length === 0 && !get().hasLoadedApiKeysFromServer) {
          try {
            const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';
            const response = await fetch(`${BASE_PATH}/api/keys`);
            if (response.ok) {
              const data = await response.json();
              if (data.keys) {
                set({ apiKeys: data.keys, hasLoadedApiKeysFromServer: true });
              }
            }
          } catch (error) {
            console.error('Failed to load API keys:', error);
          }
        }

        // Always try to load saved servers first
        const savedServers = await loadMcpServers();
        console.log('Loading servers from IndexedDB:', JSON.stringify(savedServers));

        const connectedServers: McpServerConnection[] = [];

        // Attempt to connect to each saved server
        for (const server of savedServers) {
          try {
            const connectedServer = await connectToServer(server);
            connectedServers.push(connectedServer);
          } catch (err) {
            console.error(`Initial connection failed for ${server.name}:`, err);
            connectedServers.push({
              ...server,
              status: 'error',
              error: 'Failed to connect'
            });
          }
        }

        // Update state with loaded servers
        set({ servers: connectedServers });

        // Only attempt local MCP connection if no saved servers exist
        if (savedServers.length === 0) {
          try {
            const localServer = await get().attemptLocalMcpConnection();
            if (localServer) {
              console.log('Connected to local MCP server');
              await saveMcpServers([...connectedServers, localServer]);
            }
          } catch (err) {
            console.error('Failed to connect to local MCP:', err);
          }
        } else {
          await saveMcpServers(connectedServers);
        }

        // Initialize project state
        const state = await loadState();
        const hasProjects = state.projects.length > 0;
        console.log('Loading projects from IndexedDB:', JSON.stringify(state));

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
          const { apiKeys } = get();
          const defaultProject = {
            id: generateId(),
            name: 'Default Project',
            settings: {
              ...DEFAULT_PROJECT_SETTINGS,
              apiKey: apiKeys.apiKey ?? '',
              groqApiKey: apiKeys.groqApiKey ?? '',
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

      // Get connected server IDs from state
      const connectedServerIds = get().servers
        .filter(server => server.status === 'connected')
        .map(server => server.id);

      const newProject: Project = {
        id: projectId,
        name,
        settings: {
          ...DEFAULT_PROJECT_SETTINGS,
          ...(currentProject && {
            apiKey: currentProject.settings.apiKey,
            groqApiKey: currentProject.settings.groqApiKey,
            systemPrompt: '',
          }),
          mcpServerIds: connectedServerIds,
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
            createdAt: new Date(),
            pagination: { pageSize: DEFAULT_PAGE_SIZE, hasMoreMessages: false, isLoadingMore: false }
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

    updateProjectSettings: (id: string, updates: {
      settings?: Partial<ProjectSettings>;
      conversations?: ConversationBrief[];
    }) => {
      set(state => {
        const projectToUpdate = state.projects.find(p => p.id === id);
        const apiKeysToUpdate = { ...state.apiKeys };
        let shouldUpdateApiKeys = false;

        // Check for API key changes before updating project
        if (projectToUpdate && updates.settings) {
          if (updates.settings.apiKey !== projectToUpdate.settings.apiKey) {
            apiKeysToUpdate.apiKey = updates.settings.apiKey || '';
            shouldUpdateApiKeys = true;
          }
          if (updates.settings.groqApiKey !== projectToUpdate.settings.groqApiKey) {
            apiKeysToUpdate.groqApiKey = updates.settings.groqApiKey || '';
            shouldUpdateApiKeys = true;
          }
        }

        const newState = {
          ...state,
          apiKeys: shouldUpdateApiKeys ? apiKeysToUpdate : state.apiKeys,
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
                    mcpServerIds: updates.settings.mcpServerIds !== undefined
                      ? updates.settings.mcpServerIds
                      : p.settings.mcpServerIds
                  }
                : p.settings,
              conversations: updatedConversations,
              updatedAt: new Date()
            };
          })
        };

        // Save state to IndexedDB
        saveState(newState).catch(error => {
          console.error('Error saving state:', error);
        });

        // If API keys were updated, set them locally & save them to server
        if (shouldUpdateApiKeys) {
          saveApiKeysToServer(apiKeysToUpdate);
        }

        return newState;
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
                  messages: [],
                  pagination: {
                    pageSize: DEFAULT_PAGE_SIZE,
                    hasMoreMessages: false,
                    isLoadingMore: false
                  }
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
        // Find the conversation to initialize its pagination state
        if (conversationId && state.activeProjectId) {
          const project = state.projects.find(p => p.id === state.activeProjectId);
      const project = state.projects.find(p => p.id === state.activeProjectId);
      const conversation = project?.conversations.find(c => c.id === conversationId);
          
      // Always initialize/update pagination state when setting active conversation
      if (conversation) {
        conversation.pagination = initializePagination(conversation.messages);
      }
        }

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

    loadMoreMessages: async (projectId: string, conversationId: string) => {
      // Get current state
      const state = get();
      const project = state.projects.find(p => p.id === projectId);
      const conversation = project?.conversations.find(c => c.id === conversationId);

      if (!project || !conversation) {
        console.error('Project or conversation not found');
        return;
      }

      // Always initialize/update pagination state
      conversation.pagination = initializePagination(conversation.messages);

      // If already loading or no more messages, return
      if (conversation.pagination.isLoadingMore || !conversation.pagination.hasMoreMessages) {
        return;
      }

      // Set loading state
      set(state => ({
        ...state,
        projects: state.projects.map(p => p.id === projectId ? {
          ...p,
          conversations: p.conversations.map(c => c.id === conversationId ? {
            ...c,
            pagination: {
              ...c.pagination!,
              isLoadingMore: true
            }
          } : c)
        } : p)
      }));

      try {
        // Use the _allMessages from the conversation
        if (!conversation._allMessages) {
          // If _allMessages is not in memory, load from IndexedDB
          const fullState = await loadState();
          const fullProject = fullState.projects.find(p => p.id === projectId);
          const fullConversation = fullProject?.conversations.find(c => c.id === conversationId);

          if (!fullConversation) {
            throw new Error('Conversation not found in database');
          }
          conversation._allMessages = fullConversation._allMessages || fullConversation.messages;
        }

        // Calculate new message range
        const currentMessageCount = conversation.messages.length;
        const newMessageCount = Math.min(
          currentMessageCount + conversation.pagination.pageSize,
          conversation._allMessages.length
        );

        // Update state with new messages and pagination info
        set(state => ({
          ...state,
          projects: state.projects.map(p => p.id === projectId ? {
            ...p,
            conversations: p.conversations.map(c => c.id === conversationId ? {
              ...c,
              messages: conversation._allMessages.slice(-newMessageCount),
              pagination: {
                ...c.pagination!,
                isLoadingMore: false,
                hasMoreMessages: newMessageCount < conversation._allMessages.length
              }
            } : c)
          } : p)
        }));

      } catch (error) {
        console.error('Error loading more messages:', error);
        // Reset loading state on error
        set(state => ({
          ...state,
          projects: state.projects.map(p => p.id === projectId ? {
            ...p,
            conversations: p.conversations.map(c => c.id === conversationId ? {
              ...c,
              pagination: {
                ...c.pagination!,
                isLoadingMore: false
              }
            } : c)
          } : p)
        }));
      }
    },

    // MCP methods
    addServer: async (server: McpServer) => {
      set(state => ({
        servers: [...state.servers, { ...server, status: 'connecting', error: undefined }]
      }));

      try {
        const connectedServer = await connectToServer(server);
        const updatedState = {
          servers: get().servers.map(s => s.id === server.id ? connectedServer : s)
        };
        set(updatedState);
        await saveMcpServers(updatedState.servers);
        return connectedServer;
      } catch {
        const updatedState = {
          servers: get().servers.map(s => s.id === server.id
            ? { ...s, status: 'error' as const, error: 'Connection failed' }
            : s
          )
        };
        set(updatedState);
        saveMcpServers(updatedState.servers).catch((saveErr) => {
          console.error('Error saving MCP servers:', saveErr);
        });
        return get().servers.find(s => s.id === server.id);
      }
    },

    removeServer: (serverId: string) => {
      cleanupServer(serverId);
      const updatedState = {
        servers: get().servers.filter(s => s.id !== serverId)
      };
      set(updatedState);
      saveMcpServers(updatedState.servers).catch((err) => {
        console.error('Error saving MCP servers:', err);
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
      const isOnKinode = process.env.NEXT_PUBLIC_DEFAULT_WS_ENDPOINT;
      const isOnLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const defaultWsUri = !isOnKinode || isOnLocalhost ? 'ws://localhost:10125'
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
