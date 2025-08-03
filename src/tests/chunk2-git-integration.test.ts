/**
 * Chunk 2: Git Integration Service Tests
 * 
 * Tests for GitService and AutoCommitAgent functionality
 */

import { AutoCommitAgent, getAutoCommitAgent, stopAutoCommitAgent } from '../lib/autoCommitAgent';
import { GitService, createGitService } from '../lib/gitIntegrationService';
import { BranchOperationResult } from '../components/LlmChat/context/types';

// Test constants
const mockProjectId = 'test-project-123';
const mockProjectName = 'Test Project';
const mockProjectPath = '/Users/test/gitrepo/projects/test-project-123_test-project';
const mockMcpServerId = 'test-mcp-server';
const mockConversationId = 'conv-456';

// Mock executeTool function
const mockExecuteTool = jest.fn<Promise<string>, [string, string, Record<string, unknown>]>();

describe('Chunk 2: Git Integration Service', () => {
  let mockExecuteTool: jest.MockedFunction<(serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>>;
  let gitService: GitService;
  let autoCommitAgent: AutoCommitAgent | null = null;

  beforeEach(async () => {
    // Reset fake IndexedDB
    require('fake-indexeddb/auto');
    
    // Create mock executeTool function
    mockExecuteTool = jest.fn();
    mockExecuteTool.mockResolvedValue('Success');
    
    // Create GitService instance
    gitService = createGitService(mockProjectId, mockProjectName, mockMcpServerId, mockExecuteTool);
  });

  afterEach(async () => {
    // Stop any running auto-commit agents
    if (autoCommitAgent && typeof autoCommitAgent.stop === 'function') {
      autoCommitAgent.stop();
      autoCommitAgent = null;
    }
    
    // Stop global agent
    await stopAutoCommitAgent();
    
    // Clear all timers
    jest.clearAllTimers();
    
    // Wait for any pending async operations
    await new Promise(resolve => setTimeout(resolve, 10));
  });

  afterAll(() => {
    // Use real timers after tests
    jest.useRealTimers();
  });

  describe('GitService', () => {
    describe('Repository Initialization', () => {
      it('should initialize a new Git repository', async () => {
        // Mock Git check command to return false (not a git repo)
        mockExecuteTool.mockResolvedValueOnce('false');
        
        // Mock Git init command
        mockExecuteTool.mockResolvedValueOnce('Initialized empty Git repository');
        
        // Mock Git config command
        mockExecuteTool.mockResolvedValueOnce('');

        const result = await gitService.initializeRepository();

        expect(result).toBe(true);
        expect(mockExecuteTool).toHaveBeenCalledWith(mockMcpServerId, 'BashCommand', {
          command: `cd "${mockProjectPath}" && git rev-parse --is-inside-work-tree`,
          thread_id: `git-check-${mockProjectId}`
        });
        expect(mockExecuteTool).toHaveBeenCalledWith(mockMcpServerId, 'BashCommand', {
          command: `cd "${mockProjectPath}" && git init`,
          thread_id: `git-init-${mockProjectId}`
        });
      });

      it('should detect existing Git repository', async () => {
        // Mock Git check command to return true (is a git repo)
        mockExecuteTool.mockResolvedValueOnce('true');

        const result = await gitService.initializeRepository();

        expect(result).toBe(true);
        expect(mockExecuteTool).toHaveBeenCalledTimes(1);
      });

      it('should handle Git initialization errors', async () => {
        // Mock Git check command to return false
        mockExecuteTool.mockResolvedValueOnce('false');
        
        // Mock Git init command to fail
        mockExecuteTool.mockRejectedValueOnce(new Error('Git init failed'));

        const result = await gitService.initializeRepository();

        expect(result).toBe(false);
      });
    });

    describe('Branch Information', () => {
      it('should get branch information from Git repository', async () => {
        // Mock Git repository check
        mockExecuteTool.mockResolvedValueOnce('true');
        
        // Mock current branch command
        mockExecuteTool.mockResolvedValueOnce('main');
        
        // Mock all branches command
        mockExecuteTool.mockResolvedValueOnce('main\nfeature-branch\ndevelop');
        
        // Mock last commit hash
        mockExecuteTool.mockResolvedValueOnce('abc123def456');
        
        // Mock last commit message
        mockExecuteTool.mockResolvedValueOnce('Initial commit');

        const branchInfo = await gitService.getBranchInfo();

        expect(branchInfo).toEqual({
          currentBranch: 'main',
          allBranches: ['main', 'feature-branch', 'develop'],
          isGitRepository: true,
          lastCommitHash: 'abc123def456',
          lastCommitMessage: 'Initial commit'
        });
      });

      it('should handle non-Git repository', async () => {
        // Mock Git repository check to return false
        mockExecuteTool.mockResolvedValueOnce('false');

        const branchInfo = await gitService.getBranchInfo();

        expect(branchInfo).toEqual({
          currentBranch: 'main',
          allBranches: [],
          isGitRepository: false
        });
      });
    });

    describe('Change Detection', () => {
      it('should detect changes in important files', async () => {
        // Mock Git repository check
        mockExecuteTool.mockResolvedValueOnce('true');
        
        // Mock Git status command
        mockExecuteTool.mockResolvedValueOnce(`M  src/components/Test.tsx
A  src/utils/helper.ts
D  old-file.js
M  config.json
M  unimportant.txt`);

        const changes = await gitService.detectChanges();

        expect(changes).toEqual({
          hasChanges: true,
          changedFiles: ['src/components/Test.tsx', 'src/utils/helper.ts', 'old-file.js', 'config.json'],
          addedFiles: ['src/utils/helper.ts'],
          modifiedFiles: ['src/components/Test.tsx', 'config.json'],
          deletedFiles: ['old-file.js'],
          totalChanges: 4
        });
      });

      it('should handle no changes', async () => {
        // Mock Git repository check
        mockExecuteTool.mockResolvedValueOnce('true');
        
        // Mock Git status command with no output
        mockExecuteTool.mockResolvedValueOnce('');

        const changes = await gitService.detectChanges();

        expect(changes).toEqual({
          hasChanges: false,
          changedFiles: [],
          addedFiles: [],
          modifiedFiles: [],
          deletedFiles: [],
          totalChanges: 0
        });
      });

      it('should filter out unimportant files', async () => {
        // Mock Git repository check
        mockExecuteTool.mockResolvedValueOnce('true');
        
        // Mock Git status command with unimportant files
        mockExecuteTool.mockResolvedValueOnce(`M  temp.log
M  .DS_Store
M  node_modules/package.json
M  build/output.js`);

        const changes = await gitService.detectChanges();

        expect(changes).toEqual({
          hasChanges: false,
          changedFiles: [],
          addedFiles: [],
          modifiedFiles: [],
          deletedFiles: [],
          totalChanges: 0
        });
      });
    });

    describe('Branch Creation', () => {
      it('should create a new branch successfully', async () => {
        // Mock Git repository initialization
        mockExecuteTool.mockResolvedValueOnce('true');
        
        // Mock branch info check
        mockExecuteTool.mockResolvedValueOnce('main');
        mockExecuteTool.mockResolvedValueOnce('main');
        
        // Mock branch creation
        mockExecuteTool.mockResolvedValueOnce('Switched to a new branch \'feature-branch\'');
        
        // Mock checkout
        mockExecuteTool.mockResolvedValueOnce('');

        const result = await gitService.createBranch('feature-branch');

        expect(result).toEqual({
          success: true,
          branchName: 'feature-branch',
          filesChanged: []
        });
      });

      it('should handle existing branch', async () => {
        // Mock Git repository initialization
        mockExecuteTool.mockResolvedValueOnce('true');
        
        // Mock branch info check showing existing branch
        mockExecuteTool.mockResolvedValueOnce('main');
        mockExecuteTool.mockResolvedValueOnce('main\nfeature-branch');

        const result = await gitService.createBranch('feature-branch');

        expect(result).toEqual({
          success: false,
          error: 'Branch feature-branch already exists'
        });
      });

      it('should force create over existing branch', async () => {
        // Mock Git repository initialization
        mockExecuteTool.mockResolvedValueOnce('true');
        
        // Mock branch info check showing existing branch
        mockExecuteTool.mockResolvedValueOnce('main');
        mockExecuteTool.mockResolvedValueOnce('main\nfeature-branch');
        
        // Mock branch deletion
        mockExecuteTool.mockResolvedValueOnce('Deleted branch feature-branch');
        
        // Mock branch creation
        mockExecuteTool.mockResolvedValueOnce('Switched to a new branch \'feature-branch\'');
        
        // Mock checkout
        mockExecuteTool.mockResolvedValueOnce('');

        const result = await gitService.createBranch('feature-branch', { force: true });

        expect(result).toEqual({
          success: true,
          branchName: 'feature-branch',
          filesChanged: []
        });
      });
    });

    describe('Commit Changes', () => {
      it('should commit changes successfully', async () => {
        // Mock Git repository initialization
        mockExecuteTool.mockResolvedValueOnce('true');
        
        // Mock change detection
        mockExecuteTool.mockResolvedValueOnce('true');
        mockExecuteTool.mockResolvedValueOnce('M  src/test.ts\nA  src/new.ts');
        
        // Mock staging
        mockExecuteTool.mockResolvedValueOnce('');
        
        // Mock commit
        mockExecuteTool.mockResolvedValueOnce('[main abc123] Test commit');
        
        // Mock getting commit hash
        mockExecuteTool.mockResolvedValueOnce('abc123def456');

        const result = await gitService.commitChanges({
          message: 'Test commit',
          includeUntracked: true
        });

        expect(result).toEqual({
          success: true,
          commitHash: 'abc123def456',
          filesChanged: ['src/test.ts', 'src/new.ts']
        });
      });

      it('should handle no changes to commit', async () => {
        // Mock Git repository initialization
        mockExecuteTool.mockResolvedValueOnce('true');
        
        // Mock change detection with no changes
        mockExecuteTool.mockResolvedValueOnce('true');
        mockExecuteTool.mockResolvedValueOnce('');

        const result = await gitService.commitChanges({
          message: 'Test commit'
        });

        expect(result).toEqual({
          success: false,
          error: 'No changes to commit'
        });
      });
    });

    describe('Auto-Commit Branch Creation', () => {
      it('should create auto-commit branch with changes', async () => {
        // Mock Git repository initialization
        mockExecuteTool.mockResolvedValueOnce('true');
        
        // Mock change detection
        mockExecuteTool.mockResolvedValueOnce('true');
        mockExecuteTool.mockResolvedValueOnce('M  src/test.ts\nA  src/new.ts');
        
        // Mock branch creation
        mockExecuteTool.mockResolvedValueOnce('true');
        mockExecuteTool.mockResolvedValueOnce('main');
        mockExecuteTool.mockResolvedValueOnce('main');
        mockExecuteTool.mockResolvedValueOnce('Switched to new branch');
        mockExecuteTool.mockResolvedValueOnce('');
        
        // Mock commit
        mockExecuteTool.mockResolvedValueOnce('true');
        mockExecuteTool.mockResolvedValueOnce('M  src/test.ts\nA  src/new.ts');
        mockExecuteTool.mockResolvedValueOnce('');
        mockExecuteTool.mockResolvedValueOnce('[branch abc123] Auto-commit');
        mockExecuteTool.mockResolvedValueOnce('abc123def456');

        const result = await gitService.createAutoCommitBranch(mockConversationId);

        expect(result.success).toBe(true);
        expect(result.branchName).toMatch(/^auto-commit-conv-456-/);
        expect(result.commitHash).toBe('abc123def456');
        expect(result.filesChanged).toEqual(['src/test.ts', 'src/new.ts']);
      });

      it('should skip auto-commit when no changes', async () => {
        // Mock Git repository initialization
        mockExecuteTool.mockResolvedValueOnce('true');
        
        // Mock change detection with no changes
        mockExecuteTool.mockResolvedValueOnce('true');
        mockExecuteTool.mockResolvedValueOnce('');

        const result = await gitService.createAutoCommitBranch(mockConversationId);

        expect(result).toEqual({
          success: false,
          error: 'No changes to commit'
        });
      });
    });
  });

  describe('AutoCommitAgent', () => {
    describe('Agent Lifecycle', () => {
      it('should start and stop agent correctly', async () => {
        expect(autoCommitAgent.isAgentRunning()).toBe(false);

        await autoCommitAgent.start(mockAutoCommitContext);
        expect(autoCommitAgent.isAgentRunning()).toBe(true);

        await autoCommitAgent.stop();
        expect(autoCommitAgent.isAgentRunning()).toBe(false);
      });

      it('should prevent starting agent twice', async () => {
        await autoCommitAgent.start(mockAutoCommitContext);
        expect(autoCommitAgent.isAgentRunning()).toBe(true);

        // Try to start again
        await autoCommitAgent.start(mockAutoCommitContext);
        expect(autoCommitAgent.isAgentRunning()).toBe(true);

        await autoCommitAgent.stop();
      });

      it('should handle stopping agent that is not running', async () => {
        expect(autoCommitAgent.isAgentRunning()).toBe(false);
        
        // Should not throw error
        await autoCommitAgent.stop();
        expect(autoCommitAgent.isAgentRunning()).toBe(false);
      });
    });

    describe('Agent Configuration', () => {
      it('should update agent configuration', async () => {
        const newOptions = {
          intervalMinutes: 5,
          maxBranchesPerHour: 30,
          debugMode: true
        };

        await autoCommitAgent.updateConfiguration(newOptions);

        // Agent should restart with new configuration if it was running
        expect(autoCommitAgent.isAgentRunning()).toBe(false);
      });

      it('should restart agent when interval changes', async () => {
        await autoCommitAgent.start(mockAutoCommitContext);
        expect(autoCommitAgent.isAgentRunning()).toBe(true);

        // Update interval
        await autoCommitAgent.updateConfiguration({ intervalMinutes: 5 });
        expect(autoCommitAgent.isAgentRunning()).toBe(true);

        await autoCommitAgent.stop();
      });
    });

    describe('Manual Branch Creation', () => {
      it('should create manual branch successfully', async () => {
        // Mock successful git operations
        mockExecuteTool.mockResolvedValueOnce('true'); // Git repo check
        mockExecuteTool.mockResolvedValueOnce('true'); // Change detection
        mockExecuteTool.mockResolvedValueOnce('M  src/test.ts'); // Git status
        mockExecuteTool.mockResolvedValueOnce('true'); // Git repo check for branch
        mockExecuteTool.mockResolvedValueOnce('main'); // Current branch
        mockExecuteTool.mockResolvedValueOnce('main'); // All branches
        mockExecuteTool.mockResolvedValueOnce(''); // Branch creation
        mockExecuteTool.mockResolvedValueOnce(''); // Checkout
        mockExecuteTool.mockResolvedValueOnce('true'); // Git repo check for commit
        mockExecuteTool.mockResolvedValueOnce('true'); // Change detection
        mockExecuteTool.mockResolvedValueOnce('M  src/test.ts'); // Git status
        mockExecuteTool.mockResolvedValueOnce(''); // Git add
        mockExecuteTool.mockResolvedValueOnce(''); // Git commit
        mockExecuteTool.mockResolvedValueOnce('abc123'); // Commit hash

        await autoCommitAgent.start(mockAutoCommitContext);
        await autoCommitAgent.createManualBranch(mockConversationId);

        await autoCommitAgent.stop();
      });

      it('should throw error when agent not initialized', async () => {
        await expect(autoCommitAgent.createManualBranch(mockConversationId))
          .rejects.toThrow('AutoCommitAgent not initialized with context');
      });
    });

    describe('Rate Limiting', () => {
      it('should respect rate limiting', async () => {
        const limitedAgent = new AutoCommitAgent({
          intervalMinutes: 1,
          maxBranchesPerHour: 2,
          debugMode: false
        });

        // Mock successful operations for first two branches
        mockExecuteTool.mockResolvedValue('true');
        mockExecuteTool.mockResolvedValue('M  src/test.ts');

        await limitedAgent.start(mockAutoCommitContext);

        // Create two manual branches (should hit rate limit)
        await limitedAgent.createManualBranch(mockConversationId);
        await limitedAgent.createManualBranch(mockConversationId);

        await limitedAgent.stop();
      });
    });

    describe('Global Agent Functions', () => {
      it('should get global agent instance', () => {
        const agent1 = getAutoCommitAgent();
        const agent2 = getAutoCommitAgent();
        
        expect(agent1).toBe(agent2); // Should be the same instance
      });

      it('should initialize and stop global agent', async () => {
        await initializeAutoCommitAgent(mockAutoCommitContext);
        const agent = getAutoCommitAgent();
        expect(agent.isAgentRunning()).toBe(true);

        await stopAutoCommitAgent();
        expect(agent.isAgentRunning()).toBe(false);
      });
    });
  });

  describe('Integration Tests', () => {
    it('should integrate GitService with AutoCommitAgent', async () => {
      // Mock successful git operations
      mockExecuteTool.mockResolvedValue('true');
      mockExecuteTool.mockResolvedValue('M  src/integration.ts');

      const agent = getAutoCommitAgent();
      await agent.start(mockAutoCommitContext);

      // Wait a moment for any initial cycle
      await new Promise(resolve => setTimeout(resolve, 100));

      await agent.stop();
    });

    it('should handle database operations correctly', async () => {
      const status = await getAutoCommitAgentStatus();
      expect(status).toBeDefined();
      expect(typeof status.isRunning).toBe('boolean');
      expect(typeof status.totalBranchesCreated).toBe('number');
      expect(typeof status.totalCommits).toBe('number');
      expect(Array.isArray(status.errors)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle Git command failures gracefully', async () => {
      // Mock Git command failure
      mockExecuteTool.mockRejectedValue(new Error('Git command failed'));

      const result = await gitService.detectChanges();
      
      expect(result).toEqual({
        hasChanges: false,
        changedFiles: [],
        addedFiles: [],
        modifiedFiles: [],
        deletedFiles: [],
        totalChanges: 0
      });
    });

    it('should handle agent cycle errors', async () => {
      // Mock Git command failure
      mockExecuteTool.mockRejectedValue(new Error('Git command failed'));

      await autoCommitAgent.start(mockAutoCommitContext);
      
      // Wait for potential error cycle
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await autoCommitAgent.stop();
    });
  });
}); 