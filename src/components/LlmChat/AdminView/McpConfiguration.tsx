import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Trash2, RefreshCw } from 'lucide-react';
import { useStore } from '@/stores/rootStore';

interface McpConfigurationProps {
  serverIds: string[];
  onServerIdsChange: (serverIds: string[]) => void;
}

export const McpConfiguration = ({
  serverIds = [],
  onServerIdsChange
}: McpConfigurationProps) => {
  const [newServer, setNewServer] = useState({
    name: '',
    uri: ''
  });
  const { addServer, removeServer, reconnectServer, servers } = useStore();

  const handleAddServer = async () => {
    const server = {
      id: Math.random().toString(36).substring(7),
      name: newServer.name,
      uri: newServer.uri,
      status: 'connecting' as const
    };

    try {
      const connectedServer = await addServer(server);
      // Add to project settings only if connection successful
      if (connectedServer) {
        const updatedServerIds = Array.isArray(serverIds) ? [...serverIds, server.id] : [server.id];
        onServerIdsChange(updatedServerIds);
      }
    } catch (error) {
      console.error('Failed to connect to server:', error);
    }

    setNewServer({ name: '', uri: '' });
  };

  const handleRemoveServer = (serverId: string) => {
    removeServer(serverId);
    onServerIdsChange(serverIds.filter(id => id !== serverId));
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
          {Array.isArray(serverIds) && serverIds.map(serverId => {
            const server = servers.find(s => s.id === serverId);
            if (!server) return null;
            return (
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
              <div className="flex gap-2 ml-2">
                {server.status !== 'connected' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => reconnectServer(server.id)}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveServer(server.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            );
          })}
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
              Connect to WebSocket MCP servers to extend Claude&apos;s capabilities with custom tools.
              Each server should implement the MCP protocol.
            </AlertDescription>
          </Alert>
        </div>
      </CardContent>
    </Card>
  );
};
