/**
 * Conversation-focused Checkpoint Manager
 * Clean, simple UI that integrates with our new API system
 */

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GitBranch, RotateCcw } from 'lucide-react';
import { useConversationMetadata } from '../LlmChat/hooks/useConversationMetadata';
import { useBranchStore } from '../../stores/branchStore';
import { formatBranchName } from '../../lib/branchNaming';

interface ConversationCheckpointManagerProps {
  projectId: string;
}

export const ConversationCheckpointManager: React.FC<ConversationCheckpointManagerProps> = ({ 
  projectId 
}) => {
  const { 
    isLoading,
    error,
    revertToCommit,
    recentCommits,
    loadProjectMetadata
  } = useConversationMetadata();

  const { 
    switchToBranch, 
    isProcessing: isSwitchingBranch, 
    currentBranch,
    listProjectBranches,
    refreshCurrentBranch,
    startAutoRefresh,
    stopAutoRefresh 
  } = useBranchStore();
  const [isReverting, setIsReverting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Get current branch for this project
  const currentProjectBranch = currentBranch[projectId] || 'main';

  // Refresh branches when component mounts to get current branch
  useEffect(() => {
    if (projectId) {
      listProjectBranches(projectId).catch(console.error);
      refreshCurrentBranch(projectId).catch(console.error);
      startAutoRefresh(projectId);
    }
    return () => {
      stopAutoRefresh();
    };
  }, [projectId, listProjectBranches, refreshCurrentBranch, startAutoRefresh, stopAutoRefresh]);

  // Generate project metadata on demand when missing
  const handleGenerateProjectData = async () => {
    try {
      if (!projectId) return;
      setIsGenerating(true);
      const res = await fetch(`/api/projects/${projectId}/generate`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.warn('Failed to generate project data', data);
        return;
      }
      await listProjectBranches(projectId);
      await refreshCurrentBranch(projectId);
      await loadProjectMetadata(projectId);
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle revert by switching to the branch instead of checking out the commit
  const handleRevert = async (commit: { branchName?: string; commitHash: string }) => {
    if (!commit.branchName) {
      console.warn('No branch name available for commit:', commit);
      // Fallback to original commit-based revert
      setIsReverting(true);
      try {
        const success = await revertToCommit(commit.commitHash);
        if (success) {
          console.log(`✅ Successfully reverted to commit ${commit.commitHash}`);
        }
      } catch (error) {
        console.error('❌ Failed to revert:', error);
      } finally {
        setIsReverting(false);
      }
      return;
    }

    setIsReverting(true);
    try {
      console.log(`🔄 Switching to branch: ${commit.branchName}`);
      const success = await switchToBranch(projectId, commit.branchName);
      if (success) {
        console.log(`✅ Successfully switched to branch: ${commit.branchName}`);
        // Refresh branches to update current branch display
        await listProjectBranches(projectId);
        await refreshCurrentBranch(projectId);
      } else {
        console.error(`❌ Failed to switch to branch: ${commit.branchName}`);
      }
    } catch (error) {
      console.error('❌ Failed to switch branch:', error);
    } finally {
      setIsReverting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin w-6 h-6 border-2 border-gray-300 border-t-blue-600 rounded-full" />
        <span className="ml-2 text-gray-600">Loading project data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-6 border-amber-200 bg-amber-50">
        <div className="flex items-center space-x-2 text-amber-800">
          <span className="font-medium">Project data not available</span>
        </div>
        <p className="text-sm text-amber-700 mt-2">
          {error}
        </p>
        <p className="text-sm text-gray-600 mt-2">
          Start a conversation or generate project data to enable checkpoints.
        </p>
        <div className="mt-4 p-3 bg-white rounded border">
          <div className="flex items-center space-x-2">
            <GitBranch className="w-4 h-4 text-blue-600" />
            <span className="text-sm text-gray-700">Current Branch:</span>
            <span className="text-sm font-mono bg-blue-100 text-blue-800 px-2 py-1 rounded">
              {formatBranchName(currentProjectBranch)}
            </span>
          </div>
          <div className="mt-3">
            <Button size="sm" onClick={handleGenerateProjectData} disabled={isGenerating}>
              {isGenerating ? 'Generating…' : 'Generate project data'}
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Project Overview */}
      {/* Project overview section removed as projectMetadata is no longer available */}
      
      {/* Current Conversation */}
      {/* Conversation section removed as conversationMetadata is no longer available */}

      {/* Recent Commits & Quick Actions */}
      {recentCommits.length > 0 && (
        <Card className="p-6">
          <h3 className="font-medium mb-4">Recent Commits</h3>
          <div className="space-y-3">
            {recentCommits.slice(0, 5).map((commit) => (
              <div
                key={commit.commitHash}
                className="relative z-10 flex items-center justify-between p-3 bg-gray-50 rounded"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <code className="text-xs font-mono bg-gray-200 px-2 py-1 rounded">
                      {commit.commitHash?.slice(0, 7)}
                    </code>
                    <span className="text-sm text-gray-600">
                      {new Date(commit.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-1 text-sm font-medium truncate">
                    {commit.commitMessage}
                  </div>
                  {commit.branchName && (
                    <div className="mt-1 text-xs text-blue-600">
                      Branch: {formatBranchName(commit.branchName)}
                      {commit.branchName === currentProjectBranch && (
                        <span className="ml-2 text-green-600 font-medium">(current)</span>
                      )}
                    </div>
                  )}
                  {commit.filesChanged && (
                    <div className="mt-1 text-xs text-gray-500">
                      {commit.filesChanged.length} file(s) changed
                    </div>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleRevert(commit)}
                  disabled={isReverting || isLoading || isSwitchingBranch || commit.branchName === currentProjectBranch}
                  className="ml-4 relative z-[100] pointer-events-auto"
                  title={
                    commit.branchName === currentProjectBranch 
                      ? 'Already on this branch'
                      : commit.branchName 
                        ? `Switch to branch: ${formatBranchName(commit.branchName)}` 
                        : 'Revert to this commit'
                  }
                >
                  <RotateCcw className="w-3 h-3 mr-1" />
                  {commit.branchName === currentProjectBranch 
                    ? 'Current' 
                    : commit.branchName 
                      ? 'Switch' 
                      : 'Revert'
                  }
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Empty State: only show when there are NO commits yet */}
      {!isLoading && recentCommits.length === 0 && (
        <Card className="p-8 text-center border-gray-200 bg-white">
          <GitBranch className="w-12 h-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No project data yet
          </h3>
          <p className="text-gray-600 mb-4">
            Generate initial project data to enable checkpoints and branch insights.
          </p>
          <div className="flex items-center justify-center space-x-2 mb-4">
            <span className="text-sm text-gray-700">Current Branch:</span>
            <span className="text-sm font-mono bg-blue-100 text-blue-800 px-2 py-1 rounded">
              {formatBranchName(currentProjectBranch)}
            </span>
          </div>
          <Button onClick={handleGenerateProjectData} disabled={isGenerating}>
            {isGenerating ? 'Generating…' : 'Generate project data'}
          </Button>
          <div className="text-sm text-gray-500 mt-3">
            Each conversation creates its own branch with automatic commits.
          </div>
        </Card>
      )}
    </div>
  );
}; 