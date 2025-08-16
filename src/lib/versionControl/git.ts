/**
 * Version control git wrapper
 *
 * Centralizes access to low-level git execution and common helpers so that
 * higher-level modules import from a single place.
 */

// import type { McpExecutor } from './types';
import { executeGitCommand as coreExecuteGitCommand, pushToRemote as corePushToRemote, createCommit as coreCreateCommit } from '../gitService';

export type ExecuteTool = (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>;

/** Re-exported, standardized git command executor. */
export async function executeGitCommand(
  serverId: string,
  command: string,
  cwd: string,
  executeTool: ExecuteTool
) {
  return coreExecuteGitCommand(serverId, command, cwd, executeTool);
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


