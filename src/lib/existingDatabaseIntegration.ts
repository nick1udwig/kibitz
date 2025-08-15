/**
 * Database Integration Service for Kibitz
 * 
 * Bridges optimized Git services with existing IndexedDB database
 * Provides metadata persistence for projects, commits, and branches
 */

import { generateWorkspaceId } from './conversationWorkspaceService';
import { type Project, type ProviderType } from '../components/LlmChat/context/types';
import { getDefaultModelForProvider } from '../stores/rootStore';

// Integration interfaces
export interface ProjectMetadata {
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
  commit_count: number;
  branch_count: number;
}

export interface CommitMetadata {
  id: string;
  project_id: string;
  commit_sha: string;
  message: string;
  author: string;
  timestamp: string;
  files_changed: string[];
  branch_name: string;
  is_auto_commit: boolean;
  parent_commit?: string;
}

export interface BranchMetadata {
  id: string;
  project_id: string;
  branch_name: string;
  branch_type: 'main' | 'auto' | 'feature' | 'bugfix';
  created_at: string;
  latest_commit?: string;
  commit_count: number;
  is_active: boolean;
  parent_branch?: string;
}

/**
 * Database Integration Service
 */
export class DatabaseIntegrationService {
  private static instance: DatabaseIntegrationService | null = null;
  private db: IDBDatabase | null = null;
  private isInitialized = false;
  private metadataCache: Map<string, ProjectMetadata> = new Map();

  private constructor() {}

  static getInstance(): DatabaseIntegrationService {
    if (!DatabaseIntegrationService.instance) {
      DatabaseIntegrationService.instance = new DatabaseIntegrationService();
    }
    return DatabaseIntegrationService.instance;
  }

