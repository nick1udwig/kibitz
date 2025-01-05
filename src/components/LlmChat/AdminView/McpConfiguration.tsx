import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { McpServer } from '../types/mcp';
import { Loader2, Trash2 } from 'lucide-react';
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

    // Add to project settings first
    const updatedServers = [...servers, server];
    onServersChange(updatedServers);

    // Connect using MCP context
    try {
      await addServer(server);
      // Update the server status after successful connection
      onServersChange(updatedServers.map(s =>
        s.id === server.id
          ? { ...s, status: 'connected' }
          : s
      ));
    } catch (error) {
      console.error('Failed to connect to server:', error);
      // Update status to error in project settings
      onServersChange(updatedServers.map(s =>
        s.id === server.id
          ? { ...s, status: 'error', error: error instanceof Error ? error.message : 'Failed to connect' }
          : s
      ));
    }

    setNewServer({ name: '', uri: '' });
  };

  const handleRemoveServer = (id: string) => {
    removeServer(id);
    onServersChange(servers.filter(s => s.id !== id));
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected':
        return 'text-green-500';
      case 'connecting':
        return 'text-yellow-500';
      case 'error':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  };

  return (
    <Card>
      <CardContent className="p-6">
        <h3 className="text-lg font-medium mb-4">WebSocket MCP Servers</h3>

        {/* Server List */}
        <div className="space-y-3 mb-4">
          {servers.map(server => (
            <div key={server.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{server.name}</span>
                  <span className={`text-sm ${getStatusColor(server.status)}`}>
                    ({server.status})
                  </span>
                </div>
                <div className="text-sm text-muted-foreground">{server.uri}</div>
                {server.error && (
                  <div className="text-sm text-red-500 mt-1">{server.error}</div>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRemoveServer(server.id)}
                className="ml-2"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        {/* Add New Server Form */}
        <div className="space-y-2">
          <div>
            <Input
              placeholder="Server name"
              value={newServer.name}
              onChange={e => setNewServer({...newServer, name: e.target.value})}
              className="mb-2"
            />
            <Input
              placeholder="WebSocket URI (e.g. ws://localhost:3000)"
              value={newServer.uri}
              onChange={e => setNewServer({...newServer, uri: e.target.value})}
            />
          </div>
          <Button
            onClick={handleAddServer}
            disabled={!newServer.name || !newServer.uri}
            className="w-full"
          >
            Add Server
          </Button>
        </div>

        {/* Help Text */}
        <div className="mt-4">
          <Alert>
            <AlertDescription>
              Connect to WebSocket MCP servers to extend Claude's capabilities with custom tools.
              Each server should implement the MCP protocol.
            </AlertDescription>
          </Alert>
        </div>
      </CardContent>
    </Card>
  );
};
