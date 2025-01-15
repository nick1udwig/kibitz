import { Project, ConversationBrief } from '../components/LlmChat/context/types';
import { Message } from '../components/LlmChat/types';
import { McpServer } from '../components/LlmChat/types/mcp';

const DB_NAME = 'kibitz_db';
const DB_VERSION = 1;

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

      // Projects store
      const projectStore = db.createObjectStore('projects', { keyPath: 'id' });
      projectStore.createIndex('createdAt', 'createdAt');
      projectStore.createIndex('updatedAt', 'updatedAt');
      projectStore.createIndex('name', 'name');

      // App state store (for active IDs)
      db.createObjectStore('appState', { keyPath: 'id' });

      // MCP servers store
      const mcpStore = db.createObjectStore('mcpServers', { keyPath: 'id' });
      mcpStore.createIndex('name', 'name');

      // Create indexes for future search capabilities
      projectStore.createIndex('settings.systemPrompt', 'settings.systemPrompt');
      projectStore.createIndex('conversations.name', 'conversations.name', { multiEntry: true });
      projectStore.createIndex('conversations.messages.content', 'conversations.messages.content', { multiEntry: true });
    };
  });
};

export const loadState = async (): Promise<DbState> => {
  const db = await initDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['projects', 'appState'], 'readonly');
    const projectStore = transaction.objectStore('projects');
    const stateStore = transaction.objectStore('appState');

    const projects: Project[] = [];
    const state: Partial<DbState> = {};

    projectStore.openCursor().onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        projects.push(cursor.value);
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
const sanitizeProjectForStorage = (project: Project): Project => {
  return {
    ...project,
    settings: {
      ...project.settings,
      mcpServers: project.settings.mcpServers?.map(server => ({
        ...server,
        ws: undefined, // Remove WebSocket instance
        status: 'disconnected'
      })) || []
    }
  };
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

export const saveMcpServers = async (servers: McpServer[]): Promise<void> => {
  const db = await initDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['mcpServers'], 'readwrite');
    const store = transaction.objectStore('mcpServers');

    // Clear existing data
    store.clear();

    // Save servers
    servers.forEach(server => {
      store.add(server);
    });

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

export const loadMcpServers = async (): Promise<McpServer[]> => {
  const db = await initDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['mcpServers'], 'readonly');
    const store = transaction.objectStore('mcpServers');
    const servers: McpServer[] = [];

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

// Migration utility
export const migrateFromLocalStorage = async (): Promise<void> => {
  // Load data from localStorage
  const projectsData = localStorage.getItem('chat_app_projects');
  const serversData = localStorage.getItem('mcp_servers');

  if (projectsData) {
    try {
      const parsed = JSON.parse(projectsData);
      const state: DbState = {
        projects: parsed.projects.map((proj: Project) => ({
          ...proj,
          settings: {
            ...proj.settings,
            mcpServers: (proj.settings.mcpServers || []).map((server: McpServer) => ({
              ...server,
              status: 'disconnected'
            }))
          },
          conversations: proj.conversations.map((conv: ConversationBrief & { messages: Message[] }) => ({
            ...conv,
            lastUpdated: new Date(conv.lastUpdated),
            messages: conv.messages.map(msg => ({
              ...msg,
              timestamp: new Date(msg.timestamp)
            }))
          })),
          createdAt: new Date(proj.createdAt),
          updatedAt: new Date(proj.updatedAt)
        })),
        activeProjectId: parsed.activeProjectId,
        activeConversationId: parsed.activeConversationId
      };

      await saveState(state);
    } catch (error) {
      console.error('Error migrating projects data:', error);
    }
  }

  if (serversData) {
    try {
      const servers = JSON.parse(serversData);
      await saveMcpServers(servers);
    } catch (error) {
      console.error('Error migrating MCP servers data:', error);
    }
  }
};

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
