import { executeGitCommand, ExecuteTool } from './git';

type CacheEntry = { value: string; expiresAt: number; success: boolean };

export class GitStateTracker {
  private static instance: GitStateTracker | null = null;
  private readonly ttlMs: number;
  private readonly cache = new Map<string, CacheEntry>();

  private constructor(ttlMs: number) {
    this.ttlMs = ttlMs;
  }

  static getInstance(ttlMs: number = 800): GitStateTracker {
    if (!GitStateTracker.instance) {
      GitStateTracker.instance = new GitStateTracker(ttlMs);
    }
    return GitStateTracker.instance;
  }

  private key(serverId: string, projectPath: string, command: string): string {
    return `${serverId}|${projectPath}|${command}`;
  }

  private getFresh(serverId: string, projectPath: string, command: string): CacheEntry | null {
    const k = this.key(serverId, projectPath, command);
    const e = this.cache.get(k);
    if (!e) return null;
    if (Date.now() > e.expiresAt) {
      this.cache.delete(k);
      return null;
    }
    return e;
  }

  private set(serverId: string, projectPath: string, command: string, success: boolean, value: string): void {
    const k = this.key(serverId, projectPath, command);
    this.cache.set(k, { value, success, expiresAt: Date.now() + this.ttlMs });
  }

  async getStatusPorcelain(serverId: string, projectPath: string, executeTool: ExecuteTool): Promise<{ success: boolean; output: string }> {
    const cmd = 'git status --porcelain';
    const fresh = this.getFresh(serverId, projectPath, cmd);
    if (fresh) return { success: fresh.success, output: fresh.value };
    const res = await executeGitCommand(serverId, cmd, projectPath, executeTool);
    this.set(serverId, projectPath, cmd, res.success, res.output || '');
    return { success: res.success, output: res.output || '' };
  }

  async getCurrentBranch(serverId: string, projectPath: string, executeTool: ExecuteTool): Promise<{ success: boolean; output: string }> {
    const cmd = 'git branch --show-current';
    const fresh = this.getFresh(serverId, projectPath, cmd);
    if (fresh) return { success: fresh.success, output: fresh.value };
    const res = await executeGitCommand(serverId, cmd, projectPath, executeTool);
    this.set(serverId, projectPath, cmd, res.success, res.output || '');
    return { success: res.success, output: res.output || '' };
  }

  async getHeadCommit(serverId: string, projectPath: string, executeTool: ExecuteTool): Promise<{ success: boolean; output: string }> {
    const cmd = 'git rev-parse HEAD';
    const fresh = this.getFresh(serverId, projectPath, cmd);
    if (fresh) return { success: fresh.success, output: fresh.value };
    const res = await executeGitCommand(serverId, cmd, projectPath, executeTool);
    this.set(serverId, projectPath, cmd, res.success, res.output || '');
    return { success: res.success, output: res.output || '' };
  }
}

export default GitStateTracker;


