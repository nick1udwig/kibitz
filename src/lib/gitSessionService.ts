/**
 * Git Session Service - Chat-based Git Rollback
 * 
 * Provides rollback functionality for chat sessions, allowing users to
 * revert the workspace to the state after a specific message was sent.
 */

import { VersionControlManager, RollbackOptions, RollbackResult } from './versionControl';

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
          message: 'Already at target commit'
        };
      }

      // Use unified VersionControlManager
      const vcm = new VersionControlManager(this.projectPath, this.serverId, this.executeTool);
      const res = await vcm.rollbackToCommit(commitHash, { stashChanges, createBackup, force });

      if (res.success) {
        console.log(`✅ Successfully rolled back to commit: ${commitHash.substring(0, 7)}`);
        return {
          success: true,
          backupBranch: res.backupBranch,
          message: res.message || `Rolled back to commit ${commitHash.substring(0, 7)}`
        };
      }

      return { success: false, error: res.error, backupBranch: res.backupBranch };

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
      const { executeGitCommand } = await import('./versionControl/git');
      const res = await executeGitCommand(this.serverId, `git log --oneline -${limit} --format="%H|%s|%ct"`, this.projectPath, this.executeTool);

      if (!res.success) {
        return [];
      }

      return (res.output || '').trim().split('\n').map(line => {
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
      const { executeGitCommand } = await import('./versionControl/git');
      const res = await executeGitCommand(this.serverId, `git cat-file -e ${commitHash}`, this.projectPath, this.executeTool);
      return res.success;
    } catch {
      return false;
    }
  }

  private async getCurrentCommit(): Promise<string> {
    try {
      const { executeGitCommand } = await import('./versionControl/git');
      const res = await executeGitCommand(this.serverId, 'git rev-parse HEAD', this.projectPath, this.executeTool);
      return (res.output || '').trim();
          } catch {
        return '';
      }
  }

  private async stashChanges(): Promise<void> {
    try {
      const stashMessage = `auto-stash-before-message-revert-${Date.now()}`;
      const { executeGitCommand } = await import('./versionControl/git');
      await executeGitCommand(this.serverId, `git stash push -m "${stashMessage}"`, this.projectPath, this.executeTool);
      console.log(`📦 Stashed changes: ${stashMessage}`);
    } catch (error) {
      console.warn('Failed to stash changes:', error);
      // Non-critical - continue with rollback
    }
  }

  private async createBackupBranch(): Promise<string> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
      const backupBranch = `backup/rollback/${timestamp}`;
      
      const { executeGitCommand } = await import('./versionControl/git');
      await executeGitCommand(this.serverId, `git checkout -b ${backupBranch}`, this.projectPath, this.executeTool);

      // Return to original branch/commit
      const currentCommit = await this.getCurrentCommit();
      await executeGitCommand(this.serverId, `git checkout ${currentCommit}`, this.projectPath, this.executeTool);

      console.log(`📦 Created backup branch: ${backupBranch}`);
      return backupBranch;
    } catch (error) {
      console.warn('Failed to create backup branch:', error);
      throw new Error(`Backup creation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
} 