/**
 * Conversation Workspace Manager
 * 
 * Phase 2.1: Conversation Workspace Service
 * - Manages conversation-specific workspace folders
 * - Handles workspace creation, deletion, and isolation
 * - Provides complete git branch management
 * - Ensures local database persistence
 */

import {
  WorkspaceMapping,
  WorkspaceCreationOptions,
  ConversationWorkspaceSettings,
  BranchInfo
} from '../components/LlmChat/context/types';

import {
  loadWorkspaceMappings,
  saveWorkspaceMappings,
  updateWorkspaceMapping,
  deleteWorkspaceMapping,
  loadConversationSettings,
  saveConversationSettings
} from './db';

import {
  createWorkspaceMapping,
  createDefaultWorkspaceSettings,
  logWorkspaceOperation
} from './conversationWorkspaceService';

// 🌟 PHASE 2.1: Git commands for branch management
export const GIT_COMMANDS = {
  INIT: 'git init',
  STATUS: 'git status',
  ADD_ALL: 'git add .',
  COMMIT: (message: string) => `git commit -m "${message}"`,
  BRANCH_LIST: 'git branch',
  BRANCH_CREATE: (branchName: string) => `git checkout -b ${branchName}`,
  BRANCH_SWITCH: (branchName: string) => `git checkout ${branchName}`,
  BRANCH_DELETE: (branchName: string) => `git branch -D ${branchName}`,
  PUSH_ORIGIN: (branchName: string) => `git push origin ${branchName}`,
  PUSH_SET_UPSTREAM: (branchName: string) => `git push -u origin ${branchName}`,
  REMOTE_ADD: (remoteName: string, url: string) => `git remote add ${remoteName} ${url}`,
  REMOTE_LIST: 'git remote -v',
  LOG_ONELINE: 'git log --oneline -10',
  DIFF: 'git diff',
  DIFF_STAGED: 'git diff --staged'
};

// 🌟 PHASE 2.1: Workspace operation results
export interface WorkspaceOperationResult {
  success: boolean;
  workspaceId: string;
  workspacePath: string;
  operation: string;
  timestamp: Date;
  error?: string;
  details?: Record<string, unknown>;
}

// 🌟 PHASE 2.1: Git operation results
export interface GitOperationResult {
  success: boolean;
  command: string;
  output: string;
  error?: string;
  timestamp: Date;
  workspaceId: string;
  branchName?: string;
}

// 🌟 PHASE 2.1: Workspace creation configuration
export interface WorkspaceCreationConfig extends WorkspaceCreationOptions {
  autoCommit?: boolean;
  commitMessage?: string;
  createRemote?: boolean;
  remoteUrl?: string;
  pushToRemote?: boolean;
}

/**
 * Main Conversation Workspace Manager
 */
export class ConversationWorkspaceManager {
  private workspaceMappings: Map<string, WorkspaceMapping> = new Map();
  private conversationSettings: Map<string, ConversationWorkspaceSettings> = new Map();
  private isInitialized: boolean = false;

  // MCP tool execution function (injected)
  private executeTool?: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>;
  private mcpServerId: string = 'localhost-mcp';

  constructor(
    executeTool?: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>,
    mcpServerId?: string
  ) {
    this.executeTool = executeTool;
    this.mcpServerId = mcpServerId || 'localhost-mcp';
  }

