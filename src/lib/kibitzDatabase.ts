/**
 * Kibitz Database Service
 * 
 * Local storage implementation for project metadata, branches, commits,
 * and rollback information. Uses existing storage infrastructure.
 */

import { generateWorkspaceId } from './conversationWorkspaceService';

// Database interfaces
export interface ProjectRecord {
  id: string;
  conversation_id: string;
  project_name: string;
  folder_path: string;
  created_at: string;
  last_commit_sha?: string;
  current_branch: string;
  status: 'active' | 'archived' | 'deleted';
  git_initialized: boolean;
  last_activity: string;
}

export interface CommitRecord {
  id: string;
  project_id: string;
  commit_sha: string;
  commit_message: string;
  branch_name: string;
  timestamp: string;
  file_changes: string[]; // Array of file paths
  author: string;
  is_auto_commit: boolean;
  is_checkpoint: boolean;
  parent_commit_sha?: string;
}

export interface BranchRecord {
  id: string;
  project_id: string;
  branch_name: string;
  base_commit_sha: string;
  head_commit_sha: string;
  created_at: string;
  branch_type: 'main' | 'feature' | 'auto-commit' | 'experimental';
  is_active: boolean;
  description?: string;
}

export interface RollbackPointRecord {
  id: string;
  project_id: string;
  commit_sha: string;
  rollback_name: string;
  description: string;
  created_at: string;
  project_state: Record<string, any>; // Snapshot of project state
  file_count: number;
  created_by: 'user' | 'auto';
}

export interface DatabaseState {
  projects: { [key: string]: ProjectRecord };
  commits: { [key: string]: CommitRecord };
  branches: { [key: string]: BranchRecord };
  rollback_points: { [key: string]: RollbackPointRecord };
  version: number;
  last_backup: string;
}

/**
 * Kibitz Database Manager
 * Uses localStorage with periodic file backup
 */
export class KibitzDatabase {
  private static instance: KibitzDatabase | null = null;
  private storage: Storage;
  private state: DatabaseState;
  private isInitialized = false;
  private autoSaveInterval?: NodeJS.Timeout;

  private constructor() {
    this.storage = typeof window !== 'undefined' ? window.localStorage : {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      length: 0,
      key: () => null
    } as Storage;

    this.state = {
      projects: {},
      commits: {},
      branches: {},
      rollback_points: {},
      version: 1,
      last_backup: new Date().toISOString()
    };
  }

  static getInstance(): KibitzDatabase {
    if (!KibitzDatabase.instance) {
      KibitzDatabase.instance = new KibitzDatabase();
    }
    return KibitzDatabase.instance;
  }

  /**
   * Initialize the database
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Load existing data
      await this.loadFromStorage();
      
      // Setup auto-save
      this.setupAutoSave();
      
      this.isInitialized = true;
      console.log('✅ Kibitz database initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Kibitz database:', error);
      throw error;
    }
  }

  /**
   * Load data from localStorage
   */
  private async loadFromStorage(): Promise<void> {
    try {
      const stored = this.storage.getItem('kibitz-database');
      if (stored) {
        this.state = JSON.parse(stored);
        console.log('📁 Loaded database state from localStorage');
      }
    } catch (error) {
      console.error('❌ Failed to load database state:', error);
      // Continue with empty state
    }
  }

  /**
   * Save data to localStorage
   */
  private async saveToStorage(): Promise<void> {
    try {
      this.state.last_backup = new Date().toISOString();
      this.storage.setItem('kibitz-database', JSON.stringify(this.state));
    } catch (error) {
      console.error('❌ Failed to save database state:', error);
      throw error;
    }
  }

  /**
   * Setup auto-save mechanism
   */
  private setupAutoSave(): void {
    // Save every 10 seconds
    this.autoSaveInterval = setInterval(() => {
      this.saveToStorage();
    }, 10000);
  }

