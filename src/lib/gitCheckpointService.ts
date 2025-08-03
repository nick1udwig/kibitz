import { useCheckpointStore } from '../stores/checkpointStore';
import { useStore } from '../stores/rootStore';
import { Project } from '../components/LlmChat/context/types';
import { ensureProjectDirectory } from './projectPathService';
import { autoInitGitIfNeeded } from './gitService';

/**
 * Creates a Git checkpoint with both Git commit and Kibitz checkpoint
 * @param projectId Project ID
 * @param project Project data
 * @param description Description of the operation
 * @param projectPath Project path on file system
 * @param mcpServerId MCP server ID
 * @param executeTool Function to execute tools on MCP server
 */
export const createGitCheckpoint = async (
  projectId: string,
  project: Project,
  description: string,
  projectPath: string,
  mcpServerId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<{ success: boolean; commitHash: string | null }> => {
  const checkpointStore = useCheckpointStore.getState();
  
  try {
    // First create Git commit
    const commitResult = await checkpointStore.createGitCommit(
      projectPath,
      description,
      mcpServerId,
      executeTool
    );
    
    // Then create a checkpoint with the same description
    if (commitResult) {
      const checkpoint = await checkpointStore.createManualCheckpoint(
        projectId,
        project,
        description
      );
      
      // Update the checkpoint with the commit hash
      if (checkpoint && commitResult) {
        // Currently we don't have a way to update an existing checkpoint
        // This would need to be implemented in the checkpoint store
        
        return {
          success: true,
          commitHash: commitResult
        };
      }
    }
    
    return {
      success: !!commitResult,
      commitHash: commitResult
    };
  } catch (error) {
    console.error('Failed to create Git checkpoint:', error);
    return {
      success: false,
      commitHash: null
    };
  }
};

/**
 * Auto-initializes Git for a new project (always initialize Git, but GitHub is opt-in)
 * @param projectId Project ID
 */
export const autoInitializeGitForProject = async (
  projectId: string
): Promise<boolean> => {
  const rootStore = useStore.getState();
  const checkpointStore = useCheckpointStore.getState();
  
  const project = rootStore.projects.find(p => p.id === projectId);
  if (!project) return false;
  
  // Find a connected MCP server
  const activeMcpServers = rootStore.servers.filter(server => 
    server.status === 'connected' && project.settings.mcpServerIds?.includes(server.id)
  );
  
  if (!activeMcpServers.length) return false;
  
  try {
    const mcpServerId = activeMcpServers[0].id;
    
    // Ensure project directory exists and get its path
    const projectPath = await ensureProjectDirectory(project, mcpServerId, rootStore.executeTool);
    console.log(`Auto-initializing Git for project at: ${projectPath}`);
    
    // Auto-initialize Git repository if not already a Git repo
    const gitResult = await autoInitGitIfNeeded(
      projectPath,
      project.name,
      mcpServerId,
      rootStore.executeTool
    );
    
    if (gitResult.success) {
      if (gitResult.wasAlreadyGitRepo) {
        console.log(`Project directory is already a Git repository: ${projectPath}`);
      } else {
        console.log(`Initialized new Git repository: ${projectPath}`);
        
        // Create initial checkpoint only for new Git repos
        await checkpointStore.createManualCheckpoint(
          projectId,
          project,
          "Initial project setup"
        );
      }
      
      return true;
    }
    
    console.error('Failed to initialize Git repository:', gitResult.error);
    return false;
  } catch (error) {
    console.error('Failed to auto-initialize Git:', error);
    return false;
  }
}; 