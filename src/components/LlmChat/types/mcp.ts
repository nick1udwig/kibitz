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

// Add types for the handshake
export interface McpHandshakeResponse {
  name: string;
  version: string;
  capabilities: {
    tools?: {
      list: McpTool[];
    };
    // Could add other capabilities here
  };
}
