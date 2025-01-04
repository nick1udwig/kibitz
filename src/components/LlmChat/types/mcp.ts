export interface McpServer {
  id: string;
  name: string;
  uri: string; // WebSocket URI e.g. ws://localhost:3000
  status: 'connected' | 'connecting' | 'disconnected' | 'error';
  error?: string;
  tools?: McpTool[];
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: object;
}

export interface ServerState {
  status: 'connected' | 'connecting' | 'disconnected' | 'error';
  tools: McpTool[];
  error?: string;
  conversationId: string; // Added to track ownership
}

export interface ServerConnection {
  ws: WebSocket;
}
