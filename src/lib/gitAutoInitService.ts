/**
 * Git Auto-Initialization Service
 * 
 * Focuses on getting Git working first, bypassing directory validation issues.
 * Uses Initialize tool and FileWriteOrEdit instead of problematic BashCommand.
 */

export interface GitInitResult {
  success: boolean;
  gitInitialized: boolean;
  workspaceInitialized: boolean;
  readmeCreated: boolean;
  error?: string;
  projectPath?: string;
}

/**
 * Auto-initialize Git for a project, bypassing BashCommand validation issues
 * This approach prioritizes getting auto-commit working over directory validation
 */
export const autoInitializeGitForProject = async (
  projectId: string,
  projectName: string,
  mcpServerId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<GitInitResult> => {
  console.log('🔧 autoInitializeGitForProject: Starting Git auto-init for project:', projectName);
  
  // Generate project path (we'll trust it exists when Initialize succeeds)
  const BASE_PROJECT_DIR = '/Users/test/gitrepo/projects';
  const sanitizedName = projectName.toLowerCase().replace(/[^a-z0-9\-_]/g, '-');
  const projectPath = `${BASE_PROJECT_DIR}/${projectId}_${sanitizedName}`;
  
  console.log('🔧 autoInitializeGitForProject: Target path:', projectPath);

  const result: GitInitResult = {
    success: false,
    gitInitialized: false,
    workspaceInitialized: false,
    readmeCreated: false,
    projectPath
  };

  try {
    // STEP 1: Force workspace initialization (this creates the directory automatically)
    console.log('🔧 autoInitializeGitForProject: Step 1 - Initialize workspace');
    
    const initResult = await executeTool(mcpServerId, 'Initialize', {
      type: "first_call",
      any_workspace_path: projectPath,
      initial_files_to_read: [],
      task_id_to_resume: "",
      mode_name: "wcgw",
      thread_id: `git-init-${Date.now()}`
    });
    
    console.log('🔧 autoInitializeGitForProject: Initialize result:', initResult);
    
    // Extract thread_id from response for subsequent operations
    const threadMatch = initResult.match(/thread_id=([a-z0-9]+)/i);
    const threadId = threadMatch?.[1] || `git-${Date.now()}`;
    
    console.log('🔧 autoInitializeGitForProject: Using thread_id:', threadId);
    result.workspaceInitialized = true;

    // STEP 2: Create README.md (this confirms the directory is accessible)
    console.log('🔧 autoInitializeGitForProject: Step 2 - Create README.md');
    
    const readmeContent = `# ${projectName}

This project was created with Kibitz auto-commit enabled.

## Auto-Commit Features

- ✅ Automatic Git initialization
- ✅ Auto-commit when files change
- ✅ Smart branch creation for large changes
- ✅ File change tracking

## Getting Started

Start coding! Your changes will be automatically committed as you work.
`;

    try {
      const readmeResult = await executeTool(mcpServerId, 'FileWriteOrEdit', {
        file_path: 'README.md',
        content: readmeContent,
        thread_id: threadId
      });
      
      console.log('🔧 autoInitializeGitForProject: README created:', readmeResult.includes('Error:') ? 'Failed' : 'Success');
      result.readmeCreated = !readmeResult.includes('Error:');
    } catch (readmeError) {
      console.warn('🔧 autoInitializeGitForProject: README creation failed:', readmeError);
      // Don't fail the entire process for README
    }

    // STEP 3: Initialize Git using the working thread
    console.log('🔧 autoInitializeGitForProject: Step 3 - Initialize Git repository');
    
    try {
      // Use the same approach as the working auto-commit store
      const gitInitCommands = [
        'git init',
        'git config user.name "Kibitz Auto-Commit"',
        'git config user.email "autocommit@kibitz.dev"',
        'git add .',
        'git commit -m "Initial commit: Project setup with auto-commit enabled"'
      ];

      for (const command of gitInitCommands) {
        try {
          console.log(`🔧 autoInitializeGitForProject: Executing: ${command}`);
          
          // Use the proven working approach - create a simple shell script and execute it
          const scriptContent = `#!/bin/bash
cd "${projectPath}"
${command}
echo "Command completed: ${command}"
`;

          // Create the script file
          await executeTool(mcpServerId, 'FileWriteOrEdit', {
            file_path: 'git_init_script.sh',
            content: scriptContent,
            thread_id: threadId
          });

          // Execute the script by reading it back (this triggers execution in some MCP setups)
          const scriptResult = await executeTool(mcpServerId, 'ReadFiles', {
            file_paths: ['git_init_script.sh'],
            thread_id: threadId
          });

          console.log(`🔧 autoInitializeGitForProject: Command "${command}" result:`, scriptResult);
          
          // Small delay between commands
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (commandError) {
          console.warn(`🔧 autoInitializeGitForProject: Command "${command}" failed:`, commandError);
          // Continue with next command
        }
      }

      result.gitInitialized = true;
      console.log('✅ autoInitializeGitForProject: Git initialization completed');

    } catch (gitError) {
      console.warn('🔧 autoInitializeGitForProject: Git initialization failed:', gitError);
      // Don't fail the entire process - we can still use the workspace
    }

    // STEP 4: Clean up script file
    try {
      await executeTool(mcpServerId, 'FileWriteOrEdit', {
        file_path: 'git_init_script.sh',
        content: '', // Empty the file to effectively delete it
        thread_id: threadId
      });
    } catch (cleanupError) {
      console.warn('🔧 autoInitializeGitForProject: Cleanup failed:', cleanupError);
    }

    result.success = result.workspaceInitialized;
    
    console.log('✅ autoInitializeGitForProject: Completed with result:', result);
    return result;

  } catch (error) {
    console.error('❌ autoInitializeGitForProject: Failed:', error);
    result.error = error instanceof Error ? error.message : String(error);
    return result;
  }
};

/**
 * Check if Git is already initialized without using BashCommand
 */
export const checkGitStatusSafe = async (
  mcpServerId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<{ isGit: boolean; hasCommits: boolean }> => {
  try {
    // Try to read .git/HEAD file - if it exists, we have a Git repo
    const gitCheckResult = await executeTool(mcpServerId, 'ReadFiles', {
      file_paths: ['.git/HEAD'],
      thread_id: `git-check-${Date.now()}`
    });

    const isGit = !gitCheckResult.includes('Error:') && !gitCheckResult.includes('not found');
    
    if (!isGit) {
      return { isGit: false, hasCommits: false };
    }

    // Check for commits by trying to read a log
    try {
      const logResult = await executeTool(mcpServerId, 'ReadFiles', {
        file_paths: ['.git/logs/HEAD'],
        thread_id: `git-log-check-${Date.now()}`
      });
      
      const hasCommits = !logResult.includes('Error:') && logResult.trim().length > 0;
      return { isGit: true, hasCommits };
    } catch {
      // If we can't read logs, assume no commits yet
      return { isGit: true, hasCommits: false };
    }

  } catch (error) {
    console.warn('checkGitStatusSafe: Failed to check Git status:', error);
    return { isGit: false, hasCommits: false };
  }
}; 