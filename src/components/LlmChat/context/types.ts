import { Message } from '../types';
import { McpServer } from '../types/mcp';
import { ProviderConfig, LegacyProviderType, LegacyProviderSettings } from '../types/provider';
import { Tool } from '../types/toolTypes';

export interface SavedPrompt {
  id: string;
  name: string;
  content: string;
  createdAt: Date;
}

// Keep for backwards compatibility
export type ProviderType = LegacyProviderType;

export interface ProjectSettings extends LegacyProviderSettings {
  provider?: LegacyProviderType;  // Optional for backward compatibility
  providerConfig?: ProviderConfig;  // New provider configuration
  model: string;
  // Commit-specific LLM configuration (optional). When provided, these override provider/model
  // for commit message generation only. If missing, the general provider/model are used.
  commitProvider?: LegacyProviderType;
  commitModel?: string;
  groqApiKey?: string;  // API key for GROQ services
  systemPrompt: string;
  savedPrompts?: SavedPrompt[];  // Collection of saved system prompts
  mcpServerIds: string[];  // Store server IDs instead of full server objects
  elideToolResults: boolean;
  messageWindowSize: number;  // Number of messages to show in truncated view
  enableGitHub: boolean;  // Enable GitHub integration (default: false)
  // Authoritative threshold: minimum number of files that must change before
  // any automatic commit/push logic runs. Manual commits are not affected.
  minFilesForAutoCommitPush?: number;
}

// 🌟 NEW: Workspace status enumeration for conversation workspaces
export type WorkspaceStatus = 
  | 'initializing'    // Workspace is being created
  | 'active'          // Workspace is ready and active
  | 'error'           // Workspace creation/access failed
  | 'migrating'       // Workspace is being migrated or updated
  | 'archived';       // Workspace is archived/inactive

// 🌟 NEW: Auto-commit branch metadata for 3-minute branch creation
export interface AutoCommitBranch {
  branchId: string;                 // Unique branch identifier
  conversationId: string;           // Associated conversation
  projectId: string;                // Associated project
  branchName: string;               // Git branch name
  commitHash: string;               // Git commit hash
  commitMessage: string;            // Commit message
  createdAt: Date;                  // When branch was created
  filesChanged: string[];           // List of changed files
  changesSummary: string;           // Summary of changes
  isAutoCommit: boolean;            // Whether this was an auto-commit
  parentBranchId?: string;          // Parent branch for history
  workspaceSnapshot?: {             // Workspace state snapshot
    fileCount: number;
    totalSize: number;
    lastModified: Date;
  };
}

// 🌟 NEW: Auto-commit configuration
export interface AutoCommitConfig {
  enabled: boolean;                 // Whether auto-commit is enabled
  intervalMinutes: number;          // Interval in minutes (default: 3)
  maxBranchesPerConversation: number; // Maximum branches to keep per conversation
  commitMessageTemplate: string;    // Template for commit messages
  includeFileChanges: boolean;      // Whether to include file changes in metadata
  cleanupOldBranches: boolean;      // Whether to cleanup old branches
  revertTimeoutMinutes: number;     // How long to wait before allowing reverts
}

// 🌟 NEW: Branch operation results
export interface BranchOperationResult {
  success: boolean;
  branchId?: string;
  branchName?: string;
  commitHash?: string;
  error?: string;
  filesChanged?: string[];
  timeTaken?: number;
}

// 🌟 NEW: Branch revert information
export interface BranchRevert {
  revertId: string;                 // Unique revert identifier
  sourceBranchId: string;           // Branch being reverted from
  targetBranchId: string;           // Branch being reverted to
  conversationId: string;           // Associated conversation
  projectId: string;                // Associated project
  revertedAt: Date;                 // When revert was performed
  revertReason: string;             // Reason for revert
  filesReverted: string[];          // Files that were reverted
  revertStatus: 'pending' | 'completed' | 'failed';
}

// 🌟 NEW: Auto-commit agent status
export interface AutoCommitAgentStatus {
  isRunning: boolean;               // Whether agent is running
  lastRunAt?: Date;                 // When agent last ran
  nextRunAt?: Date;                 // When agent will run next
  totalBranchesCreated: number;     // Total branches created
  totalCommits: number;             // Total commits made
  totalReverts: number;             // Total reverts performed
  currentInterval: number;          // Current interval in minutes
  errors: string[];                 // Recent errors
}

