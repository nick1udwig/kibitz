/**
 * 🔧 LIGHTWEIGHT GIT STATE TRACKER
 * 
 * Works with existing Git system to:
 * - Cache git status/branch info to reduce redundant commands
 * - Save branch/commit data to JSON files 
 * - Provide callback hooks for frontend integration
 * - Minimize BashCommand load without changing workflow
 */

import { join } from 'path';

export interface GitState {
  projectPath: string;
  projectId: string;
  currentBranch: string;
  hasChanges: boolean;
  changedFiles: string[];
  lastCommitHash?: string;
  lastCommitMessage?: string;
  pendingFiles: string[];
  timestamp: number;
  isGitRepo: boolean;
}

export interface BranchInfo {
  name: string;
  type: 'auto' | 'manual' | 'main';
  createdAt: number;
  lastActivity: number;
  commitHash?: string;
  commitMessage?: string;
  filesChanged: string[];
  parentBranch?: string;
}

export interface ProjectGitData {
  projectId: string;
  projectPath: string;
  projectName: string;
  currentState: GitState;
  branches: BranchInfo[];
  recentCommits: Array<{
    hash: string;
    message: string;
    branch: string;
    timestamp: number;
    files: string[];
  }>;
  statistics: {
    totalBranches: number;
    autoBranches: number;
    totalCommits: number;
    lastActivity: number;
  };
  lastUpdated: number;
}

export class GitStateTracker {
  private static instances = new Map<string, GitStateTracker>();
  private stateCache = new Map<string, GitState>();
  private callbacks = new Set<(projectId: string, data: ProjectGitData) => void>();
  
  private readonly CACHE_TTL = 15000; // 15 seconds cache for git status
  private readonly JSON_DIR = '.kibitz/git-state';

  private constructor(private projectId: string, private projectPath: string) {}

  /**
   * Get or create tracker instance for a project
   */
  static getInstance(projectId: string, projectPath: string): GitStateTracker {
    const key = `${projectId}:${projectPath}`;
    if (!GitStateTracker.instances.has(key)) {
      GitStateTracker.instances.set(key, new GitStateTracker(projectId, projectPath));
    }
    return GitStateTracker.instances.get(key)!;
  }

  /**
   * 📊 TRACK GIT COMMAND EXECUTION
   * Call this whenever a git command is executed to update cache and JSON
   */
  async trackGitCommand(
    command: string, 
    result: string, 
    success: boolean,
    metadata?: { tool?: string; trigger?: string }
  ): Promise<void> {
    try {
      console.log(`🔧 GitStateTracker: Tracking command "${command}" for project ${this.projectId}`);

      // Update cache based on command type
      if (command.includes('git status')) {
        await this.updateStatusCache(result, success);
      } else if (command.includes('git commit')) {
        await this.handleCommitCommand(result, success, metadata);
      } else if (command.includes('git checkout -b')) {
        await this.handleBranchCreation(command, result, success, metadata);
      } else if (command.includes('git rev-parse')) {
        await this.updateCommitHashCache(result, success);
      }

      // Save to JSON after any git command
      await this.saveToJSON();

    } catch (error) {
      console.error(`❌ GitStateTracker: Error tracking command "${command}":`, error);
    }
  }

