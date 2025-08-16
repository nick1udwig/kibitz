/**
 * 🎯 Auto-Branch Manager - Main Integration Module
 * 
 * Central orchestrator for the auto-branch feature that brings together
 * all components and provides a simple API for the application.
 */

import { MCPTestBuildHooks, createDefaultConfig, loadConfigFromStorage, saveConfigToStorage } from './mcpTestBuildHooks';
import { PreRunConfig } from './preRunBranchManager';
import { RollbackSystem, RevertResult } from './rollbackSystem';
import { RollbackOption } from './branchMetadata';

export interface AutoBranchState {
  initialized: boolean;
  enabled: boolean;
  config: PreRunConfig;
  rollbackOptions: RollbackOption[];
  stats: {
    totalBranches: number;
    autoCreated: number;
    lastWeek: number;
  };
}

export interface AutoBranchManagerOptions {
  projectPath: string;
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>;
  serverId: string;
  onStateChange?: (state: AutoBranchState) => void;
}

export class AutoBranchManager {
  private hooks: MCPTestBuildHooks;
  private rollbackSystem: RollbackSystem | null = null;
  private state: AutoBranchState;
  private initialized = false;

  constructor(private options: AutoBranchManagerOptions) {
    this.hooks = new MCPTestBuildHooks(options.executeTool, options.serverId);
    
    // Initialize state
    this.state = {
      initialized: false,
      enabled: false,
      config: createDefaultConfig(),
      rollbackOptions: [],
      stats: {
        totalBranches: 0,
        autoCreated: 0,
        lastWeek: 0
      }
    };
  }

  /**
   * Initialize the auto-branch system
   */
  async initialize(): Promise<void> {
    try {
      console.log('🚀 Initializing Auto-Branch Manager...');

      // Load configuration from storage
      const config = loadConfigFromStorage();
      
      // Initialize hooks
      await this.hooks.initialize(this.options.projectPath, config);
      
      // Get rollback system
      this.rollbackSystem = this.hooks.getRollbackSystem();
      
      // Update state
      this.state = {
        ...this.state,
        initialized: true,
        enabled: config.enabled,
        config
      };

      // Load initial data
      await this.refreshData();
      
      this.initialized = true;
      this.notifyStateChange();
      
      console.log('✅ Auto-Branch Manager initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Auto-Branch Manager:', error);
      throw error;
    }
  }

  /**
   * Update configuration
   */
  async updateConfig(updates: Partial<PreRunConfig>): Promise<void> {
    const newConfig = { ...this.state.config, ...updates };
    
    // Update hooks configuration
    this.hooks.updateConfig(newConfig);
    
    // Save to storage
    saveConfigToStorage(newConfig);
    
    // Update state
    this.state = {
      ...this.state,
      config: newConfig,
      enabled: newConfig.enabled
    };
    
    this.notifyStateChange();
    console.log('⚙️ Configuration updated');
  }

  /**
   * Reset configuration to defaults
   */
  async resetConfig(): Promise<void> {
    const defaultConfig = createDefaultConfig();
    await this.updateConfig(defaultConfig);
  }

  /**
   * Get current state
   */
  getState(): AutoBranchState {
    return { ...this.state };
  }

  /**
   * Get rollback options
   */
  async getRollbackOptions(): Promise<RollbackOption[]> {
    if (!this.rollbackSystem) return [];
    
    try {
      const options = await this.rollbackSystem.getAvailableRollbacks();
      this.state.rollbackOptions = options;
      return options;
    } catch (error) {
      console.error('Failed to get rollback options:', error);
      return [];
    }
  }

