import { Project, ConversationBrief, WorkspaceMapping, WorkspacePersistenceSchema, ConversationMigrationInfo, AutoCommitBranch, BranchRevert, AutoCommitAgentStatus, ConversationBranchHistory } from '../components/LlmChat/context/types';
import { convertLegacyToProviderConfig } from '../components/LlmChat/types/provider';
import { DEFAULT_PROJECT_SETTINGS } from '../stores/rootStore';
import { Message } from '../components/LlmChat/types';
import { McpServer } from '../components/LlmChat/types/mcp';
import { messageToGenericMessage } from '../components/LlmChat/types/genericMessage';
import { 
  generateWorkspaceId, 
  generateWorkspacePath, 
  createWorkspaceMapping, 
  addWorkspaceToConversation,
  createDefaultWorkspaceSettings,
  logWorkspaceOperation
} from './conversationWorkspaceService';

const DB_NAME = 'kibitz_db';
export const DB_VERSION = 10; // 🌟 UPDATED: Version 10 for auto-commit branch support

interface DbState {
  projects: Project[];
  activeProjectId: string | null;
  activeConversationId: string | null;
}

// 🌟 NEW: Extended database state with workspace information
interface ExtendedDbState extends DbState {
  workspaceMappings: WorkspaceMapping[];
  workspaceSettings: Record<string, any>;
}

interface KibitzDb extends IDBDatabase {
  createObjectStore(name: string, options?: IDBObjectStoreParameters): IDBObjectStore;
}

