import React, { useEffect, useState } from 'react';
import { useCheckpointStore } from '../../stores/checkpointStore';
import { 
  Calendar, 
  RotateCcw, 
  Tag, 
  Trash2, 
  GitCommit,
  Info,
  Filter,
  Plus
} from 'lucide-react';
import { Checkpoint } from '../../types/Checkpoint';
import { Button } from '../ui/button';
import { useStore } from '../../stores/rootStore';
import { Project } from '../../components/LlmChat/context/types';

interface CheckpointListProps {
  projectId: string;
  onRollback?: (project: Project) => void;
  onCreateCheckpoint?: () => void;
}

export const CheckpointList: React.FC<CheckpointListProps> = ({ 
  projectId,
  onRollback,
  onCreateCheckpoint
}) => {
  const { 
    checkpoints, 
    initialize, 
    deleteCheckpointById,
    rollbackToCheckpoint,
    selectCheckpoint,
    selectedCheckpointId,
    isLoading
  } = useCheckpointStore();
  
  const projects = useStore(state => state.projects);
  const [filter, setFilter] = useState<string | null>(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState<string | null>(null);
  
  // Initialize checkpoints for this project
  useEffect(() => {
    if (projectId) {
      initialize(projectId);
    }
  }, [projectId, initialize]);
  
  const projectCheckpoints = checkpoints[projectId] || [];
  
  // Filter checkpoints
  const filteredCheckpoints = filter 
    ? projectCheckpoints.filter(cp => cp.tags.includes(filter))
    : projectCheckpoints;
  
  // Format date for display
  const formatDate = (date: Date) => {
    if (!(date instanceof Date)) {
      date = new Date(date);
    }
    return date.toLocaleString();
  };
  
  // Handle rollback
  const handleRollback = async (checkpointId: string) => {
    const project = await rollbackToCheckpoint(projectId, checkpointId);
    if (project && onRollback) {
      onRollback(project);
    }
  };
  
  // Handle delete
  const handleDelete = (checkpointId: string) => {
    setShowConfirmDelete(checkpointId);
  };
  
  const confirmDelete = async (checkpointId: string) => {
    await deleteCheckpointById(projectId, checkpointId);
    setShowConfirmDelete(null);
  };
  
  const cancelDelete = () => {
    setShowConfirmDelete(null);
  };
  
  // Render checkpoint item
  const renderCheckpointItem = (checkpoint: Checkpoint) => {
    const isSelected = selectedCheckpointId === checkpoint.id;
    const isShowingInfo = showInfo === checkpoint.id;
    const isConfirmingDelete = showConfirmDelete === checkpoint.id;
    
    return (
      <div 
        key={checkpoint.id}
        className={`border p-3 rounded-md mb-2 ${isSelected ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 dark:border-blue-700' : 'border-gray-200 dark:border-gray-700'}`}
      >
        <div className="flex justify-between items-start">
          <div>
            <div className="font-medium">{checkpoint.description}</div>
            <div className="text-xs text-gray-500 flex items-center mt-1">
              <Calendar className="w-3 h-3 mr-1" />
              {formatDate(checkpoint.timestamp)}
              {checkpoint.commitHash && (
                <span className="ml-2 flex items-center">
                  <GitCommit className="w-3 h-3 mr-1" />
                  {checkpoint.commitHash}
                </span>
              )}
            </div>
          </div>
          
          <div className="flex space-x-1">
            <Button 
              size="icon"
              variant="ghost"
              onClick={() => setShowInfo(isShowingInfo ? null : checkpoint.id)}
              className="h-7 w-7"
            >
              <Info className="w-4 h-4" />
            </Button>
            
            <Button
              size="icon"
              variant="ghost" 
              onClick={() => handleRollback(checkpoint.id)}
              className="h-7 w-7"
              disabled={isLoading}
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
            
            <Button 
              size="icon"
              variant="ghost"
              onClick={() => handleDelete(checkpoint.id)}
              className="h-7 w-7 text-red-500 hover:text-red-700"
              disabled={isLoading}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
        
        {checkpoint.tags.length > 0 && (
          <div className="flex mt-2 gap-1 flex-wrap">
            {checkpoint.tags.map(tag => (
              <span 
                key={tag}
                className="text-xs bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-200 px-2 py-0.5 rounded-full flex items-center"
              >
                <Tag className="w-3 h-3 mr-1" />
                {tag}
              </span>
            ))}
          </div>
        )}
        
        {isShowingInfo && (
          <div className="mt-2 text-sm border-t pt-2 text-gray-700 dark:text-gray-300">
            <div>ID: {checkpoint.id}</div>
            <div>Project: {projects.find(p => p.id === checkpoint.projectId)?.name || checkpoint.projectId}</div>
            {checkpoint.commitHash && <div>Commit: {checkpoint.commitHash}</div>}
            <div>Tags: {checkpoint.tags.join(', ') || 'None'}</div>
          </div>
        )}
        
        {isConfirmingDelete && (
          <div className="mt-2 border-t pt-2 flex flex-col">
            <div className="text-sm font-medium text-red-600 dark:text-red-400 mb-2">
              Are you sure you want to delete this checkpoint?
            </div>
            <div className="flex space-x-2">
              <Button 
                variant="destructive" 
                size="sm"
                onClick={() => confirmDelete(checkpoint.id)}
                disabled={isLoading}
              >
                Delete
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={cancelDelete}
                disabled={isLoading}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Checkpoints</h2>
        <div className="flex space-x-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setFilter(filter ? null : 'auto')}
            className={`${filter === 'auto' ? 'bg-blue-100 border-blue-300 dark:bg-blue-900 dark:border-blue-700' : ''}`}
          >
            <Filter className="w-4 h-4 mr-1" />
            {filter === 'auto' ? 'All' : 'Auto'}
          </Button>
          
          <Button 
            variant="outline" 
            size="sm"
            onClick={onCreateCheckpoint}
            disabled={isLoading}
          >
            <Plus className="w-4 h-4 mr-1" />
            Create
          </Button>
        </div>
      </div>
      
      {isLoading && (
        <div className="flex justify-center my-4">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      )}
      
      {!isLoading && filteredCheckpoints.length === 0 && (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          No checkpoints available
        </div>
      )}
      
      <div className="space-y-2">
        {filteredCheckpoints
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .map(renderCheckpointItem)}
      </div>
    </div>
  );
}; 