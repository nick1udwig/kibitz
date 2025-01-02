"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tool } from '../types';

interface ToolConfigurationProps {
  tools: Tool[];
  onToolsChange: (tools: Tool[]) => void;
}

export const ToolConfiguration = ({
  tools,
  onToolsChange
}: ToolConfigurationProps) => {
  const [jsonInput, setJsonInput] = useState('');
  const [showJsonInput, setShowJsonInput] = useState(false);

  const handleToolSchemaUpdate = (index: number, jsonString: string) => {
    try {
      const schema = JSON.parse(jsonString);
      const newTools = [...tools];
      newTools[index] = {
        ...newTools[index],
        schema
      };
      onToolsChange(newTools);
    } catch (e) {
      console.error('Invalid JSON schema');
    }
  };

  const handleDeleteTool = (index: number) => {
    onToolsChange(tools.filter((_, i) => i !== index));
  };

  const handleExportTools = () => {
    const toolsJson = JSON.stringify(tools, null, 2);
    const blob = new Blob([toolsJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tools-config.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium">Tools Configuration</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowJsonInput(!showJsonInput)}
          >
            {showJsonInput ? 'Hide JSON' : 'Show JSON'}
          </Button>
        </div>

        {showJsonInput && (
          <div className="mb-4">
            <Textarea
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              placeholder="Paste tool configuration JSON..."
              className="mb-2 font-mono text-sm"
            />
            <Button
              onClick={() => {
                try {
                  const newTools = JSON.parse(jsonInput);
                  onToolsChange(newTools);
                  setShowJsonInput(false);
                  setJsonInput('');
                } catch (e) {
                  console.error('Invalid JSON');
                }
              }}
              size="sm"
            >
              Import Tools
            </Button>
          </div>
        )}

        <div className="space-y-4">
          {tools.map((tool, index) => (
            <div key={index} className="p-4 border rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <Input
                  value={tool.name}
                  onChange={(e) => {
                    const newTools = [...tools];
                    newTools[index] = { ...tool, name: e.target.value };
                    onToolsChange(newTools);
                  }}
                  placeholder="Tool name"
                  className="flex-1 mr-2"
                />
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDeleteTool(index)}
                >
                  Remove
                </Button>
              </div>

              <Textarea
                value={tool.description}
                onChange={(e) => {
                  const newTools = [...tools];
                  newTools[index] = { ...tool, description: e.target.value };
                  onToolsChange(newTools);
                }}
                placeholder="Tool description"
                className="mb-2"
              />

              <Textarea
                value={JSON.stringify(tool.schema, null, 2)}
                onChange={(e) => handleToolSchemaUpdate(index, e.target.value)}
                placeholder="Tool schema (JSON)"
                className="font-mono text-sm"
              />
            </div>
          ))}

          <div className="flex gap-2">
            <Button
              onClick={() => onToolsChange([...tools, {
                name: '',
                description: '',
                schema: {
                  type: 'object',
                  properties: {},
                  required: []
                }
              }])}
              variant="outline"
              className="flex-1"
            >
              Add Tool
            </Button>

            <Button
              onClick={handleExportTools}
              variant="outline"
            >
              Export Tools
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
