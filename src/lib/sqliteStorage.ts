import Database from 'better-sqlite3';
import path from 'path';
import { Checkpoint, ProjectSnapshot, ProjectFile } from '../types/Checkpoint';
import { Project, ConversationBrief } from '../components/LlmChat/context/types';
import { BranchInfo } from './branchService';

// Database path - configurable for different environments
const getDbPath = () => {
  if (typeof window !== 'undefined') {
    // Browser environment - won't work with better-sqlite3, but provides interface
    throw new Error('SQLite operations must be performed server-side');
  }
  
  // Node.js environment (API routes, local server)
  const dataDir = process.env.KIBITZ_DATA_DIR || path.join(process.cwd(), 'data');
  return path.join(dataDir, 'kibitz.db');
};

/**
 * SQLite Database Schema and Data Access Layer for Kibitz
 * 
 * Provides persistent storage for:
 * - Projects (isolated like repos) 
 * - Checkpoints/Commits (auto-commits and manual snapshots)
 * - Branches (Git-like branching with metadata)
 * - Files (file snapshots for each checkpoint)
 * - Conversations (chat history per project)
 * - Sync operations (for peer coordination)
 */
export class KibitzStorage {
  private db: Database.Database;
  private static instance: KibitzStorage | null = null;

  private constructor() {
    const dbPath = getDbPath();
    console.log(`Initializing SQLite database at: ${dbPath}`);
    
    this.db = new Database(dbPath);
    this.initializeSchema();
    this.setupOptimizations();
  }

  public static getInstance(): KibitzStorage {
    if (!KibitzStorage.instance) {
      KibitzStorage.instance = new KibitzStorage();
    }
    return KibitzStorage.instance;
  }

