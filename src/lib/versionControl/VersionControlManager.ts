import { ProjectSettings } from '../../components/LlmChat/context/types';
import { executeGitCommand } from './git';
import { prepareCommit, executeCommit } from './commit';
import {
  CommitPreparationContext,
  CommitPreparationResult,
  CommitExecutionResult,
  RollbackOptions,
  RollbackResult
} from './types';
import { rollbackToCommit as rollbackToCommitLowLevel } from './rollback';

export type ExecuteTool = (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>;

/**
 * VersionControlManager
 *
 * Unified facade for common version control operations used across the app.
 * - Rollback: by commit or by branch
 * - Commit: prepare and execute commits (with optional LLM message generation)
 * - Centralizes low-level git helpers (stash, checkout, branch verify) via executeGitCommand
 */
export class VersionControlManager {
  private readonly projectPath: string;
  private readonly serverId: string;
  private readonly executeTool: ExecuteTool;

  constructor(projectPath: string, serverId: string, executeTool: ExecuteTool) {
    this.projectPath = projectPath;
    this.serverId = serverId;
    this.executeTool = executeTool;
  }

  /** Roll back to a specific commit hash */
  async rollbackToCommit(commitHash: string, options: RollbackOptions = {}): Promise<RollbackResult> {
    return rollbackToCommitLowLevel({
      projectPath: this.projectPath,
      serverId: this.serverId,
      executeTool: this.executeTool,
      commitHash,
      options
    });
  }

  /** Revert working tree to the state of a target branch (checkout). */
  async revertToBranch(
    branchName: string,
    options: RollbackOptions = {}
  ): Promise<RollbackResult> {
    const { stashChanges = true, createBackup = true, force = false } = options;
    try {
      // Verify branch exists
      const verify = await executeGitCommand(this.serverId, `git show-ref --verify --quiet refs/heads/${branchName}`, this.projectPath, this.executeTool);
      if (!verify.success) {
        return { success: false, error: `Branch ${branchName} not found` };
      }

      // Determine current branch
      const cur = await executeGitCommand(this.serverId, 'git branch --show-current', this.projectPath, this.executeTool);
      const currentBranch = cur.success ? (cur.output.trim() || 'main') : 'main';

      // Optionally create a backup branch at current HEAD
      let backupBranch: string | undefined;
      if (createBackup && currentBranch !== branchName) {
        const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        // Unified naming: backup/rollback/<iso-ts>
        backupBranch = `backup/rollback/${ts}`;
        // Create lightweight backup branch pointing at HEAD
        await executeGitCommand(this.serverId, `git branch ${backupBranch}`, this.projectPath, this.executeTool);
      }

      // Optionally stash current work if there are changes
      if (stashChanges) {
        const status = await executeGitCommand(this.serverId, 'git status --porcelain', this.projectPath, this.executeTool);
        if (status.success && status.output.trim()) {
          await executeGitCommand(this.serverId, `git stash push -m "pre-revert-${Date.now()}"`, this.projectPath, this.executeTool);
        }
      }

      // Checkout the target branch (force if requested)
      const checkoutCmd = force ? `git checkout -f ${branchName}` : `git checkout ${branchName}`;
      const co = await executeGitCommand(this.serverId, checkoutCmd, this.projectPath, this.executeTool);
      if (!co.success) {
        return { success: false, error: `Failed to checkout ${branchName}` , backupBranch };
      }

      return { success: true, backupBranch, message: `Reverted to branch ${branchName}` };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /** Prepare a commit (stages files, generates commit message via LLM). */
  async prepareCommit(
    projectSettings: ProjectSettings,
    branchName?: string | null,
    conversationId?: string | null
  ): Promise<CommitPreparationResult> {
    const context: CommitPreparationContext = {
      projectPath: this.projectPath,
      serverId: this.serverId,
      executeTool: this.executeTool,
      projectSettings,
      branchName: branchName ?? undefined,
      conversationId: conversationId ?? undefined
    };
    return prepareCommit(context);
  }

  /** Execute a commit with the provided message (does not push). */
  async executeCommit(message: string, projectSettings: ProjectSettings): Promise<CommitExecutionResult> {
    const context: CommitPreparationContext = {
      projectPath: this.projectPath,
      serverId: this.serverId,
      executeTool: this.executeTool,
      projectSettings
    };
    return executeCommit(context, message);
  }

  /** Convenience: prepare and commit in one call. */
  async commitAll(
    projectSettings: ProjectSettings,
    opts: { branchName?: string | null; conversationId?: string | null; overrideMessage?: string | null } = {}
  ): Promise<CommitExecutionResult & { prepared?: CommitPreparationResult } > {
    const prepared = await this.prepareCommit(projectSettings, opts.branchName ?? null, opts.conversationId ?? null);
    if (!prepared.success) {
      return { success: false, commitHash: null, message: opts.overrideMessage || '', error: prepared.error, prepared };
    }
    const message = (opts.overrideMessage && opts.overrideMessage.trim()) || prepared.commitMessage || 'Auto-commit';
    const executed = await this.executeCommit(message, projectSettings);
    return { ...executed, prepared };
  }
}

export default VersionControlManager;


