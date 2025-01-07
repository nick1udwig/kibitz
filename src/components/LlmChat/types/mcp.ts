import { Tool } from '@anthropic-ai/sdk/resources/messages/messages';

export interface McpServer {
  id: string;
  name: string;
  uri: string; // WebSocket URI e.g. ws://localhost:3000
  status: 'connected' | 'connecting' | 'disconnected' | 'error';
  error?: string;
  tools?: Tool[];
}
