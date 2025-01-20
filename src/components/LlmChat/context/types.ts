import { Message } from '../types';
import { McpServer } from '../types/mcp';
import { Tool as ATool } from '@anthropic-ai/sdk/resources/messages/messages';
import { ProviderConfig, LegacyProviderType, LegacyProviderSettings } from '../types/provider';

// Keep for backwards compatibility
export type ProviderType = LegacyProviderType;

export interface ProjectSettings extends LegacyProviderSettings {
  provider?: LegacyProviderType;  // Optional for backward compatibility
  providerConfig?: ProviderConfig;  // New provider configuration
  model: string;
  groqApiKey?: string;  // API key for GROQ services
  systemPrompt: string;
  mcpServerIds: string[];  // Store server IDs instead of full server objects
  elideToolResults: boolean;
}

export interface ConversationBrief {
  id: string;
  name: string;
  lastUpdated: Date;
  messages: Message[];
  createdAt?: Date;  // Optional to maintain compatibility with existing data
}

export interface Project {
  id: string;
  name: string;
  settings: ProjectSettings;
  conversations: ConversationBrief[];
  createdAt: Date;
  updatedAt: Date;
  order: number;  // Lower number means higher in the list
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
  reconnectServer: (serverId: string) => Promise<McpServerConnection>;
  attemptLocalMcpConnection: () => Promise<McpServerConnection | null>;
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
