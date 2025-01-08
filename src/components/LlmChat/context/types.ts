import { Message } from '../types';
import { McpServer } from '../types/mcp';
import { Tool as ATool } from '@anthropic-ai/sdk/resources/messages/messages';

export interface ProjectSettings {
  apiKey: string;
  model: string;
  systemPrompt: string;
  mcpServers: McpServer[];
}

export interface ConversationBrief {
  id: string;
  name: string;
  lastUpdated: Date;
  messages: Message[];
}

export interface Project {
  id: string;
  name: string;
  settings: ProjectSettings;
  conversations: ConversationBrief[];
  createdAt: Date;
  updatedAt: Date;
}

export interface McpServerConnection extends McpServer {
  connection?: WebSocket;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  error?: string;
}

export interface McpState {
  servers: McpServerConnection[];
  addServer: (server: McpServer) => Promise<McpServerConnection | void>;
  removeServer: (serverId: string) => void;
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>;
}

export interface ProjectState {
  projects: Project[];
  activeProjectId: string | null;
  activeConversationId: string | null;
  createProject: (name: string, settings?: Partial<ProjectSettings>) => void;
  deleteProject: (id: string) => void;
  updateProjectSettings: (id: string, updates: {
    settings?: Partial<ProjectSettings>;
    conversations?: ConversationBrief[];
  }) => void;
  createConversation: (projectId: string, name?: string) => void;
  deleteConversation: (projectId: string, conversationId: string) => void;
  renameConversation: (projectId: string, conversationId: string, newName: string) => void;
  renameProject: (projectId: string, newName: string) => void;
  setActiveProject: (projectId: string | null) => void;
  setActiveConversation: (conversationId: string | null) => void;
}

export interface Tool {
  name: string,
  inputSchema: ATool.InputSchema,
  description?: string,
};
