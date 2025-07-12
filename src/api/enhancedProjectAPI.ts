/**
 * 🚀 Enhanced Project API - Git Snapshot & Reversion Feature v1.1
 * 
 * Extends the existing ProjectCheckpointAPI with:
 * - Auto-push functionality
 * - LLM-generated commit messages
 * - Enhanced snapshot management
 * - Chat UI integration
 */

import { ProjectCheckpointAPI, APIResponse, ProjectInitConfig } from './projectCheckpointAPI';
import { Project } from '../components/LlmChat/context/types';
import {
  SnapshotConfig,
  GitSnapshot,
  BranchInfo,
  createEnhancedSnapshot,
  getRecentSnapshots,
  getRecentBranches,
  quickRevertToSnapshot,
  generateCommitMessage
} from '../lib/gitSnapshotService';
import { ensureProjectDirectory } from '../lib/projectPathService';

/**
 * Enhanced Project API that wraps ProjectCheckpointAPI
 * with Git Snapshot & Reversion v1.1 features
 */
export class EnhancedProjectAPI {
  private project: Project;
  private serverId: string;
  private executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>;
  private baseAPI: ProjectCheckpointAPI;
  private snapshotConfig: SnapshotConfig;

  constructor(
    project: Project,
    serverId: string,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>,
    snapshotConfig?: Partial<SnapshotConfig>
  ) {
    this.project = project;
    this.serverId = serverId;
    this.executeTool = executeTool;
    this.baseAPI = new ProjectCheckpointAPI(project, serverId, executeTool);
    
    // Default snapshot configuration
    this.snapshotConfig = {
      autoPushEnabled: false,
      generateCommitMessages: true,
      llmProvider: 'anthropic',
      maxRecentSnapshots: 3,
      maxRecentBranches: 5,
      ...snapshotConfig
    };
  }

  // Delegate base API methods
  async analyzeProject() { return this.baseAPI.analyzeProject(); }
  async switchToBranch(branchName: string, createBackup: boolean = true) { return this.baseAPI.switchToBranch(branchName, createBackup); }
  async createCheckpoint(description?: string, branchType: 'feature' | 'bugfix' | 'experiment' | 'checkpoint' = 'checkpoint', force: boolean = false) { return this.baseAPI.createCheckpoint(description, branchType, force); }
  async listCheckpoints() { return this.baseAPI.listCheckpoints(); }
  async getProjectHealth() { return this.baseAPI.getProjectHealth(); }

