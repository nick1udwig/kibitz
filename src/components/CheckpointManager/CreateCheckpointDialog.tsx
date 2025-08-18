import React, { useState } from 'react';
import { useCheckpointStore } from '../../stores/checkpointStore';
import { useStore } from '../../stores/rootStore';
import { X } from 'lucide-react';
import { Button } from '../ui/button';

interface CreateCheckpointDialogProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const CreateCheckpointDialog: React.FC<CreateCheckpointDialogProps> = ({
  projectId,
  isOpen,
  onClose,
  onSuccess
}) => {
  const { createManualCheckpoint, isLoading } = useCheckpointStore();
  const projects = useStore(state => state.projects);
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  const project = projects.find(p => p.id === projectId);
  
  if (!isOpen || !project) {
    return null;
  }
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!description.trim()) {
      setError('Please enter a description for this checkpoint');
      return;
    }
    
    try {
      await createManualCheckpoint(projectId, project, description);
      setDescription('');
      setError(null);
      onClose();
      if (onSuccess) onSuccess();
    } catch (err) {
      setError('Failed to create checkpoint');
      console.error(err);
    }
  };
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-md p-6 shadow-xl">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Create Checkpoint</h2>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onClose}
            disabled={isLoading}
          >
            <X className="w-5 h-5" />
          </Button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="description" className="block text-sm font-medium mb-1">
              Description
            </label>
            <textarea
              id="description"
              className="w-full p-2 border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe this checkpoint (e.g., 'Implemented login feature')"
              rows={3}
              disabled={isLoading}
            />
            {error && (
              <p className="text-red-500 text-sm mt-1">{error}</p>
            )}
          </div>
          
          <div className="mt-6 flex justify-end space-x-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
            >
              {isLoading ? 'Creating...' : 'Create Checkpoint'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}; 