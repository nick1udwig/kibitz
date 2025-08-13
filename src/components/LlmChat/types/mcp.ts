import { Tool } from '@anthropic-ai/sdk/resources/messages/messages';

export interface McpServer {
  id: string;
  name: string;
  uri: string; // HTTP/HTTPS URI for shim mode (was WebSocket URI)
  status: 'connected' | 'connecting' | 'disconnected' | 'error';
  error?: string;
  tools?: Tool[];
  // Shim mode authentication
  clientId?: string;
  token?: string;
}
