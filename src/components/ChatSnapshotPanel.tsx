/**
 * 🚀 Chat Snapshot Panel - Git Snapshot & Reversion Feature v1.1
 * 
 * Shows the last 3 snapshots in the chat UI with:
 * - Quick revert buttons
 * - Snapshot metadata (files changed, timestamp)
 * - Auto-push status
 * - Recent branches for existing clones
 */

import React, { useEffect, useState } from 'react';
import { Clock, GitBranch, FileText, ArrowLeft, Cloud, CloudOff, AlertCircle } from 'lucide-react';
import { Project } from './LlmChat/context/types';
import { useSnapshotStore, useSnapshotOperations } from '../stores/snapshotStore';
import { GitSnapshot } from '../lib/gitSnapshotService';
import { getFastBranches, FastBranchInfo } from '../lib/fastBranchService';
import { format } from 'date-fns';

interface ChatSnapshotPanelProps {
  project: Project;
  serverId: string;
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>;
  onSnapshotReverted?: (snapshot: GitSnapshot) => void;
  className?: string;
}

export function ChatSnapshotPanel({
  project,
  serverId,
  executeTool,
  onSnapshotReverted,
  className = ""
}: ChatSnapshotPanelProps) {
  const { snapshots, loadSnapshots, isLoading: snapshotsLoading } = useSnapshotStore();
  const { revertToSnapshot, isLoading: reverting, lastOperation } = useSnapshotOperations();
  
  const [selectedSnapshot, setSelectedSnapshot] = useState<GitSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fastBranches, setFastBranches] = useState<FastBranchInfo[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);

  // Get project path - avoid hardcoded base, use shared resolver via API shape or construct client-side
  const projectPath = project.customPath || `${process.env.NEXT_PUBLIC_PROJECTS_DIR || ''}/${project.id}_${project.name}`;

  // Load data on mount and when project changes
  useEffect(() => {
    const loadData = async () => {
      try {
        // Load snapshots
        await loadSnapshots(project.id, projectPath, serverId, executeTool);
        
        // Load fast branches (GitHub-like)
        setBranchesLoading(true);
        const branches = await getFastBranches(projectPath, serverId, executeTool, 5);
        setFastBranches(branches);
        setBranchesLoading(false);
      } catch (error) {
        console.error('Failed to load snapshot data:', error);
        setError('Failed to load snapshot data');
        setBranchesLoading(false);
      }
    };

    loadData();
  }, [project.id, projectPath, serverId, executeTool, loadSnapshots]);

  const handleRevert = async (snapshot: GitSnapshot) => {
    setSelectedSnapshot(snapshot);
    setError(null);
    
    try {
      const result = await revertToSnapshot(
        project.id,
        snapshot,
        projectPath,
        serverId,
        executeTool,
        true // Create backup
      );

      if (result.success) {
        onSnapshotReverted?.(snapshot);
        setSelectedSnapshot(null);
      } else {
        setError(result.error || 'Failed to revert to snapshot');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unknown error occurred');
    }
  };

  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  if (snapshotsLoading || branchesLoading) {
    return (
      <div className={`p-4 bg-gray-50 dark:bg-gray-800 rounded-lg ${className}`}>
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded mb-2"></div>
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded mb-1"></div>
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
      </div>
    );
  }

  const hasSnapshots = snapshots.length > 0;
  const hasBranches = fastBranches.length > 0;

  if (!hasSnapshots && !hasBranches) {
    return (
      <div className={`p-4 bg-gray-50 dark:bg-gray-800 rounded-lg ${className}`}>
        <div className="text-center text-gray-500 dark:text-gray-400">
          <GitBranch className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No snapshots yet</p>
          <p className="text-xs mt-1">Make changes to create your first snapshot</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-blue-500" />
          <h3 className="font-medium text-gray-900 dark:text-gray-100">
            Recent Snapshots
          </h3>
          {reverting && (
            <div className="ml-auto flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
              <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              {lastOperation}
            </div>
          )}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="px-4 py-3 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-400">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500" />
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        </div>
      )}

      {/* Snapshots List */}
      {hasSnapshots && (
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {snapshots.map((snapshot) => (
            <div key={snapshot.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  {/* Snapshot Header */}
                  <div className="flex items-center gap-2 mb-2">
                    <code className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-xs font-mono text-gray-800 dark:text-gray-200">
                      {snapshot.shortHash}
                    </code>
                    <div className="flex items-center gap-1">
                      {snapshot.isPushed ? (
                        <span title="Pushed to remote">
                          <Cloud className="w-3 h-3 text-green-500" />
                        </span>
                      ) : (
                        <span title="Not pushed">
                          <CloudOff className="w-3 h-3 text-gray-400" />
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {formatTimeAgo(snapshot.timestamp)}
                    </span>
                  </div>

                  {/* Commit Message */}
                  <p className="text-sm text-gray-900 dark:text-gray-100 mb-2 line-clamp-2">
                    {snapshot.message}
                  </p>

                  {/* Stats */}
                  <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                    <div className="flex items-center gap-1">
                      <FileText className="w-3 h-3" />
                      <span>{snapshot.filesChanged} files</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{format(snapshot.timestamp, 'MMM d, HH:mm')}</span>
                    </div>
                  </div>
                </div>

                {/* Revert Button */}
                <button
                  onClick={() => handleRevert(snapshot)}
                  disabled={reverting || selectedSnapshot?.id === snapshot.id}
                  className="ml-4 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white text-xs rounded transition-colors flex items-center gap-1"
                >
                  {selectedSnapshot?.id === snapshot.id ? (
                    <>
                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Reverting...
                    </>
                  ) : (
                    <>
                      <ArrowLeft className="w-3 h-3" />
                      Revert
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* GitHub-style Branches Section */}
      {hasBranches && (
        <div className="border-t border-gray-200 dark:border-gray-700">
          <div className="px-4 py-3">
            <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
              <GitBranch className="w-4 h-4" />
              Branches
            </h4>
            <div className="space-y-2">
              {fastBranches.map((branch) => (
                <div 
                  key={branch.name} 
                  className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                    branch.isCurrent 
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' 
                      : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-sm font-medium font-mono ${
                        branch.isCurrent 
                          ? 'text-blue-800 dark:text-blue-200' 
                          : 'text-gray-800 dark:text-white'
                      }`}>
                        {branch.name}
                      </span>
                      {branch.isCurrent && (
                        <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs rounded-full font-medium">
                          current
                        </span>
                      )}
                      {branch.isDefault && !branch.isCurrent && (
                        <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 text-xs rounded-full font-medium">
                          default
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-300 truncate">
                      {branch.lastCommit}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="text-xs text-gray-500 dark:text-gray-400">
                        {branch.shortHash}
                      </code>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        by {branch.author}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {formatTimeAgo(branch.timestamp)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Footer with quick actions */}
      <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 rounded-b-lg">
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>
            {hasSnapshots && `${snapshots.length} snapshots`}
            {hasSnapshots && hasBranches && ' • '}
            {hasBranches && `${fastBranches.length} branches`}
          </span>
          <button
            onClick={async () => {
              await loadSnapshots(project.id, projectPath, serverId, executeTool);
              setBranchesLoading(true);
              const branches = await getFastBranches(projectPath, serverId, executeTool, 5);
              setFastBranches(branches);
              setBranchesLoading(false);
            }}
            className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
          >
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}

export default ChatSnapshotPanel; 