  /**
   * Project Management Methods
   */
  async createProject(projectData: Omit<ProjectRecord, 'id' | 'created_at' | 'last_activity'>): Promise<string> {
    const id = generateWorkspaceId();
    const now = new Date().toISOString();
    
    const project: ProjectRecord = {
      id,
      ...projectData,
      created_at: now,
      last_activity: now
    };

    this.state.projects[id] = project;
    await this.saveToStorage();

    console.log(`📝 Created project record: ${id}`);
    return id;
  }

  async getProject(projectId: string): Promise<ProjectRecord | null> {
    return this.state.projects[projectId] || null;
  }

  async getProjectByConversationId(conversationId: string): Promise<ProjectRecord | null> {
    const project = Object.values(this.state.projects).find(p => p.conversation_id === conversationId);
    return project || null;
  }

  async updateProject(projectId: string, updates: Partial<ProjectRecord>): Promise<void> {
    const project = this.state.projects[projectId];
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    this.state.projects[projectId] = {
      ...project,
      ...updates,
      last_activity: new Date().toISOString()
    };

    await this.saveToStorage();
  }

  async listProjects(status?: string): Promise<ProjectRecord[]> {
    const projects = Object.values(this.state.projects);
    const filtered = status ? projects.filter(p => p.status === status) : projects;
    return filtered.sort((a, b) => new Date(b.last_activity).getTime() - new Date(a.last_activity).getTime());
  }

  async deleteProject(projectId: string): Promise<void> {
    // Mark as deleted instead of actually deleting
    await this.updateProject(projectId, { status: 'deleted' });
  }

  /**
   * Commit Management Methods
   */
  async createCommit(commitData: Omit<CommitRecord, 'id' | 'timestamp'>): Promise<string> {
    const id = generateWorkspaceId();
    const commit: CommitRecord = {
      id,
      ...commitData,
      timestamp: new Date().toISOString()
    };

    this.state.commits[id] = commit;

    // Update project's last commit
    const project = this.state.projects[commit.project_id];
    if (project) {
      project.last_commit_sha = commit.commit_sha;
      project.current_branch = commit.branch_name;
      project.last_activity = commit.timestamp;
    }

    await this.saveToStorage();

    console.log(`📝 Created commit record: ${id}`);
    return id;
  }

  async getCommit(commitId: string): Promise<CommitRecord | null> {
    return this.state.commits[commitId] || null;
  }

  async getCommitsBySha(commitSha: string): Promise<CommitRecord[]> {
    return Object.values(this.state.commits).filter(c => c.commit_sha === commitSha);
  }

