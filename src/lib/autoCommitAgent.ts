/**
 * Auto-Commit Agent
 * 
 * Runs on a 3-minute timer to automatically create branches when changes are detected.
 * Integrates with the GitService for local Git operations and database layer for persistence.
 */

import { AutoCommitAgentStatus, AutoCommitConfig, Project } from '../components/LlmChat/context/types';
import { GitService, createGitService } from './gitIntegrationService';
import { getAutoCommitAgentStatus, updateAutoCommitAgentStatus } from './db';

export interface AutoCommitAgentOptions {
  intervalMinutes?: number;
  enabled?: boolean;
  maxBranchesPerHour?: number;
  debugMode?: boolean;
}

export interface AutoCommitContext {
  projectId: string;
  projectName: string;
  activeConversationId: string | null;
  mcpServerId: string;
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>;
}

export class AutoCommitAgent {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private options: Required<AutoCommitAgentOptions>;
  private context: AutoCommitContext | null = null;
  private lastRunTime: Date | null = null;
  private recentBranches: Date[] = [];

  constructor(options: AutoCommitAgentOptions = {}) {
    this.options = {
      intervalMinutes: options.intervalMinutes || 3,
      enabled: options.enabled !== false,
      maxBranchesPerHour: options.maxBranchesPerHour || 20,
      debugMode: options.debugMode || false
    };

    this.log('AutoCommitAgent initialized with options:', this.options);
  }

  /**
   * Start the auto-commit agent
   */
  async start(context: AutoCommitContext): Promise<void> {
    if (this.isRunning) {
      this.log('AutoCommitAgent is already running');
      return;
    }

    this.context = context;
    this.isRunning = true;
    this.lastRunTime = new Date();

    // Update agent status in database
    await this.updateAgentStatus({
      isRunning: true,
      lastRunAt: this.lastRunTime,
      currentInterval: this.options.intervalMinutes
    });

    // Start the interval timer
    const intervalMs = this.options.intervalMinutes * 60 * 1000;
    this.intervalId = setInterval(() => {
      this.executeAutoCommitCycle().catch(error => {
        this.log('Error in auto-commit cycle:', error);
      });
    }, intervalMs);

    this.log(`AutoCommitAgent started with ${this.options.intervalMinutes}-minute interval`);
    
    // Run first cycle immediately if enabled
    if (this.options.enabled) {
      setTimeout(() => {
        this.executeAutoCommitCycle().catch(error => {
          this.log('Error in initial auto-commit cycle:', error);
        });
      }, 5000); // Wait 5 seconds before first run
    }
  }

  /**
   * Stop the auto-commit agent
   */
  stop(): void {
    // Clear the timer if it exists
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    this.isRunning = false;
    this.log('🛑 Auto-commit agent stopped');
    
    // Update status in database
    this.updateAgentStatus({
      isRunning: false,
      lastRunAt: this.lastRunTime || undefined
    }).catch((error: any) => {
      console.error('Failed to update agent status on stop:', error);
    });
  }

  /**
   * Check if the agent is currently running
   */
  isAgentRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get current agent status
   */
  async getStatus(): Promise<AutoCommitAgentStatus> {
    return await getAutoCommitAgentStatus();
  }

  /**
   * Update agent configuration
   */
  async updateConfiguration(options: Partial<AutoCommitAgentOptions>): Promise<void> {
    const oldInterval = this.options.intervalMinutes;
    
    this.options = {
      ...this.options,
      ...options
    };

    // Restart with new interval if it changed
    if (this.isRunning && options.intervalMinutes && options.intervalMinutes !== oldInterval) {
      this.log(`Restarting agent with new interval: ${options.intervalMinutes} minutes`);
      await this.stop();
      if (this.context) {
        await this.start(this.context);
      }
    }

    // Update database
    await this.updateAgentStatus({
      currentInterval: this.options.intervalMinutes
    });

    this.log('AutoCommitAgent configuration updated:', this.options);
  }

