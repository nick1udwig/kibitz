/**
 * Phase 2.1 Tests: Conversation Workspace Manager
 * 
 * Test suite to verify conversation workspace management, git operations, and local persistence
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock IndexedDB and database functions before importing the workspace manager
const mockDb = {
  open: jest.fn(),
  close: jest.fn(),
  transaction: jest.fn(),
  objectStore: jest.fn(),
  get: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
  clear: jest.fn(),
  getAll: jest.fn()
};

// Mock indexedDB global
global.indexedDB = {
  open: jest.fn().mockReturnValue({
    onsuccess: null,
    onerror: null,
    result: mockDb
  })
} as any;

// Mock database functions
jest.mock('../lib/db', () => ({
  loadWorkspaceMappings: jest.fn().mockResolvedValue([]),
  saveWorkspaceMappings: jest.fn().mockResolvedValue(undefined),
  getWorkspaceByConversationId: jest.fn().mockResolvedValue(null),
  updateWorkspaceMapping: jest.fn().mockResolvedValue(undefined),
  deleteWorkspaceMapping: jest.fn().mockResolvedValue(undefined),
  loadConversationSettings: jest.fn().mockResolvedValue({}),
  saveConversationSettings: jest.fn().mockResolvedValue(undefined),
  getWorkspaceStats: jest.fn().mockResolvedValue({}),
  updateWorkspaceStats: jest.fn().mockResolvedValue(undefined),
  loadState: jest.fn().mockResolvedValue({ projects: [], activeProjectId: null, activeConversationId: null }),
  saveState: jest.fn().mockResolvedValue(undefined)
}));

// Mock conversation workspace service
jest.mock('../lib/conversationWorkspaceService', () => ({
  createMockConversationWithWorkspace: jest.fn(),
  createDefaultWorkspaceSettings: jest.fn().mockReturnValue({
    workspaceIsolation: true,
    inheritProjectSettings: true,
    branchPrefix: 'conv/',
    autoBranch: false,
    autoCommit: false,
    enableGitHooks: false,
    customGitConfig: {},
    toolPreferences: {}
  }),
  generateWorkspaceId: jest.fn().mockReturnValue('workspace-123'),
  createWorkspaceMapping: jest.fn().mockImplementation((conversationId, projectId, conversationName, config = {}) => ({
    workspaceId: 'workspace-123',
    conversationId,
    projectId,
    conversationName,
    workspacePath: `/Users/test/gitrepo/projects/${projectId}/conversations/${conversationId}`,
    workspaceStatus: 'active' as const,
    isGitRepository: config?.initializeGit || false,
    currentBranch: config?.branchName || 'main',
    branches: [],
    createdAt: new Date(),
    lastAccessedAt: new Date(),
    settings: {}
  })),
  addWorkspaceToConversation: jest.fn(),
  logWorkspaceOperation: jest.fn(),
  validateWorkspacePath: jest.fn().mockReturnValue(true),
  generateWorkspacePath: jest.fn().mockReturnValue('/Users/test/gitrepo/projects/test-project/conversations/conv-123')
}));

import {
  ConversationWorkspaceManager,
  getConversationWorkspaceManager,
  initializeWorkspaceManager,
  workspaceOperations,
  GIT_COMMANDS,
  WorkspaceOperationResult,
  GitOperationResult,
  WorkspaceCreationConfig
} from '../lib/conversationWorkspaceManager';

import {
  WorkspaceMapping,
  ConversationWorkspaceSettings,
  BranchInfo
} from '../components/LlmChat/context/types';

// Mock MCP tool execution function
const mockExecuteTool = jest.fn();

// Mock data
const mockProjectId = 'test-project-456';
const mockConversationId = 'conv-789';
const mockConversationName = 'Test Conversation Workspace';
const mockMcpServerId = 'localhost-mcp';

describe('Phase 2.1: Conversation Workspace Manager', () => {
  let workspaceManager: ConversationWorkspaceManager;

  beforeEach(() => {
    // Reset mocks
    mockExecuteTool.mockClear();
    jest.clearAllMocks();
    
    // Create new workspace manager instance
    workspaceManager = new ConversationWorkspaceManager(mockExecuteTool, mockMcpServerId);
  });

  afterEach(() => {
    // Cleanup
    jest.clearAllMocks();
  });

  describe('Workspace Manager Initialization', () => {
    it('should initialize workspace manager successfully', async () => {
      const manager = getConversationWorkspaceManager(mockExecuteTool, mockMcpServerId);
      
      expect(manager).toBeInstanceOf(ConversationWorkspaceManager);
      expect(typeof manager.initialize).toBe('function');
      
      // Initialize should not throw
      await expect(manager.initialize()).resolves.not.toThrow();
    });

    it('should get global workspace manager instance', () => {
      const manager1 = getConversationWorkspaceManager(mockExecuteTool);
      const manager2 = getConversationWorkspaceManager(mockExecuteTool);
      
      expect(manager1).toBe(manager2); // Should be the same instance
      expect(manager1).toBeInstanceOf(ConversationWorkspaceManager);
    });

    it('should initialize with proper tool execution function', async () => {
      const manager = await initializeWorkspaceManager(mockExecuteTool, mockMcpServerId);
      
      expect(manager).toBeInstanceOf(ConversationWorkspaceManager);
      // Manager should be initialized
      expect(manager).toBeDefined();
    });
  });

  describe('Git Commands Configuration', () => {
    it('should have all necessary git commands defined', () => {
      expect(GIT_COMMANDS.INIT).toBe('git init');
      expect(GIT_COMMANDS.STATUS).toBe('git status');
      expect(GIT_COMMANDS.ADD_ALL).toBe('git add .');
      expect(GIT_COMMANDS.COMMIT('test message')).toBe('git commit -m "test message"');
      expect(GIT_COMMANDS.BRANCH_LIST).toBe('git branch');
      expect(GIT_COMMANDS.BRANCH_CREATE('feature')).toBe('git checkout -b feature');
      expect(GIT_COMMANDS.BRANCH_SWITCH('main')).toBe('git checkout main');
      expect(GIT_COMMANDS.BRANCH_DELETE('feature')).toBe('git branch -D feature');
      expect(GIT_COMMANDS.PUSH_ORIGIN('main')).toBe('git push origin main');
      expect(GIT_COMMANDS.PUSH_SET_UPSTREAM('main')).toBe('git push -u origin main');
    });

    it('should generate correct git commands with parameters', () => {
      const branchName = 'feature/test-branch';
      const commitMessage = 'Add new feature';
      
      expect(GIT_COMMANDS.BRANCH_CREATE(branchName)).toBe(`git checkout -b ${branchName}`);
      expect(GIT_COMMANDS.COMMIT(commitMessage)).toBe(`git commit -m "${commitMessage}"`);
      expect(GIT_COMMANDS.PUSH_ORIGIN(branchName)).toBe(`git push origin ${branchName}`);
    });
  });

  describe('Workspace Creation and Management', () => {
    it('should create workspace successfully', async () => {
      // Mock successful directory creation
      mockExecuteTool.mockResolvedValueOnce('Directory created successfully');
      
      const result = await workspaceManager.createWorkspace(
        mockConversationId,
        mockProjectId,
        mockConversationName
      );
      
      expect(result.success).toBe(true);
      expect(result.workspaceId).toBeTruthy();
      expect(result.workspacePath).toBeTruthy();
      expect(result.operation).toBe('create_workspace');
      expect(result.timestamp).toBeInstanceOf(Date);
      
      // Verify MCP tool was called to create directory
      expect(mockExecuteTool).toHaveBeenCalledWith(
        mockMcpServerId,
        'BashCommand',
        expect.objectContaining({
          action_json: expect.objectContaining({
            command: expect.stringContaining('mkdir -p')
          }),
          thread_id: expect.stringContaining('create-workspace')
        })
      );
    });

    it('should create workspace with git initialization', async () => {
      // Mock successful operations
      mockExecuteTool
        .mockResolvedValueOnce('Directory created successfully') // mkdir
        .mockResolvedValueOnce('Initialized empty Git repository') // git init
        .mockResolvedValueOnce('') // git config user.name
        .mockResolvedValueOnce('') // git config user.email
        .mockResolvedValueOnce('README.md created') // create README
        .mockResolvedValueOnce('') // git add
        .mockResolvedValueOnce('[main (root-commit)] Initial commit'); // git commit
      
      const config: WorkspaceCreationConfig = {
        initializeGit: true,
        branchName: 'main'
      };
      
      const result = await workspaceManager.createWorkspace(
        mockConversationId,
        mockProjectId,
        mockConversationName,
        config
      );
      
      expect(result.success).toBe(true);
      expect(result.details?.isGitRepository).toBe(true);
      expect(result.details?.branchName).toBe('main');
      
      // Verify git commands were executed
      expect(mockExecuteTool).toHaveBeenCalledWith(
        mockMcpServerId,
        'BashCommand',
        expect.objectContaining({
          action_json: expect.objectContaining({
            command: expect.stringContaining('git init')
          })
        })
      );
    });

    it('should handle workspace creation failure', async () => {
      // Mock directory creation failure
      mockExecuteTool.mockRejectedValueOnce(new Error('Permission denied'));
      
      const result = await workspaceManager.createWorkspace(
        mockConversationId,
        mockProjectId,
        mockConversationName
      );
      
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
      expect(result.operation).toBe('create_workspace');
    });

    it('should not create duplicate workspace', async () => {
      // Mock first successful creation
      mockExecuteTool.mockResolvedValueOnce('Directory created successfully');
      
      // Create workspace first time
      const result1 = await workspaceManager.createWorkspace(
        mockConversationId,
        mockProjectId,
        mockConversationName
      );
      
      expect(result1.success).toBe(true);
      
      // Try to create same workspace again
      const result2 = await workspaceManager.createWorkspace(
        mockConversationId,
        mockProjectId,
        mockConversationName
      );
      
      expect(result2.success).toBe(false);
      expect(result2.error).toContain('already exists');
    });

    it('should get workspace after creation', async () => {
      // Mock successful directory creation
      mockExecuteTool.mockResolvedValueOnce('Directory created successfully');
      
      // Create workspace
      await workspaceManager.createWorkspace(
        mockConversationId,
        mockProjectId,
        mockConversationName
      );
      
      // Get workspace
      const workspace = await workspaceManager.getWorkspace(mockConversationId);
      
      expect(workspace).not.toBeNull();
      expect(workspace!.conversationId).toBe(mockConversationId);
      expect(workspace!.projectId).toBe(mockProjectId);
      expect(workspace!.workspaceStatus).toBe('active');
    });

    it('should switch to workspace successfully', async () => {
      // Mock successful directory creation
      mockExecuteTool.mockResolvedValueOnce('Directory created successfully');
      
      // Create workspace
      await workspaceManager.createWorkspace(
        mockConversationId,
        mockProjectId,
        mockConversationName
      );
      
      // Switch to workspace
      const result = await workspaceManager.switchToWorkspace(mockConversationId);
      
      expect(result.success).toBe(true);
      expect(result.operation).toBe('switch_workspace');
      expect(result.workspaceId).toBeTruthy();
    });

    it('should delete workspace successfully', async () => {
      // Mock successful directory creation
      mockExecuteTool.mockResolvedValueOnce('Directory created successfully');
      
      // Create workspace
      await workspaceManager.createWorkspace(
        mockConversationId,
        mockProjectId,
        mockConversationName
      );
      
      // Delete workspace
      const result = await workspaceManager.deleteWorkspace(mockConversationId);
      
      expect(result.success).toBe(true);
      expect(result.operation).toBe('delete_workspace');
      
      // Verify workspace is gone
      const workspace = await workspaceManager.getWorkspace(mockConversationId);
      expect(workspace).toBeNull();
    });
  });

  describe('Git Operations', () => {
    beforeEach(async () => {
      // Create a git-enabled workspace for testing
      mockExecuteTool
        .mockResolvedValueOnce('Directory created successfully') // mkdir
        .mockResolvedValueOnce('Initialized empty Git repository') // git init
        .mockResolvedValueOnce('') // git config user.name
        .mockResolvedValueOnce('') // git config user.email
        .mockResolvedValueOnce('README.md created') // create README
        .mockResolvedValueOnce('') // git add
        .mockResolvedValueOnce('[main (root-commit)] Initial commit'); // git commit
      
      await workspaceManager.createWorkspace(
        mockConversationId,
        mockProjectId,
        mockConversationName,
        { initializeGit: true }
      );
    });

    it('should create new branch successfully', async () => {
      const branchName = 'feature/test-branch';
      
      // Mock successful branch creation
      mockExecuteTool.mockResolvedValueOnce(`Switched to a new branch '${branchName}'`);
      
      const result = await workspaceManager.createBranch(mockConversationId, branchName);
      
      expect(result.success).toBe(true);
      expect(result.branchName).toBe(branchName);
      expect(result.command).toBe(GIT_COMMANDS.BRANCH_CREATE(branchName));
      
      // Verify git command was executed
      expect(mockExecuteTool).toHaveBeenCalledWith(
        mockMcpServerId,
        'BashCommand',
        expect.objectContaining({
          action_json: expect.objectContaining({
            command: expect.stringContaining(`git checkout -b ${branchName}`)
          })
        })
      );
    });

    it('should switch branch successfully', async () => {
      const branchName = 'main';
      
      // Mock successful branch switch
      mockExecuteTool.mockResolvedValueOnce(`Switched to branch '${branchName}'`);
      
      const result = await workspaceManager.switchBranch(mockConversationId, branchName);
      
      expect(result.success).toBe(true);
      expect(result.branchName).toBe(branchName);
      expect(result.command).toBe(GIT_COMMANDS.BRANCH_SWITCH(branchName));
    });

    it('should commit changes successfully', async () => {
      const commitMessage = 'Test commit message';
      
      // Mock successful commit
      mockExecuteTool
        .mockResolvedValueOnce('') // git add
        .mockResolvedValueOnce(`[main ${new Date().toISOString()}] ${commitMessage}`); // git commit
      
      const result = await workspaceManager.commitChanges(mockConversationId, commitMessage);
      
      expect(result.success).toBe(true);
      expect(result.command).toBe(GIT_COMMANDS.COMMIT(commitMessage));
      
      // Verify both add and commit were called
      expect(mockExecuteTool).toHaveBeenCalledWith(
        mockMcpServerId,
        'BashCommand',
        expect.objectContaining({
          action_json: expect.objectContaining({
            command: expect.stringContaining('git add .')
          })
        })
      );
      
      expect(mockExecuteTool).toHaveBeenCalledWith(
        mockMcpServerId,
        'BashCommand',
        expect.objectContaining({
          action_json: expect.objectContaining({
            command: expect.stringContaining(`git commit -m "${commitMessage}"`)
          })
        })
      );
    });

    it('should push branch successfully', async () => {
      const branchName = 'main';
      
      // Mock successful push
      mockExecuteTool.mockResolvedValueOnce(`To origin\n   ${branchName} -> ${branchName}`);
      
      const result = await workspaceManager.pushBranch(mockConversationId, branchName);
      
      expect(result.success).toBe(true);
      expect(result.branchName).toBe(branchName);
      expect(result.command).toBe(GIT_COMMANDS.PUSH_ORIGIN(branchName));
    });

    it('should get git status successfully', async () => {
      const statusOutput = 'On branch main\nnothing to commit, working tree clean';
      
      // Mock git status
      mockExecuteTool.mockResolvedValueOnce(statusOutput);
      
      const result = await workspaceManager.getGitStatus(mockConversationId);
      
      expect(result.success).toBe(true);
      expect(result.output).toBe(statusOutput);
      expect(result.command).toBe(GIT_COMMANDS.STATUS);
    });

    it('should list branches successfully', async () => {
      const branchOutput = '* main\n  feature/test-branch';
      
      // Mock git branch list
      mockExecuteTool.mockResolvedValueOnce(branchOutput);
      
      const result = await workspaceManager.listBranches(mockConversationId);
      
      expect(result.success).toBe(true);
      expect(result.output).toBe(branchOutput);
      expect(result.command).toBe(GIT_COMMANDS.BRANCH_LIST);
    });

    it('should handle git errors gracefully', async () => {
      const branchName = 'invalid-branch';
      
      // Mock git error
      mockExecuteTool.mockResolvedValueOnce('fatal: A branch named \'invalid-branch\' already exists.');
      
      const result = await workspaceManager.createBranch(mockConversationId, branchName);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
      expect(result.branchName).toBe(branchName);
    });
  });

  describe('Workspace Settings Management', () => {
    beforeEach(async () => {
      // Create workspace for testing
      mockExecuteTool.mockResolvedValueOnce('Directory created successfully');
      
      await workspaceManager.createWorkspace(
        mockConversationId,
        mockProjectId,
        mockConversationName
      );
    });

    it('should get workspace settings', async () => {
      const settings = await workspaceManager.getWorkspaceSettings(mockConversationId);
      
      expect(settings).toBeTruthy();
      expect(settings!.workspaceIsolation).toBe(true);
      expect(settings!.inheritProjectSettings).toBe(true);
      expect(settings!.branchPrefix).toBe('conv/');
    });

    it('should update workspace settings', async () => {
      const newSettings = {
        autoBranch: true,
        branchPrefix: 'feature/',
        autoCommit: true
      };
      
      await workspaceManager.updateWorkspaceSettings(mockConversationId, newSettings);
      
      const updatedSettings = await workspaceManager.getWorkspaceSettings(mockConversationId);
      
      expect(updatedSettings!.autoBranch).toBe(true);
      expect(updatedSettings!.branchPrefix).toBe('feature/');
      expect(updatedSettings!.autoCommit).toBe(true);
    });
  });

  describe('Quick Access Operations', () => {
    it('should create workspace using quick access', async () => {
      // Mock successful directory creation
      mockExecuteTool.mockResolvedValueOnce('Directory created successfully');
      
      const result = await workspaceOperations.createWorkspace(
        mockConversationId,
        mockProjectId,
        mockConversationName
      );
      
      expect(result.success).toBe(true);
      expect(result.workspaceId).toBeTruthy();
    });

    it('should get workspace path using quick access', async () => {
      // Mock successful directory creation
      mockExecuteTool.mockResolvedValueOnce('Directory created successfully');
      
      // Create workspace first
      await workspaceOperations.createWorkspace(
        mockConversationId,
        mockProjectId,
        mockConversationName
      );
      
      // Get workspace path
      const path = await workspaceOperations.getWorkspacePath(mockConversationId);
      
      expect(path).toBeTruthy();
      expect(path).toContain('/conversations/');
      expect(path).toContain(mockProjectId);
    });

    it('should create branch using quick access', async () => {
      // Setup workspace with git
      mockExecuteTool
        .mockResolvedValueOnce('Directory created successfully') // mkdir
        .mockResolvedValueOnce('Initialized empty Git repository') // git init
        .mockResolvedValueOnce('') // git config user.name
        .mockResolvedValueOnce('') // git config user.email
        .mockResolvedValueOnce('README.md created') // create README
        .mockResolvedValueOnce('') // git add
        .mockResolvedValueOnce('[main (root-commit)] Initial commit') // git commit
        .mockResolvedValueOnce('Switched to a new branch \'feature/test\''); // create branch
      
      const workspaceResult = await workspaceOperations.createWorkspace(
        mockConversationId,
        mockProjectId,
        mockConversationName,
        { initializeGit: true }
      );
      
      expect(workspaceResult.success).toBe(true);
      
      const result = await workspaceOperations.createBranch(mockConversationId, 'feature/test');
      
      expect(result.success).toBe(true);
      expect(result.branchName).toBe('feature/test');
    });

    it('should commit changes using quick access', async () => {
      // Setup workspace with git
      mockExecuteTool
        .mockResolvedValueOnce('Directory created successfully') // mkdir
        .mockResolvedValueOnce('Initialized empty Git repository') // git init
        .mockResolvedValueOnce('') // git config user.name
        .mockResolvedValueOnce('') // git config user.email
        .mockResolvedValueOnce('README.md created') // create README
        .mockResolvedValueOnce('') // git add
        .mockResolvedValueOnce('[main (root-commit)] Initial commit') // git commit
        .mockResolvedValueOnce('') // git add for new commit
        .mockResolvedValueOnce('[main abc123] Test commit'); // new commit
      
      const workspaceResult = await workspaceOperations.createWorkspace(
        mockConversationId,
        mockProjectId,
        mockConversationName,
        { initializeGit: true }
      );
      
      expect(workspaceResult.success).toBe(true);
      
      const result = await workspaceOperations.commitChanges(mockConversationId, 'Test commit');
      
      expect(result.success).toBe(true);
      expect(result.command).toBe(GIT_COMMANDS.COMMIT('Test commit'));
    });
  });

  describe('Error Handling', () => {
    it('should handle workspace not found errors', async () => {
      const result = await workspaceManager.getWorkspace('non-existent-conversation');
      
      expect(result).toBeNull();
    });

    it('should handle git operations on non-git workspace', async () => {
      // Create workspace without git
      mockExecuteTool.mockResolvedValueOnce('Directory created successfully');
      
      await workspaceManager.createWorkspace(
        mockConversationId,
        mockProjectId,
        mockConversationName,
        { initializeGit: false }
      );
      
      // Try to create branch
      const result = await workspaceManager.createBranch(mockConversationId, 'feature/test');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('not a git repository');
    });

    it('should handle missing MCP tool execution', async () => {
      const managerWithoutTool = new ConversationWorkspaceManager();
      
      const result = await managerWithoutTool.createWorkspace(
        mockConversationId,
        mockProjectId,
        mockConversationName
      );
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('No MCP tool execution function available');
    });

    it('should handle tool execution errors', async () => {
      // Mock tool execution error - the first call will fail
      mockExecuteTool.mockRejectedValueOnce(new Error('Tool execution failed'));
      
      const result = await workspaceManager.createWorkspace(
        mockConversationId,
        mockProjectId,
        mockConversationName
      );
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Tool execution failed');
    });
  });

  describe('Workspace Persistence', () => {
    it('should persist workspace data after creation', async () => {
      // Mock successful directory creation
      mockExecuteTool.mockResolvedValueOnce('Directory created successfully');
      
      const result = await workspaceManager.createWorkspace(
        mockConversationId,
        mockProjectId,
        mockConversationName
      );
      
      expect(result.success).toBe(true);
      
      // Get all workspaces to verify persistence
      const workspaces = await workspaceManager.getAllWorkspaces();
      
      expect(workspaces.length).toBe(1);
      expect(workspaces[0].conversationId).toBe(mockConversationId);
      expect(workspaces[0].projectId).toBe(mockProjectId);
    });

    it('should maintain workspace state across operations', async () => {
      // Create workspace
      mockExecuteTool.mockResolvedValueOnce('Directory created successfully');
      
      const result = await workspaceManager.createWorkspace(
        mockConversationId,
        mockProjectId,
        mockConversationName
      );
      
      expect(result.success).toBe(true);
      
      // Switch to workspace (should update lastAccessedAt)
      const switchResult = await workspaceManager.switchToWorkspace(mockConversationId);
      expect(switchResult.success).toBe(true);
      
      // Get workspace and verify it was updated
      const workspace = await workspaceManager.getWorkspace(mockConversationId);
      expect(workspace).not.toBeNull();
      expect(workspace!.lastAccessedAt).toBeInstanceOf(Date);
    });
  });
});

// Export test utilities for manual testing
export {
  mockExecuteTool,
  mockProjectId,
  mockConversationId,
  mockConversationName,
  mockMcpServerId
}; 