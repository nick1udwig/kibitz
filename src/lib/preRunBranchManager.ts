/**
 * 🚀 Pre-Run Branch Manager - Core Auto-Branch Logic
 * 
 * Orchestrates automatic branch creation before test/build runs,
 * integrating branch naming, commit generation, and metadata tracking.
 */

import { BranchNamingStrategy } from './branchNaming';
// If this module is not present, fall back to a simple generator inline
// Lightweight fallback types/generator to avoid missing-module errors
type FileChange = { path: string; type: 'added' | 'modified' | 'deleted' };
class CommitMessageGenerator {
  constructor(
    private executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>,
    private serverId: string
  ) {}
  async generateCommitMessage(changes: FileChange[], context: string): Promise<string> {
    const added = changes.filter(c => c.type === 'added').length;
    const modified = changes.filter(c => c.type === 'modified').length;
    const deleted = changes.filter(c => c.type === 'deleted').length;
    const parts: string[] = [];
    if (added) parts.push(`add ${added}`);
    if (modified) parts.push(`modify ${modified}`);
    if (deleted) parts.push(`delete ${deleted}`);
    return parts.length ? `${context}: ${parts.join(', ')} files` : `auto: prepare for ${context} run`;
  }
}
import { BranchMetadataManager } from './branchMetadata';
import { executeGitCommand } from './versionControl/git';

export interface PreRunConfig {
  enabled: boolean;
  branchPrefix: string;
  autoCommit: boolean;
  generateCommitMessage: boolean;
  createBackup: boolean;
  stashChanges: boolean;
}

export interface BranchCreationResult {
  success: boolean;
  branchName?: string;
  commitMessage?: string;
  commitHash?: string;
  backupBranch?: string;
  error?: string;
  skipped?: boolean;
  changesDetected?: number;
}

export class PreRunBranchManager {
  private branchNaming: BranchNamingStrategy;
  private commitGenerator: CommitMessageGenerator;
  private metadataManager: BranchMetadataManager;

  constructor(
    private projectPath: string,
    private executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>,
    private serverId: string,
    private config: PreRunConfig
  ) {
    this.branchNaming = new BranchNamingStrategy();
    this.commitGenerator = new CommitMessageGenerator(executeTool, serverId);
    this.metadataManager = new BranchMetadataManager(projectPath);
  }

  /**
   * Initialize the branch manager and metadata system
   */
  async initialize(): Promise<void> {
    try {
      await this.metadataManager.initialize();
      console.log('🚀 Pre-run branch manager initialized');
    } catch (error) {
      console.error('Failed to initialize pre-run branch manager:', error);
      throw error;
    }
  }

  /**
   * Create branch before test run
   */
  async beforeTestRun(): Promise<BranchCreationResult> {
    return this.beforeRun('test');
  }

  /**
   * Create branch before build run
   */
  async beforeBuildRun(): Promise<BranchCreationResult> {
    return this.beforeRun('build');
  }

  /**
   * Create branch before experiment
   */
  async beforeExperiment(): Promise<BranchCreationResult> {
    return this.beforeRun('experiment');
  }

