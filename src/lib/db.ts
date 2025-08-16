import { Project, ConversationBrief, WorkspaceMapping, AutoCommitBranch, BranchRevert, AutoCommitAgentStatus, ConversationBranchHistory } from '../components/LlmChat/context/types';
import { convertLegacyToProviderConfig } from '../components/LlmChat/types/provider';
import { DEFAULT_PROJECT_SETTINGS } from '../stores/rootStore';
import { Message } from '../components/LlmChat/types';
import { McpServer } from '../components/LlmChat/types/mcp';
import { 
  logWorkspaceOperation
} from './conversationWorkspaceService';

const DB_NAME = 'kibitz_db';
export const DB_VERSION = 10; // 🌟 UPDATED: Version 10 for auto-commit branch support

// Define all expected object stores for validation
const EXPECTED_OBJECT_STORES = [
  'projects',
  'appState',
  'mcpServers',
  'workspaceMappings',
  'conversationSettings',
  'workspaceBackups',
  'workspaceStats',
  'autoCommitBranches',
  'branchReverts',
  'autoCommitAgentStatus',
  'branchHistory'
];

interface DbState {
  projects: Project[];
  activeProjectId: string | null;
  activeConversationId: string | null;
}



interface KibitzDb extends IDBDatabase {
  createObjectStore(name: string, options?: IDBObjectStoreParameters): IDBObjectStore;
}

/**
 * Enhanced database initialization with recovery capabilities
 */
export const initDb = async (): Promise<KibitzDb> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('Database initialization failed:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      const db = request.result as KibitzDb;
      
      // Validate schema after successful open
      if (!validateDatabaseSchema(db)) {
        console.warn('Database schema validation failed, attempting recovery...');
        db.close();
        
        // Attempt to recover by recreating the database
        recreateDatabase().then(resolve).catch(reject);
        return;
      }
      
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result as KibitzDb;
      console.log(`Database upgrade needed: ${event.oldVersion} -> ${DB_VERSION}`);

      try {
        // Execute all migrations
        performDatabaseMigrations(db, event.oldVersion, DB_VERSION);
        
        // Validate schema after migrations
        if (!validateDatabaseSchema(db)) {
          throw new Error('Database schema validation failed after migrations');
      }
        
        console.log('Database migrations completed successfully');
      } catch (error) {
        console.error('Database migration failed:', error);
        reject(error);
        }
    };
  });
};

/**
 * Validate that all expected object stores exist
 */
function validateDatabaseSchema(db: KibitzDb): boolean {
  try {
    const missingStores = EXPECTED_OBJECT_STORES.filter(storeName => 
      !db.objectStoreNames.contains(storeName)
    );
    
    if (missingStores.length > 0) {
      console.warn('Missing object stores:', missingStores);
      return false;
    }
    
    console.log('Database schema validation passed');
    return true;
  } catch (error) {
    console.error('Schema validation error:', error);
    return false;
          }
}

/**
 * Recreate the database from scratch
 */
async function recreateDatabase(): Promise<KibitzDb> {
  return new Promise((resolve, reject) => {
    console.log('Attempting to recreate database...');
    
    // Close all connections and delete the database
    const deleteRequest = indexedDB.deleteDatabase(DB_NAME);
    
    deleteRequest.onerror = () => {
      console.error('Failed to delete database:', deleteRequest.error);
      reject(deleteRequest.error);
    };
    
    deleteRequest.onsuccess = () => {
      console.log('Database deleted successfully, creating new one...');

      // Create new database with latest schema
      const createRequest = indexedDB.open(DB_NAME, DB_VERSION);
      
      createRequest.onerror = () => {
        console.error('Failed to recreate database:', createRequest.error);
        reject(createRequest.error);
      };
      
      createRequest.onsuccess = () => {
        console.log('Database recreated successfully');
        resolve(createRequest.result as KibitzDb);
      };
      
      createRequest.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result as KibitzDb;
        
        try {
          // Create all object stores from scratch
          performDatabaseMigrations(db, 0, DB_VERSION);
          console.log('Database schema recreated successfully');
            } catch (error) {
          console.error('Failed to recreate database schema:', error);
          reject(error);
              }
      };
    };
  });
}

/**
 * Perform database migrations with error handling
 */
function performDatabaseMigrations(db: KibitzDb, oldVersion: number, _newVersion: number = DB_VERSION): void {
  // Mark parameter as intentionally unused to satisfy lint rules
  void _newVersion;
  try {
    if (oldVersion < 1) {
      createV1Schema(db);
              }
    if (oldVersion < 2) {
      migrateToV2();
          }
    if (oldVersion < 3) {
      migrateToV3(db);
      }
    if (oldVersion < 4) {
      migrateToV4();
    }
    if (oldVersion < 5) {
      migrateToV5();
    }
    if (oldVersion < 6) {
      migrateToV6();
    }
    if (oldVersion < 7) {
      migrateToV7();
    }
    if (oldVersion < 8) {
      migrateToV8();
    }
    if (oldVersion < 9) {
      migrateToV9(db);
    }
    if (oldVersion < 10) {
      migrateToV10(db);
    }
            } catch (error) {
    console.error('Migration error:', error);
    throw error;
          }
}

