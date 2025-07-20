/**
 * Conversation-focused Checkpoint Manager
 * Clean, simple UI that integrates with our new API system
 */

import React, { useState, useEffect } from 'react';
import { useConversationMetadata } from '../LlmChat/hooks/useConversationMetadata';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { GitBranch, GitCommit, RotateCcw, Zap } from 'lucide-react';

interface ConversationCheckpointManagerProps {
  projectId: string;
}

export const ConversationCheckpointManager: React.FC<ConversationCheckpointManagerProps> = ({ 
  projectId 
}) => {
  const {
    projectMetadata,
    conversationMetadata,
    isLoading,
    error,
    revertToCommit,
    availableBranches,
    recentCommits
  } = useConversationMetadata();

  const [isReverting, setIsReverting] = useState(false);

  const handleRevert = async (commitHash: string) => {
    setIsReverting(true);
    try {
      const success = await revertToCommit(commitHash);
      if (success) {
        console.log(`✅ Successfully reverted to commit ${commitHash}`);
      }
    } catch (error) {
      console.error('❌ Failed to revert:', error);
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
      <Card className="p-6 border-red-200 bg-red-50">
        <div className="flex items-center space-x-2 text-red-600">
          <span className="font-medium">⚠️ Project data not available</span>
        </div>
        <p className="text-sm text-red-500 mt-2">{error}</p>
        <p className="text-sm text-gray-600 mt-2">
          Start a conversation to generate project data and enable checkpoints.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Project Overview */}
      {projectMetadata && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">{projectMetadata.projectName}</h2>
            <div className="flex items-center space-x-4 text-sm text-gray-600">
              <div className="flex items-center space-x-1">
                <GitBranch className="w-4 h-4" />
                <span>{projectMetadata.totalBranches} branches</span>
              </div>
              <div className="flex items-center space-x-1">
                <GitCommit className="w-4 h-4" />
                <span>{projectMetadata.totalCommits} commits</span>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="bg-blue-50 p-3 rounded">
              <div className="font-medium text-blue-900">Auto-Commit</div>
              <div className="text-blue-700">
                <Zap className="w-4 h-4 inline mr-1" />
                Active
              </div>
            </div>
            <div className="bg-green-50 p-3 rounded">
              <div className="font-medium text-green-900">Git Integration</div>
              <div className="text-green-700">✅ Enabled</div>
            </div>
            <div className="bg-purple-50 p-3 rounded">
              <div className="font-medium text-purple-900">JSON API</div>
              <div className="text-purple-700">📊 Active</div>
            </div>
          </div>
        </Card>
      )}

      {/* Current Conversation */}
      {conversationMetadata && (
        <Card className="p-6 border-blue-200 bg-blue-50">
          <h3 className="font-medium text-blue-900 mb-2">Active Conversation</h3>
          <div className="flex items-center justify-between">
            <div className="text-sm text-blue-800">
              <div>ID: {conversationMetadata.conversationId.slice(-8)}</div>
              <div>{conversationMetadata.messageCount} messages</div>
            </div>
            <div className="flex items-center space-x-2">
              <span className={`inline-block w-2 h-2 rounded-full ${
                conversationMetadata.status === 'active' ? 'bg-green-500' :
                conversationMetadata.status === 'completed' ? 'bg-blue-500' :
                'bg-orange-500'
              }`} />
              <span className="text-xs text-blue-700 capitalize">
                {conversationMetadata.status}
              </span>
            </div>
          </div>
        </Card>
      )}

      {/* Recent Commits & Quick Actions */}
      {recentCommits.length > 0 && (
        <Card className="p-6">
          <h3 className="font-medium mb-4">Recent Commits</h3>
          <div className="space-y-3">
            {recentCommits.slice(0, 5).map((commit) => (
              <div
                key={commit.commitHash}
                className="flex items-center justify-between p-3 bg-gray-50 rounded"
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
                  {commit.filesChanged && (
                    <div className="mt-1 text-xs text-gray-500">
                      {commit.filesChanged.length} file(s) changed
                    </div>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleRevert(commit.commitHash)}
                  disabled={isReverting || isLoading}
                  className="ml-4"
                >
                  <RotateCcw className="w-3 h-3 mr-1" />
                  Revert
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Empty State */}
      {!projectMetadata && !isLoading && (
        <Card className="p-8 text-center">
          <GitBranch className="w-12 h-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No Project Data Available
          </h3>
          <p className="text-gray-600 mb-4">
            Start a conversation to automatically generate project checkpoints and enable version control.
          </p>
          <div className="text-sm text-gray-500">
            Each conversation creates its own branch with automatic commits.
          </div>
        </Card>
      )}
    </div>
  );
}; 