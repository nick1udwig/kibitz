/**
 * 📜 Branch History Panel - Auto-Branch Feature UI
 * 
 * Modern React component for displaying branch history and providing
 * rollback functionality with GitHub-style UI design.
 */

import React, { useState, useEffect } from 'react';
import { 
  Clock, 
  GitBranch, 
  RotateCcw, 
  Info, 
  AlertTriangle, 
  CheckCircle,
  GitCommit,
  FileText,
  Calendar
} from 'lucide-react';
import { RollbackOption } from '../lib/branchMetadata';
import { RevertResult } from '../lib/rollbackSystem';

export interface BranchHistoryPanelProps {
  rollbackOptions: RollbackOption[];
  onRevert: (branchName: string) => Promise<RevertResult>;
  onRefresh: () => Promise<void>;
  loading?: boolean;
  className?: string;
}

interface RevertState {
  inProgress: boolean;
  branchName?: string;
  result?: RevertResult;
}

export const BranchHistoryPanel: React.FC<BranchHistoryPanelProps> = ({
  rollbackOptions,
  onRevert,
  onRefresh,
  loading = false,
  className = ''
}) => {
  const [revertState, setRevertState] = useState<RevertState>({ inProgress: false });
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  useEffect(() => {
    // Auto-refresh every 30 seconds
    const interval = setInterval(onRefresh, 30000);
    return () => clearInterval(interval);
  }, [onRefresh]);

  const handleRevertClick = (branchName: string) => {
    setSelectedBranch(branchName);
    setShowConfirmDialog(true);
  };

  const handleConfirmRevert = async () => {
    if (!selectedBranch) return;

    setRevertState({ inProgress: true, branchName: selectedBranch });
    setShowConfirmDialog(false);

    try {
      const result = await onRevert(selectedBranch);
      setRevertState({ inProgress: false, result });
      
      if (result.success) {
        await onRefresh(); // Refresh the list after successful revert
      }
    } catch (error) {
      setRevertState({ 
        inProgress: false, 
        result: { 
          success: false, 
          error: error instanceof Error ? error.message : String(error) 
        } 
      });
    }

    setSelectedBranch(null);
  };

  const handleCancelRevert = () => {
    setShowConfirmDialog(false);
    setSelectedBranch(null);
  };

  const formatTimeAgo = (timestamp: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - timestamp.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const getContextIcon = (context: string) => {
    switch (context) {
      case 'test': return '🧪';
      case 'build': return '🔨';
      case 'experiment': return '🔬';
      default: return '⚙️';
    }
  };

  const getContextColor = (context: string) => {
    switch (context) {
      case 'test': return 'text-blue-600 bg-blue-50';
      case 'build': return 'text-green-600 bg-green-50';
      case 'experiment': return 'text-purple-600 bg-purple-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  if (loading) {
    return (
      <div className={`bg-white rounded-lg border border-gray-200 p-6 ${className}`}>
        <div className="animate-pulse">
          <div className="flex items-center justify-between mb-4">
            <div className="h-6 bg-gray-200 rounded w-48"></div>
            <div className="h-8 bg-gray-200 rounded w-20"></div>
          </div>
          {[1, 2, 3].map(i => (
            <div key={i} className="mb-4 p-4 border border-gray-100 rounded">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg border border-gray-200 ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-gray-500" />
            <h3 className="text-lg font-semibold text-gray-900">Branch History</h3>
            <span className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded-full">
              {rollbackOptions.length}
            </span>
          </div>
          <button
            onClick={onRefresh}
            className="flex items-center gap-1 px-3 py-1 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-50 rounded-md transition-colors"
            disabled={loading}
          >
            <RotateCcw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {/* Status Message */}
        {revertState.result && (
          <div className={`mb-4 p-3 rounded-md flex items-center gap-2 ${
            revertState.result.success 
              ? 'bg-green-50 text-green-800 border border-green-200' 
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {revertState.result.success ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
            <span className="text-sm">
              {revertState.result.success 
                ? `Successfully reverted to ${revertState.result.branchName}`
                : `Revert failed: ${revertState.result.error}`
              }
            </span>
          </div>
        )}

        {/* Branch List */}
        {rollbackOptions.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <GitBranch className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p className="text-sm">No auto-created branches found</p>
            <p className="text-xs mt-1">Branches will appear here after test/build runs</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rollbackOptions.map((option) => (
              <div
                key={option.id}
                className="p-4 border border-gray-100 rounded-lg hover:border-gray-200 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    {/* Branch Name & Context */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getContextColor(option.context)}`}>
                        {getContextIcon(option.context)} {option.context}
                      </span>
                      <code className="text-sm font-mono text-gray-800 bg-gray-100 px-2 py-1 rounded">
                        {option.branchName}
                      </code>
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatTimeAgo(option.timestamp)}
                      </span>
                    </div>

                    {/* Commit Message */}
                    <div className="flex items-center gap-2 mb-2">
                      <GitCommit className="h-3 w-3 text-gray-400" />
                      <span className="text-sm text-gray-700 truncate">
                        {option.commitMessage}
                      </span>
                    </div>

                    {/* Metadata */}
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        {option.filesChanged} file{option.filesChanged !== 1 ? 's' : ''}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {option.timestamp.toLocaleDateString()}
                      </span>
                      <code className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">
                        {option.commitHash.substring(0, 7)}
                      </code>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 ml-4">
                    {option.canRevert && (
                      <button
                        onClick={() => handleRevertClick(option.branchName)}
                        disabled={revertState.inProgress}
                        className="flex items-center gap-1 px-3 py-1 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md transition-colors disabled:opacity-50"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Revert
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirmation Dialog */}
      {showConfirmDialog && selectedBranch && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-yellow-100 rounded-full">
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
              </div>
              <h3 className="text-lg font-semibold">Confirm Revert</h3>
            </div>
            
            <p className="text-gray-600 mb-4">
              Are you sure you want to revert to branch <code className="bg-gray-100 px-2 py-1 rounded font-mono text-sm">{selectedBranch}</code>?
            </p>
            
            <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-md mb-4">
              <Info className="h-4 w-4 text-blue-600" />
              <span className="text-sm text-blue-800">
                A backup of your current state will be created automatically.
              </span>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={handleCancelRevert}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRevert}
                className="px-4 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-md transition-colors"
              >
                Revert
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {revertState.inProgress && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 flex items-center gap-3">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
            <span className="text-sm text-gray-700">
              Reverting to {revertState.branchName}...
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default BranchHistoryPanel; 