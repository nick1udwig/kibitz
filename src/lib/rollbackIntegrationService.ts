/**
 * Rollback Integration Service (facade)
 *
 * Bridges DB-side project metadata (via existingDatabaseIntegration) with unified
 * git operations through VersionControlManager. Keeps DB/persistence concerns
 * separate from git actions and standardizes rollback options.
 */

import { getDatabaseIntegrationService } from './existingDatabaseIntegration';
import { getProjectPath } from './projectPathService';
import { VersionControlManager, type RollbackOptions as VcRollbackOptions, type RollbackResult as VcRollbackResult } from './versionControl';
import { useStore } from '../stores/rootStore';

export interface RollbackOptions {
  createCheckpoint?: boolean; // DB checkpoint before rollback (synthetic)
  backupFiles?: boolean;      // Not used here
  preserveUncommittedChanges?: boolean; // maps to stashChanges=false
  forceRollback?: boolean;    // maps to force=true
}

export interface RollbackResult {
  success: boolean;
  message: string;
  backupBranch?: string;
  filesRestored?: string[];
  error?: string;
}

export interface AutoCommitOptions {
  isAutoCommit?: boolean;
  createCheckpoint?: boolean;
  fileThreshold?: number;
  branchPrefix?: string;
}

export interface AutoCommitResult {
  success: boolean;
  commitId: string;
  commitSha: string;
  branchName: string;
  filesChanged: string[];
  message: string;
  error?: string;
}

// Minimal record types for history-like calls
export interface CommitRecord { project_id: string; commit_sha: string; commit_message: string; branch_name: string; file_changes: string[]; timestamp?: string }
export interface BranchRecord { project_id: string; branch_name: string; is_active?: boolean; latest_commit?: string }
export interface RollbackPointRecord { project_id: string; commit_sha: string; rollback_name: string; description?: string; created_at?: string }

export class RollbackIntegrationService {
  private static singleton: RollbackIntegrationService | null = null;
  private initialized = false;
  private readonly db = getDatabaseIntegrationService();

  static getInstance(): RollbackIntegrationService {
    if (!this.singleton) this.singleton = new RollbackIntegrationService();
    return this.singleton;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.db.initialize();
    this.initialized = true;
  }

  async createProjectWithTracking(
    conversationId: string,
    projectName: string,
    customPath?: string
  ): Promise<{ projectId: string; projectPath: string }> {
    const created = await this.db.createProjectWithTracking(conversationId, projectName);
    return { projectId: created.projectId, projectPath: customPath || created.projectPath };
  }

  async executeAutoCommit(
    projectId: string,
    _conversationId: string,
    filesChanged: string[],
    commitMessage: string,
    options: AutoCommitOptions = {}
  ): Promise<AutoCommitResult> {
    const commitSha = `commit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const ts = new Date().toISOString();
    const branchName = options.branchPrefix
      ? `${options.branchPrefix}/${ts.slice(0, 16).replace(/[-:]/g, '').replace('T', '-')}`
      : `auto/${ts.slice(0, 16).replace(/[-:]/g, '').replace('T', '-')}`;

    await this.db.updateProjectMetadata(projectId, {
      last_commit_sha: commitSha,
      current_branch: branchName,
      last_activity: ts
    } as unknown as Record<string, unknown>);

    return {
      success: true,
      commitId: commitSha,
      commitSha,
      branchName,
      filesChanged,
      message: `Auto-commit recorded: ${commitMessage}`
    };
  }

  async createRollbackPoint(
    projectId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _commitSha: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _options: { name: string; description: string; createdBy?: 'user' | 'auto'; captureFiles?: boolean }
  ): Promise<string> {
    const id = `rb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await this.db.updateProjectMetadata(projectId, { last_activity: new Date().toISOString() } as unknown as Record<string, unknown>);
    return id;
  }

