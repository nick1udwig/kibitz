"use client";

import React, { createContext, useContext, useRef, useState } from 'react';
import { McpServer, McpTool } from '../types/mcp';

interface ServerConnection {
  ws: WebSocket;
  tools: McpTool[];
  status: 'connected' | 'connecting' | 'disconnected' | 'error';
  error?: string;
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
  // Global connection state
  const connections = useRef<Map<string, ServerConnection>>(new Map());
  const connectionPromises = useRef<Map<string, Promise<void>>>(new Map());

  const connectToServer = async (server: McpServer) => {
    // If already connected or connecting, return existing promise
    if (connectionPromises.current.has(server.id)) {
      return connectionPromises.current.get(server.id);
    }

    const connectionPromise = new Promise<void>((resolve, reject) => {
      try {
        const ws = new WebSocket(server.uri);
        const serverConnection: ServerConnection = {
          ws,
          tools: [],
          status: 'connecting'
        };

        connections.current.set(server.id, serverConnection);

        ws.onopen = () => {
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

          if (response.id === 1) {
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
            // Store tools
            serverConnection.tools = response.result.tools;
            serverConnection.status = 'connected';
            resolve();
          }
        };

        ws.onerror = (error) => {
          serverConnection.status = 'error';
          serverConnection.error = 'Connection error';
          reject(error);
        };

        ws.onclose = () => {
          connections.current.delete(server.id);
          connectionPromises.current.delete(server.id);
        };

      } catch (error) {
        reject(error);
      }
    });

    connectionPromises.current.set(server.id, connectionPromise);
    return connectionPromise;
  };

  const disconnectServer = (serverId: string) => {
    const connection = connections.current.get(serverId);
    if (connection) {
      connection.ws.close();
      connections.current.delete(serverId);
      connectionPromises.current.delete(serverId);
    }
  };

  const getServerTools = (serverId: string) => {
    return connections.current.get(serverId)?.tools || [];
  };

  const isServerConnected = (serverId: string) => {
    const connection = connections.current.get(serverId);
    return connection?.status === 'connected';
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
