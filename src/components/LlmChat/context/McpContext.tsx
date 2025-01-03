"use client"

import React, { createContext, useContext, useRef, useState } from 'react';
import { McpServer, McpTool } from '../types/mcp';

interface ServerConnection {
  ws: WebSocket;
}

interface McpContextType {
  connectToServer: (server: McpServer) => Promise<void>;
  disconnectServer: (serverId: string) => void;
  getServerTools: (serverId: string) => McpTool[];
  executeTool: (serverId: string, toolName: string, args: any) => Promise<string>;
  isServerConnected: (serverId: string) => boolean;
}

const McpContext = createContext<McpContextType | null>(null);

export const McpProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const connections = useRef<Map<string, ServerConnection>>(new Map());
  const [connectedServers, setConnectedServers] = useState<Map<string, {
    status: 'connected' | 'connecting' | 'disconnected' | 'error';
    tools: McpTool[];
    error?: string;
  }>>(new Map());

  const connectToServer = async (server: McpServer) => {
    // Skip if already connected
    if (connections.current.has(server.id)) {
      console.log(`Server ${server.id} already connected, skipping`);
      return;
    }

    try {
      const ws = new WebSocket(server.uri);

      // Update status to connecting
      setConnectedServers(prev => {
        const next = new Map(prev);
        next.set(server.id, { status: 'connecting', tools: [] });
        return next;
      });

      let initialized = false;

      ws.onopen = () => {
        console.log(`WebSocket opened for server ${server.id}`);
        // Send handshake
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

      ws.onmessage = (event) => {
        const response = JSON.parse(event.data);
        console.log('WebSocket message:', response);

        if (response.id === 1 && !initialized) {
          initialized = true;
          // Send initialized notification
          ws.send(JSON.stringify({
            jsonrpc: '2.0',
            method: 'notifications/initialized',
          }));

          // Request tools list
          ws.send(JSON.stringify({
            jsonrpc: '2.0',
            method: 'tools/list',
            id: 2
          }));
        } else if (response.id === 2) {
          if (response.error) {
            console.error(`Failed to get tools for server ${server.id}:`, response.error);
            setConnectedServers(prev => {
              const next = new Map(prev);
              next.set(server.id, {
                status: 'error',
                tools: [],
                error: response.error.message
              });
              return next;
            });
            return;
          }

          // Store tools and update status to connected
          setConnectedServers(prev => {
            const next = new Map(prev);
            next.set(server.id, {
              status: 'connected',
              tools: response.result.tools,
              error: undefined
            });
            return next;
          });
        }
      };

      ws.onclose = () => {
        console.log(`WebSocket closed for server ${server.id}`);
        connections.current.delete(server.id);
        setConnectedServers(prev => {
          const next = new Map(prev);
          next.set(server.id, {
            status: 'disconnected',
            tools: [],
            error: undefined
          });
          return next;
        });
      };

      ws.onerror = (error) => {
        console.error(`WebSocket error for server ${server.id}:`, error);
        setConnectedServers(prev => {
          const next = new Map(prev);
          next.set(server.id, {
            status: 'error',
            tools: [],
            error: error.message || 'Connection error'
          });
          return next;
        });
      };

      connections.current.set(server.id, { ws });

    } catch (error) {
      console.error(`Failed to connect to server ${server.id}:`, error);
      setConnectedServers(prev => {
        const next = new Map(prev);
        next.set(server.id, {
          status: 'error',
          tools: [],
          error: error instanceof Error ? error.message : 'Connection failed'
        });
        return next;
      });
    }
  };

  const disconnectServer = (serverId: string) => {
    const connection = connections.current.get(serverId);
    if (connection) {
      connection.ws.close();
      connections.current.delete(serverId);
    }
  };

  const getServerTools = (serverId: string): McpTool[] => {
    const serverInfo = connectedServers.get(serverId);
    console.log(`Getting tools for server ${serverId}:`, serverInfo);
    if (!serverInfo || serverInfo.status !== 'connected') {
      console.log(`Server ${serverId} not connected or missing tools`);
      return [];
    }
    return serverInfo.tools;
  };

  const isServerConnected = (serverId: string): boolean => {
    return connectedServers.get(serverId)?.status === 'connected';
  };

  const executeTool = async (serverId: string, toolName: string, args: any): Promise<string> => {
    const connection = connections.current.get(serverId);
    if (!connection || connection.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Server not connected');
    }

    return new Promise((resolve, reject) => {
      const requestId = Math.random().toString(36).substring(7);

      const messageHandler = (event: MessageEvent) => {
        const response = JSON.parse(event.data);
        if (response.id === requestId) {
          connection.ws.removeEventListener('message', messageHandler);
          if (response.error) {
            reject(new Error(response.error.message));
          } else {
            resolve(response.result.content[0].text);
          }
        }
      };

      connection.ws.addEventListener('message', messageHandler);

      connection.ws.send(JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: toolName, arguments: args },
        id: requestId
      }));
    });
  };

  const value = {
    connectToServer,
    disconnectServer,
    getServerTools,
    executeTool,
    isServerConnected,
  };

  return <McpContext.Provider value={value}>{children}</McpContext.Provider>;
};

export const useMcp = () => {
  const context = useContext(McpContext);
  if (!context) {
    throw new Error('useMcp must be used within a McpProvider');
  }
  return context;
};
