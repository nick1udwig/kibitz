import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useStore } from '@/stores/rootStore';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Server, ChevronRight } from 'lucide-react';

const ToolsView = () => {
  const { servers } = useStore();
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});

  return (
    <div className="space-y-4 p-4">
      <h2 className="text-xl font-bold mb-4">Available Tools</h2>
      
      {servers.length === 0 ? (
        <Alert>
          <AlertDescription>
            No MCP servers connected. Tools will appear here when servers connect.
          </AlertDescription>
        </Alert>
      ) : (
        servers.map((server) => (
          <Card key={server.id} className="mb-4">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Server className={`h-5 w-5 ${
                  server.status === 'connected' ? 'text-green-500' : 
                  server.status === 'connecting' ? 'text-yellow-500' : 
                  'text-red-500'
                }`} />
                <CardTitle>{server.name}</CardTitle>
              </div>
              <CardDescription>
                {server.uri} - {server.status}
                {server.error && <span className="text-red-500"> ({server.error})</span>}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!server.tools || server.tools.length === 0 ? (
                <p className="text-muted-foreground">No tools available from this server</p>
              ) : (
                <div className="space-y-4">
                  {server.tools.map((tool) => (
                    <div key={tool.name} className="border rounded-lg">
                      <button
                        onClick={() => {
                          setExpandedTools(prev => ({
                            ...prev,
                            [tool.name]: !prev[tool.name]
                          }));
                        }}
                        className="w-full p-4 flex items-center justify-between hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <ChevronRight 
                            className={`h-4 w-4 transition-transform ${
                              expandedTools[tool.name] ? 'transform rotate-90' : ''
                            }`}
                          />
                          <h3 className="font-semibold">{tool.name}</h3>
                        </div>
                      </button>
                      
                      {expandedTools[tool.name] && (
                        <div className="px-4 pb-4">
                          <p className="text-sm text-muted-foreground mb-2">{tool.description}</p>
                          
                          {tool.input_schema && (
                            <div className="mt-2">
                              <h4 className="text-sm font-medium mb-1">Input Schema:</h4>
                              <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                                {JSON.stringify(tool.input_schema, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
};

export default ToolsView;