  async getProjectCommits(projectId: string, limit?: number): Promise<CommitRecord[]> {
    const commits = Object.values(this.state.commits)
      .filter(c => c.project_id === projectId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    return limit ? commits.slice(0, limit) : commits;
  }

  async getBranchCommits(projectId: string, branchName: string): Promise<CommitRecord[]> {
    return Object.values(this.state.commits)
      .filter(c => c.project_id === projectId && c.branch_name === branchName)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  async getCheckpoints(projectId: string): Promise<CommitRecord[]> {
    return Object.values(this.state.commits)
      .filter(c => c.project_id === projectId && c.is_checkpoint)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  async markCommitAsCheckpoint(commitId: string): Promise<void> {
    const commit = this.state.commits[commitId];
    if (!commit) {
      throw new Error(`Commit ${commitId} not found`);
    }

    commit.is_checkpoint = true;
    await this.saveToStorage();
  }

  /**
   * Branch Management Methods
   */
  async createBranch(branchData: Omit<BranchRecord, 'id' | 'created_at'>): Promise<string> {
    const id = generateWorkspaceId();
    const branch: BranchRecord = {
      id,
      ...branchData,
      created_at: new Date().toISOString()
    };

    this.state.branches[id] = branch;
    await this.saveToStorage();

    console.log(`🌿 Created branch record: ${id}`);
    return id;
  }

  async getBranch(branchId: string): Promise<BranchRecord | null> {
    return this.state.branches[branchId] || null;
  }

  async getBranchByName(projectId: string, branchName: string): Promise<BranchRecord | null> {
    const branch = Object.values(this.state.branches).find(b => 
      b.project_id === projectId && b.branch_name === branchName
    );
    return branch || null;
  }

  async getProjectBranches(projectId: string): Promise<BranchRecord[]> {
    return Object.values(this.state.branches)
      .filter(b => b.project_id === projectId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  async updateBranch(branchId: string, updates: Partial<BranchRecord>): Promise<void> {
    const branch = this.state.branches[branchId];
    if (!branch) {
      throw new Error(`Branch ${branchId} not found`);
    }

    this.state.branches[branchId] = { ...branch, ...updates };
    await this.saveToStorage();
  }

  async deleteBranch(branchId: string): Promise<void> {
    delete this.state.branches[branchId];
    await this.saveToStorage();
  }

  /**
   * Rollback Points Management
   */
  async createRollbackPoint(rollbackData: Omit<RollbackPointRecord, 'id' | 'created_at'>): Promise<string> {
    const id = generateWorkspaceId();
    const rollbackPoint: RollbackPointRecord = {
      id,
      ...rollbackData,
      created_at: new Date().toISOString()
    };

    this.state.rollback_points[id] = rollbackPoint;
    await this.saveToStorage();

    console.log(`↩️ Created rollback point: ${id}`);
    return id;
  }

  async getRollbackPoints(projectId: string): Promise<RollbackPointRecord[]> {
    return Object.values(this.state.rollback_points)
      .filter(r => r.project_id === projectId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  async getRollbackPoint(rollbackId: string): Promise<RollbackPointRecord | null> {
    return this.state.rollback_points[rollbackId] || null;
  }

  async deleteRollbackPoint(rollbackId: string): Promise<void> {
    delete this.state.rollback_points[rollbackId];
    await this.saveToStorage();
  }

  /**
   * Statistics and Analytics
   */
  async getProjectStatistics(projectId: string): Promise<{
    totalCommits: number;
    totalBranches: number;
    totalRollbackPoints: number;
    autoCommits: number;
    checkpoints: number;
    lastActivity: string;
  }> {
    const commits = Object.values(this.state.commits).filter(c => c.project_id === projectId);
    const branches = Object.values(this.state.branches).filter(b => b.project_id === projectId);
    const rollbackPoints = Object.values(this.state.rollback_points).filter(r => r.project_id === projectId);
    const project = this.state.projects[projectId];

    return {
      totalCommits: commits.length,
      totalBranches: branches.length,
      totalRollbackPoints: rollbackPoints.length,
      autoCommits: commits.filter(c => c.is_auto_commit).length,
      checkpoints: commits.filter(c => c.is_checkpoint).length,
      lastActivity: project?.last_activity || ''
    };
  }

  async getGlobalStatistics(): Promise<{
    totalProjects: number;
    activeProjects: number;
    totalCommits: number;
    totalBranches: number;
    totalRollbackPoints: number;
    autoCommits: number;
    checkpoints: number;
  }> {
    const projects = Object.values(this.state.projects);
    const commits = Object.values(this.state.commits);
    const branches = Object.values(this.state.branches);
    const rollbackPoints = Object.values(this.state.rollback_points);

    return {
      totalProjects: projects.length,
      activeProjects: projects.filter(p => p.status === 'active').length,
      totalCommits: commits.length,
      totalBranches: branches.length,
      totalRollbackPoints: rollbackPoints.length,
      autoCommits: commits.filter(c => c.is_auto_commit).length,
      checkpoints: commits.filter(c => c.is_checkpoint).length
    };
  }

  /**
   * Search and Query Methods
   */
  async searchCommits(query: string, projectId?: string): Promise<CommitRecord[]> {
    const commits = Object.values(this.state.commits).filter(c => {
      const matchesProject = !projectId || c.project_id === projectId;
      const matchesQuery = c.commit_message.toLowerCase().includes(query.toLowerCase()) ||
                          c.branch_name.toLowerCase().includes(query.toLowerCase());
      return matchesProject && matchesQuery;
    });

    return commits.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  async getRecentActivity(projectId: string, limit: number = 10): Promise<{
    type: 'commit' | 'branch' | 'rollback';
    data: CommitRecord | BranchRecord | RollbackPointRecord;
    timestamp: string;
  }[]> {
    const commits = Object.values(this.state.commits).filter(c => c.project_id === projectId);
    const branches = Object.values(this.state.branches).filter(b => b.project_id === projectId);
    const rollbackPoints = Object.values(this.state.rollback_points).filter(r => r.project_id === projectId);

    const activities = [
      ...commits.map(c => ({ type: 'commit' as const, data: c, timestamp: c.timestamp })),
      ...branches.map(b => ({ type: 'branch' as const, data: b, timestamp: b.created_at })),
      ...rollbackPoints.map(r => ({ type: 'rollback' as const, data: r, timestamp: r.created_at }))
    ];

    return activities
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  /**
   * Utility Methods
   */
  async exportData(): Promise<string> {
    await this.saveToStorage();
    return JSON.stringify(this.state, null, 2);
  }

  async importData(data: string): Promise<void> {
    try {
      const importedState = JSON.parse(data);
      this.state = { ...this.state, ...importedState };
      await this.saveToStorage();
      console.log('📥 Successfully imported database data');
    } catch (error) {
      console.error('❌ Failed to import database data:', error);
      throw error;
    }
  }

  async clearData(): Promise<void> {
    this.state = {
      projects: {},
      commits: {},
      branches: {},
      rollback_points: {},
      version: 1,
      last_backup: new Date().toISOString()
    };
    await this.saveToStorage();
    console.log('🗑️ Database cleared');
  }

  async vacuum(): Promise<void> {
    // Remove deleted projects and their associated data
    const deletedProjects = Object.values(this.state.projects)
      .filter(p => p.status === 'deleted')
      .map(p => p.id);

    for (const projectId of deletedProjects) {
      // Remove project
      delete this.state.projects[projectId];
      
      // Remove associated commits
      Object.keys(this.state.commits).forEach(commitId => {
        if (this.state.commits[commitId].project_id === projectId) {
          delete this.state.commits[commitId];
        }
      });

      // Remove associated branches
      Object.keys(this.state.branches).forEach(branchId => {
        if (this.state.branches[branchId].project_id === projectId) {
          delete this.state.branches[branchId];
        }
      });

      // Remove associated rollback points
      Object.keys(this.state.rollback_points).forEach(rollbackId => {
        if (this.state.rollback_points[rollbackId].project_id === projectId) {
          delete this.state.rollback_points[rollbackId];
        }
      });
    }

    await this.saveToStorage();
    console.log(`🧹 Database vacuum completed. Removed ${deletedProjects.length} deleted projects.`);
  }

  async healthCheck(): Promise<{ healthy: boolean; message: string }> {
    try {
      // Check if we can read/write to storage
      const testKey = 'kibitz-health-check';
      const testValue = Date.now().toString();
      
      this.storage.setItem(testKey, testValue);
      const retrieved = this.storage.getItem(testKey);
      this.storage.removeItem(testKey);
      
      if (retrieved !== testValue) {
        return { healthy: false, message: 'Storage read/write test failed' };
      }
      
      return { healthy: true, message: 'Database is healthy' };
    } catch (error) {
      return { 
        healthy: false, 
        message: `Database health check failed: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }
    this.isInitialized = false;
  }
}

// Convenience functions
export const getKibitzDatabase = (): KibitzDatabase => {
  return KibitzDatabase.getInstance();
};

export const initializeKibitzDatabase = async (): Promise<KibitzDatabase> => {
  const db = KibitzDatabase.getInstance();
  await db.initialize();
  return db;
}; 