  /**
   * Initialize database schema with all required tables
   */
  private initializeSchema(): void {
    // Enable foreign keys and WAL mode for better concurrency
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('journal_mode = WAL');
    
    console.log('Creating database schema...');
    
    // Projects table - each project is like a conceptual repo
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        settings TEXT NOT NULL, -- JSON serialized ProjectSettings
        created_at INTEGER NOT NULL, -- Unix timestamp
        updated_at INTEGER NOT NULL,
        order_index INTEGER NOT NULL DEFAULT 0,
        custom_path TEXT,
        -- Metadata for peer coordination
        node_id TEXT, -- WebSocket node that created this project
        last_sync_timestamp INTEGER DEFAULT 0
      )
    `);

    // Checkpoints table - auto-commits and manual snapshots
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS checkpoints (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        timestamp INTEGER NOT NULL, -- Unix timestamp
        description TEXT NOT NULL,
        commit_hash TEXT, -- Git commit hash if available
        tags TEXT NOT NULL, -- JSON array of tags ['auto', 'manual', etc.]
        created_by_node TEXT, -- Node that created this checkpoint
        -- Snapshot metadata
        files_changed INTEGER DEFAULT 0,
        lines_added INTEGER DEFAULT 0,
        lines_removed INTEGER DEFAULT 0,
        -- Foreign key
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )
    `);

    // Project files table - file snapshots for each checkpoint
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS checkpoint_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        checkpoint_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_content TEXT NOT NULL,
        last_modified INTEGER NOT NULL, -- Unix timestamp
        file_size INTEGER DEFAULT 0,
        -- Foreign key
        FOREIGN KEY (checkpoint_id) REFERENCES checkpoints(id) ON DELETE CASCADE,
        -- Ensure unique file per checkpoint
        UNIQUE(checkpoint_id, file_path)
      )
    `);

    // Branches table - Git-like branch management
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS branches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL, -- 'feature', 'bugfix', 'iteration', 'experiment'
        created_at INTEGER NOT NULL,
        parent_branch TEXT DEFAULT 'main',
        commit_hash TEXT,
        description TEXT,
        files_changed TEXT, -- JSON array of file paths
        is_active BOOLEAN DEFAULT FALSE,
        -- Foreign key
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        -- Ensure unique branch name per project
        UNIQUE(project_id, name)
      )
    `);

    // Conversations table - chat history per project
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        messages TEXT NOT NULL, -- JSON serialized Message[]
        created_at INTEGER NOT NULL,
        last_updated INTEGER NOT NULL,
        -- Foreign key
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )
    `);

    // Sync log table - for peer coordination via WebSocket
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sync_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        operation_type TEXT NOT NULL, -- 'create', 'update', 'delete'
        table_name TEXT NOT NULL,
        record_id TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        node_id TEXT NOT NULL,
        data TEXT -- JSON data for the operation
      )
    `);

    console.log('Database schema initialized successfully');
  }

  /**
   * Setup database optimizations and indexes
   */
  private setupOptimizations(): void {
    console.log('Setting up database optimizations...');
    
    // Performance indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_checkpoints_project_timestamp 
      ON checkpoints(project_id, timestamp DESC);
      
      CREATE INDEX IF NOT EXISTS idx_checkpoints_commit_hash 
      ON checkpoints(commit_hash) WHERE commit_hash IS NOT NULL;
      
      CREATE INDEX IF NOT EXISTS idx_checkpoint_files_checkpoint 
      ON checkpoint_files(checkpoint_id);
      
      CREATE INDEX IF NOT EXISTS idx_branches_project_active 
      ON branches(project_id, is_active);
      
      CREATE INDEX IF NOT EXISTS idx_conversations_project_updated 
      ON conversations(project_id, last_updated DESC);
      
      CREATE INDEX IF NOT EXISTS idx_sync_log_timestamp 
      ON sync_log(timestamp DESC);
      
      CREATE INDEX IF NOT EXISTS idx_projects_order 
      ON projects(order_index, created_at DESC);
    `);

    // SQLite performance optimizations
    this.db.pragma('cache_size = 10000'); // 10MB cache
    this.db.pragma('temp_store = memory');
    this.db.pragma('mmap_size = 268435456'); // 256MB memory map
    this.db.pragma('synchronous = NORMAL'); // Good balance of safety vs performance
    
    console.log('Database optimizations applied');
  }

  // ==================== PROJECT OPERATIONS ====================

  /**
   * Create a new project
   */
  public createProject(project: Project, nodeId?: string): void {
    const transaction = this.db.transaction(() => {
      const stmt = this.db.prepare(`
        INSERT INTO projects (id, name, settings, created_at, updated_at, order_index, custom_path, node_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        project.id,
        project.name,
        JSON.stringify(project.settings),
        project.createdAt.getTime(),
        project.updatedAt.getTime(),
        project.order,
        project.customPath || null,
        nodeId || null
      );

      // Create conversations
      for (const conversation of project.conversations) {
        this.createConversation(project.id, conversation);
      }

      this.logSyncOperation('create', 'projects', project.id, nodeId);
    });

    transaction();
    console.log(`Created project: ${project.name} (${project.id})`);
  }

  /**
   * Get a project by ID with all related data
   */
  public getProject(projectId: string): Project | null {
    const stmt = this.db.prepare(`
      SELECT * FROM projects WHERE id = ?
    `);
    
    const row = stmt.get(projectId) as any;
    if (!row) return null;

    // Get conversations for this project
    const conversations = this.getConversations(projectId);

    return {
      id: row.id,
      name: row.name,
      settings: JSON.parse(row.settings),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      order: row.order_index,
      customPath: row.custom_path,
      conversations
    };
  }

  /**
   * Get all projects ordered by preference
   */
  public getAllProjects(): Project[] {
    const stmt = this.db.prepare(`
      SELECT * FROM projects ORDER BY order_index, created_at DESC
    `);
    
    const rows = stmt.all() as any[];
    return rows.map(row => {
      const conversations = this.getConversations(row.id);
      
      return {
        id: row.id,
        name: row.name,
        settings: JSON.parse(row.settings),
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
        order: row.order_index,
        customPath: row.custom_path,
        conversations
      };
    });
  }

  /**
   * Update project data
   */
  public updateProject(projectId: string, updates: Partial<Project>, nodeId?: string): void {
    const current = this.getProject(projectId);
    if (!current) throw new Error(`Project ${projectId} not found`);

    const updated = { ...current, ...updates, updatedAt: new Date() };
    
    const stmt = this.db.prepare(`
      UPDATE projects 
      SET name = ?, settings = ?, updated_at = ?, order_index = ?, custom_path = ?
      WHERE id = ?
    `);
    
    stmt.run(
      updated.name,
      JSON.stringify(updated.settings),
      updated.updatedAt.getTime(),
      updated.order,
      updated.customPath || null,
      projectId
    );

    this.logSyncOperation('update', 'projects', projectId, nodeId);
    console.log(`Updated project: ${updated.name} (${projectId})`);
  }

  /**
   * Delete project and all related data
   */
  public deleteProject(projectId: string, nodeId?: string): void {
    const stmt = this.db.prepare(`DELETE FROM projects WHERE id = ?`);
    const result = stmt.run(projectId);
    
    if (result.changes > 0) {
      this.logSyncOperation('delete', 'projects', projectId, nodeId);
      console.log(`Deleted project: ${projectId} and all related data`);
    }
  }

  // ==================== CHECKPOINT OPERATIONS ====================

  /**
   * Create a new checkpoint with optional file snapshots
   */
  public createCheckpoint(checkpoint: Checkpoint, files?: ProjectFile[], nodeId?: string): void {
    const transaction = this.db.transaction(() => {
      // Insert checkpoint
      const checkpointStmt = this.db.prepare(`
        INSERT INTO checkpoints (
          id, project_id, timestamp, description, commit_hash, tags, 
          created_by_node, files_changed, lines_added, lines_removed
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      checkpointStmt.run(
        checkpoint.id,
        checkpoint.projectId,
        checkpoint.timestamp.getTime(),
        checkpoint.description,
        checkpoint.commitHash || null,
        JSON.stringify(checkpoint.tags),
        nodeId || null,
        files?.length || 0,
        0, // TODO: Calculate from diff analysis if needed
        0  // TODO: Calculate from diff analysis if needed
      );

      // Insert file snapshots if provided
      if (files && files.length > 0) {
        const fileStmt = this.db.prepare(`
          INSERT OR REPLACE INTO checkpoint_files (checkpoint_id, file_path, file_content, last_modified, file_size)
          VALUES (?, ?, ?, ?, ?)
        `);
        
        for (const file of files) {
          fileStmt.run(
            checkpoint.id,
            file.path,
            file.content,
            file.lastModified.getTime(),
            Buffer.byteLength(file.content, 'utf8')
          );
        }
      }
    });

    transaction();
    this.logSyncOperation('create', 'checkpoints', checkpoint.id, nodeId);
    console.log(`Created checkpoint: ${checkpoint.description} (${checkpoint.id})`);
  }

  /**
   * Get checkpoints for a project, ordered by timestamp
   */
  public getCheckpoints(projectId: string, limit: number = 50): Checkpoint[] {
    const stmt = this.db.prepare(`
      SELECT * FROM checkpoints 
      WHERE project_id = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `);
    
    const rows = stmt.all(projectId, limit) as any[];
    
    return rows.map(row => {
      const project = this.getProject(projectId);
      const files = this.getCheckpointFiles(row.id);
      
      return {
        id: row.id,
        projectId: row.project_id,
        timestamp: new Date(row.timestamp),
        description: row.description,
        commitHash: row.commit_hash,
        tags: JSON.parse(row.tags),
        snapshotData: {
          project: project!,
          files
        }
      };
    });
  }

  /**
   * Get a specific checkpoint by ID
   */
  public getCheckpoint(checkpointId: string): Checkpoint | null {
    const stmt = this.db.prepare(`SELECT * FROM checkpoints WHERE id = ?`);
    const row = stmt.get(checkpointId) as any;
    
    if (!row) return null;

    const project = this.getProject(row.project_id);
    const files = this.getCheckpointFiles(row.id);

    return {
      id: row.id,
      projectId: row.project_id,
      timestamp: new Date(row.timestamp),
      description: row.description,
      commitHash: row.commit_hash,
      tags: JSON.parse(row.tags),
      snapshotData: {
        project: project!,
        files
      }
    };
  }

  /**
   * Get file snapshots for a checkpoint
   */
  public getCheckpointFiles(checkpointId: string): ProjectFile[] {
    const stmt = this.db.prepare(`
      SELECT * FROM checkpoint_files 
      WHERE checkpoint_id = ?
      ORDER BY file_path
    `);
    
    const rows = stmt.all(checkpointId) as any[];
    
    return rows.map(row => ({
      path: row.file_path,
      content: row.file_content,
      lastModified: new Date(row.last_modified)
    }));
  }

  /**
   * Clean up old checkpoints beyond the configured limit
   */
  public cleanupOldCheckpoints(projectId: string, maxCheckpoints: number = 20): number {
    const stmt = this.db.prepare(`
      DELETE FROM checkpoints 
      WHERE project_id = ? 
      AND id NOT IN (
        SELECT id FROM checkpoints 
        WHERE project_id = ? 
        ORDER BY timestamp DESC 
        LIMIT ?
      )
    `);
    
    const result = stmt.run(projectId, projectId, maxCheckpoints);
    if (result.changes > 0) {
      console.log(`Cleaned up ${result.changes} old checkpoints for project ${projectId}`);
    }
    return result.changes;
  }

  // ==================== BRANCH OPERATIONS ====================

  /**
   * Create a new branch
   */
  public createBranch(projectId: string, branchInfo: BranchInfo, nodeId?: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO branches (
        project_id, name, type, created_at, parent_branch, 
        commit_hash, description, files_changed, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      projectId,
      branchInfo.name,
      branchInfo.type,
      branchInfo.createdAt.getTime(),
      branchInfo.parentBranch,
      branchInfo.commitHash,
      branchInfo.description,
      JSON.stringify(branchInfo.filesChanged),
      branchInfo.isActive ? 1 : 0
    );

    this.logSyncOperation('create', 'branches', branchInfo.name, nodeId);
    console.log(`Created branch: ${branchInfo.name} (${branchInfo.type})`);
  }

  /**
   * Get all branches for a project
   */
  public getBranches(projectId: string): BranchInfo[] {
    const stmt = this.db.prepare(`
      SELECT * FROM branches 
      WHERE project_id = ? 
      ORDER BY created_at DESC
    `);
    
    const rows = stmt.all(projectId) as any[];
    
    return rows.map(row => ({
      name: row.name,
      type: row.type,
      createdAt: new Date(row.created_at),
      parentBranch: row.parent_branch,
      commitHash: row.commit_hash,
      description: row.description,
      filesChanged: JSON.parse(row.files_changed || '[]'),
      isActive: Boolean(row.is_active)
    }));
  }

  /**
   * Update branch active status
   */
  public setActiveBranch(projectId: string, branchName: string): void {
    const transaction = this.db.transaction(() => {
      // Deactivate all branches for this project
      const deactivateStmt = this.db.prepare(`
        UPDATE branches SET is_active = FALSE WHERE project_id = ?
      `);
      deactivateStmt.run(projectId);

      // Activate the specified branch
      const activateStmt = this.db.prepare(`
        UPDATE branches SET is_active = TRUE WHERE project_id = ? AND name = ?
      `);
      activateStmt.run(projectId, branchName);
    });

    transaction();
    console.log(`Set active branch for project ${projectId}: ${branchName}`);
  }

  // ==================== CONVERSATION OPERATIONS ====================

  /**
   * Create a conversation
   */
  public createConversation(projectId: string, conversation: ConversationBrief): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO conversations (id, project_id, name, messages, created_at, last_updated)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      conversation.id,
      projectId,
      conversation.name,
      JSON.stringify(conversation.messages),
      conversation.createdAt?.getTime() || Date.now(),
      conversation.lastUpdated.getTime()
    );
  }

  /**
   * Get conversations for a project
   */
  public getConversations(projectId: string): ConversationBrief[] {
    const stmt = this.db.prepare(`
      SELECT * FROM conversations 
      WHERE project_id = ? 
      ORDER BY last_updated DESC
    `);
    
    const rows = stmt.all(projectId) as any[];
    
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      messages: JSON.parse(row.messages),
      createdAt: new Date(row.created_at),
      lastUpdated: new Date(row.last_updated)
    }));
  }

  /**
   * Update conversation messages
   */
  public updateConversation(conversationId: string, messages: any[], nodeId?: string): void {
    const stmt = this.db.prepare(`
      UPDATE conversations 
      SET messages = ?, last_updated = ?
      WHERE id = ?
    `);
    
    stmt.run(
      JSON.stringify(messages),
      Date.now(),
      conversationId
    );

    this.logSyncOperation('update', 'conversations', conversationId, nodeId);
  }

  // ==================== SYNC OPERATIONS ====================

  /**
   * Log sync operations for peer coordination via WebSocket
   */
  private logSyncOperation(
    operationType: 'create' | 'update' | 'delete',
    tableName: string,
    recordId: string,
    nodeId?: string
  ): void {
    const stmt = this.db.prepare(`
      INSERT INTO sync_log (operation_type, table_name, record_id, timestamp, node_id, data)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      operationType,
      tableName,
      recordId,
      Date.now(),
      nodeId || 'unknown',
      JSON.stringify({ operationType, tableName, recordId, timestamp: Date.now() })
    );
  }

  /**
   * Get sync operations since timestamp (for peer coordination)
   */
  public getSyncOperationsSince(timestamp: number, nodeId?: string): any[] {
    let stmt;
    let params: any[];
    
    if (nodeId) {
      // Exclude operations from the requesting node to avoid echo
      stmt = this.db.prepare(`
        SELECT * FROM sync_log 
        WHERE timestamp > ? AND node_id != ?
        ORDER BY timestamp ASC
        LIMIT 1000
      `);
      params = [timestamp, nodeId];
    } else {
      stmt = this.db.prepare(`
        SELECT * FROM sync_log 
        WHERE timestamp > ? 
        ORDER BY timestamp ASC
        LIMIT 1000
      `);
      params = [timestamp];
    }
    
    return stmt.all(...params) as any[];
  }

  /**
   * Clean up old sync log entries to prevent unbounded growth
   */
  public cleanupSyncLog(olderThanDays: number = 7): number {
    const cutoff = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
    const stmt = this.db.prepare(`DELETE FROM sync_log WHERE timestamp < ?`);
    const result = stmt.run(cutoff);
    
    if (result.changes > 0) {
      console.log(`Cleaned up ${result.changes} old sync log entries`);
    }
    return result.changes;
  }

  // ==================== MAINTENANCE & ANALYTICS ====================

  /**
   * Get comprehensive database statistics
   */
  public getStats(): any {
    const stats = this.db.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM projects) as project_count,
        (SELECT COUNT(*) FROM checkpoints) as checkpoint_count,
        (SELECT COUNT(*) FROM branches) as branch_count,
        (SELECT COUNT(*) FROM conversations) as conversation_count,
        (SELECT COUNT(*) FROM checkpoint_files) as file_count,
        (SELECT COUNT(*) FROM sync_log) as sync_operations,
        (SELECT MAX(timestamp) FROM sync_log) as last_sync_time
    `).get();
    
    return {
      ...stats,
      database_size: this.getDatabaseSize(),
      last_sync_time: stats.last_sync_time ? new Date(stats.last_sync_time) : null
    };
  }

  /**
   * Get database file size
   */
  private getDatabaseSize(): number {
    const result = this.db.prepare(`SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()`).get() as any;
    return result.size;
  }

  /**
   * Vacuum database to reclaim space and optimize
   */
  public vacuum(): void {
    console.log('Vacuuming database...');
    this.db.exec('VACUUM');
    console.log('Database vacuum completed');
  }

  /**
   * Create database backup
   */
  public backup(backupPath: string): void {
    const backup = this.db.backup(backupPath);
    backup.step(-1);
    backup.finish();
    console.log(`Database backed up to: ${backupPath}`);
  }

  /**
   * Close database connection
   */
  public close(): void {
    this.db.close();
    KibitzStorage.instance = null;
    console.log('Database connection closed');
  }
}

// Export singleton instance and helper functions
export const storage = KibitzStorage.getInstance();

/**
 * Helper function to ensure storage is available in server contexts
 */
export const ensureStorage = (): KibitzStorage => {
  if (typeof window !== 'undefined') {
    throw new Error('SQLite operations must be performed server-side');
  }
  return storage;
}; 