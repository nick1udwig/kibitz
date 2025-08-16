export interface ProjectSchema {
  // Core project information
  commit_hash: string;
  branch: string;
  author: string;
  date: string; // ISO 8601 format
  message: string;
  remote_url: string | null;
  is_dirty: boolean;
  projectId: string;
  projectName: string;
  projectPath: string;
  gitInitialized: boolean;
  lastActivity: number; // Unix timestamp

  // Repository metadata
  repository: {
    defaultBranch: string;
    totalBranches: number;
    totalCommits: number;
    lastActivity: number;
    size: number; // bytes
    languages: Record<string, number>;
  };

  // GitHub sync configuration
  github: {
    enabled: boolean;
    remoteUrl: string | null; // GitHub repository URL
    syncInterval: number; // milliseconds between sync attempts
    syncBranches: string[]; // branch patterns to sync (supports wildcards)
    lastSync: number | null; // Unix timestamp of last successful sync
    syncStatus: 'idle' | 'syncing' | 'error' | 'disabled';
    authentication: {
      type: 'token' | 'ssh' | 'oauth';
      configured: boolean;
      lastValidated: number | null; // Unix timestamp
    };
  };

  // Global sync state
  sync: {
    lastAttempt: number | null; // Unix timestamp of last sync attempt
    nextScheduled: number | null; // Unix timestamp of next scheduled sync
    consecutiveFailures: number; // count of failed sync attempts
    pendingChanges: string[]; // array of change descriptions waiting to sync
  };

  // Branch information with sync status
  branches: Array<{
    branchName: string;
    commitHash: string;
    commitMessage: string;
    timestamp: number; // Unix timestamp
    author: string;
    filesChanged: string[];
    linesAdded: number;
    linesRemoved: number;
    isMainBranch: boolean;
    tags: string[];
    
    // Per-branch sync information
    sync: {
      lastPushed: number | null; // Unix timestamp when branch was last pushed
      pushedHash: string | null; // commit hash that was last pushed
      needsSync: boolean; // true if branch has unpushed changes
      syncError: string | null; // error message if last sync failed
    };

    // Conversation-specific fields
    conversation?: {
      conversationId: string;
      interactionCount: number;
      baseBranch: string;
    };

    // Enhanced commit information with diffs and LLM data
    commits?: Array<{
      hash: string;
      parentHash: string;
      message: string;
      llmGeneratedMessage?: string;
      author: string;
      timestamp: string; // ISO format
      diff: string; // Git diff content
      filesChanged: string[];
      linesAdded: number;
      linesRemoved: number;
      llmProvider?: string;
      llmModel?: string;
      llmError?: string;
    }>;

    // Latest commit diff data for quick access
    diffData?: {
      gitDiff: string;
      llmProvider?: string;
      llmModel?: string;
      llmGeneratedMessage?: string;
      llmError?: string;
    } | null;
  }>;

  // Conversation-specific branching data
  conversations: Array<{
    conversationId: string;
    createdAt: number; // Unix timestamp
    branches: Array<{
      branchName: string;
      baseBranch: string;
      startingHash: string;
      interactionIndex: number;
      createdAt: number; // Unix timestamp
      commitHash: string | null;
      commits: Array<{
        hash: string;
        parentHash: string;
        message: string;
        llmGeneratedMessage?: string;
        author: string;
        timestamp: string; // ISO format
        diff: string;
        filesChanged: string[];
        linesAdded: number;
        linesRemoved: number;
        llmProvider?: string;
        llmModel?: string;
        llmError?: string;
      }>;
      lastLLMMessage?: string;
    }>;
    currentBranch: string | null;
  }>;
  
  metadata: {
    generated: number; // Unix timestamp
    version: string; // Schema version
    source: string;
  };
}

// GitHub sync status types
export type GitHubSyncStatus = 'idle' | 'syncing' | 'error' | 'disabled';
export type AuthenticationType = 'token' | 'ssh' | 'oauth';

// Helper type for branch sync operations
export interface BranchSyncInfo {
  lastPushed: number | null;
  pushedHash: string | null;
  needsSync: boolean;
  syncError: string | null;
}

// Configuration defaults for new projects
export const DEFAULT_GITHUB_CONFIG: ProjectSchema['github'] = {
  enabled: false,
  remoteUrl: null,
  syncInterval: 300000, // 5 minutes
  syncBranches: ['main', 'auto/*'],
  lastSync: null,
  syncStatus: 'idle',
  authentication: {
    type: 'token',
    configured: false,
    lastValidated: null
  }
};

export const DEFAULT_SYNC_CONFIG: ProjectSchema['sync'] = {
  lastAttempt: null,
  nextScheduled: null,
  consecutiveFailures: 0,
  pendingChanges: []
};

export const DEFAULT_BRANCH_SYNC: BranchSyncInfo = {
  lastPushed: null,
  pushedHash: null,
  needsSync: true,  // ✅ New branches need to be synced to GitHub
  syncError: null
};

// Enhanced commit types for conversation branches
export interface ConversationCommit {
  hash: string;
  parentHash: string;
  message: string;
  llmGeneratedMessage?: string;
  author: string;
  timestamp: string; // ISO format
  diff: string;
  filesChanged: string[];
  linesAdded: number;
  linesRemoved: number;
  llmProvider?: string;
  llmModel?: string;
  llmError?: string;
}

export interface ConversationBranch {
  branchName: string;
  baseBranch: string;
  startingHash: string;
  interactionIndex: number;
  createdAt: number;
  commitHash: string | null;
  commits: ConversationCommit[];
  lastLLMMessage?: string;
}

export interface ConversationData {
  conversationId: string;
  createdAt: number;
  branches: ConversationBranch[];
  currentBranch: string | null;
}

// LLM commit message generation configuration
export interface LLMCommitConfig {
  enabled: boolean;
  provider: 'anthropic' | 'openai' | 'openrouter';
  model: string;
  apiKey: string;
  generateForAllCommits: boolean;
  fallbackToBasicMessage: boolean;
}

export const DEFAULT_LLM_COMMIT_CONFIG: LLMCommitConfig = {
  enabled: true,
  provider: 'anthropic',
  model: 'claude-3-5-haiku-20241022',
  apiKey: '',
  generateForAllCommits: true,
  fallbackToBasicMessage: true
};