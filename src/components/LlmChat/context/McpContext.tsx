//"use client";
//
//import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
//import { McpServer } from '../types/mcp';
//import { McpState, McpServerConnection } from './types';
//import { useProjects } from './ProjectContext';
//
//const McpContext = createContext<McpState | null>(null);
//
//export const useMcp = () => {
//  const context = useContext(McpContext);
//  if (!context) {
//    throw new Error('useMcp must be used within a McpProvider');
//  }
//  return context;
//};
//
//interface McpProviderProps {
//  children: React.ReactNode;
//  initialServers?: McpServer[];
//}
//
//export const McpProvider: React.FC<McpProviderProps> = ({ children, initialServers = [] }) => {
//  const { projects, updateProjectSettings } = useProjects();
//  const [servers, setServers] = useState<McpServerConnection[]>(() =>
//    initialServers.map(server => ({
//      ...server,
//      status: 'disconnected'
//    }))
//  );
//  const connectionsRef = useRef<Map<string, WebSocket>>(new Map());
//  const reconnectTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
//
//  const cleanupServer = useCallback((serverId: string) => {
//    // Clear any existing reconnection timeout
//    const existingTimeout = reconnectTimeoutsRef.current.get(serverId);
//    if (existingTimeout) {
//      clearTimeout(existingTimeout);
//      reconnectTimeoutsRef.current.delete(serverId);
//    }
//
//    // Close WebSocket connection
//    const ws = connectionsRef.current.get(serverId);
//    if (ws) {
//      ws.close();
//      connectionsRef.current.delete(serverId);
//    }
//  }, []);
//
//  const scheduleReconnect = useCallback((server: McpServer, delay: number = 5000) => {
//    // Clear any existing reconnection timeout
//    const existingTimeout = reconnectTimeoutsRef.current.get(server.id);
//    if (existingTimeout) {
//      clearTimeout(existingTimeout);
//    }
//
//    // Schedule new reconnection attempt
//    const timeout = setTimeout(() => {
//      connectToServer(server).catch(error => {
//        console.error(`Reconnection failed for ${server.name}:`, error);
//        // If reconnection fails, schedule another attempt with exponential backoff
//        scheduleReconnect(server, Math.min(delay * 2, 30000)); // Cap at 30 seconds
//      });
//    }, delay);
//
//    reconnectTimeoutsRef.current.set(server.id, timeout);
//  }, []);
//
//  const connectToServer = useCallback(async (server: McpServer): Promise<McpServerConnection> => {
//    try {
//      // Update server status to connecting
//      setServers(current =>
//        current.map(s => s.id === server.id
//          ? { ...s, status: 'connecting' }
//          : s
//        )
//      );
//
//      const ws = new WebSocket(server.uri);
//
//      return new Promise((resolve, reject) => {
//        const timeout = setTimeout(() => {
//          ws.close();
//          reject(new Error('Connection timeout'));
//        }, 10000); // 10 second connection timeout
//
//        ws.onopen = () => {
//          clearTimeout(timeout);
//          connectionsRef.current.set(server.id, ws);
//
//          ws.send(JSON.stringify({
//            jsonrpc: '2.0',
//            method: 'initialize',
//            params: {
//              protocolVersion: '0.1.0',
//              clientInfo: { name: 'llm-chat', version: '1.0.0' },
//              capabilities: { tools: {} }
//            },
//            id: 1
//          }));
//        };
//
//        ws.onclose = () => {
//          clearTimeout(timeout);
//          cleanupServer(server.id);
//
//          // Update server status to disconnected
//          setServers(current =>
//            current.map(s => s.id === server.id
//              ? { ...s, status: 'disconnected', error: 'Connection closed' }
//              : s
//            )
//          );
//
//          // Schedule reconnection attempt
//          scheduleReconnect(server);
//        };
//
//        ws.onerror = (error) => {
//          clearTimeout(timeout);
//          console.error('WebSocket error:', error);
//          cleanupServer(server.id);
//
//          // Update server status to error
//          setServers(current =>
//            current.map(s => s.id === server.id
//              ? { ...s, status: 'error', error: 'Connection error' }
//              : s
//            )
//          );
//
//          reject(error);
//        };
//
//        ws.onmessage = (event) => {
//          try {
//            const response = JSON.parse(event.data);
//
//            if (response.id === 1) {
//              ws.send(JSON.stringify({
//                jsonrpc: '2.0',
//                method: 'notifications/initialized',
//              }));
//
//              ws.send(JSON.stringify({
//                jsonrpc: '2.0',
//                method: 'tools/list',
//                id: 2
//              }));
//            } else if (response.id === 2) {
//              const tools = response.result.tools;
//              const connectedServer = {
//                ...server,
//                status: 'connected' as const,
//                tools,
//                connection: ws
//              };
//
//              setServers(current =>
//                current.map(s => s.id === server.id ? connectedServer : s)
//              );
//
//              resolve(connectedServer);
//            }
//          } catch (error) {
//            console.error('Error parsing WebSocket message:', error);
//          }
//        };
//      });
//    } catch (error) {
//      console.error(`Failed to connect to server ${server.name}:`, error);
//      return {
//        ...server,
//        status: 'error',
//        error: error instanceof Error ? error.message : 'Failed to connect'
//      };
//    }
//  }, [cleanupServer, scheduleReconnect]);
//
//  // Load saved servers after ProjectProvider is initialized
//  useEffect(() => {
//    if (projects.length > 0) { // Only run after projects are loaded
//      const savedServers = localStorage.getItem('mcp_servers');
//      if (savedServers) {
//        try {
//          const parsed = JSON.parse(savedServers);
//
//          // First update the internal servers state
//          setServers(parsed.map((server: McpServer) => ({
//            ...server,
//            status: 'disconnected'
//          })));
//
//          // Then try to connect each server
//          parsed.forEach((server: McpServer) => {
//            addServer(server)
//              .catch(error => {
//                console.error(`Initial connection failed for ${server.name}:`, error);
//              })
//              .then(newServer => {
//                if (newServer) {
//                  // Update each project's settings to include this server if it doesn't exist
//                  projects.forEach(project => {
//                    const currentServers = project.settings.mcpServers || [];
//                    const serverExists = currentServers.some(s => s.id === newServer.id);
//
//                    if (!serverExists) {
//                      // Add the server to project settings if it doesn't exist
//                      updateProjectSettings(project.id, {
//                        settings: {
//                          ...project.settings,
//                          mcpServers: [...currentServers, newServer]
//                        }
//                      });
//                    } else {
//                      // Update existing server status
//                      updateProjectSettings(project.id, {
//                        settings: {
//                          ...project.settings,
//                          mcpServers: currentServers.map(s =>
//                            s.id === newServer.id ? { ...s, status: newServer.status } : s
//                          )
//                        }
//                      });
//                    }
//                  });
//                }
//              });
//          });
//        } catch (error) {
//          console.error('Error parsing saved servers:', error);
//        }
//      }
//    }
//  }, [projects]); // Depend on projects to ensure this runs after ProjectProvider initializes
//
//  // Save server state to localStorage
//  useEffect(() => {
//    localStorage.setItem('mcp_servers', JSON.stringify(servers));
//  }, [servers]);
//
//  const addServer = useCallback(async (server: McpServer) => {
//    setServers(current => [...current, { ...server, status: 'connecting' }]);
//
//    try {
//      const connectedServer = await connectToServer(server);
//      setServers(current =>
//        current.map(s => s.id === server.id ? connectedServer : s)
//      );
//      return connectedServer;
//    } catch (error) {
//      setServers(current =>
//        current.map(s => s.id === server.id
//          ? { ...s, status: 'error', error: 'Connection failed' }
//          : s
//        )
//      );
//      return servers.find(s => s.id === server.id);
//    }
//  }, [connectToServer]);
//
//  const removeServer = useCallback((serverId: string) => {
//    cleanupServer(serverId);
//    setServers(current => current.filter(s => s.id !== serverId));
//  }, [cleanupServer]);
//
//  const value = {
//    servers,
//    addServer,
//    removeServer,
//    executeTool: async (serverId: string, toolName: string, args: any) => {
//      const ws = connectionsRef.current.get(serverId);
//      if (!ws || ws.readyState !== WebSocket.OPEN) {
//        throw new Error('Server not connected');
//      }
//
//      return new Promise((resolve, reject) => {
//        const requestId = Math.random().toString(36).substring(7);
//
//        const messageHandler = (event: MessageEvent) => {
//          try {
//            const response = JSON.parse(event.data);
//            if (response.id === requestId) {
//              ws.removeEventListener('message', messageHandler);
//              if (response.error) {
//                reject(new Error(response.error.message));
//              } else {
//                resolve(response.result.content[0].text);
//              }
//            }
//          } catch (error) {
//            console.error('Error parsing tool response:', error);
//          }
//        };
//
//        ws.addEventListener('message', messageHandler);
//
//        ws.send(JSON.stringify({
//          jsonrpc: '2.0',
//          method: 'tools/call',
//          params: { name: toolName, arguments: args },
//          id: requestId
//        }));
//      });
//    }
//  };
//
//  return (
//    <McpContext.Provider value={value}>
//      {children}
//    </McpContext.Provider>
//  );
//};




