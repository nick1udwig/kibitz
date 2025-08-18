/**
 * GitThreadManager
 *
 * Caches and manages MCP thread_ids for git-related BashCommand calls.
 * Ensures Initialize runs at most once per (serverId, projectPath) and
 * retries BashCommand once if the server indicates missing bash state.
 */

export type ExecuteToolFn = (
  serverId: string,
  toolName: string,
  args: Record<string, unknown>
) => Promise<string>;

interface ThreadEntry {
  threadId: string;
  lastInitializedAt: number;
}

export class GitThreadManager {
  private static instance: GitThreadManager | null = null;

  private readonly cache = new Map<string, ThreadEntry>();
  private readonly inflightInit = new Map<string, Promise<string>>();

  private constructor() {}

  static getInstance(): GitThreadManager {
    if (!GitThreadManager.instance) {
      GitThreadManager.instance = new GitThreadManager();
    }
    return GitThreadManager.instance;
  }

  private makeKey(serverId: string, projectPath: string): string {
    return `${serverId}|${projectPath}`;
  }

  private parseThreadId(initOutput: string, fallback: string): string {
    try {
      const m1 = initOutput.match(/Use\s+thread_id=([a-z0-9\-]+)/i);
      if (m1 && m1[1]) return m1[1];
      const m2 = initOutput.match(/thread_id=([a-z0-9\-]+)/i);
      if (m2 && m2[1]) return m2[1];
    } catch {}
    return fallback;
  }

  async getThreadId(
    serverId: string,
    projectPath: string,
    executeTool: ExecuteToolFn
  ): Promise<string> {
    const key = this.makeKey(serverId, projectPath);
    const cached = this.cache.get(key);
    if (cached?.threadId) return cached.threadId;

    if (this.inflightInit.has(key)) {
      return await this.inflightInit.get(key)!;
    }

    const initPromise = (async () => {
      // Default, stable thread id if server doesn't override
      let threadId = 'git-operations';
      try {
        const result = await executeTool(serverId, 'Initialize', {
          type: 'first_call',
          any_workspace_path: projectPath,
          initial_files_to_read: [],
          task_id_to_resume: '',
          mode_name: 'wcgw',
          thread_id: threadId
        } as unknown as Record<string, unknown>);
        threadId = this.parseThreadId(result, threadId);
      } catch {
        // Keep fallback thread id on failure; BashCommand may still work
      }
      this.cache.set(key, { threadId, lastInitializedAt: Date.now() });
      this.inflightInit.delete(key);
      return threadId;
    })();

    this.inflightInit.set(key, initPromise);
    return await initPromise;
  }

  async reinitialize(
    serverId: string,
    projectPath: string,
    executeTool: ExecuteToolFn
  ): Promise<string> {
    // Force a fresh Initialize and update cache
    const key = this.makeKey(serverId, projectPath);
    this.cache.delete(key);
    return this.getThreadId(serverId, projectPath, executeTool);
  }

  private needsReinit(output: string): boolean {
    const text = String(output || '');
    return /no\s+saved\s+bash\s+state/i.test(text) ||
           /unknown\s+thread/i.test(text) ||
           /invalid\s+thread/i.test(text) ||
           /initialize\s+first/i.test(text);
  }

  async runBash(
    serverId: string,
    projectPath: string,
    executeTool: ExecuteToolFn,
    fullCommand: string
  ): Promise<string> {
    // First attempt with current or freshly acquired thread id
    let threadId = await this.getThreadId(serverId, projectPath, executeTool);
    let result: string = '';
    try {
      result = await executeTool(serverId, 'BashCommand', {
        action_json: { command: fullCommand, type: 'command' },
        thread_id: threadId
      } as unknown as Record<string, unknown>);
    } catch (err) {
      result = String(err);
    }

    if (!this.needsReinit(result)) {
      return result;
    }

    // Retry once after reinitializing thread
    threadId = await this.reinitialize(serverId, projectPath, executeTool);
    try {
      return await executeTool(serverId, 'BashCommand', {
        action_json: { command: fullCommand, type: 'command' },
        thread_id: threadId
      } as unknown as Record<string, unknown>);
    } catch (err) {
      return String(err);
    }
  }
}

export default GitThreadManager;


