import { useState, useEffect, useRef, useCallback } from 'react';
import { McpServer, McpTool, McpHandshakeResponse } from '../types/mcp';

export const useMcpServers = (servers: McpServer[]) => {
  const [connectedServers, setConnectedServers] = useState<McpServer[]>(servers);
  const connectionsRef = useRef<Map<string, WebSocket>>(new Map());

  // Memoize the server connection logic
  const connectToServer = useCallback(async (server: McpServer) => {
    try {
      // Don't recreate connection if it already exists
      if (connectionsRef.current.has(server.id)) {
        return server;
      }

      const ws = new WebSocket(server.uri);
      connectionsRef.current.set(server.id, ws);

      return new Promise<McpServer>((resolve, reject) => {
        let resolved = false;

        ws.onopen = () => {
          // Send handshake request
          ws.send(JSON.stringify({
            jsonrpc: '2.0',
            method: 'initialize',
            params: {
              capabilities: {
                tools: {}
              }
            },
            id: 1
          }));
        };

        ws.onmessage = (event) => {
          try {
            const response = JSON.parse(event.data);

            if (response.id === 1) { // Handshake response
              const handshake = response.result as McpHandshakeResponse;

              // Send initialized notification
              ws.send(JSON.stringify({
                jsonrpc: '2.0',
                method: 'initialized',
                params: {}
              }));

              // List available tools
              ws.send(JSON.stringify({
                jsonrpc: '2.0',
                method: 'tools/list',
                id: 2
              }));
            } else if (response.id === 2) { // Tools list response
              const updatedServer = {
                ...server,
                status: 'connected',
                tools: response.result.tools
              };

              if (!resolved) {
                resolved = true;
                resolve(updatedServer);
              }

              setConnectedServers(current =>
                current.map(s => s.id === server.id ? updatedServer : s)
              );
            }
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };

        ws.onerror = (error) => {
          const updatedServer = {
            ...server,
            status: 'error',
            error: 'WebSocket connection error'
          };

          if (!resolved) {
            resolved = true;
            reject(updatedServer);
          }

          setConnectedServers(current =>
            current.map(s => s.id === server.id ? updatedServer : s)
          );
        };

        ws.onclose = () => {
          const updatedServer = {
            ...server,
            status: 'disconnected'
          };

          if (!resolved) {
            resolved = true;
            reject(updatedServer);
          }

          setConnectedServers(current =>
            current.map(s => s.id === server.id ? updatedServer : s)
          );
        };

        // Timeout after 5 seconds
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            reject({
              ...server,
              status: 'error',
              error: 'Connection timeout'
            });
          }
        }, 5000);
      });
    } catch (error) {
      console.error(`Failed to connect to server ${server.name}:`, error);
      return {
        ...server,
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to connect to server'
      };
    }
  }, []);

  const executeTool = useCallback(async (
    serverId: string,
    toolName: string,
    args: any
  ): Promise<string> => {
    const ws = connectionsRef.current.get(serverId);
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
              resolve(response.result.content[0].text);
            }
          }
        } catch (error) {
          console.error('Error parsing tool response:', error);
        }
      };

      ws.addEventListener('message', messageHandler);
      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args
        },
        id: requestId
      }));
    });
  }, []);

  // Clean up function
  const cleanupServers = useCallback(() => {
    connectionsRef.current.forEach((ws) => {
      ws.close();
    });
    connectionsRef.current.clear();
  }, []);

  useEffect(() => {
    const needsUpdate = servers.some((server, index) => {
      const currentServer = connectedServers[index];
      return !currentServer ||
             currentServer.id !== server.id ||
             currentServer.uri !== server.uri;
    });

    if (needsUpdate) {
      cleanupServers();
      Promise.all(servers.map(connectToServer))
        .then(updatedServers => {
          setConnectedServers(updatedServers);
        });
    }

    return () => {
      cleanupServers();
    };
  }, [servers, connectToServer, cleanupServers]);

  return {
    servers: connectedServers,
    executeTool
  };
};
