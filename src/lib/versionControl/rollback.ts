import { RollbackResult, RollbackToCommitParams } from './types';
import { executeGitCommand } from './git';

export async function rollbackToCommit(params: RollbackToCommitParams): Promise<RollbackResult> {
  const { projectPath, serverId, executeTool, commitHash, options } = params;
  try {
    const stashChanges = options?.stashChanges !== false; // default true
    const createBackup = options?.createBackup !== false; // default true

    // Stash any work if requested
    if (stashChanges) {
      try {
        await executeGitCommand(serverId, `git stash push -m "pre-rollback-${Date.now()}"`, projectPath, executeTool);
      } catch {}
    }

    // Optionally create a backup branch at the current HEAD
    let backupBranch: string | undefined;
    if (createBackup) {
      try {
        const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        // Unified naming: backup/rollback/<iso-ts>
        backupBranch = `backup/rollback/${ts}`;
        await executeGitCommand(serverId, `git branch ${backupBranch}`, projectPath, executeTool);
      } catch {}
    }

    const result = await executeGitCommand(serverId, `git reset --hard ${commitHash}`, projectPath, executeTool);

    const output = typeof result.output === 'string' ? result.output : '';
    const ok = !!output && (output.includes('HEAD is now at') || !/fatal:|error:/i.test(output));
    return { success: ok, error: ok ? undefined : 'Rollback failed', backupBranch, message: ok ? 'Rollback completed' : undefined };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}


