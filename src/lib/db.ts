import { Project, ConversationBrief } from '../components/LlmChat/context/types';
import { convertLegacyToProviderConfig } from '../components/LlmChat/types/provider';
import { DEFAULT_PROJECT_SETTINGS } from '../stores/rootStore';
import { Message } from '../components/LlmChat/types';
import { McpServer } from '../components/LlmChat/types/mcp';
import { messageToGenericMessage } from '../components/LlmChat/types/genericMessage';

const DB_NAME = 'kibitz_db';
export const DB_VERSION = 7;

interface DbState {
  projects: Project[];
  activeProjectId: string | null;
  activeConversationId: string | null;
}

interface KibitzDb extends IDBDatabase {
  createObjectStore(name: string, options?: IDBObjectStoreParameters): IDBObjectStore;
}

const initDb = async (): Promise<KibitzDb> => {
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
      } else if (event.oldVersion < 2) {
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
      } else if (event.oldVersion < 3) {
        // Move MCP servers to a separate object store
        const mcpStore = db.createObjectStore('mcpServers', { keyPath: 'id' });
        mcpStore.createIndex('name', 'name');
      } else if (event.oldVersion < 4) {
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
                model: 'claude-3-5-sonnet-20241022',
                systemPrompt: '',
                elideToolResults: false,
              };
            }

            // Update model if it's an old one
            if (project.settings) {
              const oldModels = ['claude-2.0', 'claude-2.1', 'claude-2', 'claude-instant'];
              if (oldModels.includes(project.settings.model) || !project.settings.model) {
                project.settings.model = 'claude-3-5-sonnet-20241022';
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
      } else if (event.oldVersion < 5) {
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
      } else if (event.oldVersion < 6) {
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
      } else if (event.oldVersion < 7) {
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
