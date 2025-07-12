/**
 * 🔄 Rollback System - Easy Revert to Previous States
 * 
 * Provides safe and easy rollback functionality to previous auto-created
 * branches with backup creation and conflict resolution.
 */

import { BranchMetadataManager, BranchMetadata, RollbackOption } from './branchMetadata';

export interface RevertResult {
  success: boolean;
  branchName?: string;
  previousBranch?: string;
  backupBranch?: string;
  message?: string;
  error?: string;
  conflictsDetected?: boolean;
  stashCreated?: boolean;
}

export interface RollbackPreview {
  targetBranch: string;
  targetCommit: string;
  currentBranch: string;
  currentCommit: string;
  hasUncommittedChanges: boolean;
  potentialConflicts: string[];
  recommendedAction: 'safe' | 'backup_recommended' | 'conflicts_detected';
}

export class RollbackSystem {
  constructor(
    private projectPath: string,
    private executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>,
    private serverId: string,
    private metadataManager: BranchMetadataManager
  ) {}

  /**
   * Get available rollback options
   */
  async getAvailableRollbacks(): Promise<RollbackOption[]> {
    try {
      return await this.metadataManager.getAvailableRollbacks(20);
    } catch (error) {
      console.error('Failed to get rollback options:', error);
      return [];
    }
  }

