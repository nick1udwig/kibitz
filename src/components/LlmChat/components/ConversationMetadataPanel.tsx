/**
 * Simple panel to show conversation metadata and revert options
 */

import React from 'react';
import { useConversationMetadata } from '../hooks/useConversationMetadata';
import { useBranchStore } from '../../../stores/branchStore';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { RotateCcw } from 'lucide-react';
import { formatBranchName } from '../../../lib/branchNaming';
import { useStore } from '../../../stores/rootStore';

export function ConversationMetadataPanel() {
  const {
    conversationMetadata,
    projectMetadata,
    revertToCommit,
    recentCommits
  } = useConversationMetadata();

  const { switchToBranch, isProcessing: isSwitchingBranch } = useBranchStore();
  const { activeProjectId } = useStore();

  // Handle revert by switching to the branch instead of checking out the commit
  const handleRevert = async (commit: { branchName?: string; commitHash: string }) => {
    if (!activeProjectId) {
      console.warn('No active project ID');
      return;
    }

    if (!commit.branchName) {
      console.warn('No branch name available for commit:', commit);
      // Fallback to original commit-based revert
      try {
        const success = await revertToCommit(commit.commitHash);
        if (success) {
          console.log(`✅ Successfully reverted to commit ${commit.commitHash}`);
        }
      } catch (error) {
        console.error('❌ Failed to revert:', error);
      }
      return;
    }

    try {
      console.log(`🔄 Switching to branch: ${commit.branchName}`);
      const success = await switchToBranch(activeProjectId, commit.branchName);
      if (success) {
        console.log(`✅ Successfully switched to branch: ${commit.branchName}`);
      } else {
        console.error(`❌ Failed to switch to branch: ${commit.branchName}`);
      }
    } catch (error) {
      console.error('❌ Failed to switch branch:', error);
    }
  };

  if (!conversationMetadata && !projectMetadata) {
    return null;
  }

  return (
    <Card className="p-4 mb-4 bg-gray-50 dark:bg-gray-800">
      <div className="space-y-3">
        
        {/* Conversation Info */}
        {conversationMetadata && (
          <div className="flex items-center justify-between">
            <div className="text-sm">
              <span className="font-medium">Conversation:</span>{' '}
              <span className="text-gray-600 dark:text-gray-400">
                {conversationMetadata.conversationId.slice(-8)}
              </span>
              <span className="ml-2 text-xs">
                ({conversationMetadata.messageCount} messages)
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <span className={`inline-block w-2 h-2 rounded-full ${
                conversationMetadata.status === 'active' ? 'bg-green-500' :
                conversationMetadata.status === 'completed' ? 'bg-blue-500' :
                'bg-orange-500'
              }`} />
              <span className="text-xs capitalize">{conversationMetadata.status}</span>
            </div>
          </div>
        )}

        {/* Project Info */}
        {projectMetadata && (
          <div className="flex items-center justify-between text-sm">
            <div>
              <span className="font-medium">Project:</span>{' '}
              <span className="text-gray-600 dark:text-gray-400">
                {projectMetadata.projectName}
              </span>
            </div>
            <div className="text-xs text-gray-500">
              {projectMetadata.totalBranches} branches • {projectMetadata.totalCommits} commits
            </div>
          </div>
        )}

        {/* Recent Commits & Revert */}
        {recentCommits.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium">Recent Commits:</div>
            <div className="space-y-1 max-h-60 overflow-y-auto pr-1">
              {recentCommits.map((commit) => (
                <div key={commit.commitHash} className="flex items-center justify-between text-xs bg-white dark:bg-gray-700 p-2 rounded">
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-mono">
                      {commit.commitHash?.slice(0, 7)}
                    </div>
                    <div className="truncate text-gray-600 dark:text-gray-400">
                      {commit.commitMessage}
                    </div>
                    {commit.branchName && (
                      <div className="truncate text-blue-600 dark:text-blue-400 text-xs">
                        {formatBranchName(commit.branchName)}
                      </div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRevert(commit)}
                    disabled={isLoading || (activeProjectId && isSwitchingBranch[activeProjectId]) || false}
                    className="ml-2 text-xs hover:shadow-sm hover:-translate-y-[1px] transition-all cursor-pointer hover:bg-primary/10 hover:text-primary hover:border-primary focus-visible:ring-ring"
                    title={commit.branchName ? `Switch to branch: ${formatBranchName(commit.branchName)}` : 'Revert to this commit'}
                  >
                    <RotateCcw className="w-3 h-3 mr-1" />
                    {(activeProjectId && isSwitchingBranch[activeProjectId]) ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="inline-block w-3 h-3 border-2 border-blue-300 border-t-blue-700 rounded-full animate-spin" />
                        {commit.branchName ? 'Switching…' : 'Reverting…'}
                      </span>
                    ) : (
                      commit.branchName ? 'Switch' : 'Revert'
                    )}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded">
            {error}
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Loading...
          </div>
        )}
      </div>
    </Card>
  );
} 