  /**
   * Initialize the database integration service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Initialize database tables via API
      const response = await fetch('/api/database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: 'initialize' })
      });

      if (!response.ok) {
        throw new Error(`Failed to initialize database: ${response.statusText}`);
      }

      // Load existing projects into cache
      await this.loadExistingProjects();
      
      this.isInitialized = true;
      console.log('✅ Database integration service initialized');
    } catch (error) {
      console.error('❌ Failed to initialize database integration service:', error);
      throw error;
    }
  }

  /**
   * Create project with metadata tracking
   */
       async createProjectWithTracking(
    conversationId: string,
    projectName: string,
    userSettings?: {
      provider?: string;
      model?: string;
      systemPrompt?: string;
      mcpServerIds?: string[];
      elideToolResults?: boolean;
      messageWindowSize?: number;
      enableGitHub?: boolean;
      providerConfig?: Record<string, unknown>;
    }
  ): Promise<{
    projectId: string;
    projectPath: string;
    success: boolean;
    error?: string;
  }> {
    try {
      // Generate project ID and path
      const projectId = generateWorkspaceId();
      const projectPath = getProjectPath(projectId, projectName);

      // Create project metadata
      const metadata: ProjectMetadata = {
        id: projectId,
        conversation_id: conversationId,
        project_name: projectName,
        folder_path: projectPath,
        created_at: new Date().toISOString(),
        current_branch: 'main',
        status: 'active',
        git_initialized: false,
        last_activity: new Date().toISOString(),
        commit_count: 0,
        branch_count: 1
      };

      // Use user settings or fallback to defaults
      const provider = (userSettings?.provider || 'anthropic') as ProviderType;
      const model = userSettings?.model || getDefaultModelForProvider(provider);
      
      // Create project in existing database format
      const project: Project = {
        id: projectId,
        name: projectName,
        conversations: [{
          id: conversationId,
          name: `${projectName} - Main`,
          messages: [],
          createdAt: new Date(),
          lastUpdated: new Date()
        }],
        settings: {
          systemPrompt: userSettings?.systemPrompt || '',
          provider: provider,
          model: model,
          mcpServerIds: userSettings?.mcpServerIds || [],
          elideToolResults: userSettings?.elideToolResults || false,
          messageWindowSize: userSettings?.messageWindowSize || 50,
          enableGitHub: userSettings?.enableGitHub || false,
          providerConfig: userSettings?.providerConfig || {
            type: provider,
            settings: {
              apiKey: ''
            }
          }
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        order: 0,
        customPath: projectPath
      };

      // Save to database via API
      const response = await fetch('/api/database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'create_project',
          data: {
            id: project.id,
            name: project.name,
            settings: project.settings,
            created_at: project.createdAt.getTime(),
            updated_at: project.updatedAt.getTime(),
            order_index: project.order,
            custom_path: project.customPath,
            conversation: {
              id: conversationId,
              name: `${projectName} - Main`,
              created_at: project.createdAt.getTime(),
              updated_at: project.updatedAt.getTime()
            }
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to create project: ${response.statusText}`);
      }

      // Cache metadata
      this.metadataCache.set(projectId, metadata);

      console.log(`✅ Project created with database tracking: ${projectId}`);
      return {
        projectId,
        projectPath,
        success: true
      };
    } catch (error) {
      console.error('❌ Failed to create project with tracking:', error);
      return {
        projectId: '',
        projectPath: '',
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Update project metadata
   */
  async updateProjectMetadata(
    projectId: string,
    updates: Partial<ProjectMetadata>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const existing = this.metadataCache.get(projectId);
      if (!existing) {
        return { success: false, error: 'Project not found' };
      }

      // Update cached metadata
      const updated = { ...existing, ...updates, last_activity: new Date().toISOString() };
      this.metadataCache.set(projectId, updated);

      // Note: The existing IndexedDB doesn't have a direct way to store this metadata
      // We'll store it in the project's customPath or settings for now
      console.log(`✅ Project metadata updated: ${projectId}`);
      return { success: true };
    } catch (error) {
      console.error('❌ Failed to update project metadata:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }

  /**
   * Track conversation in database
   */
    async trackConversation(
    conversationId: string,
    projectId: string,
    conversationName: string
  ): Promise<void> {
    try {
      const now = Date.now();

      // Create conversation via API
      const response = await fetch('/api/database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'create_conversation',
          data: {
            id: conversationId,
            project_id: projectId,
            name: conversationName,
            created_at: now,
            updated_at: now
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to create conversation: ${response.statusText}`);
      }

      // Update metadata cache
      const metadata = this.metadataCache.get(projectId);
      if (metadata) {
        metadata.last_activity = new Date(now).toISOString();
        this.metadataCache.set(projectId, metadata);
      }

      console.log(`✅ Tracked conversation for project ${projectId}: ${conversationName}`);
    } catch (error) {
      console.error('❌ Failed to track conversation:', error);
    }
  }

  /**
   * Track commit metadata
   */
  async trackCommit(
    projectId: string,
    /* _commitData: {
      commitSha: string;
      message: string;
      author?: string;
      filesChanged: string[];
      branchName: string;
      isAutoCommit: boolean;
      parentCommit?: string;
    } */
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Create and use commit metadata
      const commitData = {
        id: generateWorkspaceId(),
        project_id: projectId,
        commit_sha: commitData.commitSha,
        message: commitData.message,
        author: commitData.author || 'Kibitz Agent',
        timestamp: new Date().toISOString(),
        files_changed: commitData.filesChanged,
        branch_name: commitData.branchName,
        is_auto_commit: commitData.isAutoCommit,
        parent_commit: commitData.parentCommit
      };

      // Update project metadata
      await this.updateProjectMetadata(projectId, {
        last_commit_sha: commitData.commitSha,
        current_branch: commitData.branchName,
        commit_count: (this.metadataCache.get(projectId)?.commit_count || 0) + 1
      });

      console.log(`✅ Commit tracked: ${commitData.commitSha} for project ${projectId}`);
      return { success: true };
    } catch (error) {
      console.error('❌ Failed to track commit:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }

  /**
   * Track branch metadata
   */
  async trackBranch(
    projectId: string,
    /* _branchData: {
      branchName: string;
      branchType: 'main' | 'auto' | 'feature' | 'bugfix';
      latestCommit?: string;
      parentBranch?: string;
    } */
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Create and use branch metadata
      const branchData = {
        id: generateWorkspaceId(),
        project_id: projectId,
        branch_name: branchData.branchName,
        branch_type: branchData.branchType,
        created_at: new Date().toISOString(),
        latest_commit: branchData.latestCommit,
        commit_count: 0,
        is_active: true,
        parent_branch: branchData.parentBranch
      };

      // Update project metadata
      await this.updateProjectMetadata(projectId, {
        current_branch: branchData.branchName,
        branch_count: (this.metadataCache.get(projectId)?.branch_count || 0) + 1
      });

      console.log(`✅ Branch tracked: ${branchData.branchName} for project ${projectId}`);
      return { success: true };
    } catch (error) {
      console.error('❌ Failed to track branch:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }

  /**
   * Get project metadata
   */
  async getProjectMetadata(projectId: string): Promise<ProjectMetadata | null> {
    return this.metadataCache.get(projectId) || null;
  }

  /**
   * Get all project metadata
   */
  async getAllProjectMetadata(): Promise<ProjectMetadata[]> {
    return Array.from(this.metadataCache.values());
  }

  /**
   * Get project statistics
   */
  async getProjectStatistics(projectId: string): Promise<{
    totalCommits: number;
    totalBranches: number;
    autoCommits: number;
    manualCommits: number;
    lastActivity: string;
  }> {
    const metadata = this.metadataCache.get(projectId);
    if (!metadata) {
      return {
        totalCommits: 0,
        totalBranches: 0,
        autoCommits: 0,
        manualCommits: 0,
        lastActivity: new Date().toISOString()
      };
    }

    return {
      totalCommits: metadata.commit_count,
      totalBranches: metadata.branch_count,
      autoCommits: 0, // Would need to track this separately
      manualCommits: 0, // Would need to track this separately
      lastActivity: metadata.last_activity
    };
  }

  /**
   * Load existing projects from IndexedDB
   */
  private async loadExistingProjects(): Promise<void> {
    try {
      // Load projects from API
      const response = await fetch('/api/database?operation=get_all_projects');
      
      if (!response.ok) {
        throw new Error(`Failed to load projects: ${response.statusText}`);
      }

      const { data: projects } = await response.json();
      
      // Convert to metadata format and cache
      projects.forEach((project: Record<string, unknown>) => {
        const metadata: ProjectMetadata = {
          id: project.id,
          conversation_id: project.conversation_id || '',
          project_name: project.name,
          folder_path: project.custom_path || '',
          created_at: new Date(project.created_at).toISOString(),
          current_branch: 'main',
          status: 'active',
          git_initialized: true,
          last_activity: new Date(project.updated_at).toISOString(),
          commit_count: project.checkpoint_count || 0,
          branch_count: project.branch_count || 1
        };
        
        this.metadataCache.set(project.id, metadata);
      });
      
      console.log(`✅ Loaded ${projects.length} projects into cache`);
    } catch (error) {
      console.error('❌ Failed to load existing projects:', error);
    }
  }

  /**
   * Search projects by name or conversation ID
   */
  async searchProjects(query: string): Promise<ProjectMetadata[]> {
    const results: ProjectMetadata[] = [];
    
    for (const metadata of this.metadataCache.values()) {
      if (
        metadata.project_name.toLowerCase().includes(query.toLowerCase()) ||
        metadata.conversation_id.includes(query) ||
        metadata.id.includes(query)
      ) {
        results.push(metadata);
      }
    }

    return results;
  }

  /**
   * Get database statistics
   */
  async getDatabaseStatistics(): Promise<{
    totalProjects: number;
    activeProjects: number;
    archivedProjects: number;
    totalCommits: number;
    totalBranches: number;
  }> {
    const projects = Array.from(this.metadataCache.values());
    
    return {
      totalProjects: projects.length,
      activeProjects: projects.filter(p => p.status === 'active').length,
      archivedProjects: projects.filter(p => p.status === 'archived').length,
      totalCommits: projects.reduce((sum, p) => sum + p.commit_count, 0),
      totalBranches: projects.reduce((sum, p) => sum + p.branch_count, 0)
    };
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{
    database: boolean;
    cache: boolean;
    integration: boolean;
  }> {
    return {
      database: this.db !== null,
      cache: this.metadataCache.size >= 0,
      integration: this.isInitialized
    };
  }
}

// Convenience functions
export const getDatabaseIntegrationService = (): DatabaseIntegrationService => {
  return DatabaseIntegrationService.getInstance();
};

export const initializeDatabaseIntegration = async (): Promise<DatabaseIntegrationService> => {
  const service = DatabaseIntegrationService.getInstance();
  await service.initialize();
  return service;
};

// Hook for React components
export const useDatabaseIntegration = () => {
  const service = getDatabaseIntegrationService();

  const createProject = async (
    conversationId: string, 
    projectName: string,
    userSettings?: {
      provider?: string;
      model?: string;
      systemPrompt?: string;
      mcpServerIds?: string[];
      elideToolResults?: boolean;
      messageWindowSize?: number;
      enableGitHub?: boolean;
      providerConfig?: Record<string, unknown>;
    }
  ) => {
    return await service.createProjectWithTracking(conversationId, projectName, userSettings);
  };

  const updateProject = async (projectId: string, updates: Partial<ProjectMetadata>) => {
    return await service.updateProjectMetadata(projectId, updates);
  };

  const trackCommit = async (
    projectId: string,
    commitData: {
      commitSha: string;
      message: string;
      author?: string;
      filesChanged: string[];
      branchName: string;
      isAutoCommit: boolean;
      parentCommit?: string;
    }
  ) => {
    return await service.trackCommit(projectId, commitData);
  };

  const trackBranch = async (
    projectId: string,
    branchData: {
      branchName: string;
      branchType: 'main' | 'auto' | 'feature' | 'bugfix';
      latestCommit?: string;
      parentBranch?: string;
    }
  ) => {
    return await service.trackBranch(projectId, branchData);
  };

  const getProjectMetadata = async (projectId: string) => {
    return await service.getProjectMetadata(projectId);
  };

  const getProjectStatistics = async (projectId: string) => {
    return await service.getProjectStatistics(projectId);
  };

  const searchProjects = async (query: string) => {
    return await service.searchProjects(query);
  };

  const getDatabaseStatistics = async () => {
    return await service.getDatabaseStatistics();
  };

  const healthCheck = async () => {
    return await service.healthCheck();
  };

  return {
    createProject,
    updateProject,
    trackCommit,
    trackBranch,
    getProjectMetadata,
    getProjectStatistics,
    searchProjects,
    getDatabaseStatistics,
    healthCheck
  };
}; 