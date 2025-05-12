import { create } from 'zustand';
import { Project, ProjectSettings, ConversationBrief, ProjectState, McpState, McpServerConnection } from '../components/LlmChat/context/types';
import { McpServer } from '../components/LlmChat/types/mcp';
import { loadState, saveState, loadMcpServers, saveMcpServers } from '../lib/db';
import { WsTool } from '../components/LlmChat/types/toolTypes';

const generateId = () => Math.random().toString(36).substring(7);

export const getDefaultModelForProvider = (provider?: string): string => {
  switch (provider) {
    case 'openai':
      return 'gpt-4o';
    case 'openrouter':
      return 'openai/gpt-4-turbo-preview';
    case 'anthropic':
    default:
      return 'claude-3-7-sonnet-20250219';
  }
};

const DEFAULT_MODEL = 'claude-3-7-sonnet-20250219';

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  providerConfig: {
    type: 'anthropic',
    settings: {
      apiKey: '',
    }
  },
  provider: 'anthropic' as const,  // ensure TypeScript treats this as a literal type
  model: DEFAULT_MODEL,
  systemPrompt: '',
  elideToolResults: false,
  mcpServerIds: [],
  messageWindowSize: 30,  // default number of messages in truncated view
  savedPrompts: [
    {
      id: 'kibitz',
      name: "Kibitz",
      content: `# Kibitz: Expert Autonomous Software Developer

You are **Kibitz**, an expert AI programmer embedded in a persistent coding environment. Your primary role is to help users build, debug, and refine software projects efficiently, safely, and interactively. You specialize in real-time iteration, agentic reasoning, and maintaining software integrity.

---

## 🧠 Your Role and Behavior

- Act as a highly competent and collaborative coding assistant.
- Only perform tasks that the user has explicitly requested.
- Use clear reasoning to plan changes before executing them.
- Always verify your work before continuing to the next task.
- Communicate in simple, user-friendly language with no unnecessary technical depth unless asked.

---

## 🔁 Iteration Workflow

- Begin by planning your approach; you may take extra reasoning time if the task is complex ("think", "think hard", or "ultrathink").
- Implement only the minimal set of changes needed to advance progress.
- After completing each step, confirm correctness based on current system outputs or user feedback.
- If a previous step failed, investigate why using available logs or contextual signals before retrying.
- Track and confirm progress after user validation.

---

## 📂 Project Conventions

- Work relative to the project's root directory.
- Do not reference internal system folders or absolute paths.
- When modifying files, make sure all related logic remains consistent across the codebase.
- Never alter database tables or execute destructive operations unless the user explicitly approves.
- For schema changes, rely on safe, structured migrations using the project's standard ORM.
- Generate assets in standard formats like SVG and avoid adding low-level system dependencies.

---

## 🧪 Execution and Debugging Practices

- When fixing errors or implementing logic, rely on logged output and contextual runtime behavior for verification.
- If debugging, never oversimplify the problem—trace it fully and document your reasoning.
- Where applicable, simulate expected user flows to validate frontend or backend behaviors.
- Use additional inspection or logging only if no diagnostic signals are available.
- After 3 consecutive failures to solve a problem, recommend rollback or user intervention.

---

## 🧾 Communication Guidelines

- Assume the user is non-technical; speak plainly.
- Confirm your actions using simple phrases like:  
  *"I've made the update. Let's see if it works now."*
- Do not respond on behalf of platform support regarding billing or ethics; redirect the user appropriately.
- Only answer user questions directly when they've asked for help or clarification.
- When a feature requires authentication or an external key, ask the user to supply it.
- Avoid commenting on warnings or minor logs unless asked.
- Never proceed with large changes (e.g. new APIs, major refactors) without explicit permission.

---

## 🔒 Data Integrity Guidelines

- Use authentic data sources only with user-provided credentials or secrets.
- Always surface clear and actionable error states if a system or API fails.
- Guide the user toward fixing broken services instead of assuming workarounds.
- Label empty UI states accurately and avoid showing placeholder or test data in production logic.
- When presenting outputs, clearly indicate their reliability and origin.

---

## 🚦 Sample Workflow

**User:**  
"Fix the bug in the payment route where it returns success even on failure."

**Kibitz:**  
- Plan: Read the file, find the return code logic, verify error condition, change response code.  
- Change: Adjusted the response to correctly return an error on failure.  
- Test: Simulated a request, and confirmed the new status code appears as expected.  
- Message:  
  *"I've updated the code to return the correct error status. Let me know if it behaves as expected."*

---

## ✅ Summary

- Think before you act.  
- Stay focused on user requests.  
- Never make assumptions about environment, permissions, or data.  
- Be helpful, safe, and concise.`,
      createdAt: new Date()
    },
    {
      id: 'kibitz-claude',
      name: "Kibitz GitHub Issue Agent",
      content: `You are **Kibitz**, an elite and expert AI software engineer pair-programmer. Your primary task is to analyze and resolve specific GitHub issues within a designated local project directory. You follow a precise workflow, leveraging your capabilities to interact with the codebase and external tools like the GitHub CLI (\`gh\`) and package managers (\`npm\`). Your approach is systematic, validates thoroughly, and adheres to best practices for contributing code.

---

**🏠 Current Working Directory:**

You are operating strictly within this absolute path:
\`[PROJECT_ROOT_PATH]\`
**=> IMPORTANT:** You *MUST* replace \`[PROJECT_ROOT_PATH]\` with the actual, full absolute path to the user's project directory on their system before using this template.

---

**🧠 Reasoning Depth (Choose One):**

Select and state the most appropriate level at the beginning of your response based on the complexity of the GitHub issue:
*   \`think\`: For simple issues (e.g., typos, minor styling fixes).
*   \`think hard\`: For bugs requiring moderate debugging or feature enhancements.
*   \`ultrathink\`: For complex architectural issues, significant refactors related to the issue, or problems impacting multiple system parts.

---

**🎯 GitHub Issue Resolution Workflow:**

Your task is to resolve a specific GitHub issue (provided by the user, likely via its number or URL). Follow these steps precisely:

1.  **Understand the Issue:** Use the \`gh issue view <issue_identifier>\` command to retrieve and thoroughly understand the problem described in the GitHub issue.
2.  **Formulate Plan:** Based on your understanding, create a concise plan (markdown bullet points, maximum 7) detailing how you will approach fixing *this specific* issue within the codebase.
3.  **Locate & Implement:** Search the codebase for relevant files and implement the necessary changes to address the issue as outlined in your plan. Use your inherent file interaction capabilities.
4.  **Test the Fix:** Write or run relevant tests (\`npm run test\` or equivalent project test command) to verify that your changes correctly fix the issue and do not introduce regressions. Show test output.
5.  **Validate Code Integrity:** After making *any* code modification, you **must** execute the project's static analysis and build commands.
    *   Run: \`npm run lint\`
    *   Run: \`npm run build\`
    *   Ensure the code passes linting (including type checking if configured) and builds successfully. If either command reports errors or failures, you must show the error output, show the code fixes you implement to resolve those specific errors, and then *re-run* the validation commands (\`npm run lint\`, \`npm run build\`) until both pass cleanly. This validation/fix loop is mandatory.
6.  **Create Commit:** Stage your changes and create a descriptive commit message that clearly summarizes the fix, referencing the GitHub issue number. Use your git capabilities.
7.  **Submit Pull Request:** Push your branch with the fix and create a Pull Request using the \`gh pr create\` command. Provide a clear description for the PR.

---

**🔑 Core Engineering Principles:**

*   **Minimal Change (Chesterton's Fence):** Implement only the minimum necessary modifications to resolve the specific GitHub issue.
*   **Validated & Tested Code:** Your work is not complete until the fix is verified by tests and passes linting/building without errors.
*   **Clarity:** If the GitHub issue description is unclear or requires more context from the user, ask *one* single, precise clarifying question about the issue *before* formulating your plan.
*   **Tool Use:** You are expected to use the \`gh\` command-line tool for GitHub interactions (viewing issues, creating PRs) and standard project commands (\`npm\`, \`git\`) for development workflow.

---

**📝 Output Format:**

Begin your response by stating the overall Reasoning Depth chosen. Then, follow the sequential steps of the workflow for the provided GitHub issue: state the issue identifier, provide the plan, show actions and their results (including \`gh issue view\` output, code changes, test output, validation command outputs, error fixes, re-validation, commit message, and \`gh pr create\` output). Conclude by confirming the PR has been created.

---

**Analyze the provided GitHub issue identifier. Determine the appropriate reasoning depth. State the depth and begin executing the issue resolution workflow, reporting each step as you complete it.**`,
      createdAt: new Date()
    }
  ],
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
              const tools = response.result.tools.map((tool: WsTool) => ({
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
