/**
 * 🔄 Session Recovery Panel - Comprehensive Recovery Interface
 * 
 * Panel component for session recovery during startup or when users need
 * to browse and restore from multiple Git-based sessions/checkpoints
 */

import React, { useState, useEffect } from 'react';
import { 
  RotateCcw, 
  Clock, 
  GitCommit, 
  GitBranch, 
  Calendar,
  FileText,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  CheckCircle
} from 'lucide-react';
import { Button } from '../../ui/button';
import { Card } from '../../ui/card';
import GitSessionService, { SessionCommit, SessionInfo } from '../../../lib/gitSessionService';
import { useStore } from '../../../stores/rootStore';

interface SessionRecoveryPanelProps {
  projectPath?: string;
  onSessionRestore?: (commitHash: string) => void;
  onClose?: () => void;
  className?: string;
}

export const SessionRecoveryPanel: React.FC<SessionRecoveryPanelProps> = ({
  projectPath,
  onSessionRestore,
  onClose,
  className = ''
}) => {
  const [recentCommits, setRecentCommits] = useState<SessionCommit[]>([]);
  const [sessionInfo, setSessionInfo] = useState<SessionInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null);
  const [restoreStatus, setRestoreStatus] = useState<{
    status: 'idle' | 'restoring' | 'success' | 'error';
    message?: string;
  }>({ status: 'idle' });
  
  const { servers, executeTool, activeProjectId } = useStore();
  const activeServer = servers.find(s => s.status === 'connected');

  useEffect(() => {
    if (projectPath && activeServer) {
      loadSessionData();
    }
  }, [projectPath, activeServer?.id]);

  const loadSessionData = async () => {
    if (!projectPath || !activeServer) return;

    setIsLoading(true);
    try {
      const sessionService = new GitSessionService(
        projectPath,
        activeServer.id,
        executeTool
      );

      // Load recent commits and session data in parallel
      const [commits, recoveryData] = await Promise.all([
        sessionService.getRecentCommits(10),
        sessionService.getSessionRecoveryData()
      ]);

      setRecentCommits(commits);
      setSessionInfo(recoveryData.recentSessions);
    } catch (error) {
      console.error('Failed to load session data:', error);
      setRecentCommits([]);
      setSessionInfo([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestore = async (commitHash: string) => {
    if (!projectPath || !activeServer) return;

    setSelectedCommit(commitHash);
    setRestoreStatus({ status: 'restoring', message: 'Restoring session...' });
    
    try {
      const sessionService = new GitSessionService(
        projectPath,
        activeServer.id,
        executeTool
      );

      const result = await sessionService.rollbackToCommit(commitHash, {
        stashChanges: true,
        createBackup: true,
        force: false
      });

      if (result.success) {
        setRestoreStatus({ 
          status: 'success', 
          message: `Session restored successfully. Backup created: ${result.backupBranch}` 
        });
        onSessionRestore?.(commitHash);
        
        // Auto-close after successful restore
        setTimeout(() => {
          onClose?.();
        }, 2000);
      } else {
        setRestoreStatus({ 
          status: 'error', 
          message: result.error || 'Restore failed' 
        });
      }
    } catch (error) {
      setRestoreStatus({ 
        status: 'error', 
        message: error instanceof Error ? error.message : 'Restore failed' 
      });
    } finally {
      setSelectedCommit(null);
    }
  };

  const formatTimeAgo = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const formatCommitMessage = (message: string): string => {
    // Clean up commit message for display
    return message
      .replace(/^\[[^\]]+\]\s*/, '') // Remove [SESSION_TAG] 
      .replace(/\s*\([^)]+@[^)]+\)$/, ''); // Remove (trigger @ timestamp)
  };

  const getCommitTypeColor = (commit: SessionCommit): string => {
    if (commit.isSessionCheckpoint) return 'text-blue-600';
    if (commit.sessionTag) return 'text-green-600';
    return 'text-gray-600';
  };

  const getStatusIcon = () => {
    switch (restoreStatus.status) {
      case 'restoring':
        return <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />;
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      default:
        return null;
    }
  };

  if (!projectPath || !activeServer) {
    return (
      <Card className={`p-6 ${className}`}>
        <div className="text-center text-gray-500">
          <GitBranch className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No active project or Git repository found</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className={`${className} bg-white shadow-lg border-0`}>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
              <RotateCcw className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Session Recovery</h2>
              <p className="text-sm text-gray-500">Restore from recent Git checkpoints</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={loadSessionData}
              disabled={isLoading}
              className="text-gray-600 hover:text-gray-900"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
            
            {onClose && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="text-gray-600 hover:text-gray-900"
              >
                ×
              </Button>
            )}
          </div>
        </div>

        {/* Status Message */}
        {restoreStatus.status !== 'idle' && (
          <div className={`mb-4 p-3 rounded-lg flex items-center space-x-2 ${
            restoreStatus.status === 'success' ? 'bg-green-50 text-green-800' :
            restoreStatus.status === 'error' ? 'bg-red-50 text-red-800' :
            'bg-blue-50 text-blue-800'
          }`}>
            {getStatusIcon()}
            <span className="text-sm">{restoreStatus.message}</span>
          </div>
        )}

        {/* Recent Commits */}
        <div className="space-y-1">
          <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center">
            <Clock className="h-4 w-4 mr-2" />
            Recent Checkpoints
          </h3>
          
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-16 bg-gray-100 rounded-lg"></div>
                </div>
              ))}
            </div>
          ) : recentCommits.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <GitCommit className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No recent checkpoints found</p>
              <p className="text-xs mt-1">Create some commits to enable session recovery</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {recentCommits.map((commit) => (
                <div
                  key={commit.hash}
                  className={`group p-4 rounded-lg border transition-all duration-200 cursor-pointer ${
                    selectedCommit === commit.hash 
                      ? 'border-blue-300 bg-blue-50' 
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                  onClick={() => handleRestore(commit.hash)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3 flex-1">
                      <div className="flex-shrink-0 mt-1">
                        <GitCommit className={`h-4 w-4 ${getCommitTypeColor(commit)}`} />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 mb-1">
                          <span className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-1 rounded">
                            {commit.shortHash}
                          </span>
                          <span className="text-xs text-gray-400">
                            {formatTimeAgo(commit.timestamp)}
                          </span>
                          {commit.sessionTag && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                              {commit.sessionTag}
                            </span>
                          )}
                        </div>
                        
                        <div className="text-sm text-gray-900 font-medium">
                          {formatCommitMessage(commit.message)}
                        </div>
                        
                        <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                          <span className="flex items-center">
                            <FileText className="h-3 w-3 mr-1" />
                            {commit.filesChanged} file{commit.filesChanged !== 1 ? 's' : ''}
                          </span>
                          <span className="flex items-center">
                            <Calendar className="h-3 w-3 mr-1" />
                            {commit.timestamp.toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex-shrink-0 ml-3">
                      <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="mt-6 pt-4 border-t border-gray-200">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Click any checkpoint to restore that session</span>
            <span>{recentCommits.length} checkpoint{recentCommits.length !== 1 ? 's' : ''} available</span>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default SessionRecoveryPanel; 