  /**
   * Execute a single auto-commit cycle
   */
  private async executeAutoCommitCycle(): Promise<void> {
    const timestamp = new Date().toISOString();
    console.log(`🔧 [${timestamp}] AutoCommitAgent: === STARTING AUTO-COMMIT CYCLE ===`);
    
    if (!this.context) {
      console.log(`❌ [${timestamp}] AutoCommitAgent: No context available`);
      this.log('AutoCommitAgent cycle skipped - no context');
      return;
    }
    
    if (!this.options.enabled) {
      console.log(`❌ [${timestamp}] AutoCommitAgent: Agent disabled in options`);
      this.log('AutoCommitAgent cycle skipped - not enabled');
      return;
    }

    console.log(`🔧 [${timestamp}] AutoCommitAgent: Context:`, {
      projectId: this.context.projectId,
      projectName: this.context.projectName,
      mcpServerId: this.context.mcpServerId,
      activeConversationId: this.context.activeConversationId,
      hasExecuteTool: typeof this.context.executeTool === 'function'
    });

    const startTime = Date.now();
    this.log('Starting auto-commit cycle...');

    try {
      // Check rate limiting
      console.log(`🔧 [${timestamp}] AutoCommitAgent: Checking rate limit...`);
      if (!this.checkRateLimit()) {
        console.log(`⚠️ [${timestamp}] AutoCommitAgent: Rate limit exceeded, skipping cycle`);
        this.log('Rate limit exceeded, skipping cycle');
        return;
      }
      console.log(`✅ [${timestamp}] AutoCommitAgent: Rate limit check passed`);

      // Create GitService instance
      console.log(`🔧 [${timestamp}] AutoCommitAgent: Creating GitService...`);
      const gitService = createGitService(
        this.context.projectId,
        this.context.projectName,
        this.context.mcpServerId,
        this.context.executeTool
      );
      console.log(`✅ [${timestamp}] AutoCommitAgent: GitService created successfully`);

      // Use active conversation or default
      const conversationId = this.context.activeConversationId || 'default';
      console.log(`🔧 [${timestamp}] AutoCommitAgent: Using conversation ID: ${conversationId}`);

      // Attempt to create auto-commit branch
      console.log(`🔧 [${timestamp}] AutoCommitAgent: Calling gitService.createAutoCommitBranch...`);
      const result = await gitService.createAutoCommitBranch(conversationId);
      console.log(`🔧 [${timestamp}] AutoCommitAgent: Git service result:`, {
        success: result.success,
        branchName: result.branchName,
        error: result.error,
        filesChanged: result.filesChanged?.length || 0
      });
      
      if (result.success) {
        console.log(`✅ [${timestamp}] AutoCommitAgent: Branch created successfully: ${result.branchName}`);
        this.log(`✅ Auto-commit branch created successfully: ${result.branchName}`);
        
        // Track this branch creation for rate limiting
        this.recentBranches.push(new Date());
        
        // Update agent status
        await this.updateAgentStatus({
          totalBranchesCreated: (await this.getStatus()).totalBranchesCreated + 1,
          totalCommits: (await this.getStatus()).totalCommits + 1
        });
      } else {
        console.log(`⚠️ [${timestamp}] AutoCommitAgent: Auto-commit skipped: ${result.error}`);
        this.log(`⚠️ Auto-commit skipped: ${result.error}`);
      }

      this.lastRunTime = new Date();
      
      // Update agent status
      await this.updateAgentStatus({
        lastRunAt: this.lastRunTime || undefined
      });

      console.log(`🔧 [${timestamp}] AutoCommitAgent: === AUTO-COMMIT CYCLE COMPLETED ===`);

    } catch (error) {
      console.log(`❌ [${timestamp}] AutoCommitAgent: ERROR in auto-commit cycle:`, error);
      this.log('❌ Error in auto-commit cycle:', error);
      
      // Update agent status with error
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.updateAgentStatus({
        lastRunAt: new Date(),
        errors: [...(await this.getStatus()).errors, `${new Date().toISOString()}: ${errorMessage}`]
      });
    }
  }

  /**
   * Check if rate limiting allows another branch creation
   */
  private checkRateLimit(): boolean {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    // Clean up old entries
    this.recentBranches = this.recentBranches.filter(date => date > oneHourAgo);
    
    // Check if we're under the limit
    return this.recentBranches.length < this.options.maxBranchesPerHour;
  }

  /**
   * Update agent status in database
   */
  private async updateAgentStatus(updates: Partial<AutoCommitAgentStatus>): Promise<void> {
    try {
      const currentStatus = await getAutoCommitAgentStatus();
      const updatedStatus: AutoCommitAgentStatus = {
        ...currentStatus,
        ...updates
      };
      
      await updateAutoCommitAgentStatus(updatedStatus);
    } catch (error) {
      this.log('Error updating agent status:', error);
    }
  }

  /**
   * Log message with timestamp
   */
  private log(message: string, ...args: any[]): void {
    const timestamp = new Date().toISOString();
    if (this.options.debugMode) {
      console.log(`[${timestamp}] AutoCommitAgent: ${message}`, ...args);
    }
  }

  /**
   * Create a manual branch (useful for testing)
   */
  async createManualBranch(conversationId: string): Promise<void> {
    if (!this.context) {
      throw new Error('AutoCommitAgent not initialized with context');
    }

    const gitService = createGitService(
      this.context.projectId,
      this.context.projectName,
      this.context.mcpServerId,
      this.context.executeTool
    );

    const result = await gitService.createAutoCommitBranch(conversationId);
    
    if (result.success) {
      this.log(`✅ Manual branch created successfully: ${result.branchName}`);
      
      // Update agent status
      await this.updateAgentStatus({
        totalBranchesCreated: (await this.getStatus()).totalBranchesCreated + 1,
        totalCommits: (await this.getStatus()).totalCommits + 1
      });
    } else {
      this.log(`❌ Manual branch creation failed: ${result.error}`);
      throw new Error(`Failed to create manual branch: ${result.error}`);
    }
  }
}

/**
 * Global auto-commit agent instance
 */
let globalAutoCommitAgent: AutoCommitAgent | null = null;

/**
 * Get the global auto-commit agent instance
 */
export const getAutoCommitAgent = (): AutoCommitAgent => {
  if (!globalAutoCommitAgent) {
    globalAutoCommitAgent = new AutoCommitAgent({
      intervalMinutes: 3,
      enabled: true,
      maxBranchesPerHour: 20,
      debugMode: true
    });
  }
  return globalAutoCommitAgent;
};

/**
 * Initialize the auto-commit agent for a project
 */
export const initializeAutoCommitAgent = async (context: AutoCommitContext): Promise<void> => {
  const agent = getAutoCommitAgent();
  await agent.start(context);
};

/**
 * Stop the auto-commit agent
 */
export const stopAutoCommitAgent = async (): Promise<void> => {
  if (globalAutoCommitAgent) {
    await globalAutoCommitAgent.stop();
  }
}; 