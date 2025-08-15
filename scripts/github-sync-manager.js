import {
  readProjectJson,
  writeProjectJson,
  updateGitHubConfig,
  updateSyncStatus,
  updateBranchSyncStatus,
  getAllProjectsWithGitHub,
  getProjectPath
} from './project-json-manager.js';

import {
  detectPendingChanges,
  getBranchesToSync,
  hasRecentActivity,
  markBranchForSync,
  getAllPendingProjects
} from './sync-detection-service.js';

import { createGitExecutor } from './git-executor.js';

/**
 * Main GitHub Sync Manager - orchestrates the entire syncing process
 */
export class GitHubSyncManager {
  constructor(mcpClient, options = {}) {
    this.mcpClient = mcpClient;
    this.gitExecutor = createGitExecutor(mcpClient);
    
    // Configuration options
    this.options = {
      maxRetries: 3,
      retryDelay: 5000, // 5 seconds
      batchSize: 5, // Max projects to sync in parallel
      defaultSyncInterval: 300000, // 5 minutes
      ...options
    };

    // Internal state
    this.activeSyncs = new Map(); // Track ongoing syncs
    this.syncHistory = new Map(); // Track sync attempts
    
    this.logger = {
      info: (msg, ...args) => console.log(`[SYNC-MANAGER] ${msg}`, ...args),
      warn: (msg, ...args) => console.warn(`[SYNC-MANAGER] ${msg}`, ...args),
      error: (msg, ...args) => console.error(`[SYNC-MANAGER] ${msg}`, ...args),
      debug: (msg, ...args) => process.env.DEBUG && console.log(`[SYNC-MANAGER] ${msg}`, ...args)
    };
  }

