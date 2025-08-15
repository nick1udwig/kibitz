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
  // ... existing code ...
}

export function createSyncScheduler(mcpClient, options = {}) {
  return new SyncScheduler(mcpClient, options);
}

export async function startSyncService(mcpClient, options = {}) {
  const scheduler = createSyncScheduler(mcpClient, options);
  
  scheduler.on('started', () => { console.log('🚀 GitHub Sync Service started'); });
  scheduler.on('stopped', () => { console.log('🛑 GitHub Sync Service stopped'); });
  scheduler.on('syncCompleted', ({ projectId, result }) => { console.log(`✅ Sync completed: ${projectId} (${result.branchesSynced} branches)`); });
  scheduler.on('syncFailed', ({ projectId, error }) => { console.log(`❌ Sync failed: ${projectId} - ${error}`); });
  
  await scheduler.start();
  return scheduler;
}


