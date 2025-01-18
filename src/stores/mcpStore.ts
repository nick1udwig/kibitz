import { create } from 'zustand';
import { McpServer } from '../components/LlmChat/types/mcp';
import { McpState, McpServerConnection, Tool } from '../components/LlmChat/context/types';
import { loadMcpServers, saveMcpServers } from '../lib/db';

interface McpStore extends McpState {
  initialize: () => Promise<void>;
}

export const useMcpStore = create<McpStore>((set, get) => {
  // Using refs outside the store to maintain WebSocket connections
  const connectionsRef = new Map<string, WebSocket>();
  const reconnectTimeoutsRef = new Map<string, NodeJS.Timeout>();

  const cleanupServer = (serverId: string) => {
    const existingTimeout = reconnectTimeoutsRef.get(serverId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      reconnectTimeoutsRef.delete(serverId);
    }

    const ws = connectionsRef.get(serverId);
    if (ws) {
      ws.close();
      connectionsRef.delete(serverId);
    }
  };

  const scheduleReconnect = (server: McpServer, delay: number = 5000) => {
    const existingTimeout = reconnectTimeoutsRef.get(server.id);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    const timeout = setTimeout(async () => {
      try {
        await connectToServer(server);
      } catch {
        console.error(`Reconnection failed for ${server.name}`);
        scheduleReconnect(server, Math.min(delay * 2, 30000));
      }
    }, delay);

    reconnectTimeoutsRef.set(server.id, timeout);
  };

  const connectToServer = async (server: McpServer): Promise<McpServerConnection> => {
    try {
      set(state => ({
        servers: state.servers.map(s => s.id === server.id
          ? { ...s, status: 'connecting', error: undefined }
          : s
        )
      }));

      const ws = new WebSocket(server.uri);

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          ws.close();
          reject(new Error('Connection timeout'));
        }, 10000);

        ws.onopen = () => {
          clearTimeout(timeout);
          connectionsRef.set(server.id, ws);

          ws.send(JSON.stringify({
            jsonrpc: '2.0',
            method: 'initialize',
            params: {
              protocolVersion: '0.1.0',
              clientInfo: { name: 'llm-chat', version: '1.0.0' },
              capabilities: { tools: {} }
            },
            id: 1
          }));
        };

        ws.onclose = () => {
          clearTimeout(timeout);
          cleanupServer(server.id);

          set(state => ({
            servers: state.servers.map(s => s.id === server.id
              ? { ...s, status: 'disconnected', error: 'Connection closed' }
              : s
            )
          }));

          scheduleReconnect(server);
        };

        ws.onerror = () => {
          clearTimeout(timeout);
          console.log('WebSocket error (trying to reconnect...)');
          cleanupServer(server.id);

          set(state => ({
            servers: state.servers.map(s => s.id === server.id
              ? { ...s, status: 'error', error: 'Connection error' }
              : s
            )
          }));

          scheduleReconnect(server, 0);
          reject(new Error('WebSocket connection error'));
        };

        ws.onmessage = (event) => {
          try {
            const response = JSON.parse(event.data);

            if (response.id === 1) {
              ws.send(JSON.stringify({
                jsonrpc: '2.0',
                method: 'notifications/initialized',
              }));

              ws.send(JSON.stringify({
                jsonrpc: '2.0',
                method: 'tools/list',
                id: 2
              }));
            } else if (response.id === 2) {
              if (response.error) {
                console.log('Received unexpected WS-MCP message:', response.results);
                return server;
              }
              const tools = response.result.tools.map((tool: Tool) => ({
                ...tool,
                input_schema: tool.inputSchema,
              }));
              const connectedServer = {
                ...server,
                status: 'connected' as const,
                error: undefined,
                tools,
                connection: ws
              };

              set(state => ({
                servers: state.servers.map(s => s.id === server.id ? connectedServer : s)
              }));

              saveMcpServers(get().servers).catch(() => {
                console.error('Error saving MCP servers');
              });

              resolve(connectedServer);
            }
          } catch {
            console.error('Error parsing WebSocket message');
            return {
              ...server,
              status: 'error',
              error: 'Error parsing WebSocket message'
            };
          }
        };
      });
    } catch {
      console.error(`Failed to connect to server ${server.name}`);
      return {
        ...server,
        status: 'error',
        error: 'Failed to connect'
      };
    }
  };

  return {
    servers: [],
    initialize: async () => {
      try {
        const savedServers = await loadMcpServers();
        console.log('Loading servers from IndexedDB:', JSON.stringify(savedServers));
        
        const connectedServers: McpServerConnection[] = [];
        for (const server of savedServers) {
          try {
            const connectedServer = await connectToServer(server);
            connectedServers.push(connectedServer);
          } catch {
            console.error(`Initial connection failed for ${server.name}`);
            connectedServers.push({
              ...server,
              status: 'error',
              error: 'Failed to connect'
            });
          }
        }

        set({ servers: connectedServers });
      } catch {
        console.error('Error initializing MCP servers');
      }
    },

    addServer: async (server: McpServer) => {
      set(state => ({
        servers: [...state.servers, { ...server, status: 'connecting', error: undefined }]
      }));

      try {
        const connectedServer = await connectToServer(server);
        set(state => ({
          servers: state.servers.map(s => s.id === server.id ? connectedServer : s)
        }));
        await saveMcpServers(get().servers);
        return connectedServer;
      } catch {
        set(state => ({
          servers: state.servers.map(s => s.id === server.id
            ? { ...s, status: 'error', error: 'Connection failed' }
            : s
          )
        }));
        return get().servers.find(s => s.id === server.id);
      }
    },

    removeServer: (serverId: string) => {
      cleanupServer(serverId);
      set(state => ({
        servers: state.servers.filter(s => s.id !== serverId)
      }));
      saveMcpServers(get().servers).catch(() => {
        console.error('Error saving MCP servers');
      });
    },

    reconnectServer: async (serverId: string) => {
      const server = get().servers.find(s => s.id === serverId);
      if (!server) {
        throw new Error('Server not found');
      }

      try {
        const connectedServer = await connectToServer(server);
        set(state => ({
          servers: state.servers.map(s => s.id === serverId ? connectedServer : s)
        }));
        await saveMcpServers(get().servers);
        return connectedServer;
      } catch {
        set(state => ({
          servers: state.servers.map(s => s.id === serverId
            ? { ...s, status: 'error', error: 'Reconnection failed' }
            : s
          )
        }));
        throw new Error('Failed to reconnect');
      }
    },

    executeTool: async (serverId: string, toolName: string, args: Record<string, unknown>): Promise<string> => {
      const ws = connectionsRef.get(serverId);
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        throw new Error('Server not connected');
      }

      return new Promise((resolve, reject) => {
        const requestId = Math.random().toString(36).substring(7);

        const messageHandler = (event: MessageEvent) => {
          try {
            const response = JSON.parse(event.data);
            if (response.id === requestId) {
              ws.removeEventListener('message', messageHandler);
              if (response.error) {
                reject(new Error(response.error.message));
              } else {
                resolve(response.result.content[0].text as string);
              }
            }
          } catch {
            console.error('Error parsing tool response');
            reject(new Error('Failed to parse tool response'));
          }
        };

        ws.addEventListener('message', messageHandler);

        ws.send(JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: { name: toolName, arguments: args },
          id: requestId
        }));
      });
    },

    attemptLocalMcpConnection: async () => {
      const id = 'localhost-mcp';
      const wsProtocol = window.location.protocol.endsWith('s:') ? 'wss' : 'ws';
      const defaultWsUri = !process.env.NEXT_PUBLIC_DEFAULT_WS_ENDPOINT
        ? 'ws://localhost:10125'
        : `${wsProtocol}://${window.location.host}${process.env.NEXT_PUBLIC_DEFAULT_WS_ENDPOINT}`;
      const server: McpServer = {
        id: id,
        name: 'Local MCP',
        uri: defaultWsUri,
        status: 'disconnected',
      };

      const existingServer = get().servers.find(server => server.id === id);
      if (existingServer) {
        return existingServer;
      }

      try {
        const connectedServer = await connectToServer(server);
        if (connectedServer.status === 'connected') {
          set(state => ({ servers: [...state.servers, connectedServer] }));
          await saveMcpServers(get().servers);
          return connectedServer;
        }
        return null;
      } catch {
        console.log('Local MCP not available');
        return null;
      }
    },
  };
});