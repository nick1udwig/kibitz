import React, { useState } from 'react';
import { CheckpointList } from './CheckpointList';
import { CreateCheckpointDialog } from './CreateCheckpointDialog';
import { useStore } from '../../stores/rootStore';
import { useCheckpointStore } from '../../stores/checkpointStore';
import { Button } from '../ui/button';
import { CheckCircle, GitBranch, GitCommit, RotateCcw } from 'lucide-react';
import { Project } from '../../components/LlmChat/context/types';

interface CheckpointManagerProps {
  projectId: string;
}

export const CheckpointManager: React.FC<CheckpointManagerProps> = ({ projectId }) => {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [gitCommandOutput, setGitCommandOutput] = useState<string | null>(null);
  const [isExecutingGitCommand, setIsExecutingGitCommand] = useState(false);
  
  const { 
    initializeGitRepository, 
    createGitHubRepo, 
    createGitCommit,
    createManualCheckpoint,
    isLoading: isCheckpointLoading
  } = useCheckpointStore();
  
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
  
  // Handler for rollback
  const handleRollback = (updatedProject: Project) => {
    updateProjectSettings(projectId, {
      settings: updatedProject.settings,
      conversations: updatedProject.conversations
    });
    setActiveProject(projectId);
  };
  
  // Initialize Git repository for a project
  const handleInitGitRepo = async () => {
    if (!project || !activeMcpServers.length) return;
    
    setIsExecutingGitCommand(true);
    setGitCommandOutput("Initializing Git repository...");
    
    try {
      // First, get the project path from the MCP server
      const mcpServerId = activeMcpServers[0].id;
      
      // First try to initialize the MCP environment
      let threadId = "git-operations";
      try {
        const initResult = await executeTool(mcpServerId, 'Initialize', {
          type: "first_call",
          any_workspace_path: ".",
          initial_files_to_read: [],
          task_id_to_resume: "",
          mode_name: "wcgw",
          thread_id: threadId
        });
        console.log("MCP environment initialized successfully");
        
        // Extract thread ID if possible
        const match = initResult.match(/thread_id=([a-z0-9]+)/i);
        if (match && match[1]) {
          threadId = match[1];
          console.log(`Using thread ID: ${threadId}`);
        }
      } catch (initError) {
        console.warn("Failed to initialize MCP environment:", initError);
      }
      
      // Use a known valid path instead of trying to detect it
      const projectPath = "/Users/test/workx/kibitz";
      console.log(`Using hardcoded project path: ${projectPath}`);
      
      const success = await initializeGitRepository(
        projectPath,
        project.name,
        mcpServerId,
        executeTool
      );
      
      if (success) {
        setGitCommandOutput("Git repository initialized successfully!");
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
    
    setIsExecutingGitCommand(true);
    setGitCommandOutput("Creating GitHub repository...");
    
    try {
      const mcpServerId = activeMcpServers[0].id;
      
      // Initialize MCP environment
      let threadId = "git-operations";
      try {
        console.log("Initializing MCP environment...");
        const initResult = await executeTool(mcpServerId, 'Initialize', {
          type: "first_call",
          any_workspace_path: ".",
          initial_files_to_read: [],
          task_id_to_resume: "",
          mode_name: "wcgw",
          thread_id: threadId
        });
        console.log("Initialization result:", initResult);
        
        // Extract thread ID if possible
        const match = initResult.match(/thread_id=([a-z0-9]+)/i);
        if (match && match[1]) {
          threadId = match[1];
          console.log(`Using thread ID: ${threadId}`);
        }
      } catch (initError) {
        console.warn("Failed to initialize MCP environment:", initError);
      }
      
      // Use hardcoded path for GitHub repo creation
      const projectPath = "/Users/test/workx/kibitz";
      
      const success = await createGitHubRepo(
        project.name.toLowerCase().replace(/\s+/g, '-'),
        `Project created with Kibitz - ${project.name}`,
        false, // public repository
        mcpServerId,
        executeTool
      );
      
      if (success) {
        setGitCommandOutput("GitHub repository created successfully!");
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
      
      // Initialize MCP environment
      let threadId = "git-operations";
      try {
        console.log("Initializing MCP environment...");
        const initResult = await executeTool(mcpServerId, 'Initialize', {
          type: "first_call",
          any_workspace_path: ".",
          initial_files_to_read: [],
          task_id_to_resume: "",
          mode_name: "wcgw",
          thread_id: threadId
        });
        console.log("Initialization result:", initResult);
        
        // Extract thread ID if possible
        const match = initResult.match(/thread_id=([a-z0-9]+)/i);
        if (match && match[1]) {
          threadId = match[1];
          console.log(`Using thread ID: ${threadId}`);
        }
      } catch (initError) {
        console.warn("Failed to initialize MCP environment:", initError);
      }
      
      // Use a known valid path instead of trying to detect it
      const projectPath = "/Users/test/workx/kibitz";
      console.log(`Using hardcoded project path: ${projectPath}`);
      
      console.log(`Creating Git commit in path: ${projectPath}`);
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
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCreateDialog(true)}
            disabled={isExecutingGitCommand || isCheckpointLoading}
          >
            <CheckCircle className="mr-1 h-4 w-4" />
            Create Checkpoint
          </Button>
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
    </div>
  );
}; 