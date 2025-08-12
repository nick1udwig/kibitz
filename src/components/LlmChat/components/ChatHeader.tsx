import React, { useState } from 'react';
import { GitCommit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCheckpointStore } from '@/stores/checkpointStore';
import { useStore } from '@/stores/rootStore';
// import SessionRestoreButton from './SessionRestoreButton'; // Temporarily disabled

interface ChatHeaderProps {
  projectId: string;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({ projectId }) => {

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [showStatus, setShowStatus] = useState(false);
  
  const { 
    createGitCommit,
    isLoading: isCheckpointLoading 
  } = useCheckpointStore();
  
  const {
    projects,
    servers,
    executeTool
  } = useStore();
  
  const project = projects.find(p => p.id === projectId);
  const activeMcpServers = servers.filter(server => 
    server.status === 'connected' && project?.settings.mcpServerIds?.includes(server.id)
  );
  
  const handleCreateCommit = async () => {
    if (!project || !activeMcpServers.length) {
      setStatusMessage("No connected MCP server");
      setShowStatus(true);
      setTimeout(() => setShowStatus(false), 3000);
      return;
    }
    
    setStatusMessage("Creating commit...");
    setShowStatus(true);
    
    try {
      const mcpServerId = activeMcpServers[0].id;
      
      let threadId = "git-operations";
      try {
        // Initialize the MCP environment first
        const initResult = await executeTool(mcpServerId, 'Initialize', {
          type: "first_call",
          any_workspace_path: ".",
          initial_files_to_read: [],
          task_id_to_resume: "",
          mode_name: "wcgw",
          thread_id: threadId
        });
        
        // Extract thread ID if possible
        const match = initResult.match(/thread_id=([a-z0-9]+)/i);
        if (match && match[1]) {
          threadId = match[1];
          console.log(`Using thread ID: ${threadId}`);
        }
      } catch (initError) {
        console.log("Failed to initialize MCP environment:", initError);
      }
      
      // Get the proper project path using the project path service
      const { ensureProjectDirectory } = await import('../../../lib/projectPathService');
      const projectPath = await ensureProjectDirectory(project, mcpServerId, executeTool);
      console.log(`Using detected project path: ${projectPath}`);
      
      const commitResult = await createGitCommit(
        projectPath,
        "Checkpoint: Update via Kibitz",
        mcpServerId,
        executeTool
      );
      
      // Handle different result types
      switch (commitResult) {
        case "no_changes":
          setStatusMessage("No changes to commit");
          break;
        case "unknown":
          setStatusMessage("Commit created but couldn't retrieve hash");
          break;
        case "not_git_repo":
          setStatusMessage("Not a Git repository - initialize Git first");
          break;
        case "failed":
          setStatusMessage("Failed to create commit");
          break;
        default:
          if (commitResult?.startsWith("error:")) {
            setStatusMessage(`Error: ${commitResult.substring(6)}`);
          } else {
            setStatusMessage(`Commit created: ${commitResult}`);
          }
          break;
      }
    } catch (error) {
      console.error("Error creating commit:", error);
      setStatusMessage(`Error: ${error instanceof Error ? error.message : "Failed to create commit"}`);
    } finally {
      setTimeout(() => setShowStatus(false), 3000);
    }
  };
  
  return (
    <div className="flex justify-end items-center p-2 bg-background/90 backdrop-blur-sm">
      <div className="flex items-center space-x-2">
        {showStatus && statusMessage && (
          <div className="text-sm bg-muted rounded-md px-3 py-1 text-muted-foreground mr-2">
            {statusMessage}
          </div>
        )}
        

        <Button
          variant="ghost"
          size="sm"
          onClick={handleCreateCommit}
          disabled={isCheckpointLoading || !activeMcpServers.length}
          className="text-muted-foreground hover:text-foreground"
          title="Create git commit"
        >
          <GitCommit className="h-4 w-4 mr-1" />
          <span className="hidden sm:inline">Commit</span>
        </Button>
        
{/* SessionRestoreButton temporarily removed - using per-message revert instead */}
      </div>
      

    </div>
  );
}; 