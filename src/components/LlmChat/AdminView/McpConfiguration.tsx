// src/components/LlmChat/AdminView/McpConfiguration.tsx

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { McpServer } from '../types/mcp';
import { Loader2 } from 'lucide-react';
import { useMcp } from '../context/McpContext';

interface McpConfigurationProps {
  servers: McpServer[];
  onServersChange: (servers: McpServer[]) => void;
}

export const McpConfiguration = ({
  servers = [],
  onServersChange
}: McpConfigurationProps) => {
  const [newServer, setNewServer] = useState({
    name: '',
    uri: ''
  });
  const { addServer, removeServer } = useMcp();

  const handleAddServer = async () => {
    const server = {
      id: Math.random().toString(36).substring(7),
      name: newServer.name,
      uri: newServer.uri,
      status: 'connecting' as const
    };

    // Add to project settings
    onServersChange([...servers, server]);

    // Connect using MCP context
    try {
      await addServer(server);
    } catch (error) {
      console.error('Failed to connect to server:', error);
      // Update status to error in project settings
      onServersChange(servers.map(s =>
        s.id === server.id
          ? { ...s, status: 'error', error: error.message }
          : s
      ));
    }

    setNewServer({ name: '', uri: '' });
  };

  const handleRemoveServer = (id: string) => {
    removeServer(id);
    onServersChange(servers.filter(s => s.id !== id));
  };

  return (
    <Card>
      <CardContent className="p-6">
        {/* Rest of the component remains the same */}
        <div className="space-y-2">
          <Input
            placeholder="Server name"
            value={newServer.name}
            onChange={e => setNewServer({...newServer, name: e.target.value})}
          />
          <Input
            placeholder="WebSocket URI (e.g. ws://localhost:3000)"
            value={newServer.uri}
            onChange={e => setNewServer({...newServer, uri: e.target.value})}
          />
          <Button
            onClick={handleAddServer}
            disabled={!newServer.name || !newServer.uri}
            className="w-full"
          >
            Add Server
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
