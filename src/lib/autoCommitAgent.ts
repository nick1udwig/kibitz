/**
 * Auto-Commit Agent
 * 
 * Runs on a 3-minute timer to automatically create branches when changes are detected.
 * Integrates with the GitService for local Git operations and database layer for persistence.
 */

import { AutoCommitAgentStatus } from '../components/LlmChat/context/types';
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
    }).catch((error: unknown) => {
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

    // 🔧 NEW: Temporarily disable auto-commit to avoid conflicts with conversation git handler
    console.log(`ℹ️ [${timestamp}] AutoCommitAgent: Auto-commit temporarily disabled - using conversation git handler instead`);
    this.log('AutoCommitAgent cycle skipped - using conversation git handler');
    // TODO: Re-enable auto-commit once conversation git handler is stable
    return;
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
  private log(message: string, ...args: unknown[]): void {
    const timestamp = new Date().toISOString();
    if (this.options.debugMode) {
      console.log(`[${timestamp}] AutoCommitAgent: ${message}`, ...args);
    }
  }

  /**
   * Create a manual branch (useful for testing)
   */
  async createManualBranch(): Promise<void> {
    if (!this.context) {
      throw new Error('AutoCommitAgent not initialized with context');
    }

    this.log(`Manual branch creation skipped due to missing GitService integration.`);
  }

  /**
   * Execute basic git commit operations without optimization loops
   */
  private async executeBasicGitCommit(
    projectPath: string
  ): Promise<{
    success: boolean;
    branchName?: string;
    commitSha?: string;
    filesChanged?: string[];
    error?: string;
  }> {
    try {
      console.log(`🔧 AutoCommitAgent: Starting basic git commit for ${projectPath}`);

      // Step 1: Initialize MCP thread first
      // Use consistent thread ID that matches rootStore.ts expectations
      let threadId = "git-operations";
      
      try {
        console.log(`🔧 AutoCommitAgent: Initializing MCP thread: ${threadId}`);
        await this.context!.executeTool(this.context!.mcpServerId, 'Initialize', {
          type: "first_call",
          any_workspace_path: projectPath,
          initial_files_to_read: [],
          task_id_to_resume: "",
          mode_name: "wcgw",
          thread_id: threadId
        });
        console.log(`✅ AutoCommitAgent: MCP thread initialized: ${threadId}`);
      } catch (initError) {
        console.warn(`⚠️ AutoCommitAgent: Failed to initialize MCP thread, using default:`, initError);
        threadId = "git-operations"; // Keep same ID even on fallback
      }

      // Step 2: Initialize git repository if needed. Do not set identity here.
      const initResult = await this.context!.executeTool(this.context!.mcpServerId, 'BashCommand', {
        action_json: {
          command: `cd "${projectPath}" && git init`,
          type: 'command'
        },
        thread_id: threadId
      });

      console.log(`🔧 AutoCommitAgent: Git init result:`, initResult.includes('Initialized empty Git repository') || initResult.includes('Reinitialized existing Git repository'));

      // Step 3: Check status
      const statusResult = await this.context!.executeTool(this.context!.mcpServerId, 'BashCommand', {
        action_json: {
          command: `cd "${projectPath}" && git status --porcelain`,
          type: 'command'
        },
        thread_id: threadId
      });

      const statusOutput = this.extractCommandOutput(statusResult);
      const hasChanges = statusOutput.trim().length > 0;

      if (!hasChanges) {
        console.log(`ℹ️ AutoCommitAgent: No changes to commit`);
        return {
          success: false,
          error: 'No changes to commit'
        };
      }

      // Step 4: Add all changes
      await this.context!.executeTool(this.context!.mcpServerId, 'BashCommand', {
        action_json: {
          command: `cd "${projectPath}" && git add .`,
          type: 'command'
        },
        thread_id: threadId
      });

      console.log(`🔧 AutoCommitAgent: Git add completed`);

      // Step 5: Commit changes
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      const commitMessage = `Auto-commit: Changes detected ${timestamp}`;
      
      // Commit without forcing identity (must be provided by env or git config)
      const commitResult = await this.context!.executeTool(this.context!.mcpServerId, 'BashCommand', {
        action_json: {
          command: `cd "${projectPath}" && git commit -m "${commitMessage}"`,
          type: 'command'
        },
        thread_id: threadId
      });

      const commitOutput = this.extractCommandOutput(commitResult);
      const commitSuccess = !commitOutput.includes('Error:') && !commitOutput.includes('fatal:');

      if (commitSuccess) {
        // Get commit SHA
        const shaResult = await this.context!.executeTool(this.context!.mcpServerId, 'BashCommand', {
          action_json: {
            command: `cd "${projectPath}" && git rev-parse HEAD`,
            type: 'command'
          },
          thread_id: threadId
        });

        const commitSha = this.extractCommandOutput(shaResult).trim();

        console.log(`✅ AutoCommitAgent: Commit successful with SHA: ${commitSha}`);
        return {
          success: true,
          commitSha,
          filesChanged: statusOutput.split('\n').filter(line => line.trim()).map(line => line.slice(3))
        };
      } else {
        console.error(`❌ AutoCommitAgent: Commit failed:`, commitOutput);
        return {
          success: false,
          error: `Commit failed: ${commitOutput}`
        };
      }

    } catch (error) {
      console.error('❌ AutoCommitAgent: Basic git commit failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Extract command output from MCP result
   */
  private extractCommandOutput(result: string): string {
    try {
      // Extract output from structured result
      const lines = result.split('\n');
      const outputStart = lines.findIndex(line => line.includes('status = process exited') || line.includes('---'));
      if (outputStart > 0) {
        return lines.slice(0, outputStart).join('\n');
      }
      return result;
    } catch {
      return result;
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