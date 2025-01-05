// src/components/LlmChat/context/McpContext.tsx

"use client";

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { McpServer, McpTool } from '../types/mcp';
import { McpState, McpServerConnection } from './types';

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
  const [servers, setServers] = useState<McpServerConnection[]>(() =>
    initialServers.map(server => ({
      ...server,
      status: 'disconnected'
    }))
  );
  const connectionsRef = useRef<Map<string, WebSocket>>(new Map());

  // Try to restore server state from localStorage
  useEffect(() => {
    const savedServers = localStorage.getItem('mcp_servers');
    if (savedServers) {
      const parsed = JSON.parse(savedServers);
      setServers(parsed.map((server: McpServerConnection) => ({
        ...server,
        status: 'disconnected' // Reset status on reload
      })));
    }
  }, []);

  // Save server state to localStorage
  useEffect(() => {
    localStorage.setItem('mcp_servers', JSON.stringify(servers));
  }, [servers]);

  const cleanupServer = useCallback((serverId: string) => {
    const ws = connectionsRef.current.get(serverId);
    if (ws) {
      ws.close();
      connectionsRef.current.delete(serverId);
      setServers(current =>
        current.map(s => s.id === serverId
          ? { ...s, status: 'disconnected', tools: undefined }
          : s
        )
      );
    }
  }, []);

  // Reconnect to servers on mount
  useEffect(() => {
    servers.forEach(server => {
      if (server.status !== 'connected') {
        connectToServer(server).catch(console.error);
      }
    });
    return () => {
      servers.forEach(server => cleanupServer(server.id));
    };
  }, []); // Run only on mount

  const connectToServer = useCallback(async (server: McpServer): Promise<McpServerConnection> => {
    try {
      const ws = new WebSocket(server.uri);

      return new Promise((resolve, reject) => {
        console.log(`${server.id} onopen`);
        ws.onopen = () => {
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

        ws.onmessage = (event) => {
          try {
            const response = JSON.parse(event.data);
            console.log(`${server.id} onmessage: ${JSON.stringify(response)}`);

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
              const tools = response.result.tools;
              const connectedServer = {
                ...server,
                status: 'connected' as const,
                tools,
                connection: ws
              };
              resolve(connectedServer);
            }
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          cleanupServer(server.id);
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
        error: error instanceof Error ? error.message : 'Failed to connect'
      };
    }
  }, [cleanupServer]);

  const addServer = useCallback(async (server: McpServer) => {
    setServers(current => [...current, { ...server, status: 'connecting' }]);

    try {
      const connectedServer = await connectToServer(server);
      setServers(current =>
        current.map(s => s.id === server.id ? connectedServer : s)
      );
    } catch (error) {
      setServers(current =>
        current.map(s => s.id === server.id
          ? { ...s, status: 'error', error: 'Connection failed' }
          : s
        )
      );
    }
  }, [connectToServer]);

  const removeServer = useCallback((serverId: string) => {
    cleanupServer(serverId);
    setServers(current => {
      const updatedServers = current.filter(s => s.id !== serverId);
      // Update localStorage
      localStorage.setItem('mcp_servers', JSON.stringify(updatedServers));
      return updatedServers;
    });
  }, [cleanupServer]);

  const executeTool = useCallback(async (
    serverId: string,
    toolName: string,
    args: any
  ): Promise<string> => {
    console.log(`Executing tool ${toolName} on server ${serverId} with args:`, args);
    const ws = connectionsRef.current.get(serverId);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error('Server not connected');
    }

    return new Promise((resolve, reject) => {
      const requestId = Math.random().toString(36).substring(7);
      console.log(`Creating tool request with id ${requestId}`);

      const messageHandler = (event: MessageEvent) => {
        try {
          const response = JSON.parse(event.data);
          console.log(`Received response for request ${requestId}:`, JSON.stringify(response));
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

      const request = {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: toolName, arguments: args },
        id: requestId
      };
      console.log(`Sending tool request:`, request);
      ws.send(JSON.stringify(request));
    });
  }, []);

  useEffect(() => {
    return () => {
      connectionsRef.current.forEach(ws => ws.close());
      connectionsRef.current.clear();
    };
  }, []);

  const value = {
    servers,
    addServer,
    removeServer,
    executeTool
  };

  return (
    <McpContext.Provider value={value}>
      {children}
    </McpContext.Provider>
  );
};
