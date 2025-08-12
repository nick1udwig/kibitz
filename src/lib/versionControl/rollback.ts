import { McpExecutor, RollbackResult, RollbackToCommitParams } from './types';

export async function rollbackToCommit(params: RollbackToCommitParams): Promise<RollbackResult> {
  const { projectPath, serverId, executeTool, commitHash, options } = params;
  try {
    const stashChanges = options?.stashChanges !== false; // default true
    const createBackup = options?.createBackup !== false; // default true

    // Initialize MCP thread to the project path
    await executeTool(serverId, 'Initialize', {
      type: 'first_call',
      any_workspace_path: projectPath,
      initial_files_to_read: [],
      task_id_to_resume: '',
      mode_name: 'wcgw',
      thread_id: 'rollback-operation'
    });

    // Stash any work if requested
    if (stashChanges) {
      try {
        await executeTool(serverId, 'BashCommand', {
          action_json: { command: `cd "${projectPath}" && git stash push -m "pre-rollback-${Date.now()}"`, type: 'command' },
          thread_id: 'rollback-operation'
        });
      } catch {}
    }

    // Optionally create a backup branch at the current HEAD
    let backupBranch: string | undefined;
    if (createBackup) {
      try {
        const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        backupBranch = `backup-before-rollback-${ts}`;
        await executeTool(serverId, 'BashCommand', {
          action_json: { command: `cd "${projectPath}" && git branch ${backupBranch}`, type: 'command' },
          thread_id: 'rollback-operation'
        });
      } catch {}
    }

    const result = await executeTool(serverId, 'BashCommand', {
      action_json: {
        command: `cd "${projectPath}" && git reset --hard ${commitHash}`,
        type: 'command'
      },
      thread_id: 'rollback-operation'
    });

    const output = typeof result === 'string' ? result : '';
    const ok = !!output && (output.includes('HEAD is now at') || !/fatal:|error:/i.test(output));
    return { success: ok, error: ok ? undefined : 'Rollback failed', backupBranch, message: ok ? 'Rollback completed' : undefined };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}