// 🌟 NEW: Branch history for a conversation
export interface ConversationBranchHistory {
  conversationId: string;
  projectId: string;
  branches: AutoCommitBranch[];
  currentBranchId: string;
  totalBranches: number;
  oldestBranch?: Date;
  newestBranch?: Date;
  totalCommits: number;
  totalReverts: number;
}

// 🌟 ENHANCED: BranchInfo with auto-commit support
export interface BranchInfo {
  name: string;
  isDefault: boolean;
  lastCommitHash?: string;
  lastCommitMessage?: string;
  lastCommitTimestamp?: Date;
  createdAt: Date;
  
  // 🌟 NEW: Auto-commit extensions
  isAutoCommit?: boolean;           // Whether this is an auto-commit branch
  autoCommitBranchId?: string;      // Link to AutoCommitBranch record
  filesChanged?: string[];          // Files changed in this branch
  changesSummary?: string;          // Summary of changes
  canRevert?: boolean;              // Whether this branch can be reverted to
}

// 🌟 NEW: Conversation-specific workspace settings for future branch configurations
export interface ConversationWorkspaceSettings {
  // Git and branching settings
  autoBranch?: boolean;              // Auto-create branch for this conversation
  branchPrefix?: string;             // Custom branch prefix (e.g., 'feature/', 'bugfix/')
  autoCommit?: boolean;              // Auto-commit changes in this conversation
  commitMessageTemplate?: string;    // Custom commit message template
  
  // Workspace settings
  workspaceIsolation?: boolean;      // Keep this conversation's workspace isolated
  inheritProjectSettings?: boolean;  // Whether to inherit project-level settings
  
  // Tool execution settings
  toolExecutionTimeout?: number;     // Custom timeout for tool execution
  allowedTools?: string[];           // Restricted tool set for this conversation
  
  // Future extensibility
  customSettings?: Record<string, any>;  // For future features
}

// 🌟 NEW: Workspace mapping for conversation-to-folder relationships
export interface WorkspaceMapping {
  conversationId: string;
  projectId: string;
  workspaceId: string;              // Unique identifier for the workspace
  workspacePath: string;            // Full path to the workspace directory
  workspaceStatus: WorkspaceStatus;
  createdAt: Date;
  lastAccessedAt: Date;
  
  // Branch information (for future branch-per-conversation)
  defaultBranch?: string;
  currentBranch?: string;
  branches?: BranchInfo[];
  
  // Metadata
  sizeInBytes?: number;             // Workspace size for cleanup decisions
  fileCount?: number;               // Number of files in workspace
  isGitRepository?: boolean;        // Whether workspace is a git repository
  
  // Recovery information
  backupPath?: string;              // Path to backup if workspace needs recovery
  lastBackupAt?: Date;              // When workspace was last backed up
}

// 🌟 ENHANCED: ConversationBrief with workspace information
export interface ConversationBrief {
  id: string;
  name: string;
  lastUpdated: Date;
  messages: Message[];
  createdAt?: Date;  // Optional to maintain compatibility with existing data
  
  // 🌟 NEW: Workspace-related fields
  workspaceId?: string;              // Unique identifier for the conversation's workspace
  workspacePath?: string;            // Full path to the conversation's workspace directory
  workspaceStatus?: WorkspaceStatus; // Current status of the workspace
  
  // 🌟 NEW: Conversation-specific settings
  settings?: ConversationWorkspaceSettings;
  
  // 🌟 NEW: Branch information (for future branch-per-conversation feature)
  currentBranch?: string;            // Current active branch for this conversation
  branches?: BranchInfo[];           // List of branches associated with this conversation
  
  // 🌟 NEW: Workspace metadata
  lastWorkspaceSync?: Date;          // When workspace was last synchronized
  workspaceSize?: number;            // Size of workspace in bytes
  workspaceFileCount?: number;       // Number of files in workspace
  
  // 🌟 NEW: Isolation and inheritance settings
  inheritsFromProject?: boolean;     // Whether this conversation inherits project settings
  isolatedWorkspace?: boolean;       // Whether this conversation has an isolated workspace
}

// 🌟 NEW: Workspace management state interface
export interface WorkspaceState {
  workspaceMappings: WorkspaceMapping[];
  activeWorkspaceId: string | null;
  
  // Workspace management methods
  createWorkspace: (conversationId: string, projectId: string, options?: WorkspaceCreationOptions) => Promise<WorkspaceMapping>;
  deleteWorkspace: (workspaceId: string) => Promise<void>;
  switchWorkspace: (workspaceId: string) => Promise<void>;
  getWorkspaceForConversation: (conversationId: string) => WorkspaceMapping | null;
  getWorkspaceStatus: (workspaceId: string) => WorkspaceStatus;
  
