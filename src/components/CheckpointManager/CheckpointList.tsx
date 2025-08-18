import React, { useEffect, useState, useCallback } from 'react';
import { useCheckpointStore } from '../../stores/checkpointStore';
import { useEnhancedCheckpointStore } from '../../stores/enhancedCheckpointStore';
import { 
  Calendar, 
  RotateCcw, 
  Tag, 
  Trash2, 
  GitCommit,
  Info,
  Filter,
  Plus,
  GitBranch,
  Zap,
  CheckCircle
} from 'lucide-react';
import { Checkpoint } from '../../types/Checkpoint';
import { Button } from '../ui/button';
import { useStore } from '../../stores/rootStore';
import { Project } from '../../components/LlmChat/context/types';
import { ensureProjectDirectory } from '../../lib/projectPathService';
import { executeGitCommand } from '../../lib/versionControl/git';

interface CheckpointListProps {
  projectId: string;
  onRollback?: (project: Project) => void;
  onCreateCheckpoint?: () => void;
}

// 🌿 NEW: Auto-branch item interface
interface AutoBranch {
  id: string;
  name: string;
  type: 'auto' | 'checkpoint' | 'backup';
  timestamp: Date;
  commitMessage: string;
  commitHash: string;
  filesChanged: number;
  canRevert: boolean;
}

