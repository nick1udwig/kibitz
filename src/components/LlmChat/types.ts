import { McpServer } from './types/mcp';
import { Tool, CacheControlEphemeral } from '@anthropic-ai/sdk/resources/messages/messages';

export type MessageContent = {
  type: 'text';
  text: string;
  cache_control?: CacheControlEphemeral | null;
} | {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
  cache_control?: CacheControlEphemeral | null;
} | {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean,
  cache_control?: CacheControlEphemeral | null;
};

export type Message = {
  role: 'user' | 'assistant';
  content: MessageContent[] | string;
  timestamp: Date;
  toolInput?: Record<string, unknown>;
};

export type ConversationSettings = {
  apiKey: string;
  model: string;
  systemPrompt: string;
  tools: Tool[];
  mcpServers: McpServer[];
};

export type Conversation = {
  id: string;
  name: string;
  messages: Message[];
  settings: ConversationSettings;
};
