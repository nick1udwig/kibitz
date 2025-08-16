import React, { useMemo, useState } from 'react';
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
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const ToolsView = () => {
  const { servers, executeTool } = useStore();
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});
  const [argInputs, setArgInputs] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, { loading: boolean; output?: string; error?: string }>>({});

  const defaultArgsFor = useMemo(() => (
    (toolName: string) => {
      const name = (toolName || '').toLowerCase();
      if (name === 'authorize') {
        return JSON.stringify({
          url: 'https://anotherdayanothertestingnodeweb.hosting.hyperware.ai/operator:hypergrid:grid-beta.hypr/shim/mcp',
          token: 'AW0mu3VCDQeaywPpbyyQChjHMopEW1x6',
          client_id: 'hypergrid-beta-mcp-shim-bbc41533-17c1-43a1-88f4-faf4726cb137',
          node: 'anotherdayanothertestingnodeweb.os'
        }, null, 2);
      }
      if (name === 'search-registry') {
        return JSON.stringify({ query: 'weather' }, null, 2);
      }
      if (name === 'call-provider') {
        return JSON.stringify({
          providerId: 'anotherdayanothertestingnodeweb.os',
          providerName: 'weatherapitesting',
          callArgs: [["q", "New York, USA"]]
        }, null, 2);
      }
      return '{\n  \n}';
    }
  ), []);

  // Generate example args from tool.input_schema when available
  const generateArgsFromSchema = (schema?: Record<string, unknown>): string => {
    try {
      if (!schema || typeof schema !== 'object') return '{\n\n}';
      if ((schema.type || schema.Type) !== 'object') return '{\n\n}';
      const properties = (schema.properties as Record<string, unknown>) || {};
      const required = (schema.required as string[]) || [];
      const sample: Record<string, unknown> = {};
      for (const key of Object.keys(properties)) {
        const prop = (properties[key] as Record<string, unknown>) || {};
        const t = (prop.type || '').toString();
        let val: unknown = null;
        if (key === 'callArgs') {
          val = [["q", "New York, USA"]];
        } else if (key.toLowerCase().includes('url')) {
          val = 'https://...';
        } else if (key.toLowerCase().includes('token')) {
          val = 'REPLACE_ME';
        } else if (key === 'providerId') {
          val = 'anotherdayanothertestingnodeweb.os';
        } else if (key === 'providerName') {
          val = 'weatherapitesting';
        } else if (key === 'query') {
          val = 'weather';
        } else {
          switch (t) {
            case 'string': val = 'value'; break;
            case 'number': val = 0; break;
            case 'boolean': val = false; break;
            case 'array': val = []; break;
            case 'object': val = {}; break;
            default: val = null;
          }
        }
        sample[key] = val;
      }
      required.forEach(k => { if (!(k in sample)) sample[k] = 'value'; });
      return JSON.stringify(sample, null, 2);
    } catch {
      return '{\n\n}';
    }
  };

  const onExecute = async (serverId: string, toolName: string, key: string) => {
    try {
      const raw = argInputs[key] && argInputs[key].trim().length > 0
        ? argInputs[key]
        : defaultArgsFor(toolName);
      let args: Record<string, unknown> = {};
      try {
        args = raw ? JSON.parse(raw) : {};
      } catch {
        setResults(prev => ({ ...prev, [key]: { loading: false, error: 'Invalid JSON arguments' } }));
        return;
      }
      setResults(prev => ({ ...prev, [key]: { loading: true } }));
      const output = await executeTool(serverId, toolName, args);
      setResults(prev => ({ ...prev, [key]: { loading: false, output } }));
    } catch (error) {
      setResults(prev => ({ ...prev, [key]: { loading: false, error: error instanceof Error ? error.message : String(error) } }));
    }
  };

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
                        <div className="px-4 pb-4 space-y-3">
                          <p className="text-sm text-muted-foreground">{tool.description}</p>
                          
                          {tool.input_schema && (
                            <div className="mt-2">
                              <h4 className="text-sm font-medium mb-1">Input Schema:</h4>
                              <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                                {JSON.stringify(tool.input_schema, null, 2)}
                              </pre>
                            </div>
                          )}

                          <div className="space-y-2">
                            <h4 className="text-sm font-medium">Arguments (JSON)</h4>
                            <Textarea
                              value={argInputs[`${server.id}:${tool.name}`] ?? (tool.input_schema ? generateArgsFromSchema(tool.input_schema) : defaultArgsFor(tool.name))}
                              onChange={(e) => setArgInputs(prev => ({ ...prev, [`${server.id}:${tool.name}`]: e.target.value }))}
                              className="font-mono text-xs"
                              rows={tool.name.toLowerCase() === 'authorize' ? 8 : 5}
                            />
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                onClick={() => onExecute(server.id, tool.name, `${server.id}:${tool.name}`)}
                              >
                                Execute
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => setArgInputs(prev => ({ ...prev, [`${server.id}:${tool.name}`]: tool.input_schema ? generateArgsFromSchema(tool.input_schema) : defaultArgsFor(tool.name) }))}
                              >
                                Fill Example
                              </Button>
                            </div>
                          </div>

                          {results[`${server.id}:${tool.name}`] && (
                            <div className="space-y-1">
                              <h4 className="text-sm font-medium">Result</h4>
                              {results[`${server.id}:${tool.name}`].loading ? (
                                <p className="text-sm text-muted-foreground">Running…</p>
                              ) : results[`${server.id}:${tool.name}`].error ? (
                                <pre className="text-xs bg-red-950 text-red-200 p-2 rounded overflow-x-auto">
                                  {results[`${server.id}:${tool.name}`].error}
                                </pre>
                              ) : (
                                (() => {
                                  const out = results[`${server.id}:${tool.name}`].output || '';
                                  const looksJson = (() => { try { const t = out.trim(); return (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']')); } catch { return false; } })();
                                  const md = looksJson ? '```json\n' + out + '\n```' : out;
                                  return (
                                    <div className="prose dark:prose-invert max-w-none text-xs">
                                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
                                    </div>
                                  );
                                })()
                              )}
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