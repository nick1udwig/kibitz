/**
 * 🚀 GIT COMMAND OPTIMIZER
 * 
 * Lightweight wrapper for existing Git services to:
 * - Reduce redundant git status/rev-parse calls
 * - Track all git operations for JSON storage
 * - Work seamlessly with existing workflow
 * - Provide callback system for future frontend integration
 */

import { GitStateTracker, GitState } from './gitStateTracker';

export interface OptimizedGitResult {
  success: boolean;
  output: string;
  error?: string;
  cached?: boolean;
  executionTime?: number;
}

export interface GitCommandContext {
  projectId: string;
  projectPath: string;
  tool?: string;
  trigger?: string;
}

export class GitCommandOptimizer {
  private static instances = new Map<string, GitCommandOptimizer>();
  private static pendingCommands = new Map<string, Promise<OptimizedGitResult>>();
  private static lastCommandTime = new Map<string, number>();
  
  private constructor(
    private context: GitCommandContext,
    private tracker: GitStateTracker
  ) {}

  /**
   * Get or create optimizer instance
   */
  static getInstance(context: GitCommandContext): GitCommandOptimizer {
    const key = `${context.projectId}:${context.projectPath}`;
    if (!GitCommandOptimizer.instances.has(key)) {
      const tracker = GitStateTracker.getInstance(context.projectId, context.projectPath);
      GitCommandOptimizer.instances.set(key, new GitCommandOptimizer(context, tracker));
    }
    return GitCommandOptimizer.instances.get(key)!;
  }

