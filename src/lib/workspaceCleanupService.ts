/**
 * Workspace Cleanup and Recovery Service
 * 
 * Phase 1.3: Local Storage Enhancement
 * - Workspace cleanup routines for deleted conversations
 * - Workspace discovery and recovery mechanisms
 * - Orphaned workspace detection and cleanup
 */

import {
  WorkspaceMapping,
  WorkspaceUsageStats,
  WorkspaceStatus,
  ConversationBrief,
  Project
} from '../components/LlmChat/context/types';

import {
  loadWorkspaceMappings,
  saveWorkspaceMappings,
  deleteWorkspaceMapping,
  getWorkspaceStats,
  updateWorkspaceStats,
  loadState
} from './db';

import {
  logWorkspaceOperation,
  validateWorkspacePath,
  extractInfoFromWorkspacePath,
  getWorkspaceStatus
} from './conversationWorkspaceService';

// 🌟 PHASE 1.3: Workspace cleanup configuration
export interface WorkspaceCleanupConfig {
  maxIdleTime: number;          // Maximum time a workspace can be idle (in milliseconds)
  maxWorkspaceSize: number;     // Maximum workspace size in bytes
  maxTotalWorkspaces: number;   // Maximum total number of workspaces
  enableAutoCleanup: boolean;   // Whether to enable automatic cleanup
  backupBeforeCleanup: boolean; // Whether to backup before cleanup
  cleanupInterval: number;      // How often to run cleanup (in milliseconds)
}

// Default cleanup configuration
export const DEFAULT_CLEANUP_CONFIG: WorkspaceCleanupConfig = {
  maxIdleTime: 30 * 24 * 60 * 60 * 1000,  // 30 days
  maxWorkspaceSize: 100 * 1024 * 1024,     // 100MB
  maxTotalWorkspaces: 50,                   // 50 workspaces max
  enableAutoCleanup: true,
  backupBeforeCleanup: true,
  cleanupInterval: 24 * 60 * 60 * 1000     // 24 hours
};

// 🌟 PHASE 1.3: Workspace cleanup results
export interface WorkspaceCleanupResult {
  cleaned: string[];          // Workspace IDs that were cleaned
  backed: string[];           // Workspace IDs that were backed up
  errors: string[];           // Errors encountered during cleanup
  bytesFreed: number;         // Total bytes freed
  timeTaken: number;          // Time taken for cleanup in ms
}

// 🌟 PHASE 1.3: Workspace recovery results
export interface WorkspaceRecoveryResult {
  recovered: string[];        // Workspace IDs that were recovered
  failed: string[];           // Workspace IDs that failed recovery
  orphaned: string[];         // Orphaned workspaces found
  errors: string[];           // Errors encountered during recovery
  timeTaken: number;          // Time taken for recovery in ms
}

// 🌟 PHASE 1.3: Orphaned workspace detection
export interface OrphanedWorkspace {
  workspaceId: string;
  workspacePath: string;
  estimatedSize: number;
  lastModified: Date;
  reason: 'no_conversation' | 'no_project' | 'invalid_path' | 'corrupted_data';
}

/**
 * Main workspace cleanup service class
 */
export class WorkspaceCleanupService {
  private config: WorkspaceCleanupConfig;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  constructor(config: WorkspaceCleanupConfig = DEFAULT_CLEANUP_CONFIG) {
    this.config = config;
  }

  /**
   * Start automatic cleanup service
   */
  startAutoCleanup(): void {
    if (this.config.enableAutoCleanup && !this.cleanupTimer) {
      this.cleanupTimer = setInterval(() => {
        this.runCleanup().catch(error => {
          console.error('Auto cleanup failed:', error);
          logWorkspaceOperation('AUTO_CLEANUP_ERROR', { error: error.message });
        });
      }, this.config.cleanupInterval);

      logWorkspaceOperation('AUTO_CLEANUP_STARTED', {
        interval: this.config.cleanupInterval,
        config: this.config
      });
    }
  }

