/**
 * 🔗 MCP Test/Build Integration Hooks - Auto-Branch Feature
 * 
 * Integrates auto-branch creation with MCP bash commands for seamless
 * test and build workflow automation.
 */

import { PreRunBranchManager, PreRunConfig, BranchCreationResult } from './preRunBranchManager';
import { RollbackSystem } from './rollbackSystem';

export interface MCPCommandContext {
  command: string;
  args: string[];
  workingDirectory: string;
  isTestCommand: boolean;
  isBuildCommand: boolean;
  isExperimentCommand: boolean;
}

export interface HookResult {
  success: boolean;
  branchCreated?: boolean;
  branchName?: string;
  message?: string;
  error?: string;
  shouldProceed: boolean;
}

export class MCPTestBuildHooks {
  private branchManager: PreRunBranchManager | null = null;
  private rollbackSystem: RollbackSystem | null = null;
  private isInitialized = false;

  constructor(
    private executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>,
    private serverId: string
  ) {}

  /**
   * Initialize hooks for a project
   */
  async initialize(
    projectPath: string, 
    config: PreRunConfig
  ): Promise<void> {
    try {
      this.branchManager = new PreRunBranchManager(
        projectPath,
        this.executeTool,
        this.serverId,
        config
      );

      await this.branchManager.initialize();

      this.rollbackSystem = new RollbackSystem(
        projectPath,
        this.executeTool,
        this.serverId,
        this.branchManager.getMetadataManager()
      );

      this.isInitialized = true;
      console.log('🔗 MCP test/build hooks initialized');
    } catch (error) {
      console.error('Failed to initialize MCP hooks:', error);
      throw error;
    }
  }

