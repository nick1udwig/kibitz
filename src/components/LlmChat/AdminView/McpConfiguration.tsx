import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { McpServer } from '../types/mcp';
import { Loader2 } from 'lucide-react';
import { useMcp } from '../context/McpContext';

export const McpConfiguration = ({ conversationId }: { conversationId: string }) => {
  const { servers, connectToServer, disconnectServer } = useMcp();
  const [newServer, setNewServer] = useState({ name: '', uri: '' });
  const [formError, setFormError] = useState('');

  // Ensure we always have a defined value for server fields
  const getServerName = (server: any) => {
    return typeof server.name === 'string' ? server.name : '';
  };

  const getServerUri = (server: any) => {
    return typeof server.uri === 'string' ? server.uri : '';
  };

  const conversationServers = Object.entries(servers || {})
    .filter(([_, state]) => state.conversationId === conversationId)
    .map(([id, state]) => ({
      id,
      name: getServerName(state),
      uri: getServerUri(state),
      status: state?.status || 'disconnected',
      tools: state?.tools || [],
      error: state?.error
    }));

  const addServer = async () => {
    if (!newServer.name || !newServer.uri) {
      setFormError('Both name and URI are required');
      return;
    }

    try {
      const server = {
        id: Math.random().toString(36).substring(7),
        name: newServer.name.trim(),
        uri: newServer.uri.trim(),
        status: 'disconnected'
      };

      await connectToServer(server, conversationId);
      setNewServer({ name: '', uri: '' });
      setFormError('');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Failed to add server');
      console.error('Failed to add server:', error);
    }
  };

  const removeServer = (id: string) => {
    disconnectServer(id);
  };

  return (
    <Card>
      <CardContent className="p-6">
        <h3 className="text-lg font-medium mb-4">WS-MCP Servers</h3>

        <div className="space-y-4">
          {Object.entries(servers || {}).map(([serverId, server]) => (
            <div key={serverId} className="p-4 border rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <span className="font-medium">{getServerName(server)}</span>
                <div className="flex items-center gap-2">
                  {server.status === 'connecting' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <span className={`px-2 py-1 rounded text-sm ${
                      server.status === 'connected' ? 'bg-green-500/20 text-green-500' :
                      server.status === 'error' ? 'bg-red-500/20 text-red-500' :
                      'bg-yellow-500/20 text-yellow-500'
                    }`}>
                      {server.status || 'disconnected'}
                    </span>
                  )}
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => removeServer(serverId)}
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
                <div>URI: {getServerUri(server)}</div>
                {server.tools && server.tools.length > 0 && (
                  <div className="truncate">
                    Tools: {server.tools.map(t => t.name).join(', ')}
                  </div>
                )}
              </div>
            </div>
          ))}

          <div className="space-y-2">
            {formError && (
              <Alert variant="destructive">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}
            <Input
              placeholder="Server name"
              value={newServer.name || ''}
              onChange={e => setNewServer(prev => ({...prev, name: e.target.value}))}
            />
            <Input
              placeholder="WebSocket URI (e.g. ws://localhost:3000)"
              value={newServer.uri || ''}
              onChange={e => setNewServer(prev => ({...prev, uri: e.target.value}))}
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
