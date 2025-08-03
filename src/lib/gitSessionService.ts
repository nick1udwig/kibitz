/**
 * Git Session Service - Chat-based Git Rollback
 * 
 * Provides rollback functionality for chat sessions, allowing users to
 * revert the workspace to the state after a specific message was sent.
 */

import { safeRollback } from './checkpointRollbackService';

export interface SessionCommit {
  hash: string;
  message: string;
  timestamp: Date;
  messageIndex?: number;
  trigger?: string;
}

export interface SessionInfo {
  commits: SessionCommit[];
  currentCommit?: string;
  currentBranch?: string;
}

export interface RollbackResult {
  success: boolean;
  commitHash?: string;
  backupBranch?: string;
  message?: string;
  error?: string;
}

export interface RollbackOptions {
  stashChanges?: boolean;
  createBackup?: boolean;
  force?: boolean;
}

export default class GitSessionService {
  constructor(
    private projectPath: string,
    private serverId: string,
    private executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
  ) {}

  /**
   * Rollback to a specific commit hash
   */
  async rollbackToCommit(
    commitHash: string,
    options: RollbackOptions = {}
  ): Promise<RollbackResult> {
    const { stashChanges = true, createBackup = true, force = false } = options;

    try {
      console.log(`🔄 Rolling back to commit: ${commitHash.substring(0, 7)}`);

      // First, check if commit exists
      const commitExists = await this.verifyCommitExists(commitHash);
      if (!commitExists) {
        return {
          success: false,
          error: `Commit ${commitHash.substring(0, 7)} not found`
        };
      }

      // Get current commit for rollback verification
      const currentCommit = await this.getCurrentCommit();
      
      // If we're already at the target commit, no need to rollback
      if (currentCommit === commitHash) {
        return {
          success: true,
          commitHash,
          message: 'Already at target commit'
        };
      }

      // Stash changes if requested
      if (stashChanges) {
        await this.stashChanges();
      }

      // Create backup branch if requested
      let backupBranch: string | undefined;
      if (createBackup) {
        backupBranch = await this.createBackupBranch();
      }

      // Perform the rollback using git checkout
      const rollbackResult = await this.executeTool(this.serverId, 'BashCommand', {
        action_json: {
          command: `cd "${this.projectPath}" && git checkout ${commitHash}`
        },
        thread_id: `session-rollback-${Date.now()}`
      });

      if (rollbackResult.includes('Error:') || rollbackResult.includes('fatal:')) {
        return {
          success: false,
          error: `Failed to checkout commit: ${rollbackResult}`,
          backupBranch
        };
      }

      console.log(`✅ Successfully rolled back to commit: ${commitHash.substring(0, 7)}`);

      return {
        success: true,
        commitHash,
        backupBranch,
        message: `Rolled back to commit ${commitHash.substring(0, 7)}`
      };

    } catch (error) {
      console.error('Rollback failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Get commits for the current session/conversation
   */
  async getSessionCommits(limit: number = 20): Promise<SessionCommit[]> {
    try {
      const result = await this.executeTool(this.serverId, 'BashCommand', {
        action_json: {
          command: `cd "${this.projectPath}" && git log --oneline -${limit} --format="%H|%s|%ct"`
        },
        thread_id: `session-commits-${Date.now()}`
      });

      if (result.includes('Error:')) {
        return [];
      }

      return result.trim().split('\n').map(line => {
        const [hash, message, timestamp] = line.split('|');
        return {
          hash,
          message: message || 'No commit message',
          timestamp: new Date(parseInt(timestamp) * 1000)
        };
      }).filter(commit => commit.hash); // Filter out empty lines

    } catch (error) {
      console.error('Failed to get session commits:', error);
      return [];
    }
  }

  /**
   * Find commit that corresponds to a specific message timestamp
   */
  async findCommitForMessage(messageTimestamp: Date, toleranceMs: number = 60000): Promise<string | null> {
    try {
      const commits = await this.getSessionCommits(50);
      
      // Find the commit closest to the message timestamp (within tolerance)
      const targetTime = messageTimestamp.getTime();
      
      let bestMatch: SessionCommit | null = null;
      let bestTimeDiff = Infinity;
      
      for (const commit of commits) {
        const timeDiff = Math.abs(commit.timestamp.getTime() - targetTime);
        if (timeDiff <= toleranceMs && timeDiff < bestTimeDiff) {
          bestMatch = commit;
          bestTimeDiff = timeDiff;
        }
      }
      
      return bestMatch?.hash || null;
    } catch (error) {
      console.error('Failed to find commit for message:', error);
      return null;
    }
  }

  // Private helper methods

  private async verifyCommitExists(commitHash: string): Promise<boolean> {
    try {
      const result = await this.executeTool(this.serverId, 'BashCommand', {
        command: `cd "${this.projectPath}" && git cat-file -e ${commitHash}`,
        type: 'command',
        thread_id: `verify-commit-${Date.now()}`
      });
      return !result.includes('Error:');
    } catch (error) {
      return false;
    }
  }

  private async getCurrentCommit(): Promise<string> {
    try {
      const result = await this.executeTool(this.serverId, 'BashCommand', {
        action_json: {
          command: `cd "${this.projectPath}" && git rev-parse HEAD`
        },
        thread_id: `current-commit-${Date.now()}`
      });
      return result.trim();
    } catch (error) {
      return '';
    }
  }

  private async stashChanges(): Promise<void> {
    try {
      const stashMessage = `auto-stash-before-message-revert-${Date.now()}`;
      await this.executeTool(this.serverId, 'BashCommand', {
        command: `cd "${this.projectPath}" && git stash push -m "${stashMessage}"`,
        type: 'command',
        thread_id: `stash-changes-${Date.now()}`
      });
      console.log(`📦 Stashed changes: ${stashMessage}`);
    } catch (error) {
      console.warn('Failed to stash changes:', error);
      // Non-critical - continue with rollback
    }
  }

  private async createBackupBranch(): Promise<string> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
      const backupBranch = `backup-before-message-revert-${timestamp}`;
      
      await this.executeTool(this.serverId, 'BashCommand', {
        command: `cd "${this.projectPath}" && git checkout -b ${backupBranch}`,
        type: 'command',
        thread_id: `backup-branch-${Date.now()}`
      });

      // Return to original branch/commit
      const currentCommit = await this.getCurrentCommit();
      await this.executeTool(this.serverId, 'BashCommand', {
        command: `cd "${this.projectPath}" && git checkout ${currentCommit}`,
        type: 'command',
        thread_id: `return-to-commit-${Date.now()}`
      });

      console.log(`📦 Created backup branch: ${backupBranch}`);
      return backupBranch;
    } catch (error) {
      console.warn('Failed to create backup branch:', error);
      throw new Error(`Backup creation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
} 