/**
 * Create initial schema (version 1)
 */
function createV1Schema(db: KibitzDb): void {
  console.log('Creating v1 schema...');
  
  // Projects store
  const projectStore = db.createObjectStore('projects', { keyPath: 'id' });
  projectStore.createIndex('createdAt', 'createdAt');
  projectStore.createIndex('updatedAt', 'updatedAt');
  projectStore.createIndex('name', 'name');
  projectStore.createIndex('order', 'order');

  // App state store (for active IDs)
  db.createObjectStore('appState', { keyPath: 'id' });

  // MCP servers store
  const mcpStore = db.createObjectStore('mcpServers', { keyPath: 'id' });
  mcpStore.createIndex('name', 'name');

  // Create indexes for future search capabilities
  projectStore.createIndex('settings.systemPrompt', 'settings.systemPrompt');
  projectStore.createIndex('conversations.name', 'conversations.name', { multiEntry: true });
  projectStore.createIndex('conversations.messages.content', 'conversations.messages.content', { multiEntry: true });
              }

/**
 * Migrate to version 2
 */
function migrateToV2(): void {
  console.log('Migrating to v2...');
  // Migration logic for v2 would go here
  // This is a placeholder for the actual migration logic
}

/**
 * Migrate to version 3
 */
function migrateToV3(db: KibitzDb): void {
  console.log('Migrating to v3...');
  // Move MCP servers to a separate object store
  if (!db.objectStoreNames.contains('mcpServers')) {
    const mcpStore = db.createObjectStore('mcpServers', { keyPath: 'id' });
    mcpStore.createIndex('name', 'name');
  }
}

/**
 * Migrate to version 4
 */
function migrateToV4(): void {
  console.log('Migrating to v4...');
  // Add provider field and separate API keys to existing projects
  // This migration would be handled in the transaction
}

/**
 * Migrate to version 5
 */
function migrateToV5(): void {
  console.log('Migrating to v5...');
  // Add new providerConfig field to existing projects
  // This migration would be handled in the transaction
}

/**
 * Migrate to version 6
 */
function migrateToV6(): void {
  console.log('Migrating to v6...');
  // Migrate messages to GenericMessage format
  // This migration would be handled in the transaction
}

/**
 * Migrate to version 7
 */
function migrateToV7(): void {
  console.log('Migrating to v7...');
  // Add savedPrompts array to existing projects
  // This migration would be handled in the transaction
}

/**
 * Migrate to version 8
 */
function migrateToV8(): void {
  console.log('Migrating to v8...');
  // Version 8 migration logic
}

/**
 * Migrate to version 9
 */
function migrateToV9(db: KibitzDb): void {
  console.log('Migrating to v9...');
  logWorkspaceOperation('DATABASE_MIGRATION_V9', { newVersion: 9 });

        // Create workspace mappings table
        if (!db.objectStoreNames.contains('workspaceMappings')) {
    const workspaceStore = db.createObjectStore('workspaceMappings', { keyPath: 'workspaceId' });
          workspaceStore.createIndex('conversationId', 'conversationId');
          workspaceStore.createIndex('projectId', 'projectId');
          workspaceStore.createIndex('workspaceStatus', 'workspaceStatus');
          workspaceStore.createIndex('lastAccessedAt', 'lastAccessedAt');
        }

        // Create conversation settings table
        if (!db.objectStoreNames.contains('conversationSettings')) {
    const conversationSettingsStore = db.createObjectStore('conversationSettings', { keyPath: 'conversationId' });
          conversationSettingsStore.createIndex('projectId', 'projectId');
        }

        // Create workspace backups table
        if (!db.objectStoreNames.contains('workspaceBackups')) {
          const workspaceBackupsStore = db.createObjectStore('workspaceBackups', { keyPath: 'workspaceId' });
          workspaceBackupsStore.createIndex('createdAt', 'createdAt');
        }

        // Create workspace usage stats table
        if (!db.objectStoreNames.contains('workspaceStats')) {
    db.createObjectStore('workspaceStats', { keyPath: 'id' });
        }
}

/**
 * Migrate to version 10
 */
