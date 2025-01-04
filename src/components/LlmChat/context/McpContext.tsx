"use client"

import React, { createContext, useContext, useRef, useState, useEffect } from 'react';
import { McpServer, McpTool, ServerState, ServerConnection } from '../types/mcp';

interface ServerConnection {
  ws: WebSocket;
}

interface McpContextType {
  connectToServer: (server: McpServer, conversationId: string) => Promise<void>;
  disconnectServer: (serverId: string) => void;
  getServerTools: (serverId: string) => McpTool[];
  executeTool: (serverId: string, toolName: string, args: any) => Promise<string>;
  isServerConnected: (serverId: string) => boolean;
  getConversationServers: (conversationId: string) => McpServer[];
  servers: { [key: string]: ServerState };
}

const McpContext = createContext<McpContextType | null>(null);

export const McpProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const connections = useRef<Map<string, ServerConnection>>(new Map());
  const [servers, setServers] = useState<{ [key: string]: ServerState}>({});

  useEffect(() => {
    console.log(`Connected servers updated: ${JSON.stringify(servers)}`);
  }, [servers]);

  const connectToServer = async (server: McpServer, conversationId: string) => {
    const existingServer = Object.entries(servers).find(([_, state]) =>
      state.status !== 'disconnected' &&
      state.conversationId !== conversationId &&
      state.conversationId !== undefined
    );
    if (existingServer) {
      throw new Error('Server already connected to another conversation');
    }

    // Skip if already connected
    if (connections.current.has(server.id)) {
      console.log(`Server ${server.id} already connected, skipping`);
      return;
    }

    try {
      const ws = new WebSocket(server.uri);

      // Update status to connecting
      setServers(prev => ({
        ...prev,
        [server.id]: {
            id: server.id,
            name: server.name,
            uri: server.uri,
            status: 'connecting',
            tools: [],
            conversationId,
        }
      }));

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
            setServers(prev => ({
              ...prev,
              [server.id]: {
                id: server.id,
                name: server.name,
                uri: server.uri,
                status: 'error',
                tools: [],
                error: response.error.message,
                conversationId,
              }
            }));
            return;
          }

          // Store tools and update status to connected
          setServers(prev => ({
            ...prev,
            [server.id]: {
              id: server.id,
              name: server.name,
              uri: server.uri,
              status: 'connected',
              tools: response.result.tools,
              conversationId,
            }
          }));
          console.log(`${server.name} connected!:\n  ${response.result.tools.length}\n  ${JSON.stringify(servers)}`);
        }
      };

      ws.onclose = () => {
        console.log(`WebSocket closed for server ${server.id}`);
        connections.current.delete(server.id);
        setServers(prev => ({
          ...prev,
          [server.id]: {
            id: server.id,
            name: server.name,
            uri: server.uri,
            status: 'disconnected',
            tools: [],
            conversationId,
          }
        }));
      };

      ws.onerror = (error) => {
        console.error(`WebSocket error for server ${server.id}:`, error);
        setServers(prev => ({
          ...prev,
          [server.id]: {
            id: server.id,
            name: server.name,
            uri: server.uri,
            status: 'error',
            tools: [],
            error: error.message || 'Connection error',
            conversationId,
          }
        }));
      };

      connections.current.set(server.id, { ws });

    } catch (error) {
      console.error(`Failed to connect to server ${server.id}:`, error);
      setServers(prev => ({
        ...prev,
        [server.id]: {
          id: server.id,
          name: server.name,
          uri: server.uri,
          status: 'error',
          tools: [],
          error: error instanceof Error ? error.message : 'Connection failed',
          conversationId
        }
      }));
    }
  };
  const getConversationServers = (conversationId: string): McpServer[] => {
    console.log(`getConversationServers servers state: ${JSON.stringify(servers)}`);
    return Object.entries(servers)
      .filter(([_, state]) => state.conversationId === conversationId)
      .map(([id, state]) => ({
        id,
        name: state.name,
        uri: state.uri,
        status: state.status,
        error: state.error,
        tools: state.tools,
      }));
  };

  const disconnectServer = (serverId: string) => {
    const connection = connections.current.get(serverId);
    if (connection) {
      connection.ws.close();
      connections.current.delete(serverId);
      setServers(prev => ({
        ...prev,
        [serverId]: {
          ...prev[serverId],
          status: 'disconnected'
        }
      }));
    }
  };

  const getServerTools = (serverId: string): McpTool[] => {
    return servers[serverId]?.tools || [];
  };

  const isServerConnected = (serverId: string): boolean => {
    return connectedServers[serverId]?.status === 'connected';
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
    getConversationServers,
    servers,
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