  /**
   * Pre-command hook - runs before MCP bash commands
   */
  async preCommandHook(context: MCPCommandContext): Promise<HookResult> {
    if (!this.isInitialized || !this.branchManager) {
      return { success: true, shouldProceed: true };
    }

    try {
      console.log(`🔍 Pre-command hook: ${context.command}`);

      // Determine if we should create a branch for this command
      const shouldCreateBranch = this.shouldCreateBranchForCommand(context);
      
      if (!shouldCreateBranch) {
        return { 
          success: true, 
          shouldProceed: true, 
          message: 'No branch creation needed for this command' 
        };
      }

      // Create branch based on command type
      let result: BranchCreationResult;
      
      if (context.isTestCommand) {
        result = await this.branchManager.beforeTestRun();
      } else if (context.isBuildCommand) {
        result = await this.branchManager.beforeBuildRun();
      } else if (context.isExperimentCommand) {
        result = await this.branchManager.beforeExperiment();
      } else {
        return { success: true, shouldProceed: true };
      }

      if (result.success) {
        const message = result.skipped 
          ? 'Auto-branching skipped (disabled or not git repo)'
          : `Auto-branch created: ${result.branchName}`;

        return {
          success: true,
          shouldProceed: true,
          branchCreated: !result.skipped,
          branchName: result.branchName,
          message
        };
      } else {
        console.warn(`⚠️ Branch creation failed: ${result.error}`);
        // Don't block the command if branch creation fails
        return {
          success: false,
          shouldProceed: true,
          error: result.error,
          message: 'Branch creation failed, proceeding with command'
        };
      }

    } catch (error) {
      console.error('Pre-command hook failed:', error);
      // Don't block the original command
      return {
        success: false,
        shouldProceed: true,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Post-command hook - runs after MCP bash commands
   */
  async postCommandHook(
    context: MCPCommandContext, 
    commandResult: { success: boolean; output: string; error?: string }
  ): Promise<HookResult> {
    if (!this.isInitialized) {
      return { success: true, shouldProceed: true };
    }

    try {
      console.log(`✅ Post-command hook: ${context.command} (${commandResult.success ? 'success' : 'failed'})`);

      // Log command result for future analysis
      // You could extend this to update branch metadata with results
      
      return {
        success: true,
        shouldProceed: true,
        message: 'Post-command hook completed'
      };

    } catch (error) {
      console.error('Post-command hook failed:', error);
      return {
        success: false,
        shouldProceed: true,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Wrap MCP bash command with auto-branching
   */
  async wrapMCPCommand(
    originalCommand: string,
    workingDirectory: string
  ): Promise<{
    success: boolean;
    output: string;
    error?: string;
    branchInfo?: {
      branchCreated: boolean;
      branchName?: string;
    };
  }> {
    try {
      // Parse command context
      const context = this.parseCommandContext(originalCommand, workingDirectory);
      
      // Run pre-command hook
      const preResult = await this.preCommandHook(context);
      
      if (!preResult.shouldProceed) {
        return {
          success: false,
          output: '',
          error: preResult.error || 'Command blocked by pre-hook'
        };
      }

      // Execute original command
      const commandResult = await this.executeTool(this.serverId, 'BashCommand', {
        action_json: {
          command: `cd "${workingDirectory}" && ${originalCommand}`
        }
      });

      // Run post-command hook
      await this.postCommandHook(context, { 
        success: true, 
        output: commandResult 
      });

      return {
        success: true,
        output: commandResult,
        branchInfo: {
          branchCreated: preResult.branchCreated || false,
          branchName: preResult.branchName
        }
      };

    } catch (error) {
      console.error('MCP command wrapper failed:', error);
      
      // Still run post-hook even on failure
      const context = this.parseCommandContext(originalCommand, workingDirectory);
      await this.postCommandHook(context, { 
        success: false, 
        output: '', 
        error: error instanceof Error ? error.message : String(error) 
      });

      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Get rollback system for UI access
   */
  getRollbackSystem(): RollbackSystem | null {
    return this.rollbackSystem;
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<PreRunConfig>): void {
    if (this.branchManager) {
      this.branchManager.updateConfig(updates);
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): PreRunConfig | null {
    return this.branchManager?.getConfig() || null;
  }

  // Private helper methods

  private parseCommandContext(command: string, workingDirectory: string): MCPCommandContext {
    const args = command.split(' ');
    const baseCommand = args[0]?.toLowerCase() || '';
    
    return {
      command: baseCommand,
      args: args.slice(1),
      workingDirectory,
      isTestCommand: this.isTestCommand(command),
      isBuildCommand: this.isBuildCommand(command),
      isExperimentCommand: this.isExperimentCommand(command)
    };
  }

  private shouldCreateBranchForCommand(context: MCPCommandContext): boolean {
    // Create branches for test, build, and experiment commands
    return context.isTestCommand || context.isBuildCommand || context.isExperimentCommand;
  }

  private isTestCommand(command: string): boolean {
    const testIndicators = [
      'npm test', 'yarn test', 'npm run test', 'yarn run test',
      'jest', 'mocha', 'cypress run', 'playwright test',
      'vitest', 'pytest', 'go test', 'cargo test',
      'dotnet test', 'mvn test', 'gradle test',
      'npm run e2e', 'yarn e2e'
    ];

    const lowerCommand = command.toLowerCase();
    return testIndicators.some(indicator => lowerCommand.includes(indicator));
  }

  private isBuildCommand(command: string): boolean {
    const buildIndicators = [
      'npm run build', 'yarn build', 'npm build', 'yarn run build',
      'webpack', 'rollup', 'vite build', 'next build',
      'gatsby build', 'nuxt build', 'ng build',
      'go build', 'cargo build', 'dotnet build',
      'mvn compile', 'gradle build', 'make', 'cmake',
      'npm run production', 'yarn production'
    ];

    const lowerCommand = command.toLowerCase();
    return buildIndicators.some(indicator => lowerCommand.includes(indicator));
  }

  private isExperimentCommand(command: string): boolean {
    const experimentIndicators = [
      'experiment', 'prototype', 'poc', 'demo',
      'npm run dev', 'yarn dev', 'npm start', 'yarn start',
      'npm run serve', 'yarn serve'
    ];

    const lowerCommand = command.toLowerCase();
    return experimentIndicators.some(indicator => lowerCommand.includes(indicator));
  }
}

// Utility functions for external integration

/**
 * Create default configuration for auto-branching
 */
export function createDefaultConfig(): PreRunConfig {
  return {
    enabled: true,
    branchPrefix: 'auto',
    autoCommit: true,
    generateCommitMessage: true,
    createBackup: true,
    stashChanges: true
  };
}

/**
 * Load configuration from local storage or environment
 */
export function loadConfigFromStorage(): PreRunConfig {
  try {
    const stored = localStorage.getItem('kibitz-auto-branch-config');
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...createDefaultConfig(), ...parsed };
    }
  } catch (error) {
    console.warn('Failed to load auto-branch config from storage:', error);
  }
  
  return createDefaultConfig();
}

/**
 * Save configuration to local storage
 */
export function saveConfigToStorage(config: PreRunConfig): void {
  try {
    localStorage.setItem('kibitz-auto-branch-config', JSON.stringify(config));
  } catch (error) {
    console.warn('Failed to save auto-branch config to storage:', error);
  }
}

export default MCPTestBuildHooks; 