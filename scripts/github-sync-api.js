import express from 'express';
import cors from 'cors';
import { createSyncScheduler } from './github-sync-scheduler.js';

/**
 * GitHub Sync API Server
 * Provides REST API endpoints for controlling the background sync service
 */
export class GitHubSyncAPI {
  constructor(mcpClient, options = {}) {
    this.mcpClient = mcpClient;
    this.scheduler = null;
    
    // Configuration
    this.config = {
      port: options.port || 3001,
      host: options.host || 'localhost',
      corsOrigin: options.corsOrigin || 'http://localhost:3000',
      schedulerOptions: options.schedulerOptions || {},
      ...options
    };
    
    // Initialize Express app
    this.app = express();
    this.server = null;
    
    // Setup middleware
    this.setupMiddleware();
    
    // Setup routes
    this.setupRoutes();
    
    // Logging
    this.logger = {
      info: (msg, ...args) => console.log(`[SYNC-API] ${msg}`, ...args),
      warn: (msg, ...args) => console.warn(`[SYNC-API] ${msg}`, ...args),
      error: (msg, ...args) => console.error(`[SYNC-API] ${msg}`, ...args),
      debug: (msg, ...args) => process.env.DEBUG && console.log(`[SYNC-API] ${msg}`, ...args)
    };
  }

