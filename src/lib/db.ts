import { Project, ConversationBrief } from '../components/LlmChat/context/types';
import { Message } from '../components/LlmChat/types';
import { McpServer } from '../components/LlmChat/types/mcp';

const DB_NAME = 'kibitz_db';
const DB_VERSION = 2;

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
        const transaction = event.target.transaction;
        const projectStore = transaction.objectStore('projects');
        
        // Only add the index if it doesn't exist
        if (!projectStore.indexNames.contains('order')) {
          projectStore.createIndex('order', 'order');
        }
        
        // Add order field to existing projects
        projectStore.openCursor().onsuccess = (e) => {
          const cursor = (e.target as IDBRequest).result;
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

    projectStore.index('order').openCursor().onsuccess = (event) => {
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
      mcpServers: project.settings.mcpServers?.map(server => ({
        ...server,
        ws: undefined, // Remove WebSocket instance
        status: 'disconnected'
      })) || []
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
const MCP_SERVERS_KEY = 'kibitz_mcp_servers';

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
  try {
    // Save sanitized servers
    const sanitizedServers = servers.map(server => sanitizeMcpServerForStorage(server));
    localStorage.setItem(MCP_SERVERS_KEY, JSON.stringify(sanitizedServers));
    return Promise.resolve();
  } catch (error) {
    console.error('Error saving MCP servers:', error);
    return Promise.reject(error);
  }
};

export const loadMcpServers = async (): Promise<McpServer[]> => {
  try {
    const serversData = localStorage.getItem(MCP_SERVERS_KEY);
    if (!serversData) {
      return [];
    }
    const servers = JSON.parse(serversData) as McpServer[];
    return servers;
  } catch (error) {
    console.error('Error loading MCP servers:', error);
    return [];
  }
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
          updatedAt: new Date(proj.updatedAt),
          order: typeof proj.order === 'number' ? proj.order : Date.now() // Add order field if missing
=======
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
      // Migrate from old localStorage key to new key
      localStorage.setItem(MCP_SERVERS_KEY, JSON.stringify(servers));
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
