import { create } from 'zustand';
import { Project, ProjectSettings, ConversationBrief, ProjectState, McpState, McpServerConnection, WorkspaceMapping, WorkspaceCreationOptions, ConversationWorkspaceSettings } from '../components/LlmChat/context/types';
import { McpServer } from '../components/LlmChat/types/mcp';
import { loadState, saveState, loadMcpServers, saveMcpServers, loadWorkspaceMappings, saveWorkspaceMappings, getWorkspaceByConversationId, updateWorkspaceMapping, deleteWorkspaceMapping } from '../lib/db';
import { WsTool } from '../components/LlmChat/types/toolTypes';
import { autoInitializeGitForProject } from '../lib/gitAutoInitService';
import { ensureProjectDirectory, getProjectPath, sanitizeProjectName } from '../lib/projectPathService';
import { recordSystemError, shouldThrottleOperation } from '@/lib/systemDiagnostics';
import { createWorkspaceMapping } from '../lib/conversationWorkspaceService';
import { initializeAutoCommitAgent, stopAutoCommitAgent, getAutoCommitAgent } from '../lib/autoCommitAgent';

const generateId = () => Math.random().toString(36).substring(7);

// Removed global call stack - using simpler recursion prevention

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

// Small, fast commit-model defaults per provider (used only to seed settings)
const getSmallCommitModelForProvider = (provider?: string): string => {
  switch (provider) {
    case 'openai':
      return 'gpt-4o-mini';
    case 'openrouter':
      return 'openai/gpt-4o-mini';
    case 'anthropic':
    default:
      return 'claude-3-5-haiku-20241022';
  }
};

// Ensure commit-specific settings exist without overriding explicit user choices
const ensureCommitDefaults = (settings: ProjectSettings): ProjectSettings => {
  const commitProvider = settings.commitProvider || settings.provider;
  const commitModel = settings.commitModel && settings.commitModel.trim()
    ? settings.commitModel
    : getSmallCommitModelForProvider(commitProvider);
  return {
    ...settings,
    commitProvider,
    commitModel
  };
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
  // Default commit settings use the small/fast model for the current provider
  commitProvider: 'anthropic',
  commitModel: getSmallCommitModelForProvider('anthropic'),
  systemPrompt: '',
  elideToolResults: false,
  mcpServerIds: [],
  messageWindowSize: 30,  // legacy 
  enableGitHub: true,  // GitHub integration enabled by default
  // Default threshold: require at least 2 changed files before auto commit/push
  minFilesForAutoCommitPush: 2,
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
  updateApiKeys: (keys: Record<string, string>) => void;
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
  // Workspace methods
  createConversationWorkspace: (conversationId: string, options?: WorkspaceCreationOptions) => Promise<WorkspaceMapping>;
  deleteConversationWorkspace: (conversationId: string) => Promise<void>;
  switchConversationWorkspace: (conversationId: string) => Promise<void>;
  getConversationWorkspace: (conversationId: string) => WorkspaceMapping | null;
  updateConversationSettings: (projectId: string, conversationId: string, settings: Partial<ConversationWorkspaceSettings>) => void;
  // MCP methods
  addServer: (server: McpServer) => Promise<McpServerConnection | undefined>;
  removeServer: (serverId: string) => void;
  reconnectServer: (serverId: string) => Promise<McpServerConnection>;
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>;
  attemptLocalMcpConnection: () => Promise<McpServerConnection | null>;
  // New methods
  ensureActiveProjectDirectory: () => Promise<void>;
}

