"use client";

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { McpServer } from '../types/mcp';
import { McpState, McpServerConnection, Tool } from './types';
import { useProjects } from './ProjectContext';
import { Tool as ATool } from '@anthropic-ai/sdk/resources/messages/messages';
import { loadMcpServers, saveMcpServers } from '../../../lib/db';

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
  const lastReconnectAttemptRef = useRef<Map<string, number>>(new Map());
  const reconnectAttemptsRef = useRef<Map<string, number>>(new Map());

  const getBackoffTime = useCallback((serverId: string) => {
    const attempts = reconnectAttemptsRef.current.get(serverId) || 0;
    // Base delay is 1 second, doubles each attempt, caps at 30 seconds
    return Math.min(1000 * Math.pow(2, attempts), 30000);
  }, []);

  const connectToServer = useCallback(async (server: McpServer): Promise<McpServerConnection> => {
    const now = Date.now();
    const lastAttempt = lastReconnectAttemptRef.current.get(server.id) || 0;
    const backoff = getBackoffTime(server.id);
    if (now - lastAttempt < backoff) {
      throw new Error('Too many connection attempts');
    }
    lastReconnectAttemptRef.current.set(server.id, now);

    try {
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
        }, 10000);

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
          const existing = connectionsRef.current.get(server.id);
          if (existing === ws) {
            connectionsRef.current.delete(server.id);
            // Increment attempt counter on disconnect
            const attempts = (reconnectAttemptsRef.current.get(server.id) || 0) + 1;
            reconnectAttemptsRef.current.set(server.id, attempts);
            setServers(current =>
              current.map(s => s.id === server.id
                ? { ...s, status: 'disconnected', error: undefined }
                : s
              )
            );
          }
        };

        ws.onerror = (error) => {
          clearTimeout(timeout);
          const existing = connectionsRef.current.get(server.id);
          if (existing === ws) {
            connectionsRef.current.delete(server.id);
            setServers(current =>
              current.map(s => s.id === server.id
                ? { ...s, status: 'error', error: undefined }
                : s
              )
            );
          }
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
                return server;
              }
              // Reset attempt counter on successful connection
              reconnectAttemptsRef.current.delete(server.id);
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
          } catch {
            return {
              ...server,
              status: 'error',
              error: undefined
            };
          }
        };
      });
    } catch {
      return {
        ...server,
        status: 'error',
        error: undefined
      };
    }
  }, []);

  const addServer = useCallback(async (server: McpServer) => {
    setServers(current => {
      const exists = current.some(s => s.id === server.id);
      if (exists) {
        return current.map(s => s.id === server.id ? { ...server, status: 'connecting', error: undefined } : s);
      }
      return [...current, { ...server, status: 'connecting', error: undefined }];
    });

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

  const removeServer = useCallback((serverId: string) => {
    const ws = connectionsRef.current.get(serverId);
    if (ws) {
      ws.close();
      connectionsRef.current.delete(serverId);
    }
    setServers(current => current.filter(s => s.id !== serverId));
  }, []);

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
    const id = 'localhost-mcp';
    const server: McpServer = {
      id,
      name: 'Local MCP',
      uri: 'ws://localhost:10125',
      status: 'disconnected',
    };

    const existingServer = servers.find(server => server.id === id);
    if (existingServer) {
      return existingServer;
    }

    try {
      const connectedServer = await connectToServer(server);
      if (connectedServer.status === 'connected') {
        // Only add if not already in the list
        setServers(current => {
          const exists = current.some(s => s.id === id);
          if (exists) {
            return current.map(s => s.id === id ? connectedServer : s);
          }
          return [...current, connectedServer];
        });
        return connectedServer;
      }
      return null;
    } catch {
      console.log('Local MCP not available');
      return null;
    }
  }, [connectToServer, servers]);

  // Load initial servers from IndexedDB
  useEffect(() => {
    const initializeServers = async () => {
      try {
        const savedServers = await loadMcpServers();
        for (const server of savedServers) {
          await addServer(server).catch(console.error);
        }
      } catch (error) {
        console.error('Error initializing MCP servers:', error);
      }
    };

    initializeServers();
  }, [addServer]);

  // Save servers to IndexedDB when they change
  useEffect(() => {
    saveMcpServers(servers).catch(console.error);
  }, [servers]);

  // Connection checker that runs every 2 seconds with backoff
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      servers.forEach(server => {
        const ws = connectionsRef.current.get(server.id);
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          const lastAttempt = lastReconnectAttemptRef.current.get(server.id) || 0;
          const timeSinceLastAttempt = now - lastAttempt;
          // Only attempt reconnection if at least 5 seconds have passed
          if (timeSinceLastAttempt >= 5000) {
            lastReconnectAttemptRef.current.set(server.id, now);
            reconnectServer(server.id).catch(console.error);
          }
        }
      });
    }, 2000);
    
    return () => clearInterval(interval);
  }, [servers, reconnectServer]);

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