export const initDb = async (): Promise<KibitzDb> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => resolve(request.result as KibitzDb);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result as KibitzDb;

      if (event.oldVersion < 1) {
        // Projects store
        const projectStore = db.createObjectStore('projects', { keyPath: 'id' });
        projectStore.createIndex('createdAt', 'createdAt');
        projectStore.createIndex('updatedAt', 'updatedAt');
        projectStore.createIndex('name', 'name');
        projectStore.createIndex('order', 'order');  // Add order index

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
      if (event.oldVersion < 2) {
        // Adding the order index in version 2
        const transaction = (event.target as IDBOpenDBRequest).transaction;
        if (!transaction) {
          console.error('No transaction available during upgrade');
          return;
        }
        const projectStore = transaction.objectStore('projects');

        // Only add the index if it doesn't exist
        if (!projectStore.indexNames.contains('order')) {
          projectStore.createIndex('order', 'order');
        }

        // Add order field to existing projects
        projectStore.openCursor().onsuccess = (e) => {
          const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor) {
            const project = cursor.value;
            if (typeof project.order !== 'number') {
              project.order = cursor.key;
              cursor.update(project);
            }
            cursor.continue();
          }
        };
      }
      if (event.oldVersion < 3) {
        // Move MCP servers to a separate object store
        if (!db.objectStoreNames.contains('mcpServers')) {
          const mcpStore = db.createObjectStore('mcpServers', { keyPath: 'id' });
          mcpStore.createIndex('name', 'name');
        }
      }
      if (event.oldVersion < 4) {
        // Add provider field and separate API keys to existing projects
        const transaction = (event.target as IDBOpenDBRequest).transaction;
        if (!transaction) {
          console.error('No transaction available during upgrade');
          return;
        }
        const projectStore = transaction.objectStore('projects');

        // Migrate existing projects
        projectStore.openCursor().onsuccess = (e) => {
          const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor) {
            const project = cursor.value;

            // Always ensure settings object exists and has current defaults
            if (!project.settings) {
              project.settings = {
                mcpServers: [],
                model: 'claude-3-7-sonnet-20250219',
                systemPrompt: '',
                elideToolResults: false,
              };
            }

            // Update model if it's an old one
            if (project.settings) {
              const oldModels = ['claude-2.0', 'claude-2.1', 'claude-2', 'claude-instant'];
              if (oldModels.includes(project.settings.model) || !project.settings.model) {
                project.settings.model = 'claude-3-7-sonnet-20250219';
              }

              // Always set provider if upgrading from v3
              project.settings.provider = 'anthropic';

              // Copy API key to anthropicApiKey if it exists
              if (project.settings.apiKey) {
                project.settings.anthropicApiKey = project.settings.apiKey;
                // Keep original apiKey for backward compatibility
              }

              // Initialize empty OpenRouter fields
              project.settings.openRouterApiKey = '';
              project.settings.openRouterBaseUrl = '';
            }

            try {
              cursor.update(project);
            } catch (error) {
              console.error('Error updating project during migration:', error);
              // On error, try to at least save the provider field
              try {
                cursor.update({
                  ...project,
                  settings: {
                    ...project.settings,
                    provider: 'anthropic'
                  }
                });
              } catch (fallbackError) {
                console.error('Critical error during migration fallback:', fallbackError);
              }
            }
            cursor.continue();
          }
        };

        // Add error handling for the cursor operation
        projectStore.openCursor().onerror = (error) => {
          console.error('Error during v4 migration:', error);
        };
      }
      if (event.oldVersion < 5) {
        // Add new providerConfig field to existing projects
        const transaction = (event.target as IDBOpenDBRequest).transaction;
        if (!transaction) {
          console.error('No transaction available during upgrade');
          return;
        }
        const projectStore = transaction.objectStore('projects');

        // Migrate existing projects
        projectStore.openCursor().onsuccess = (e) => {
          const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor) {
            const project = cursor.value;

            try {
              // Convert legacy provider settings to new format
              if (project.settings) {
                // Use the helper function to convert legacy settings to new format
                project.settings.providerConfig = convertLegacyToProviderConfig(
                  project.settings.provider,
                  project.settings
                );
                cursor.update(project);
              }
            } catch (error) {
              console.error('Error updating project during v5 migration:', error);
            }
            cursor.continue();
          }
        };

        // Add error handling for the cursor operation
        projectStore.openCursor().onerror = (error) => {
          console.error('Error during v5 migration:', error);
        };
      }
      if (event.oldVersion < 6) {
        // Migrate messages to GenericMessage format
        const transaction = (event.target as IDBOpenDBRequest).transaction;
        if (!transaction) {
          console.error('No transaction available during upgrade');
          return;
        }
        const projectStore = transaction.objectStore('projects');

        // Migrate existing projects
        projectStore.openCursor().onsuccess = (e) => {
          const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor) {
            const project = cursor.value;

            if (project.conversations && Array.isArray(project.conversations)) {
              project.conversations = project.conversations.map((conversation: ConversationBrief) => {
                if (conversation.messages && Array.isArray(conversation.messages)) {
                  conversation.messages = conversation.messages.map((message: Message) => {
                    try {
                      // Convert to generic message and back to maintain correct type
                      const genericMessage = messageToGenericMessage(message);
                      return {
                        ...message,
                        role: genericMessage.role === 'system' ? 'user' : genericMessage.role === 'tool' ? 'assistant' : genericMessage.role,
                        content: genericMessage.content,
                        toolInput: genericMessage.name
                      } as Message;
                    } catch (error) {
                      console.error('Error migrating message:', error, message);
                      return message;
                    }
                  });
                }
                return conversation;
              });
            }

            try {
              // Convert legacy provider settings to new format
              if (project.settings) {
                // Use the helper function to convert legacy settings to new format
                project.settings.providerConfig = convertLegacyToProviderConfig(
                  project.settings.provider,
                  project.settings
                );
                cursor.update(project);
              }
            } catch (error) {
              console.error('Error updating project during v6 migration:', error);
            }
            cursor.continue();
          }
        };

        // Add error handling for the cursor operation
        projectStore.openCursor().onerror = (error) => {
          console.error('Error during v6 migration:', error);
        };
      }
      if (event.oldVersion < 7) {
        // Add savedPrompts array to existing projects
        const transaction = (event.target as IDBOpenDBRequest).transaction;
        if (!transaction) {
          console.error('No transaction available during upgrade');
          return;
        }
        const projectStore = transaction.objectStore('projects');

        // Migrate existing projects
        projectStore.openCursor().onsuccess = (e) => {
          const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor) {
            const project = cursor.value;

            try {
              // Ensure settings exists and add empty savedPrompts array if not present
              if (project.settings) {
                if (!project.settings.savedPrompts) {
                  project.settings.savedPrompts = [];
                }
                cursor.update(project);
              }
            } catch (error) {
              console.error('Error updating project during v7 migration:', error);
            }
            cursor.continue();
          }
        };

        // Add error handling for the cursor operation
        projectStore.openCursor().onerror = (error) => {
          console.error('Error during v7 migration:', error);
        };
      }
      if (event.oldVersion < 8) {
        // Migration for version 8 - Add any missing fields
        const transaction = (event.target as IDBOpenDBRequest).transaction;
        if (!transaction) {
          console.error('No transaction available during upgrade');
          return;
        }
        const projectStore = transaction.objectStore('projects');

        // Migrate existing projects
        projectStore.openCursor().onsuccess = (e) => {
          const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor) {
            const project = cursor.value;

            try {
              // Version 8 migration logic (if any)
              cursor.update(project);
            } catch (error) {
              console.error('Error updating project during v8 migration:', error);
            }
            cursor.continue();
          }
        };

        // Add error handling for the cursor operation
        projectStore.openCursor().onerror = (error) => {
          console.error('Error during v8 migration:', error);
        };
      }
      if (event.oldVersion < 9) {
        // 🌟 NEW: Version 9 - Add workspace support
        logWorkspaceOperation('DATABASE_MIGRATION_V9', { oldVersion: event.oldVersion, newVersion: 9 });

        // Create workspace mappings table
        let workspaceStore: IDBObjectStore | undefined;
        if (!db.objectStoreNames.contains('workspaceMappings')) {
          workspaceStore = db.createObjectStore('workspaceMappings', { keyPath: 'workspaceId' });
          workspaceStore.createIndex('conversationId', 'conversationId');
          workspaceStore.createIndex('projectId', 'projectId');
          workspaceStore.createIndex('workspaceStatus', 'workspaceStatus');
          workspaceStore.createIndex('lastAccessedAt', 'lastAccessedAt');
        }

        // Create conversation settings table
        let conversationSettingsStore: IDBObjectStore | undefined;
        if (!db.objectStoreNames.contains('conversationSettings')) {
          conversationSettingsStore = db.createObjectStore('conversationSettings', { keyPath: 'conversationId' });
          conversationSettingsStore.createIndex('projectId', 'projectId');
        }

        // Create workspace backups table
        if (!db.objectStoreNames.contains('workspaceBackups')) {
          const workspaceBackupsStore = db.createObjectStore('workspaceBackups', { keyPath: 'workspaceId' });
          workspaceBackupsStore.createIndex('createdAt', 'createdAt');
        }

        // Create workspace usage stats table
        let workspaceStatsStore: IDBObjectStore | undefined;
        if (!db.objectStoreNames.contains('workspaceStats')) {
          workspaceStatsStore = db.createObjectStore('workspaceStats', { keyPath: 'id' });
        }

        const transaction = (event.target as IDBOpenDBRequest).transaction;
        if (!transaction) {
          console.error('No transaction available during v9 upgrade');
          return;
        }
        const projectStore = transaction.objectStore('projects');

        // Migrate existing projects and conversations to workspace-aware format
        projectStore.openCursor().onsuccess = (e) => {
          const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor) {
            const project = cursor.value;
            let hasChanges = false;

            // Add workspace-related fields to project
            if (!project.workspaceIsolationEnabled) {
              project.workspaceIsolationEnabled = false;
              hasChanges = true;
            }
            if (!project.defaultWorkspaceSettings) {
              project.defaultWorkspaceSettings = createDefaultWorkspaceSettings();
              hasChanges = true;
            }

            // Migrate conversations to workspace format
            if (project.conversations && Array.isArray(project.conversations)) {
              project.conversations = project.conversations.map((conversation: ConversationBrief) => {
                if (!conversation.workspaceId) {
                  // Create workspace mapping for existing conversations
                  const workspaceMapping = createWorkspaceMapping(
                    conversation.id,
                    project.id,
                    conversation.name,
                    { initializeGit: false }
                  );

                  // Add workspace to conversation
                  const updatedConversation = addWorkspaceToConversation(conversation, workspaceMapping);
                  
                  // Store workspace mapping
                  if (workspaceStore) {
                    workspaceStore.add(workspaceMapping);
                  }
                  
                  // Store conversation settings
                  if (conversationSettingsStore) {
                                        conversationSettingsStore.add({
                      conversationId: conversation.id,
                      projectId: project.id,
                      settings: updatedConversation.settings || createDefaultWorkspaceSettings()
                    });
                  }

                  logWorkspaceOperation('CONVERSATION_MIGRATION', {
                    conversationId: conversation.id,
                    projectId: project.id,
                    workspaceId: workspaceMapping.workspaceId,
                    workspacePath: workspaceMapping.workspacePath
                  });

                  hasChanges = true;
                  return updatedConversation;
                }
                return conversation;
              });
            }

            if (hasChanges) {
              try {
                cursor.update(project);
              } catch (error) {
                console.error('Error updating project during v9 migration:', error);
              }
            }
            cursor.continue();
          }
        };

        // Add error handling for the cursor operation
        projectStore.openCursor().onerror = (error) => {
          console.error('Error during v9 migration:', error);
        };

        // Initialize workspace statistics
        if (workspaceStatsStore) {
          workspaceStatsStore.add({
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

        logWorkspaceOperation('DATABASE_MIGRATION_V9_COMPLETE', { 
          tablesCreated: ['workspaceMappings', 'conversationSettings', 'workspaceBackups', 'workspaceStats']
        });
      }
      if (event.oldVersion < 10) {
        // 🌟 NEW: Version 10 - Add auto-commit branch support
        logWorkspaceOperation('DATABASE_MIGRATION_V10', { oldVersion: event.oldVersion, newVersion: 10 });

        // Create auto-commit branches table
        let branchesStore: IDBObjectStore | undefined;
        if (!db.objectStoreNames.contains('autoCommitBranches')) {
          branchesStore = db.createObjectStore('autoCommitBranches', { keyPath: 'branchId' });
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
        let agentStatusStore: IDBObjectStore | undefined;
        if (!db.objectStoreNames.contains('autoCommitAgentStatus')) {
          agentStatusStore = db.createObjectStore('autoCommitAgentStatus', { keyPath: 'id' });
        }

        // Create branch history table
        if (!db.objectStoreNames.contains('branchHistory')) {
          const branchHistoryStore = db.createObjectStore('branchHistory', { keyPath: 'conversationId' });
          branchHistoryStore.createIndex('projectId', 'projectId');
          branchHistoryStore.createIndex('totalBranches', 'totalBranches');
          branchHistoryStore.createIndex('oldestBranch', 'oldestBranch');
          branchHistoryStore.createIndex('newestBranch', 'newestBranch');
        }

        // Initialize auto-commit agent status
        if (agentStatusStore) {
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

        logWorkspaceOperation('DATABASE_MIGRATION_V10_COMPLETE', { 
          tablesCreated: ['autoCommitBranches', 'branchReverts', 'autoCommitAgentStatus', 'branchHistory']
        });
      }
    };
  });
};

