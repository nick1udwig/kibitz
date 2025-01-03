
import { useState, useEffect } from 'react';
import { McpServer } from '../types/mcp';
import { useMcp } from '../context/McpContext';

export const useMcpServers = (servers: McpServer[]) => {
  const { getServerTools, executeTool, cleanupServer } = useMcp();
  const [connectedServers, setConnectedServers] = useState<McpServer[]>(servers);

  // Only handle cleanup and server list updates
  useEffect(() => {
    setConnectedServers(servers);
  }, [servers]);

  return {
    servers: connectedServers,
    executeTool,
    cleanupServer
  };
};
