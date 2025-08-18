/**
 * Conversation-focused Checkpoint Manager
 * Clean, simple UI that integrates with our new API system
 */

import React, { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GitBranch, RotateCcw } from 'lucide-react';
import { useConversationMetadata } from '../LlmChat/hooks/useConversationMetadata';
import { useBranchStore } from '../../stores/branchStore';
import { formatBranchName } from '../../lib/branchNaming';
import { CurrentBranchChip } from '@/components/ui/current-branch-chip';

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
  const autoInitAttemptedRef = useRef<Record<string, boolean>>({});

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
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('projectDataGenerating', {
          detail: { projectId, branchName: currentProjectBranch, timestamp: Date.now() }
        }));
      }
      const res = await fetch(`/api/projects/${projectId}/generate`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.warn('Failed to generate project data', data);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('projectDataFailed', {
            detail: { projectId, branchName: currentProjectBranch, timestamp: Date.now() }
          }));
        }
        return;
      }
      await listProjectBranches(projectId);
      await refreshCurrentBranch(projectId);
      await loadProjectMetadata(projectId);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('projectDataReady', {
          detail: { projectId, branchName: currentProjectBranch, timestamp: Date.now() }
        }));
      }
    } finally {
      setIsGenerating(false);
    }
  };

  // Reflect background generation triggered by branch switch
  useEffect(() => {
    const onGenerating = (evt: Event) => {
      const { projectId: eventProjectId } = (evt as CustomEvent).detail || {};
      if (eventProjectId === projectId) setIsGenerating(true);
    };
    const onReady = async (evt: Event) => {
      const { projectId: eventProjectId } = (evt as CustomEvent).detail || {};
      if (eventProjectId === projectId) {
        setIsGenerating(false);
        try {
          await listProjectBranches(projectId);
          await refreshCurrentBranch(projectId);
          await loadProjectMetadata(projectId);
        } catch (e) {
          console.warn('Failed to refresh after generation:', e);
        }
      }
    };
    const onFailed = () => setIsGenerating(false);
    if (typeof window !== 'undefined') {
      window.addEventListener('projectDataGenerating', onGenerating);
      window.addEventListener('projectDataReady', onReady);
      window.addEventListener('projectDataFailed', onFailed);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('projectDataGenerating', onGenerating);
        window.removeEventListener('projectDataReady', onReady);
        window.removeEventListener('projectDataFailed', onFailed);
      }
    };
  }, [projectId, listProjectBranches, refreshCurrentBranch, loadProjectMetadata]);

  // Auto-initialize if we land on a branch with no data
  useEffect(() => {
    if (!projectId) return;
    const key = `${projectId}:${currentProjectBranch}`;
    if (autoInitAttemptedRef.current[key]) return;
    // Only trigger when we truly have no commits loaded
    const noData = !isLoading && recentCommits.length === 0;
    if (!noData) return;

    autoInitAttemptedRef.current[key] = true;

    const startAutoInit = async () => {
      try {
        const check = await fetch(`/api/projects/${projectId}`);
        let needsGenerate = !check.ok;
        if (check.ok) {
          try {
            const data = await check.json();
            const branches = Array.isArray(data?.branches) ? data.branches : [];
            const hasCurrent = branches.some((b: { branchName?: string; name?: string }) =>
              (b?.branchName || b?.name) === currentProjectBranch
            );
            if (!hasCurrent) needsGenerate = true;
          } catch {
            needsGenerate = true;
          }
        }
        if (!needsGenerate) return; // Already correct

        // Mark generating and announce for toasts
        setIsGenerating(true);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('projectDataGenerating', {
            detail: { projectId, branchName: currentProjectBranch, timestamp: Date.now() }
          }));
        }

        // The GET route already kicked off generation; poll until ready
        const start = Date.now();
        const poll = async (): Promise<void> => {
          try {
            const res = await fetch(`/api/projects/${projectId}`);
            if (res.ok) {
              setIsGenerating(false);
              try {
                await listProjectBranches(projectId);
                await refreshCurrentBranch(projectId);
                await loadProjectMetadata(projectId);
              } finally {
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('projectDataReady', {
                    detail: { projectId, branchName: currentProjectBranch, timestamp: Date.now() }
                  }));
                }
              }
              return;
            }
          } catch {}
          if (Date.now() - start > 30000) { // 30s timeout
            setIsGenerating(false);
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('projectDataFailed', {
                detail: { projectId, branchName: currentProjectBranch, timestamp: Date.now() }
              }));
            }
            return;
          }
          setTimeout(poll, 1000);
        };
        void poll();
      } catch (e) {
        // Best-effort: fall back to manual button without spamming
        console.warn('Auto-init check failed:', e);
      }
    };

    void startAutoInit();
  }, [projectId, currentProjectBranch, recentCommits.length, isLoading, listProjectBranches, refreshCurrentBranch, loadProjectMetadata]);

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
          <CurrentBranchChip projectId={projectId} showLabel />
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
          <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
            {recentCommits.map((commit) => (
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
                  disabled={isReverting || isLoading || (isSwitchingBranch[projectId] || false) || commit.branchName === currentProjectBranch}
                  className="ml-4 relative z-[100] pointer-events-auto hover:shadow-sm hover:-translate-y-[1px] transition-all cursor-pointer hover:bg-primary/10 hover:text-primary hover:border-primary focus-visible:ring-ring"
                  title={
                    commit.branchName === currentProjectBranch 
                      ? 'Already on this branch'
                      : commit.branchName 
                        ? `Switch to branch: ${formatBranchName(commit.branchName)}` 
                        : 'Revert to this commit'
                  }
                >
                  {commit.branchName ? (
                    <GitBranch className="w-3 h-3 mr-1" />
                  ) : (
                    <RotateCcw className="w-3 h-3 mr-1" />
                  )}
                  {commit.branchName === currentProjectBranch 
                    ? 'Current' 
                    : (isReverting || (isSwitchingBranch[projectId] || false))
                      ? (
                        <span className="inline-flex items-center gap-1">
                          <span className="inline-block w-3 h-3 border-2 border-blue-300 border-t-blue-700 rounded-full animate-spin" />
                          {commit.branchName ? 'Switching…' : 'Reverting…'}
                        </span>
                      )
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
          <div className="flex items-center justify-center mb-4">
            <CurrentBranchChip projectId={projectId} showLabel />
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