/**
 * Conversation Workspace Service
 * 
 * Phase 2.1: Supporting utilities for conversation workspace management
 */

import {
  ConversationBrief,
  WorkspaceMapping,
  WorkspaceCreationOptions,
  ConversationWorkspaceSettings,
  BranchInfo,
  Project
} from '../components/LlmChat/context/types';

/**
 * Generate a unique workspace ID
 */
export const generateWorkspaceId = (): string => {
  return `workspace-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

/**
 * Generate workspace path for a conversation
 */
export const generateWorkspacePath = (
  projectId: string,
  conversationId: string,
  conversationName?: string
): string => {
  const safeName = conversationName 
    ? conversationName.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase()
    : conversationId;
  
  return `/Users/test/gitrepo/projects/${projectId}/conversations/${conversationId}`;
};

/**
 * Create a workspace mapping for a conversation
 */
export const createWorkspaceMapping = (
  conversationId: string,
  projectId: string,
  conversationName: string,
  options: WorkspaceCreationOptions = {}
): WorkspaceMapping => {
  const workspaceId = generateWorkspaceId();
  const workspacePath = generateWorkspacePath(projectId, conversationId, conversationName);
  
  return {
    workspaceId,
    conversationId,
    projectId,
    workspacePath,
    workspaceStatus: 'active',
    isGitRepository: options.initializeGit || false,
    currentBranch: options.branchName || 'main',
    branches: [],
    createdAt: new Date(),
    lastAccessedAt: new Date()
  };
};

/**
 * Create default workspace settings
 */
export const createDefaultWorkspaceSettings = (
  inheritProjectSettings: boolean = true
): ConversationWorkspaceSettings => {
  return {
    workspaceIsolation: true,
    inheritProjectSettings,
    branchPrefix: 'conv/',
    autoBranch: false,
    autoCommit: false,
    customSettings: {}
  };
};

/**
 * Add workspace to conversation
 */
export const addWorkspaceToConversation = (
  conversation: ConversationBrief,
  workspaceMapping: WorkspaceMapping
): ConversationBrief => {
  return {
    ...conversation,
    workspaceId: workspaceMapping.workspaceId,
    workspacePath: workspaceMapping.workspacePath
  };
};

/**
 * Create mock conversation with workspace for testing
 */
export const createMockConversationWithWorkspace = (
  conversationId: string,
  projectId: string,
  conversationName: string = 'Test Conversation',
  options: WorkspaceCreationOptions = {}
): { conversation: ConversationBrief; workspace: WorkspaceMapping } => {
  const workspace = createWorkspaceMapping(conversationId, projectId, conversationName, options);
  
  const conversation: ConversationBrief = {
    id: conversationId,
    name: conversationName,
    lastUpdated: new Date(),
    messages: [],
    createdAt: new Date(),
    workspaceId: workspace.workspaceId,
    workspacePath: workspace.workspacePath
  };
  
  return { conversation, workspace };
};

/**
 * Validate workspace path
 */
export const validateWorkspacePath = (path: string): boolean => {
  if (!path || typeof path !== 'string') {
    return false;
  }
  
  // Check if path is within allowed project directory structure
  const validPathPattern = /^\/Users\/test\/gitrepo\/projects\/[\w-]+\/conversations\/[\w-]+$/;
  return validPathPattern.test(path);
};

/**
 * Log workspace operation for debugging
 */
export const logWorkspaceOperation = (operation: string, details: any): void => {
  console.log(`🔧 Workspace Operation: ${operation}`, {
    timestamp: new Date().toISOString(),
    ...details
  });
};

/**
 * Sanitize conversation name for use in paths
 */
export const sanitizeConversationName = (name: string): string => {
  return name
    .replace(/[^a-zA-Z0-9-_\s]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .toLowerCase()
    .substring(0, 50); // Limit length
};

/**
 * Get workspace status display name
 */
export const getWorkspaceStatusDisplayName = (status: string): string => {
  switch (status) {
    case 'active':
      return 'Active';
    case 'inactive':
      return 'Inactive';
    case 'archived':
      return 'Archived';
    case 'error':
      return 'Error';
    default:
      return 'Unknown';
  }
};

/**
 * Check if workspace is git repository
 */
export const isGitRepository = (workspace: WorkspaceMapping): boolean => {
  return workspace.isGitRepository === true;
};

/**
 * Get current branch name
 */
export const getCurrentBranchName = (workspace: WorkspaceMapping): string => {
  return workspace.currentBranch || 'main';
};

/**
 * Get branch information
 */
export const getBranchInfo = (workspace: WorkspaceMapping, branchName: string): BranchInfo | null => {
  if (!workspace.branches) {
    return null;
  }
  
  return workspace.branches.find(branch => branch.name === branchName) || null;
};

/**
 * Add branch to workspace
 */
export const addBranchToWorkspace = (
  workspace: WorkspaceMapping,
  branchName: string,
  isDefault: boolean = false
): WorkspaceMapping => {
  const newBranch: BranchInfo = {
    name: branchName,
    isDefault,
    createdAt: new Date()
  };
  
  const updatedBranches = workspace.branches ? [...workspace.branches, newBranch] : [newBranch];
  
  return {
    ...workspace,
    branches: updatedBranches,
    currentBranch: branchName,
    lastAccessedAt: new Date()
  };
};

/**
 * Remove branch from workspace
 */
export const removeBranchFromWorkspace = (
  workspace: WorkspaceMapping,
  branchName: string
): WorkspaceMapping => {
  if (!workspace.branches) {
    return workspace;
  }
  
  const updatedBranches = workspace.branches.filter(branch => branch.name !== branchName);
  
  return {
    ...workspace,
    branches: updatedBranches,
    currentBranch: workspace.currentBranch === branchName ? 'main' : workspace.currentBranch,
    lastAccessedAt: new Date()
  };
};

/**
 * Update workspace settings
 */
export const updateWorkspaceSettings = (
  workspace: WorkspaceMapping,
  settings: Partial<ConversationWorkspaceSettings>
): WorkspaceMapping => {
  return {
    ...workspace,
    lastAccessedAt: new Date()
  };
};

/**
 * Get workspace age in days
 */
export const getWorkspaceAgeInDays = (workspace: WorkspaceMapping): number => {
  const now = new Date();
  const created = new Date(workspace.createdAt);
  const diffTime = Math.abs(now.getTime() - created.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

/**
 * Check if workspace was recently accessed
 */
export const wasRecentlyAccessed = (workspace: WorkspaceMapping, daysThreshold: number = 7): boolean => {
  const now = new Date();
  const lastAccessed = new Date(workspace.lastAccessedAt);
  const diffTime = Math.abs(now.getTime() - lastAccessed.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays <= daysThreshold;
};

/**
 * Get workspace summary for display
 */
export const getWorkspaceSummary = (workspace: WorkspaceMapping): {
  id: string;
  name: string;
  path: string;
  status: string;
  isGit: boolean;
  branchCount: number;
  ageInDays: number;
  recentlyAccessed: boolean;
} => {
  return {
    id: workspace.workspaceId,
    name: workspace.conversationId,
    path: workspace.workspacePath,
    status: getWorkspaceStatusDisplayName(workspace.workspaceStatus),
    isGit: isGitRepository(workspace),
    branchCount: workspace.branches?.length || 0,
    ageInDays: getWorkspaceAgeInDays(workspace),
    recentlyAccessed: wasRecentlyAccessed(workspace)
  };
}; 