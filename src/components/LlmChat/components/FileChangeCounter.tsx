import React from 'react';
import { useAutoCommitStore } from '../../../stores/autoCommitStore';
import { FileText, Zap, CheckCircle } from 'lucide-react';

export const FileChangeCounter: React.FC = () => {
  const { 
    config, 
    pendingChanges, 
    isProcessing, 
    lastCommitTimestamp 
  } = useAutoCommitStore();

  // Don't show if auto-commit is disabled
  if (!config.enabled) {
    return null;
  }

  const changeCount = pendingChanges.size;
  const threshold = config.conditions.minimumChanges;
  const isReady = changeCount >= threshold;

  // Don't show if no changes
  if (changeCount === 0 && !isProcessing) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-sm">
      {isProcessing ? (
        <>
          <div className="animate-pulse h-2 w-2 bg-blue-500 rounded-full"></div>
          <span className="text-blue-700 font-medium">Processing auto-commit...</span>
        </>
      ) : isReady ? (
        <>
          <CheckCircle className="h-4 w-4 text-green-600" />
          <span className="text-green-700 font-medium">
            {changeCount} file{changeCount !== 1 ? 's' : ''} changed - Ready to commit!
          </span>
        </>
      ) : (
        <>
          <FileText className="h-4 w-4 text-blue-600" />
          <span className="text-blue-700">
            {changeCount} file{changeCount !== 1 ? 's' : ''} changed 
            <span className="text-blue-500 ml-1">
              ({threshold - changeCount} more needed for auto-commit)
            </span>
          </span>
        </>
      )}
      
      {config.autoPushToRemote && (
        <div title="Auto-push enabled">
          <Zap className="h-3 w-3 text-yellow-600" />
        </div>
      )}
    </div>
  );
}; 