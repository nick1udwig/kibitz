/**
 * Rollback Integration Service
 * 
 * Integrates the Kibitz database with auto-commit functionality to provide
 * comprehensive rollback capabilities similar to Replit Agent v2 and Cursor.
 */

import { 
  getKibitzDatabase, 
  initializeKibitzDatabase,
  ProjectRecord,
  CommitRecord,
  BranchRecord,
  RollbackPointRecord 
} from './kibitzDatabase';
import { generateWorkspaceId } from './conversationWorkspaceService';
import { getProjectPath } from './projectPathService';

export interface RollbackOptions {
  createCheckpoint?: boolean;
  backupFiles?: boolean;
  preserveUncommittedChanges?: boolean;
  forceRollback?: boolean;
}

export interface RollbackResult {
  success: boolean;
  message: string;
  rollbackCommitSha?: string;
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

/**
 * Rollback Integration Service
 */
export class RollbackIntegrationService {
  private static instance: RollbackIntegrationService | null = null;
  private database: ReturnType<typeof getKibitzDatabase>;
  private isInitialized = false;

  private constructor() {
    this.database = getKibitzDatabase();
  }

  static getInstance(): RollbackIntegrationService {
    if (!RollbackIntegrationService.instance) {
      RollbackIntegrationService.instance = new RollbackIntegrationService();
    }
    return RollbackIntegrationService.instance;
  }

  /**
   * Initialize the rollback integration service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await initializeKibitzDatabase();
      this.isInitialized = true;
      console.log('✅ Rollback integration service initialized');
    } catch (error) {
      console.error('❌ Failed to initialize rollback integration service:', error);
      throw error;
    }
  }

  /**
   * Create a new project with database tracking
   */
  async createProjectWithTracking(
    conversationId: string,
    projectName: string,
    customPath?: string
  ): Promise<{ projectId: string; projectPath: string }> {
    const projectId = generateWorkspaceId();
    const projectPath = customPath || getProjectPath(projectId, projectName);

    // Create project record in database
    await this.database.createProject({
      conversation_id: conversationId,
      project_name: projectName,
      folder_path: projectPath,
      current_branch: 'main',
      status: 'active',
      git_initialized: false
    });

    console.log(`📝 Created project with tracking: ${projectId}`);
    return { projectId, projectPath };
  }

