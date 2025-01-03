import { useState, useEffect, useRef, useCallback } from 'react';
import { McpServer, McpTool, McpHandshakeResponse } from '../types/mcp';

export const useMcpServers = (servers: McpServer[]) => {
  const [connectedServers, setConnectedServers] = useState<McpServer[]>(servers);
  const connectionsRef = useRef<Map<string, WebSocket>>(new Map());

  const cleanupServer = useCallback((serverId: string) => {
    const ws = connectionsRef.current.get(serverId);
    if (ws) {
      ws.close();
      connectionsRef.current.delete(serverId);
      setConnectedServers(current =>
        current.map(s => s.id === serverId
          ? { ...s, status: 'disconnected' }
          : s
        )
      );
    }
  }, []);

  const connectToServer = useCallback(async (server: McpServer) => {
    try {
      // Update status to connecting
      setConnectedServers(current =>
        current.map(s => s.id === server.id
          ? { ...s, status: 'connecting' }
          : s
        )
      );

      const ws = new WebSocket(server.uri);
      connectionsRef.current.set(server.id, ws);

      return new Promise<McpServer>((resolve, reject) => {
        ws.onopen = () => {
          // Send handshake request with all required fields
          ws.send(JSON.stringify({
            jsonrpc: '2.0',
            method: 'initialize',
            params: {
              protocolVersion: '0.1.0',
              clientInfo: {
                name: 'llm-chat',
                version: '1.0.0'
              },
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
              // Send initialized notification
              ws.send(JSON.stringify({
                jsonrpc: '2.0',
                method: 'notifications/initialized',
              }));

              // List available tools
              ws.send(JSON.stringify({
                jsonrpc: '2.0',
                method: 'tools/list',
                id: 2
              }));
            } else if (response.id === 2) { // Tools list response
              const tools = response.result.tools;
              // Update server with connected status and tools
              setConnectedServers(current =>
                current.map(s => s.id === server.id
                  ? { ...s, status: 'connected', tools }
                  : s
                )
              );
              resolve({ ...server, status: 'connected', tools });
            }
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };


        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          setConnectedServers(current =>
            current.map(s => s.id === server.id
              ? { ...s, status: 'error', error: 'Connection error' }
              : s
            )
          );
          reject(error);
        };

        ws.onclose = () => {
          cleanupServer(server.id);
        };
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
    console.log(`Executing tool ${toolName} on server ${serverId} with args:`, args);

    const ws = connectionsRef.current.get(serverId);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.error(`Server ${serverId} not connected. WebSocket state:`, ws?.readyState);
      throw new Error('Server not connected');
    }

    return new Promise((resolve, reject) => {
      const requestId = Math.random().toString(36).substring(7);
      console.log(`Creating tool request with id ${requestId}`);

      const messageHandler = (event: MessageEvent) => {
        try {
          const response = JSON.parse(event.data);
          console.log(`Received response for request ${requestId}:`, response);

          if (response.id === requestId) {
            ws.removeEventListener('message', messageHandler);
            if (response.error) {
              console.error(`Tool execution error:`, response.error);
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

      const request = {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args
        },
        id: requestId
      };

      console.log(`Sending tool request:`, request);
      ws.send(JSON.stringify(request));
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
    let cancelled = false;

    const updateConnections = async () => {
      const needsUpdate = servers.some((server, index) => {
        const currentServer = connectedServers[index];
        return !currentServer ||
               currentServer.id !== server.id ||
               currentServer.uri !== server.uri;
      });

      if (needsUpdate) {
        console.log('Updating MCP server connections...');
        cleanupServers();

        try {
          const updatedServers = await Promise.all(
            servers.map(async (server) => {
              try {
                return await connectToServer(server);
              } catch (error) {
                console.error(`Failed to connect to server ${server.name}:`, error);
                return {
                  ...server,
                  status: 'error',
                  error: error instanceof Error ? error.message : 'Connection failed'
                };
              }
            })
          );

          if (!cancelled) {
            console.log('Updated MCP server connections:', updatedServers);
            setConnectedServers(updatedServers);
          }
        } catch (error) {
          console.error('Error updating MCP servers:', error);
        }
      }
    };

    updateConnections();

    return () => {
      cancelled = true;
      cleanupServers();
    };
  }, [servers, connectToServer, cleanupServers]);

  return {
    servers: connectedServers,
    executeTool,
    cleanupServer
  };
};
