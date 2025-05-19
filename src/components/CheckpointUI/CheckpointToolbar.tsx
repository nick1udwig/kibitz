import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Loader2, CheckCircle, RotateCcw, ClipboardList } from 'lucide-react';

interface CheckpointToolbarProps {
  onCreateCheckpoint: (message: string) => Promise<{success: boolean, hash?: string}>;
  onRollback: (hash: string) => Promise<{success: boolean}>;
  onListCheckpoints: () => Promise<{success: boolean, checkpoints?: Array<{hash: string, date: string, message: string}>}>;
}

const CheckpointToolbar: React.FC<CheckpointToolbarProps> = ({
  onCreateCheckpoint,
  onRollback,
  onListCheckpoints
}) => {
  const [message, setMessage] = useState('');
  const [rollbackHash, setRollbackHash] = useState('');
  const [loading, setLoading] = useState<'create' | 'rollback' | 'list' | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [status, setStatus] = useState<'success' | 'error' | null>(null);
  const [checkpoints, setCheckpoints] = useState<Array<{hash: string, date: string, message: string}>>([]);

  const handleCreateCheckpoint = async () => {
    setLoading('create');
    setResult(null);
    setStatus(null);
    
    try {
      const response = await onCreateCheckpoint(message);
      if (response.success) {
        setResult(`Checkpoint created: ${response.hash}`);
        setStatus('success');
        setMessage('');
        // Refresh the checkpoint list
        handleListCheckpoints();
      } else {
        setResult('Failed to create checkpoint');
        setStatus('error');
      }
    } catch (error) {
      setResult(`Error: ${error instanceof Error ? error.message : String(error)}`);
      setStatus('error');
    } finally {
      setLoading(null);
    }
  };

  const handleRollback = async () => {
    if (!rollbackHash) {
      setResult('Please enter a checkpoint hash');
      setStatus('error');
      return;
    }

    setLoading('rollback');
    setResult(null);
    setStatus(null);
    
    try {
      const response = await onRollback(rollbackHash);
      if (response.success) {
        setResult(`Successfully rolled back to ${rollbackHash}`);
        setStatus('success');
        setRollbackHash('');
      } else {
        setResult('Failed to rollback');
        setStatus('error');
      }
    } catch (error) {
      setResult(`Error: ${error instanceof Error ? error.message : String(error)}`);
      setStatus('error');
    } finally {
      setLoading(null);
    }
  };

  const handleListCheckpoints = async () => {
    setLoading('list');
    setResult(null);
    setStatus(null);
    
    try {
      const response = await onListCheckpoints();
      if (response.success && response.checkpoints) {
        setCheckpoints(response.checkpoints);
        setResult(`Found ${response.checkpoints.length} checkpoints`);
        setStatus('success');
      } else {
        setResult('Failed to list checkpoints');
        setStatus('error');
      }
    } catch (error) {
      setResult(`Error: ${error instanceof Error ? error.message : String(error)}`);
      setStatus('error');
    } finally {
      setLoading(null);
    }
  };

  useEffect(() => {
    // Load checkpoints on component mount
    handleListCheckpoints();
  }, []);

  return (
    <div className="border border-gray-700 rounded-md p-4 mb-4 bg-gray-900">
      <h2 className="text-lg font-semibold mb-4 text-white">Checkpoint & Rollback</h2>
      
      {/* Create Checkpoint Section */}
      <div className="flex gap-2 mb-4">
        <Input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Checkpoint message"
          className="flex-grow"
        />
        <Button 
          onClick={handleCreateCheckpoint}
          disabled={loading !== null}
          className="bg-blue-600 hover:bg-blue-700"
        >
          {loading === 'create' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
          Create Checkpoint
        </Button>
      </div>
      
      {/* Rollback Section */}
      <div className="flex gap-2 mb-4">
        <Input
          value={rollbackHash}
          onChange={(e) => setRollbackHash(e.target.value)}
          placeholder="Checkpoint hash to rollback to"
          className="flex-grow"
        />
        <Button 
          onClick={handleRollback}
          disabled={loading !== null}
          className="bg-amber-600 hover:bg-amber-700"
        >
          {loading === 'rollback' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RotateCcw className="h-4 w-4 mr-2" />}
          Rollback
        </Button>
      </div>
      
      {/* List Checkpoints Button */}
      <div className="flex justify-end mb-4">
        <Button 
          onClick={handleListCheckpoints}
          disabled={loading !== null}
          variant="outline"
        >
          {loading === 'list' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ClipboardList className="h-4 w-4 mr-2" />}
          Refresh Checkpoints
        </Button>
      </div>
      
      {/* Result Message */}
      {result && (
        <div className={`p-3 rounded-md mb-4 ${status === 'success' ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}`}>
          {result}
        </div>
      )}
      
      {/* Checkpoints List */}
      <div className="border border-gray-700 rounded-md overflow-hidden">
        <div className="bg-gray-800 text-gray-300 px-4 py-2 font-medium grid grid-cols-12">
          <div className="col-span-2">Hash</div>
          <div className="col-span-2">Date</div>
          <div className="col-span-7">Message</div>
          <div className="col-span-1">Action</div>
        </div>
        <div className="max-h-64 overflow-y-auto">
          {checkpoints.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500">
              No checkpoints found. Create one to get started.
            </div>
          ) : (
            checkpoints.map((cp) => (
              <div key={cp.hash} className="px-4 py-2 grid grid-cols-12 border-t border-gray-700 hover:bg-gray-800">
                <div className="col-span-2 font-mono text-gray-400">{cp.hash}</div>
                <div className="col-span-2 text-gray-400">{cp.date}</div>
                <div className="col-span-7 text-gray-300">{cp.message}</div>
                <div className="col-span-1">
                  <Button 
                    size="sm" 
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    onClick={() => setRollbackHash(cp.hash)}
                    title="Use this checkpoint"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default CheckpointToolbar; 