export const useStore = create<RootState>((set, get) => {
  // Using refs outside the store to maintain WebSocket connections
  const connectionsRef = new Map<string, WebSocket>();
  const reconnectTimeoutsRef = new Map<string, NodeJS.Timeout>();
  const pendingRequestsRef = new Map<string, { 
    resolve: (result: string) => void; 
    reject: (error: Error) => void;
    toolName?: string;
    args?: Record<string, unknown>;
    serverId?: string;
  }>();
  
  // Circuit breaker removed - let MCP handle its own error management
  
  // Throttling mechanism for workspace initialization
  const initializationThrottleRef = new Map<string, number>();
  const INITIALIZATION_THROTTLE_MS = 1000; // Reduced from 5000ms to 1000ms for better responsiveness

  // Helper function to save API keys to server (masked persistence channel)
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

  // Helper method to initialize auto-commit agent for a project
  const initializeAutoCommitForProject = async (projectId: string): Promise<void> => {
    try {
      console.log(`🔧 Initializing auto-commit agent for project: ${projectId}`);
      
      const state = get();
      const project = state.projects.find(p => p.id === projectId);
      
      if (!project) {
        console.warn(`Project ${projectId} not found, skipping auto-commit initialization`);
        return;
      }
      
      // Find connected MCP servers
      const connectedServers = state.servers.filter(server => 
        server.status === 'connected' && project.settings.mcpServerIds?.includes(server.id)
      );
      
      if (connectedServers.length === 0) {
        console.warn(`No connected MCP servers for project ${project.name}, skipping auto-commit initialization`);
        return;
      }
      
      const mcpServerId = connectedServers[0].id;
      
      // Create auto-commit context
      const autoCommitContext = {
        projectId: project.id,
        projectName: project.name,
        activeConversationId: state.activeConversationId,
        mcpServerId: mcpServerId,
        executeTool: state.executeTool
      };
      
      console.log(`🔧 Auto-commit context created:`, {
        projectId: autoCommitContext.projectId,
        projectName: autoCommitContext.projectName,
        activeConversationId: autoCommitContext.activeConversationId,
        mcpServerId: autoCommitContext.mcpServerId,
        hasExecuteTool: typeof autoCommitContext.executeTool === 'function'
      });
      
      // Stop any existing agent
      await stopAutoCommitAgent();
      
      // Initialize the agent with the context
      await initializeAutoCommitAgent(autoCommitContext);
      
      console.log(`✅ Auto-commit agent initialized for project: ${project.name}`);
      
    } catch (error) {
      console.error(`❌ Failed to initialize auto-commit agent for project ${projectId}:`, error);
    }
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
            } else {
              // Handle tool execution responses
              const pendingRequest = pendingRequestsRef.get(response.id);
              if (pendingRequest) {
                pendingRequestsRef.delete(response.id);
                
                // 🔍 ENHANCED DEBUGGING: Log detailed MCP response
                console.log('🔧 MCP Response Details:', {
                  requestId: response.id,
                  hasError: !!response.error,
                  errorDetails: response.error,
                  resultType: typeof response.result,
                  fullResponse: JSON.stringify(response, null, 2),
                  timestamp: new Date().toISOString()
                });
                
                if (response.error) {
                  // 🔍 SPECIAL HANDLING: Check for validation errors and provide detailed info
                  const errorMessage = response.error.message || 'Tool execution failed';
                  
                  // 🔧 IMPROVED: Special handling for Initialize tool parsing errors
                  if (pendingRequest.toolName === 'Initialize' && errorMessage.includes('validation')) {
                    console.error('🚨 CRITICAL: Initialize tool argument parsing error:', {
                      error: errorMessage,
                      fullError: response.error,
                      originalArgs: pendingRequest.args,
                      suggestion: 'MCP server failed to parse Initialize arguments'
                    });
                    
                    // Try simplified Initialize args as fallback
                    if (!pendingRequest.args?.simplified_retry) {
                      console.log('🔄 Attempting Initialize with simplified arguments...');
                      const simplifiedArgs = {
                        type: "first_call",
                        any_workspace_path: pendingRequest.args?.any_workspace_path || ".",
                        simplified_retry: true
                      };
                      
                      // Retry with simplified args
                      setTimeout(() => {
                        get().executeTool(pendingRequest.serverId!, pendingRequest.toolName!, simplifiedArgs)
                          .then(result => pendingRequest.resolve(result))
                          .catch(retryError => pendingRequest.reject(retryError));
                      }, 1000);
                      return; // Don't reject yet, wait for retry
                    }
                  }
                  
                  if (errorMessage.includes('type') && errorMessage.includes('required property')) {
                    console.error('🚨 CRITICAL: MCP Server Tool Validation Error:', {
                      tool: pendingRequest.toolName,
                      error: errorMessage,
                      fullError: response.error,
                      args: JSON.stringify(pendingRequest.args, null, 2),
                      suggestion: 'The MCP server schema expects different argument format',
                      recommendation: 'Check tool schema compatibility'
                    });
                  }
                  pendingRequest.reject(new Error(errorMessage));
                } else {
                  // Extract the result content - handle different response formats
                  let result = '';
                  if (response.result) {
                    if (typeof response.result === 'string') {
                      result = response.result;
                    } else if (response.result.content && Array.isArray(response.result.content)) {
                      result = response.result.content
                        .filter((item: any) => item.type === 'text')
                        .map((item: any) => item.text)
                        .join('\n');
                    } else if (response.result.content && typeof response.result.content === 'string') {
                      result = response.result.content;
                    } else {
                      result = JSON.stringify(response.result);
                    }
                  }
                  
                  console.log('🔧 MCP Success Result:', {
                    resultLength: result.length,
                    resultPreview: result.substring(0, 200) + (result.length > 200 ? '...' : ''),
                    resultType: typeof result
                  });
                  
                  pendingRequest.resolve(result);
                }
              }
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

  // Workspace mappings state
  let workspaceMappings: WorkspaceMapping[] = [];

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
    updateApiKeys: (keys: Record<string, string>) => {
      set(state => {
        const merged = { ...state.apiKeys, ...keys };
        // Immediately persist to server so secrets don't linger only in memory
        saveApiKeysToServer(merged);
        return { apiKeys: merged } as Partial<RootState> as any;
      });
    },

    // Initialization
    initialize: async () => {
      if (get().initialized) return;

      try {
        // Initialize database integration service
        try {
          const { initializeDatabaseIntegration } = await import('../lib/existingDatabaseIntegration');
          await initializeDatabaseIntegration();
          console.log('✅ Database integration service initialized');
        } catch (error) {
          console.error('❌ Failed to initialize database integration:', error);
        }

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

        // Always load server config to get projectsBaseDir and set runtime hint early
        try {
          const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';
          const resCfg = await fetch(`${BASE_PATH}/api/keys/config`).catch(() => null);
          if (resCfg && resCfg.ok) {
            const data = await resCfg.json();
            const dir = data?.config?.projectsBaseDir as string | undefined;
            if (dir && typeof dir === 'string' && dir.trim()) {
              const cleaned = dir.trim().replace(/[•\u2022]+/g, '').replace(/\/+$/, '');
              set(state => ({ apiKeys: { ...state.apiKeys, projectsBaseDir: cleaned } } as any));
              try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (window as any).__KIBITZ_PROJECTS_BASE_DIR__ = cleaned;
              } catch {}
            }
          }
        } catch (error) {
          console.warn('Failed to load server config (projectsBaseDir):', error);
        }

        // Load workspace mappings
        try {
          workspaceMappings = await loadWorkspaceMappings();
          console.log(`Loaded ${workspaceMappings.length} workspace mappings`);
        } catch (error) {
          console.error('Failed to load workspace mappings:', error);
          workspaceMappings = [];
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
            projects: state.projects.map(p => ({
              ...p,
              settings: ensureCommitDefaults(p.settings)
            })),
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

          // Track default project in database
          try {
            const { getDatabaseIntegrationService } = await import('../lib/existingDatabaseIntegration');
            const dbService = getDatabaseIntegrationService();
            
            await dbService.createProjectWithTracking(
              defaultConversation.id,
              defaultProject.name,
              defaultProject.settings
            );
            
            console.log(`✅ Default project tracked in database with ID: ${defaultProject.id}`);
          } catch (error) {
            console.error('❌ Failed to track default project in database:', error);
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
      const state = get();
      const projectId = generateId();
      
      const defaultSettings: ProjectSettings = {
        provider: 'anthropic' as const,
        model: 'claude-3-5-sonnet-20241022',
        commitProvider: 'anthropic',
        commitModel: getSmallCommitModelForProvider('anthropic'),
        systemPrompt: '',
        mcpServerIds: [],
        elideToolResults: false,
        messageWindowSize: 20,
        enableGitHub: true  // Default to true - GitHub sync enabled by default
      };

      const mergedSettings = ensureCommitDefaults({ ...defaultSettings, ...settings } as ProjectSettings);

      // Prefer a UI-configured base dir immediately to avoid fallback to hardcoded path
      let uiBaseDir: string | undefined;
      try {
        // from in-memory apiKeys first
        uiBaseDir = (state.apiKeys as any)?.projectsBaseDir as string | undefined;
        // then from localStorage (persisted across reloads)
        if (!uiBaseDir && typeof window !== 'undefined') {
          uiBaseDir = window.localStorage?.getItem('kibitz_projects_base_dir') || undefined;
        }
        if (uiBaseDir) {
          uiBaseDir = uiBaseDir.trim().replace(/[•\u2022]+/g, '').replace(/\/+$/, '');
          if (!uiBaseDir.startsWith('/') && /^Users\//.test(uiBaseDir)) uiBaseDir = '/' + uiBaseDir;
          // expose runtime hint so client resolvers see it
          try { (window as any).__KIBITZ_PROJECTS_BASE_DIR__ = uiBaseDir; } catch {}
        }
      } catch {}

      const newProject: Project = {
        id: projectId,
        name,
        settings: mergedSettings,
        conversations: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        order: Math.max(...state.projects.map(p => p.order), 0) + 1,
        // If we have a UI base dir, set a concrete customPath so downstream code
        // never falls back to the hardcoded default for this project
        ...(uiBaseDir
          ? { customPath: `${uiBaseDir}/${projectId}_${sanitizeProjectName(name)}` }
          : {})
      };

      const updatedState: ProjectState = {
        ...state,
        projects: [...state.projects, newProject],
        activeProjectId: projectId,
        activeConversationId: null
      };

      set(updatedState);

      // 🔧 NEW: Integrate database tracking
      (async () => {
        try {
          const { getDatabaseIntegrationService } = await import('../lib/existingDatabaseIntegration');
          const dbService = getDatabaseIntegrationService();
          
          // Create a default conversation for the project
          const conversationId = generateId();
          
          // Track project creation in database
          await dbService.createProjectWithTracking(
            conversationId,
            name,
            mergedSettings
          );
          
          console.log(`✅ Project ${name} tracked in database with ID: ${projectId}`);
        } catch (error) {
          console.error('❌ Failed to track project in database:', error);
        }
      })();

      // Find connected MCP servers
      const connectedServerIds = state.servers
        .filter(server => server.status === 'connected')
        .map(server => server.id);

      // Add first connected server to project's MCP servers
      if (connectedServerIds.length > 0) {
        const updatedSettings = {
          ...mergedSettings,
          mcpServerIds: [connectedServerIds[0]]
        };
        
        get().updateProjectSettings(projectId, { settings: updatedSettings });
      }

      saveState(updatedState).catch(error => {
        console.error('Error saving state:', error);
      });

      // Set up project directory and Git when MCP servers are available
      if (connectedServerIds.length > 0) {
        // Delay to ensure state is updated
        setTimeout(() => {
          const setupProject = async () => {
            try {
              const { executeTool } = get();
              const mcpServerId = connectedServerIds[0];
              
              // Ensure project directory exists
              const projectPath = await ensureProjectDirectory(newProject, mcpServerId, executeTool);
              console.log(`Project directory set up at: ${projectPath}`);
              
              // Initialize .kibitz directory structure
              try {
                console.log(`🔧 Creating .kibitz directory structure for project: ${name}`);
                await executeTool(mcpServerId, 'BashCommand', {
                  action_json: {
                    command: `cd "${projectPath}" && mkdir -p .kibitz/api`,
                    type: 'command'
                  },
                  thread_id: 'git-operations'
                });
                console.log(`✅ .kibitz directory structure created for project: ${name}`);
              } catch (kibitzError) {
                console.warn(`⚠️ Failed to create .kibitz directory:`, kibitzError);
              }
              
              // Initialize Git repository
              autoInitializeGitForProject(projectId, name, projectPath, mcpServerId, executeTool)
                .then(result => {
                  if (result.success) {
                    console.log('Git repository initialized for project:', name);
                    // 🌐 Enable GitHub sync and let background provisioning run
                    try {
                      fetch('/api/github-sync/config', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          projectId,
                          projectName: name,
                          enabled: true,
                          // Only main and conversation step branches
                          syncBranches: ['main', 'conv-*'],
                          authentication: { type: 'token', configured: true }
                        })
                      }).then(() => {
                        console.log('✅ GitHub sync config posted for new project');
                      }).catch(err => console.warn('⚠️ Failed to post GitHub config for new project:', err));
                    } catch (e) {
                      console.warn('⚠️ Could not schedule GitHub sync config for new project:', e);
                    }
                  } else {
                    console.warn('Git repository initialization failed:', result.message);
                  }
                })
                .catch(error => {
                  console.error('Error initializing Git repository:', error);
                });

              // Initialize auto-commit agent for the new project
              console.log(`🔧 Setting up auto-commit agent for new project: ${name}`);
              await initializeAutoCommitForProject(projectId);
              
            } catch (error) {
              console.error('Error setting up project directory:', error);
            }
          };
          
          setupProject();
        }, 2000); // Increased delay to ensure MCP servers and Git are ready
      }

      return projectId;
    },

    createProjectFromClonedRepo: async (repoPath: string, projectName?: string): Promise<string> => {
      const state = get();
      const { executeTool } = state;
      
      // Find connected MCP servers
      const connectedServerIds = state.servers
        .filter(server => server.status === 'connected')
        .map(server => server.id);

      if (connectedServerIds.length === 0) {
        throw new Error('No connected MCP servers available. Please connect a server first.');
      }

      const mcpServerId = connectedServerIds[0];
      
      // Import the function dynamically to avoid circular dependency
      const { createProjectFromClonedRepo } = await import('../lib/projectPathService');
      
      // Create project configuration from cloned repo
      const repoConfig = await createProjectFromClonedRepo(
        repoPath, 
        projectName, 
        mcpServerId, 
        executeTool
      );
      
      const projectId = generateId();
      
       const defaultSettings: ProjectSettings = {
         provider: 'anthropic' as const,
         model: 'claude-3-5-sonnet-20241022',
         commitProvider: 'anthropic',
         commitModel: getSmallCommitModelForProvider('anthropic'),
         systemPrompt: '',
         mcpServerIds: [mcpServerId],
         elideToolResults: false,
         messageWindowSize: 20,
         enableGitHub: true  // Default to true - GitHub sync enabled by default
       };

      const newProject: Project = {
        id: projectId,
        name: repoConfig.name,
        settings: defaultSettings,
        conversations: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        order: Math.max(...state.projects.map(p => p.order), 0) + 1,
        customPath: repoConfig.customPath  // Store the custom path for cloned repo
      };

      const updatedState: ProjectState = {
        ...state,
        projects: [...state.projects, newProject],
        activeProjectId: projectId,
        activeConversationId: null
      };

      set(updatedState);

      saveState(updatedState).catch(error => {
        console.error('Error saving state:', error);
      });

      console.log(`Created project "${repoConfig.name}" from cloned repository: ${repoConfig.customPath}`);
      
      if (repoConfig.repoInfo?.isCloned) {
        console.log(`Detected cloned repository from: ${repoConfig.repoInfo.repoUrl}`);
      }

      return projectId;
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

            // Merge settings and ensure commit defaults remain populated (without overriding explicit values)
            const merged = updates.settings
              ? {
                  ...p.settings,
                  ...updates.settings,
                  mcpServerIds: updates.settings.mcpServerIds !== undefined
                    ? updates.settings.mcpServerIds
                    : p.settings.mcpServerIds
                }
              : p.settings;

            // If provider changed and commitModel not explicitly provided in updates, preserve existing commitModel if present,
            // otherwise seed with the small model for the (new) provider.
            const providerChanged = !!updates.settings?.provider && updates.settings?.provider !== p.settings.provider;
            let nextSettings = merged as ProjectSettings;
            if (providerChanged && !updates.settings?.commitModel) {
              nextSettings = {
                ...nextSettings,
                commitProvider: nextSettings.commitProvider || nextSettings.provider,
                commitModel: nextSettings.commitModel && nextSettings.commitModel.trim()
                  ? nextSettings.commitModel
                  : getSmallCommitModelForProvider(updates.settings!.provider)
              } as ProjectSettings;
            }

            // Ensure commit defaults exist generally
            nextSettings = ensureCommitDefaults(nextSettings);

            return {
              ...p,
              settings: nextSettings,
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

      // 🔧 NEW: Track conversation in database
      (async () => {
        try {
          const { getDatabaseIntegrationService } = await import('../lib/existingDatabaseIntegration');
          const dbService = getDatabaseIntegrationService();
          
          await dbService.trackConversation(conversationId, projectId, name || '(New Chat)');
          console.log(`✅ Conversation ${name || '(New Chat)'} tracked in database`);
        } catch (error) {
          console.error('❌ Failed to track conversation in database:', error);
        }
      })();
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

      // Initialize auto-commit agent for the new active project
      if (projectId) {
        // Use setTimeout to ensure state is updated first
        setTimeout(() => {
          initializeAutoCommitForProject(projectId).catch(error => {
            console.error(`Failed to initialize auto-commit for project ${projectId}:`, error);
          });
        }, 1000);
      } else {
        // Stop auto-commit agent if no project is active
        stopAutoCommitAgent().catch(error => {
          console.error('Failed to stop auto-commit agent:', error);
        });
      }
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

    // Workspace methods
    createConversationWorkspace: async (conversationId: string, options?: WorkspaceCreationOptions): Promise<WorkspaceMapping> => {
      const { activeProjectId, projects } = get();
      
      if (!activeProjectId) {
        throw new Error('No active project');
      }

      const project = projects.find(p => p.id === activeProjectId);
      if (!project) {
        throw new Error('Active project not found');
      }

      // Find the conversation
      const conversation = project.conversations.find(c => c.id === conversationId);
      if (!conversation) {
        throw new Error('Conversation not found');
      }

      // Create workspace mapping
      const workspaceMapping = createWorkspaceMapping(
        conversationId,
        activeProjectId,
        conversation.name,
        options
      );

      try {
        // Save to database
        const existingMappings = await loadWorkspaceMappings();
        const updatedMappings = [...existingMappings, workspaceMapping];
        await saveWorkspaceMappings(updatedMappings);

        // Update local state
        workspaceMappings = updatedMappings;

        console.log(`Created workspace for conversation ${conversationId}: ${workspaceMapping.workspacePath}`);
        return workspaceMapping;
      } catch (error) {
        console.error('Failed to create conversation workspace:', error);
        throw new Error(`Failed to create conversation workspace: ${error instanceof Error ? error.message : String(error)}`);
      }
    },

    deleteConversationWorkspace: async (conversationId: string): Promise<void> => {
      try {
        const workspace = await getWorkspaceByConversationId(conversationId);
        if (!workspace) {
          console.warn(`No workspace found for conversation ${conversationId}`);
          return;
        }

        // Delete from database
        await deleteWorkspaceMapping(workspace.workspaceId);

        // Update local state
        workspaceMappings = workspaceMappings.filter(w => w.conversationId !== conversationId);

        console.log(`Deleted workspace for conversation ${conversationId}`);
      } catch (error) {
        console.error('Failed to delete conversation workspace:', error);
        throw new Error(`Failed to delete conversation workspace: ${error instanceof Error ? error.message : String(error)}`);
      }
    },

    switchConversationWorkspace: async (conversationId: string): Promise<void> => {
      try {
        const workspace = await getWorkspaceByConversationId(conversationId);
        if (!workspace) {
          throw new Error(`No workspace found for conversation ${conversationId}`);
        }

        // Update last accessed time
        const updatedWorkspace = {
          ...workspace,
          lastAccessedAt: new Date()
        };

        await updateWorkspaceMapping(updatedWorkspace);

        // Update local state
        workspaceMappings = workspaceMappings.map(w => 
          w.conversationId === conversationId ? updatedWorkspace : w
        );

        console.log(`Switched to workspace for conversation ${conversationId}: ${workspace.workspacePath}`);
      } catch (error) {
        console.error('Failed to switch conversation workspace:', error);
        throw new Error(`Failed to switch conversation workspace: ${error instanceof Error ? error.message : String(error)}`);
      }
    },

    getConversationWorkspace: (conversationId: string): WorkspaceMapping | null => {
      return workspaceMappings.find(w => w.conversationId === conversationId) || null;
    },

    updateConversationSettings: (projectId: string, conversationId: string, settings: Partial<ConversationWorkspaceSettings>): void => {
      set(state => {
        const newState = {
          ...state,
          projects: state.projects.map(p => {
            if (p.id !== projectId) return p;
            return {
              ...p,
              conversations: p.conversations.map(c => {
                if (c.id !== conversationId) return c;
                return {
                  ...c,
                  settings: {
                    ...c.settings,
                    ...settings
                  }
                };
              }),
              updatedAt: new Date()
            };
          })
        };

        saveState(newState).catch(error => {
          console.error('Error saving conversation settings:', error);
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

    executeTool: async (serverId: string, toolName: string, args: Record<string, unknown>) => {
      // Guard: Skip Initialize if server doesn't support it
      try {
        const serverForGuard = get().servers.find(s => s.id === serverId);
        const hasInitializeTool = !!serverForGuard?.tools?.some(t =>
          (t.name || '').toLowerCase() === 'initialize'
        );
        if (toolName === 'Initialize' && !hasInitializeTool) {
          console.warn(`🔧 Skipping Initialize for server ${serverId} - tool not available`);
          return 'Initialize skipped: tool not supported by server';
        }
      } catch (guardErr) {
        console.warn('Initialize guard check failed (continuing without preflight):', guardErr);
      }
      // 🚀 PERFORMANCE: Quick early validation
      const isInternalCall = args.thread_id && 
        (String(args.thread_id).includes('git-') || 
         String(args.thread_id).includes('commit-') ||
         String(args.thread_id).includes('auto-') ||
         String(args.thread_id).includes('operations') ||
         String(args.thread_id).includes('check'));
      
      // 🚀 PERFORMANCE: Reduce logging overhead - only log critical errors and non-internal calls
      const shouldLogDetails = !isInternalCall || toolName === 'BashCommand';
      
      if (shouldLogDetails) {
        console.log('🔧 executeTool:', { serverId, toolName, isInternalCall });
      }
      
      // 🔍 CRITICAL DEBUG: Check for raw command format in BashCommand BEFORE processing
      if (toolName === 'BashCommand' && args.command && !args.action_json) {
        console.error('🚨 CRITICAL: BashCommand called with raw command format!', {
          command: args.command,
          hasActionJson: !!args.action_json
        });
      }
      
      const connection = connectionsRef.get(serverId);
      if (!connection) {
        recordSystemError('CONNECTION', `No connection found for server ${serverId}`);
        throw new Error(`No connection found for server ${serverId}`);
      }

      // 🚀 PERFORMANCE: Only check WebSocket state if logging is needed
      if (shouldLogDetails && toolName === 'BashCommand') {
        const stateNames = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];
        const stateName = stateNames[connection.readyState] || 'UNKNOWN';
        console.log(`🔧 BashCommand WebSocket: ${stateName} (pending: ${pendingRequestsRef.size})`);
      }

      if (connection.readyState !== WebSocket.OPEN) {
        const stateNames = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];
        const stateName = stateNames[connection.readyState] || 'UNKNOWN';
        console.warn(`WebSocket is ${stateName} for server ${serverId} when executing ${toolName}`);
        
        // For BashCommand, be more aggressive about reconnection
        if (toolName === 'BashCommand' || connection.readyState === WebSocket.CLOSED) {
          const server = get().servers.find(s => s.id === serverId);
          if (server) {
            console.log(`Attempting to reconnect WebSocket for ${serverId} (${toolName} execution)`);
            try {
              await connectToServer(server);
              const newConnection = connectionsRef.get(serverId);
              if (newConnection && newConnection.readyState === WebSocket.OPEN) {
                console.log(`✅ WebSocket reconnected successfully for ${serverId}, retrying ${toolName}`);
                // Retry with new connection
                return get().executeTool(serverId, toolName, args);
              }
            } catch (reconnectError) {
              recordSystemError('WEBSOCKET_RECONNECT', reconnectError);
              console.error(`Failed to reconnect WebSocket for ${serverId}:`, reconnectError);
            }
          }
        }
        
        throw new Error(`WebSocket is not open for server ${serverId} (state: ${stateName}). Try reconnecting the MCP server.`);
      }

      // Get current project context for path interception
      const { activeProjectId, projects } = get();
      const project = activeProjectId ? projects.find(p => p.id === activeProjectId) : null;

      // 🚀 OPTIMIZED: Streamlined path interception without unnecessary initialization
      let modifiedArgs = { ...args };
      
      // 🚨 CRITICAL: Workspace enforcement for tools that support any_workspace_path
      if (project) {
          const projectPath = getProjectPath(project.id, project.name);
          // If user set a base path in Admin panel (apiKeys.projectsBaseDir), honor it immediately on client
          try {
            const uiBase = (get().apiKeys as any)?.projectsBaseDir as string | undefined;
            if (uiBase && uiBase.trim()) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (window as any).__KIBITZ_PROJECTS_BASE_DIR__ = uiBase.trim().replace(/\/+$/, '');
            }
          } catch {}
        
        // Only tools that actually support any_workspace_path parameter
        const workspaceAwareTools = ['Initialize'];
        
        if (workspaceAwareTools.includes(toolName)) {
          console.log(`🔧 ${toolName} - Setting workspace path to: ${projectPath}`);
          
          // Force workspace path for workspace-aware tools
          if (!modifiedArgs.any_workspace_path || modifiedArgs.any_workspace_path !== projectPath) {
            console.log(`🔒 CRITICAL: Setting ${toolName} any_workspace_path to project directory`);
            modifiedArgs = {
              ...modifiedArgs,
              any_workspace_path: projectPath
            };
          }
        }
      }
      
      // 🔍 DEBUG: Log tool execution details for workspace debugging
      if (toolName === 'Initialize') {
        console.log(`🔧 Initialize tool called with args:`, JSON.stringify(modifiedArgs, null, 2));
        
        // 🚨 CRITICAL: Ensure Initialize always uses 'git-operations' thread_id
        if (!modifiedArgs.thread_id || modifiedArgs.thread_id !== 'git-operations') {
          console.log(`🔒 CRITICAL: Fixing Initialize thread_id from "${modifiedArgs.thread_id}" to "git-operations"`);
          modifiedArgs = {
            ...modifiedArgs,
            thread_id: 'git-operations'
          };
        }
        
        console.log(`🔧 Cleaned Initialize args:`, JSON.stringify(modifiedArgs, null, 2));
      }
      
      // 🚨 TEMPORARILY DISABLED: Project directory setup to prevent recursion
      // This will be re-enabled after fixing the recursion issue
      if (false && project && (toolName === 'FileWriteOrEdit' || toolName === 'BashCommand') && !modifiedArgs.any_workspace_path) {
        console.log(`🔧 Project directory setup temporarily disabled to prevent recursion`);
      }
      
      // 🔍 CRITICAL DEBUG: Check if project exists for BashCommand processing
      if (toolName === 'BashCommand') {
        console.log('🔧 BashCommand processing check:', {
          hasProject: !!project,
          activeProjectId,
          projectsCount: projects.length,
          projectFound: project ? { id: project.id, name: project.name } : null
        });
      }
      
      if (project && (toolName === 'BashCommand' || toolName === 'FileWriteOrEdit')) {
        const projectPath = getProjectPath(project.id, project.name);
        try {
          const uiBase = (get().apiKeys as any)?.projectsBaseDir as string | undefined;
          if (uiBase && uiBase.trim()) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (window as any).__KIBITZ_PROJECTS_BASE_DIR__ = uiBase.trim().replace(/\/+$/, '');
          }
        } catch {}
        
        // For BashCommand: ensure commands use full project path, not just project ID
        if (toolName === 'BashCommand' && modifiedArgs.command) {
          let command = modifiedArgs.command as string;
          
          // 🔍 DEBUG: Log original command for path debugging
          console.log(`🔧 Original BashCommand: ${command}`);
          
          // 🚨 CRITICAL FIX: Replace project ID-only paths with full project paths
          if (command.includes(`cd "${project.id}"`)) {
            console.log(`🔒 Intercepted project ID-only path: cd "${project.id}"`);
            command = command.replace(`cd "${project.id}"`, `cd "${projectPath}"`);
            console.log(`🔧 Fixed to full path: ${command}`);
          }
          
          // 🚨 ADDITIONAL FIX: Handle git commands that might use project ID paths
          if (command.includes(`"${project.id}"`) && !command.includes(projectPath)) {
            console.log(`🔒 Intercepted project ID in command: ${command}`);
            command = command.replace(`"${project.id}"`, `"${projectPath}"`);
            console.log(`🔧 Fixed project ID path: ${command}`);
          }
          
          // Block subdirectory creation attempts
          if (command.includes('mkdir -p') && !command.includes(projectPath)) {
            const isMkdirProjectDir = command.includes(`mkdir -p "${projectPath}"`);
            if (!isMkdirProjectDir) {
              console.log(`🔒 Intercepted mkdir command: ${command}`);
              // Replace with a pwd command to show current directory
              command = `pwd`;
            }
          }
          
          // 🚨 CRITICAL FIX: Ensure ALL commands run in the project directory
          if (!command.includes(`cd "`)) {
            console.log(`🔧 Prepending project path to ALL commands: ${command}`);
            command = `cd "${projectPath}" && ${command}`;
            console.log(`🔧 Command now runs in project directory: ${command}`);
          }
          
          console.log(`🔧 Final BashCommand: ${command}`);
          
          // Remove the raw command property and use only action_json format
          const { command: _, ...argsWithoutCommand } = modifiedArgs;
          modifiedArgs = {
            ...argsWithoutCommand,
            action_json: {
              command: command,
              type: 'command' // Move type field inside action_json where it belongs
            },
            thread_id: modifiedArgs.thread_id
          };
        }
        
        // For FileWriteOrEdit: ensure file paths are absolute and in project directory
        if (toolName === 'FileWriteOrEdit' && modifiedArgs.file_path) {
          let filePath = modifiedArgs.file_path as string;
          
          console.log(`🔧 FileWriteOrEdit path processing: "${filePath}" for project: ${projectPath}`);
          
          // 🚨 CRITICAL: Block any cloud playground or temp directory paths immediately
          if (filePath.includes('/T/claude-playground-') || filePath.includes('/var/folders/') || filePath.includes('/tmp/')) {
            const fileName = filePath.split('/').pop() || 'file.txt';
            filePath = `${projectPath}/${fileName}`;
            console.log(`🚨 BLOCKED cloud playground path - redirected to: ${filePath}`);
          }
          // If it's a relative path, make it absolute within the project directory
          else if (!filePath.startsWith('/')) {
            filePath = `${projectPath}/${filePath}`;
            console.log(`🔧 Converted relative to absolute path: ${filePath}`);
          }
          // If it's an absolute path outside our project, redirect it to project directory
          else if (!filePath.startsWith(projectPath)) {
            const fileName = filePath.split('/').pop() || 'file.txt';
            filePath = `${projectPath}/${fileName}`;
            console.log(`🔒 Redirected external path to project: ${filePath}`);
          }
          
          // Handle subdirectory attempts - flatten to project root, except .kibitz/* metadata
          if (filePath.includes('/') && filePath.startsWith(projectPath)) {
            const pathParts = filePath.split('/');
            const fileName = pathParts.pop() || 'file.txt';
            // ✅ Allow any files inside .kibitz/ (api, checkpoints, config, etc.)
            const isKibitzFile = filePath.includes('/.kibitz/');
            if (pathParts.length > projectPath.split('/').length && !isKibitzFile) {
              filePath = `${projectPath}/${fileName}`;
              console.log(`🔒 Flattened subdirectory path to: ${filePath}`);
            } else if (isKibitzFile) {
              console.log(`✅ Allowing .kibitz file: ${filePath}`);
            }
          }
          
          modifiedArgs = {
            ...modifiedArgs,
            file_path: filePath
          };
        }
      }

      // 🚨 CRITICAL FIX: Handle BashCommand even without project context
      if (!project && toolName === 'BashCommand' && modifiedArgs.command && !modifiedArgs.action_json) {
        console.warn('🔧 BashCommand without project context - converting to action_json format');
        const { command: commandValue, ...argsWithoutCommand } = modifiedArgs;
        modifiedArgs = {
          ...argsWithoutCommand,
          action_json: {
            command: commandValue,
            type: 'command' // Add type field inside action_json where it belongs
          },
          thread_id: modifiedArgs.thread_id
        };
      }

      // 🔍 CRITICAL DEBUG: Check for raw command format in BashCommand AFTER processing
      if (toolName === 'BashCommand') {
        if (modifiedArgs.command && !modifiedArgs.action_json) {
          console.error('🚨 CRITICAL: BashCommand still has raw command format AFTER processing!', {
            command: modifiedArgs.command,
            hasActionJson: !!modifiedArgs.action_json,
            allArgs: Object.keys(modifiedArgs),
            stackTrace: new Error().stack
          });
        } else if (modifiedArgs.action_json) {
          // 🔧 CRITICAL: Ensure ALL BashCommand calls have type field inside action_json
          const actionJson = modifiedArgs.action_json as any;
          if (!actionJson.type) {
            console.warn('🔧 BashCommand missing type field inside action_json - adding it');
            actionJson.type = 'command';
          }
          
          console.log('✅ BashCommand correctly formatted with action_json:', {
            hasCommand: !!modifiedArgs.command,
            hasActionJson: !!modifiedArgs.action_json,
            hasType: !!actionJson.type,
            command: actionJson.command ? actionJson.command.substring(0, 100) + '...' : 'no command'
          });
        }
      }

      return new Promise((resolve, reject) => {
        const requestId = `req_${Date.now()}_${Math.random()}`;
        
        // 🔧 NO TIMEOUT: Let MCP server handle its own timeouts to avoid breaking the system
        console.log(`🔧 executeTool: Starting ${toolName} without timeout restrictions`);
        
        pendingRequestsRef.set(requestId, { 
          resolve: (result: string) => {
            // ✅ IMMEDIATE RESOLVE: Return result to user immediately, run post-hooks async
            resolve(result);
            
            // 🔄 SAFE BACKGROUND HOOKS: Re-enabled with cascade prevention
            if (activeProjectId && project && toolName !== 'Initialize' && toolName !== 'BashCommand') {
              // Use setTimeout to ensure these run after the promise resolves
              setTimeout(() => {
                try {
                  // Import and call branch store handler asynchronously
                  import('./branchStore').then(({ useBranchStore }) => {
                    const branchStore = useBranchStore.getState();
                    console.log(`🔧 executeTool: Triggering background branch check for tool: ${toolName}`);
                    branchStore.handleToolExecution(activeProjectId, toolName).catch(error => {
                      console.warn('🔧 executeTool: Background branch creation check failed:', error);
                    });
                  }).catch(error => {
                    console.warn('🔧 executeTool: Failed to import branch store:', error);
                  });
                  
                  // 🚀 PERFORMANCE: Only trigger auto-commit for user-initiated tools with file changes
                  if (!isInternalCall && shouldLogDetails) {
                    // 🚀 PERFORMANCE: Only auto-commit for tools that actually change files
                    const fileChangingTools = ['FileWriteOrEdit', 'write', 'edit', 'create', 'delete'];
                    const shouldTriggerAutoCommit = fileChangingTools.some(tool => 
                      toolName.toLowerCase().includes(tool.toLowerCase())
                    );
                    
                    if (shouldTriggerAutoCommit) {
                      // 🚀 PERFORMANCE: Batch auto-commit operations with minimal logging
                      import('./autoCommitStore').then(({ useAutoCommitStore }) => {
                        const { shouldAutoCommit, executeAutoCommit, trackFileChange } = useAutoCommitStore.getState();
                        
                        // Track file changes for FileWriteOrEdit
                        if (toolName === 'FileWriteOrEdit') {
                          const filePath = (args as any).file_path || 'unknown_file';
                          trackFileChange(filePath);
                        }
                        
                        // 🚀 PERFORMANCE: Use cached project path
                        const cleanProjectId = activeProjectId.replace(/"/g, '');
                        const cleanProjectName = project.name.replace(/"/g, '');
                        
                        const autoCommitContext = {
                          trigger: 'tool_execution' as const,
                          toolName,
                          projectId: cleanProjectId,
                          projectPath: getProjectPath(cleanProjectId, cleanProjectName), // This is now cached!
                          conversationId: get().activeConversationId || undefined,
                          timestamp: Date.now()
                        };
                        
                        if (shouldAutoCommit(autoCommitContext)) {
                          executeAutoCommit(autoCommitContext).catch(autoCommitError => {
                            console.error(`Auto-commit failed for ${toolName}:`, autoCommitError);
                          });
                        }
                      }).catch(() => {
                        // Silently ignore auto-commit store import failures in production
                      });
                    }
                  }
                } catch (error) {
                  console.warn('🔧 executeTool: Error in background branch integration:', error);
                }
              }, 0); // Run immediately but asynchronously
            }
          }, 
          reject: (error: Error) => {
            // Error - no circuit breaker logic, just pass through the error
            reject(error);
          },
          toolName: toolName,
          args: args,
          serverId: serverId
        });

        const toolCall = {
          jsonrpc: '2.0',
          id: requestId,
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: modifiedArgs
          }
        };

        try {
          connection.send(JSON.stringify(toolCall));
          console.log(`🔧 executeTool: Sent ${toolName} request with ID ${requestId}`);
        } catch (sendError) {
          pendingRequestsRef.delete(requestId);
          console.error(`🚨 executeTool: Failed to send ${toolName} request:`, sendError);
          reject(new Error(`Failed to send tool request: ${sendError instanceof Error ? sendError.message : String(sendError)}`));
        }
      });
    },

    // Helper method to ensure project directory before using LLM tools
    ensureActiveProjectDirectory: async () => {
      const { activeProjectId, projects, servers } = get();
      
      console.log(`🔧 ensureActiveProjectDirectory called`);
      console.log(`🔧 Debug info:`, {
        activeProjectId: `"${activeProjectId}"`,
        projectsCount: projects.length,
        serversCount: servers.length,
        projectsList: projects.map(p => ({ id: p.id, name: p.name }))
      });
      
      if (!activeProjectId) {
        console.error(`❌ No active project ID, this should not happen during tool execution`);
        return;
      }
      
      const project = projects.find(p => p.id === activeProjectId);
      if (!project) {
        console.error(`❌ Project ${activeProjectId} not found in projects list`);
        console.error(`❌ Available projects:`, projects.map(p => ({ id: p.id, name: p.name })));
        return;
      }
      
      console.log(`🔧 Found project:`, {
        id: `"${project.id}"`,
        name: `"${project.name}"`,
        customPath: `"${project.customPath || ''}"`,
        hasSettings: !!project.settings,
        mcpServerIds: project.settings?.mcpServerIds || []
      });
      
      const activeMcpServers = servers.filter(server => 
        server.status === 'connected' && project.settings.mcpServerIds?.includes(server.id)
      );
      
      console.log(`🔧 Active MCP servers:`, {
        totalServers: servers.length,
        connectedServers: servers.filter(s => s.status === 'connected').length,
        projectMcpServerIds: project.settings.mcpServerIds,
        activeMcpServersCount: activeMcpServers.length,
        activeMcpServerIds: activeMcpServers.map(s => s.id)
      });
      
      if (!activeMcpServers.length) {
        console.warn(`⚠️ No active MCP servers for project ${project.name}, skipping directory setup`);
        return;
      }
      
      try {
        const mcpServerId = activeMcpServers[0].id;
        console.log(`🔧 Setting up project directory for ${project.name} using MCP server ${mcpServerId}`);
        
        const projectPath = await ensureProjectDirectory(project, mcpServerId, get().executeTool);
        
        // The ensureProjectDirectory function now properly initializes ws-mcp
        // with the project-specific directory, so all subsequent tool calls
        // will work in the correct project workspace
        console.log(`✅ Successfully ensured project directory for ${project.name}: ${projectPath}`);
        
        // 🔧 INITIALIZE: Auto-commit agent for the project
        try {
          console.log(`🔧 Ensuring auto-commit agent is initialized for project: ${project.name}`);
          
          // Check if auto-commit agent is already running for this project
          const agent = getAutoCommitAgent();
          const isRunning = agent.isAgentRunning();
          
          if (!isRunning) {
            console.log(`🔧 Auto-commit agent not running, initializing for project: ${project.name}`);
            await initializeAutoCommitForProject(activeProjectId);
          } else {
            console.log(`✅ Auto-commit agent already running for project: ${project.name}`);
          }
          
        } catch (error) {
          console.warn('Failed to initialize auto-commit agent for project:', error);
        }
        
      } catch (error) {
        console.error(`❌ Failed to ensure project directory for ${project.name}:`, error);
        throw error; // Re-throw to surface the error
      }
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
