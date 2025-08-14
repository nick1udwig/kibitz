import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { 
  GitCommit, 
  RotateCcw, 
  GitBranch, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  Loader2
} from 'lucide-react';
import { useStore } from '@/stores/rootStore';
import { rollbackToCommit as vcRollbackToCommit, prepareCommit, executeCommit } from '@/lib/versionControl';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface CommitRollbackControlsProps {
  className?: string;
}

interface CommitInfo {
  hash: string;
  message: string;
  author: string;
  date: string;
  branch: string;
}

export function CommitRollbackControls({ className = '' }: CommitRollbackControlsProps) {
  const { activeProjectId, projects, executeTool, servers } = useStore();
  const [isLoading, setIsLoading] = useState(false);
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<'success' | 'error' | 'info'>('info');

  // Get active project and MCP servers
  const activeProject = projects.find(p => p.id === activeProjectId);
  const activeMcpServers = servers.filter(server => 
    server.status === 'connected' && activeProject?.settings.mcpServerIds?.includes(server.id)
  );

  // Load recent commits
  useEffect(() => {
    loadRecentCommits();
  }, [activeProjectId]);

  const showStatus = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setStatusMessage(message);
    setStatusType(type);
    setTimeout(() => setStatusMessage(null), 5000);
  };

  const loadRecentCommits = async () => {
    const __t0 = Date.now();
    if (!activeProjectId || !activeMcpServers.length) return;

    try {
      // Get project path
      const response = await fetch(`/api/projects/${activeProjectId}`);
      if (!response.ok) return;

      const projectData = await response.json();
      
      // Extract commits from branches data
      const branchCommits: CommitInfo[] = [];
      
      if (projectData.branches && Array.isArray(projectData.branches)) {
        projectData.branches.forEach((branch: any) => {
          if (branch.commitHash && branch.commitMessage) {
            branchCommits.push({
              hash: branch.commitHash.substring(0, 8),
              message: branch.commitMessage,
              author: branch.author || 'Unknown',
              date: new Date(branch.timestamp || Date.now()).toLocaleString(),
              branch: branch.branchName
            });
          }
        });
      }

      // Sort by timestamp (most recent first)
      branchCommits.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      setCommits(branchCommits.slice(0, 5)); // Show last 5 commits
      console.log(`⏱️ UI loadRecentCommits total time: ${Date.now() - __t0}ms for project ${activeProjectId}`);
    } catch (error) {
      console.warn('Could not load commits:', error);
    }
  };

  const createCommit = async () => {
    if (!activeProject || !activeMcpServers.length) {
      showStatus('No connected MCP server', 'error');
      return;
    }

    setIsLoading(true);
    showStatus('Creating commit...', 'info');

    try {
      const mcpServerId = activeMcpServers[0].id;
      
      // Get project path
      const response = await fetch(`/api/projects/${activeProjectId}`);
      if (!response.ok) throw new Error('Could not get project data');
      
      const projectData = await response.json();
      const projectPath = projectData.projectPath;

      // Prepare commit via facade (stages + LLM message)
      const prep = await prepareCommit({
        projectPath,
        serverId: mcpServerId,
        executeTool,
        projectSettings: activeProject.settings
      });

      if (!prep.success || !prep.commitMessage) {
        showStatus('No changes to commit', 'info');
      } else {
        const exec = await executeCommit({
          projectPath,
          serverId: mcpServerId,
          executeTool,
          projectSettings: activeProject.settings
        }, prep.commitMessage);

        if (!exec.success) {
          showStatus('Failed to create commit', 'error');
        } else {
          showStatus('Commit created successfully!', 'success');
          // Reload commits
          setTimeout(() => { loadRecentCommits(); }, 1000);
          // Trigger sync if GitHub is enabled AND UI min-files threshold satisfied
          if (projectData.github?.enabled) {
            try {
              const uiMin = projectData?.settings?.minFilesForAutoCommitPush ?? 0;
              if (uiMin && uiMin > 0) {
                // Quick check: count changed files now; skip push if below threshold
                const statusRes = await executeTool(mcpServerId, 'BashCommand', {
                  action_json: { command: `cd "${projectPath}" && git status --porcelain`, type: 'command' },
                  thread_id: 'git-operations'
                });
                const out = typeof statusRes === 'string' ? statusRes : '';
                const beforeSep = out.includes('\n---\n') ? out.split('\n---\n')[0] : out;
                const changed = beforeSep.trim() ? beforeSep.trim().split('\n').filter((l: string) => l.trim()).length : 0;
                if (changed < uiMin) {
                  console.log(`ℹ️ UI minFilesForAutoCommitPush=${uiMin}. Skipping immediate sync (changed ${changed}).`);
                } else {
                  setTimeout(() => { triggerGitHubSync(); }, 2000);
                }
              } else {
                setTimeout(() => { triggerGitHubSync(); }, 2000);
              }
            } catch {
              setTimeout(() => { triggerGitHubSync(); }, 2000);
            }
          }

          // Ensure JSON is regenerated immediately after commit
          try {
            await fetch(`/api/projects/${activeProjectId}/generate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' }
            });
          } catch {}
        }
      }

    } catch (error) {
      console.error('Error creating commit:', error);
      showStatus(`Error: ${error instanceof Error ? error.message : 'Failed to create commit'}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const rollbackToCommit = async (commitHash: string, commitMessage: string) => {
    if (!activeProject || !activeMcpServers.length) {
      showStatus('No connected MCP server', 'error');
      return;
    }

    const confirm = window.confirm(
      `Are you sure you want to rollback to:\n${commitHash}: ${commitMessage}\n\nThis will reset your current changes.`
    );
    
    if (!confirm) return;

    setIsLoading(true);
    showStatus('Rolling back...', 'info');

    try {
      const mcpServerId = activeMcpServers[0].id;
      
      // Get project path
      const response = await fetch(`/api/projects/${activeProjectId}`);
      if (!response.ok) throw new Error('Could not get project data');
      
      const projectData = await response.json();
      const projectPath = projectData.projectPath;

      // Initialize MCP environment
      await executeTool(mcpServerId, 'Initialize', {
        type: "first_call",
        any_workspace_path: projectPath,
        initial_files_to_read: [],
        task_id_to_resume: "",
        mode_name: "wcgw",
        thread_id: "rollback-operation"
      });

      // Find the full commit hash from branches
      let fullCommitHash = commitHash;
      if (projectData.branches) {
        const branch = projectData.branches.find((b: any) => 
          b.commitHash && b.commitHash.startsWith(commitHash)
        );
        if (branch) {
          fullCommitHash = branch.commitHash;
        }
      }

      const { success } = await vcRollbackToCommit({
        projectPath,
        serverId: mcpServerId,
        executeTool,
        commitHash: fullCommitHash,
        options: { stashChanges: true, createBackup: true }
      });

      if (success) {
        showStatus(`Successfully rolled back to ${commitHash}`, 'success');
        
        // Reload commits
        setTimeout(() => {
          loadRecentCommits();
        }, 1000);

        // Proactively regenerate API JSON so UI reflects the rolled-back state
        try {
          await fetch(`/api/projects/${activeProjectId}/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });
        } catch {}
      } else {
        showStatus('Rollback failed', 'error');
      }

    } catch (error) {
      console.error('Error during rollback:', error);
      showStatus(`Rollback error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const triggerGitHubSync = async () => {
    if (!activeProjectId) return;

    try {
      const response = await fetch('/api/github-sync/trigger', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId: activeProjectId,
          immediate: true
        }),
      });

      if (response.ok) {
        showStatus('GitHub sync triggered', 'success');
      }
    } catch (error) {
      console.warn('Could not trigger GitHub sync:', error);
    }
  };

  if (!activeProject) {
    return null;
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Status Message */}
      {statusMessage && (
        <Alert className={`${
          statusType === 'success' ? 'border-green-500 bg-green-50' :
          statusType === 'error' ? 'border-red-500 bg-red-50' :
          'border-blue-500 bg-blue-50'
        }`}>
          {statusType === 'success' && <CheckCircle className="h-4 w-4 text-green-600" />}
          {statusType === 'error' && <AlertCircle className="h-4 w-4 text-red-600" />}
          {statusType === 'info' && <Clock className="h-4 w-4 text-blue-600" />}
          <AlertDescription>{statusMessage}</AlertDescription>
        </Alert>
      )}

      {/* Action Buttons */}
      <div className="flex items-center space-x-2">
        <Button
          onClick={createCommit}
          disabled={isLoading || !activeMcpServers.length}
          className="flex items-center space-x-2"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <GitCommit className="h-4 w-4" />
          )}
          <span>Create Commit</span>
        </Button>

        <Button
          variant="outline"
          onClick={loadRecentCommits}
          disabled={isLoading}
          className="flex items-center space-x-2"
        >
          <GitBranch className="h-4 w-4" />
          <span>Refresh</span>
        </Button>
      </div>

      {/* Recent Commits */}
      {commits.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Recent Commits</h4>
          <div className="space-y-1">
            {commits.map((commit, index) => (
              <div 
                key={`${commit.hash}-${index}`}
                className="flex items-center justify-between p-2 border rounded-md hover:bg-muted/50"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <code className="text-xs font-mono bg-muted px-1 rounded">
                      {commit.hash}
                    </code>
                    <span className="text-xs text-muted-foreground">
                      {commit.branch}
                    </span>
                  </div>
                  <p className="text-sm truncate">{commit.message}</p>
                  <p className="text-xs text-muted-foreground">
                    {commit.author} • {commit.date}
                  </p>
                </div>
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => rollbackToCommit(commit.hash, commit.message)}
                  disabled={isLoading}
                  className="ml-2 flex items-center space-x-1"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span className="hidden sm:inline">Rollback</span>
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Help Text */}
      {commits.length === 0 && (
        <div className="text-center py-4 text-muted-foreground">
          <GitCommit className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No commits found. Create your first commit!</p>
        </div>
      )}
    </div>
  );
} 