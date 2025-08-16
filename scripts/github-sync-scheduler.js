import EventEmitter from 'events';
import { createGitHubSyncManager } from './github-sync-manager.js';
import { getAllPendingProjects } from './sync-detection-service.js';
import { getAllProjectsWithGitHub } from './project-json-manager.js';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Background GitHub Sync Scheduler
 * Continuously monitors and syncs projects with GitHub enabled
 */
export class SyncScheduler extends EventEmitter {
  constructor(mcpClient, options = {}) {
    super();
    
    this.mcpClient = mcpClient;
    this.syncManager = createGitHubSyncManager(mcpClient);
    
    // Configuration
    this.config = {
      scanInterval: options.scanInterval || 300000, // 5 minutes
      maxConcurrentSyncs: options.maxConcurrentSyncs || 3,
      retryDelay: options.retryDelay || 30000, // 30 seconds
      maxRetries: options.maxRetries || 3,
      rateLimitDelay: options.rateLimitDelay || 60000, // 1 minute for rate limits
      dbPath: options.dbPath || join(__dirname, 'data', 'sync-queue.db'),
      ...options
    };
    
    // Internal state
    this.isRunning = false;
    this.scanTimer = null;
    this.activeSync = new Map(); // projectId -> sync info
    this.syncQueue = new Map(); // projectId -> queue entry
    this.stats = {
      totalScans: 0,
      totalSyncs: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      queueSize: 0,
      activeSyncs: 0,
      lastScan: null,
      uptime: null
    };
    
    // Initialize database
    this.initializeDatabase();
    
    // Logging
    this.logger = {
      info: (msg, ...args) => console.log(`[SCHEDULER] ${msg}`, ...args),
      warn: (msg, ...args) => console.warn(`[SCHEDULER] ${msg}`, ...args),
      error: (msg, ...args) => console.error(`[SCHEDULER] ${msg}`, ...args),
      debug: (msg, ...args) => process.env.DEBUG && console.log(`[SCHEDULER] ${msg}`, ...args)
    };
  }

  /**
   * Initialize SQLite database for persistent queue
   */
  initializeDatabase() {
    try {
      // Ensure data directory exists
      const dataDir = dirname(this.config.dbPath);
      if (!existsSync(dataDir)) {
        mkdirSync(dataDir, { recursive: true });
      }
      
      this.db = new Database(this.config.dbPath);
      
      // Create tables for persistent queue
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS sync_queue (
          project_id TEXT PRIMARY KEY,
          project_path TEXT NOT NULL,
          priority INTEGER DEFAULT 0,
          scheduled_at INTEGER NOT NULL,
          retry_count INTEGER DEFAULT 0,
          last_error TEXT,
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        );
        
        CREATE TABLE IF NOT EXISTS sync_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id TEXT NOT NULL,
          sync_id TEXT NOT NULL,
          status TEXT NOT NULL, -- 'success', 'failed', 'cancelled'
          started_at INTEGER NOT NULL,
          completed_at INTEGER,
          duration_ms INTEGER,
          branches_synced INTEGER DEFAULT 0,
          commits_pushed INTEGER DEFAULT 0,
          error_message TEXT,
          created_at INTEGER DEFAULT (strftime('%s', 'now'))
        );
        
        CREATE INDEX IF NOT EXISTS idx_sync_queue_scheduled_at ON sync_queue(scheduled_at);
        CREATE INDEX IF NOT EXISTS idx_sync_history_project_id ON sync_history(project_id);
        CREATE INDEX IF NOT EXISTS idx_sync_history_started_at ON sync_history(started_at);
      `);
      
      // Load existing queue from database
      this.loadQueueFromDatabase();
      
      this.logger.info('Database initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize database:', error.message);
      throw error;
    }
  }

  /**
   * Load sync queue from persistent storage
   */
  loadQueueFromDatabase() {
    try {
      const queueItems = this.db.prepare(`
        SELECT * FROM sync_queue 
        WHERE scheduled_at <= ? 
        ORDER BY priority DESC, scheduled_at ASC
      `).all(Date.now() + (60 * 60 * 1000)); // Include items scheduled within next hour
      
      this.syncQueue.clear();
      queueItems.forEach(item => {
        this.syncQueue.set(item.project_id, {
          projectId: item.project_id,
          projectPath: item.project_path,
          priority: item.priority,
          scheduledAt: item.scheduled_at,
          retryCount: item.retry_count,
          lastError: item.last_error,
          createdAt: item.created_at
        });
      });
      
      this.logger.info(`Loaded ${queueItems.length} items from persistent queue`);
    } catch (error) {
      this.logger.error('Failed to load queue from database:', error.message);
    }
  }

  /**
   * Save queue item to persistent storage
   */
  saveQueueItem(queueEntry) {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO sync_queue 
        (project_id, project_path, priority, scheduled_at, retry_count, last_error, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, strftime('%s', 'now'))
      `);
      
