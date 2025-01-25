import { McpServer } from './types/mcp';
import { Tool } from '@anthropic-ai/sdk/resources/messages/messages';
import { Message } from '@/providers/anthropic';

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
