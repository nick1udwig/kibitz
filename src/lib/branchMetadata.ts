/**
 * 🗂️ Branch Metadata Manager - Auto-Branch Feature
 * 
 * Tracks metadata for auto-created branches including timestamps,
 * contexts, commit messages, and file changes for easy rollback.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export interface BranchMetadata {
  branchName: string;
  timestamp: Date;
  parentBranch: string;
  context: 'test' | 'build' | 'experiment' | 'manual';
  commitHash: string;
  commitMessage: string;
  filesChanged: string[];
  canRevert: boolean;
  isAutoCreated: boolean;
  createdBy: 'user' | 'auto-test' | 'auto-build' | 'auto-experiment';
}

export interface BranchHistory {
  projectName: string;
  projectPath: string;
  lastUpdated: Date;
  branches: BranchMetadata[];
  settings: {
    maxBranches: number;
    autoCleanup: boolean;
    retentionDays: number;
  };
}

export interface RollbackOption {
  id: string;
  displayName: string;
  timestamp: Date;
  commitMessage: string;
  canRevert: boolean;
  filesChanged: number;
  context: string;
  branchName: string;
  commitHash: string;
}

export class BranchMetadataManager {
  private metadataFile = '.kibitz/branch-history.json';
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  /**
   * Initialize branch metadata system for a project
   */
  async initialize(): Promise<void> {
    const kibitzDir = path.join(this.projectPath, '.kibitz');
    
    try {
      await fs.mkdir(kibitzDir, { recursive: true });
      
      // Create initial history file if it doesn't exist
      const historyPath = path.join(this.projectPath, this.metadataFile);
      try {
        await fs.access(historyPath);
        console.log('📁 Branch metadata already exists');
      } catch {
        const initialHistory: BranchHistory = {
          projectName: path.basename(this.projectPath),
          projectPath: this.projectPath,
          lastUpdated: new Date(),
          branches: [],
          settings: {
            maxBranches: 50,
            autoCleanup: true,
            retentionDays: 30
          }
        };
        await this.saveHistory(initialHistory);
        console.log('📁 Initialized branch metadata system');
      }
    } catch (error) {
      console.error('Failed to initialize branch metadata:', error);
      throw new Error(`Failed to initialize branch metadata: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Log a new branch creation
   */
  async logBranchCreation(metadata: Omit<BranchMetadata, 'timestamp'>): Promise<void> {
    try {
      const history = await this.loadHistory();
      
      const fullMetadata: BranchMetadata = {
        ...metadata,
        timestamp: new Date()
      };
      
      history.branches.push(fullMetadata);
      history.lastUpdated = new Date();
      
      // Apply retention policy
      await this.applyRetentionPolicy(history);
      
      await this.saveHistory(history);
      
      console.log(`📝 Logged branch creation: ${metadata.branchName}`);
    } catch (error) {
      console.error('Failed to log branch creation:', error);
      // Don't throw - logging should not break the main flow
    }
  }

  /**
   * Get recent branches for rollback options
   */
  async getRecentBranches(limit: number = 10): Promise<BranchMetadata[]> {
    try {
      const history = await this.loadHistory();
      return history.branches
        .filter(branch => branch.canRevert)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, limit);
    } catch (error) {
      console.error('Failed to get recent branches:', error);
      return [];
    }
  }

  /**
   * Get rollback options formatted for UI
   */
  async getAvailableRollbacks(limit: number = 20): Promise<RollbackOption[]> {
    const recentBranches = await this.getRecentBranches(limit);
    
    return recentBranches.map(branch => ({
      id: branch.branchName,
      displayName: this.formatBranchDisplay(branch),
      timestamp: new Date(branch.timestamp),
      commitMessage: branch.commitMessage,
      canRevert: branch.canRevert,
      filesChanged: branch.filesChanged.length,
      context: branch.context,
      branchName: branch.branchName,
      commitHash: branch.commitHash
    }));
  }

  /**
   * Mark a branch as reverted to
   */
  async markAsReverted(branchName: string): Promise<void> {
    try {
      const history = await this.loadHistory();
      const branch = history.branches.find(b => b.branchName === branchName);
      
      if (branch) {
        // Add revert metadata
        await this.logBranchCreation({
          branchName: `revert-to-${branchName}`,
          parentBranch: branchName,
          context: 'manual',
          commitHash: branch.commitHash,
          commitMessage: `Reverted to ${branchName}: ${branch.commitMessage}`,
          filesChanged: [],
          canRevert: false,
          isAutoCreated: false,
          createdBy: 'user'
        });
      }
    } catch (error) {
      console.error('Failed to mark branch as reverted:', error);
    }
  }

  /**
   * Get branch statistics
   */
  async getBranchStats(): Promise<{
    total: number;
    autoCreated: number;
    byContext: Record<string, number>;
    lastWeek: number;
  }> {
    try {
      const history = await this.loadHistory();
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      const stats = {
        total: history.branches.length,
        autoCreated: history.branches.filter(b => b.isAutoCreated).length,
        byContext: {} as Record<string, number>,
        lastWeek: history.branches.filter(b => 
          new Date(b.timestamp) > oneWeekAgo
        ).length
      };

      // Count by context
      history.branches.forEach(branch => {
        stats.byContext[branch.context] = (stats.byContext[branch.context] || 0) + 1;
      });

      return stats;
    } catch (error) {
      console.error('Failed to get branch stats:', error);
      return { total: 0, autoCreated: 0, byContext: {}, lastWeek: 0 };
    }
  }

  // Private methods

  private async loadHistory(): Promise<BranchHistory> {
    try {
      const historyPath = path.join(this.projectPath, this.metadataFile);
      const content = await fs.readFile(historyPath, 'utf-8');
      const history = JSON.parse(content);
      
      // Convert date strings back to Date objects
      history.lastUpdated = new Date(history.lastUpdated);
      history.branches = history.branches.map((branch: any) => ({
        ...branch,
        timestamp: new Date(branch.timestamp)
      }));
      
      return history;
    } catch (error) {
      console.warn('Failed to load branch history, creating new:', error instanceof Error ? error.message : String(error));
      return {
        projectName: path.basename(this.projectPath),
        projectPath: this.projectPath,
        lastUpdated: new Date(),
        branches: [],
        settings: {
          maxBranches: 50,
          autoCleanup: true,
          retentionDays: 30
        }
      };
    }
  }

  private async saveHistory(history: BranchHistory): Promise<void> {
    try {
      const historyPath = path.join(this.projectPath, this.metadataFile);
      const content = JSON.stringify(history, null, 2);
      await fs.writeFile(historyPath, content, 'utf-8');
    } catch (error) {
      console.error('Failed to save branch history:', error);
      throw error;
    }
  }

  private async applyRetentionPolicy(history: BranchHistory): Promise<void> {
    // Keep only the most recent branches within the limit
    if (history.branches.length > history.settings.maxBranches) {
      history.branches = history.branches
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, history.settings.maxBranches);
    }

    // Remove branches older than retention period if auto-cleanup is enabled
    if (history.settings.autoCleanup) {
      const retentionDate = new Date();
      retentionDate.setDate(retentionDate.getDate() - history.settings.retentionDays);
      
      history.branches = history.branches.filter(branch => 
        new Date(branch.timestamp) > retentionDate || !branch.isAutoCreated
      );
    }
  }

  private formatBranchDisplay(branch: BranchMetadata): string {
    const timeAgo = this.getTimeAgo(new Date(branch.timestamp));
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

export default BranchMetadataManager; 