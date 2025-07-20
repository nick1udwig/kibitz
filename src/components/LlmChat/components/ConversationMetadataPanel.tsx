/**
 * Simple panel to show conversation metadata and revert options
 */

import React from 'react';
import { useConversationMetadata } from '../hooks/useConversationMetadata';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export function ConversationMetadataPanel() {
  const {
    conversationMetadata,
    projectMetadata,
    isLoading,
    error,
    revertToCommit,
    canRevert,
    recentCommits
  } = useConversationMetadata();

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
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {recentCommits.slice(0, 3).map((commit) => (
                <div key={commit.commitHash} className="flex items-center justify-between text-xs bg-white dark:bg-gray-700 p-2 rounded">
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-mono">
                      {commit.commitHash?.slice(0, 7)}
                    </div>
                    <div className="truncate text-gray-600 dark:text-gray-400">
                      {commit.commitMessage}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => revertToCommit(commit.commitHash)}
                    disabled={isLoading}
                    className="ml-2 text-xs"
                  >
                    Revert
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
          <div className="text-sm text-gray-500 flex items-center">
            <div className="animate-spin w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full mr-2" />
            Processing...
          </div>
        )}
      </div>
    </Card>
  );
} 