  /**
   * Initialize the workspace manager
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      logWorkspaceOperation('WORKSPACE_MANAGER_INIT_START', {});

      // Load workspace mappings from database
      const mappings = await loadWorkspaceMappings();
      this.workspaceMappings.clear();
      mappings.forEach(mapping => {
        this.workspaceMappings.set(mapping.conversationId, mapping);
      });

      // Load conversation settings from database
      const settings = await loadConversationSettings();
      this.conversationSettings.clear();
      Object.entries(settings).forEach(([conversationId, setting]) => {
        this.conversationSettings.set(conversationId, setting);
      });

      this.isInitialized = true;

      logWorkspaceOperation('WORKSPACE_MANAGER_INITIALIZED', {
        workspaceCount: this.workspaceMappings.size,
        settingsCount: this.conversationSettings.size
      });

    } catch (error) {
      logWorkspaceOperation('WORKSPACE_MANAGER_INIT_ERROR', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Create a new workspace for a conversation
   */
  async createWorkspace(
    conversationId: string,
    projectId: string,
    conversationName: string,
    config: WorkspaceCreationConfig = {}
  ): Promise<WorkspaceOperationResult> {
    await this.initialize();

    try {
      logWorkspaceOperation('WORKSPACE_CREATE_START', {
        conversationId,
        projectId,
        conversationName,
        config
      });

      // Check if workspace already exists
      const existing = this.workspaceMappings.get(conversationId);
      if (existing) {
        return {
          success: false,
          workspaceId: existing.workspaceId,
          workspacePath: existing.workspacePath,
          operation: 'create_workspace',
          timestamp: new Date(),
          error: 'Workspace already exists for this conversation'
        };
      }

      // Create workspace mapping
      const workspaceMapping = createWorkspaceMapping(
        conversationId,
        projectId,
        conversationName,
        config
      );

      // Create workspace directory
      const createResult = await this.createWorkspaceDirectory(workspaceMapping.workspacePath);
      if (!createResult.success) {
        return {
          success: false,
          workspaceId: workspaceMapping.workspaceId,
          workspacePath: workspaceMapping.workspacePath,
          operation: 'create_workspace',
          timestamp: new Date(),
          error: createResult.error
        };
      }

      // Initialize git repository if requested
      if (config.initializeGit) {
        const gitResult = await this.initializeGitRepository(
          workspaceMapping.workspaceId,
          workspaceMapping.workspacePath,
          config.branchName || 'main'
        );
        
        if (!gitResult.success) {
          logWorkspaceOperation('WORKSPACE_GIT_INIT_WARNING', {
            workspaceId: workspaceMapping.workspaceId,
            error: gitResult.error
          });
          // Continue even if git init fails
        }
      }

      // Create default settings
      const settings = createDefaultWorkspaceSettings(!config.isolate);
      this.conversationSettings.set(conversationId, settings);

      // Update workspace status
      workspaceMapping.workspaceStatus = 'active';
      workspaceMapping.lastAccessedAt = new Date();

      // Store in memory and database
      this.workspaceMappings.set(conversationId, workspaceMapping);
      await this.persistWorkspaceData();

      logWorkspaceOperation('WORKSPACE_CREATED', {
        conversationId,
        workspaceId: workspaceMapping.workspaceId,
        workspacePath: workspaceMapping.workspacePath,
        isGitRepository: config.initializeGit
      });

      return {
        success: true,
        workspaceId: workspaceMapping.workspaceId,
        workspacePath: workspaceMapping.workspacePath,
        operation: 'create_workspace',
        timestamp: new Date(),
        details: {
          isGitRepository: config.initializeGit,
          branchName: config.branchName || 'main',
          isolated: config.isolate || false
        }
      };

    } catch (error) {
      logWorkspaceOperation('WORKSPACE_CREATE_ERROR', {
        conversationId,
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        success: false,
        workspaceId: '',
        workspacePath: '',
        operation: 'create_workspace',
        timestamp: new Date(),
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Delete a workspace for a conversation
   */
  async deleteWorkspace(conversationId: string): Promise<WorkspaceOperationResult> {
    await this.initialize();

    try {
      logWorkspaceOperation('WORKSPACE_DELETE_START', { conversationId });

      const workspace = this.workspaceMappings.get(conversationId);
      if (!workspace) {
        return {
          success: false,
          workspaceId: '',
          workspacePath: '',
          operation: 'delete_workspace',
          timestamp: new Date(),
          error: 'Workspace not found for conversation'
        };
      }

      // Remove from memory
      this.workspaceMappings.delete(conversationId);
      this.conversationSettings.delete(conversationId);

      // Remove from database
      await deleteWorkspaceMapping(workspace.workspaceId);

      // Note: We don't actually delete the directory here for safety
      // The cleanup service will handle actual directory removal

      logWorkspaceOperation('WORKSPACE_DELETED', {
        conversationId,
        workspaceId: workspace.workspaceId,
        workspacePath: workspace.workspacePath
      });

      return {
        success: true,
        workspaceId: workspace.workspaceId,
        workspacePath: workspace.workspacePath,
        operation: 'delete_workspace',
        timestamp: new Date(),
        details: {
          note: 'Workspace mapping deleted, directory cleanup handled by cleanup service'
        }
      };

    } catch (error) {
      logWorkspaceOperation('WORKSPACE_DELETE_ERROR', {
        conversationId,
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        success: false,
        workspaceId: '',
        workspacePath: '',
        operation: 'delete_workspace',
        timestamp: new Date(),
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Get workspace for a conversation
   */
  async getWorkspace(conversationId: string): Promise<WorkspaceMapping | null> {
    await this.initialize();

    const workspace = this.workspaceMappings.get(conversationId);
    if (workspace) {
      // Update last accessed time
      workspace.lastAccessedAt = new Date();
      await this.updateWorkspace(workspace);
    }

    return workspace || null;
  }

  /**
   * Switch to a workspace (sets it as active)
   */
  async switchToWorkspace(conversationId: string): Promise<WorkspaceOperationResult> {
    await this.initialize();

    try {
      const workspace = this.workspaceMappings.get(conversationId);
      if (!workspace) {
        return {
          success: false,
          workspaceId: '',
          workspacePath: '',
          operation: 'switch_workspace',
          timestamp: new Date(),
          error: 'Workspace not found for conversation'
        };
      }

      // Update last accessed time
      workspace.lastAccessedAt = new Date();
      await this.updateWorkspace(workspace);

      logWorkspaceOperation('WORKSPACE_SWITCHED', {
        conversationId,
        workspaceId: workspace.workspaceId,
        workspacePath: workspace.workspacePath
      });

      return {
        success: true,
        workspaceId: workspace.workspaceId,
        workspacePath: workspace.workspacePath,
        operation: 'switch_workspace',
        timestamp: new Date()
      };

    } catch (error) {
      return {
        success: false,
        workspaceId: '',
        workspacePath: '',
        operation: 'switch_workspace',
        timestamp: new Date(),
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Create a new branch in a workspace
   */
  async createBranch(
    conversationId: string,
    branchName: string,
    switchToBranch: boolean = true
  ): Promise<GitOperationResult> {
    await this.initialize();

    try {
      const workspace = this.workspaceMappings.get(conversationId);
      if (!workspace) {
        return {
          success: false,
          command: GIT_COMMANDS.BRANCH_CREATE(branchName),
          output: '',
          error: 'Workspace not found for conversation',
          timestamp: new Date(),
          workspaceId: '',
          branchName
        };
      }

      if (!workspace.isGitRepository) {
        return {
          success: false,
          command: GIT_COMMANDS.BRANCH_CREATE(branchName),
          output: '',
          error: 'Workspace is not a git repository',
          timestamp: new Date(),
          workspaceId: workspace.workspaceId,
          branchName
        };
      }

      // Create and switch to branch
      const command = GIT_COMMANDS.BRANCH_CREATE(branchName);
      const gitResult = await this.executeGitCommand(workspace.workspacePath, command);

      if (gitResult.success) {
        // Update workspace mapping with new branch
        const branchInfo: BranchInfo = {
          name: branchName,
          isDefault: false,
          createdAt: new Date()
        };

        if (!workspace.branches) {
          workspace.branches = [];
        }
        workspace.branches.push(branchInfo);
        workspace.currentBranch = branchName;

        await this.updateWorkspace(workspace);

        logWorkspaceOperation('BRANCH_CREATED', {
          conversationId,
          workspaceId: workspace.workspaceId,
          branchName,
          switchToBranch
        });
      }

      return {
        ...gitResult,
        workspaceId: workspace.workspaceId,
        branchName
      };

    } catch (error) {
      return {
        success: false,
        command: GIT_COMMANDS.BRANCH_CREATE(branchName),
        output: '',
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
        workspaceId: '',
        branchName
      };
    }
  }

  /**
   * Switch to an existing branch
   */
  async switchBranch(conversationId: string, branchName: string): Promise<GitOperationResult> {
    await this.initialize();

    try {
      const workspace = this.workspaceMappings.get(conversationId);
      if (!workspace) {
        return {
          success: false,
          command: GIT_COMMANDS.BRANCH_SWITCH(branchName),
          output: '',
          error: 'Workspace not found for conversation',
          timestamp: new Date(),
          workspaceId: '',
          branchName
        };
      }

      if (!workspace.isGitRepository) {
        return {
          success: false,
          command: GIT_COMMANDS.BRANCH_SWITCH(branchName),
          output: '',
          error: 'Workspace is not a git repository',
          timestamp: new Date(),
          workspaceId: workspace.workspaceId,
          branchName
        };
      }

      const command = GIT_COMMANDS.BRANCH_SWITCH(branchName);
      const gitResult = await this.executeGitCommand(workspace.workspacePath, command);

      if (gitResult.success) {
        workspace.currentBranch = branchName;
        await this.updateWorkspace(workspace);

        logWorkspaceOperation('BRANCH_SWITCHED', {
          conversationId,
          workspaceId: workspace.workspaceId,
          branchName
        });
      }

      return {
        ...gitResult,
        workspaceId: workspace.workspaceId,
        branchName
      };

    } catch (error) {
      return {
        success: false,
        command: GIT_COMMANDS.BRANCH_SWITCH(branchName),
        output: '',
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
        workspaceId: '',
        branchName
      };
    }
  }

  /**
   * Commit changes in a workspace
   */
  async commitChanges(
    conversationId: string,
    commitMessage: string,
    addAll: boolean = true
  ): Promise<GitOperationResult> {
    await this.initialize();

    try {
      const workspace = this.workspaceMappings.get(conversationId);
      if (!workspace) {
        return {
          success: false,
          command: GIT_COMMANDS.COMMIT(commitMessage),
          output: '',
          error: 'Workspace not found for conversation',
          timestamp: new Date(),
          workspaceId: ''
        };
      }

      if (!workspace.isGitRepository) {
        return {
          success: false,
          command: GIT_COMMANDS.COMMIT(commitMessage),
          output: '',
          error: 'Workspace is not a git repository',
          timestamp: new Date(),
          workspaceId: workspace.workspaceId
        };
      }



      // Add all files if requested
      if (addAll) {
        const addResult = await this.executeGitCommand(workspace.workspacePath, GIT_COMMANDS.ADD_ALL);
        if (!addResult.success) {
          return {
            ...addResult,
            workspaceId: workspace.workspaceId
          };
        }
      }

      // Commit changes
      const commitCommand = GIT_COMMANDS.COMMIT(commitMessage);
      const commitResult = await this.executeGitCommand(workspace.workspacePath, commitCommand);

      if (commitResult.success) {
        // Update branch info with commit
        if (workspace.branches && workspace.currentBranch) {
          const currentBranchInfo = workspace.branches.find(b => b.name === workspace.currentBranch);
          if (currentBranchInfo) {
            currentBranchInfo.lastCommitMessage = commitMessage;
            currentBranchInfo.lastCommitTimestamp = new Date();
          }
        }

        await this.updateWorkspace(workspace);

        logWorkspaceOperation('CHANGES_COMMITTED', {
          conversationId,
          workspaceId: workspace.workspaceId,
          commitMessage,
          branchName: workspace.currentBranch
        });
      }

      return {
        ...commitResult,
        workspaceId: workspace.workspaceId
      };

    } catch (error) {
      return {
        success: false,
        command: GIT_COMMANDS.COMMIT(commitMessage),
        output: '',
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
        workspaceId: ''
      };
    }
  }

  /**
   * Push branch to remote
   */
  async pushBranch(
    conversationId: string,
    branchName?: string,
    setUpstream: boolean = false
  ): Promise<GitOperationResult> {
    await this.initialize();

    try {
      const workspace = this.workspaceMappings.get(conversationId);
      if (!workspace) {
        return {
          success: false,
          command: '',
          output: '',
          error: 'Workspace not found for conversation',
          timestamp: new Date(),
          workspaceId: ''
        };
      }

      if (!workspace.isGitRepository) {
        return {
          success: false,
          command: '',
          output: '',
          error: 'Workspace is not a git repository',
          timestamp: new Date(),
          workspaceId: workspace.workspaceId
        };
      }

      // Skip push when repo has no commits or no current branch
      try {
        const headCheck = await this.executeTool!(this.mcpServerId, 'BashCommand', {
          action_json: { command: `cd "${workspace.workspacePath}" && git rev-parse --verify HEAD`, type: 'command' },
          thread_id: `git-head-check-${Date.now()}`
        });
        const headText = (headCheck || '').toString().toLowerCase();
        if (headText.includes('fatal') || headText.includes('unknown revision')) {
          return {
            success: false,
            command: '',
            output: '',
            error: 'Repository has no commits; skipping push',
            timestamp: new Date(),
            workspaceId: workspace.workspaceId
          };
        }
      } catch {
        return {
          success: false,
          command: '',
          output: '',
          error: 'Repository has no commits; skipping push',
          timestamp: new Date(),
          workspaceId: workspace.workspaceId
        };
      }

      const targetBranch = branchName || workspace.currentBranch || '';
      if (!targetBranch) {
        return {
          success: false,
          command: '',
          output: '',
          error: 'No current branch; skipping push',
          timestamp: new Date(),
          workspaceId: workspace.workspaceId
        };
      }
      const command = setUpstream 
        ? GIT_COMMANDS.PUSH_SET_UPSTREAM(targetBranch)
        : GIT_COMMANDS.PUSH_ORIGIN(targetBranch);

      const gitResult = await this.executeGitCommand(workspace.workspacePath, command);

      if (gitResult.success) {
        logWorkspaceOperation('BRANCH_PUSHED', {
          conversationId,
          workspaceId: workspace.workspaceId,
          branchName: targetBranch,
          setUpstream
        });
      }

      return {
        ...gitResult,
        workspaceId: workspace.workspaceId,
        branchName: targetBranch
      };

    } catch (error) {
      return {
        success: false,
        command: '',
        output: '',
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
        workspaceId: ''
      };
    }
  }

  /**
   * Get git status for a workspace
   */
  async getGitStatus(conversationId: string): Promise<GitOperationResult> {
    await this.initialize();

    try {
      const workspace = this.workspaceMappings.get(conversationId);
      if (!workspace) {
        return {
          success: false,
          command: GIT_COMMANDS.STATUS,
          output: '',
          error: 'Workspace not found for conversation',
          timestamp: new Date(),
          workspaceId: ''
        };
      }

      if (!workspace.isGitRepository) {
        return {
          success: false,
          command: GIT_COMMANDS.STATUS,
          output: '',
          error: 'Workspace is not a git repository',
          timestamp: new Date(),
          workspaceId: workspace.workspaceId
        };
      }

      const gitResult = await this.executeGitCommand(workspace.workspacePath, GIT_COMMANDS.STATUS);

      return {
        ...gitResult,
        workspaceId: workspace.workspaceId
      };

    } catch (error) {
      return {
        success: false,
        command: GIT_COMMANDS.STATUS,
        output: '',
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
        workspaceId: ''
      };
    }
  }

  /**
   * Get list of branches for a workspace
   */
  async listBranches(conversationId: string): Promise<GitOperationResult> {
    await this.initialize();

    try {
      const workspace = this.workspaceMappings.get(conversationId);
      if (!workspace) {
        return {
          success: false,
          command: GIT_COMMANDS.BRANCH_LIST,
          output: '',
          error: 'Workspace not found for conversation',
          timestamp: new Date(),
          workspaceId: ''
        };
      }

      if (!workspace.isGitRepository) {
        return {
          success: false,
          command: GIT_COMMANDS.BRANCH_LIST,
          output: '',
          error: 'Workspace is not a git repository',
          timestamp: new Date(),
          workspaceId: workspace.workspaceId
        };
      }

      const gitResult = await this.executeGitCommand(workspace.workspacePath, GIT_COMMANDS.BRANCH_LIST);

      return {
        ...gitResult,
        workspaceId: workspace.workspaceId
      };

    } catch (error) {
      return {
        success: false,
        command: GIT_COMMANDS.BRANCH_LIST,
        output: '',
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
        workspaceId: ''
      };
    }
  }

  /**
   * Get all workspace mappings
   */
  async getAllWorkspaces(): Promise<WorkspaceMapping[]> {
    await this.initialize();
    return Array.from(this.workspaceMappings.values());
  }

  /**
   * Get workspace settings
   */
  async getWorkspaceSettings(conversationId: string): Promise<ConversationWorkspaceSettings | null> {
    await this.initialize();
    return this.conversationSettings.get(conversationId) || null;
  }

  /**
   * Update workspace settings
   */
  async updateWorkspaceSettings(
    conversationId: string,
    settings: Partial<ConversationWorkspaceSettings>
  ): Promise<void> {
    await this.initialize();

    const currentSettings = this.conversationSettings.get(conversationId) || createDefaultWorkspaceSettings();
    const updatedSettings = { ...currentSettings, ...settings };

    this.conversationSettings.set(conversationId, updatedSettings);
    await this.persistConversationSettings();

    logWorkspaceOperation('WORKSPACE_SETTINGS_UPDATED', {
      conversationId,
      settings: updatedSettings
    });
  }

  // Private helper methods

  /**
   * Create workspace directory
   */
  private async createWorkspaceDirectory(workspacePath: string): Promise<{ success: boolean; error?: string }> {
    if (!this.executeTool) {
      return { success: false, error: 'No MCP tool execution function available' };
    }

    try {
      const result = await this.executeTool(this.mcpServerId, 'BashCommand', {
        action_json: {
          command: `mkdir -p "${workspacePath}" && echo "Directory created successfully"`
        },
        thread_id: `create-workspace-${Date.now()}`
      });

      if (result.includes('Directory created successfully')) {
        return { success: true };
      } else {
        return { success: false, error: 'Failed to create workspace directory' };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Initialize git repository
   */
  private async initializeGitRepository(
    workspaceId: string,
    workspacePath: string,
    branchName: string = 'main'
  ): Promise<GitOperationResult> {
    if (!this.executeTool) {
      return {
        success: false,
        command: GIT_COMMANDS.INIT,
        output: '',
        error: 'No MCP tool execution function available',
        timestamp: new Date(),
        workspaceId
      };
    }

    try {
      // Initialize git repository
      const initResult = await this.executeGitCommand(workspacePath, GIT_COMMANDS.INIT);
      if (!initResult.success) {
        return initResult;
      }

      // Do not set identity here; rely on repo/global config or env-provided values

      // Ensure HEAD points to main without creating a commit
      await this.executeGitCommand(workspacePath, 'git symbolic-ref HEAD refs/heads/main || true');

      // Create initial commit only if caller performs it later; here we just drop a README file
      await this.executeTool(this.mcpServerId, 'FileWriteOrEdit', {
        file_path: `${workspacePath}/README.md`,
        content: `# Workspace for Conversation\n\nThis is a conversation workspace created by Kibitz.\n\nCreated: ${new Date().toISOString()}\n`,
        thread_id: `init-readme-${Date.now()}`
      });

      // Do not auto-commit; commits will be created explicitly by workflow

      // Create specified branch if not main
      if (branchName !== 'main') {
        await this.executeGitCommand(workspacePath, GIT_COMMANDS.BRANCH_CREATE(branchName));
      }

      return {
        success: true,
        command: GIT_COMMANDS.INIT,
        output: 'Git repository initialized successfully',
        timestamp: new Date(),
        workspaceId,
        branchName
      };

    } catch (error) {
      return {
        success: false,
        command: GIT_COMMANDS.INIT,
        output: '',
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
        workspaceId
      };
    }
  }

  /**
   * Execute git command
   */
  private async executeGitCommand(workspacePath: string, command: string): Promise<GitOperationResult> {
    if (!this.executeTool) {
      return {
        success: false,
        command,
        output: '',
        error: 'No MCP tool execution function available',
        timestamp: new Date(),
        workspaceId: ''
      };
    }

    try {
      const result = await this.executeTool(this.mcpServerId, 'BashCommand', {
        action_json: {
          command: `cd "${workspacePath}" && ${command}`
        },
        thread_id: `git-cmd-${Date.now()}`
      });

      // Check if command was successful (basic check)
      const isError = result.toLowerCase().includes('error') || 
                     result.toLowerCase().includes('fatal') ||
                     result.toLowerCase().includes('not a git repository');

      return {
        success: !isError,
        command,
        output: result,
        error: isError ? result : undefined,
        timestamp: new Date(),
        workspaceId: ''
      };

    } catch (error) {
      return {
        success: false,
        command,
        output: '',
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
        workspaceId: ''
      };
    }
  }

  /**
   * Update workspace mapping
   */
  private async updateWorkspace(workspace: WorkspaceMapping): Promise<void> {
    this.workspaceMappings.set(workspace.conversationId, workspace);
    await updateWorkspaceMapping(workspace);
  }

  /**
   * Persist workspace data to database
   */
  private async persistWorkspaceData(): Promise<void> {
    const mappings = Array.from(this.workspaceMappings.values());
    await saveWorkspaceMappings(mappings);
  }

  /**
   * Persist conversation settings to database
   */
  private async persistConversationSettings(): Promise<void> {
    const settings: Record<string, ConversationWorkspaceSettings> = {};
    this.conversationSettings.forEach((setting, conversationId) => {
      settings[conversationId] = setting;
    });
    await saveConversationSettings(settings);
  }
}

// 🌟 PHASE 2.1: Global workspace manager instance
let globalWorkspaceManager: ConversationWorkspaceManager | null = null;

/**
 * Get global workspace manager instance
 */
export const getConversationWorkspaceManager = (
  executeTool?: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>,
  mcpServerId?: string
): ConversationWorkspaceManager => {
  if (!globalWorkspaceManager) {
    globalWorkspaceManager = new ConversationWorkspaceManager(executeTool, mcpServerId);
  }
  return globalWorkspaceManager;
};

/**
 * Initialize global workspace manager
 */
export const initializeWorkspaceManager = async (
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>,
  mcpServerId?: string
): Promise<ConversationWorkspaceManager> => {
  const manager = getConversationWorkspaceManager(executeTool, mcpServerId);
  await manager.initialize();
  return manager;
};

/**
 * Quick access functions for common operations
 */
export const workspaceOperations = {
  /**
   * Create workspace for conversation
   */
  createWorkspace: async (
    conversationId: string,
    projectId: string,
    conversationName: string,
    config?: WorkspaceCreationConfig
  ): Promise<WorkspaceOperationResult> => {
    const manager = getConversationWorkspaceManager();
    return await manager.createWorkspace(conversationId, projectId, conversationName, config);
  },

  /**
   * Get workspace path for conversation
   */
  getWorkspacePath: async (conversationId: string): Promise<string | null> => {
    const manager = getConversationWorkspaceManager();
    const workspace = await manager.getWorkspace(conversationId);
    return workspace?.workspacePath || null;
  },

  /**
   * Create branch for conversation
   */
  createBranch: async (conversationId: string, branchName: string): Promise<GitOperationResult> => {
    const manager = getConversationWorkspaceManager();
    return await manager.createBranch(conversationId, branchName);
  },

  /**
   * Commit changes for conversation
   */
  commitChanges: async (conversationId: string, message: string): Promise<GitOperationResult> => {
    const manager = getConversationWorkspaceManager();
    return await manager.commitChanges(conversationId, message);
  }
}; 