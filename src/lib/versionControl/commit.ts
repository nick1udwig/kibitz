import { CommitPreparationContext, CommitPreparationResult, CommitExecutionResult } from './types';
import { executeGitCommand, createCommit as createGitCommit, pushToRemote } from './git';
import { generateLLMCommitMessage } from '../llmCommitMessageGenerator';

export async function prepareCommit(context: CommitPreparationContext): Promise<CommitPreparationResult> {
  const { projectPath, serverId, executeTool, projectSettings, branchName, conversationId } = context;
  try {
    // Stage all changes
    await executeGitCommand(serverId, 'git add -A', projectPath, executeTool);

    // Collect diff data
    const diffRes = await executeGitCommand(serverId, 'git diff --cached', projectPath, executeTool);
    if (!diffRes.success || !diffRes.output.trim()) {
      return { success: false, commitMessage: '', filesChanged: [], linesAdded: 0, linesRemoved: 0, diff: '', error: 'No staged changes' };
    }

    const filesRes = await executeGitCommand(serverId, 'git diff --cached --name-only', projectPath, executeTool);
    const filesChanged = filesRes.success ? filesRes.output.split('\n').filter(Boolean) : [];

    const numstatRes = await executeGitCommand(serverId, 'git diff --cached --numstat', projectPath, executeTool);
    let linesAdded = 0; let linesRemoved = 0;
    if (numstatRes.success && numstatRes.output.trim()) {
      numstatRes.output.split('\n').forEach(line => {
        const parts = line.trim().split('\t');
        if (parts.length >= 2) {
          const a = parseInt(parts[0]) || 0; const r = parseInt(parts[1]) || 0;
          linesAdded += a; linesRemoved += r;
        }
      });
    }

    // Detect if this is the very first commit (no HEAD yet)
    const headRes = await executeGitCommand(serverId, 'git rev-parse --verify HEAD', projectPath, executeTool);
    const isFirstCommit = !headRes.success || !headRes.output.trim();

    // LLM commit message (skip for first commit)
    const llm = await generateLLMCommitMessage({
      gitDiff: diffRes.output,
      filesChanged,
      linesAdded,
      linesRemoved,
      branchName: branchName || undefined,
      conversationId: conversationId || undefined,
      previousMessage: ''
    }, projectSettings);

    const commitMessage = isFirstCommit
      ? 'Initial commit'
      : ((llm.success && llm.message.trim()) ? llm.message.trim() : `Auto-commit: ${filesChanged.length} files changed`);

    return { success: true, commitMessage, filesChanged, linesAdded, linesRemoved, diff: diffRes.output };
  } catch (error) {
    return { success: false, commitMessage: '', filesChanged: [], linesAdded: 0, linesRemoved: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function executeCommit(
  context: CommitPreparationContext,
  message: string
): Promise<CommitExecutionResult> {
  const { projectPath, serverId, executeTool } = context;
  const result = await createGitCommit(projectPath, message, serverId, executeTool);
  if (!result.success) {
    return { success: false, commitHash: null, message, error: 'Commit failed' };
  }
  return { success: true, commitHash: result.commitHash, message };
}

export async function pushCurrentBranch(
  projectPath: string,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>,
  explicitBranch?: string
) {
  // Resolve current branch
  const br = await executeGitCommand(serverId, 'git branch --show-current', projectPath, executeTool);
  const branch = br.success && br.output.trim() ? br.output.trim() : (explicitBranch || 'main');
  return await pushToRemote(projectPath, serverId, executeTool, branch);
}