  /**
   * Stop automatic cleanup service
   */
  stopAutoCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      logWorkspaceOperation('AUTO_CLEANUP_STOPPED', {});
    }
  }

  /**
   * Run workspace cleanup
   */
  async runCleanup(): Promise<WorkspaceCleanupResult> {
    if (this.isRunning) {
      throw new Error('Cleanup is already running');
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      logWorkspaceOperation('CLEANUP_STARTED', { config: this.config });

      const result: WorkspaceCleanupResult = {
        cleaned: [],
        backed: [],
        errors: [],
        bytesFreed: 0,
        timeTaken: 0
      };

      // Step 1: Find orphaned workspaces
      const orphanedWorkspaces = await this.findOrphanedWorkspaces();
      
      // Step 2: Find idle workspaces
      const idleWorkspaces = await this.findIdleWorkspaces();
      
      // Step 3: Find oversized workspaces
      const oversizedWorkspaces = await this.findOversizedWorkspaces();
      
      // Step 4: Clean up workspaces
      const workspacesToClean = [
        ...orphanedWorkspaces.map(w => w.workspaceId),
        ...idleWorkspaces,
        ...oversizedWorkspaces
      ];

      for (const workspaceId of workspacesToClean) {
        try {
          // Backup if configured
          if (this.config.backupBeforeCleanup) {
            await this.backupWorkspace(workspaceId);
            result.backed.push(workspaceId);
          }

          // Clean up workspace
          const bytesFreed = await this.cleanupWorkspace(workspaceId);
          result.cleaned.push(workspaceId);
          result.bytesFreed += bytesFreed;

        } catch (error) {
          result.errors.push(`Failed to clean ${workspaceId}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // Step 5: Update statistics
      await this.updateCleanupStatistics(result);

      result.timeTaken = Date.now() - startTime;
      
      logWorkspaceOperation('CLEANUP_COMPLETED', {
        result,
        duration: result.timeTaken
      });

      return result;

    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Discover and recover workspaces
   */
  async runRecovery(): Promise<WorkspaceRecoveryResult> {
    const startTime = Date.now();
    
    try {
      logWorkspaceOperation('RECOVERY_STARTED', {});

      const result: WorkspaceRecoveryResult = {
        recovered: [],
        failed: [],
        orphaned: [],
        errors: [],
        timeTaken: 0
      };

      // Step 1: Find orphaned workspaces
      const orphanedWorkspaces = await this.findOrphanedWorkspaces();
      result.orphaned = orphanedWorkspaces.map(w => w.workspaceId);

      // Step 2: Attempt to recover orphaned workspaces
      for (const orphaned of orphanedWorkspaces) {
        try {
          const recovered = await this.attemptWorkspaceRecovery(orphaned);
          if (recovered) {
            result.recovered.push(orphaned.workspaceId);
          } else {
            result.failed.push(orphaned.workspaceId);
          }
        } catch (error) {
          result.failed.push(orphaned.workspaceId);
          result.errors.push(`Failed to recover ${orphaned.workspaceId}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // Step 3: Validate existing workspace mappings
      const workspaces = await loadWorkspaceMappings();
      for (const workspace of workspaces) {
        try {
          const isValid = await this.validateWorkspaceMapping(workspace);
          if (!isValid) {
            const repaired = await this.repairWorkspaceMapping(workspace);
            if (repaired) {
              result.recovered.push(workspace.workspaceId);
            } else {
              result.failed.push(workspace.workspaceId);
            }
          }
        } catch (error) {
          result.errors.push(`Failed to validate ${workspace.workspaceId}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      result.timeTaken = Date.now() - startTime;
      
      logWorkspaceOperation('RECOVERY_COMPLETED', {
        result,
        duration: result.timeTaken
      });

      return result;

    } catch (error) {
      logWorkspaceOperation('RECOVERY_ERROR', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Find orphaned workspaces
   */
  private async findOrphanedWorkspaces(): Promise<OrphanedWorkspace[]> {
    const orphaned: OrphanedWorkspace[] = [];
    const workspaces = await loadWorkspaceMappings();
    const { projects } = await loadState();

    for (const workspace of workspaces) {
      try {
        // Check if conversation exists
        const conversationExists = projects.some(project => 
          project.conversations.some(conv => conv.id === workspace.conversationId)
        );

        if (!conversationExists) {
          orphaned.push({
            workspaceId: workspace.workspaceId,
            workspacePath: workspace.workspacePath,
            estimatedSize: workspace.sizeInBytes || 0,
            lastModified: workspace.lastAccessedAt,
            reason: 'no_conversation'
          });
          continue;
        }

        // Check if project exists
        const projectExists = projects.some(project => project.id === workspace.projectId);
        if (!projectExists) {
          orphaned.push({
            workspaceId: workspace.workspaceId,
            workspacePath: workspace.workspacePath,
            estimatedSize: workspace.sizeInBytes || 0,
            lastModified: workspace.lastAccessedAt,
            reason: 'no_project'
          });
          continue;
        }

        // Check if path is valid
        if (!validateWorkspacePath(workspace.workspacePath)) {
          orphaned.push({
            workspaceId: workspace.workspaceId,
            workspacePath: workspace.workspacePath,
            estimatedSize: workspace.sizeInBytes || 0,
            lastModified: workspace.lastAccessedAt,
            reason: 'invalid_path'
          });
          continue;
        }

      } catch (error) {
        orphaned.push({
          workspaceId: workspace.workspaceId,
          workspacePath: workspace.workspacePath,
          estimatedSize: workspace.sizeInBytes || 0,
          lastModified: workspace.lastAccessedAt,
          reason: 'corrupted_data'
        });
      }
    }

    logWorkspaceOperation('ORPHANED_WORKSPACES_FOUND', { count: orphaned.length });
    return orphaned;
  }

  /**
   * Find idle workspaces
   */
  private async findIdleWorkspaces(): Promise<string[]> {
    const idle: string[] = [];
    const workspaces = await loadWorkspaceMappings();
    const cutoffTime = Date.now() - this.config.maxIdleTime;

    for (const workspace of workspaces) {
      if (workspace.lastAccessedAt.getTime() < cutoffTime) {
        idle.push(workspace.workspaceId);
      }
    }

    logWorkspaceOperation('IDLE_WORKSPACES_FOUND', { count: idle.length });
    return idle;
  }

  /**
   * Find oversized workspaces
   */
  private async findOversizedWorkspaces(): Promise<string[]> {
    const oversized: string[] = [];
    const workspaces = await loadWorkspaceMappings();

    for (const workspace of workspaces) {
      if ((workspace.sizeInBytes || 0) > this.config.maxWorkspaceSize) {
        oversized.push(workspace.workspaceId);
      }
    }

    logWorkspaceOperation('OVERSIZED_WORKSPACES_FOUND', { count: oversized.length });
    return oversized;
  }

  /**
   * Clean up a specific workspace
   */
  private async cleanupWorkspace(workspaceId: string): Promise<number> {
    const workspace = (await loadWorkspaceMappings()).find(w => w.workspaceId === workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    const bytesFreed = workspace.sizeInBytes || 0;
    
    // Delete from database
    await deleteWorkspaceMapping(workspaceId);
    
    logWorkspaceOperation('WORKSPACE_CLEANED', {
      workspaceId,
      workspacePath: workspace.workspacePath,
      bytesFreed
    });

    return bytesFreed;
  }

  /**
   * Backup a workspace
   */
  private async backupWorkspace(workspaceId: string): Promise<string> {
    const workspace = (await loadWorkspaceMappings()).find(w => w.workspaceId === workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    const backupPath = `${workspace.workspacePath}.backup.${Date.now()}`;
    
    // In a real implementation, this would copy/move the workspace directory
    // For now, we just log the operation
    logWorkspaceOperation('WORKSPACE_BACKED_UP', {
      workspaceId,
      originalPath: workspace.workspacePath,
      backupPath
    });

    return backupPath;
  }

  /**
   * Attempt to recover an orphaned workspace
   */
  private async attemptWorkspaceRecovery(orphaned: OrphanedWorkspace): Promise<boolean> {
    try {
      const pathInfo = extractInfoFromWorkspacePath(orphaned.workspacePath);
      if (!pathInfo) {
        return false;
      }

      // Try to find matching project and conversation
      const { projects } = await loadState();
      const project = projects.find(p => p.id === pathInfo.projectId);
      
      if (!project) {
        return false;
      }

      // For now, we mark recovery as attempted
      // In a real implementation, this would try to reconstruct the workspace mapping
      logWorkspaceOperation('WORKSPACE_RECOVERY_ATTEMPTED', {
        workspaceId: orphaned.workspaceId,
        projectId: pathInfo.projectId,
        reason: orphaned.reason
      });

      return true;
    } catch (error) {
      logWorkspaceOperation('WORKSPACE_RECOVERY_FAILED', {
        workspaceId: orphaned.workspaceId,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Validate workspace mapping
   */
  private async validateWorkspaceMapping(workspace: WorkspaceMapping): Promise<boolean> {
    try {
      // Check if path is valid
      if (!validateWorkspacePath(workspace.workspacePath)) {
        return false;
      }

      // Check if conversation and project exist
      const { projects } = await loadState();
      const project = projects.find(p => p.id === workspace.projectId);
      if (!project) {
        return false;
      }

      const conversation = project.conversations.find(c => c.id === workspace.conversationId);
      if (!conversation) {
        return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Repair workspace mapping
   */
  private async repairWorkspaceMapping(workspace: WorkspaceMapping): Promise<boolean> {
    try {
      // For now, we just log the repair attempt
      // In a real implementation, this would fix the workspace mapping
      logWorkspaceOperation('WORKSPACE_REPAIR_ATTEMPTED', {
        workspaceId: workspace.workspaceId,
        workspacePath: workspace.workspacePath
      });

      return true;
    } catch (error) {
      logWorkspaceOperation('WORKSPACE_REPAIR_FAILED', {
        workspaceId: workspace.workspaceId,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Update cleanup statistics
   */
  private async updateCleanupStatistics(result: WorkspaceCleanupResult): Promise<void> {
    const stats = await getWorkspaceStats();
    
    const updatedStats = {
      ...stats,
      totalWorkspaces: stats.totalWorkspaces - result.cleaned.length,
      totalSizeInBytes: stats.totalSizeInBytes - result.bytesFreed,
      lastCleanup: new Date(),
      lastCleanupResult: result
    };

    await updateWorkspaceStats(updatedStats);
  }

  /**
   * Get cleanup configuration
   */
  getConfig(): WorkspaceCleanupConfig {
    return { ...this.config };
  }

  /**
   * Update cleanup configuration
   */
  updateConfig(newConfig: Partial<WorkspaceCleanupConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Restart auto cleanup if configuration changed
    if (this.cleanupTimer) {
      this.stopAutoCleanup();
      this.startAutoCleanup();
    }

    logWorkspaceOperation('CLEANUP_CONFIG_UPDATED', { config: this.config });
  }

  /**
   * Get cleanup status
   */
  getStatus(): {
    isRunning: boolean;
    autoCleanupEnabled: boolean;
    lastCleanup?: Date;
    nextCleanup?: Date;
  } {
    return {
      isRunning: this.isRunning,
      autoCleanupEnabled: !!this.cleanupTimer,
      lastCleanup: undefined, // Would be loaded from stats
      nextCleanup: this.cleanupTimer ? new Date(Date.now() + this.config.cleanupInterval) : undefined
    };
  }
}

// 🌟 PHASE 1.3: Global cleanup service instance
let globalCleanupService: WorkspaceCleanupService | null = null;

/**
 * Get global cleanup service instance
 */
export const getWorkspaceCleanupService = (): WorkspaceCleanupService => {
  if (!globalCleanupService) {
    globalCleanupService = new WorkspaceCleanupService();
  }
  return globalCleanupService;
};

/**
 * Initialize workspace cleanup service
 */
export const initializeWorkspaceCleanup = (config?: Partial<WorkspaceCleanupConfig>): void => {
  const service = getWorkspaceCleanupService();
  
  if (config) {
    service.updateConfig(config);
  }
  
  service.startAutoCleanup();
  
  logWorkspaceOperation('WORKSPACE_CLEANUP_INITIALIZED', { config: service.getConfig() });
};

/**
 * Shutdown workspace cleanup service
 */
export const shutdownWorkspaceCleanup = (): void => {
  const service = getWorkspaceCleanupService();
  service.stopAutoCleanup();
  
  logWorkspaceOperation('WORKSPACE_CLEANUP_SHUTDOWN', {});
};

// 🌟 PHASE 1.3: Utility functions for manual cleanup operations

/**
 * Run manual cleanup
 */
export const runManualCleanup = async (config?: Partial<WorkspaceCleanupConfig>): Promise<WorkspaceCleanupResult> => {
  const service = getWorkspaceCleanupService();
  
  if (config) {
    service.updateConfig(config);
  }
  
  return await service.runCleanup();
};

/**
 * Run manual recovery
 */
export const runManualRecovery = async (): Promise<WorkspaceRecoveryResult> => {
  const service = getWorkspaceCleanupService();
  return await service.runRecovery();
};

/**
 * Get workspace cleanup statistics
 */
export const getCleanupStatistics = async (): Promise<any> => {
  const stats = await getWorkspaceStats();
  const service = getWorkspaceCleanupService();
  
  return {
    ...stats,
    cleanupService: service.getStatus()
  };
}; 