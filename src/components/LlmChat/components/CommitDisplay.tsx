import React from 'react';
import { GitCommit, RotateCcw, ExternalLink, Copy } from 'lucide-react';
import { Button } from '../../ui/button';

export interface CommitInfo {
  hash: string;
  message: string;
  timestamp: Date | string | number;
  projectId: string;
  projectPath: string;
  trigger: 'tool_execution' | 'build_success' | 'test_success' | 'manual';
  pushed: boolean;
}

interface CommitDisplayProps {
  commit: CommitInfo;
  onRevert?: (commitHash: string) => void;
  onViewDetails?: (commitHash: string) => void;
  compact?: boolean;
}

export const CommitDisplay: React.FC<CommitDisplayProps> = ({
  commit,
  onRevert,
  onViewDetails,
  compact = false
}) => {
  const copyCommitHash = () => {
    navigator.clipboard.writeText(commit.hash);
  };

  const formatTimeAgo = (timestamp: Date | string | number) => {
    const now = new Date();
    
    // Ensure timestamp is a Date object
    let date: Date;
    if (timestamp instanceof Date) {
      date = timestamp;
    } else if (typeof timestamp === 'string' || typeof timestamp === 'number') {
      date = new Date(timestamp);
    } else {
      console.error('Invalid timestamp type:', typeof timestamp, timestamp);
      return 'unknown time';
    }
    
    // Check if the date is valid
    if (isNaN(date.getTime())) {
      console.error('Invalid date:', timestamp);
      return 'invalid time';
    }
    
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const getTriggerIcon = () => {
    switch (commit.trigger) {
      case 'build_success':
        return '🔨';
      case 'test_success':
        return '✅';
      case 'tool_execution':
        return '🛠️';
      case 'manual':
        return '👤';
      default:
        return '📝';
    }
  };

  const getTriggerColor = () => {
    switch (commit.trigger) {
      case 'build_success':
        return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'test_success':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'tool_execution':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'manual':
        return 'text-purple-600 bg-purple-50 border-purple-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  if (compact) {
    return (
      <div className="inline-flex items-center gap-2 px-2 py-1 bg-gray-50 rounded text-xs border">
        <GitCommit className="h-3 w-3" />
        <span className="font-mono text-xs">{commit.hash.substring(0, 7)}</span>
        <span>{getTriggerIcon()}</span>
        {commit.pushed && <span className="text-green-600">↑</span>}
        <span className="text-muted-foreground">{formatTimeAgo(commit.timestamp)}</span>
      </div>
    );
  }

  return (
    <div className={`p-3 rounded-lg border ${getTriggerColor()}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5">
            <GitCommit className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                {getTriggerIcon()} Commit {commit.hash.substring(0, 7)}
              </span>
              {commit.pushed && (
                <span className="text-xs text-green-600 bg-green-100 px-1.5 py-0.5 rounded-full">
                  Pushed
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                {formatTimeAgo(commit.timestamp)}
              </span>
            </div>
            <p className="text-sm text-gray-700 mt-1">{commit.message}</p>
            <div className="flex items-center gap-1 mt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={copyCommitHash}
                className="h-6 px-2 text-xs"
              >
                <Copy className="h-3 w-3 mr-1" />
                Copy Hash
              </Button>
              {onViewDetails && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onViewDetails(commit.hash)}
                  className="h-6 px-2 text-xs"
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Details
                </Button>
              )}
              {onRevert && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRevert(commit.hash)}
                  className="h-6 px-2 text-xs text-orange-600 hover:text-orange-700"
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Revert
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}; 