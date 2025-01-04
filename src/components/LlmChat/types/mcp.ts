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
  id: string;
  name: string;
  uri: string; // WebSocket URI e.g. ws://localhost:3000
  status: 'connected' | 'connecting' | 'disconnected' | 'error';
  error?: string;
  tools: McpTool[];
  conversationId: string;
}

export interface ServerConnection {
  ws: WebSocket;
}