      stmt.run(
        queueEntry.projectId,
        queueEntry.projectPath,
        queueEntry.priority,
        queueEntry.scheduledAt,
        queueEntry.retryCount,
        queueEntry.lastError
      );
    } catch (error) {
      this.logger.error('Failed to save queue item to database:', error.message);
    }
  }

  /**
   * Remove queue item from persistent storage
   */
  removeQueueItem(projectId) {
    try {
      this.db.prepare('DELETE FROM sync_queue WHERE project_id = ?').run(projectId);
    } catch (error) {
      this.logger.error('Failed to remove queue item from database:', error.message);
    }
  }

  /**
   * Record sync result in history
   */
  recordSyncHistory(syncInfo, result) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO sync_history 
        (project_id, sync_id, status, started_at, completed_at, duration_ms, 
         branches_synced, commits_pushed, error_message)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        syncInfo.projectId,
        syncInfo.syncId,
        result.success ? 'success' : 'failed',
        syncInfo.startTime,
        Date.now(),
        Date.now() - syncInfo.startTime,
        result.branchesSynced || 0,
        result.totalCommitsPushed || 0,
        result.error || null
      );
    } catch (error) {
      this.logger.error('Failed to record sync history:', error.message);
    }
  }

  /**
   * Start the background sync scheduler
   */
  async start() {
    if (this.isRunning) {
      this.logger.warn('Scheduler is already running');
      return;
    }

    this.logger.info('Starting GitHub sync scheduler...');
    this.isRunning = true;
    this.stats.uptime = Date.now();
    
    // Ensure database and sync manager are ready
    if (!this.db) {
      this.initializeDatabase();
    }
    if (!this.syncManager) {
      this.syncManager = createGitHubSyncManager(this.mcpClient);
    }
    
    // Load existing queue
    this.loadQueueFromDatabase();
    
    // Start processing queue immediately
    this.processQueue();
    
    // Schedule periodic scans
    this.scheduleNextScan();
    
    // Handle graceful shutdown
    this.setupShutdownHandlers();
    
    this.emit('started');
    this.logger.info(`Scheduler started with ${this.syncQueue.size} queued items`);
  }

  /**
   * Stop the background sync scheduler
   */
  async stop() {
    if (!this.isRunning) {
      this.logger.warn('Scheduler is not running');
      return;
    }

    this.logger.info('Stopping GitHub sync scheduler...');
    this.isRunning = false;
    
    // Clear timers
    if (this.scanTimer) {
      clearTimeout(this.scanTimer);
      this.scanTimer = null;
    }
    
    // Wait for active syncs to complete (with timeout)
    const shutdownTimeout = 30000; // 30 seconds
    const shutdownStart = Date.now();
    
    while (this.activeSync.size > 0 && (Date.now() - shutdownStart) < shutdownTimeout) {
      this.logger.info(`Waiting for ${this.activeSync.size} active syncs to complete...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    if (this.activeSync.size > 0) {
      this.logger.warn(`Forcing shutdown with ${this.activeSync.size} active syncs still running`);
    }
    
    // Close database
    if (this.db) {
      this.db.close();
    }
    
    this.emit('stopped');
    this.logger.info('Scheduler stopped');
  }

  /**
   * Schedule next scan for sync candidates
   */
  scheduleNextScan() {
    if (!this.isRunning) return;
    
    this.scanTimer = setTimeout(async () => {
      try {
        await this.scanForSyncCandidates();
      } catch (error) {
        this.logger.error('Scan failed:', error.message);
      }
      
      // Schedule next scan
      this.scheduleNextScan();
    }, this.config.scanInterval);
  }

  /**
   * Scan for projects that need syncing
   */
  async scanForSyncCandidates() {
    if (!this.isRunning) return;
    
    this.logger.debug('Scanning for sync candidates...');
    this.stats.totalScans++;
    this.stats.lastScan = Date.now();
    
    try {
      // Get all projects with pending changes
      const pendingProjects = await getAllPendingProjects({
        checkRecentActivity: true,
        enabledOnly: true
      });
      
      this.logger.info(`Found ${pendingProjects.length} projects with pending changes`);
      
      // Schedule syncs for eligible projects
      for (const project of pendingProjects) {
        if (this.shouldSync(project)) {
          await this.scheduleSync(project.projectId, 0, {
            projectPath: project.projectPath,
            priority: this.calculatePriority(project)
          });
        }
      }
      
      // Also process any queued syncs
      this.processQueue();
      
      this.emit('scanCompleted', {
        candidatesFound: pendingProjects.length,
        queueSize: this.syncQueue.size
      });
      
    } catch (error) {
      this.logger.error('Failed to scan for sync candidates:', error.message);
      this.emit('scanError', error);
    }
  }

  /**
   * Determine if a project should be synced
   */
  shouldSync(projectData) {
    try {
      // Don't sync if already active
      if (this.activeSync.has(projectData.projectId)) {
        return false;
      }
      
      // Don't sync if already queued and scheduled soon
      const queueEntry = this.syncQueue.get(projectData.projectId);
      if (queueEntry && queueEntry.scheduledAt <= Date.now() + 60000) { // Within 1 minute
        return false;
      }
      
      // Use the sync manager's shouldSync logic
      return this.syncManager.shouldSync(projectData);
      
    } catch (error) {
      this.logger.error(`Error checking if project should sync:`, error.message);
      return false;
    }
  }

  /**
   * Calculate priority for sync queue
   */
  calculatePriority(projectData) {
    let priority = 0;
    
    // Higher priority for projects with more pending commits
    priority += Math.min(projectData.totalPendingCommits || 0, 10);
    
    // Higher priority for main branch changes
    const hasMainBranchChanges = projectData.branches?.some(b => 
      (b.branchName === 'main' || b.tags?.includes('main')) && b.needsSync
    );
    if (hasMainBranchChanges) priority += 5;
    
    // Higher priority for recent activity
    const hoursSinceActivity = (Date.now() - (projectData.lastActivity || 0)) / (1000 * 60 * 60);
    if (hoursSinceActivity < 1) priority += 3;
    else if (hoursSinceActivity < 6) priority += 1;
    
    return priority;
  }

  /**
   * Schedule a project for syncing
   */
  async scheduleSync(projectId, delay = 0, options = {}) {
    const {
      projectPath = null,
      priority = 0,
      retryCount = 0,
      lastError = null
    } = options;
    
    const scheduledAt = Date.now() + delay;
    
    // Don't duplicate if already queued with same or earlier schedule
    const existing = this.syncQueue.get(projectId);
    if (existing && existing.scheduledAt <= scheduledAt) {
      this.logger.debug(`Project ${projectId} already queued for earlier sync`);
      return false;
    }
    
    const queueEntry = {
      projectId,
      projectPath,
      priority,
      scheduledAt,
      retryCount,
      lastError,
      createdAt: Date.now()
    };
    
    this.syncQueue.set(projectId, queueEntry);
    this.saveQueueItem(queueEntry);
    this.stats.queueSize = this.syncQueue.size;
    
    this.logger.info(`Scheduled sync for ${projectId} (delay: ${delay}ms, priority: ${priority})`);
    this.emit('syncScheduled', { projectId, scheduledAt, priority });
    
    // Process queue if sync is due soon
    if (delay < 5000) { // Within 5 seconds
      setTimeout(() => this.processQueue(), delay);
    }
    
    return true;
  }

  /**
   * Process the sync queue with concurrency limits
   */
  async processQueue() {
    if (!this.isRunning) return;
    
    this.logger.debug('Processing sync queue...');
    
    // Get ready items sorted by priority and schedule time
    const readyItems = Array.from(this.syncQueue.values())
      .filter(item => item.scheduledAt <= Date.now())
      .sort((a, b) => {
        // Sort by priority first, then by scheduled time
        const priorityDiff = b.priority - a.priority;
        if (priorityDiff !== 0) return priorityDiff;
        return a.scheduledAt - b.scheduledAt;
      });
    
    // Process items up to concurrency limit
    const availableSlots = this.config.maxConcurrentSyncs - this.activeSync.size;
    const itemsToProcess = readyItems.slice(0, availableSlots);
    
    if (itemsToProcess.length > 0) {
      this.logger.info(`Processing ${itemsToProcess.length} sync items (${this.activeSync.size} active)`);
    }
    
    // Start syncs for ready items
    for (const item of itemsToProcess) {
      this.processSyncItem(item);
    }
    
    // Update stats
    this.stats.queueSize = this.syncQueue.size;
    this.stats.activeSyncs = this.activeSync.size;
    
    // Schedule next queue processing if there are more items
    if (this.syncQueue.size > this.activeSync.size) {
      setTimeout(() => this.processQueue(), 5000); // Check again in 5 seconds
    }
  }

  /**
   * Process a single sync item
   */
  async processSyncItem(queueEntry) {
    const { projectId } = queueEntry;
    
    // Remove from queue and mark as active
    this.syncQueue.delete(projectId);
    this.removeQueueItem(projectId);
    
    const syncInfo = {
      projectId,
      syncId: `${projectId}-${Date.now()}`,
      startTime: Date.now(),
      queueEntry
    };
    
    this.activeSync.set(projectId, syncInfo);
    
    try {
      this.logger.info(`Starting sync for project: ${projectId}`);
      this.emit('syncStarted', { projectId, syncId: syncInfo.syncId });
      
      // Perform the actual sync
      const result = await this.syncManager.performSync(projectId);
      
      // Record success
      this.recordSyncHistory(syncInfo, result);
      this.stats.totalSyncs++;
      
      if (result.success && !result.skipped) {
        this.stats.successfulSyncs++;
        this.logger.info(`Sync completed for ${projectId}: ${result.branchesSynced} branches synced`);
        this.emit('syncCompleted', { projectId, result });
      } else if (result.skipped) {
        this.logger.debug(`Sync skipped for ${projectId}: ${result.reason}`);
        this.emit('syncSkipped', { projectId, result });
      } else {
        // Handle failure
        await this.handleSyncFailure(queueEntry, result.error || 'Sync failed');
      }
      
    } catch (error) {
      // Handle error
      await this.handleSyncFailure(queueEntry, error.message);
    } finally {
      // Clean up
      this.activeSync.delete(projectId);
      this.stats.activeSyncs = this.activeSync.size;
    }
  }

  /**
   * Handle sync failure with retry logic
   */
  async handleSyncFailure(queueEntry, errorMessage) {
    const { projectId } = queueEntry;
    
    this.logger.error(`Sync failed for ${projectId}: ${errorMessage}`);
    this.stats.failedSyncs++;
    
    // Record failure
    this.recordSyncHistory(
      { projectId, syncId: `${projectId}-${Date.now()}`, startTime: Date.now() },
      { success: false, error: errorMessage }
    );
    
    // Determine if we should retry
    const retryCount = (queueEntry.retryCount || 0) + 1;
    
    if (retryCount <= this.config.maxRetries) {
      // Calculate exponential backoff delay
      const baseDelay = this.config.retryDelay;
      const backoffDelay = baseDelay * Math.pow(2, retryCount - 1);
      const jitter = Math.random() * 0.1 * backoffDelay; // Add up to 10% jitter
      const delay = backoffDelay + jitter;
      
      // Check if it's a rate limit error
      const isRateLimit = errorMessage.toLowerCase().includes('rate limit') || 
                         errorMessage.toLowerCase().includes('api limit');
      const finalDelay = isRateLimit ? this.config.rateLimitDelay : delay;
      
      this.logger.warn(`Scheduling retry ${retryCount}/${this.config.maxRetries} for ${projectId} (delay: ${Math.round(finalDelay/1000)}s)`);
      
      // Reschedule with retry
      await this.scheduleSync(projectId, finalDelay, {
        ...queueEntry,
        retryCount,
        lastError: errorMessage,
        priority: Math.max(0, queueEntry.priority - 1) // Reduce priority on retry
      });
      
      this.emit('syncRetry', { projectId, retryCount, delay: finalDelay, error: errorMessage });
    } else {
      this.logger.error(`Max retries exceeded for ${projectId}, giving up`);
      this.emit('syncFailed', { projectId, error: errorMessage, retriesExhausted: true });
    }
  }

  /**
   * Manually trigger sync for a specific project
   */
  async triggerSync(projectId, options = {}) {
    const { immediate = false, priority = 10 } = options;
    
    this.logger.info(`Manual sync triggered for ${projectId} (immediate: ${immediate})`);
    
    const delay = immediate ? 0 : 1000; // 1 second delay if not immediate
    const scheduled = await this.scheduleSync(projectId, delay, {
      priority,
      ...options
    });
    
    if (scheduled && immediate) {
      // Process queue immediately for immediate syncs
      setTimeout(() => this.processQueue(), 100);
    }
    
    return scheduled;
  }

  /**
   * Get current scheduler status and statistics
   */
  getStatus() {
    const uptimeMs = this.stats.uptime ? Date.now() - this.stats.uptime : 0;
    
    return {
      isRunning: this.isRunning,
      uptime: uptimeMs,
      uptimeFormatted: this.formatDuration(uptimeMs),
      stats: {
        ...this.stats,
        queueSize: this.syncQueue.size,
        activeSyncs: this.activeSync.size
      },
      queue: Array.from(this.syncQueue.values()).map(item => ({
        projectId: item.projectId,
        priority: item.priority,
        scheduledAt: item.scheduledAt,
        scheduledIn: item.scheduledAt - Date.now(),
        retryCount: item.retryCount
      })),
      activeSync: Array.from(this.activeSync.values()).map(sync => ({
        projectId: sync.projectId,
        syncId: sync.syncId,
        duration: Date.now() - sync.startTime
      })),
      config: {
        scanInterval: this.config.scanInterval,
        maxConcurrentSyncs: this.config.maxConcurrentSyncs,
        maxRetries: this.config.maxRetries
      }
    };
  }

  /**
   * Get sync history for a project
   */
  getSyncHistory(projectId, limit = 10) {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM sync_history 
        WHERE project_id = ? 
        ORDER BY started_at DESC 
        LIMIT ?
      `);
      
      return stmt.all(projectId, limit);
    } catch (error) {
      this.logger.error('Failed to get sync history:', error.message);
      return [];
    }
  }

  /**
   * Clear completed sync history older than specified days
   */
  cleanupHistory(days = 30) {
    try {
      const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
      const stmt = this.db.prepare(`
        DELETE FROM sync_history 
        WHERE completed_at IS NOT NULL 
        AND completed_at < ?
      `);
      
      const result = stmt.run(cutoffTime);
      this.logger.info(`Cleaned up ${result.changes} old sync history records`);
      return result.changes;
    } catch (error) {
      this.logger.error('Failed to cleanup history:', error.message);
      return 0;
    }
  }

  /**
   * Setup graceful shutdown handlers
   */
  setupShutdownHandlers() {
    const shutdown = async (signal) => {
      this.logger.info(`Received ${signal}, starting graceful shutdown...`);
      await this.stop();
      process.exit(0);
    };
    
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  /**
   * Format duration in human readable format
   */
  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }
}

/**
 * Factory function to create and configure sync scheduler
 */
export function createSyncScheduler(mcpClient, options = {}) {
  return new SyncScheduler(mcpClient, options);
}

/**
 * Start sync scheduler as a standalone service
 */
export async function startSyncService(mcpClient, options = {}) {
  const scheduler = createSyncScheduler(mcpClient, options);
  
  // Add event listeners for monitoring
  scheduler.on('started', () => {
    console.log('🚀 GitHub Sync Service started');
  });
  
  scheduler.on('stopped', () => {
    console.log('🛑 GitHub Sync Service stopped');
  });
  
  scheduler.on('syncCompleted', ({ projectId, result }) => {
    console.log(`✅ Sync completed: ${projectId} (${result.branchesSynced} branches)`);
  });
  
  scheduler.on('syncFailed', ({ projectId, error }) => {
    console.log(`❌ Sync failed: ${projectId} - ${error}`);
  });
  
  await scheduler.start();
  return scheduler;
}

export default SyncScheduler; 