export const loadState = async (): Promise<DbState> => {
  const db = await initDb();

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

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['projects', 'appState'], 'readonly');
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
};

// 🌟 NEW: Load workspace mappings from database
export const loadWorkspaceMappings = async (): Promise<WorkspaceMapping[]> => {
  const db = await initDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['workspaceMappings'], 'readonly');
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
};

// 🌟 NEW: Save workspace mappings to database
export const saveWorkspaceMappings = async (workspaces: WorkspaceMapping[]): Promise<void> => {
  const db = await initDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['workspaceMappings'], 'readwrite');
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
};

// 🌟 NEW: Load conversation settings from database
export const loadConversationSettings = async (): Promise<Record<string, any>> => {
  const db = await initDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['conversationSettings'], 'readonly');
    const settingsStore = transaction.objectStore('conversationSettings');
    const settings: Record<string, any> = {};

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
};

// 🌟 NEW: Save conversation settings to database
export const saveConversationSettings = async (settings: Record<string, any>): Promise<void> => {
  const db = await initDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['conversationSettings'], 'readwrite');
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
};

// 🌟 NEW: Get workspace mapping by conversation ID
export const getWorkspaceByConversationId = async (conversationId: string): Promise<WorkspaceMapping | null> => {
  const db = await initDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['workspaceMappings'], 'readonly');
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
};