  /**
   * 🌟 Enhanced project initialization with v1.1 features
   */
  static async initializeEnhancedProject(
    config: ProjectInitConfig & {
      snapshotConfig?: Partial<SnapshotConfig>;
    },
    serverId: string,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
  ): Promise<APIResponse<any>> {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(7);
    
    try {
      // First, use the existing ProjectCheckpointAPI to initialize
      const baseResult = await ProjectCheckpointAPI.initializeNewProject(
        config,
        serverId,
        executeTool
      );

      if (!baseResult.success) {
        return baseResult;
      }

      // Enhance with v1.1 features
      const enhancedData = {
        ...baseResult.data,
        snapshotConfig: {
          autoPushEnabled: config.snapshotConfig?.autoPushEnabled || false,
          generateCommitMessages: config.snapshotConfig?.generateCommitMessages !== false,
          llmProvider: config.snapshotConfig?.llmProvider || 'anthropic',
          maxRecentSnapshots: config.snapshotConfig?.maxRecentSnapshots || 3,
          maxRecentBranches: config.snapshotConfig?.maxRecentBranches || 5
        },
        features: [
          '🚀 Enhanced Git snapshots with auto-branch creation',
          '🔄 Quick revert functionality in chat UI',
          '🤖 LLM-generated commit messages',
          '☁️ Optional auto-push to remote',
          '📊 Recent snapshots and branches display'
        ]
      };

      // Add setup summary for v1.1 features
      enhancedData.setupSummary = [
        ...(enhancedData.setupSummary || []),
        '🌟 Git Snapshot & Reversion v1.1 features enabled',
        `🤖 LLM commit messages: ${enhancedData.snapshotConfig.generateCommitMessages ? 'enabled' : 'disabled'}`,
        `☁️ Auto-push: ${enhancedData.snapshotConfig.autoPushEnabled ? 'enabled' : 'disabled'}`
      ];

      return {
        ...baseResult,
        data: enhancedData,
        message: `Enhanced project ${config.projectName} initialized with Git Snapshot v1.1 features`
      };

    } catch (error) {
      console.error(`❌ [${requestId}] Enhanced project initialization failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
        requestId
      };
    }
  }

  /**
   * 📸 Create enhanced snapshot with v1.1 features
   */
  async createEnhancedSnapshot(
    description?: string,
    branchType: 'feature' | 'bugfix' | 'experiment' | 'checkpoint' = 'checkpoint',
    force: boolean = false
  ): Promise<APIResponse<GitSnapshot>> {
    try {
      const projectPath = await ensureProjectDirectory(this.project, this.serverId, this.executeTool);

      console.log(`📸 Creating enhanced snapshot for project: ${this.project.name}`);

      const result = await createEnhancedSnapshot(
        projectPath,
        this.project,
        this.serverId,
        this.executeTool,
        {
          description,
          branchType,
          config: this.snapshotConfig,
          force
        }
      );

      if (result.success && result.snapshot) {
        return {
          success: true,
          data: result.snapshot,
          message: `Enhanced snapshot created: ${result.snapshot.branchName}`,
          timestamp: new Date().toISOString()
        };
      } else {
        return {
          success: false,
          error: result.error || 'Failed to create enhanced snapshot',
          timestamp: new Date().toISOString()
        };
      }

    } catch (error) {
      console.error('Enhanced snapshot creation failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 📋 Get recent snapshots for chat UI
   */
  async getRecentSnapshotsForChat(): Promise<APIResponse<GitSnapshot[]>> {
    try {
      const projectPath = await ensureProjectDirectory(this.project, this.serverId, this.executeTool);

      const snapshots = await getRecentSnapshots(
        projectPath,
        this.serverId,
        this.executeTool,
        this.snapshotConfig.maxRecentSnapshots
      );

      return {
        success: true,
        data: snapshots,
        message: `Found ${snapshots.length} recent snapshots`,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Failed to get recent snapshots:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 🌿 Get recent branches for existing clones
   */
  async getRecentBranchesForClone(): Promise<APIResponse<BranchInfo[]>> {
    try {
      const projectPath = await ensureProjectDirectory(this.project, this.serverId, this.executeTool);

      const branches = await getRecentBranches(
        projectPath,
        this.serverId,
        this.executeTool,
        this.snapshotConfig.maxRecentBranches
      );

      return {
        success: true,
        data: branches,
        message: `Found ${branches.length} recent branches`,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Failed to get recent branches:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * ⏪ Quick revert to snapshot (enhanced)
   */
  async quickRevertToSnapshot(
    snapshot: GitSnapshot,
    createBackup: boolean = true
  ): Promise<APIResponse<{ backupBranch?: string; revertedTo: string }>> {
    try {
      const projectPath = await ensureProjectDirectory(this.project, this.serverId, this.executeTool);

      console.log(`⏪ Quick reverting to snapshot: ${snapshot.shortHash}`);

      const result = await quickRevertToSnapshot(
        projectPath,
        snapshot,
        this.serverId,
        this.executeTool,
        createBackup
      );

      if (result.success) {
        return {
          success: true,
          data: {
            backupBranch: result.backupBranch,
            revertedTo: snapshot.branchName
          },
          message: `Successfully reverted to snapshot ${snapshot.shortHash}${result.backupBranch ? ` (backup: ${result.backupBranch})` : ''}`,
          timestamp: new Date().toISOString()
        };
      } else {
        return {
          success: false,
          error: result.error || 'Failed to revert to snapshot',
          timestamp: new Date().toISOString()
        };
      }

    } catch (error) {
      console.error('Quick revert failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 🤖 Generate LLM commit message
   */
  async generateSmartCommitMessage(): Promise<APIResponse<string>> {
    try {
      const projectPath = await ensureProjectDirectory(this.project, this.serverId, this.executeTool);

      const message = await generateCommitMessage(
        projectPath,
        this.serverId,
        this.executeTool,
        this.snapshotConfig.llmProvider
      );

      return {
        success: true,
        data: message,
        message: 'Smart commit message generated',
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Failed to generate commit message:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * ⚙️ Update snapshot configuration
   */
  updateSnapshotConfig(updates: Partial<SnapshotConfig>): void {
    this.snapshotConfig = { ...this.snapshotConfig, ...updates };
  }

  /**
   * 📊 Get comprehensive project status with v1.1 features
   */
  async getEnhancedProjectStatus(): Promise<APIResponse<any>> {
    try {
      // Get base project health from parent class
      const baseHealth = await this.getProjectHealth();
      
      // Add v1.1 specific data
      const [recentSnapshots, recentBranches] = await Promise.all([
        this.getRecentSnapshotsForChat(),
        this.getRecentBranchesForClone()
      ]);

      const enhancedStatus = {
        ...baseHealth.data,
        snapshotConfig: this.snapshotConfig,
        recentSnapshots: recentSnapshots.data || [],
        recentBranches: recentBranches.data || [],
        v11Features: {
          autoPushEnabled: this.snapshotConfig.autoPushEnabled,
          llmCommitMessages: this.snapshotConfig.generateCommitMessages,
          chatUIIntegration: true,
          quickRevert: true
        }
      };

      return {
        success: true,
        data: enhancedStatus,
        message: 'Enhanced project status retrieved',
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Failed to get enhanced project status:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 🔄 Auto-snapshot trigger for significant changes
   */
  async triggerAutoSnapshotIfNeeded(
    operation: string,
    changeMetadata?: { filesChanged?: number; linesChanged?: number }
  ): Promise<GitSnapshot | null> {
    try {
      // Only create auto-snapshots for significant operations
      const significantOperations = [
        'major_code_change',
        'file_creation',
        'file_deletion',
        'dependency_update',
        'configuration_change',
        'large_refactor'
      ];

      if (!significantOperations.includes(operation)) {
        return null;
      }

      const result = await this.createEnhancedSnapshot(
        `Auto-snapshot: ${operation}`,
        'checkpoint',
        false // Don't force if no changes
      );

      return result.success ? result.data! : null;

    } catch (error) {
      console.error('Auto-snapshot trigger failed:', error);
      return null;
    }
  }
}

/**
 * Factory function to create enhanced project API instance
 */
export const createEnhancedProjectAPI = (
  project: Project,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>,
  snapshotConfig?: Partial<SnapshotConfig>
): EnhancedProjectAPI => {
  return new EnhancedProjectAPI(project, serverId, executeTool, snapshotConfig);
};

/**
 * Helper function to upgrade existing project to enhanced API
 * Note: This creates a new EnhancedProjectAPI instance that wraps the base functionality
 */
export const upgradeToEnhancedAPI = (
  project: Project,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>,
  snapshotConfig?: Partial<SnapshotConfig>
): EnhancedProjectAPI => {
  return new EnhancedProjectAPI(project, serverId, executeTool, snapshotConfig);
}; 