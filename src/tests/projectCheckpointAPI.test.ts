import { describe, expect, test, beforeEach } from '@jest/globals';
import { Project } from '../components/LlmChat/context/types';
import { ProjectCheckpointAPI, createProjectCheckpointAPI, type ProjectInitConfig } from '../api/projectCheckpointAPI';

describe('Project Checkpoint API Tests', () => {
  // Mock executeTool function that simulates Git operations
  const mockExecuteTool = async (serverId: string, toolName: string, args: Record<string, unknown>): Promise<string> => {
    console.log(`Mock executing tool: ${toolName} with args:`, args);
    
    // Simulate git commands
    if (toolName === 'BashCommand' && typeof args.action_json === 'object' && args.action_json !== null) {
      const command = (args.action_json as { command: string }).command;
      
      // Handle empty branch name
      if (command.includes('git checkout') && (command.endsWith('git checkout ') || command.includes('git checkout ""'))) {
        return JSON.stringify({
          success: false,
          error: "Cannot checkout empty branch name"
        });
      }

      // Simulate git status with changes
      if (command.includes('git status --porcelain')) {
        return JSON.stringify({
          success: true,
          data: {
            output: " M src/file1.ts\n M src/file2.ts\n?? src/file3.ts"
          }
        });
      }

      // Simulate git diff stats
      if (command.includes('git diff --stat')) {
        return JSON.stringify({
          success: true,
          data: {
            filesChanged: 5,
            linesChanged: 100,
            output: " src/file1.ts | 25 +++++-----\n src/file2.ts | 15 +++---"
          }
        });
      }

      // Simulate git branch list
      if (command.includes('git branch --format')) {
        return JSON.stringify({
          success: true,
          data: {
            output: "main|abc123|2024-03-20T10:00:00|Initial commit\ncheckpoint/20240320-1|def456|2024-03-20T11:00:00|First checkpoint\nfeature/test|ghi789|2024-03-20T12:00:00|Feature branch"
          }
        });
      }

      // Simulate git branch show-current
      if (command.includes('git branch --show-current')) {
        return JSON.stringify({
          success: true,
          data: {
            output: "main"
          }
        });
      }

      // Simulate git remote info
      if (command.includes('git remote -v') || command.includes('git config --get remote.origin.url')) {
        return JSON.stringify({
          success: true,
          data: {
            remotes: ['origin\thttps://github.com/test/repo.git (fetch)', 'origin\thttps://github.com/test/repo.git (push)']
          }
        });
      }

      // Simulate git add
      if (command.includes('git add')) {
        return JSON.stringify({
          success: true,
          data: {
            output: ""
          }
        });
      }

      // Simulate git commit
      if (command.includes('git commit -m')) {
        return JSON.stringify({
          success: true,
          data: {
            commitHash: 'abc123',
            message: command.split('"')[1] || 'Commit message'
          }
        });
      }

      // Simulate git checkout branch creation
      if (command.includes('git checkout -b')) {
        const branchName = command.split('git checkout -b ')[1].split(' ')[0];
        return JSON.stringify({
          success: true,
          data: {
            branch: branchName,
            commitHash: 'abc123',
            message: `Created branch ${branchName}`
          }
        });
      }

      // Simulate git fetch
      if (command.includes('git fetch')) {
        return JSON.stringify({
          success: true,
          data: {
            output: "Fetching origin"
          }
        });
      }

      // Simulate git rev-parse HEAD
      if (command.includes('git rev-parse HEAD')) {
        return JSON.stringify({
          success: true,
          data: {
            output: "abc123def456"
          }
        });
      }

      // Default success response for other git commands
      return JSON.stringify({
        success: true,
        data: {
          output: "Command executed successfully"
        }
      });
    }
    
    return JSON.stringify({ success: true, data: {} });
  };

  const mockServerId = 'test-server-id';

  // Mock project data
  const mockProject: Project = {
    id: 'test-project-123',
    name: 'Test Project',
    settings: {
      model: 'claude-3-5-sonnet-20241022',
      systemPrompt: '',
      elideToolResults: false,
      messageWindowSize: 20,
      enableGitHub: false,
      mcpServerIds: ['test-server-id']
    },
    conversations: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    order: 0
  };

  let api: ProjectCheckpointAPI;

  beforeEach(() => {
    api = createProjectCheckpointAPI(mockProject, mockServerId, mockExecuteTool);
  });

  describe('Project Initialization', () => {
    test('should initialize new project with git setup', async () => {
      const config: ProjectInitConfig = {
        projectId: 'test-project-123',
        projectName: 'Test Project',
        isClonedRepo: false,
        autoCheckpoint: true
      };

      const result = await ProjectCheckpointAPI.initializeNewProject(
        config,
        mockServerId,
        mockExecuteTool
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      if (result.success && result.data) {
        expect(result.data.projectId).toBe('test-project-123');
        expect(result.data.isGitRepo).toBe(true);
        expect(result.data.defaultBranch).toBe('main');
      }
    });

    test('should initialize from cloned repo with GitHub integration', async () => {
      const config: ProjectInitConfig = {
        projectId: 'test-project-123',
        projectName: 'Test Project',
        isClonedRepo: true,
        repoPath: 'https://github.com/test/repo.git',
        enableGitHub: true
      };

      const result = await ProjectCheckpointAPI.initializeNewProject(
        config,
        mockServerId,
        mockExecuteTool
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      if (result.success && result.data) {
        expect(result.data.isGitRepo).toBe(true);
        expect(result.data.hasGitHubRepo).toBe(true);
        expect(result.data.gitHubRepoUrl).toContain('github.com');
      }
    });
  });

  describe('Checkpoint Operations', () => {
    test('should create checkpoint with substantial changes', async () => {
      const result = await api.createCheckpoint(
        "Test checkpoint with substantial changes",
        "feature",
        true
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      if (result.success && result.data) {
        expect(result.data.branchName).toContain('feature/');
        expect(result.data.commitHash).toBeDefined();
        expect(result.data.filesChanged).toBeGreaterThan(0);
      }
    });

    test('should not create checkpoint without substantial changes when not forced', async () => {
      // Override mockExecuteTool for this test to simulate minimal changes
      const minimalChangesMock = async (serverId: string, toolName: string, args: Record<string, unknown>): Promise<string> => {
        if (toolName === 'BashCommand' && typeof args.action_json === 'object' && args.action_json !== null) {
          const command = (args.action_json as { command: string }).command;
          if (command.includes('git status --porcelain') || command.includes('git diff --stat')) {
            return JSON.stringify({
              success: true,
              data: {
                filesChanged: 1,
                linesChanged: 5
              }
            });
          }
        }
        return mockExecuteTool(serverId, toolName, args);
      };

      const localApi = createProjectCheckpointAPI(mockProject, mockServerId, minimalChangesMock);
      const result = await localApi.createCheckpoint(
        "Test checkpoint with minimal changes",
        "feature",
        false // don't force creation
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Not enough changes');
    });

    test('should list checkpoints with correct format', async () => {
      const result = await api.listCheckpoints();
      
      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
      if (result.success && result.data) {
        const checkpoints = result.data;
        expect(checkpoints.length).toBeGreaterThan(0);
        expect(checkpoints[0]).toHaveProperty('name');
        expect(checkpoints[0]).toHaveProperty('date');
        expect(checkpoints[0]).toHaveProperty('description');
        expect(checkpoints[0]).toHaveProperty('commitHash');
      }
    });

    test('should create backup branch during checkpoint creation when specified', async () => {
      const result = await api.createCheckpoint(
        "Test checkpoint with backup",
        "feature",
        true
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      if (result.success && result.data) {
        expect(result.data.branchName).toBeDefined();
        expect(result.data.commitHash).toBeDefined();
        expect(result.data.description).toBe("Test checkpoint with backup");
      }
    });
  });

  describe('Branch Management', () => {
    test('should switch branches safely with backup', async () => {
      const result = await api.switchToBranch("feature/test", true);
      
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      if (result.success && result.data) {
        expect(result.data.targetBranch).toBe("feature/test");
        expect(result.data.previousBranch).toBeDefined();
        expect(result.data.backupBranch).toBeDefined();
      }
    });

    test('should handle switching to non-existent branch', async () => {
      // Override mockExecuteTool for this test to simulate branch not found
      const branchNotFoundMock = async (serverId: string, toolName: string, args: Record<string, unknown>): Promise<string> => {
        if (toolName === 'BashCommand' && typeof args.action_json === 'object' && args.action_json !== null) {
          const command = (args.action_json as { command: string }).command;
          if (command.includes('git branch --list')) {
            return JSON.stringify({
              success: false,
              error: "Branch not found"
            });
          }
        }
        return mockExecuteTool(serverId, toolName, args);
      };

      const localApi = createProjectCheckpointAPI(mockProject, mockServerId, branchNotFoundMock);
      const result = await localApi.switchToBranch("non/existent/branch", true);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle invalid branch name', async () => {
      const result = await api.switchToBranch("", true);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Cannot checkout empty branch name");
    });
  });

  describe('Project Health', () => {
    test('should get project health with git status', async () => {
      const result = await api.getProjectHealth();
      
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      if (result.success && result.data) {
        expect(result.data.projectId).toBe(mockProject.id);
        expect(result.data.gitStatus).toBeDefined();
        expect(result.data.currentBranch).toBeDefined();
      }
    });

    test('should detect uncommitted changes in health check', async () => {
      const result = await api.getProjectHealth();
      
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      if (result.success && result.data) {
        expect(result.data.hasUncommittedChanges).toBeDefined();
        expect(result.data.uncommittedFiles).toBeDefined();
      }
    });
  });

  describe('Error Handling', () => {
    test('should handle git command failures gracefully', async () => {
      // Override mockExecuteTool for this test to simulate git command failure
      const gitFailureMock = async (serverId: string, toolName: string, args: Record<string, unknown>): Promise<string> => {
        if (toolName === 'BashCommand') {
          return JSON.stringify({
            success: false,
            error: "Git command failed: permission denied"
          });
        }
        return mockExecuteTool(serverId, toolName, args);
      };

      const localApi = createProjectCheckpointAPI(mockProject, mockServerId, gitFailureMock);
      const result = await localApi.createCheckpoint(
        "Test checkpoint",
        "feature",
        true
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Git command failed");
    });

    test('should handle invalid project path', async () => {
      // Override mockExecuteTool for this test to simulate invalid project path
      const invalidPathMock = async (serverId: string, toolName: string, args: Record<string, unknown>): Promise<string> => {
        if (toolName === 'BashCommand' && typeof args.action_json === 'object' && args.action_json !== null) {
          const command = (args.action_json as { command: string }).command;
          if (command.includes('cd ')) {
            return JSON.stringify({
              success: false,
              error: "No such file or directory"
            });
          }
        }
        return mockExecuteTool(serverId, toolName, args);
      };

      const localApi = createProjectCheckpointAPI(mockProject, mockServerId, invalidPathMock);
      const result = await localApi.getProjectHealth();

      expect(result.success).toBe(false);
      expect(result.error).toContain("No such file or directory");
    });

    test('should handle concurrent git operations', async () => {
      // Test multiple operations in parallel
      const operations = [
        api.createCheckpoint("First checkpoint", "feature", true),
        api.createCheckpoint("Second checkpoint", "bugfix", true),
        api.switchToBranch("main", true)
      ];

      const results = await Promise.all(operations);
      
      // All operations should complete without throwing errors
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(typeof result.success).toBe('boolean');
      });
    });
  });
}); 