// 🌟 NEW: Update workspace mapping
export const updateWorkspaceMapping = async (workspaceMapping: WorkspaceMapping): Promise<void> => {
  const db = await initDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['workspaceMappings'], 'readwrite');
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
};

// 🌟 NEW: Delete workspace mapping
export const deleteWorkspaceMapping = async (workspaceId: string): Promise<void> => {
  const db = await initDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['workspaceMappings', 'conversationSettings'], 'readwrite');
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
};

// 🌟 NEW: Get workspace statistics
export const getWorkspaceStats = async (): Promise<any> => {
  const db = await initDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['workspaceStats'], 'readonly');
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
};

// 🌟 NEW: Update workspace statistics
export const updateWorkspaceStats = async (stats: any): Promise<void> => {
  const db = await initDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['workspaceStats'], 'readwrite');
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
};

// 🌟 NEW: Auto-commit branch persistence functions

// Save auto-commit branch
export const saveAutoCommitBranch = async (branch: AutoCommitBranch): Promise<void> => {
  const db = await initDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['autoCommitBranches'], 'readwrite');
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
};

// Load auto-commit branches by conversation
export const loadAutoCommitBranches = async (conversationId: string): Promise<AutoCommitBranch[]> => {
  const db = await initDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['autoCommitBranches'], 'readonly');
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
};

