"use client";

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { McpServer } from '../types/mcp';
import { McpState, McpServerConnection, Tool } from './types';
import { useProjects } from './ProjectContext';
import { Tool as ATool } from '@anthropic-ai/sdk/resources/messages/messages';
import { loadMcpServers, saveMcpServers, migrateFromLocalStorage } from '../../../lib/db';

const McpContext = createContext<McpState | null>(null);

export const useMcp = () => {
  const context = useContext(McpContext);
  if (!context) {
    throw new Error('useMcp must be used within a McpProvider');
  }
  return context;
};

interface McpProviderProps {
  children: React.ReactNode;
  initialServers?: McpServer[];
}

export const McpProvider: React.FC<McpProviderProps> = ({ children, initialServers = [] }) => {
  const { projects, updateProjectSettings } = useProjects();
  const [servers, setServers] = useState<McpServerConnection[]>(() =>
    initialServers.map(server => ({
      ...server,
      status: 'disconnected'
    }))
  );
  const connectionsRef = useRef<Map<string, WebSocket>>(new Map());
  const reconnectTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const cleanupServer = useCallback((serverId: string) => {
    // Clear any existing reconnection timeout
    const existingTimeout = reconnectTimeoutsRef.current.get(serverId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      reconnectTimeoutsRef.current.delete(serverId);
    }

    // Close WebSocket connection
    const ws = connectionsRef.current.get(serverId);
    if (ws) {
      ws.close();
      connectionsRef.current.delete(serverId);
    }
  }, []);

  // use a ref to avoid circular dependencies between scheduleReconnect & connectToServer
  const connectToServerRef = useRef<(server: McpServer) => Promise<McpServerConnection>>(null!);

  const scheduleReconnect = useCallback((server: McpServer, delay: number = 5000) => {
    // Clear any existing reconnection timeout
    const existingTimeout = reconnectTimeoutsRef.current.get(server.id);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Schedule new reconnection attempt
    const timeout = setTimeout(() => {
      connectToServerRef.current?.(server).catch(error => {
        console.error(`Reconnection failed for ${server.name}:`, error);
        // If reconnection fails, schedule another attempt with exponential backoff
        scheduleReconnect(server, Math.min(delay * 2, 30000)); // Cap at 30 seconds
      });
    }, delay);

    reconnectTimeoutsRef.current.set(server.id, timeout);
  }, []);

  const connectToServer = useCallback(async (server: McpServer): Promise<McpServerConnection> => {
    try {
      // Update server status to connecting
      setServers(current =>
        current.map(s => s.id === server.id
          ? { ...s, status: 'connecting', error: undefined }
          : s
        )
      );

      const ws = new WebSocket(server.uri);

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          ws.close();
          reject(new Error('Connection timeout'));
        }, 10000); // 10 second connection timeout

        ws.onopen = () => {
          clearTimeout(timeout);
          connectionsRef.current.set(server.id, ws);

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

          // Update server status to disconnected
          setServers(current =>
            current.map(s => s.id === server.id
              ? { ...s, status: 'disconnected', error: 'Connection closed' }
              : s
            )
          );

          // Schedule reconnection attempt
          scheduleReconnect(server);
        };

          ws.onerror = (error) => {
          clearTimeout(timeout);
          console.error('WebSocket error:', error);
          cleanupServer(server.id);

          // Update server status to error
          setServers(current =>
            current.map(s => s.id === server.id
              ? { ...s, status: 'error', error: 'Connection error' }
              : s
            )
          );

          reject(error);
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
              if (response['error']) {
                console.log(`Received unexpected WS-MCP message: ${response.results}`);
                return server;
              }
              const tools: ATool[] = response.result.tools.map((tool: Tool) => ({
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

              setServers(current =>
                current.map(s => s.id === server.id ? connectedServer : s)
              );

              resolve(connectedServer);
            }
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
            return {
              ...server,
              status: 'error',
              error: error instanceof Error ? error.message : 'Error parsing WebSocket message'
            };
          }
        };
      });
    } catch (error) {
      console.error(`Failed to connect to server ${server.name}:`, error);
      return {
        ...server,
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to connect'
      };
    }
  }, [cleanupServer, scheduleReconnect]);

  const addServer = useCallback(async (server: McpServer) => {
    setServers(current => [...current, { ...server, status: 'connecting', error: undefined }]);

    try {
      const connectedServer = await connectToServer(server);
      setServers(current =>
        current.map(s => s.id === server.id ? connectedServer : s)
      );
      return connectedServer;
    } catch {
      setServers(current =>
        current.map(s => s.id === server.id
          ? { ...s, status: 'error', error: 'Connection failed' }
          : s
        )
      );
      return servers.find(s => s.id === server.id);
    }
  }, [connectToServer, servers]);


  // Try to restore server state from IndexedDB
  useEffect(() => {
    const initializeServers = async () => {
      try {
        // Check if we need to migrate from localStorage
        if (localStorage.getItem('mcp_servers')) {
          await migrateFromLocalStorage();
          // Clear localStorage after successful migration
          localStorage.removeItem('mcp_servers');
        }

        const savedServers = await loadMcpServers();
        console.log(`loading servers from IndexedDB: ${JSON.stringify(savedServers)}`);

        for (const server of savedServers) {
          try {
            const newServer = await addServer(server);
            if (newServer) {
              projects.forEach(project => {
                updateProjectSettings(project.id, { settings: {
                  ...project.settings,
                  mcpServers: project.settings.mcpServers.map(s =>
                    s.id === newServer.id ? { ...s, status: newServer.status, error: undefined } : s
                  ),
                }})
              });
            }
          } catch (error) {
            console.error(`Initial connection failed for ${server.name}:`, error);
          }
        }
      } catch (error) {
        console.error('Error initializing MCP servers:', error);
      }
    };

    initializeServers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save server state to IndexedDB
  useEffect(() => {
    saveMcpServers(servers).catch(error => {
      console.error('Error saving MCP servers:', error);
    });
  }, [servers]);


  const removeServer = useCallback((serverId: string) => {
    cleanupServer(serverId);
    setServers(current => current.filter(s => s.id !== serverId));
  }, [cleanupServer]);

  const reconnectServer = useCallback(async (serverId: string) => {
    const server = servers.find(s => s.id === serverId);
    if (!server) {
      throw new Error('Server not found');
    }

    try {
      const connectedServer = await connectToServer(server);
      setServers(current =>
        current.map(s => s.id === serverId ? connectedServer : s)
      );
      return connectedServer;
    } catch (error) {
      setServers(current =>
        current.map(s => s.id === serverId
          ? { ...s, status: 'error', error: 'Reconnection failed' }
          : s
        )
      );
      throw error;
    }
  }, [connectToServer, servers]);

  const attemptLocalMcpConnection = useCallback(async () => {
    const server: McpServer = {
      id: 'localhost-mcp',
      name: 'Local MCP',
      uri: 'ws://localhost:10125',
      status: 'disconnected',
    };

    try {
      const connectedServer = await connectToServer(server);
      if (connectedServer.status === 'connected') {
        setServers(current => [...current, connectedServer]);
        return connectedServer;
      }
      return null;
    } catch {
      console.log('Local MCP not available');
      return null;
    }
  }, [connectToServer]);

  const value = {
    servers,
    addServer,
    removeServer,
    reconnectServer,
    attemptLocalMcpConnection,
    executeTool: async (serverId: string, toolName: string, args: Record<string, unknown>): Promise<string> => {
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
                resolve(response.result.content[0].text as string);
              }
            }
          } catch (error) {
            console.error('Error parsing tool response:', error);
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
    }
  };

  return (
    <McpContext.Provider value={value}>
      {children}
    </McpContext.Provider>
  );
};