  /**
   * Main branch creation logic
   */
  private async beforeRun(context: 'test' | 'build' | 'experiment'): Promise<BranchCreationResult> {
    if (!this.config.enabled) {
      console.log('🔒 Auto-branching disabled');
      return { success: true, skipped: true };
    }

    try {
      console.log(`🌿 Creating auto-branch before ${context} run...`);

      // 1. Check git repository status
      const isGitRepo = await this.checkGitRepository();
      if (!isGitRepo) {
        console.warn('⚠️ Not a git repository, skipping auto-branch creation');
        return { success: true, skipped: true };
      }

      // 2. Get current branch and changes
      const currentBranch = await this.getCurrentBranch();
      const changes = await this.getCurrentChanges();
      
      console.log(`📊 Detected ${changes.length} changes in current branch: ${currentBranch}`);

      // 3. Generate branch name
      const branchName = this.branchNaming.generateBranchName({
        prefix: this.config.branchPrefix,
        context
      });

      // 4. Create backup if requested
      let backupBranch: string | undefined;
      if (this.config.createBackup) {
        backupBranch = await this.createBackupBranch();
      }

      // 5. Stash current work if needed
      if (this.config.stashChanges && changes.length > 0) {
        await this.stashCurrentWork();
      }

      // 6. Create new branch
      await this.createBranch(branchName);
      console.log(`✅ Created branch: ${branchName}`);

      // 7. Generate and apply commit
      let commitMessage = `auto: prepare for ${context} run`;
      let commitHash = '';

      if (this.config.autoCommit) {
        if (this.config.generateCommitMessage && changes.length > 0) {
          try {
            commitMessage = await this.commitGenerator.generateCommitMessage(changes, context);
          } catch (error) {
            console.warn('Failed to generate LLM commit message, using fallback:', error);
            commitMessage = this.generateFallbackMessage(changes, context);
          }
        }

        commitHash = await this.commitCurrentState(commitMessage);
        console.log(`📝 Committed with message: "${commitMessage}"`);

        // 8. Log branch creation in metadata
        await this.metadataManager.logBranchCreation({
          branchName,
          parentBranch: currentBranch,
          context,
          commitHash,
          commitMessage,
          filesChanged: changes.map(c => c.path),
          canRevert: true,
          isAutoCreated: true,
          createdBy: (context === 'test' ? 'auto-test' : context === 'build' ? 'auto-build' : 'auto-experiment')
        });
      }

      return {
        success: true,
        branchName,
        commitMessage,
        commitHash,
        backupBranch,
        changesDetected: changes.length
      };

    } catch (error) {
      console.error(`❌ Failed to create auto-branch for ${context}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Check if current directory is a git repository
   */
  private async checkGitRepository(): Promise<boolean> {
    try {
      const res = await executeGitCommand(
        this.serverId,
        'git rev-parse --is-inside-work-tree',
        this.projectPath,
        this.executeTool
      );
      return res.success && res.output.trim() === 'true';
    } catch (error) {
      console.warn('Git repository check failed:', error);
      return false;
    }
  }

  /**
   * Get current git branch
   */
  private async getCurrentBranch(): Promise<string> {
    try {
      const res = await executeGitCommand(
        this.serverId,
        'git branch --show-current',
        this.projectPath,
        this.executeTool
      );
      return (res.success && res.output.trim()) ? res.output.trim() : 'main';
    } catch (error) {
      console.warn('Failed to get current branch:', error);
      return 'main';
    }
  }

  /**
   * Get current changes in the repository
   */
  private async getCurrentChanges(): Promise<FileChange[]> {
    try {
      const res = await executeGitCommand(
        this.serverId,
        'git status --porcelain',
        this.projectPath,
        this.executeTool
      );

      const changes: FileChange[] = [];
      const lines = (res.output || '').split('\n').filter(line => line.trim());

      for (const line of lines) {
        if (line.length < 3) continue;
        
        const status = line.substring(0, 2);
        const path = line.substring(3);

        if (status.includes('A') || status.includes('??')) {
          changes.push({ path, type: 'added' });
        } else if (status.includes('M')) {
          changes.push({ path, type: 'modified' });
        } else if (status.includes('D')) {
          changes.push({ path, type: 'deleted' });
        }
      }

      return changes;
    } catch (error) {
      console.warn('Failed to get git changes, assuming none:', error);
      return [];
    }
  }

  /**
   * Create backup branch of current state
   */
  private async createBackupBranch(): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const backupBranch = `backup/rollback/${timestamp}`;
    
    try {
      await executeGitCommand(this.serverId, `git checkout -b "${backupBranch}"`, this.projectPath, this.executeTool);

      // Return to original branch
      const currentBranch = await this.getCurrentBranch();
      await executeGitCommand(this.serverId, `git checkout "${currentBranch}"`, this.projectPath, this.executeTool);

      console.log(`📦 Created backup branch: ${backupBranch}`);
      return backupBranch;
    } catch (error) {
      console.warn('Failed to create backup branch:', error);
      throw new Error(`Backup creation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Stash current uncommitted work
   */
  private async stashCurrentWork(): Promise<void> {
    try {
      const stashMessage = `auto-stash-before-branch-${Date.now()}`;
      await executeGitCommand(this.serverId, `git stash push -m "${stashMessage}"`, this.projectPath, this.executeTool);
      
      console.log(`📦 Stashed current work: ${stashMessage}`);
    } catch (error) {
      // Non-critical if stash fails (might be no changes)
      console.warn('Stash operation failed (likely no changes to stash):', error);
    }
  }

  /**
   * Create new git branch
   */
  private async createBranch(branchName: string): Promise<void> {
    try {
      await executeGitCommand(this.serverId, `git checkout -b "${branchName}"`, this.projectPath, this.executeTool);
    } catch (error) {
      throw new Error(`Failed to create branch ${branchName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Commit current state with generated message
   */
  private async commitCurrentState(message: string): Promise<string> {
    try {
      // Add all changes
      await executeGitCommand(this.serverId, 'git add -A', this.projectPath, this.executeTool);

      // Commit with message (allow empty commits for branch creation)
      await executeGitCommand(this.serverId, `git commit -m "${message}" --allow-empty`, this.projectPath, this.executeTool);

      // Get commit hash
      const hashResult = await executeGitCommand(this.serverId, 'git rev-parse HEAD', this.projectPath, this.executeTool);
      return (hashResult.output || '').trim();
    } catch (error) {
      throw new Error(`Failed to commit changes: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Generate fallback commit message when LLM fails
   */
  private generateFallbackMessage(changes: FileChange[], context: string): string {
    if (changes.length === 0) {
      return `auto: prepare for ${context} run`;
    }

    const added = changes.filter(c => c.type === 'added').length;
    const modified = changes.filter(c => c.type === 'modified').length;
    const deleted = changes.filter(c => c.type === 'deleted').length;

    if (added > 0 && modified === 0 && deleted === 0) {
      return `feat: add ${added} files before ${context}`;
    }
    if (modified > 0 && added === 0 && deleted === 0) {
      return `update: modify ${modified} files before ${context}`;
    }
    if (deleted > 0) {
      return `remove: delete ${deleted} files before ${context}`;
    }
    
    return `auto: ${changes.length} changes before ${context}`;
  }

  /**
   * Get configuration
   */
  getConfig(): PreRunConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<PreRunConfig>): void {
    this.config = { ...this.config, ...updates };
    console.log('⚙️ Updated pre-run branch configuration');
  }

  /**
   * Get metadata manager for external access
   */
  getMetadataManager(): BranchMetadataManager {
    return this.metadataManager;
  }
}

export default PreRunBranchManager; 