function migrateToV10(db: KibitzDb): void {
  console.log('Migrating to v10...');
  logWorkspaceOperation('DATABASE_MIGRATION_V10', { newVersion: 10 });

        // Create auto-commit branches table
        if (!db.objectStoreNames.contains('autoCommitBranches')) {
    const branchesStore = db.createObjectStore('autoCommitBranches', { keyPath: 'branchId' });
          branchesStore.createIndex('conversationId', 'conversationId');
          branchesStore.createIndex('projectId', 'projectId');
          branchesStore.createIndex('branchName', 'branchName');
          branchesStore.createIndex('createdAt', 'createdAt');
          branchesStore.createIndex('isAutoCommit', 'isAutoCommit');
        }

        // Create branch reverts table
        if (!db.objectStoreNames.contains('branchReverts')) {
          const revertsStore = db.createObjectStore('branchReverts', { keyPath: 'revertId' });
          revertsStore.createIndex('conversationId', 'conversationId');
          revertsStore.createIndex('projectId', 'projectId');
          revertsStore.createIndex('sourceBranchId', 'sourceBranchId');
          revertsStore.createIndex('targetBranchId', 'targetBranchId');
          revertsStore.createIndex('revertedAt', 'revertedAt');
          revertsStore.createIndex('revertStatus', 'revertStatus');
        }

        // Create auto-commit agent status table
        if (!db.objectStoreNames.contains('autoCommitAgentStatus')) {
    const agentStatusStore = db.createObjectStore('autoCommitAgentStatus', { keyPath: 'id' });

        // Initialize auto-commit agent status
          agentStatusStore.add({
          id: 'global',
          isRunning: false,
          totalBranchesCreated: 0,
          totalCommits: 0,
          totalReverts: 0,
          currentInterval: 3, // 3 minutes default
          errors: [],
          lastUpdated: new Date()
        });
        }

  // Create branch history table
  if (!db.objectStoreNames.contains('branchHistory')) {
    const branchHistoryStore = db.createObjectStore('branchHistory', { keyPath: 'conversationId' });
    branchHistoryStore.createIndex('projectId', 'projectId');
    branchHistoryStore.createIndex('totalBranches', 'totalBranches');
    branchHistoryStore.createIndex('oldestBranch', 'oldestBranch');
    branchHistoryStore.createIndex('newestBranch', 'newestBranch');
        }

        logWorkspaceOperation('DATABASE_MIGRATION_V10_COMPLETE', { 
          tablesCreated: ['autoCommitBranches', 'branchReverts', 'autoCommitAgentStatus', 'branchHistory']
        });
      }

/**
 * Safe database operation wrapper
 */
async function safeDbOperation<T>(
  operation: (db: KibitzDb) => Promise<T>,
  operationName: string
): Promise<T> {
  try {
    const db = await initDb();
    return await operation(db);
  } catch (error) {
    console.error(`Database operation '${operationName}' failed:`, error);
    
    // Attempt recovery if it's a schema-related error
    if (error instanceof Error && error.message.includes('object store')) {
      console.log('Attempting database recovery...');
      try {
        const recoveredDb = await recreateDatabase();
        return await operation(recoveredDb);
      } catch (recoveryError) {
        console.error('Database recovery failed:', recoveryError);
        throw recoveryError;
      }
    }
    
    throw error;
  }
}

/**
 * Safe transaction wrapper
 */
function safeTransaction<T>(
  db: KibitzDb,
  storeNames: string[],
  mode: IDBTransactionMode,
  operation: (transaction: IDBTransaction) => Promise<T>
): Promise<T> {
  return new Promise((resolve, reject) => {
    // Validate that all stores exist
    const missingStores = storeNames.filter(storeName => 
      !db.objectStoreNames.contains(storeName)
    );
    
    if (missingStores.length > 0) {
      reject(new Error(`Missing object stores: ${missingStores.join(', ')}`));
      return;
    }
    
    try {
      const transaction = db.transaction(storeNames, mode);
      
      transaction.onerror = () => {
        console.error('Transaction failed:', transaction.error);
        reject(transaction.error);
      };
      
      transaction.onabort = () => {
        console.error('Transaction aborted');
        reject(new Error('Transaction aborted'));
      };
      
      operation(transaction).then(resolve).catch(reject);
    } catch (error) {
      console.error('Failed to create transaction:', error);
      reject(error);
    }
  });
}

export const loadState = async (): Promise<DbState> => {
  return safeDbOperation(async (db) => {
  // Helper to validate and fix project settings
  const validateProject = (project: Project): Project => {
    if (!project.settings) {
      project.settings = { ...DEFAULT_PROJECT_SETTINGS };
    } else {
      project.settings = {
        ...DEFAULT_PROJECT_SETTINGS,
        ...project.settings,
        provider: project.settings.provider || DEFAULT_PROJECT_SETTINGS.provider,
        providerConfig: project.settings.providerConfig ||
          convertLegacyToProviderConfig(project.settings.provider || DEFAULT_PROJECT_SETTINGS.provider, project.settings)
      };
    }
    return project;
  };

    return safeTransaction(db, ['projects', 'appState'], 'readonly', (transaction) => {
  return new Promise((resolve, reject) => {
    const projectStore = transaction.objectStore('projects');
    const stateStore = transaction.objectStore('appState');

    const projects: Project[] = [];
    const state: Partial<DbState> = {};

    projectStore.index('order').openCursor().onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        projects.push(validateProject(cursor.value));
        cursor.continue();
      }
    };

    stateStore.get('activeIds').onsuccess = (event) => {
      const result = (event.target as IDBRequest).result;
      if (result) {
        state.activeProjectId = result.activeProjectId;
        state.activeConversationId = result.activeConversationId;
      }
    };

    transaction.oncomplete = () => {
      resolve({
        projects,
        activeProjectId: state.activeProjectId || null,
        activeConversationId: state.activeConversationId || null
      });
    };

    transaction.onerror = () => reject(transaction.error);
  });
    });
  }, 'loadState');
};