  /**
   * Execute auto-commit with database tracking
   */
  async executeAutoCommit(
    projectId: string,
    conversationId: string,
    filesChanged: string[],
    commitMessage: string,
    options: AutoCommitOptions = {}
  ): Promise<AutoCommitResult> {
    try {
      const project = await this.database.getProject(projectId);
      if (!project) {
        throw new Error(`Project ${projectId} not found`);
      }

      // Generate commit info
      const commitSha = `commit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const timestamp = new Date().toISOString();
      const branchName = options.branchPrefix 
        ? `${options.branchPrefix}/${timestamp.slice(0, 16).replace(/[-:]/g, '').replace('T', '-')}`
        : `auto/${timestamp.slice(0, 16).replace(/[-:]/g, '').replace('T', '-')}`;

      // Create commit record
      const commitId = await this.database.createCommit({
        project_id: projectId,
        commit_sha: commitSha,
        commit_message: commitMessage,
        branch_name: branchName,
        file_changes: filesChanged,
        author: 'kibitz-auto',
        is_auto_commit: options.isAutoCommit ?? true,
        is_checkpoint: options.createCheckpoint ?? false
      });

      // Create or update branch record
      const existingBranch = await this.database.getBranchByName(projectId, branchName);
      if (!existingBranch) {
        await this.database.createBranch({
          project_id: projectId,
          branch_name: branchName,
          base_commit_sha: project.last_commit_sha || 'initial',
          head_commit_sha: commitSha,
          branch_type: 'auto-commit',
          is_active: true,
          description: `Auto-commit: ${filesChanged.length} files changed`
        });
      } else {
        await this.database.updateBranch(existingBranch.id, {
          head_commit_sha: commitSha
        });
      }

      // Create rollback point if significant changes
      if (filesChanged.length >= (options.fileThreshold || 3)) {
        await this.createRollbackPoint(projectId, commitSha, {
          name: `Auto-rollback: ${branchName}`,
          description: `Automatic rollback point for ${filesChanged.length} file changes`,
          createdBy: 'auto'
        });
      }

      console.log(`✅ Auto-commit executed: ${commitId}`);
      return {
        success: true,
        commitId,
        commitSha,
        branchName,
        filesChanged,
        message: 'Auto-commit executed successfully'
      };

    } catch (error) {
      console.error('❌ Auto-commit failed:', error);
      return {
        success: false,
        commitId: '',
        commitSha: '',
        branchName: '',
        filesChanged: [],
        message: 'Auto-commit failed',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Create a rollback point
   */
  async createRollbackPoint(
    projectId: string,
    commitSha: string,
    options: {
      name: string;
      description: string;
      createdBy?: 'user' | 'auto';
      captureFiles?: boolean;
    }
  ): Promise<string> {
    const project = await this.database.getProject(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    // Capture project state
    const projectState = {
      current_branch: project.current_branch,
      last_commit_sha: project.last_commit_sha,
      folder_path: project.folder_path,
      git_initialized: project.git_initialized,
      timestamp: new Date().toISOString()
    };

    // Get file count from recent commits
    const recentCommits = await this.database.getProjectCommits(projectId, 5);
    const uniqueFiles = new Set<string>();
    recentCommits.forEach(commit => {
      commit.file_changes.forEach(file => uniqueFiles.add(file));
    });

    const rollbackId = await this.database.createRollbackPoint({
      project_id: projectId,
      commit_sha: commitSha,
      rollback_name: options.name,
      description: options.description,
      project_state: projectState,
      file_count: uniqueFiles.size,
      created_by: options.createdBy || 'user'
    });

    console.log(`↩️ Created rollback point: ${rollbackId}`);
    return rollbackId;
  }

  /**
   * Execute rollback to a specific commit
   */
  async executeRollback(
    projectId: string,
    targetCommitSha: string,
    options: RollbackOptions = {}
  ): Promise<RollbackResult> {
    try {
      const project = await this.database.getProject(projectId);
      if (!project) {
        throw new Error(`Project ${projectId} not found`);
      }

      // Find target commit
      const targetCommits = await this.database.getCommitsBySha(targetCommitSha);
      const targetCommit = targetCommits.find(c => c.project_id === projectId);
      if (!targetCommit) {
        throw new Error(`Commit ${targetCommitSha} not found for project ${projectId}`);
      }

      // Create checkpoint before rollback if requested
      let backupBranch: string | undefined;
      if (options.createCheckpoint) {
        const checkpointName = `pre-rollback-${Date.now()}`;
        await this.createRollbackPoint(projectId, project.last_commit_sha || 'current', {
          name: checkpointName,
          description: `Checkpoint before rollback to ${targetCommitSha}`,
          createdBy: 'user'
        });
        backupBranch = checkpointName;
      }

      // Update project state
      await this.database.updateProject(projectId, {
        last_commit_sha: targetCommit.commit_sha,
        current_branch: targetCommit.branch_name
      });

      // Create rollback commit record
      const rollbackCommitSha = `rollback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const rollbackCommitId = await this.database.createCommit({
        project_id: projectId,
        commit_sha: rollbackCommitSha,
        commit_message: `Rollback to ${targetCommit.commit_message}`,
        branch_name: targetCommit.branch_name,
        file_changes: targetCommit.file_changes,
        author: 'kibitz-rollback',
        is_auto_commit: false,
        is_checkpoint: true,
        parent_commit_sha: targetCommit.commit_sha
      });

      console.log(`↩️ Rollback executed: ${rollbackCommitId}`);
      return {
        success: true,
        message: `Successfully rolled back to commit ${targetCommitSha}`,
        rollbackCommitSha,
        backupBranch,
        filesRestored: targetCommit.file_changes
      };

    } catch (error) {
      console.error('❌ Rollback failed:', error);
      return {
        success: false,
        message: 'Rollback failed',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Get rollback history for a project
   */
  async getRollbackHistory(projectId: string): Promise<{
    commits: CommitRecord[];
    branches: BranchRecord[];
    rollbackPoints: RollbackPointRecord[];
  }> {
    const [commits, branches, rollbackPoints] = await Promise.all([
      this.database.getProjectCommits(projectId, 50),
      this.database.getProjectBranches(projectId),
      this.database.getRollbackPoints(projectId)
    ]);

    return { commits, branches, rollbackPoints };
  }

  /**
   * Get project statistics
   */
  async getProjectStatistics(projectId: string): Promise<{
    basic: {
      totalCommits: number;
      totalBranches: number;
      totalRollbackPoints: number;
      autoCommits: number;
      checkpoints: number;
      lastActivity: string;
    };
    recentActivity: {
      type: 'commit' | 'branch' | 'rollback';
      data: CommitRecord | BranchRecord | RollbackPointRecord;
      timestamp: string;
    }[];
  }> {
    const [basic, recentActivity] = await Promise.all([
      this.database.getProjectStatistics(projectId),
      this.database.getRecentActivity(projectId, 20)
    ]);

    return { basic, recentActivity };
  }

  /**
   * Search commits across projects
   */
  async searchCommits(query: string, projectId?: string): Promise<CommitRecord[]> {
    return await this.database.searchCommits(query, projectId);
  }

  /**
   * Get all projects for a conversation
   */
  async getConversationProjects(conversationId: string): Promise<ProjectRecord[]> {
    const allProjects = await this.database.listProjects('active');
    return allProjects.filter(p => p.conversation_id === conversationId);
  }

  /**
   * Mark a commit as checkpoint
   */
  async markAsCheckpoint(commitId: string): Promise<void> {
    await this.database.markCommitAsCheckpoint(commitId);
  }

  /**
   * Get checkpoints for a project
   */
  async getCheckpoints(projectId: string): Promise<CommitRecord[]> {
    return await this.database.getCheckpoints(projectId);
  }

  /**
   * Clean up old data
   */
  async cleanupOldData(maxAge: number = 30): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - maxAge);
    
    const projects = await this.database.listProjects();
    const oldProjects = projects.filter(p => 
      new Date(p.last_activity) < cutoffDate && p.status === 'active'
    );

    for (const project of oldProjects) {
      await this.database.updateProject(project.id, { status: 'archived' });
    }

    // Run database vacuum
    await this.database.vacuum();
    
    console.log(`🧹 Cleaned up ${oldProjects.length} old projects`);
  }

  /**
   * Export project data
   */
  async exportProject(projectId: string): Promise<{
    project: ProjectRecord;
    commits: CommitRecord[];
    branches: BranchRecord[];
    rollbackPoints: RollbackPointRecord[];
  }> {
    const project = await this.database.getProject(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    const [commits, branches, rollbackPoints] = await Promise.all([
      this.database.getProjectCommits(projectId),
      this.database.getProjectBranches(projectId),
      this.database.getRollbackPoints(projectId)
    ]);

    return { project, commits, branches, rollbackPoints };
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{
    database: { healthy: boolean; message: string };
    overall: { healthy: boolean; message: string };
  }> {
    const database = await this.database.healthCheck();
    const overall = {
      healthy: database.healthy && this.isInitialized,
      message: database.healthy && this.isInitialized 
        ? 'Rollback integration service is healthy'
        : 'Rollback integration service has issues'
    };

    return { database, overall };
  }
}

// Convenience functions
export const getRollbackIntegrationService = (): RollbackIntegrationService => {
  return RollbackIntegrationService.getInstance();
};

export const initializeRollbackIntegration = async (): Promise<RollbackIntegrationService> => {
  const service = RollbackIntegrationService.getInstance();
  await service.initialize();
  return service;
};

// Hook for React components
export const useRollbackIntegration = () => {
  const service = getRollbackIntegrationService();

  const createProject = async (conversationId: string, projectName: string, customPath?: string) => {
    return await service.createProjectWithTracking(conversationId, projectName, customPath);
  };

  const executeAutoCommit = async (
    projectId: string,
    conversationId: string,
    filesChanged: string[],
    commitMessage: string,
    options?: AutoCommitOptions
  ) => {
    return await service.executeAutoCommit(projectId, conversationId, filesChanged, commitMessage, options);
  };

  const executeRollback = async (
    projectId: string,
    targetCommitSha: string,
    options?: RollbackOptions
  ) => {
    return await service.executeRollback(projectId, targetCommitSha, options);
  };

  const getRollbackHistory = async (projectId: string) => {
    return await service.getRollbackHistory(projectId);
  };

  const getProjectStatistics = async (projectId: string) => {
    return await service.getProjectStatistics(projectId);
  };

  const createRollbackPoint = async (
    projectId: string,
    commitSha: string,
    options: { name: string; description: string; createdBy?: 'user' | 'auto' }
  ) => {
    return await service.createRollbackPoint(projectId, commitSha, options);
  };

  const searchCommits = async (query: string, projectId?: string) => {
    return await service.searchCommits(query, projectId);
  };

  const getCheckpoints = async (projectId: string) => {
    return await service.getCheckpoints(projectId);
  };

  const markAsCheckpoint = async (commitId: string) => {
    return await service.markAsCheckpoint(commitId);
  };

  return {
    createProject,
    executeAutoCommit,
    executeRollback,
    getRollbackHistory,
    getProjectStatistics,
    createRollbackPoint,
    searchCommits,
    getCheckpoints,
    markAsCheckpoint
  };
}; 