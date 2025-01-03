import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { McpServer } from '../types/mcp';
import { Loader2 } from 'lucide-react';
import { useMcpServers } from '@/components/LlmChat/hooks/useMcpServers';
import { useMcp } from '../context/McpContext';

interface McpConfigurationProps {
  servers: McpServer[];
  onServersChange: (servers: McpServer[]) => void;
}

export const McpConfiguration = ({
  servers,
  onServersChange
}: McpConfigurationProps) => {
  const { connectToServer, isServerConnected } = useMcp();
  const { servers: connectedServers, cleanupServer } = useMcpServers(servers);
  const [newServer, setNewServer] = useState({
    name: '',
    uri: ''
  });

  const addServer = () => {
    onServersChange([...servers, {
      id: Math.random().toString(36).substring(7),
      name: newServer.name,
      uri: newServer.uri,
      status: 'disconnected'
    }]);

    setNewServer({ name: '', uri: '' });
  };

  const removeServer = (id: string) => {
    cleanupServer(id);
    onServersChange(servers.filter(s => s.id !== id));
  };

  useEffect(() => {
    // Connect to any servers that aren't already connected
    servers.forEach(server => {
      if (!isServerConnected(server.id)) {
        connectToServer(server).catch(error => {
          console.error(`Failed to connect to server ${server.name}:`, error);
        });
      }
    });
  }, [servers]);

  return (
    <Card>
      <CardContent className="p-6">
        <h3 className="text-lg font-medium mb-4">WS-MCP Servers</h3>

        <div className="space-y-4">
          {servers.map(server => (
            <div key={server.id} className="p-4 border rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <span className="font-medium">{server.name}</span>
                <div className="flex items-center gap-2">
                  {server.status === 'connecting' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <span className={`px-2 py-1 rounded text-sm ${
                      server.status === 'connected' ? 'bg-green-500/20 text-green-500' :
                      server.status === 'error' ? 'bg-red-500/20 text-red-500' :
                      'bg-yellow-500/20 text-yellow-500'
                    }`}>
                      {server.status}
                    </span>
                  )}
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => removeServer(server.id)}
                  >
                    Remove
                  </Button>
                </div>
              </div>

              {server.error && (
                <Alert variant="destructive" className="mt-2">
                  <AlertDescription>{server.error}</AlertDescription>
                </Alert>
              )}

              <div className="mt-2 text-sm text-muted-foreground">
                <div>URI: {server.uri}</div>
                {server.tools && (
                  <div className="truncate">
                    Tools: {server.tools.map(t => t.name).join(', ')}
                  </div>
                )}
              </div>
            </div>
          ))}

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
              onClick={addServer}
              disabled={!newServer.name || !newServer.uri}
              className="w-full"
            >
              Add Server
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