"use client";

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { McpServer } from '../types/mcp';
import { McpState, McpServerConnection } from './types';
import { useProjects } from './ProjectContext';

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

let hasInitialized = false;

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

  // TODO: figure out how to restore server state from localStorage
  //       problem is that we use onServersChange in AdminView/McpConfiguration and AdminView/index
  //       to propagate changes to servers here over to settings that are actually viewable by GUI.
  //       So this method has two issues:
  //       1. Can't propagate to GUI
  //       2. It gets into an infinite reconnect loop somehow
  //// Try to restore server state from localStorage
  useEffect(() => {
    if (hasInitialized) {
      return;
    }
    hasInitialized = true;
    const savedServers = localStorage.getItem('mcp_servers');
    if (savedServers) {
      try {
        const parsed = JSON.parse(savedServers);
        console.log(`loading servers from local storage: ${JSON.stringify(parsed)}`);
        parsed.forEach(server => {
          addServer(server)
            .catch(error => {
              console.error(`Initial connection failed for ${server.name}:`, error);
            })
            .then(newServer => {
              console.log(`newServer ${JSON.stringify(newServer)}`);
              projects.forEach(project => {
                updateProjectSettings(project.id, { settings: {
                  ...project.settings,
                  mcpServers: project.settings.mcpServers.map(s =>
                    newServer && s.id === newServer.id ? { ...s, status: newServer.status } : s
                  ),
                }})
              })}
            );
        });
      } catch (error) {
        console.error('Error parsing saved servers:', error);
      }
    }
  }, [projects]);

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

  const scheduleReconnect = useCallback((server: McpServer, delay: number = 5000) => {
    // Clear any existing reconnection timeout
    const existingTimeout = reconnectTimeoutsRef.current.get(server.id);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Schedule new reconnection attempt
    const timeout = setTimeout(() => {
      connectToServer(server).catch(error => {
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
          ? { ...s, status: 'connecting' }
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
              const tools = response.result.tools;
              const connectedServer = {
                ...server,
                status: 'connected' as const,
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

  //// Attempt to reconnect to saved servers on mount
  //useEffect(() => {
  //  // Get saved servers from props instead of localStorage to avoid state conflicts
  //  if (initialServers.length > 0) {
  //    const connectToSavedServers = async () => {
  //      for (const server of initialServers) {
  //        try {
  //          await connectToServer(server);
  //        } catch (error) {
  //          console.error(`Failed to reconnect to ${server.name}:`, error);
  //          // Update server status to disconnected
  //          setServers(current =>
  //            current.map(s => s.id === server.id
  //              ? { ...s, status: 'disconnected', error: 'Connection failed on startup' }
  //              : s
  //            )
  //          );
  //        }
  //      }
  //    };

  //    connectToSavedServers();
  //  }

  //  // Cleanup connections on unmount
  //  return () => {
  //    if (Array.isArray(initialServers)) {
  //      initialServers.forEach(server => {
  //        cleanupServer(server.id);
  //      });
  //    }
  //  };
  //}, [initialServers, connectToServer, cleanupServer]);

  // Save server state to localStorage
  useEffect(() => {
    localStorage.setItem('mcp_servers', JSON.stringify(servers));
  }, [servers]);


  // Rest of the component implementation remains the same...
  const addServer = useCallback(async (server: McpServer) => {
    setServers(current => [...current, { ...server, status: 'connecting' }]);

    try {
      const connectedServer = await connectToServer(server);
      setServers(current =>
        current.map(s => s.id === server.id ? connectedServer : s)
      );
      return connectedServer;
    } catch (error) {
      setServers(current =>
        current.map(s => s.id === server.id
          ? { ...s, status: 'error', error: 'Connection failed' }
          : s
        )
      );
      return servers.find(s => s.id === server.id);
    }
  }, [connectToServer]);

  const removeServer = useCallback((serverId: string) => {
    cleanupServer(serverId);
    setServers(current => current.filter(s => s.id !== serverId));
  }, [cleanupServer]);

  const value = {
    servers,
    addServer,
    removeServer,
    executeTool: async (serverId: string, toolName: string, args: any) => {
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