  /**
   * Setup Express middleware
   */
  setupMiddleware() {
    // CORS
    this.app.use(cors({
      origin: this.config.corsOrigin,
      credentials: true
    }));
    
    // JSON parsing
    this.app.use(express.json({ limit: '10mb' }));
    
    // Request logging
    this.app.use((req, res, next) => {
      this.logger.debug(`${req.method} ${req.path}`);
      next();
    });
    
    // Error handling
    this.app.use((err, req, res, next) => {
      this.logger.error('API Error:', err.message);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: err.message
      });
    });
  }

  /**
   * Setup API routes
   */
  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        success: true,
        service: 'github-sync-api',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });

    // Service control endpoints
    this.app.post('/api/sync/start', this.handleStartService.bind(this));
    this.app.post('/api/sync/stop', this.handleStopService.bind(this));
    this.app.get('/api/sync/status', this.handleGetStatus.bind(this));
    
    // Sync control endpoints
    this.app.post('/api/sync/trigger', this.handleTriggerSync.bind(this));
    this.app.post('/api/sync/trigger/:projectId', this.handleTriggerProjectSync.bind(this));
    this.app.get('/api/sync/queue', this.handleGetQueue.bind(this));
    
    // History and monitoring endpoints
    this.app.get('/api/sync/history', this.handleGetHistory.bind(this));
    this.app.get('/api/sync/history/:projectId', this.handleGetProjectHistory.bind(this));
    this.app.delete('/api/sync/history', this.handleCleanupHistory.bind(this));
    
    // Configuration endpoints
    this.app.get('/api/sync/config', this.handleGetConfig.bind(this));
    this.app.put('/api/sync/config', this.handleUpdateConfig.bind(this));
    
    // Projects endpoint
    this.app.get('/api/sync/projects', this.handleGetProjects.bind(this));
  }

  /**
   * Start the sync service
   */
  async handleStartService(req, res) {
    try {
      if (this.scheduler && this.scheduler.isRunning) {
        return res.json({
          success: false,
          message: 'Service is already running'
        });
      }
      
      this.logger.info('Starting sync service via API...');
      
      // Create scheduler if it doesn't exist
      if (!this.scheduler) {
        this.scheduler = createSyncScheduler(this.mcpClient, this.config.schedulerOptions);
        this.setupSchedulerEventListeners();
      }
      
      await this.scheduler.start();
      
      res.json({
        success: true,
        message: 'Sync service started successfully',
        status: this.scheduler.getStatus()
      });
      
    } catch (error) {
      this.logger.error('Failed to start sync service:', error.message);
      res.status(500).json({
        success: false,
        error: 'Failed to start sync service',
        message: error.message
      });
    }
  }

  /**
   * Stop the sync service
   */
  async handleStopService(req, res) {
    try {
      if (!this.scheduler || !this.scheduler.isRunning) {
        return res.json({
          success: false,
          message: 'Service is not running'
        });
      }
      
      this.logger.info('Stopping sync service via API...');
      await this.scheduler.stop();
      
      res.json({
        success: true,
        message: 'Sync service stopped successfully'
      });
      
    } catch (error) {
      this.logger.error('Failed to stop sync service:', error.message);
      res.status(500).json({
        success: false,
        error: 'Failed to stop sync service',
        message: error.message
      });
    }
  }

  /**
   * Get service status
   */
  async handleGetStatus(req, res) {
    try {
      const status = {
        serviceRunning: this.scheduler ? this.scheduler.isRunning : false,
        scheduler: this.scheduler ? this.scheduler.getStatus() : null,
        api: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          timestamp: new Date().toISOString()
        }
      };
      
      res.json({
        success: true,
        status
      });
      
    } catch (error) {
      this.logger.error('Failed to get status:', error.message);
      res.status(500).json({
        success: false,
        error: 'Failed to get status',
        message: error.message
      });
    }
  }

  /**
   * Trigger sync for all eligible projects
   */
  async handleTriggerSync(req, res) {
    try {
      if (!this.scheduler || !this.scheduler.isRunning) {
        return res.status(400).json({
          success: false,
          error: 'Sync service is not running'
        });
      }
      
      const { immediate = false } = req.body;
      
      this.logger.info('Triggering full sync scan via API...');
      await this.scheduler.scanForSyncCandidates();
      
      res.json({
        success: true,
        message: 'Sync scan triggered successfully',
        immediate,
        queueSize: this.scheduler.syncQueue.size
      });
      
    } catch (error) {
      this.logger.error('Failed to trigger sync:', error.message);
      res.status(500).json({
        success: false,
        error: 'Failed to trigger sync',
        message: error.message
      });
    }
  }

  /**
   * Trigger sync for specific project
   */
  async handleTriggerProjectSync(req, res) {
    try {
      if (!this.scheduler || !this.scheduler.isRunning) {
        return res.status(400).json({
          success: false,
          error: 'Sync service is not running'
        });
      }
      
      const { projectId } = req.params;
      const { immediate = false, priority = 10 } = req.body;
      
      this.logger.info(`Triggering sync for project ${projectId} via API...`);
      
      const scheduled = await this.scheduler.triggerSync(projectId, {
        immediate,
        priority
      });
      
      if (scheduled) {
        res.json({
          success: true,
          message: `Sync triggered for project ${projectId}`,
          projectId,
          immediate,
          priority
        });
      } else {
        res.json({
          success: false,
          message: `Failed to schedule sync for project ${projectId}`,
          projectId
        });
      }
      
    } catch (error) {
      this.logger.error(`Failed to trigger sync for project ${req.params.projectId}:`, error.message);
      res.status(500).json({
        success: false,
        error: 'Failed to trigger project sync',
        message: error.message
      });
    }
  }

  /**
   * Get current sync queue
   */
  async handleGetQueue(req, res) {
    try {
      if (!this.scheduler) {
        return res.json({
          success: true,
          queue: [],
          activeSync: []
        });
      }
      
      const status = this.scheduler.getStatus();
      
      res.json({
        success: true,
        queue: status.queue,
        activeSync: status.activeSync,
        stats: {
          queueSize: status.stats.queueSize,
          activeSyncs: status.stats.activeSyncs
        }
      });
      
    } catch (error) {
      this.logger.error('Failed to get queue:', error.message);
      res.status(500).json({
        success: false,
        error: 'Failed to get queue',
        message: error.message
      });
    }
  }

  /**
   * Get sync history
   */
  async handleGetHistory(req, res) {
    try {
      if (!this.scheduler) {
        return res.json({
          success: true,
          history: []
        });
      }
      
      const { limit = 50, projectId } = req.query;
      
      // If projectId specified, get project-specific history
      if (projectId) {
        const history = this.scheduler.getSyncHistory(projectId, parseInt(limit));
        return res.json({
          success: true,
          projectId,
          history
        });
      }
      
      // Get recent history across all projects
      const stmt = this.scheduler.db.prepare(`
        SELECT * FROM sync_history 
        ORDER BY started_at DESC 
        LIMIT ?
      `);
      
      const history = stmt.all(parseInt(limit));
      
      res.json({
        success: true,
        history
      });
      
    } catch (error) {
      this.logger.error('Failed to get history:', error.message);
      res.status(500).json({
        success: false,
        error: 'Failed to get history',
        message: error.message
      });
    }
  }

  /**
   * Get project-specific sync history
   */
  async handleGetProjectHistory(req, res) {
    try {
      if (!this.scheduler) {
        return res.json({
          success: true,
          history: []
        });
      }
      
      const { projectId } = req.params;
      const { limit = 10 } = req.query;
      
      const history = this.scheduler.getSyncHistory(projectId, parseInt(limit));
      
      res.json({
        success: true,
        projectId,
        history
      });
      
    } catch (error) {
      this.logger.error(`Failed to get history for project ${req.params.projectId}:`, error.message);
      res.status(500).json({
        success: false,
        error: 'Failed to get project history',
        message: error.message
      });
    }
  }

  /**
   * Cleanup old sync history
   */
  async handleCleanupHistory(req, res) {
    try {
      if (!this.scheduler) {
        return res.json({
          success: false,
          error: 'Scheduler not available'
        });
      }
      
      const { days = 30 } = req.body;
      const deletedCount = this.scheduler.cleanupHistory(days);
      
      res.json({
        success: true,
        message: `Cleaned up ${deletedCount} old sync records`,
        deletedCount,
        days
      });
      
    } catch (error) {
      this.logger.error('Failed to cleanup history:', error.message);
      res.status(500).json({
        success: false,
        error: 'Failed to cleanup history',
        message: error.message
      });
    }
  }

  /**
   * Get current configuration
   */
  async handleGetConfig(req, res) {
    try {
      const config = {
        api: {
          port: this.config.port,
          host: this.config.host
        },
        scheduler: this.scheduler ? this.scheduler.config : this.config.schedulerOptions
      };
      
      res.json({
        success: true,
        config
      });
      
    } catch (error) {
      this.logger.error('Failed to get config:', error.message);
      res.status(500).json({
        success: false,
        error: 'Failed to get config',
        message: error.message
      });
    }
  }

  /**
   * Update configuration
   */
  async handleUpdateConfig(req, res) {
    try {
      const { schedulerOptions } = req.body;
      
      if (schedulerOptions) {
        // Update scheduler config if running
        if (this.scheduler) {
          Object.assign(this.scheduler.config, schedulerOptions);
        }
        
        // Update stored config
        Object.assign(this.config.schedulerOptions, schedulerOptions);
      }
      
      res.json({
        success: true,
        message: 'Configuration updated successfully',
        config: {
          api: {
            port: this.config.port,
            host: this.config.host
          },
          scheduler: this.scheduler ? this.scheduler.config : this.config.schedulerOptions
        }
      });
      
    } catch (error) {
      this.logger.error('Failed to update config:', error.message);
      res.status(500).json({
        success: false,
        error: 'Failed to update config',
        message: error.message
      });
    }
  }

  /**
   * Get projects with GitHub sync capability
   */
  async handleGetProjects(req, res) {
    try {
      // Import the project manager functions
      const { getAllProjectsWithGitHub } = await import('./project-json-manager.js');
      const { getAllPendingProjects } = await import('./sync-detection-service.js');
      
      const [allProjects, pendingProjects] = await Promise.all([
        getAllProjectsWithGitHub(),
        getAllPendingProjects({ enabledOnly: false })
      ]);
      
      // Create a map of pending projects for quick lookup
      const pendingMap = new Map(pendingProjects.map(p => [p.projectId, p]));
      
      // Enhance project data with sync status
      const enhancedProjects = allProjects.map(project => ({
        projectId: project.projectId,
        projectName: project.projectName,
        projectPath: project.projectPath,
        github: project.github,
        lastActivity: project.lastActivity,
        branchCount: project.branches?.length || 0,
        hasPendingChanges: pendingMap.has(project.projectId),
        pendingCommits: pendingMap.get(project.projectId)?.totalPendingCommits || 0,
        syncStatus: this.scheduler?.activeSync.has(project.projectId) ? 'syncing' : 'idle'
      }));
      
      res.json({
        success: true,
        projects: enhancedProjects,
        summary: {
          total: allProjects.length,
          enabled: allProjects.filter(p => p.github?.enabled).length,
          withPendingChanges: pendingProjects.length,
          currentlySyncing: this.scheduler?.activeSync.size || 0
        }
      });
      
    } catch (error) {
      this.logger.error('Failed to get projects:', error.message);
      res.status(500).json({
        success: false,
        error: 'Failed to get projects',
        message: error.message
      });
    }
  }

  /**
   * Setup event listeners for scheduler
   */
  setupSchedulerEventListeners() {
    if (!this.scheduler) return;
    
    this.scheduler.on('syncCompleted', ({ projectId, result }) => {
      this.logger.info(`✅ Sync completed: ${projectId} (${result.branchesSynced} branches)`);
    });
    
    this.scheduler.on('syncFailed', ({ projectId, error }) => {
      this.logger.warn(`❌ Sync failed: ${projectId} - ${error}`);
    });
    
    this.scheduler.on('scanCompleted', ({ candidatesFound, queueSize }) => {
      this.logger.debug(`📊 Scan completed: ${candidatesFound} candidates, ${queueSize} queued`);
    });
  }

  /**
   * Start the API server
   */
  async start() {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.config.port, this.config.host, () => {
          this.logger.info(`GitHub Sync API started on ${this.config.host}:${this.config.port}`);
          resolve();
        });
        
        this.server.on('error', reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop the API server
   */
  async stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.logger.info('GitHub Sync API stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

/**
 * Factory function to create and start API server
 */
export async function createSyncAPI(mcpClient, options = {}) {
  const api = new GitHubSyncAPI(mcpClient, options);
  await api.start();
  return api;
}

/**
 * Standalone server entry point
 */
export async function startSyncAPIServer(mcpClient, options = {}) {
  const api = await createSyncAPI(mcpClient, options);
  
  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    if (api.scheduler) {
      await api.scheduler.stop();
    }
    await api.stop();
    process.exit(0);
  });
  
  process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down gracefully...');
    if (api.scheduler) {
      await api.scheduler.stop();
    }
    await api.stop();
    process.exit(0);
  });
  
  return api;
}

export default GitHubSyncAPI; 