// Load all auto-commit branches for a project
export const loadAutoCommitBranchesByProject = async (projectId: string): Promise<AutoCommitBranch[]> => {
  const db = await initDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['autoCommitBranches'], 'readonly');
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
};

// Delete auto-commit branch
export const deleteAutoCommitBranch = async (branchId: string): Promise<void> => {
  const db = await initDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['autoCommitBranches'], 'readwrite');
    const branchesStore = transaction.objectStore('autoCommitBranches');

    branchesStore.delete(branchId);

    transaction.oncomplete = () => {
      logWorkspaceOperation('AUTO_COMMIT_BRANCH_DELETED', { branchId });
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
};

// Save branch revert
export const saveBranchRevert = async (revert: BranchRevert): Promise<void> => {
  const db = await initDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['branchReverts'], 'readwrite');
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
};

// Load branch reverts by conversation
export const loadBranchReverts = async (conversationId: string): Promise<BranchRevert[]> => {
  const db = await initDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['branchReverts'], 'readonly');
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
};

// Get auto-commit agent status
export const getAutoCommitAgentStatus = async (): Promise<AutoCommitAgentStatus> => {
  const db = await initDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['autoCommitAgentStatus'], 'readonly');
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
};

// Update auto-commit agent status
export const updateAutoCommitAgentStatus = async (status: AutoCommitAgentStatus): Promise<void> => {
  const db = await initDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['autoCommitAgentStatus'], 'readwrite');
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
};

// Save conversation branch history
export const saveConversationBranchHistory = async (history: ConversationBranchHistory): Promise<void> => {
  const db = await initDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['branchHistory'], 'readwrite');
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
};

// Load conversation branch history
export const loadConversationBranchHistory = async (conversationId: string): Promise<ConversationBranchHistory | null> => {
  const db = await initDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['branchHistory'], 'readonly');
    const historyStore = transaction.objectStore('branchHistory');

    historyStore.get(conversationId).onsuccess = (event) => {
      const result = (event.target as IDBRequest).result;
      if (result) {
        // Convert date strings back to Date objects
        result.branches = result.branches.map((branch: any) => ({
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
  const db = await initDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['projects', 'appState'], 'readwrite');

    // Clear existing data
    transaction.objectStore('projects').clear();

    // Save projects with sanitized data
    state.projects.forEach(project => {
      const sanitizedProject = sanitizeProjectForStorage(project);
      transaction.objectStore('projects').add(sanitizedProject);
    });

    // Save active IDs
    transaction.objectStore('appState').put({
      id: 'activeIds',
      activeProjectId: state.activeProjectId,
      activeConversationId: state.activeConversationId
    });

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
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
  const db = await initDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['mcpServers'], 'readwrite');
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
};

export const loadMcpServers = async (): Promise<McpServer[]> => {
  const db = await initDb();

  return new Promise((resolve, reject) => {
    const servers: McpServer[] = [];
    const transaction = db.transaction(['mcpServers'], 'readonly');
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
