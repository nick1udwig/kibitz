/**
 * Git Auto-Initialization Service
 *
 * This service ensures that a Git repository is initialized in the current workspace.
 * It's designed to run once for a project, making sure that auto-commit
 * features can function correctly.
 *
 * Optimized for production with dynamic path detection.
 */
import { executeGitCommand } from './gitService';
import { getProjectPath } from './projectPathService';

/**
 * Simplified wrapper for executeGitCommand that automatically provides executeTool
 */
const executeGitCommandSimple = async (
  command: string,
  projectPath: string,
  mcpServerId: string
): Promise<{ success: boolean; output: string; error?: string }> => {
  // Get executeTool from the root store
  const { useStore } = await import('../stores/rootStore');
  const { executeTool } = useStore.getState();
  
  return executeGitCommand(mcpServerId, command, projectPath, executeTool);
};

/**
 * Ensures a Git repository is initialized in the current workspace.
 * If a .git directory already exists, it does nothing.
 *
 * @param projectId The project ID for logging purposes
 * @param projectName The name of the project, used for the initial commit message.
 * @param mcpServerId The ID of the MCP server to execute commands on.
 * @returns Promise resolving to success status and any error message
 */
export const autoInitializeGitForProject = async (
  projectId: string,
  projectName: string,
  mcpServerId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    console.log(`🔧 autoInitializeGitForProject: Starting Git initialization for project ${projectId}`);
    
    // Get the current workspace path
    const projectPath = getProjectPath(projectId, projectName);
    console.log(`🔧 autoInitializeGitForProject: Working in directory: ${projectPath}`);
    
    // Step 1: Check if Git is already initialized
    console.log('🔧 autoInitializeGitForProject: Step 1 - Check if Git is already initialized');
    try {
      const gitCheckResult = await executeGitCommandSimple('git rev-parse --git-dir', projectPath, mcpServerId);
      if (gitCheckResult.success) {
        console.log('✅ autoInitializeGitForProject: Git repository already exists, skipping initialization');
        return { success: true };
      }
    } catch (error) {
      console.log('🔧 autoInitializeGitForProject: No existing Git repository found, proceeding with initialization');
    }
    
    // Step 2: Initialize Git repository
    console.log('🔧 autoInitializeGitForProject: Step 2 - Initialize Git repository');
    const gitInitResult = await executeGitCommandSimple('git init', projectPath, mcpServerId);
    console.log(`🔧 autoInitializeGitForProject: Git init result:`, gitInitResult);
    
    // Step 3: Configure Git user (required for commits)
    console.log('🔧 autoInitializeGitForProject: Step 3 - Configure Git user');
    await executeGitCommandSimple('git config user.name "Kibitz Auto-Commit"', projectPath, mcpServerId);
    await executeGitCommandSimple('git config user.email "autocommit@kibitz.dev"', projectPath, mcpServerId);
    
    // Step 4: Create initial README if it doesn't exist
    console.log('🔧 autoInitializeGitForProject: Step 4 - Create README if needed');
    const readmeExists = await executeGitCommandSimple('test -f README.md && echo "exists" || echo "not_exists"', projectPath, mcpServerId);
    if (!readmeExists.output?.includes('exists')) {
      const readmeContent = `# ${projectName}\n\nThis project was initialized by Kibitz.\nChanges will be automatically committed as you work.\n`;
      
      // Use the MCP server's FileWriteOrEdit tool to create README
      const { useStore } = await import('../stores/rootStore');
      const { executeTool } = useStore.getState();
      
      try {
        await executeTool(mcpServerId, 'FileWriteOrEdit', {
          file_path: `${projectPath}/README.md`,
          content: readmeContent
        });
        console.log('✅ autoInitializeGitForProject: README created successfully');
      } catch (error) {
        console.log('⚠️ autoInitializeGitForProject: README creation failed, but continuing:', error);
      }
    }
    
    // Step 5: Add files and create initial commit
    console.log('🔧 autoInitializeGitForProject: Step 5 - Create initial commit');
    await executeGitCommandSimple('git add .', projectPath, mcpServerId);
    await executeGitCommandSimple('git commit -m "Initial commit - Kibitz project setup"', projectPath, mcpServerId);
    
    console.log('✅ autoInitializeGitForProject: Git initialization completed successfully');
    return { success: true };
    
  } catch (error) {
    console.error('❌ autoInitializeGitForProject: Git initialization failed:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error during Git initialization' 
    };
  }
};

/**
 * Checks if Git is available and properly configured
 * @param mcpServerId MCP server ID
 * @param executeTool Function to execute tool on MCP server
 */
export const checkGitAvailability = async (
  mcpServerId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<{ isGit: boolean; hasCommits: boolean }> => {
  try {
    // Check if git is available
    const gitCheckResult = await executeTool(mcpServerId, 'BashCommand', {
      command: 'git --version',
      type: 'command',
      thread_id: `git-version-check-${Date.now()}`
    });

    const isGit = !gitCheckResult.includes('Error:') && !gitCheckResult.includes('not found');

    if (!isGit) {
      return { isGit: false, hasCommits: false };
    }

    // Check if there are any commits
    try {
      const logResult = await executeTool(mcpServerId, 'BashCommand', {
        command: 'git log --oneline -1',
        type: 'command',
        thread_id: `git-log-check-${Date.now()}`
      });

      const hasCommits = !logResult.includes('Error:') && logResult.trim().length > 0;
      return { isGit: true, hasCommits };
    } catch {
      return { isGit: true, hasCommits: false };
    }
  } catch (error) {
    console.error('Failed to check Git availability:', error);
    return { isGit: false, hasCommits: false };
  }
}; 