  // Workspace recovery and maintenance
  repairWorkspace: (workspaceId: string) => Promise<boolean>;
  backupWorkspace: (workspaceId: string) => Promise<string>;
  restoreWorkspace: (workspaceId: string, backupPath: string) => Promise<boolean>;
  
  // Workspace cleanup
  cleanupUnusedWorkspaces: () => Promise<number>;
  getWorkspaceUsageStats: () => Promise<WorkspaceUsageStats>;
}

// 🌟 NEW: Options for workspace creation
export interface WorkspaceCreationOptions {
  copyFromProject?: boolean;         // Copy files from project workspace
  initializeGit?: boolean;           // Initialize as git repository
  branchName?: string;               // Initial branch name
  customPath?: string;               // Custom workspace path
  inheritSettings?: boolean;         // Inherit project settings
  isolate?: boolean;                 // Create isolated workspace
}

// 🌟 NEW: Workspace usage statistics
export interface WorkspaceUsageStats {
  totalWorkspaces: number;
  activeWorkspaces: number;
  archivedWorkspaces: number;
  totalSizeInBytes: number;
  averageWorkspaceSize: number;
  oldestWorkspace: Date;
  newestWorkspace: Date;
  mostUsedWorkspace: { workspaceId: string; accessCount: number };
}

// 🌟 NEW: Enhanced project interface with workspace support
export interface Project {
  id: string;
  name: string;
  settings: ProjectSettings;
  conversations: ConversationBrief[];
  createdAt: Date;
  updatedAt: Date;
  order: number;  // Lower number means higher in the list
  customPath?: string;  // Custom path for cloned repositories (optional)
  
  // 🌟 NEW: Workspace-related fields
  defaultWorkspaceSettings?: ConversationWorkspaceSettings;  // Default settings for new conversations
  workspaceIsolationEnabled?: boolean;              // Whether to enable workspace isolation by default
  maxWorkspaceSize?: number;                        // Maximum workspace size in bytes
  maxConversationWorkspaces?: number;               // Maximum number of conversation workspaces
  
  // 🌟 NEW: Project-level workspace metadata
  totalWorkspaceSize?: number;                      // Total size of all conversation workspaces
  workspaceCleanupPolicy?: 'manual' | 'automatic';  // How to handle workspace cleanup
}

export interface McpServerConnection extends McpServer {
  connection?: WebSocket;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  error?: string;
}

export interface McpState {
  servers: McpServerConnection[];
  addServer: (server: McpServer) => Promise<McpServerConnection | void>;
  removeServer: (serverId: string) => void;
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>;
  reconnectServer: (serverId: string) => Promise<McpServerConnection>;
  attemptLocalMcpConnection: () => Promise<McpServerConnection | null>;
}

// 🌟 ENHANCED: ProjectState with workspace management
export interface ProjectState {
  projects: Project[];
  activeProjectId: string | null;
  activeConversationId: string | null;
  createProject: (name: string, settings?: Partial<ProjectSettings>) => void;
  createProjectFromClonedRepo: (repoPath: string, projectName?: string) => Promise<string>;
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
  
  // 🌟 NEW: Workspace management methods
  createConversationWorkspace: (conversationId: string, options?: WorkspaceCreationOptions) => Promise<WorkspaceMapping>;
  deleteConversationWorkspace: (conversationId: string) => Promise<void>;
  switchConversationWorkspace: (conversationId: string) => Promise<void>;
  getConversationWorkspace: (conversationId: string) => WorkspaceMapping | null;
  updateConversationSettings: (projectId: string, conversationId: string, settings: Partial<ConversationWorkspaceSettings>) => void;
}

// 🌟 NEW: Database schema types for workspace persistence
export interface WorkspacePersistenceSchema {
  workspaceMappings: WorkspaceMapping[];
  conversationSettings: Record<string, ConversationWorkspaceSettings>;
  workspaceBackups: Record<string, string[]>;  // workspaceId -> backup paths
  usageStats: WorkspaceUsageStats;
  lastCleanup: Date;
}

// 🌟 NEW: Migration helpers for existing data
export interface ConversationMigrationInfo {
  conversationId: string;
  projectId: string;
  needsWorkspaceCreation: boolean;
  suggestedWorkspacePath: string;
  existingMessageCount: number;
  estimatedWorkspaceSize: number;
}

// Re-export Tool for convenience
export type { Tool };
