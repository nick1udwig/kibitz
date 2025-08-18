/**
 * Simple structured logger and diagnostics for git commands.
 *
 * - Records per-project command frequencies
 * - Emits structured logs with projectId, branch, threadId, serverId, command
 */

type CommandCount = {
  command: string;
  timestamps: number[]; // unix ms for each execution
};

interface ProjectDiagnostics {
  branchName: string | null;
  commands: Map<string, CommandCount>;
}

const projectDiag = new Map<string, ProjectDiagnostics>();

function getOrCreate(projectPath: string): ProjectDiagnostics {
  let entry = projectDiag.get(projectPath);
  if (!entry) {
    entry = { branchName: null, commands: new Map() };
    projectDiag.set(projectPath, entry);
  }
  return entry;
}

export function deriveProjectIdFromPath(projectPath: string): string {
  try {
    const dir = projectPath.split('/').filter(Boolean).pop() || '';
    const id = dir.split('_')[0];
    return id || 'unknown';
  } catch {
    return 'unknown';
  }
}

export function updateKnownBranch(projectPath: string, branch: string): void {
  const entry = getOrCreate(projectPath);
  const trimmed = (branch || '').trim();
  if (trimmed) entry.branchName = trimmed;
}

export function recordGitCommand(projectPath: string, command: string): void {
  const entry = getOrCreate(projectPath);
  const now = Date.now();
  const key = normalizeCommandForCounting(command);
  let cc = entry.commands.get(key);
  if (!cc) {
    cc = { command: key, timestamps: [] };
    entry.commands.set(key, cc);
  }
  cc.timestamps.push(now);
  // Trim to last minute for memory control
  const cutoff = now - 60_000;
  cc.timestamps = cc.timestamps.filter(t => t >= cutoff);
}

export function getTopCommands(
  projectPath: string,
  windowMs: number = 60_000,
  limit: number = 5
): Array<{ command: string; count: number }> {
  const entry = getOrCreate(projectPath);
  const cutoff = Date.now() - Math.max(1_000, windowMs);
  const counts: Array<{ command: string; count: number }> = [];
  entry.commands.forEach(({ command, timestamps }) => {
    const c = timestamps.filter(t => t >= cutoff).length;
    if (c > 0) counts.push({ command, count: c });
  });
  counts.sort((a, b) => b.count - a.count);
  return counts.slice(0, limit);
}

export function logGitStructured(
  serverId: string,
  projectPath: string,
  threadId: string,
  command: string
): void {
  const proj = getOrCreate(projectPath);
  const projectId = deriveProjectIdFromPath(projectPath);
  recordGitCommand(projectPath, command);
  const top5 = getTopCommands(projectPath, 60_000, 3);
  // Lightweight structured log
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      type: 'git.exec',
      projectId,
      projectPath,
      branch: proj.branchName || null,
      threadId,
      serverId,
      command,
      top: top5
    })
  );
}

function normalizeCommandForCounting(cmd: string): string {
  // Collapses arguments that are likely to be unique (e.g., hashes) to reduce cardinality
  try {
    let c = cmd.replace(/\s+/g, ' ').trim();
    c = c.replace(/\b[0-9a-f]{7,40}\b/gi, '<sha>');
    c = c.replace(/\b\d{10,}\b/g, '<num>');
    return c;
  } catch {
    return cmd;
  }
}

const logger = {
  recordGitCommand,
  logGitStructured,
  updateKnownBranch,
  getTopCommands,
  deriveProjectIdFromPath
};

export default logger;


