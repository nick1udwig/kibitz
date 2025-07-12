/**
 * 🧪 Repository Analysis Test Button
 * 
 * UI component to test the comprehensive repository analysis feature
 * that distinguishes between local vs cloned repositories.
 */

import React, { useState } from 'react';
import { useStore } from '../stores/rootStore';
import { analyzeRepository, type RepoAnalysis } from '../lib/repoAnalysisService';
import { executeGitCommand } from '../lib/gitService';
import { safeRollback, createAutoCheckpoint, shouldCreateCheckpoint, listCheckpoints } from '../lib/checkpointRollbackService';

export function ProjectAnalysisTestButton() {
  // Make analysis results project-specific
  const [analysisResults, setAnalysisResults] = useState<Record<string, RepoAnalysis>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // New state for cloned repo testing
  const [repoPath, setRepoPath] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const [projectCreationResult, setProjectCreationResult] = useState<string | null>(null);
  
  // Branch switch and checkpoint state
  const [switchingToBranch, setSwitchingToBranch] = useState<string | null>(null);
  const [creatingCheckpoint, setCreatingCheckpoint] = useState(false);
  const [checkpointResult, setCheckpointResult] = useState<string | null>(null);
  
  const { projects, activeProjectId, executeTool, servers, createProjectFromClonedRepo } = useStore();
  const activeProject = projects.find(p => p.id === activeProjectId);

  // Get analysis for current project
  const currentAnalysis = activeProject ? analysisResults[activeProject.id] : null;

  const connectedServer = servers.find((s: any) => s.status === 'connected');

  const getProjectPath = (projectId: string, projectName: string): string => {
    const user = typeof window !== 'undefined' ? 'test' : 'test';
    return `/Users/${user}/gitrepo/projects/${projectId}_${projectName}`;
  };

  const handleAnalyze = async () => {
    if (!activeProject || !connectedServer) {
      setError('No active project or connected server found');
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const projectPath = activeProject.customPath || getProjectPath(activeProject.id, activeProject.name);
      const result = await analyzeRepository(
        projectPath,
        connectedServer.id,
        executeTool
      );
      
      // Store analysis result for this specific project
      setAnalysisResults(prev => ({
        ...prev,
        [activeProject.id]: result
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFromClonedRepo = async () => {
    if (!repoPath.trim()) {
      setError('Please enter a repository path');
      return;
    }

    setCreatingProject(true);
    setError(null);
    setProjectCreationResult(null);
    
    try {
      const projectId = await createProjectFromClonedRepo(repoPath.trim());
      setProjectCreationResult(`✅ Successfully created project from cloned repository! Project ID: ${projectId}`);
      setRepoPath(''); // Clear the input
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project from repository');
    } finally {
      setCreatingProject(false);
    }
  };

  const handleSwitchToBranch = async (branchName: string) => {
    if (!activeProject || !connectedServer) {
      setError('No active project or connected server found');
      return;
    }

    setSwitchingToBranch(branchName);
    setError(null);
    setCheckpointResult(null);
    
    try {
      const projectPath = activeProject.customPath || getProjectPath(activeProject.id, activeProject.name);
      
      // Use safe rollback instead of direct git checkout for better safety
      const result = await safeRollback(
        projectPath,
        connectedServer.id,
        executeTool,
        {
          targetBranch: branchName,
          createBackup: true // Always create backup for safety
        }
      );
      
      if (result.success) {
        // Refresh analysis after branch switch
        await handleAnalyze();
        let message = `✅ Successfully switched to branch: ${branchName}`;
        if (result.backupBranch) {
          message += `\n🔄 Backup created: ${result.backupBranch}`;
        }
        setCheckpointResult(message);
        console.log(message);
      } else {
        setError(`Failed to switch to branch ${branchName}: ${result.error}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to switch to branch ${branchName}`);
    } finally {
      setSwitchingToBranch(null);
    }
  };

  const handleCreateCheckpoint = async () => {
    if (!activeProject || !connectedServer) {
      setError('No active project or connected server found');
      return;
    }

    setCreatingCheckpoint(true);
    setError(null);
    setCheckpointResult(null);
    
    // 🔒 DISABLED: Checkpoint creation to prevent multiple branches
    setCheckpointResult('⚠️ Checkpoint creation disabled to prevent multiple branches');
    setCreatingCheckpoint(false);
    return;

    /* ORIGINAL CODE DISABLED:
    try {
      const projectPath = activeProject.customPath || getProjectPath(activeProject.id, activeProject.name);
      
      // Check if checkpoint should be created
      const checkResult = await shouldCreateCheckpoint(
        projectPath,
        connectedServer.id,
        executeTool,
        { filesChanged: 2, linesChanged: 30 } // Lower thresholds for manual checkpoints
      );
      
      if (!checkResult.shouldCreate) {
        setCheckpointResult(`ℹ️ ${checkResult.reason}`);
        return;
      }
      
      // Create the checkpoint
      const result = await createAutoCheckpoint(
        projectPath,
        connectedServer.id,
        executeTool,
        {
          description: `Manual checkpoint: ${checkResult.changes.filesChanged} files changed`,
          createBackup: true,
          branchType: 'checkpoint'
        }
      );
      
      if (result.success) {
        let message = `✅ Checkpoint created: ${result.branchName}`;
        if (result.backupBranch) {
          message += `\n🔄 Backup: ${result.backupBranch}`;
        }
        setCheckpointResult(message);
        // Refresh analysis to show new branch
        await handleAnalyze();
      } else {
        setError(`Failed to create checkpoint: ${result.error}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create checkpoint');
    } finally {
      setCreatingCheckpoint(false);
    }
    */
  };

  const formatDate = (date: Date | null | undefined) => {
    if (!date) {
      return 'Unknown';
    }
    
    try {
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(date);
    } catch (error) {
      console.warn('Date formatting error:', error, 'date:', date);
      return 'Invalid date';
    }
  };

  const getBranchTypeColor = (type: string) => {
    switch (type) {
      case 'feature': return 'bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs';
      case 'bugfix': return 'bg-red-100 text-red-800 px-2 py-1 rounded text-xs';
      case 'experiment': return 'bg-purple-100 text-purple-800 px-2 py-1 rounded text-xs';
      default: return 'bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs';
    }
  };

  // Get top 10 branches, prioritizing current branch and main branches
  const getTopBranches = (branches: any[]) => {
    const sorted = [...branches].sort((a, b) => {
      // Current branch first
      if (a.isActive && !b.isActive) return -1;
      if (!a.isActive && b.isActive) return 1;
      
      // Main branches second
      if ((a.name === 'main' || a.name === 'master') && (b.name !== 'main' && b.name !== 'master')) return -1;
      if ((a.name !== 'main' && a.name !== 'master') && (b.name === 'main' || b.name === 'master')) return 1;
      
      // Then by commit count (most active)
      return b.commitCount - a.commitCount;
    });
    
    return sorted.slice(0, 10);
  };

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h2 className="text-2xl font-bold">🚀 Repository Analysis Test</h2>
          <p className="text-gray-600 mt-1">
            Analyze branches and commit history for projects
          </p>
        </div>
        
        <button 
          onClick={handleAnalyze} 
          disabled={loading || !activeProject || !connectedServer}
          className={`px-4 py-2 rounded font-medium transition-colors ${
            loading || !activeProject || !connectedServer
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          {loading ? '🔍 Analyzing...' : '🚀 Analyze Project'}
        </button>
      </div>

      {/* Create Project from Cloned Repository */}
      <div className="border rounded-lg p-4 bg-yellow-50 border-yellow-200">
        <h3 className="font-medium mb-3 flex items-center gap-2">
          📂 Create Project from Cloned Repository
        </h3>
        <p className="text-sm text-gray-600 mb-3">
          If you have a cloned repository (like the kibitz repo), create a new project that uses the existing repository directory instead of creating a new template directory.
        </p>
        
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={repoPath}
            onChange={(e) => setRepoPath(e.target.value)}
            placeholder="Enter path to cloned repository (e.g., /Users/test/gitrepo/projects/v1ad4o_new-project/kibitz)"
            className="flex-1 px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={creatingProject}
          />
          <button
            onClick={handleCreateFromClonedRepo}
            disabled={creatingProject || !repoPath.trim() || !connectedServer}
            className={`px-4 py-2 rounded font-medium transition-colors ${
              creatingProject || !repoPath.trim() || !connectedServer
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
          >
            {creatingProject ? '⏳ Creating...' : '📂 Create Project'}
          </button>
        </div>
        
        {projectCreationResult && (
          <div className="text-sm text-green-700 bg-green-100 border border-green-200 rounded p-2">
            {projectCreationResult}
          </div>
        )}
      </div>

      {/* Project and Server Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border rounded-lg p-4">
          <h3 className="font-medium mb-2">Active Project</h3>
          <p className="font-medium">{activeProject?.name || 'None'}</p>
          <p className="text-sm text-gray-500">ID: {activeProject?.id || 'N/A'}</p>
          {activeProject?.customPath && (
            <p className="text-sm text-blue-600">Custom Path: {activeProject.customPath}</p>
          )}
        </div>
        
        <div className="border rounded-lg p-4">
          <h3 className="font-medium mb-2">Server Status</h3>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${connectedServer ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm">
              {connectedServer ? `✅ Connected (${connectedServer.name})` : '❌ Not Connected'}
            </span>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="border border-red-200 bg-red-50 rounded-lg p-4">
          <p className="text-red-800 text-sm">❌ {error}</p>
        </div>
      )}

      {/* Checkpoint Result Display */}
      {checkpointResult && (
        <div className="border border-green-200 bg-green-50 rounded-lg p-4">
          <p className="text-green-800 text-sm whitespace-pre-line">{checkpointResult}</p>
        </div>
      )}

      {/* Manual Checkpoint Creation */}
      {activeProject && connectedServer && (
        <div className="border rounded-lg p-4 bg-blue-50 border-blue-200">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-medium mb-1 flex items-center gap-2">
                📝 Create Manual Checkpoint
              </h3>
              <p className="text-sm text-gray-600">
                Save current state as a new checkpoint branch
              </p>
            </div>
            <button
              onClick={handleCreateCheckpoint}
              disabled={creatingCheckpoint}
              className={`px-4 py-2 rounded font-medium transition-colors ${
                creatingCheckpoint
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {creatingCheckpoint ? '⏳ Creating...' : '📝 Create Checkpoint'}
            </button>
          </div>
        </div>
      )}

      {/* Analysis Results - Project-specific */}
      {currentAnalysis && (
        <div className="space-y-6">
          {/* Repository Overview */}
          <div className="border rounded-lg p-4">
            <h3 className="font-medium mb-4 flex items-center gap-2">
              🌿 Repository Overview
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-500">Branches</p>
                <p className="text-2xl font-bold">{currentAnalysis.totalBranches}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Commits</p>
                <p className="text-2xl font-bold">{currentAnalysis.totalCommits}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Last Activity</p>
                <p className="text-sm font-medium">{formatDate(currentAnalysis.lastActivity)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Default Branch</p>
                <p className="text-sm font-medium">{currentAnalysis.defaultBranch}</p>
              </div>
            </div>
          </div>

          {/* Top 10 Branches with Revert Functionality */}
          {currentAnalysis.branches.length > 0 && (
            <div className="border rounded-lg p-4">
              <h3 className="font-medium mb-4 flex items-center gap-2">
                🌿 Top Branches ({Math.min(currentAnalysis.branches.length, 10)} of {currentAnalysis.branches.length})
              </h3>
              <div className="space-y-3">
                {getTopBranches(currentAnalysis.branches).map((branch, index) => (
                  <div 
                    key={`${activeProject?.id}-${branch.name}-${index}`}
                    className={`p-3 rounded-lg border ${branch.isActive ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{branch.name}</span>
                        {branch.isActive && <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">current</span>}
                        <span className={getBranchTypeColor(branch.type)}>
                          {branch.type}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">
                          {branch.commitCount} commits
                        </span>
                        {!branch.isActive && (
                          <button
                            onClick={() => handleSwitchToBranch(branch.name)}
                            disabled={switchingToBranch === branch.name}
                            className={`px-2 py-1 text-xs rounded transition-colors ${
                              switchingToBranch === branch.name
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : 'bg-green-100 hover:bg-green-200 text-green-800'
                            }`}
                          >
                            {switchingToBranch === branch.name ? '⏳' : '🔄 Switch'}
                          </button>
                        )}
                      </div>
                    </div>
                    
                    {branch.lastCommit.message && (
                      <div className="text-sm">
                        <div className="flex items-start gap-2">
                          <span className="text-gray-600">💬</span>
                          <span className="text-gray-700">{branch.lastCommit.message}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                          <span>👤 {branch.lastCommit.author}</span>
                          <span>🕒 {formatDate(branch.lastCommit.date)}</span>
                          <span>🔗 {branch.lastCommit.shortHash}</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              
              {currentAnalysis.branches.length > 10 && (
                <div className="mt-3 text-center text-sm text-gray-500">
                  Showing top 10 of {currentAnalysis.branches.length} branches
                </div>
              )}
            </div>
          )}

          {/* Recent Commits */}
          {currentAnalysis.recentCommits.length > 0 && (
            <div className="border rounded-lg p-4">
              <h3 className="font-medium mb-4 flex items-center gap-2">
                🕒 Recent Commits ({Math.min(currentAnalysis.recentCommits.length, 10)})
              </h3>
              <div className="space-y-3">
                {currentAnalysis.recentCommits.slice(0, 10).map((commit, index) => (
                  <div key={`${activeProject?.id}-${commit.hash}-${index}`} className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                    <div className="flex items-start gap-2 mb-1">
                      <span className="text-gray-400">💬</span>
                      <span className="text-sm text-gray-700 flex-1">{commit.message}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span>👤 {commit.author}</span>
                      <span>🕒 {formatDate(commit.date)}</span>
                      <span>🔗 {commit.shortHash}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
} 