  /**
   * Revert to a specific branch
   */
  async revertToBranch(branchName: string): Promise<RevertResult> {
    if (!this.rollbackSystem) {
      return {
        success: false,
        error: 'Rollback system not initialized'
      };
    }

    try {
      const result = await this.rollbackSystem.revertToBranch(branchName);
      
      if (result.success) {
        // Refresh data after successful revert
        await this.refreshData();
      }
      
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Quick revert to last auto-branch
   */
  async revertToLast(): Promise<RevertResult> {
    if (!this.rollbackSystem) {
      return {
        success: false,
        error: 'Rollback system not initialized'
      };
    }

    return await this.rollbackSystem.revertToLastAutoBranch();
  }

  /**
   * Revert by time
   */
  async revertByTime(minutesAgo: number): Promise<RevertResult> {
    if (!this.rollbackSystem) {
      return {
        success: false,
        error: 'Rollback system not initialized'
      };
    }

    return await this.rollbackSystem.revertByTime(minutesAgo);
  }

  /**
   * Wrap MCP command with auto-branching
   */
  async wrapCommand(command: string): Promise<{
    success: boolean;
    output: string;
    error?: string;
    branchInfo?: {
      branchCreated: boolean;
      branchName?: string;
    };
  }> {
    if (!this.initialized) {
      return {
        success: false,
        output: '',
        error: 'Auto-branch manager not initialized'
      };
    }

    try {
      const result = await this.hooks.wrapMCPCommand(command, this.options.projectPath);
      
      // Refresh data if a branch was created
      if (result.branchInfo?.branchCreated) {
        setTimeout(() => this.refreshData(), 1000); // Slight delay to ensure git operations complete
      }
      
      return result;
    } catch (error) {
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Refresh all data (rollback options, stats, etc.)
   */
  async refreshData(): Promise<void> {
    try {
      // Get rollback options
      const rollbackOptions = await this.getRollbackOptions();
      
      // Get branch statistics
      const stats = await this.getBranchStats();
      
      // Update state
      this.state = {
        ...this.state,
        rollbackOptions,
        stats
      };
      
      this.notifyStateChange();
    } catch (error) {
      console.error('Failed to refresh auto-branch data:', error);
    }
  }

  /**
   * Get branch statistics
   */
  private async getBranchStats(): Promise<AutoBranchState['stats']> {
    if (!this.rollbackSystem) {
      return { totalBranches: 0, autoCreated: 0, lastWeek: 0 };
    }

    try {
      const branchManager = this.hooks.getRollbackSystem()?.['metadataManager']; // Access through rollback system
      if (!branchManager) {
        return { totalBranches: 0, autoCreated: 0, lastWeek: 0 };
      }

      // This would need to be implemented in the metadata manager
      // For now, return estimated stats based on rollback options
      const rollbackOptions = this.state.rollbackOptions;
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      
      return {
        totalBranches: rollbackOptions.length,
        autoCreated: rollbackOptions.length, // All rollback options are auto-created
        lastWeek: rollbackOptions.filter(option => 
          option.timestamp > oneWeekAgo
        ).length
      };
    } catch (error) {
      console.error('Failed to get branch stats:', error);
      return { totalBranches: 0, autoCreated: 0, lastWeek: 0 };
    }
  }

  /**
   * Check if auto-branching is enabled and working
   */
  isEnabled(): boolean {
    return this.initialized && this.state.enabled;
  }

  /**
   * Get configuration
   */
  getConfig(): PreRunConfig {
    return { ...this.state.config };
  }

  /**
   * Check if the system is ready to use
   */
  isReady(): boolean {
    return this.initialized && this.rollbackSystem !== null;
  }

  /**
   * Get rollback system for advanced use
   */
  getRollbackSystem(): RollbackSystem | null {
    return this.rollbackSystem;
  }

  // Private methods

  private notifyStateChange(): void {
    if (this.options.onStateChange) {
      this.options.onStateChange(this.getState());
    }
  }
}

// Utility functions for easy integration

/**
 * Create and initialize auto-branch manager
 */
export async function createAutoBranchManager(
  options: AutoBranchManagerOptions
): Promise<AutoBranchManager> {
  const manager = new AutoBranchManager(options);
  await manager.initialize();
  return manager;
}

/**
 * Quick setup for projects
 */
export async function setupAutoBranching(
  projectPath: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>,
  serverId: string
): Promise<AutoBranchManager> {
  return createAutoBranchManager({
    projectPath,
    executeTool,
    serverId
  });
}

// Re-export types for external use
export type { PreRunConfig } from './preRunBranchManager';
export type { RevertResult } from './rollbackSystem';
export type { RollbackOption } from './branchMetadata';

export default AutoBranchManager; 