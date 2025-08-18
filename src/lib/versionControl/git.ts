/**
 * Version control git wrapper
 *
 * Centralizes access to low-level git execution and common helpers so that
 * higher-level modules import from a single place.
 */

// import type { McpExecutor } from './types';
import { pushToRemote as corePushToRemote, createCommit as coreCreateCommit } from '../gitService';
import GitThreadManager, { ExecuteToolFn as ThreadExecuteToolFn } from './GitThreadManager';
import { logGitStructured, updateKnownBranch } from './logger';

export type ExecuteTool = (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>;

/** Re-exported, standardized git command executor. */
export async function executeGitCommand(
  serverId: string,
  command: string,
  cwd: string,
  executeTool: ExecuteTool
) {
  // Use GitThreadManager to ensure single Initialize per (serverId, cwd) and stable thread_id
  const threadMgr = GitThreadManager.getInstance();
  const full = `cd "${cwd}" && ${command}`;
  const raw = await threadMgr.runBash(
    serverId,
    cwd,
    executeTool as unknown as ThreadExecuteToolFn,
    full
  );

  // Reuse output parsing and success heuristics from core service for consistency
  try {
    // The core parser expects the unwrapped tool output. Emulate coreExecuteGitCommand
    // by building a minimal GitCommandResponse-like object here.
    const text = String(raw || '').trim();
    // Best-effort branch learn
    if (/git\s+branch\s+--show-current/.test(command)) {
      const br = text.split('\n')[0]?.trim();
      if (br) updateKnownBranch(cwd, br);
    }
    // Structured log (thread id unknown here; GitThreadManager caches it, so fetch for logging)
    try {
      const threadId = await GitThreadManager.getInstance().getThreadId(serverId, cwd, executeTool as unknown as ThreadExecuteToolFn);
      logGitStructured(serverId, cwd, threadId, command);
    } catch {}
    const isError =
      text.includes('Error:') ||
      /\bfatal:/i.test(text) ||
      /\berror:/i.test(text) ||
      text.includes('No such file or directory') ||
      text.includes('src refspec') ||
      text.includes('failed to push') ||
      text.includes('unbound variable') ||
      text.includes("Username for 'https://github.com'");

    return { success: !isError, output: text } as { success: boolean; output: string; error?: string };
  } catch (e) {
    return { success: false, output: '', error: e instanceof Error ? e.message : String(e) } as {
      success: boolean; output: string; error?: string;
    };
  }
}

/** Re-export push to remote for callers that need it. */
export const pushToRemote = corePushToRemote;

/** Re-export createCommit for callers that want a compact helper. */
export const createCommit = coreCreateCommit;

/** Utility: check if a string looks like a Git commit SHA. */
export function isLikelyCommitSha(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = value.trim();
  return /^[0-9a-f]{7,40}$/i.test(v);
}