export const CheckpointList: React.FC<CheckpointListProps> = ({ 
  projectId,
  onRollback,
  onCreateCheckpoint
}) => {
  const { 
    checkpoints, 
    initialize, 
    deleteCheckpointById,
    rollbackToCheckpoint,
    isLoading
  } = useCheckpointStore();
  
  // Enhanced persistent checkpoints
  const {
    checkpoints: persistentCheckpoints,
    revertToCheckpoint,
    isProcessing: isPersistentProcessing
  } = useEnhancedCheckpointStore();
  
  const { projects, servers, executeTool } = useStore();
  const [filter, setFilter] = useState<string | null>(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState<string | null>(null);
  const [autoBranches, setAutoBranches] = useState<AutoBranch[]>([]);
  const [reverting, setReverting] = useState<string | null>(null);
  

  

  

  
  // 🌿 NEW: Load auto-created branches from git
  const loadAutoBranches = useCallback(async () => {
    // 🔒 EMERGENCY: Circuit breaker temporarily disabled for recovery
    // if (checkCircuitBreaker()) {
    //   console.warn('🔒 CheckpointList: Skipping loadAutoBranches due to circuit breaker');
    //   return;
    // }

    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    const activeMcpServers = servers.filter(server => 
      server.status === 'connected' && 
      project.settings.mcpServerIds?.includes(server.id)
    );

    if (!activeMcpServers.length) return;

    try {
      const mcpServerId = activeMcpServers[0].id;
      const projectPath = await ensureProjectDirectory(project, mcpServerId, executeTool);
      
      console.log('🔍 loadAutoBranches: Loading branches for project:', projectPath);
      
      // Get branches via centralized wrapper
      const branchRes = await executeGitCommand(mcpServerId, 'git branch -a', projectPath, executeTool);
      const branchResult = branchRes.output || '';

      console.log('📋 loadAutoBranches: Raw branch result:', branchResult);

      if (branchResult && !branchResult.includes('Error:') && !branchResult.includes('fatal:') && !branchResult.includes('validation error')) {
        const branches: AutoBranch[] = [];
        const lines = branchResult.split('\n').filter(line => {
          const trimmed = line.trim();
          // Filter out status messages and non-branch lines
          return trimmed && 
                 !trimmed.includes('status =') && 
                 !trimmed.includes('cwd =') && 
                 !trimmed.startsWith('---') && 
                 !trimmed.startsWith('process exited') &&
                 trimmed !== '';
        });

        console.log('📝 loadAutoBranches: Processing lines:', lines);

        for (const line of lines) {
          // Clean up branch name (remove * and spaces)
          const cleanLine = line.trim().replace(/^\*\s+/, '').replace(/^remotes\/origin\//, '');
          console.log('🔍 loadAutoBranches: Processing branch name:', cleanLine);

          // 🔧 IMPROVED: Check for auto-created branch patterns
          if (cleanLine.startsWith('auto/') || cleanLine.startsWith('checkpoint/') || cleanLine.startsWith('backup/') || 
              cleanLine.includes('auto-') || cleanLine.includes('checkpoint-') || cleanLine.includes('backup-')) {
            
            let type: 'auto' | 'checkpoint' | 'backup' = 'auto';
            if (cleanLine.startsWith('checkpoint/') || cleanLine.includes('checkpoint')) type = 'checkpoint';
            else if (cleanLine.startsWith('backup/') || cleanLine.includes('backup')) type = 'backup';

            // Get commit details for this branch using the same thread_id
            try {
              const commitInfoRes = await executeGitCommand(
                mcpServerId,
                `git log -1 --format='%H|%ci|%s' "${cleanLine}" 2>/dev/null || echo "unknown|unknown|Auto-created branch"`,
                projectPath,
                executeTool
              );
              const commitInfoResult = commitInfoRes.output || '';

              const [commitHash, dateStr, commitMessage] = commitInfoResult.split('|');
              
              let timestamp: Date;
              try {
                timestamp = dateStr === 'unknown' ? new Date() : new Date(dateStr);
                if (isNaN(timestamp.getTime())) {
                  timestamp = new Date();
                }
              } catch {
                timestamp = new Date();
              }

              branches.push({
                id: cleanLine,
                name: cleanLine,
                type,
                timestamp,
                commitMessage: commitMessage || 'Auto-created branch',
                commitHash: commitHash === 'unknown' ? '' : commitHash.substring(0, 8),
                filesChanged: 0,
                canRevert: true
              });

              console.log('✅ loadAutoBranches: Added branch:', cleanLine, type);
            } catch (commitError) {
              console.warn('⚠️ loadAutoBranches: Failed to get commit info for', cleanLine, commitError);
              // Add branch anyway with minimal info
              branches.push({
                id: cleanLine,
                name: cleanLine,
                type,
                timestamp: new Date(),
                commitMessage: 'Auto-created branch',
                commitHash: '',
                filesChanged: 0,
                canRevert: true
              });
            }
          } else {
            console.log('⏭️ loadAutoBranches: Skipping non-auto branch:', cleanLine);
          }
        }

        console.log('📊 loadAutoBranches: Final branches array:', branches);
        branches.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        setAutoBranches(branches);
        
        if (branches.length > 0) {
          console.log(`✅ loadAutoBranches: Successfully loaded ${branches.length} auto-created branches`);
        } else {
          console.log('⚠️ loadAutoBranches: No auto-created branches found');
        }
      } else {
        console.error('❌ loadAutoBranches: Command failed or returned error:', branchResult);
      }
    } catch (error) {
      console.error('❌ loadAutoBranches: Failed to load auto-branches:', error);
    }
  }, [projectId, projects, servers, executeTool, setAutoBranches]);

  // 🔄 EMERGENCY: Periodic refresh disabled during recovery
  // useEffect(() => {
  //   // Set up periodic refresh to catch new branches (reduced to every 5 minutes)
  //   const refreshInterval = setInterval(() => {
  //     if (projectId && document.visibilityState === 'visible') {
  //       console.log('🔄 CheckpointList: Periodic refresh of auto-branches...');
  //       // Add throttling to prevent overload
  //       const lastRefresh = sessionStorage.getItem(`lastBranchRefresh_${projectId}`);
  //       const now = Date.now();
  //       if (!lastRefresh || (now - parseInt(lastRefresh)) > 300000) { // 5 minutes
  //         sessionStorage.setItem(`lastBranchRefresh_${projectId}`, now.toString());
  //         loadAutoBranches();
  //       }
  //     }
  //   }, 300000); // Refresh every 5 minutes instead of 30 seconds

  //   return () => clearInterval(refreshInterval);
  // }, [projectId, loadAutoBranches]);

  // 🔄 NEW: Listen for automatic branch detection events
  useEffect(() => {
    const handleNewBranchDetected = (event: CustomEvent) => {
      const { projectId: eventProjectId, commitHash, timestamp } = event.detail;
      
      // Only refresh if this event is for the current project
      if (eventProjectId === projectId) {
        console.log('🌿 CheckpointList: New branch detected, auto-refreshing...', {
          projectId: eventProjectId,
          commitHash,
          timestamp
        });
        
        // Refresh the branch list automatically
        loadAutoBranches();
      }
    };

    // Listen for the custom event from useCommitTracking
    window.addEventListener('newBranchDetected', handleNewBranchDetected as EventListener);
    
    return () => {
      window.removeEventListener('newBranchDetected', handleNewBranchDetected as EventListener);
    };
  }, [projectId, loadAutoBranches]);

  // 🔄 EMERGENCY: Initial auto-load disabled during recovery - use manual refresh instead
  // useEffect(() => {
  //   if (projectId) {
  //     console.log('🚀 CheckpointList: Initial load of auto-branches for project:', projectId);
  //     loadAutoBranches();
  //   }
  // }, [projectId, loadAutoBranches]);

  // Initialize checkpoints for this project
  useEffect(() => {
    if (projectId) {
      initialize(projectId);
    }
  }, [projectId, initialize]);

  // 🔄 NEW: One-click revert function
  const handleQuickRevert = async (branchName: string) => {
    const project = projects.find(p => p.id === projectId);
    if (!project || reverting) return;

    const activeMcpServers = servers.filter(server => 
      server.status === 'connected' && 
      project.settings.mcpServerIds?.includes(server.id)
    );

    if (!activeMcpServers.length) return;

    setReverting(branchName);
    
    try {
      const mcpServerId = activeMcpServers[0].id;
      const projectPath = await ensureProjectDirectory(project, mcpServerId, executeTool);
      
      console.log(`🔄 handleQuickRevert: Reverting to branch ${branchName}...`);
      
      // 🔧 FIXED: Initialize thread first for revert
      let threadId = "revert-check";
      try {
        const initResult = await executeTool(mcpServerId, 'Initialize', {
          type: "first_call",
          any_workspace_path: projectPath,
          initial_files_to_read: [],
          task_id_to_resume: "",
          mode_name: "wcgw",
          thread_id: "revert-check"
        });
        
        const match = initResult.match(/thread_id=([a-z0-9]+)/i);
        threadId = match && match[1] ? match[1] : "revert-check";
        console.log(`✅ handleQuickRevert: Using thread_id=${threadId}`);
      } catch (initError) {
        console.warn('⚠️ handleQuickRevert: Initialize failed, using default thread_id:', initError);
      }
      
      // Checkout via centralized wrapper
      const revertRes = await executeGitCommand(mcpServerId, `git checkout "${branchName}"`, projectPath, executeTool);
      const revertResult = revertRes.output || '';

      console.log('📋 handleQuickRevert: Revert result:', revertResult);

      if (revertResult && !revertResult.includes('Error:') && !revertResult.includes('fatal:') && !revertResult.includes('validation error')) {
        console.log(`✅ Successfully reverted to ${branchName}`);
        await loadAutoBranches(); // Refresh the list
        
        if (onRollback) {
          // Trigger UI refresh by calling onRollback with updated project
          onRollback(project);
        }
      } else {
        console.error(`❌ Revert failed: ${revertResult}`);
      }
    } catch (error) {
      console.error('Error during revert:', error);
    } finally {
      setReverting(null);
    }
  };
  
  const projectCheckpoints = checkpoints[projectId] || [];
  
  // Filter checkpoints
  const filteredCheckpoints = filter 
    ? projectCheckpoints.filter(cp => cp.tags.includes(filter))
    : projectCheckpoints;
  
  // Format date for display
  const formatDate = (date: Date) => {
    if (!(date instanceof Date)) {
      date = new Date(date);
    }
    return date.toLocaleString();
  };

  // 🕒 NEW: Format time ago
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

  // 🔄 NEW: Render auto-branch item with Cursor/Replit-style UI
  const renderAutoBranchItem = (branch: AutoBranch) => (
    <div key={branch.id} className="group relative bg-gray-800/40 hover:bg-gray-800/60 border border-gray-700/50 hover:border-gray-600/80 rounded-lg transition-all duration-200 ease-in-out">
      <div className="flex items-center justify-between p-3">
        {/* Left: Branch info */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Branch type icon */}
          <div className="flex-shrink-0">
            {branch.type === 'auto' && (
              <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center">
                <span className="text-blue-400 text-xs font-bold">A</span>
              </div>
            )}
            {branch.type === 'checkpoint' && (
              <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center">
                <span className="text-green-400 text-xs font-bold">C</span>
              </div>
            )}
            {branch.type === 'backup' && (
              <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center">
                <span className="text-orange-400 text-xs font-bold">B</span>
              </div>
            )}
          </div>

          {/* Branch details */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-200 truncate">
                {branch.name}
              </span>
              <span className="text-xs text-gray-500">
                {formatTimeAgo(branch.timestamp)}
              </span>
            </div>
            <div className="text-xs text-gray-400 truncate mt-0.5">
              {branch.commitMessage}
            </div>
          </div>
        </div>

        {/* Right: Revert button - Cursor/Replit style */}
        <div className="flex-shrink-0">
          {branch.canRevert && (
            <button
              onClick={() => handleQuickRevert(branch.name)}
              disabled={reverting === branch.name || reverting !== null}
              className={`
                relative inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md
                transition-all duration-200 ease-in-out
                ${reverting === branch.name 
                  ? 'bg-blue-500/20 text-blue-400 cursor-not-allowed' 
                  : 'bg-gray-700/50 text-gray-300 hover:bg-blue-500/20 hover:text-blue-400 hover:border-blue-500/30'
                }
                border border-gray-600/50 hover:border-blue-500/50
                focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-2 focus:ring-offset-gray-800
                active:scale-95
              `}
            >
              {reverting === branch.name ? (
                <>
                  <div className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                  <span>Reverting...</span>
                </>
              ) : (
                <>
                  <RotateCcw className="w-3 h-3" />
                  <span>Revert</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Hover indicator */}
      <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-blue-500/0 via-blue-500/50 to-blue-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"></div>
    </div>
  );
  
  // Handle rollback
  const handleRollback = async (checkpointId: string) => {
    const project = await rollbackToCheckpoint(projectId, checkpointId);
    if (project && onRollback) {
      onRollback(project);
    }
  };
  
  // NEW: Handle persistent checkpoint revert
  const handlePersistentRevert = async (checkpointId: string) => {
    try {
      const result = await revertToCheckpoint(projectId, checkpointId);
      if (result.success) {
        console.log(`✅ Reverted to persistent checkpoint: ${checkpointId}`);
        if (onRollback) {
          const project = projects.find(p => p.id === projectId);
          if (project) onRollback(project);
        }
      } else {
        console.error(`❌ Failed to revert to persistent checkpoint: ${result.error}`);
      }
    } catch (error) {
      console.error('Error reverting to persistent checkpoint:', error);
    }
  };
  
  // Handle delete
  const handleDelete = (checkpointId: string) => {
    setShowConfirmDelete(checkpointId);
  };
  
  const confirmDelete = async (checkpointId: string) => {
    await deleteCheckpointById(projectId, checkpointId);
    setShowConfirmDelete(null);
  };
  
  const cancelDelete = () => {
    setShowConfirmDelete(null);
  };

  const renderCheckpointItem = (checkpoint: Checkpoint) => {
    const isShowingInfo = showInfo === checkpoint.id;
    const isBeingDeleted = showConfirmDelete === checkpoint.id;
    
    return (
      <div key={checkpoint.id} className="mb-4 p-4 border border-gray-200 rounded-lg">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <div className="flex items-center mb-2">
              <CheckCircle className="w-4 h-4 mr-2 text-green-500" />
              <h4 className="font-medium text-lg">{checkpoint.description}</h4>
            </div>
            
            <div className="text-sm text-gray-600 mb-2 flex items-center">
              <Calendar className="w-4 h-4 mr-1" />
              {formatDate(checkpoint.timestamp)}
            </div>
            
            {checkpoint.commitHash && (
              <div className="text-sm text-gray-600 mb-2 flex items-center">
                <GitCommit className="w-4 h-4 mr-1" />
                Commit: {checkpoint.commitHash}
              </div>
            )}
          </div>
          
          <div className="flex space-x-1">
            <Button 
              size="icon"
              variant="ghost"
              onClick={() => setShowInfo(isShowingInfo ? null : checkpoint.id)}
              className="h-7 w-7"
            >
              <Info className="w-4 h-4" />
            </Button>
            
            <Button
              size="icon"
              variant="ghost" 
              onClick={() => handleRollback(checkpoint.id)}
              className="h-7 w-7"
              disabled={isLoading}
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
            
            <Button 
              size="icon"
              variant="ghost"
              onClick={() => handleDelete(checkpoint.id)}
              className="h-7 w-7 text-red-500 hover:text-red-700"
              disabled={isLoading}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
        
        {checkpoint.tags.length > 0 && (
          <div className="flex mt-2 gap-1 flex-wrap">
            {checkpoint.tags.map(tag => (
              <span 
                key={tag}
                className="text-xs bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-200 px-2 py-0.5 rounded-full flex items-center"
              >
                <Tag className="w-3 h-3 mr-1" />
                {tag}
              </span>
            ))}
          </div>
        )}
        
        {isShowingInfo && (
          <div className="mt-2 text-sm border-t pt-2 text-gray-700 dark:text-gray-300">
            <div>ID: {checkpoint.id}</div>
            <div>Project: {projects.find(p => p.id === checkpoint.projectId)?.name || checkpoint.projectId}</div>
            {checkpoint.commitHash && <div>Commit: {checkpoint.commitHash}</div>}
            <div>Tags: {checkpoint.tags.join(', ') || 'None'}</div>
          </div>
        )}
        
        {isBeingDeleted && (
          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded">
            <p className="text-sm text-red-800 mb-2">Are you sure you want to delete this checkpoint?</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={cancelDelete}>Cancel</Button>
              <Button size="sm" variant="destructive" onClick={() => confirmDelete(checkpoint.id)}>Delete</Button>
            </div>
          </div>
        )}
      </div>
    );
  };
  
  if (isLoading) {
    return (
      <div className="p-8 text-center">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-3/4 mx-auto mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2 mx-auto"></div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="p-4">


      {/* 🌿 ALWAYS SHOW: Auto-created branches section for visibility */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4 p-3 bg-gray-800/30 border border-gray-700/50 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <Zap className="h-4 w-4 text-blue-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-200">Auto-Created Branches</h3>
              <p className="text-xs text-gray-400">Automatic snapshots from your development</p>
            </div>
            <div className="ml-2">
              <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-blue-500/20 text-blue-400 rounded-full border border-blue-500/30">
                {autoBranches.length}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={loadAutoBranches}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-300 bg-gray-700/50 border border-gray-600/50 rounded-md hover:bg-gray-600/50 hover:text-gray-200 transition-all duration-200"
            >
              <RotateCcw className="h-3 w-3" />
              Refresh
            </button>
            
            <button
              onClick={() => {
                console.log('🧪 Debug: Current state');
                console.log('📋 Project ID:', projectId);
                console.log('📋 Auto branches:', autoBranches);
                console.log('📋 Projects:', projects.length);
                console.log('📋 Servers:', servers.length);
                loadAutoBranches(); // Force reload
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-orange-300 bg-orange-500/10 border border-orange-500/30 rounded-md hover:bg-orange-500/20 hover:text-orange-200 transition-all duration-200"
            >
              Debug
            </button>
            
            <button
              onClick={async () => {
                const project = projects.find(p => p.id === projectId);
                if (!project) return;
                const activeMcpServers = servers.filter(server => 
                  server.status === 'connected' && 
                  project.settings.mcpServerIds?.includes(server.id)
                );
                if (!activeMcpServers.length) return;
                const mcpServerId = activeMcpServers[0].id;
                const projectPath = await ensureProjectDirectory(project, mcpServerId, executeTool);
                
                const testRes = await executeGitCommand(
                  mcpServerId,
                  `git branch -a | sed -e '1,1s/^/=== ALL BRANCHES ===\\n/' -e '$a=== AUTO BRANCHES ===' -e '/auto\\|checkpoint\\|backup/!d' || echo "No auto branches found"`,
                  projectPath,
                  executeTool
                );
                console.log('🧪 Manual test result:', testRes.output || '');
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-green-300 bg-green-500/10 border border-green-500/30 rounded-md hover:bg-green-500/20 hover:text-green-200 transition-all duration-200"
            >
              Test Git
            </button>
          </div>
        </div>
        
        {autoBranches.length > 0 ? (
          <div className="space-y-3">
            {autoBranches.map(renderAutoBranchItem)}
          </div>
        ) : (
          <div className="text-center py-8 bg-gray-800/20 border-2 border-dashed border-gray-600/50 rounded-lg">
            <div className="w-12 h-12 mx-auto mb-3 rounded-lg bg-gray-700/30 flex items-center justify-center">
              <GitBranch className="w-6 h-6 text-gray-500" />
            </div>
            <p className="text-sm font-medium text-gray-300 mb-1">No auto-created branches found</p>
            <p className="text-xs text-gray-400 mb-4">
              Branches will appear here when auto-commit creates them
            </p>
            <button
              onClick={loadAutoBranches}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-300 bg-gray-700/50 border border-gray-600/50 rounded-md hover:bg-gray-600/50 hover:text-gray-200 transition-all duration-200"
            >
              <RotateCcw className="h-3 w-3" />
              Check Again
            </button>
          </div>
        )}
      </div>

      {/* 💾 NEW: Persistent Checkpoints section */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4 p-3 bg-purple-800/30 border border-purple-700/50 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <CheckCircle className="h-4 w-4 text-purple-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-200">Persistent Checkpoints</h3>
              <p className="text-xs text-gray-400">Checkpoints that survive app restarts</p>
            </div>
            <div className="ml-2">
              <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-purple-500/20 text-purple-400 rounded-full border border-purple-500/30">
                {persistentCheckpoints[projectId]?.length || 0}
              </span>
            </div>
          </div>
          
          {isPersistentProcessing && (
            <div className="flex items-center gap-2 text-purple-400">
              <div className="w-3 h-3 border border-purple-400 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-xs">Processing...</span>
            </div>
          )}
        </div>
        
        {persistentCheckpoints[projectId]?.length > 0 ? (
          <div className="space-y-3">
            {persistentCheckpoints[projectId].map(checkpoint => (
              <div key={checkpoint.id} className="group relative bg-purple-800/40 hover:bg-purple-800/60 border border-purple-700/50 hover:border-purple-600/80 rounded-lg transition-all duration-200 ease-in-out">
                <div className="flex items-center justify-between p-3">
                  {/* Left: Checkpoint info */}
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="flex-shrink-0">
                      <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center">
                        <span className="text-purple-400 text-xs font-bold">P</span>
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-200 truncate">
                          {checkpoint.description}
                        </span>
                        <span className="text-xs text-gray-500">
                          {formatTimeAgo(new Date(checkpoint.timestamp))}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 truncate mt-0.5">
                        {checkpoint.type} • {checkpoint.tags?.join(', ') || 'No tags'}
                      </div>
                    </div>
                  </div>

                  {/* Right: Revert button */}
                                     <div className="flex-shrink-0">
                     <button
                       onClick={() => handlePersistentRevert(checkpoint.id)}
                       disabled={isPersistentProcessing}
                      className={`
                        relative inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md
                        transition-all duration-200 ease-in-out
                        ${isPersistentProcessing 
                          ? 'bg-purple-500/20 text-purple-400 cursor-not-allowed' 
                          : 'bg-gray-700/50 text-gray-300 hover:bg-purple-500/20 hover:text-purple-400 hover:border-purple-500/30'
                        }
                        border border-gray-600/50 hover:border-purple-500/50
                        focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:ring-offset-2 focus:ring-offset-gray-800
                        active:scale-95
                      `}
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Revert</span>
                    </button>
                  </div>
                </div>

                {/* Hover indicator */}
                <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-purple-500/0 via-purple-500/50 to-purple-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 bg-purple-800/20 border-2 border-dashed border-purple-600/50 rounded-lg">
            <div className="w-12 h-12 mx-auto mb-3 rounded-lg bg-purple-700/30 flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-purple-500" />
            </div>
            <p className="text-sm font-medium text-gray-300 mb-1">No persistent checkpoints found</p>
            <p className="text-xs text-gray-400 mb-4">
              Use the &quot;💾 Create Persistent Checkpoint&quot; button to create one
            </p>
          </div>
        )}
      </div>

      {/* Filter */}
      {projectCheckpoints.length > 0 && (
        <div className="mb-4 flex items-center space-x-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <select
            value={filter || ''}
            onChange={(e) => setFilter(e.target.value || null)}
            className="text-sm border border-gray-300 rounded px-2 py-1"
          >
            <option value="">All checkpoints</option>
            <option value="manual">Manual</option>
            <option value="auto">Auto</option>
          </select>
        </div>
      )}
      
      {/* Manual checkpoints */}
      {filteredCheckpoints.length > 0 ? (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <GitCommit className="h-5 w-5 text-green-600" />
            <h3 className="text-lg font-semibold text-gray-900">Manual Checkpoints</h3>
            <span className="bg-green-100 text-green-600 text-xs px-2 py-1 rounded-full">
              {filteredCheckpoints.length}
            </span>
          </div>
          {filteredCheckpoints.map(renderCheckpointItem)}
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500">
          <GitCommit className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-sm">No manual checkpoints available</p>
          {onCreateCheckpoint && (
            <Button
              variant="outline"
              size="sm"
              onClick={onCreateCheckpoint}
              className="mt-2"
            >
              <Plus className="w-4 h-4 mr-1" />
              Create first checkpoint
            </Button>
          )}
        </div>
      )}
    </div>
  );
}; 