  /**
   * Main sync logic for a single project
   * @param {string} projectId - Project identifier
   * @returns {Promise<Object>} Sync result
   */
  async performSync(projectId) {
    const syncId = `${projectId}-${Date.now()}`;
    this.logger.info(`Starting sync for project: ${projectId} (${syncId})`);

    // Check if project is already being synced
    if (this.activeSyncs.has(projectId)) {
      const existingSync = this.activeSyncs.get(projectId);
      this.logger.warn(`Project ${projectId} already syncing since ${existingSync.startTime}`);
      return {
        success: false,
        projectId,
        error: 'Sync already in progress',
        skipped: true,
        timestamp: new Date().toISOString()
      };
    }

    // Mark sync as active
    this.activeSyncs.set(projectId, {
      syncId,
      startTime: new Date().toISOString(),
      status: 'initializing'
    });

    try {
      // Update sync status to 'syncing'
      const projectPath = this.getProjectPathFromId(projectId);
      await updateSyncStatus(projectPath, 'syncing');

      // Read project data
      const projectData = await readProjectJson(projectPath);
      
      // Check if sync is needed
      if (!this.shouldSync(projectData)) {
        this.logger.info(`Project ${projectId} does not need syncing`);
        await updateSyncStatus(projectPath, 'idle');
        
        const result = {
          success: true,
          projectId,
          skipped: true,
          reason: 'No sync needed',
          timestamp: new Date().toISOString()
        };
        
        this.activeSyncs.delete(projectId);
        return result;
      }

      // Perform the actual sync
      const syncResult = await this.syncProject(projectData);
      
      // Update timestamps and status
      await this.updateSyncTimestamps(projectId, syncResult);
      
      // Update final status
      await updateSyncStatus(projectPath, syncResult.success ? 'idle' : 'error');
      
      this.logger.info(`Sync completed for project ${projectId}: ${syncResult.success ? 'SUCCESS' : 'FAILED'}`);
      
      // Clean up
      this.activeSyncs.delete(projectId);
      
      return {
        ...syncResult,
        projectId,
        syncId,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      this.logger.error(`Sync failed for project ${projectId}:`, error.message);
      
      // Handle the error with retry logic
      const errorResult = await this.handleSyncError(projectId, error);
      
      // Clean up
      this.activeSyncs.delete(projectId);
      
      return errorResult;
    }
  }

  /**
   * Syncs all pending branches for a project
   * @param {Object} projectData - Project data from JSON
   * @returns {Promise<Object>} Sync result
   */
  async syncProject(projectData) {
    const projectId = projectData.projectId;
    const projectPath = projectData.projectPath;
    
    this.logger.debug(`Syncing project: ${projectId}`);

    try {
      // Detect pending changes
      const pendingChanges = await detectPendingChanges(projectPath);
      
      if (!pendingChanges.hasChanges) {
        this.logger.info(`No pending changes for project ${projectId}`);
        return {
          success: true,
          branchesSynced: 0,
          branchesSkipped: 0,
          totalCommitsPushed: 0,
          branches: [],
          message: 'No pending changes'
        };
      }

      // Get branches that should be synced
      const branchesToSync = getBranchesToSync(projectData);
      
      // Filter pending branches to only those configured for sync
      const filteredBranches = pendingChanges.branches.filter(branch =>
        branchesToSync.includes(branch.branchName) && branch.needsSync
      );

      if (filteredBranches.length === 0) {
        this.logger.info(`No branches need syncing for project ${projectId}`);
        return {
          success: true,
          branchesSynced: 0,
          branchesSkipped: pendingChanges.branches.length,
          totalCommitsPushed: 0,
          branches: [],
          message: 'No branches configured for sync'
        };
      }

      this.logger.info(`Syncing ${filteredBranches.length} branches for project ${projectId}`);

      // Check if remote repository exists
      await this.ensureRemoteRepository(projectData);

      // Sync branches one by one
      const branchResults = [];
      let totalCommitsPushed = 0;
      let branchesSynced = 0;

      for (const branchInfo of filteredBranches) {
        try {
          this.logger.debug(`Syncing branch: ${branchInfo.branchName}`);
          
          // Push the branch
          const pushResult = await this.gitExecutor.pushBranch(
            projectPath,
            branchInfo.branchName,
            {
              setUpstream: !branchInfo.lastPushedHash, // Set upstream if first push
              force: false // Generally avoid force pushing
            }
          );

          if (pushResult.success) {
            branchesSynced++;
            totalCommitsPushed += pushResult.commitsPushed || branchInfo.pendingCommits;

            // Update branch sync status
            await updateBranchSyncStatus(projectPath, branchInfo.branchName, {
              lastPushed: Date.now(),
              pushedHash: branchInfo.currentHash,
              needsSync: false,
              syncError: null
            });

            this.logger.info(`Successfully synced branch ${branchInfo.branchName} (${branchInfo.pendingCommits} commits)`);
          } else {
            // Mark branch with sync error
            await updateBranchSyncStatus(projectPath, branchInfo.branchName, {
              syncError: pushResult.error || 'Push failed',
              needsSync: true
            });

            this.logger.error(`Failed to sync branch ${branchInfo.branchName}:`, pushResult.error);
          }

          branchResults.push({
            branchName: branchInfo.branchName,
            success: pushResult.success,
            commitsPushed: pushResult.commitsPushed || branchInfo.pendingCommits,
            error: pushResult.error,
            details: pushResult
          });

        } catch (error) {
          this.logger.error(`Error syncing branch ${branchInfo.branchName}:`, error.message);
          
          // Mark branch with error
          await updateBranchSyncStatus(projectPath, branchInfo.branchName, {
            syncError: error.message,
            needsSync: true
          });

          branchResults.push({
            branchName: branchInfo.branchName,
            success: false,
            commitsPushed: 0,
            error: error.message
          });
        }
      }

      const result = {
        success: branchesSynced > 0,
        branchesSynced,
        branchesSkipped: filteredBranches.length - branchesSynced,
        totalCommitsPushed,
        branches: branchResults,
        pendingChanges
      };

      this.logger.info(`Project sync completed: ${branchesSynced}/${filteredBranches.length} branches synced`);
      return result;

    } catch (error) {
      this.logger.error(`Project sync failed for ${projectId}:`, error.message);
      throw error;
    }
  }

  /**
   * Handles sync errors with retry logic
   * @param {string} projectId - Project identifier
   * @param {Error} error - The error that occurred
   * @returns {Promise<Object>} Error handling result
   */
  async handleSyncError(projectId, error) {
    this.logger.error(`Handling sync error for project ${projectId}:`, error.message);

    try {
      const projectPath = this.getProjectPathFromId(projectId);
      
      // Get current retry count
      const syncHistory = this.syncHistory.get(projectId) || { attempts: 0, lastError: null };
      syncHistory.attempts++;
      syncHistory.lastError = error.message;
      syncHistory.lastAttempt = Date.now();
      
      this.syncHistory.set(projectId, syncHistory);

      // Update sync status to error
      await updateSyncStatus(projectPath, 'error');

      // Update global sync state with error info
      const projectData = await readProjectJson(projectPath);
      await updateGitHubConfig(projectPath, {
        syncStatus: 'error'
      });

      // Determine if we should retry
      const shouldRetry = syncHistory.attempts < this.options.maxRetries;
      
      const errorResult = {
        success: false,
        projectId,
        error: error.message,
        attempts: syncHistory.attempts,
        willRetry: shouldRetry,
        timestamp: new Date().toISOString(),
        branchesSynced: 0,
        totalCommitsPushed: 0
      };

      if (shouldRetry) {
        this.logger.warn(`Will retry sync for ${projectId} (attempt ${syncHistory.attempts}/${this.options.maxRetries})`);
        
        // Schedule retry (in a real implementation, you'd use a queue/scheduler)
        setTimeout(async () => {
          this.logger.info(`Retrying sync for project ${projectId}...`);
          await this.performSync(projectId);
        }, this.options.retryDelay);
        
      } else {
        this.logger.error(`Max retries reached for project ${projectId}. Giving up.`);
        
        // Reset retry count after max attempts
        this.syncHistory.delete(projectId);
      }

      return errorResult;

    } catch (updateError) {
      this.logger.error(`Failed to handle sync error for ${projectId}:`, updateError.message);
      
      return {
        success: false,
        projectId,
        error: error.message,
        updateError: updateError.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Updates sync timestamps and status after sync completion
   * @param {string} projectId - Project identifier
   * @param {Object} results - Sync results
   * @returns {Promise<void>}
   */
  async updateSyncTimestamps(projectId, results) {
    this.logger.debug(`Updating sync timestamps for project: ${projectId}`);

    try {
      const projectPath = this.getProjectPathFromId(projectId);
      const now = Date.now();

      // Update GitHub config with sync information
      const syncUpdate = {
        lastSync: now,
        syncStatus: results.success ? 'idle' : 'error'
      };

      await updateGitHubConfig(projectPath, syncUpdate);

      // Update global sync state
      const projectData = await readProjectJson(projectPath);
      const updatedSync = {
        ...projectData.sync,
        lastAttempt: now,
        nextScheduled: results.success ? now + (projectData.github?.syncInterval || this.options.defaultSyncInterval) : null,
        consecutiveFailures: results.success ? 0 : (projectData.sync?.consecutiveFailures || 0) + 1,
        pendingChanges: results.success ? [] : (projectData.sync?.pendingChanges || [])
      };

      // Write updated sync data
      const updatedProjectData = {
        ...projectData,
        sync: updatedSync,
        lastActivity: now
      };

      await writeProjectJson(projectPath, updatedProjectData);

      // Clear retry history on success
      if (results.success) {
        this.syncHistory.delete(projectId);
      }

      this.logger.debug(`Updated sync timestamps for project ${projectId}`);

    } catch (error) {
      this.logger.error(`Failed to update sync timestamps for ${projectId}:`, error.message);
      throw error;
    }
  }

  /**
   * Determines if a project needs syncing based on activity and changes
   * @param {Object} projectData - Project data from JSON
   * @returns {boolean} True if project should be synced
   */
  shouldSync(projectData) {
    try {
      // Check if GitHub sync is enabled
      if (!projectData.github?.enabled) {
        this.logger.debug(`Project ${projectData.projectId}: GitHub sync disabled`);
        return false;
      }

      // Check if there are branches configured for sync
      const branchesToSync = getBranchesToSync(projectData);
      if (branchesToSync.length === 0) {
        this.logger.debug(`Project ${projectData.projectId}: No branches configured for sync`);
        return false;
      }

      // Check if project has recent activity
      if (!hasRecentActivity(projectData)) {
        this.logger.debug(`Project ${projectData.projectId}: No recent activity`);
        return false;
      }

      // Check sync interval
      const lastSync = projectData.github?.lastSync || 0;
      const syncInterval = projectData.github?.syncInterval || this.options.defaultSyncInterval;
      const timeSinceLastSync = Date.now() - lastSync;
      
      if (timeSinceLastSync < syncInterval) {
        this.logger.debug(`Project ${projectData.projectId}: Too soon since last sync (${timeSinceLastSync}ms < ${syncInterval}ms)`);
        return false;
      }

      // Check if already syncing
      if (projectData.github?.syncStatus === 'syncing') {
        this.logger.debug(`Project ${projectData.projectId}: Already syncing`);
        return false;
      }

      this.logger.debug(`Project ${projectData.projectId}: Should sync`);
      return true;

    } catch (error) {
      this.logger.error(`Error checking if project should sync:`, error.message);
      return false;
    }
  }

  /**
   * Ensures remote repository exists for the project
   * @private
   */
  async ensureRemoteRepository(projectData) {
    const projectPath = projectData.projectPath;
    const projectId = projectData.projectId;

    try {
      // Check if remote is configured
      if (!projectData.github?.remoteUrl) {
        this.logger.info(`No remote URL configured for ${projectId}, attempting to create repository`);
        
        // Try to create remote repository
        const repoName = `${projectId}-${projectData.projectName}`;
        const createResult = await this.gitExecutor.createRemoteRepo(projectPath, repoName, {
          private: true,
          description: `Auto-created repository for project ${projectId}`,
          addOrigin: true
        });

        if (createResult.success) {
          // Update project data with new remote URL
          await updateGitHubConfig(projectPath, {
            remoteUrl: createResult.repoUrl
          });
          
          this.logger.info(`Created remote repository: ${createResult.repoUrl}`);
        } else {
          throw new Error(`Failed to create remote repository: ${createResult.error}`);
        }
      }

    } catch (error) {
      this.logger.warn(`Could not ensure remote repository for ${projectId}:`, error.message);
      // Don't throw - let the push attempt handle this
    }
  }

  /**
   * Gets project path from project ID
   * @private
   */
  getProjectPathFromId(projectId) {
    // This is a simplified version - you might need to implement more sophisticated logic
    // to handle different project directory structures
    const parts = projectId.split('_');
    if (parts.length >= 2) {
      const conversationId = parts[0];
      const projectName = parts.slice(1).join('_');
      return getProjectPath(conversationId, projectName);
    }
    
    // Fallback: assume projectId is the directory name
    return getProjectPath(projectId, 'default');
  }

  /**
   * Syncs all pending projects
   * @param {Object} options - Sync options
   * @returns {Promise<Object>} Batch sync results
   */
  async syncAllPendingProjects(options = {}) {
    const { maxConcurrent = this.options.batchSize } = options;
    
    this.logger.info('Starting batch sync of all pending projects...');

    try {
      // Get all projects that need syncing
      const pendingProjects = await getAllPendingProjects();
      
      if (pendingProjects.length === 0) {
        this.logger.info('No projects need syncing');
        return {
          success: true,
          totalProjects: 0,
          syncedProjects: 0,
          failedProjects: 0,
          results: []
        };
      }

      this.logger.info(`Found ${pendingProjects.length} projects needing sync`);

      // Process projects in batches
      const results = [];
      let syncedProjects = 0;
      let failedProjects = 0;

      for (let i = 0; i < pendingProjects.length; i += maxConcurrent) {
        const batch = pendingProjects.slice(i, i + maxConcurrent);
        
        this.logger.info(`Processing batch ${Math.floor(i / maxConcurrent) + 1}/${Math.ceil(pendingProjects.length / maxConcurrent)}`);

        // Process batch in parallel
        const batchPromises = batch.map(project => 
          this.performSync(project.projectId).catch(error => ({
            success: false,
            projectId: project.projectId,
            error: error.message
          }))
        );

        const batchResults = await Promise.all(batchPromises);
        
        // Count results
        batchResults.forEach(result => {
          if (result.success && !result.skipped) {
            syncedProjects++;
          } else if (!result.success) {
            failedProjects++;
          }
        });

        results.push(...batchResults);

        // Small delay between batches to prevent overwhelming the system
        if (i + maxConcurrent < pendingProjects.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      const batchResult = {
        success: failedProjects === 0,
        totalProjects: pendingProjects.length,
        syncedProjects,
        failedProjects,
        skippedProjects: pendingProjects.length - syncedProjects - failedProjects,
        results,
        timestamp: new Date().toISOString()
      };

      this.logger.info(`Batch sync completed: ${syncedProjects}/${pendingProjects.length} projects synced successfully`);
      return batchResult;

    } catch (error) {
      this.logger.error('Batch sync failed:', error.message);
      throw error;
    }
  }

  /**
   * Gets sync status for all projects
   * @returns {Promise<Object>} Status summary
   */
  async getSyncStatus() {
    try {
      const allProjects = await getAllProjectsWithGitHub();
      const pendingProjects = await getAllPendingProjects();
      
      const status = {
        totalProjects: allProjects.length,
        enabledProjects: allProjects.filter(p => p.github?.enabled).length,
        projectsNeedingSync: pendingProjects.length,
        activeSyncs: this.activeSyncs.size,
        recentFailures: this.syncHistory.size,
        timestamp: new Date().toISOString()
      };

      return status;

    } catch (error) {
      this.logger.error('Failed to get sync status:', error.message);
      throw error;
    }
  }
}

/**
 * Factory function to create a GitHubSyncManager instance
 * @param {Object} mcpClient - MCP client instance
 * @param {Object} options - Configuration options
 * @returns {GitHubSyncManager} GitHubSyncManager instance
 */
export function createGitHubSyncManager(mcpClient, options = {}) {
  return new GitHubSyncManager(mcpClient, options);
}

export default GitHubSyncManager; 