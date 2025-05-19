import React, { useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { processToolAction } from '../../services/toolCallService';
import { createCheckpoint, rollbackToCheckpoint, listCheckpoints } from '../../services/checkpointService';
import CheckpointToolbar from './CheckpointToolbar';

interface ToolAction {
  command: string;
  [key: string]: any;
}

const ToolCallDemo: React.FC = () => {
  const [commandInput, setCommandInput] = useState('');
  const [jsonInput, setJsonInput] = useState('{\n  "command": "chmod +x string_utils.py"\n}');
  const [output, setOutput] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const handleCommandSubmit = async () => {
    if (!commandInput.trim()) return;
    
    setLoading(true);
    setOutput('Executing command...');
    
    try {
      const result = await processToolAction({ command: commandInput });
      setOutput(JSON.stringify(result, null, 2));
    } catch (error) {
      setOutput(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleJsonSubmit = async () => {
    try {
      const actionJson = JSON.parse(jsonInput);
      
      setLoading(true);
      setOutput('Processing tool action...');
      
      const result = await processToolAction(actionJson);
      setOutput(JSON.stringify(result, null, 2));
    } catch (error) {
      setOutput(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Tool Call & Checkpoint Integration Demo</h1>
      
      {/* Checkpoint Toolbar */}
      <CheckpointToolbar 
        onCreateCheckpoint={createCheckpoint}
        onRollback={rollbackToCheckpoint}
        onListCheckpoints={() => listCheckpoints()}
      />
      
      {/* Command Input */}
      <div className="mt-6 border border-gray-700 rounded-md p-4 bg-gray-900">
        <h2 className="text-lg font-semibold mb-4">Execute Command</h2>
        <div className="flex gap-2 mb-4">
          <Input
            value={commandInput}
            onChange={(e) => setCommandInput(e.target.value)}
            placeholder="Enter command (e.g., 'chmod +x string_utils.py')"
            className="flex-grow"
          />
          <Button 
            onClick={handleCommandSubmit}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700"
          >
            Run
          </Button>
        </div>
      </div>
      
      {/* JSON Action Input */}
      <div className="mt-6 border border-gray-700 rounded-md p-4 bg-gray-900">
        <h2 className="text-lg font-semibold mb-4">Tool Action JSON</h2>
        <Textarea
          value={jsonInput}
          onChange={(e) => setJsonInput(e.target.value)}
          placeholder={`{\n  "command": "chmod +x string_utils.py"\n}`}
          rows={5}
          className="font-mono text-sm mb-4"
        />
        <Button 
          onClick={handleJsonSubmit}
          disabled={loading}
          className="bg-green-600 hover:bg-green-700"
        >
          Process Action
        </Button>
      </div>
      
      {/* Output Display */}
      <div className="mt-6 border border-gray-700 rounded-md p-4 bg-gray-900">
        <h2 className="text-lg font-semibold mb-4">Output</h2>
        <pre className="bg-gray-800 p-4 rounded-md font-mono text-sm overflow-auto max-h-64">
          {output || 'Results will appear here...'}
        </pre>
      </div>
      
      {/* How It Works */}
      <div className="mt-6 border border-gray-700 rounded-md p-4 bg-gray-900">
        <h2 className="text-lg font-semibold mb-4">How It Works</h2>
        <ol className="list-decimal pl-5 space-y-2">
          <li>
            <strong>Tool Call Processing:</strong> When a tool action is received, it's processed based on the command type.
          </li>
          <li>
            <strong>Automatic Checkpoints:</strong> After successful command execution, a checkpoint is automatically created.
          </li>
          <li>
            <strong>Branch Creation:</strong> For build commands, a new branch is created and the checkpoint is pushed to it.
          </li>
          <li>
            <strong>Checkpoint Management:</strong> Use the Checkpoint Toolbar to manage checkpoints and rollback when needed.
          </li>
        </ol>
      </div>
    </div>
  );
};

export default ToolCallDemo; 