  /**
   * 🚀 GET CACHED GIT STATE (reduces redundant commands)
   */
  getCachedState(): GitState | null {
    const cached = this.stateCache.get(this.projectPath);
    if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL) {
      console.log(`📋 GitStateTracker: Using cached state for ${this.projectId} (${Date.now() - cached.timestamp}ms old)`);
      return cached;
    }
    return null;
  }

  /**
   * 🔗 ADD CALLBACK FOR FRONTEND INTEGRATION
   */
  addCallback(callback: (projectId: string, data: ProjectGitData) => void): void {
    this.callbacks.add(callback);
  }

  /**
   * 🗑️ REMOVE CALLBACK
   */
  removeCallback(callback: (projectId: string, data: ProjectGitData) => void): void {
    this.callbacks.delete(callback);
  }

  /**
   * 📁 SAVE PROJECT DATA TO JSON (Server-side only)
   */
  private async saveToJSON(): Promise<void> {
    // Only save JSON on server-side (Node.js environment)
    if (typeof window !== 'undefined') {
      console.log(`📋 GitStateTracker: Skipping JSON save on client-side for ${this.projectId}`);
      // Still notify callbacks with in-memory data
      const projectData = await this.buildProjectData();
      this.notifyCallbacks(projectData);
      return;
    }

    try {
      // Dynamic import of fs for server-side only
      const fs = await import('fs').then(m => m.promises);
      
      const jsonDir = join(this.projectPath, this.JSON_DIR);
      await fs.mkdir(jsonDir, { recursive: true });

      const projectData = await this.buildProjectData();
      
      // Save main project file
      const mainFile = join(jsonDir, `project-${this.projectId}.json`);
      await fs.writeFile(mainFile, JSON.stringify(projectData, null, 2));

      // Save branch-specific files
      for (const branch of projectData.branches) {
        const branchFile = join(jsonDir, `branch-${branch.name.replace(/[^a-zA-Z0-9-_]/g, '-')}.json`);
        await fs.writeFile(branchFile, JSON.stringify({
          ...branch,
          projectId: this.projectId,
          projectPath: this.projectPath,
          savedAt: Date.now()
        }, null, 2));
      }

      // Save summary file
      const summaryFile = join(jsonDir, 'summary.json');
      await fs.writeFile(summaryFile, JSON.stringify({
        projectId: this.projectId,
        projectName: projectData.currentState.projectPath.split('/').pop(),
        totalBranches: projectData.statistics.totalBranches,
        currentBranch: projectData.currentState.currentBranch,
        hasChanges: projectData.currentState.hasChanges,
        lastActivity: projectData.statistics.lastActivity,
        lastUpdated: projectData.lastUpdated,
        files: {
          main: `project-${this.projectId}.json`,
          branches: projectData.branches.map(b => 
            `branch-${b.name.replace(/[^a-zA-Z0-9-_]/g, '-')}.json`
          )
        }
      }, null, 2));

      console.log(`💾 GitStateTracker: Saved project data to ${jsonDir}`);

      // Notify callbacks
      this.notifyCallbacks(projectData);

    } catch (error) {
      console.error(`❌ GitStateTracker: Failed to save JSON:`, error);
      // Still notify callbacks even if save failed
      try {
        const projectData = await this.buildProjectData();
        this.notifyCallbacks(projectData);
      } catch (buildError) {
        console.error(`❌ GitStateTracker: Failed to build project data:`, buildError);
      }
    }
  }

  /**
   * 📊 UPDATE STATUS CACHE
   */
  private async updateStatusCache(result: string, success: boolean): Promise<void> {
    if (!success) return;

    const currentState = this.stateCache.get(this.projectPath) || {} as GitState;
    
    // Parse git status output
    const lines = result.split('\n').filter(line => line.trim());
    const changedFiles: string[] = [];
    let currentBranch = currentState.currentBranch || 'main';

    for (const line of lines) {
      if (line.startsWith('On branch ')) {
        currentBranch = line.replace('On branch ', '').trim();
      } else if (line.startsWith('##')) {
        // Parse branch info from porcelain format
        const branchMatch = line.match(/## ([^.\s]+)/);
        if (branchMatch) currentBranch = branchMatch[1];
      } else if (line.length > 2 && (line.startsWith('??') || line.startsWith(' M') || line.startsWith('A '))) {
        const filename = line.substring(3).trim();
        changedFiles.push(filename);
      }
    }

    const newState: GitState = {
      ...currentState,
      projectPath: this.projectPath,
      projectId: this.projectId,
      currentBranch,
      hasChanges: changedFiles.length > 0,
      changedFiles,
      timestamp: Date.now(),
      isGitRepo: true
    };

    this.stateCache.set(this.projectPath, newState);
    console.log(`📋 GitStateTracker: Updated status cache - Branch: ${currentBranch}, Changes: ${changedFiles.length}`);
  }

  /**
   * 🔀 HANDLE BRANCH CREATION
   */
  private async handleBranchCreation(
    command: string, 
    result: string, 
    success: boolean, 
    // _metadata?: { tool?: string; trigger?: string }
  ): Promise<void> {
    if (!success) return;

    // Extract branch name from command like "git checkout -b auto/2025-07-19-17-21-20"
    const branchMatch = command.match(/git checkout -b ([^\s]+)/);
    if (!branchMatch) return;

    const branchName = branchMatch[1];
    const branchType: 'auto' | 'manual' | 'main' = 
      branchName.startsWith('auto/') ? 'auto' : 
      branchName === 'main' || branchName === 'master' ? 'main' : 'manual';

    console.log(`🌿 GitStateTracker: New branch created: ${branchName} (${branchType})`);

    // Update current state
    const currentState = this.stateCache.get(this.projectPath) || {} as GitState;
    currentState.currentBranch = branchName;
    currentState.timestamp = Date.now();
    this.stateCache.set(this.projectPath, currentState);
  }

  /**
   * 📝 HANDLE COMMIT COMMAND
   */
  private async handleCommitCommand(
    result: string, 
    success: boolean, 
    // _metadata?: { tool?: string; trigger?: string }
  ): Promise<void> {
    if (!success) return;

    // Parse commit result like "[main abc1234] commit message"
    const commitMatch = result.match(/\[([^\]]+)\s+([^\]]+)\]\s*(.+)/);
    if (!commitMatch) return;

    const branch = commitMatch[1];
    const hash = commitMatch[2];
    const message = commitMatch[3];

    console.log(`📝 GitStateTracker: New commit on ${branch}: ${hash} - ${message}`);

    // Update current state
    const currentState = this.stateCache.get(this.projectPath) || {} as GitState;
    currentState.lastCommitHash = hash;
    currentState.lastCommitMessage = message;
    currentState.hasChanges = false; // Changes committed
    currentState.changedFiles = [];
    currentState.timestamp = Date.now();
    this.stateCache.set(this.projectPath, currentState);
  }

  /**
   * 🔢 UPDATE COMMIT HASH CACHE
   */
  private async updateCommitHashCache(result: string, success: boolean): Promise<void> {
    if (!success) return;

    const hash = result.trim();
    if (hash && hash.length >= 7) {
      const currentState = this.stateCache.get(this.projectPath) || {} as GitState;
      currentState.lastCommitHash = hash;
      currentState.timestamp = Date.now();
      this.stateCache.set(this.projectPath, currentState);
    }
  }

  /**
   * 📊 BUILD PROJECT DATA FOR JSON
   */
  private async buildProjectData(): Promise<ProjectGitData> {
    const currentState = this.stateCache.get(this.projectPath) || {
      projectPath: this.projectPath,
      projectId: this.projectId,
      currentBranch: 'main',
      hasChanges: false,
      changedFiles: [],
      pendingFiles: [],
      timestamp: Date.now(),
      isGitRepo: true
    } as GitState;

    // Build branches list (this could be expanded by reading from git)
    const branches: BranchInfo[] = [];
    if (currentState.currentBranch) {
      const branchType: 'auto' | 'manual' | 'main' = 
        currentState.currentBranch.startsWith('auto/') ? 'auto' : 
        currentState.currentBranch === 'main' || currentState.currentBranch === 'master' ? 'main' : 'manual';

      branches.push({
        name: currentState.currentBranch,
        type: branchType,
        createdAt: Date.now(),
        lastActivity: Date.now(),
        commitHash: currentState.lastCommitHash,
        commitMessage: currentState.lastCommitMessage,
        filesChanged: currentState.changedFiles
      });
    }

    return {
      projectId: this.projectId,
      projectPath: this.projectPath,
      projectName: this.projectPath.split('/').pop() || this.projectId,
      currentState,
      branches,
      recentCommits: currentState.lastCommitHash ? [{
        hash: currentState.lastCommitHash,
        message: currentState.lastCommitMessage || '',
        branch: currentState.currentBranch,
        timestamp: Date.now(),
        files: currentState.changedFiles
      }] : [],
      statistics: {
        totalBranches: branches.length,
        autoBranches: branches.filter(b => b.type === 'auto').length,
        totalCommits: currentState.lastCommitHash ? 1 : 0,
        lastActivity: Date.now()
      },
      lastUpdated: Date.now()
    };
  }

  /**
   * 📞 NOTIFY CALLBACKS
   */
  private notifyCallbacks(data: ProjectGitData): void {
    for (const callback of this.callbacks) {
      try {
        callback(this.projectId, data);
      } catch (error) {
        console.error(`❌ GitStateTracker: Callback error:`, error);
      }
    }
  }

  /**
   * 🔍 GET PROJECT DATA
   */
  async getProjectData(): Promise<ProjectGitData> {
    return this.buildProjectData();
  }

  /**
   * 📖 LOAD FROM JSON (if exists) - Server-side only
   */
  async loadFromJSON(): Promise<ProjectGitData | null> {
    // Only load JSON on server-side (Node.js environment)
    if (typeof window !== 'undefined') {
      console.log(`📋 GitStateTracker: Skipping JSON load on client-side for ${this.projectId}`);
      return null;
    }

    try {
      // Dynamic import of fs for server-side only
      const fs = await import('fs').then(m => m.promises);
      
      const jsonDir = join(this.projectPath, this.JSON_DIR);
      const mainFile = join(jsonDir, `project-${this.projectId}.json`);
      
      const data = await fs.readFile(mainFile, 'utf-8');
      return JSON.parse(data) as ProjectGitData;
    } catch {
      // File doesn't exist yet, that's okay
      return null;
    }
  }

  /**
   * 🗑️ CLEAR CACHE (force refresh)
   */
  clearCache(): void {
    this.stateCache.delete(this.projectPath);
    console.log(`🧹 GitStateTracker: Cleared cache for ${this.projectId}`);
  }

  /**
   * 📊 GET CACHE STATS
   */
  getCacheStats(): { hasCache: boolean; age: number; entries: number } {
    const cached = this.stateCache.get(this.projectPath);
    return {
      hasCache: !!cached,
      age: cached ? Date.now() - cached.timestamp : 0,
      entries: this.stateCache.size
    };
  }
} 