import React, { useState, useEffect } from 'react';
import { CheckpointList } from './CheckpointList';
import { CreateCheckpointDialog } from './CreateCheckpointDialog';
import { AutoCommitSettings } from './AutoCommitSettings';
import { useStore } from '../../stores/rootStore';
import { useCheckpointStore } from '../../stores/checkpointStore';
import { useAutoCommitStore } from '../../stores/autoCommitStore';
import { useEnhancedCheckpointStore } from '../../stores/enhancedCheckpointStore';
import { useBranchStore } from '../../stores/branchStore';
import { Button } from '../ui/button';
import { CheckCircle, GitBranch, GitCommit, RotateCcw, Settings, Zap } from 'lucide-react';
import { Project } from '../../components/LlmChat/context/types';
import { ensureProjectDirectory, getGitHubRepoName } from '../../lib/projectPathService';
import { connectToGitHubRemote } from '../../lib/gitService';

interface CheckpointManagerProps {
  projectId: string;
}

export const CheckpointManager: React.FC<CheckpointManagerProps> = ({ projectId }) => {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showAutoCommitSettings, setShowAutoCommitSettings] = useState(false);
  const [gitCommandOutput, setGitCommandOutput] = useState<string | null>(null);
  const [isExecutingGitCommand, setIsExecutingGitCommand] = useState(false);
  
  const { 
    initializeGitRepository, 
    createGitHubRepo, 
    createGitCommit,
    createManualCheckpoint,
    isLoading: isCheckpointLoading
  } = useCheckpointStore();

  const { config: autoCommitConfig, isProcessing: isAutoCommitProcessing, lastPushTimestamp } = useAutoCommitStore();
  
  // NEW: Enhanced checkpoint store for persistence
  const {
    checkpoints: persistentCheckpoints,
    isProcessing: isPersistentProcessing,
    createProjectCheckpoint,
    loadProjectCheckpoints,
    revertToCheckpoint,
    initializeProjectPersistence,
    rebuildFromGit
  } = useEnhancedCheckpointStore();

  // Branch store for automatic branch loading
  const {
    listProjectBranches,
    branches: projectBranches,
    isProcessing: isBranchLoading
  } = useBranchStore();
  
  const {
    projects,
    setActiveProject,
    updateProjectSettings,
    executeTool,
    servers
  } = useStore();
  
  const project = projects.find(p => p.id === projectId);
  const activeMcpServers = servers.filter(server => 
    server.status === 'connected' && project?.settings.mcpServerIds?.includes(server.id)
  );
  
  // Auto-initialize persistence and load checkpoints (only once per project)
  useEffect(() => {
    if (!project || !activeMcpServers.length || !projectId) return;
    
    // Prevent multiple initializations for the same project
    const initKey = `${projectId}_initialized`;
    if (localStorage.getItem(initKey)) {
      console.log(`ℹ️ Project ${project.name} already initialized, skipping auto-init`);
      return;
    }
    
    const autoInitializeAndLoad = async () => {
      try {
        // Mark as initializing
        localStorage.setItem(initKey, 'initializing');
        
        // First, try to load existing checkpoints
        console.log(`🔍 Checking for existing checkpoints for project: ${project.name}`);
        const existingCheckpoints = await loadProjectCheckpoints(projectId);
        
        if (existingCheckpoints.length === 0) {
          console.log(`🔧 No checkpoints found, checking if persistence needs initialization...`);
          
          // Try to initialize persistence (this will check if .kibitz directory exists)
          const initResult = await initializeProjectPersistence(projectId);
          
          if (initResult.success) {
            console.log(`✅ Persistence initialized for ${project.name}`);
            
            // Try to rebuild from Git history
            const rebuildResult = await rebuildFromGit(projectId, false); // Don't force, check first
            
            if (rebuildResult.success) {
              console.log(`🔨 Rebuilt checkpoints from Git history for ${project.name}`);
              setGitCommandOutput(`🎯 Auto-initialized persistence and rebuilt ${persistentCheckpoints[projectId]?.length || 0} checkpoints from Git history!`);
            } else {
              console.log(`ℹ️ No Git history to rebuild for ${project.name}`);
              setGitCommandOutput(`🔧 Persistence initialized for ${project.name} - ready for new checkpoints!`);
            }
          } else {
            console.warn(`⚠️ Failed to initialize persistence for ${project.name}: ${initResult.error}`);
          }
        } else {
          console.log(`✅ Found ${existingCheckpoints.length} existing checkpoints for ${project.name}`);
          setGitCommandOutput(`📦 Loaded ${existingCheckpoints.length} existing checkpoints from persistence.`);
        }

        // 🌿 Automatically load branches from Git
        try {
          console.log(`🌿 Auto-loading branches for ${project.name}...`);
          const branches = await listProjectBranches(projectId);
          console.log(`✅ Loaded ${branches.length} branches for ${project.name}`);
          setGitCommandOutput(prev => `${prev}\n🌿 Auto-loaded ${branches.length} Git branches.`);
        } catch (branchError) {
          console.warn(`⚠️ Failed to auto-load branches for ${project.name}:`, branchError);
        }
                 
        // Mark as completed
        localStorage.setItem(initKey, 'completed');
         
      } catch (error) {
        console.error(`❌ Auto-initialization failed for ${project.name}:`, error);
        // Remove the initialization flag so it can be retried
        localStorage.removeItem(initKey);
      }
    };
    
    autoInitializeAndLoad();
  }, [projectId, project?.name, activeMcpServers.length, listProjectBranches]);

  // Auto-refresh branches when commits change (throttled)
  useEffect(() => {
    if (!project || !activeMcpServers.length || !projectId) return;
    
    const refreshKey = `${projectId}_last_refresh`;
    const lastRefresh = localStorage.getItem(refreshKey);
    const now = Date.now();
    
    // Throttle refreshes to once every 10 seconds to prevent spam
    if (lastRefresh && (now - parseInt(lastRefresh)) < 10000) {
      console.log(`⏰ Skipping branch refresh for ${project.name} - too recent`);
      return;
    }
    
    const refreshBranches = async () => {
      try {
        localStorage.setItem(refreshKey, now.toString());
        console.log(`🔄 Auto-refreshing branches for ${project.name} due to commit changes...`);
        const branches = await listProjectBranches(projectId);
        console.log(`✅ Refreshed ${branches.length} branches for ${project.name}`);
      } catch (error) {
        console.warn(`⚠️ Failed to refresh branches for ${project.name}:`, error);
      }
    };

    // Refresh branches whenever auto-commit completes or new checkpoints are created
    if (autoCommitConfig.enabled && lastPushTimestamp) {
      refreshBranches();
    }
  }, [lastPushTimestamp, projectId, project?.name, autoCommitConfig.enabled, listProjectBranches]);
  
  // Handler for rollback
  const handleRollback = (updatedProject: Project) => {
    updateProjectSettings(projectId, {
      settings: updatedProject.settings,
      conversations: updatedProject.conversations
    });
    setActiveProject(projectId);
  };
  
  // NEW: Enhanced persistence handlers
  const handleInitializePersistence = async () => {
    if (!project || !activeMcpServers.length) return;
    
    setIsExecutingGitCommand(true);
    setGitCommandOutput("Initializing persistence system...");
    
    try {
      const result = await initializeProjectPersistence(projectId);
      
      if (result.success) {
        setGitCommandOutput(`✅ Persistence initialized for ${project.name}! Loading checkpoints...`);
        
        // Load checkpoints after initialization
        const checkpoints = await loadProjectCheckpoints(projectId);
        setGitCommandOutput(`✅ Persistence initialized! Found ${checkpoints.length} existing checkpoints.`);
      } else {
        setGitCommandOutput(`❌ Failed to initialize persistence: ${result.error}`);
      }
    } catch (error) {
      console.error('Failed to initialize persistence:', error);
      setGitCommandOutput(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsExecutingGitCommand(false);
    }
  };
  
  const handleLoadCheckpoints = async () => {
    if (!project || !activeMcpServers.length) return;
    
    setIsExecutingGitCommand(true);
    setGitCommandOutput("Loading checkpoints from persistence...");
    
    try {
      const checkpoints = await loadProjectCheckpoints(projectId);
      setGitCommandOutput(`✅ Loaded ${checkpoints.length} checkpoints from persistence.`);
    } catch (error) {
      console.error('Failed to load checkpoints:', error);
      setGitCommandOutput(`❌ Error loading checkpoints: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsExecutingGitCommand(false);
    }
  };
  
  const handleRebuildFromGit = async () => {
    if (!project || !activeMcpServers.length) return;
    
    setIsExecutingGitCommand(true);
    setGitCommandOutput("Rebuilding checkpoints from Git history...");
    
    try {
      const result = await rebuildFromGit(projectId, true); // force rebuild
      
      if (result.success) {
        setGitCommandOutput(`✅ Rebuilt checkpoints from Git history!`);
      } else {
        setGitCommandOutput(`❌ Failed to rebuild from Git: ${result.error}`);
      }
    } catch (error) {
      console.error('Failed to rebuild from Git:', error);
      setGitCommandOutput(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsExecutingGitCommand(false);
    }
  };
  
  const handleCreateEnhancedCheckpoint = async () => {
    if (!project || !activeMcpServers.length) return;
    
    setIsExecutingGitCommand(true);
    setGitCommandOutput("Creating persistent checkpoint...");
    
    try {
      const result = await createProjectCheckpoint(projectId, {
        description: "Manual checkpoint via UI",
        type: 'manual',
        tags: ['manual', 'ui-created']
      });
      
      if (result.success) {
        setGitCommandOutput(`✅ Persistent checkpoint created: ${result.checkpoint?.description} (${result.checkpoint?.id})`);
      } else {
        setGitCommandOutput(`❌ Failed to create checkpoint: ${result.error}`);
      }
    } catch (error) {
      console.error('Failed to create enhanced checkpoint:', error);
      setGitCommandOutput(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsExecutingGitCommand(false);
    }
  };
  
  // Initialize Git repository for a project
  const handleInitGitRepo = async () => {
    if (!project || !activeMcpServers.length) return;
    
    setIsExecutingGitCommand(true);
    setGitCommandOutput("Initializing Git repository...");
    
    try {
      const mcpServerId = activeMcpServers[0].id;
      
      // Ensure project directory exists and get its path
      const projectPath = await ensureProjectDirectory(project, mcpServerId, executeTool);
      console.log(`Using project directory: ${projectPath}`);
      
      const success = await initializeGitRepository(
        projectPath,
        project.name,
        mcpServerId,
        executeTool
      );
      
      if (success) {
        setGitCommandOutput(`Git repository initialized successfully at ${projectPath}!`);
      } else {
        setGitCommandOutput("Failed to initialize Git repository. Check console for details.");
      }
    } catch (error) {
      console.error("Error initializing Git repository:", error);
      setGitCommandOutput(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsExecutingGitCommand(false);
    }
  };
  
  // Create GitHub repository
  const handleCreateGitHubRepo = async () => {
    if (!project || !activeMcpServers.length) return;
    
    // Check if GitHub is enabled for this project
    if (!project.settings.enableGitHub) {
      setGitCommandOutput("GitHub integration is disabled for this project. Enable it in project settings to create GitHub repositories.");
      return;
    }
    
    setIsExecutingGitCommand(true);
    setGitCommandOutput("Creating GitHub repository...");
    
    try {
      const mcpServerId = activeMcpServers[0].id;
      
      // Ensure project directory exists and get its path
      const projectPath = await ensureProjectDirectory(project, mcpServerId, executeTool);
      
      // Generate unique repository name
      const repoName = getGitHubRepoName(project.id, project.name);
      console.log(`Creating GitHub repository: ${repoName}`);
      
      const success = await createGitHubRepo(
        repoName,
        `Project created with Kibitz - ${project.name}`,
        false, // public repository
        mcpServerId,
        executeTool
      );
      
      if (success) {
        setGitCommandOutput(`GitHub repository '${repoName}' created successfully! Connecting to local repository...`);
        
        // Automatically connect the local repository to GitHub
        try {
          console.log(`About to connect to GitHub remote with:`, {
            projectPath,
            repoName,
            username: "malikrohail",
            mcpServerId
          });
          
          const connectResult = await connectToGitHubRemote(
            projectPath,
            repoName,
            "malikrohail", // You can make this dynamic by getting from git config
            mcpServerId,
            executeTool
          );
          
          console.log("connectToGitHubRemote result:", connectResult);
          
          if (connectResult.success) {
            setGitCommandOutput(`GitHub repository '${repoName}' created and connected successfully! All local commits have been pushed.`);
          } else {
            setGitCommandOutput(`GitHub repository '${repoName}' created but failed to connect: ${connectResult.error || connectResult.output}`);
          }
        } catch (connectError) {
          console.error("Error connecting to GitHub:", connectError);
          setGitCommandOutput(`GitHub repository '${repoName}' created but failed to connect automatically. You may need to connect manually.`);
        }
      } else {
        setGitCommandOutput("Failed to create GitHub repository. Check console for details.");
      }
    } catch (error) {
      console.error("Error creating GitHub repository:", error);
      setGitCommandOutput(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsExecutingGitCommand(false);
    }
  };
  
  // Create Git commit
  const handleCreateGitCommit = async () => {
    if (!project || !activeMcpServers.length) return;
    
    setIsExecutingGitCommand(true);
    setGitCommandOutput("Creating commit...");
    
    try {
      const mcpServerId = activeMcpServers[0].id;
      
      // Ensure project directory exists and get its path
      const projectPath = await ensureProjectDirectory(project, mcpServerId, executeTool);
      console.log(`Creating Git commit in project directory: ${projectPath}`);
      
      const commitResult = await createGitCommit(
        projectPath,
        "Checkpoint: Update via Kibitz",
        mcpServerId,
        executeTool
      );
      
      console.log(`Commit result: "${commitResult}"`);
      
      // Handle different result types
      switch (commitResult) {
        case "no_changes":
          setGitCommandOutput("No changes to commit. Make some changes first.");
          break;
        case "unknown":
          setGitCommandOutput("Commit created but couldn't retrieve hash.");
          break;
        case "not_git_repo":
          setGitCommandOutput("This is not a Git repository. Please initialize Git first.");
          break;
        case "failed":
          setGitCommandOutput("Failed to create commit. Check console for details.");
          break;
        default:
          if (commitResult?.startsWith("error:")) {
            setGitCommandOutput(`Error creating commit: ${commitResult.substring(6)}`);
          } else {
            setGitCommandOutput(`Commit created successfully! Hash: ${commitResult}`);
            
            // 🔒 DISABLED: Checkpoint creation after commit to prevent multiple branches
            console.log("Checkpoint creation after commit disabled to prevent multiple branches");
            
            /* ORIGINAL CODE DISABLED:
            // Create a checkpoint after successful commit
            try {
              await createManualCheckpoint(
                projectId,
                project,
                `Commit: ${commitResult}`
              );
              console.log("Created checkpoint after successful commit");
            } catch (checkpointError) {
              console.error("Failed to create checkpoint after commit:", checkpointError);
            }
            */
          }
          break;
      }
    } catch (error) {
      console.error("Error creating commit:", error);
      setGitCommandOutput(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsExecutingGitCommand(false);
    }
  };
  
  return (
    <div className="flex flex-col h-full">
      <div className="flex-none border-b p-4 bg-gray-50 dark:bg-gray-800">
        <h2 className="text-xl font-bold mb-2">Project Checkpoints</h2>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Manage project snapshots and Git integration
        </p>
        
        <div className="mt-4 flex flex-wrap gap-2">
          {/* Git Operations */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleInitGitRepo}
            disabled={isExecutingGitCommand || isCheckpointLoading || !activeMcpServers.length}
          >
            <GitBranch className="mr-1 h-4 w-4" />
            Initialize Git
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleCreateGitHubRepo}
            disabled={isExecutingGitCommand || isCheckpointLoading || !activeMcpServers.length}
          >
            <GitBranch className="mr-1 h-4 w-4" />
            Create GitHub Repo
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleCreateGitCommit}
            disabled={isExecutingGitCommand || isCheckpointLoading || !activeMcpServers.length}
          >
            <GitCommit className="mr-1 h-4 w-4" />
            Create Commit
          </Button>
          
          {/* Enhanced Persistence Operations */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleInitializePersistence}
            disabled={isExecutingGitCommand || isPersistentProcessing || !activeMcpServers.length}
            className="bg-blue-50 border-blue-300"
          >
            <Settings className="mr-1 h-4 w-4 text-blue-600" />
            🔧 Init Persistence
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleCreateEnhancedCheckpoint}
            disabled={isExecutingGitCommand || isPersistentProcessing || !activeMcpServers.length}
            className="bg-purple-50 border-purple-300"
          >
            <CheckCircle className="mr-1 h-4 w-4 text-purple-600" />
            💾 Create Persistent Checkpoint
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleLoadCheckpoints}
            disabled={isExecutingGitCommand || isPersistentProcessing || !activeMcpServers.length}
          >
            <RotateCcw className="mr-1 h-4 w-4" />
            📦 Load Checkpoints
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleRebuildFromGit}
            disabled={isExecutingGitCommand || isPersistentProcessing || !activeMcpServers.length}
          >
            <RotateCcw className="mr-1 h-4 w-4" />
            🔨 Rebuild from Git
          </Button>
          
          {/* Legacy Operations */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCreateDialog(true)}
            disabled={isExecutingGitCommand || isCheckpointLoading}
          >
            <CheckCircle className="mr-1 h-4 w-4" />
            Create Checkpoint
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAutoCommitSettings(true)}
            disabled={isExecutingGitCommand || isCheckpointLoading}
            className={autoCommitConfig.enabled ? 'bg-green-50 border-green-300' : ''}
          >
            {autoCommitConfig.enabled ? (
              <Zap className="mr-1 h-4 w-4 text-green-600" />
            ) : (
              <Settings className="mr-1 h-4 w-4" />
            )}
            Auto-Commit {autoCommitConfig.enabled ? 'ON' : 'OFF'}
          </Button>
        </div>
        
        {/* Status Area */}
        <div className="mt-2 text-xs text-muted-foreground space-y-1">
          {/* Auto-commit status */}
          {autoCommitConfig.enabled && (
            <div className="flex items-center gap-4">
              <span>Auto-commit enabled</span>
              {isAutoCommitProcessing && (
                <span className="flex items-center gap-1 text-blue-600">
                  <div className="animate-pulse h-2 w-2 bg-blue-500 rounded-full"></div>
                  Processing auto-commit...
                </span>
              )}
              <span>
                Triggers: {[
                  autoCommitConfig.triggers.afterToolExecution && 'Tool execution',
                  autoCommitConfig.triggers.afterSuccessfulBuild && 'Build success',
                  autoCommitConfig.triggers.afterTestSuccess && 'Test success',
                ].filter(Boolean).join(', ') || 'None'}
              </span>
              {autoCommitConfig.autoPushToRemote && (
                <span className="flex items-center gap-1">
                  <span>Auto-push: ON</span>
                  {lastPushTimestamp && (
                    <span>
                      (last: {new Date(lastPushTimestamp).toLocaleTimeString()})
                    </span>
                  )}
                </span>
              )}
            </div>
          )}
          
          {/* Persistence status */}
          <div className="flex items-center gap-4">
            <span>Persistent checkpoints: {persistentCheckpoints[projectId]?.length || 0}</span>
            <span>Git branches: {projectBranches[projectId]?.length || 0}</span>
            {isPersistentProcessing && (
              <span className="flex items-center gap-1 text-purple-600">
                <div className="animate-pulse h-2 w-2 bg-purple-500 rounded-full"></div>
                Processing persistence operation...
              </span>
            )}
            {isBranchLoading && (
              <span className="flex items-center gap-1 text-green-600">
                <div className="animate-pulse h-2 w-2 bg-green-500 rounded-full"></div>
                Loading branches...
              </span>
            )}
          </div>
        </div>
        
        {gitCommandOutput && (
          <div className="mt-3 p-3 bg-gray-100 dark:bg-gray-900 rounded-md text-sm overflow-auto max-h-32">
            {isExecutingGitCommand && (
              <div className="animate-pulse">
                <span className="inline-block h-2 w-2 rounded-full bg-blue-500 mr-1"></span>
                <span className="inline-block h-2 w-2 rounded-full bg-blue-500 animation-delay-200 mr-1"></span>
                <span className="inline-block h-2 w-2 rounded-full bg-blue-500 animation-delay-400"></span>
              </div>
            )}
            <div className={`${isExecutingGitCommand ? 'opacity-50' : ''}`}>
              {gitCommandOutput}
            </div>
          </div>
        )}
      </div>
      
      <div className="flex-grow overflow-auto">
        <CheckpointList 
          projectId={projectId} 
          onRollback={handleRollback}
          onCreateCheckpoint={() => setShowCreateDialog(true)}
        />
      </div>
      
      <CreateCheckpointDialog
        projectId={projectId}
        isOpen={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onSuccess={() => setGitCommandOutput("Checkpoint created successfully!")}
      />

      <AutoCommitSettings
        isOpen={showAutoCommitSettings}
        onClose={() => setShowAutoCommitSettings(false)}
      />
    </div>
  );
}; 