  /**
   * 🔧 OPTIMIZE GIT COMMAND EXECUTION
   * Call this instead of directly executing git commands
   */
  async optimizeGitCommand(
    originalExecutor: () => Promise<string>,
    command: string,
    options: { allowCache?: boolean; skipTracking?: boolean } = {}
  ): Promise<OptimizedGitResult> {
    const startTime = Date.now();
    const { allowCache = true, skipTracking = false } = options;

    try {
      // Create a unique key for this command and context
      const commandKey = `${this.context.projectId}:${command}`;
      
      // Rate limiting: prevent same command from running too frequently
      const lastRunTime = GitCommandOptimizer.lastCommandTime.get(commandKey) || 0;
      const timeSinceLastRun = Date.now() - lastRunTime;
      const minInterval = command.includes('git rev-parse') ? 2000 : 1000; // 2s for rev-parse, 1s for others
      
      if (timeSinceLastRun < minInterval) {
        console.log(`🔧 GitCommandOptimizer: Rate limiting "${command}" (${timeSinceLastRun}ms since last run)`);
        // Return cached result if available
        if (allowCache && this.isCacheableCommand(command)) {
          const cachedState = this.tracker.getCachedState();
          if (cachedState) {
            return {
              success: true,
              output: this.formatCachedOutput(command, cachedState),
              cached: true,
              executionTime: Date.now() - startTime
            };
          }
        }
      }

      // Check for pending duplicate command
      if (GitCommandOptimizer.pendingCommands.has(commandKey)) {
        console.log(`⏳ GitCommandOptimizer: Waiting for duplicate command: "${command}"`);
        const pendingResult = await GitCommandOptimizer.pendingCommands.get(commandKey)!;
        return {
          ...pendingResult,
          cached: true,
          executionTime: Date.now() - startTime
        };
      }

      // Check if we can use cached result for status commands
      if (allowCache && this.isCacheableCommand(command)) {
        const cachedState = this.tracker.getCachedState();
        if (cachedState && this.canUseCachedResult(command, cachedState)) {
          console.log(`⚡ GitCommandOptimizer: Using cached result for "${command}"`);
          return {
            success: true,
            output: this.formatCachedOutput(command, cachedState),
            cached: true,
            executionTime: Date.now() - startTime
          };
        }
      }

      // Create execution promise and track it
      const executionPromise = this.executeCommand(originalExecutor, command, skipTracking);
      GitCommandOptimizer.pendingCommands.set(commandKey, executionPromise);
      GitCommandOptimizer.lastCommandTime.set(commandKey, Date.now());

      try {
        const result = await executionPromise;
        return {
          ...result,
          executionTime: Date.now() - startTime
        };
      } finally {
        // Clean up pending command
        GitCommandOptimizer.pendingCommands.delete(commandKey);
      }

    } catch (error) {
      console.error(`❌ GitCommandOptimizer: Error executing "${command}":`, error);
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - startTime
      };
    }
  }

  private async executeCommand(
    originalExecutor: () => Promise<string>,
    command: string,
    skipTracking: boolean
  ): Promise<OptimizedGitResult> {
    // Execute the original command
    console.log(`🔧 GitCommandOptimizer: Executing "${command}"`);
    const result = await originalExecutor();
    const success = !result.includes('Error:') && !result.includes('fatal:');

    // Track the command result (unless skipped)
    if (!skipTracking) {
      await this.tracker.trackGitCommand(command, result, success, {
        tool: this.context.tool,
        trigger: this.context.trigger
      });
    }

    return {
      success,
      output: result,
      cached: false
    };
  }

  /**
   * 🚀 QUICK STATUS CHECK
   * Optimized wrapper for git status calls
   */
  async getOptimizedStatus(): Promise<{ 
    currentBranch: string; 
    hasChanges: boolean; 
    changedFiles: string[];
    cached: boolean;
  }> {
    const cachedState = this.tracker.getCachedState();
    
    if (cachedState) {
      console.log(`📋 GitCommandOptimizer: Using cached status for ${this.context.projectId}`);
      return {
        currentBranch: cachedState.currentBranch,
        hasChanges: cachedState.hasChanges,
        changedFiles: cachedState.changedFiles,
        cached: true
      };
    }

    // Fallback to regular git status - this should be handled by the calling service
    console.log(`🔧 GitCommandOptimizer: No cache available, caller should execute git status`);
    return {
      currentBranch: 'main',
      hasChanges: false,
      changedFiles: [],
      cached: false
    };
  }

  /**
   * 🔗 ADD CALLBACK FOR FRONTEND INTEGRATION
   */
  addCallback(callback: (projectId: string, data: Record<string, unknown>) => void): void {
    this.tracker.addCallback(callback);
  }

  /**
   * 🗑️ REMOVE CALLBACK
   */
  removeCallback(callback: (projectId: string, data: Record<string, unknown>) => void): void {
    this.tracker.removeCallback(callback);
  }

  /**
   * 🧹 CLEAR CACHE
   */
  clearCache(): void {
    this.tracker.clearCache();
  }

  /**
   * 📊 GET CACHE STATS
   */
  getCacheStats(): { hasCache: boolean; age: number; entries: number } {
    return this.tracker.getCacheStats();
  }

  /**
   * 📁 GET PROJECT DATA
   */
  async getProjectData() {
    return this.tracker.getProjectData();
  }

  /**
   * 🔍 CHECK IF COMMAND IS CACHEABLE
   */
  private isCacheableCommand(command: string): boolean {
    const cacheableCommands = [
      'git status',
      'git branch --show-current',
      'git rev-parse HEAD',
      'git rev-parse --is-inside-work-tree'
    ];

    return cacheableCommands.some(cmd => command.includes(cmd));
  }

  /**
   * ✅ CHECK IF CACHED RESULT CAN BE USED
   */
  private canUseCachedResult(command: string, cachedState: GitState): boolean {
    // Only use cache for status-like commands
    if (command.includes('git status')) return true;
    if (command.includes('git branch --show-current')) return true;
    if (command.includes('git rev-parse HEAD') && cachedState.lastCommitHash) return true;
    if (command.includes('git rev-parse --is-inside-work-tree') && cachedState.isGitRepo) return true;
    
    return false;
  }

  /**
   * 📝 FORMAT CACHED OUTPUT
   */
  private formatCachedOutput(command: string, cachedState: GitState): string {
    // Ensure changedFiles is always an array
    const changedFiles = Array.isArray(cachedState.changedFiles) ? cachedState.changedFiles : [];
    
    if (command.includes('git status --porcelain')) {
      // Format porcelain output
      return changedFiles.map(file => `?? ${file}`).join('\n');
    }
    
    if (command.includes('git status')) {
      if (cachedState.hasChanges) {
        return `On branch ${cachedState.currentBranch}\nChanges not staged for commit:\n${
          changedFiles.map(f => `\tmodified:   ${f}`).join('\n')
        }`;
      } else {
        return `On branch ${cachedState.currentBranch}\nnothing to commit, working tree clean`;
      }
    }

    if (command.includes('git branch --show-current')) {
      return cachedState.currentBranch || 'main';
    }

    if (command.includes('git rev-parse HEAD')) {
      return cachedState.lastCommitHash || '';
    }

    if (command.includes('git rev-parse --is-inside-work-tree')) {
      return cachedState.isGitRepo ? 'true' : 'false';
    }

    return '';
  }
}

/**
 * 🎯 HELPER FUNCTION - Wrap existing git service calls
 * 
 * Usage in existing services:
 * 
 * // Instead of:
 * const result = await executeTool(serverId, 'BashCommand', { ... });
 * 
 * // Use:
 * const optimizer = GitCommandOptimizer.getInstance({ projectId, projectPath });
 * const result = await optimizer.optimizeGitCommand(
 *   () => executeTool(serverId, 'BashCommand', { ... }),
 *   'git status --porcelain'
 * );
 */
export function wrapGitCommand(
  context: GitCommandContext,
  originalExecutor: () => Promise<string>,
  command: string,
  options?: { allowCache?: boolean; skipTracking?: boolean }
): Promise<OptimizedGitResult> {
  const optimizer = GitCommandOptimizer.getInstance(context);
  return optimizer.optimizeGitCommand(originalExecutor, command, options);
}

/**
 * 🎣 HELPER FUNCTION - Extract context from existing services
 */
export function createGitContext(
  projectId: string,
  projectPath: string,
  tool?: string,
  trigger?: string
): GitCommandContext {
  return {
    projectId: projectId.replace(/['"]/g, ''), // Clean quotes
    projectPath,
    tool,
    trigger
  };
} 