  async executeRollback(
    projectId: string,
    targetCommitSha: string,
    options: RollbackOptions = {}
  ): Promise<RollbackResult> {
    try {
      const meta = await this.db.getProjectMetadata(projectId);
      if (!meta) return { success: false, message: 'Rollback failed', error: `Project ${projectId} not found` };

      const store = useStore.getState();
      const connected = store.servers.filter(s => s.status === 'connected');
      if (!connected.length) return { success: false, message: 'Rollback failed', error: 'No connected MCP server available' };
      const uiProject = store.projects.find(p => p.id === projectId);
      const chosen = connected.find(s => uiProject?.settings?.mcpServerIds?.includes(s.id)) || connected[0];
      const serverId = chosen.id;
      const executeTool = store.executeTool;

      const projectPath = meta.folder_path || getProjectPath(projectId, meta.project_name || 'project');
      const vcm = new VersionControlManager(projectPath, serverId, executeTool);
      const vcOpts: VcRollbackOptions = {
        stashChanges: options.preserveUncommittedChanges === true ? false : true,
        createBackup: true,
        force: options.forceRollback === true
      };
      const res: VcRollbackResult = await vcm.rollbackToCommit(targetCommitSha, vcOpts);
      if (!res.success) return { success: false, message: 'Rollback failed', error: res.error };

      await this.db.updateProjectMetadata(projectId, {
        last_commit_sha: targetCommitSha,
        current_branch: meta.current_branch,
        last_activity: new Date().toISOString()
      } as unknown as Record<string, unknown>);

      return { success: true, message: `Rolled back to ${targetCommitSha}`, backupBranch: res.backupBranch, filesRestored: [] };
    } catch (e) {
      return { success: false, message: 'Rollback failed', error: e instanceof Error ? e.message : String(e) };
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getRollbackHistory(_projectId: string): Promise<{ commits: CommitRecord[]; branches: BranchRecord[]; rollbackPoints: RollbackPointRecord[] }> {
    return { commits: [], branches: [], rollbackPoints: [] };
  }

  async getProjectStatistics(projectId: string): Promise<{
    basic: { totalCommits: number; totalBranches: number; totalRollbackPoints: number; autoCommits: number; checkpoints: number; lastActivity: string };
    recentActivity: { type: 'commit' | 'branch' | 'rollback'; data: CommitRecord | BranchRecord | RollbackPointRecord; timestamp: string }[];
  }> {
    const b = await this.db.getProjectStatistics(projectId);
    const basic = {
      totalCommits: b.totalCommits,
      totalBranches: b.totalBranches,
      totalRollbackPoints: 0,
      autoCommits: b.autoCommits,
      checkpoints: 0,
      lastActivity: b.lastActivity
    };
    return { basic, recentActivity: [] };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async searchCommits(_query: string, _projectId?: string): Promise<CommitRecord[]> { return []; }

  async getConversationProjects(conversationId: string): Promise<Array<{ id: string; conversation_id: string; project_name: string; folder_path: string }>> {
    const all = await this.db.getAllProjectMetadata();
    return all.filter(p => p.conversation_id === conversationId).map(p => ({ id: p.id, conversation_id: p.conversation_id, project_name: p.project_name, folder_path: p.folder_path }));
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async markAsCheckpoint(_commitId: string): Promise<void> { return; }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getCheckpoints(_projectId: string): Promise<CommitRecord[]> { return []; }

  async cleanupOldData(maxAge: number = 30): Promise<void> {
    const cutoff = Date.now() - maxAge * 24 * 60 * 60 * 1000;
    const all = await this.db.getAllProjectMetadata();
    const old = all.filter(p => new Date(p.last_activity).getTime() < cutoff && p.status === 'active');
    for (const p of old) {
      await this.db.updateProjectMetadata(p.id, { status: 'archived' } as unknown as Record<string, unknown>);
    }
  }

  async exportProject(projectId: string): Promise<{ project: { id: string; name: string; folder_path: string }; commits: CommitRecord[]; branches: BranchRecord[]; rollbackPoints: RollbackPointRecord[] }> {
    const meta = await this.db.getProjectMetadata(projectId);
    if (!meta) throw new Error(`Project ${projectId} not found`);
    return { project: { id: meta.id, name: meta.project_name, folder_path: meta.folder_path }, commits: [], branches: [], rollbackPoints: [] };
  }

  async healthCheck(): Promise<{ database: { healthy: boolean; message: string }; overall: { healthy: boolean; message: string } }> {
    const db = await this.db.healthCheck();
    const database = { healthy: !!(db && db.integration), message: (db && db.integration) ? 'OK' : 'Degraded' };
    const overall = { healthy: database.healthy && this.initialized, message: (database.healthy && this.initialized) ? 'Rollback integration service is healthy' : 'Rollback integration service has issues' };
    return { database, overall };
  }
}

export const getRollbackIntegrationService = (): RollbackIntegrationService => RollbackIntegrationService.getInstance();
export const initializeRollbackIntegration = async (): Promise<RollbackIntegrationService> => { const s = RollbackIntegrationService.getInstance(); await s.initialize(); return s; };

export const useRollbackIntegration = () => {
  const service = getRollbackIntegrationService();
  return {
    createProject: (conversationId: string, projectName: string, customPath?: string) => service.createProjectWithTracking(conversationId, projectName, customPath),
    executeAutoCommit: (projectId: string, conversationId: string, filesChanged: string[], commitMessage: string, options?: AutoCommitOptions) => service.executeAutoCommit(projectId, conversationId, filesChanged, commitMessage, options),
    executeRollback: (projectId: string, targetCommitSha: string, options?: RollbackOptions) => service.executeRollback(projectId, targetCommitSha, options),
    getRollbackHistory: (projectId: string) => service.getRollbackHistory(projectId),
    getProjectStatistics: (projectId: string) => service.getProjectStatistics(projectId),
    createRollbackPoint: (projectId: string, commitSha: string, options: { name: string; description: string; createdBy?: 'user' | 'auto' }) => service.createRollbackPoint(projectId, commitSha, options),
    searchCommits: (query: string, projectId?: string) => service.searchCommits(query, projectId),
    getCheckpoints: (projectId: string) => service.getCheckpoints(projectId),
    markAsCheckpoint: (commitId: string) => service.markAsCheckpoint(commitId)
  };
};