// 🌟 NEW: Load workspace mappings from database
export const loadWorkspaceMappings = async (): Promise<WorkspaceMapping[]> => {
  return safeDbOperation(async (db) => {
    return safeTransaction(db, ['workspaceMappings'], 'readonly', (transaction) => {
  return new Promise((resolve, reject) => {
    const workspaceStore = transaction.objectStore('workspaceMappings');
    const workspaces: WorkspaceMapping[] = [];

    workspaceStore.openCursor().onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        // Convert date strings back to Date objects
        const workspace = cursor.value;
        workspace.createdAt = new Date(workspace.createdAt);
        workspace.lastAccessedAt = new Date(workspace.lastAccessedAt);
        if (workspace.lastBackupAt) {
          workspace.lastBackupAt = new Date(workspace.lastBackupAt);
        }
        workspaces.push(workspace);
        cursor.continue();
      }
    };

    transaction.oncomplete = () => {
      logWorkspaceOperation('WORKSPACE_MAPPINGS_LOADED', { count: workspaces.length });
      resolve(workspaces);
    };
    transaction.onerror = () => reject(transaction.error);
  });
    });
  }, 'loadWorkspaceMappings');
};

// 🌟 NEW: Save workspace mappings to database
export const saveWorkspaceMappings = async (workspaces: WorkspaceMapping[]): Promise<void> => {
  return safeDbOperation(async (db) => {
    return safeTransaction(db, ['workspaceMappings'], 'readwrite', (transaction) => {
  return new Promise((resolve, reject) => {
    const workspaceStore = transaction.objectStore('workspaceMappings');

    // Clear existing mappings
    workspaceStore.clear();

    // Save all workspace mappings
    workspaces.forEach(workspace => {
      const sanitizedWorkspace = {
        ...workspace,
        createdAt: workspace.createdAt.toISOString(),
        lastAccessedAt: workspace.lastAccessedAt.toISOString(),
        lastBackupAt: workspace.lastBackupAt?.toISOString()
      };
      workspaceStore.add(sanitizedWorkspace);
    });

    transaction.oncomplete = () => {
      logWorkspaceOperation('WORKSPACE_MAPPINGS_SAVED', { count: workspaces.length });
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
    });
  }, 'saveWorkspaceMappings');
};

// 🌟 NEW: Load conversation settings from database
export const loadConversationSettings = async (): Promise<Record<string, unknown>> => {
  return safeDbOperation(async (db) => {
    return safeTransaction(db, ['conversationSettings'], 'readonly', (transaction) => {
  return new Promise((resolve, reject) => {
    const settingsStore = transaction.objectStore('conversationSettings');
    const settings: Record<string, unknown> = {};

    settingsStore.openCursor().onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        settings[cursor.value.conversationId] = cursor.value.settings;
        cursor.continue();
      }
    };

    transaction.oncomplete = () => {
      logWorkspaceOperation('CONVERSATION_SETTINGS_LOADED', { count: Object.keys(settings).length });
      resolve(settings);
    };
    transaction.onerror = () => reject(transaction.error);
  });
    });
  }, 'loadConversationSettings');
};

// 🌟 NEW: Save conversation settings to database
export const saveConversationSettings = async (settings: Record<string, unknown>): Promise<void> => {
  return safeDbOperation(async (db) => {
    return safeTransaction(db, ['conversationSettings'], 'readwrite', (transaction) => {
  return new Promise((resolve, reject) => {
    const settingsStore = transaction.objectStore('conversationSettings');

    // Clear existing settings
    settingsStore.clear();

    // Save all conversation settings
    Object.entries(settings).forEach(([conversationId, settingsData]) => {
      settingsStore.add({
        conversationId,
        settings: settingsData
      });
    });

    transaction.oncomplete = () => {
      logWorkspaceOperation('CONVERSATION_SETTINGS_SAVED', { count: Object.keys(settings).length });
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
    });
  }, 'saveConversationSettings');
};

// 🌟 NEW: Get workspace mapping by conversation ID
export const getWorkspaceByConversationId = async (conversationId: string): Promise<WorkspaceMapping | null> => {
  return safeDbOperation(async (db) => {
    return safeTransaction(db, ['workspaceMappings'], 'readonly', (transaction) => {
  return new Promise((resolve, reject) => {
    const workspaceStore = transaction.objectStore('workspaceMappings');
    const index = workspaceStore.index('conversationId');

    index.get(conversationId).onsuccess = (event) => {
      const result = (event.target as IDBRequest).result;
      if (result) {
        // Convert date strings back to Date objects
        result.createdAt = new Date(result.createdAt);
        result.lastAccessedAt = new Date(result.lastAccessedAt);
        if (result.lastBackupAt) {
          result.lastBackupAt = new Date(result.lastBackupAt);
        }
        resolve(result);
      } else {
        resolve(null);
      }
    };

    transaction.onerror = () => reject(transaction.error);
  });
    });
  }, 'getWorkspaceByConversationId');
};

// 🌟 NEW: Update workspace mapping
export const updateWorkspaceMapping = async (workspaceMapping: WorkspaceMapping): Promise<void> => {
  return safeDbOperation(async (db) => {
    return safeTransaction(db, ['workspaceMappings'], 'readwrite', (transaction) => {
  return new Promise((resolve, reject) => {
    const workspaceStore = transaction.objectStore('workspaceMappings');

    const sanitizedWorkspace = {
      ...workspaceMapping,
      createdAt: workspaceMapping.createdAt.toISOString(),
      lastAccessedAt: workspaceMapping.lastAccessedAt.toISOString(),
      lastBackupAt: workspaceMapping.lastBackupAt?.toISOString()
    };

    workspaceStore.put(sanitizedWorkspace);

    transaction.oncomplete = () => {
      logWorkspaceOperation('WORKSPACE_MAPPING_UPDATED', { 
        workspaceId: workspaceMapping.workspaceId,
        conversationId: workspaceMapping.conversationId 
      });
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
    });
  }, 'updateWorkspaceMapping');
};

// 🌟 NEW: Delete workspace mapping
export const deleteWorkspaceMapping = async (workspaceId: string): Promise<void> => {
  return safeDbOperation(async (db) => {
    return safeTransaction(db, ['workspaceMappings', 'conversationSettings'], 'readwrite', (transaction) => {
  return new Promise((resolve, reject) => {
    const workspaceStore = transaction.objectStore('workspaceMappings');
    const settingsStore = transaction.objectStore('conversationSettings');

    // First get the workspace mapping to find conversationId
    workspaceStore.get(workspaceId).onsuccess = (event) => {
      const workspace = (event.target as IDBRequest).result;
      if (workspace) {
        // Delete workspace mapping
        workspaceStore.delete(workspaceId);
        
        // Delete associated conversation settings
        settingsStore.delete(workspace.conversationId);
        
        logWorkspaceOperation('WORKSPACE_MAPPING_DELETED', { 
          workspaceId,
          conversationId: workspace.conversationId 
        });
      }
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
    });
  }, 'deleteWorkspaceMapping');
};

// 🌟 NEW: Get workspace statistics
export const getWorkspaceStats = async (): Promise<Record<string, unknown>> => {
  return safeDbOperation(async (db) => {
    return safeTransaction(db, ['workspaceStats'], 'readonly', (transaction) => {
  return new Promise((resolve, reject) => {
    const statsStore = transaction.objectStore('workspaceStats');

    statsStore.get('global').onsuccess = (event) => {
      const result = (event.target as IDBRequest).result;
      if (result) {
        resolve(result);
      } else {
        // Return default stats if none exist
        resolve({
          id: 'global',
          totalWorkspaces: 0,
          activeWorkspaces: 0,
          archivedWorkspaces: 0,
          totalSizeInBytes: 0,
          averageWorkspaceSize: 0,
          oldestWorkspace: new Date(),
          newestWorkspace: new Date(),
          mostUsedWorkspace: { workspaceId: '', accessCount: 0 },
          lastUpdated: new Date()
        });
      }
    };

    transaction.onerror = () => reject(transaction.error);
  });
    });
  }, 'getWorkspaceStats');
};

// Define workspace stats interface
interface WorkspaceStats {
  [key: string]: unknown;
}

// 🌟 NEW: Update workspace statistics
export const updateWorkspaceStats = async (stats: WorkspaceStats): Promise<void> => {
  return safeDbOperation(async (db) => {
    return safeTransaction(db, ['workspaceStats'], 'readwrite', (transaction) => {
  return new Promise((resolve, reject) => {
    const statsStore = transaction.objectStore('workspaceStats');

    const sanitizedStats = {
      ...stats,
      lastUpdated: new Date().toISOString()
    };

    statsStore.put(sanitizedStats);

    transaction.oncomplete = () => {
      logWorkspaceOperation('WORKSPACE_STATS_UPDATED', { stats: sanitizedStats });
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
    });
  }, 'updateWorkspaceStats');
};

// 🌟 NEW: Auto-commit branch persistence functions

// Save auto-commit branch
export const saveAutoCommitBranch = async (branch: AutoCommitBranch): Promise<void> => {
  return safeDbOperation(async (db) => {
    return safeTransaction(db, ['autoCommitBranches'], 'readwrite', (transaction) => {
  return new Promise((resolve, reject) => {
    const branchesStore = transaction.objectStore('autoCommitBranches');

    const sanitizedBranch = {
      ...branch,
      createdAt: branch.createdAt.toISOString(),
      workspaceSnapshot: branch.workspaceSnapshot ? {
        ...branch.workspaceSnapshot,
        lastModified: branch.workspaceSnapshot.lastModified.toISOString()
      } : undefined
    };

    branchesStore.put(sanitizedBranch);

    transaction.oncomplete = () => {
      logWorkspaceOperation('AUTO_COMMIT_BRANCH_SAVED', { 
        branchId: branch.branchId,
        branchName: branch.branchName,
        conversationId: branch.conversationId
      });
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
    });
  }, 'saveAutoCommitBranch');
};

// Load auto-commit branches by conversation
export const loadAutoCommitBranches = async (conversationId: string): Promise<AutoCommitBranch[]> => {
  return safeDbOperation(async (db) => {
    return safeTransaction(db, ['autoCommitBranches'], 'readonly', (transaction) => {
  return new Promise((resolve, reject) => {
    const branchesStore = transaction.objectStore('autoCommitBranches');
    const index = branchesStore.index('conversationId');
    const branches: AutoCommitBranch[] = [];

    index.openCursor(IDBKeyRange.only(conversationId)).onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        const branch = cursor.value;
        // Convert date strings back to Date objects
        branch.createdAt = new Date(branch.createdAt);
        if (branch.workspaceSnapshot) {
          branch.workspaceSnapshot.lastModified = new Date(branch.workspaceSnapshot.lastModified);
        }
        branches.push(branch);
        cursor.continue();
      }
    };

    transaction.oncomplete = () => {
      // Sort branches by creation date (newest first)
      branches.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      logWorkspaceOperation('AUTO_COMMIT_BRANCHES_LOADED', { 
        conversationId,
        count: branches.length
      });
      resolve(branches);
    };
    transaction.onerror = () => reject(transaction.error);
  });
    });
  }, 'loadAutoCommitBranches');
};

// Load all auto-commit branches for a project
export const loadAutoCommitBranchesByProject = async (projectId: string): Promise<AutoCommitBranch[]> => {
  return safeDbOperation(async (db) => {
    return safeTransaction(db, ['autoCommitBranches'], 'readonly', (transaction) => {
  return new Promise((resolve, reject) => {
    const branchesStore = transaction.objectStore('autoCommitBranches');
    const index = branchesStore.index('projectId');
    const branches: AutoCommitBranch[] = [];

    index.openCursor(IDBKeyRange.only(projectId)).onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        const branch = cursor.value;
        // Convert date strings back to Date objects
        branch.createdAt = new Date(branch.createdAt);
        if (branch.workspaceSnapshot) {
          branch.workspaceSnapshot.lastModified = new Date(branch.workspaceSnapshot.lastModified);
        }
        branches.push(branch);
        cursor.continue();
      }
    };

    transaction.oncomplete = () => {
      // Sort branches by creation date (newest first)
      branches.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      logWorkspaceOperation('AUTO_COMMIT_BRANCHES_BY_PROJECT_LOADED', { 
        projectId,
        count: branches.length
      });
      resolve(branches);
    };
    transaction.onerror = () => reject(transaction.error);
  });
    });
  }, 'loadAutoCommitBranchesByProject');
};

// Delete auto-commit branch
export const deleteAutoCommitBranch = async (branchId: string): Promise<void> => {
  return safeDbOperation(async (db) => {
    return safeTransaction(db, ['autoCommitBranches'], 'readwrite', (transaction) => {
  return new Promise((resolve, reject) => {
    const branchesStore = transaction.objectStore('autoCommitBranches');

    branchesStore.delete(branchId);

    transaction.oncomplete = () => {
      logWorkspaceOperation('AUTO_COMMIT_BRANCH_DELETED', { branchId });
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
    });
  }, 'deleteAutoCommitBranch');
};

// Save branch revert
export const saveBranchRevert = async (revert: BranchRevert): Promise<void> => {
  return safeDbOperation(async (db) => {
    return safeTransaction(db, ['branchReverts'], 'readwrite', (transaction) => {
  return new Promise((resolve, reject) => {
    const revertsStore = transaction.objectStore('branchReverts');

    const sanitizedRevert = {
      ...revert,
      revertedAt: revert.revertedAt.toISOString()
    };

    revertsStore.put(sanitizedRevert);

    transaction.oncomplete = () => {
      logWorkspaceOperation('BRANCH_REVERT_SAVED', { 
        revertId: revert.revertId,
        sourceBranchId: revert.sourceBranchId,
        targetBranchId: revert.targetBranchId
      });
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
    });
  }, 'saveBranchRevert');
};

// Load branch reverts by conversation
export const loadBranchReverts = async (conversationId: string): Promise<BranchRevert[]> => {
  return safeDbOperation(async (db) => {
    return safeTransaction(db, ['branchReverts'], 'readonly', (transaction) => {
  return new Promise((resolve, reject) => {
    const revertsStore = transaction.objectStore('branchReverts');
    const index = revertsStore.index('conversationId');
    const reverts: BranchRevert[] = [];

    index.openCursor(IDBKeyRange.only(conversationId)).onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        const revert = cursor.value;
        // Convert date strings back to Date objects
        revert.revertedAt = new Date(revert.revertedAt);
        reverts.push(revert);
        cursor.continue();
      }
    };

    transaction.oncomplete = () => {
      // Sort reverts by revert date (newest first)
      reverts.sort((a, b) => b.revertedAt.getTime() - a.revertedAt.getTime());
      logWorkspaceOperation('BRANCH_REVERTS_LOADED', { 
        conversationId,
        count: reverts.length
      });
      resolve(reverts);
    };
    transaction.onerror = () => reject(transaction.error);
  });
    });
  }, 'loadBranchReverts');
};

// Get auto-commit agent status
export const getAutoCommitAgentStatus = async (): Promise<AutoCommitAgentStatus> => {
  return safeDbOperation(async (db) => {
    return safeTransaction(db, ['autoCommitAgentStatus'], 'readonly', (transaction) => {
  return new Promise((resolve, reject) => {
    const statusStore = transaction.objectStore('autoCommitAgentStatus');

    statusStore.get('global').onsuccess = (event) => {
      const result = (event.target as IDBRequest).result;
      if (result) {
        // Convert date strings back to Date objects
        if (result.lastRunAt) {
          result.lastRunAt = new Date(result.lastRunAt);
        }
        if (result.nextRunAt) {
          result.nextRunAt = new Date(result.nextRunAt);
        }
        resolve(result);
      } else {
        // Return default status if none exists
        resolve({
          isRunning: false,
          totalBranchesCreated: 0,
          totalCommits: 0,
          totalReverts: 0,
          currentInterval: 3,
          errors: []
        });
      }
    };

    transaction.onerror = () => reject(transaction.error);
  });
    });
  }, 'getAutoCommitAgentStatus');
};

// Update auto-commit agent status
export const updateAutoCommitAgentStatus = async (status: AutoCommitAgentStatus): Promise<void> => {
  return safeDbOperation(async (db) => {
    return safeTransaction(db, ['autoCommitAgentStatus'], 'readwrite', (transaction) => {
  return new Promise((resolve, reject) => {
    const statusStore = transaction.objectStore('autoCommitAgentStatus');

    const sanitizedStatus = {
      ...status,
      id: 'global',
      lastRunAt: status.lastRunAt?.toISOString(),
      nextRunAt: status.nextRunAt?.toISOString(),
      lastUpdated: new Date().toISOString()
    };

    statusStore.put(sanitizedStatus);

    transaction.oncomplete = () => {
      logWorkspaceOperation('AUTO_COMMIT_AGENT_STATUS_UPDATED', { 
        isRunning: status.isRunning,
        totalBranchesCreated: status.totalBranchesCreated
      });
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
    });
  }, 'updateAutoCommitAgentStatus');
};

// Save conversation branch history
export const saveConversationBranchHistory = async (history: ConversationBranchHistory): Promise<void> => {
  return safeDbOperation(async (db) => {
    return safeTransaction(db, ['branchHistory'], 'readwrite', (transaction) => {
  return new Promise((resolve, reject) => {
    const historyStore = transaction.objectStore('branchHistory');

    const sanitizedHistory = {
      ...history,
      branches: history.branches.map(branch => ({
        ...branch,
        createdAt: branch.createdAt.toISOString(),
        workspaceSnapshot: branch.workspaceSnapshot ? {
          ...branch.workspaceSnapshot,
          lastModified: branch.workspaceSnapshot.lastModified.toISOString()
        } : undefined
      })),
      oldestBranch: history.oldestBranch?.toISOString(),
      newestBranch: history.newestBranch?.toISOString()
    };

    historyStore.put(sanitizedHistory);

    transaction.oncomplete = () => {
      logWorkspaceOperation('CONVERSATION_BRANCH_HISTORY_SAVED', { 
        conversationId: history.conversationId,
        totalBranches: history.totalBranches
      });
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
    });
  }, 'saveConversationBranchHistory');
};

// Load conversation branch history
export const loadConversationBranchHistory = async (conversationId: string): Promise<ConversationBranchHistory | null> => {
  return safeDbOperation(async (db) => {
    return safeTransaction(db, ['branchHistory'], 'readonly', (transaction) => {
  return new Promise((resolve, reject) => {
    const historyStore = transaction.objectStore('branchHistory');

    historyStore.get(conversationId).onsuccess = (event) => {
      const result = (event.target as IDBRequest).result;
      if (result) {
        // Convert date strings back to Date objects
        result.branches = result.branches.map((branch: { createdAt: string | Date; workspaceSnapshot?: { lastModified: string | Date } }) => ({
          ...branch,
          createdAt: new Date(branch.createdAt),
          workspaceSnapshot: branch.workspaceSnapshot ? {
            ...branch.workspaceSnapshot,
            lastModified: new Date(branch.workspaceSnapshot.lastModified)
          } : undefined
        }));
        if (result.oldestBranch) {
          result.oldestBranch = new Date(result.oldestBranch);
        }
        if (result.newestBranch) {
          result.newestBranch = new Date(result.newestBranch);
        }
        resolve(result);
      } else {
        resolve(null);
      }
    };

    transaction.onerror = () => reject(transaction.error);
  });
    });
  }, 'loadConversationBranchHistory');
};

// Sanitize project data before storage by removing non-serializable properties
// Helper function to safely convert a Date to ISO string
const safeToISOString = (date: Date | string | number | undefined): string => {
  if (date instanceof Date) {
    // Ensure the date is valid
    const timestamp = date.getTime();
    if (isNaN(timestamp)) {
      return new Date().toISOString(); // fallback to current time for invalid dates
    }
    return date.toISOString();
  }
  if (typeof date === 'string') {
    // If it's already a string, try to parse it as a date first
    const parsedDate = new Date(date);
    if (!isNaN(parsedDate.getTime())) {
      return parsedDate.toISOString();
    }
    return date; // return as is if can't be parsed
  }
  if (typeof date === 'number') {
    const parsedDate = new Date(date);
    if (!isNaN(parsedDate.getTime())) {
      return parsedDate.toISOString();
    }
  }
  return new Date().toISOString(); // fallback to current time
};

// Helper function to safely create a Date object
const safeDate = (date: string | number | Date | undefined): Date => {
  if (date instanceof Date && !isNaN(date.getTime())) {
    return date;
  }
  const parsed = new Date(date || Date.now());
  return isNaN(parsed.getTime()) ? new Date() : parsed;
};

const sanitizeProjectForStorage = (project: Project): Project => {
  // First convert to JSON to remove non-serializable properties
  const sanitizedProject = JSON.parse(JSON.stringify({
    ...project,
    settings: {
      ...project.settings,
      mcpServerIds: project.settings.mcpServerIds || [],
      provider: project.settings.provider || 'anthropic', // Ensure provider is never undefined
      // Ensure providerConfig exists by converting from legacy if needed
      providerConfig: project.settings.providerConfig || convertLegacyToProviderConfig('anthropic', project.settings)
    },
    conversations: project.conversations.map(conv => ({
      ...conv,
      lastUpdated: safeToISOString(conv.lastUpdated),
      messages: conv.messages.map(msg => ({
        ...msg,
        timestamp: safeToISOString(msg.timestamp)
      }))
    }))
  }));

  // Convert ISO strings back to Date objects
  type TempConversation = Omit<ConversationBrief, 'lastUpdated'> & {
    lastUpdated: string;
    messages: (Omit<Message, 'timestamp'> & { timestamp: string })[];
  };

  sanitizedProject.conversations = sanitizedProject.conversations.map((conv: TempConversation) => ({
    ...conv,
    lastUpdated: safeDate(conv.lastUpdated),
    messages: conv.messages.map(msg => ({
      ...msg,
      timestamp: safeDate(msg.timestamp)
    }))
  }));

  sanitizedProject.createdAt = safeDate(project.createdAt);
  sanitizedProject.updatedAt = safeDate(project.updatedAt);

  // Ensure project has an order field
  if (typeof sanitizedProject.order !== 'number') {
    sanitizedProject.order = Date.now(); // Use timestamp as default order if not set
  }

  return sanitizedProject;
};

export const saveState = async (state: DbState): Promise<void> => {
  return safeDbOperation(async (db) => {
    return safeTransaction(db, ['projects', 'appState'], 'readwrite', (transaction) => {
  return new Promise((resolve, reject) => {
        const projectStore = transaction.objectStore('projects');
        const stateStore = transaction.objectStore('appState');

    // Clear existing data
        projectStore.clear();

    // Save projects with sanitized data
    state.projects.forEach(project => {
      const sanitizedProject = sanitizeProjectForStorage(project);
          projectStore.add(sanitizedProject);
    });

    // Save active IDs
        stateStore.put({
      id: 'activeIds',
      activeProjectId: state.activeProjectId,
      activeConversationId: state.activeConversationId
    });

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
    });
  }, 'saveState');
};

// Sanitize MCP server data before storage by removing non-serializable properties
const sanitizeMcpServerForStorage = (server: McpServer): McpServer => {
  const sanitizedServer = JSON.parse(JSON.stringify({
    ...server,
    ws: undefined, // Remove WebSocket instance
    status: 'disconnected'
  }));

  return sanitizedServer;
};

export const saveMcpServers = async (servers: McpServer[]): Promise<void> => {
  return safeDbOperation(async (db) => {
    return safeTransaction(db, ['mcpServers'], 'readwrite', (transaction) => {
  return new Promise((resolve, reject) => {
    const store = transaction.objectStore('mcpServers');

    try {
      // Clear existing servers in a controlled way
      const clearRequest = store.clear();
      clearRequest.onsuccess = () => {
        // After clear succeeds, save all servers
        const savePromises = servers.map(server => new Promise<void>((resolveServer, rejectServer) => {
          const sanitizedServer = sanitizeMcpServerForStorage(server);
          const request = store.add(sanitizedServer);
          request.onsuccess = () => resolveServer();
          request.onerror = () => rejectServer(request.error);
        }));

        // Wait for all saves to complete
        Promise.all(savePromises)
          .then(() => resolve())
          .catch(error => {
            console.error('Error saving servers:', error);
            reject(error);
          });
      };

      clearRequest.onerror = (event) => {
        console.error('Error clearing servers:', event);
        reject(clearRequest.error);
      };
    } catch (error) {
      console.error('Error in saveMcpServers transaction:', error);
      reject(error);
    }

    transaction.onerror = () => {
      console.error('Transaction error in saveMcpServers:', transaction.error);
      reject(transaction.error);
    };
  });
    });
  }, 'saveMcpServers');
};

export const loadMcpServers = async (): Promise<McpServer[]> => {
  return safeDbOperation(async (db) => {
    return safeTransaction(db, ['mcpServers'], 'readonly', (transaction) => {
  return new Promise((resolve, reject) => {
    const servers: McpServer[] = [];
    const store = transaction.objectStore('mcpServers');

    store.openCursor().onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        servers.push(cursor.value);
        cursor.continue();
      }
    };

    transaction.oncomplete = () => resolve(servers);
    transaction.onerror = () => reject(transaction.error);
  });
    });
  }, 'loadMcpServers');
};

// Deprecated - no longer needed since all data has been migrated to IndexedDB
// Export utility function for JSON export
export const exportToJson = async (): Promise<string> => {
  const state = await loadState();
  const mcpServers = await loadMcpServers();

  return JSON.stringify({
    projects: state.projects,
    mcpServers,
    activeProjectId: state.activeProjectId,
    activeConversationId: state.activeConversationId
  }, null, 2);
};