  /**
   * Preview rollback operation before executing
   */
  async previewRollback(targetBranchName: string): Promise<RollbackPreview> {
    try {
      const currentBranch = await this.getCurrentBranch();
      const currentCommit = await this.getCurrentCommit();
      const hasUncommittedChanges = await this.hasUncommittedChanges();
      
      // Get target branch info
      const targetCommit = await this.getBranchCommit(targetBranchName);
      
      // Check for potential conflicts
      const potentialConflicts = await this.checkPotentialConflicts(targetBranchName);
      
      // Determine recommended action
      let recommendedAction: 'safe' | 'backup_recommended' | 'conflicts_detected' = 'safe';
      
      if (potentialConflicts.length > 0) {
        recommendedAction = 'conflicts_detected';
      } else if (hasUncommittedChanges) {
        recommendedAction = 'backup_recommended';
      }

      return {
        targetBranch: targetBranchName,
        targetCommit,
        currentBranch,
        currentCommit,
        hasUncommittedChanges,
        potentialConflicts,
        recommendedAction
      };
    } catch (error) {
      console.error('Failed to preview rollback:', error);
      throw new Error(`Rollback preview failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Perform rollback to specified branch
   */
  async revertToBranch(
    branchName: string, 
    options: {
      createBackup?: boolean;
      stashChanges?: boolean;
      force?: boolean;
    } = {}
  ): Promise<RevertResult> {
    const { createBackup = true, stashChanges = true, force = false } = options;

    try {
      console.log(`🔄 Starting rollback to branch: ${branchName}`);

      // 1. Validate target branch exists
      const branchExists = await this.checkBranchExists(branchName);
      if (!branchExists) {
        throw new Error(`Branch ${branchName} does not exist`);
      }

      // 2. Get current state
      const currentBranch = await this.getCurrentBranch();
      const hasUncommittedChanges = await this.hasUncommittedChanges();

      // 3. Preview potential issues
      if (!force) {
        const preview = await this.previewRollback(branchName);
        if (preview.recommendedAction === 'conflicts_detected') {
          return {
            success: false,
            error: `Potential conflicts detected. Use force=true to override or resolve conflicts manually.`,
            conflictsDetected: true
          };
        }
      }

      // 4. Create backup if requested
      let backupBranch: string | undefined;
      if (createBackup && currentBranch !== branchName) {
        backupBranch = await this.createBackupBranch(currentBranch);
      }

      // 5. Stash uncommitted changes if requested
      let stashCreated = false;
      if (stashChanges && hasUncommittedChanges) {
        await this.stashCurrentWork();
        stashCreated = true;
      }

      // 6. Switch to target branch
      await this.switchToBranch(branchName);

      // 7. Update metadata
      await this.metadataManager.markAsReverted(branchName);

      console.log(`✅ Successfully reverted to ${branchName}`);

      return {
        success: true,
        branchName,
        previousBranch: currentBranch,
        backupBranch,
        message: `Successfully reverted to ${branchName}`,
        stashCreated
      };

    } catch (error) {
      console.error(`❌ Rollback failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Quick revert to last auto-created branch
   */
  async revertToLastAutoBranch(): Promise<RevertResult> {
    try {
      const recentBranches = await this.metadataManager.getRecentBranches(1);
      
      if (recentBranches.length === 0) {
        return {
          success: false,
          error: 'No auto-created branches found to revert to'
        };
      }

      const lastBranch = recentBranches[0];
      return await this.revertToBranch(lastBranch.branchName);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Revert by time (e.g., "5 minutes ago")
   */
  async revertByTime(minutesAgo: number): Promise<RevertResult> {
    try {
      const cutoffTime = new Date();
      cutoffTime.setMinutes(cutoffTime.getMinutes() - minutesAgo);

      const recentBranches = await this.metadataManager.getRecentBranches(50);
      const targetBranch = recentBranches.find(branch => 
        branch.timestamp >= cutoffTime
      );

      if (!targetBranch) {
        return {
          success: false,
          error: `No auto-created branches found from ${minutesAgo} minutes ago`
        };
      }

      return await this.revertToBranch(targetBranch.branchName);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Get rollback history
   */
  async getRollbackHistory(): Promise<BranchMetadata[]> {
    return await this.metadataManager.getRecentBranches(30);
  }

  // Private helper methods

  private async getCurrentBranch(): Promise<string> {
    try {
      const result = await this.executeTool(this.serverId, 'BashCommand', {
        action_json: { 
          command: `cd "${this.projectPath}" && git branch --show-current` 
        }
      });
      return result.trim();
    } catch (error) {
      console.warn('Failed to get current branch:', error);
      return 'main';
    }
  }

  private async getCurrentCommit(): Promise<string> {
    try {
      const result = await this.executeTool(this.serverId, 'BashCommand', {
        action_json: { 
          command: `cd "${this.projectPath}" && git rev-parse HEAD` 
        }
      });
      return result.trim();
    } catch (error) {
      console.warn('Failed to get current commit:', error);
      return '';
    }
  }

  private async getBranchCommit(branchName: string): Promise<string> {
    try {
      const result = await this.executeTool(this.serverId, 'BashCommand', {
        action_json: { 
          command: `cd "${this.projectPath}" && git rev-parse ${branchName}` 
        }
      });
      return result.trim();
    } catch (error) {
      console.warn(`Failed to get commit for branch ${branchName}:`, error);
      return '';
    }
  }

  private async hasUncommittedChanges(): Promise<boolean> {
    try {
      const result = await this.executeTool(this.serverId, 'BashCommand', {
        action_json: { 
          command: `cd "${this.projectPath}" && git status --porcelain` 
        }
      });
      return result.trim().length > 0;
    } catch (error) {
      console.warn('Failed to check uncommitted changes:', error);
      return false;
    }
  }

  private async checkBranchExists(branchName: string): Promise<boolean> {
    try {
      const result = await this.executeTool(this.serverId, 'BashCommand', {
        action_json: { 
          command: `cd "${this.projectPath}" && git show-ref --verify --quiet refs/heads/${branchName}` 
        }
      });
      return true; // Command succeeds if branch exists
    } catch (error) {
      return false; // Command fails if branch doesn't exist
    }
  }

  private async checkPotentialConflicts(targetBranch: string): Promise<string[]> {
    try {
      // Check for files that differ between current branch and target
      const result = await this.executeTool(this.serverId, 'BashCommand', {
        action_json: { 
          command: `cd "${this.projectPath}" && git diff --name-only HEAD ${targetBranch}` 
        }
      });
      
      return result.trim() ? result.trim().split('\n') : [];
    } catch (error) {
      console.warn('Failed to check potential conflicts:', error);
      return [];
    }
  }

  private async createBackupBranch(currentBranch: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const backupBranch = `backup-before-revert-${timestamp}`;
    
    try {
      await this.executeTool(this.serverId, 'BashCommand', {
        action_json: { 
          command: `cd "${this.projectPath}" && git checkout -b ${backupBranch}` 
        }
      });

      // Return to original branch
      await this.executeTool(this.serverId, 'BashCommand', {
        action_json: { 
          command: `cd "${this.projectPath}" && git checkout ${currentBranch}` 
        }
      });

      console.log(`📦 Created backup branch: ${backupBranch}`);
      return backupBranch;
    } catch (error) {
      console.warn('Failed to create backup branch:', error);
      throw new Error(`Backup creation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async stashCurrentWork(): Promise<void> {
    try {
      const stashMessage = `auto-stash-before-revert-${Date.now()}`;
      
      await this.executeTool(this.serverId, 'BashCommand', {
        action_json: { 
          command: `cd "${this.projectPath}" && git stash push -m "${stashMessage}"` 
        }
      });
      
      console.log(`📦 Stashed current work: ${stashMessage}`);
    } catch (error) {
      console.warn('Stash operation failed:', error);
      // Don't throw - this is not critical for rollback
    }
  }

  private async switchToBranch(branchName: string): Promise<void> {
    try {
      await this.executeTool(this.serverId, 'BashCommand', {
        action_json: { 
          command: `cd "${this.projectPath}" && git checkout ${branchName}` 
        }
      });
    } catch (error) {
      throw new Error(`Failed to switch to branch ${branchName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Format branch display for UI
   */
  formatBranchDisplay(branch: BranchMetadata): string {
    const timeAgo = this.getTimeAgo(branch.timestamp);
    const context = branch.context === 'manual' ? '' : `${branch.context} `;
    return `${context}run (${timeAgo}) - ${branch.commitMessage}`;
  }

  private getTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  }
}

export default RollbackSystem; 