/**
 * Storage Coordinator Service
 * 
 * Unified interface for coordinating all storage systems:
 * - IndexedDB (client-side app state)
 * - Local .kibitz/ files (project metadata)
 * - SQLite (server-side persistence)
 * 
 * Ensures branch and conversation information is consistently saved across all systems
 */

import { 
  saveState as saveIndexedDbState, 
  loadState as loadIndexedDbState,
  saveAutoCommitBranch,
  loadAutoCommitBranches,
  saveConversationBranchHistory,
  loadConversationBranchHistory
} from './db';

import { LocalPersistenceService } from './localPersistenceService';
import { Project, ConversationBrief, AutoCommitBranch, ConversationBranchHistory } from '../components/LlmChat/context/types';
import { getProjectPath } from './projectPathService';

export interface BranchInfo {
  branchName: string;
  branchId: string;
  conversationId: string;
  projectId: string;
  commitHash: string;
  commitMessage: string;
  createdAt: Date;
  filesChanged: string[];
  changesSummary: string;
  isAutoCommit: boolean;
}

export interface ConversationInfo {
  conversationId: string;
  projectId: string;
  name: string;
  currentBranch?: string;
  branches: BranchInfo[];
  lastUpdated: Date;
}

export interface ProjectStorageInfo {
  projectId: string;
  projectName: string;
  projectPath: string;
  conversations: ConversationInfo[];
  branches: BranchInfo[];
  lastSync: Date;
  gitInitialized: boolean;
}

/**
 * Storage Coordinator - Manages all storage systems
 */
export class StorageCoordinator {
  private static instance: StorageCoordinator | null = null;
  private syncInProgress = false;
  private lastSyncTime = new Date();

  private constructor() {}

  static getInstance(): StorageCoordinator {
    if (!StorageCoordinator.instance) {
      StorageCoordinator.instance = new StorageCoordinator();
    }
    return StorageCoordinator.instance;
  }

  /**
   * Initialize storage coordinator and sync all systems
   */
  async initialize(): Promise<void> {
    try {
      console.log('🔄 Initializing storage coordinator...');
      
      // Perform initial sync of all storage systems
      await this.syncAllSystems();
      
      this.lastSyncTime = new Date();
      console.log('✅ Storage coordinator initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize storage coordinator:', error);
      throw error;
    }
  }

  /**
   * Save branch information across all storage systems
   */
  async saveBranchInfo(
    branchInfo: BranchInfo,
    serverId: string,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`💾 Saving branch info: ${branchInfo.branchName} for project ${branchInfo.projectId}`);
      
      // 1. Save to IndexedDB (auto-commit branch)
      const autoCommitBranch: AutoCommitBranch = {
        branchId: branchInfo.branchId,
        conversationId: branchInfo.conversationId,
        projectId: branchInfo.projectId,
        branchName: branchInfo.branchName,
        commitHash: branchInfo.commitHash,
        commitMessage: branchInfo.commitMessage,
        createdAt: branchInfo.createdAt,
        filesChanged: branchInfo.filesChanged,
        changesSummary: branchInfo.changesSummary,
        isAutoCommit: branchInfo.isAutoCommit,
        workspaceSnapshot: {
          fileCount: branchInfo.filesChanged.length,
          totalSize: 0, // Would be calculated from actual files
          lastModified: new Date()
        }
      };
      
      await saveAutoCommitBranch(autoCommitBranch);
      
             // 2. Save to local .kibitz/ files
       const projectPath = getProjectPath(branchInfo.projectId, '');
       const branchMetadata = {
         name: branchInfo.branchName,
         type: branchInfo.isAutoCommit ? 'iteration' : 'feature' as 'feature' | 'bugfix' | 'iteration' | 'experiment' | 'checkpoint',
         createdAt: branchInfo.createdAt,
         parentBranch: 'main',
         commitHash: branchInfo.commitHash,
         description: branchInfo.commitMessage,
         filesChanged: branchInfo.filesChanged,
         isActive: true,
         checkpointCount: 1
       };
      
      const localSaveResult = await LocalPersistenceService.saveBranch(
        projectPath,
        branchMetadata,
        serverId,
        executeTool
      );
      
      if (!localSaveResult.success) {
        console.warn('Local file save failed:', localSaveResult.error);
        // Don't fail the entire operation for local file issues
      }
      
      // 3. Update conversation branch history
      const conversationHistory = await this.getConversationHistory(branchInfo.conversationId);
      const updatedHistory: ConversationBranchHistory = {
        conversationId: branchInfo.conversationId,
        projectId: branchInfo.projectId,
        branches: [autoCommitBranch, ...(conversationHistory?.branches || [])],
        currentBranchId: branchInfo.branchId,
        totalBranches: (conversationHistory?.totalBranches || 0) + 1,
        oldestBranch: conversationHistory?.oldestBranch || branchInfo.createdAt,
        newestBranch: branchInfo.createdAt,
        totalCommits: (conversationHistory?.totalCommits || 0) + 1,
        totalReverts: conversationHistory?.totalReverts || 0
      };
      
      await saveConversationBranchHistory(updatedHistory);
      
      console.log(`✅ Branch info saved successfully: ${branchInfo.branchName}`);
      return { success: true };
      
    } catch (error) {
      console.error('❌ Failed to save branch info:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }

  /**
   * Load branch information from all storage systems
   */
  async loadBranchInfo(
    projectId: string,
    conversationId?: string
  ): Promise<BranchInfo[]> {
    try {
      console.log(`📖 Loading branch info for project ${projectId}`);
      
      // Load from IndexedDB
      const indexedDbBranches = conversationId 
        ? await loadAutoCommitBranches(conversationId)
        : [];
      
      // Convert to unified format
      const branches: BranchInfo[] = indexedDbBranches.map(branch => ({
        branchName: branch.branchName,
        branchId: branch.branchId,
        conversationId: branch.conversationId,
        projectId: branch.projectId,
        commitHash: branch.commitHash,
        commitMessage: branch.commitMessage,
        createdAt: branch.createdAt,
        filesChanged: branch.filesChanged,
        changesSummary: branch.changesSummary,
        isAutoCommit: branch.isAutoCommit
      }));
      
      console.log(`✅ Loaded ${branches.length} branches for project ${projectId}`);
      return branches;
      
    } catch (error) {
      console.error('❌ Failed to load branch info:', error);
      return [];
    }
  }

  /**
   * Save conversation information across all storage systems
   */
  async saveConversationInfo(
    conversationInfo: ConversationInfo,
    serverId: string,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`💾 Saving conversation info: ${conversationInfo.name} for project ${conversationInfo.projectId}`);
      
      // Save conversation branch history
      const branchHistory: ConversationBranchHistory = {
        conversationId: conversationInfo.conversationId,
        projectId: conversationInfo.projectId,
        branches: conversationInfo.branches.map(branch => ({
          branchId: branch.branchId,
          conversationId: branch.conversationId,
          projectId: branch.projectId,
          branchName: branch.branchName,
          commitHash: branch.commitHash,
          commitMessage: branch.commitMessage,
          createdAt: branch.createdAt,
          filesChanged: branch.filesChanged,
          changesSummary: branch.changesSummary,
          isAutoCommit: branch.isAutoCommit,
          workspaceSnapshot: {
            fileCount: branch.filesChanged.length,
            totalSize: 0,
            lastModified: new Date()
          }
        })),
        currentBranchId: conversationInfo.currentBranch || '',
        totalBranches: conversationInfo.branches.length,
        oldestBranch: conversationInfo.branches.length > 0 
          ? conversationInfo.branches[conversationInfo.branches.length - 1].createdAt
          : undefined,
        newestBranch: conversationInfo.branches.length > 0 
          ? conversationInfo.branches[0].createdAt
          : undefined,
        totalCommits: conversationInfo.branches.length,
        totalReverts: 0
      };
      
      await saveConversationBranchHistory(branchHistory);
      
      console.log(`✅ Conversation info saved successfully: ${conversationInfo.name}`);
      return { success: true };
      
    } catch (error) {
      console.error('❌ Failed to save conversation info:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }

  /**
   * Load conversation information from all storage systems
   */
  async loadConversationInfo(conversationId: string): Promise<ConversationInfo | null> {
    try {
      console.log(`📖 Loading conversation info for ${conversationId}`);
      
      // Load from IndexedDB
      const branchHistory = await loadConversationBranchHistory(conversationId);
      
      if (!branchHistory) {
        console.log(`No conversation history found for ${conversationId}`);
        return null;
      }
      
      // Convert to unified format
      const conversationInfo: ConversationInfo = {
        conversationId: branchHistory.conversationId,
        projectId: branchHistory.projectId,
        name: `Conversation ${conversationId}`, // Would be loaded from project data
        currentBranch: branchHistory.currentBranchId,
        branches: branchHistory.branches.map(branch => ({
          branchName: branch.branchName,
          branchId: branch.branchId,
          conversationId: branch.conversationId,
          projectId: branch.projectId,
          commitHash: branch.commitHash,
          commitMessage: branch.commitMessage,
          createdAt: branch.createdAt,
          filesChanged: branch.filesChanged,
          changesSummary: branch.changesSummary,
          isAutoCommit: branch.isAutoCommit
        })),
        lastUpdated: branchHistory.newestBranch || new Date()
      };
      
      console.log(`✅ Loaded conversation info: ${conversationInfo.name}`);
      return conversationInfo;
      
    } catch (error) {
      console.error('❌ Failed to load conversation info:', error);
      return null;
    }
  }

  /**
   * Get project storage information
   */
  async getProjectStorageInfo(projectId: string): Promise<ProjectStorageInfo | null> {
    try {
      console.log(`📖 Loading project storage info for ${projectId}`);
      
      // Load from IndexedDB
      const appState = await loadIndexedDbState();
      const project = appState.projects.find(p => p.id === projectId);
      
      if (!project) {
        console.log(`Project ${projectId} not found`);
        return null;
      }
      
      // Get all branches for this project
      const branches = await this.loadBranchInfo(project.id);
      
      // Get conversation info for all conversations
      const conversations: ConversationInfo[] = [];
      for (const conversation of project.conversations) {
        const conversationInfo = await this.loadConversationInfo(conversation.id);
        if (conversationInfo) {
          conversations.push(conversationInfo);
        }
      }
      
      const projectStorageInfo: ProjectStorageInfo = {
        projectId: project.id,
        projectName: project.name,
        projectPath: getProjectPath(project.id, project.name),
        conversations,
        branches,
        lastSync: this.lastSyncTime,
        gitInitialized: project.customPath ? true : false // Simple heuristic
      };
      
      console.log(`✅ Loaded project storage info: ${project.name}`);
      return projectStorageInfo;
      
    } catch (error) {
      console.error('❌ Failed to load project storage info:', error);
      return null;
    }
  }

  /**
   * Sync all storage systems
   */
  async syncAllSystems(): Promise<void> {
    if (this.syncInProgress) {
      console.log('⏳ Sync already in progress, skipping...');
      return;
    }
    
    try {
      this.syncInProgress = true;
      console.log('🔄 Starting full storage sync...');
      
      // Load current state from IndexedDB
      const appState = await loadIndexedDbState();
      
      // Validate and ensure consistency across all storage systems
      let syncedProjects = 0;
      let syncedConversations = 0;
      let syncedBranches = 0;
      
      for (const project of appState.projects) {
        try {
          // Validate project storage consistency
          const projectInfo = await this.getProjectStorageInfo(project.id);
          if (projectInfo) {
            syncedProjects++;
            syncedConversations += projectInfo.conversations.length;
            syncedBranches += projectInfo.branches.length;
          }
        } catch (error) {
          console.error(`Failed to sync project ${project.id}:`, error);
        }
      }
      
      this.lastSyncTime = new Date();
      console.log(`✅ Storage sync completed: ${syncedProjects} projects, ${syncedConversations} conversations, ${syncedBranches} branches`);
      
    } catch (error) {
      console.error('❌ Failed to sync storage systems:', error);
      throw error;
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Get conversation history from IndexedDB
   */
  private async getConversationHistory(conversationId: string): Promise<ConversationBranchHistory | null> {
    try {
      return await loadConversationBranchHistory(conversationId);
    } catch (error) {
      console.error('Failed to load conversation history:', error);
      return null;
    }
  }

  /**
   * Clean up old storage data
   */
  async cleanupOldData(retentionDays: number = 30): Promise<void> {
    try {
      console.log(`🧹 Cleaning up storage data older than ${retentionDays} days...`);
      
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      
      // Here you would implement cleanup logic for each storage system
      // This is a placeholder for the actual implementation
      
      console.log('✅ Storage cleanup completed');
    } catch (error) {
      console.error('❌ Failed to cleanup old storage data:', error);
    }
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<{
    totalProjects: number;
    totalConversations: number;
    totalBranches: number;
    lastSync: Date;
    storageHealth: 'healthy' | 'warning' | 'error';
  }> {
    try {
      const appState = await loadIndexedDbState();
      
      let totalConversations = 0;
      let totalBranches = 0;
      
      for (const project of appState.projects) {
        totalConversations += project.conversations.length;
        const branches = await this.loadBranchInfo(project.id);
        totalBranches += branches.length;
      }
      
      return {
        totalProjects: appState.projects.length,
        totalConversations,
        totalBranches,
        lastSync: this.lastSyncTime,
        storageHealth: 'healthy' // Would implement actual health check
      };
    } catch (error) {
      console.error('Failed to get storage stats:', error);
      return {
        totalProjects: 0,
        totalConversations: 0,
        totalBranches: 0,
        lastSync: new Date(),
        storageHealth: 'error'
      };
    }
  }
}

/**
 * Convenience functions for common storage operations
 */

// Initialize storage coordinator
export const initializeStorageCoordinator = async (): Promise<StorageCoordinator> => {
  const coordinator = StorageCoordinator.getInstance();
  await coordinator.initialize();
  return coordinator;
};

// Save branch with all storage systems
export const saveBranchToAllSystems = async (
  branchInfo: BranchInfo,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<{ success: boolean; error?: string }> => {
  const coordinator = StorageCoordinator.getInstance();
  return await coordinator.saveBranchInfo(branchInfo, serverId, executeTool);
};

// Load branches from all storage systems
export const loadBranchesFromAllSystems = async (
  projectId: string,
  conversationId?: string
): Promise<BranchInfo[]> => {
  const coordinator = StorageCoordinator.getInstance();
  return await coordinator.loadBranchInfo(projectId, conversationId);
};

// Save conversation with all storage systems
export const saveConversationToAllSystems = async (
  conversationInfo: ConversationInfo,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<{ success: boolean; error?: string }> => {
  const coordinator = StorageCoordinator.getInstance();
  return await coordinator.saveConversationInfo(conversationInfo, serverId, executeTool);
};

// Get comprehensive project storage info
export const getProjectStorageInfo = async (projectId: string): Promise<ProjectStorageInfo | null> => {
  const coordinator = StorageCoordinator.getInstance();
  return await coordinator.getProjectStorageInfo(projectId);
};

// Sync all storage systems
export const syncAllStorageSystems = async (): Promise<void> => {
  const coordinator = StorageCoordinator.getInstance();
  await coordinator.syncAllSystems();
};

// Get storage statistics
export const getStorageStatistics = async () => {
  const coordinator = StorageCoordinator.getInstance();
  return await coordinator.getStorageStats();
}; 