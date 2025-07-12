/**
 * Project Path Service
 * 
 * Manages project-specific directory creation and path resolution.
 * Each project gets its own isolated directory for development.
 * 
 * Updated to support both:
 * - New projects: Template directory creation
 * - Cloned repos: Use existing repository paths
 */

import { Project } from '../components/LlmChat/context/types';

/**
 * Base directory where all NEW project directories will be created
 */
const BASE_PROJECT_DIR = '/Users/test/gitrepo/projects';

/**
 * Cache to prevent multiple simultaneous directory creation attempts
 */
const projectCreationCache = new Map<string, Promise<string>>();

/**
 * Cache timeout tracking
 */
const cacheTimeouts = new Map<string, NodeJS.Timeout>();

/**
 * Maximum time to wait for directory creation (30 seconds)
 */
const DIRECTORY_CREATION_TIMEOUT = 30000;

/**
 * Sanitizes a project name for use in file system paths
 * @param name Project name
 * @returns Sanitized name safe for file system
 */
export const sanitizeProjectName = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\-_]/g, '-')  // Replace non-alphanumeric chars with hyphens
    .replace(/-+/g, '-')             // Replace multiple hyphens with single
    .replace(/^-|-$/g, '');          // Remove leading/trailing hyphens
};

/**
 * Gets the directory path for a specific project
 * @param projectId Project ID
 * @param projectName Project name (optional, for directory naming)
 * @param customPath Custom path for cloned repositories (optional)
 * @returns Full path to project directory
 */
export const getProjectPath = (projectId: string, projectName?: string, customPath?: string): string => {
  // If custom path is provided (for cloned repos), use that
  if (customPath) {
    return customPath;
  }
  
  // Otherwise generate template directory path
  const sanitizedName = projectName ? sanitizeProjectName(projectName) : 'project';
  const directoryName = `${projectId}_${sanitizedName}`;
  return `${BASE_PROJECT_DIR}/${directoryName}`;
};

/**
 * Gets the GitHub repository name for a project (unique to avoid conflicts)
 * @param projectId Project ID
 * @param projectName Project name
 * @returns Unique repository name
 */
export const getGitHubRepoName = (projectId: string, projectName: string): string => {
  const sanitizedName = sanitizeProjectName(projectName);
  return `${sanitizedName}-${projectId}`;
};

/**
 * Detects if a directory is a cloned Git repository
 * @param directoryPath Path to check
 * @param mcpServerId MCP server ID
 * @param executeTool Function to execute tools on MCP server
 * @returns Repository info if cloned, null if local/new
 */
export const detectClonedRepository = async (
  directoryPath: string,
  mcpServerId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<{ isCloned: boolean; repoUrl?: string; defaultBranch?: string } | null> => {
  try {
    // Check if this is a Git repository with proper thread_id
    const gitCheckResult = await executeTool(mcpServerId, 'BashCommand', {
      action_json: { command: `test -d "${directoryPath}/.git" && echo "is_git_repo" || echo "not_git_repo"` },
      thread_id: `git-check-${Date.now()}`
    });

    if (!gitCheckResult.includes('is_git_repo')) {
      return null;
    }

    // Check for remote origin (indicates cloned repo)
    const remoteResult = await executeTool(mcpServerId, 'BashCommand', {
      action_json: { command: `cd "${directoryPath}" && git remote get-url origin 2>/dev/null || echo "no_remote"` },
      thread_id: `git-remote-${Date.now()}`
    });

    const hasRemote = !remoteResult.includes('no_remote') && remoteResult.trim();
    
    // Get default branch
    const branchResult = await executeTool(mcpServerId, 'BashCommand', {
      action_json: { command: `cd "${directoryPath}" && git branch --show-current 2>/dev/null || echo "main"` },
      thread_id: `git-branch-${Date.now()}`
    });

    const defaultBranch = branchResult.trim() || 'main';

    return {
      isCloned: !!hasRemote,
      repoUrl: hasRemote ? remoteResult.trim() : undefined,
      defaultBranch
    };
  } catch (error) {
    console.error('Failed to detect cloned repository:', error);
    return null;
  }
};

/**
 * Creates the project directory structure (for new projects only)
 * @param projectPath Full path to project directory
 * @param mcpServerId MCP server ID
 * @param executeTool Function to execute tools on MCP server
 * @returns Success status
 */
export const createProjectDirectory = async (
  projectPath: string,
  mcpServerId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<boolean> => {
  try {
    console.log(`🔧 Creating project directory: ${projectPath}`);
    console.log(`🔧 MCP Server ID: ${mcpServerId}`);

    // Create consistent thread ID for this entire operation
    const baseThreadId = `project-setup-${Date.now()}`;
    console.log(`🔧 Using base thread ID: ${baseThreadId}`);

    // STEP 1: Force workspace initialization to ensure MCP context
    console.log('🔧 Force initializing workspace for project directory creation...');
    try {
      const initResult = await executeTool(mcpServerId, 'Initialize', {
        type: "first_call",
        any_workspace_path: projectPath.substring(0, projectPath.lastIndexOf('/')), // Use parent directory first
        initial_files_to_read: [],
        task_id_to_resume: "",
        mode_name: "wcgw",
        thread_id: baseThreadId
      });
      console.log('🔧 Workspace initialization result:', initResult);
    } catch (initError) {
      console.warn('⚠️ Workspace initialization failed, continuing anyway:', initError);
    }

    // STEP 2: Create the project directory with consistent thread_id
    const commandArgs = {
      action_json: { command: `mkdir -p "${projectPath}"` },
      thread_id: baseThreadId  // Use same thread ID
    };
    
    console.log(`🔧 BashCommand args:`, JSON.stringify(commandArgs, null, 2));
    
    const createDirResult = await executeTool(mcpServerId, 'BashCommand', commandArgs);

    console.log('🔍 createProjectDirectory: mkdir result:', createDirResult);
    console.log('🔍 createProjectDirectory: mkdir result type:', typeof createDirResult);
    console.log('🔍 createProjectDirectory: mkdir result length:', createDirResult?.length);
    
    // Check if there was an error in creation
    if (createDirResult.includes('Error:') && !createDirResult.includes('File exists')) {
      console.error('❌ createProjectDirectory: Directory creation failed:', createDirResult);
      return false;
    }
    
    // STEP 3: Re-initialize with the new project directory
    console.log('🔧 Re-initializing workspace with project directory...');
    try {
      const reinitResult = await executeTool(mcpServerId, 'Initialize', {
        type: "first_call",
        any_workspace_path: projectPath, // Now use the project directory itself
        initial_files_to_read: [],
        task_id_to_resume: "",
        mode_name: "wcgw",
        thread_id: baseThreadId
      });
      console.log('🔧 Project workspace re-initialization result:', reinitResult);
    } catch (reinitError) {
      console.warn('⚠️ Project workspace re-initialization failed:', reinitError);
    }
    
    // Wait a moment for file system operations to complete
    console.log('⏳ Waiting for filesystem operations...');
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // STEP 4: Verify the directory was created using same thread
    const verifyArgs = {
      action_json: { command: `test -d "${projectPath}" && echo "success" || echo "failed"` },
      thread_id: baseThreadId  // Use same thread ID
    };
    
    console.log(`🔍 Verify BashCommand args:`, JSON.stringify(verifyArgs, null, 2));
    
    const verifyResult = await executeTool(mcpServerId, 'BashCommand', verifyArgs);

    console.log('🔍 createProjectDirectory: Verification result:', verifyResult);
    console.log('🔍 createProjectDirectory: Verification result type:', typeof verifyResult);
    
    const directoryCreated = verifyResult.includes('success');
    console.log('🔍 createProjectDirectory: Directory created?', directoryCreated);
    
    if (!directoryCreated) {
      console.error('❌ createProjectDirectory: Directory verification failed');
      
      // Try to get more info about what happened using same thread
      try {
        const debugResult = await executeTool(mcpServerId, 'BashCommand', {
          action_json: { command: `ls -la "${projectPath.substring(0, projectPath.lastIndexOf('/'))}"` },
          thread_id: baseThreadId
        });
        console.log('🔍 Debug: Parent directory listing:', debugResult);
      } catch (debugError) {
        console.log('🔍 Debug: Could not list parent directory:', debugError);
      }
      
      return false;
    }
    
    // STEP 5: Create README using same thread
    try {
      console.log('📝 Creating README.md file...');
      
      const readmeContent = `# Project

This is a Kibitz project directory.

## Getting Started

This directory was automatically created for your project workspace.
`;

      const readmeResult = await executeTool(mcpServerId, 'FileWriteOrEdit', {
        file_path: `${projectPath}/README.md`,
        content: readmeContent,
        thread_id: baseThreadId  // Use same thread ID
      });

      if (readmeResult.includes('Error:')) {
        console.warn('⚠️ Failed to create README.md, but directory creation succeeded');
      } else {
        console.log('✅ createProjectDirectory: README.md created successfully');
      }
    } catch (readmeError) {
      console.warn('⚠️ Failed to create README.md:', readmeError);
      // Don't fail the entire operation for README creation failure
    }

    console.log('✅ createProjectDirectory: Directory creation completed successfully');
    return true;
  } catch (error) {
    console.error('❌ createProjectDirectory: Failed to create project directory:', error);
    console.error('❌ createProjectDirectory: Error details:', JSON.stringify(error, null, 2));
    return false;
  }
};

/**
 * Checks if a project directory exists and initializes ws-mcp environment
 * @param projectPath Full path to project directory
 * @param mcpServerId MCP server ID
 * @param executeTool Function to execute tools on MCP server
 * @returns Whether directory exists
 */
export const projectDirectoryExists = async (
  projectPath: string,
  mcpServerId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<boolean> => {
  try {
    console.log(`🔍 projectDirectoryExists: Checking ${projectPath}`);
    console.log(`🔍 projectDirectoryExists: MCP Server ID: ${mcpServerId}`);
    
    // Create consistent thread ID for this operation
    const threadId = `check-exists-${Date.now()}`;
    console.log(`🔍 projectDirectoryExists: Using thread ID: ${threadId}`);
    
    // STEP 1: Force workspace initialization to ensure proper MCP context
    console.log('🔍 Force initializing workspace for directory check...');
    try {
      const initResult = await executeTool(mcpServerId, 'Initialize', {
        type: "first_call",
        any_workspace_path: projectPath.substring(0, projectPath.lastIndexOf('/')) || '/Users/test/gitrepo/projects',
        initial_files_to_read: [],
        task_id_to_resume: "",
        mode_name: "wcgw",
        thread_id: threadId
      });
      console.log('🔍 Workspace initialization result for check:', initResult);
    } catch (initError) {
      console.warn('⚠️ Workspace initialization failed for check, continuing anyway:', initError);
    }
    
    // STEP 2: Check if directory exists with proper workspace context
    const checkArgs = {
      action_json: { command: `test -d "${projectPath}" && echo "exists" || echo "not_exists"` },
      thread_id: threadId
    };
    
    console.log(`🔍 projectDirectoryExists: BashCommand args:`, JSON.stringify(checkArgs, null, 2));
    
    const checkResult = await executeTool(mcpServerId, 'BashCommand', checkArgs);

    console.log(`🔍 projectDirectoryExists: Check result:`, checkResult);
    console.log(`🔍 projectDirectoryExists: Check result type:`, typeof checkResult);
    
    const exists = checkResult.includes('exists');
    console.log(`🔍 projectDirectoryExists: Directory exists? ${exists}`);
    
    return exists;
  } catch (error) {
    console.error('❌ projectDirectoryExists: Failed to check project directory:', error);
    console.error('❌ projectDirectoryExists: Error details:', JSON.stringify(error, null, 2));
    return false;
  }
};

/**
 * Checks if a directory contains a Git repository
 * @param projectPath Full path to project directory
 * @param mcpServerId MCP server ID
 * @param executeTool Function to execute tools on MCP server
 * @returns Whether directory contains a Git repository
 */
export const isGitRepository = async (
  projectPath: string,
  mcpServerId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<boolean> => {
  try {
    // Check if this is a Git repository with proper thread_id
    const gitCheckResult = await executeTool(mcpServerId, 'BashCommand', {
      action_json: { command: `test -d "${projectPath}/.git" && echo "is_git_repo" || echo "not_git_repo"` },
      thread_id: `git-repo-check-${Date.now()}`
    });

    return gitCheckResult.includes('is_git_repo');
  } catch (error) {
    console.error('Failed to check if directory is Git repository:', error);
    return false;
  }
};

/**
 * Ensures a project directory exists, creating it if necessary
 * Handles both new projects and cloned repositories
 * @param project Project data
 * @param mcpServerId MCP server ID
 * @param executeTool Function to execute tools on MCP server
 * @returns Project path and whether it's an existing Git repo
 */
export const ensureProjectDirectory = async (
  project: Project,
  mcpServerId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<string> => {
  console.log(`🚀 ensureProjectDirectory: Starting for project ${project.id}`);
  
  // Check if project has a custom path (for cloned repos)
  // We'll add this as a new field to Project interface
  const customPath = (project as any).customPath;
  
  const projectPath = getProjectPath(project.id, project.name, customPath);
  console.log('🔍 ensureProjectDirectory: Checking path:', projectPath);
  console.log('🔍 ensureProjectDirectory: Custom path:', customPath);
  console.log('🔍 ensureProjectDirectory: MCP Server ID:', mcpServerId);
  
  // Check if there's already a creation operation in progress for this project
  if (projectCreationCache.has(project.id)) {
    console.log('⏳ ensureProjectDirectory: Directory creation already in progress, waiting...');
    try {
      // Add timeout protection to prevent infinite waiting
      const cachedPromise = projectCreationCache.get(project.id)!;
      const timeoutPromise = new Promise<string>((_, reject) => {
        setTimeout(() => reject(new Error('Directory creation timeout - cache wait exceeded 30 seconds')), DIRECTORY_CREATION_TIMEOUT);
      });
      
      return await Promise.race([cachedPromise, timeoutPromise]);
    } catch (error) {
      console.warn('⚠️ ensureProjectDirectory: Cached operation failed or timed out, clearing cache and retrying:', error);
      // Clear the stale cache entry and continue with new attempt
      projectCreationCache.delete(project.id);
      const timeout = cacheTimeouts.get(project.id);
      if (timeout) {
        clearTimeout(timeout);
        cacheTimeouts.delete(project.id);
      }
      // Continue to create new operation below
    }
  }
  
  // Create a promise for this directory creation operation with timeout protection
  const creationPromise = (async () => {
    try {
      console.log('🔍 ensureProjectDirectory: Checking if directory exists...');
      const exists = await projectDirectoryExists(projectPath, mcpServerId, executeTool);
      console.log('🔍 ensureProjectDirectory: Directory exists?', exists);
      
      if (!exists) {
        // Only create directory structure for new projects (not cloned repos)
        if (!customPath) {
          console.log('🔧 ensureProjectDirectory: Creating directory...');
          const created = await createProjectDirectory(projectPath, mcpServerId, executeTool);
          console.log('🔧 ensureProjectDirectory: Creation result:', created);
          
          if (!created) {
            // Try one more time to check if directory was actually created
            console.log('🔄 ensureProjectDirectory: Retrying directory check...');
            const existsAfterCreation = await projectDirectoryExists(projectPath, mcpServerId, executeTool);
            console.log('🔍 ensureProjectDirectory: Directory exists after creation attempt?', existsAfterCreation);
            
            if (!existsAfterCreation) {
              console.error('❌ ensureProjectDirectory: Final check - directory still does not exist');
              throw new Error(`Failed to create project directory: ${projectPath}`);
            } else {
              console.log('✅ ensureProjectDirectory: Directory was created successfully despite initial failure indication');
            }
          }
        } else {
          console.error('❌ ensureProjectDirectory: Cloned repository directory does not exist');
          throw new Error(`Cloned repository directory does not exist: ${projectPath}`);
        }
      } else {
        console.log('✅ ensureProjectDirectory: Directory already exists');
      }

      console.log('✅ ensureProjectDirectory: Success, returning path:', projectPath);
      return projectPath;
    } catch (error) {
      console.error('❌ ensureProjectDirectory: Error occurred:', error);
      console.error('❌ ensureProjectDirectory: Error stack:', error instanceof Error ? error.stack : 'No stack');
      throw error;
    } finally {
      // Clean up cache entry and timeout when operation completes
      console.log('🧹 ensureProjectDirectory: Cleaning up cache for project:', project.id);
      projectCreationCache.delete(project.id);
      const timeout = cacheTimeouts.get(project.id);
      if (timeout) {
        clearTimeout(timeout);
        cacheTimeouts.delete(project.id);
      }
    }
  })();
  
  // Store the promise in cache
  projectCreationCache.set(project.id, creationPromise);
  
  // Set up automatic cache cleanup in case the promise hangs
  const timeoutId = setTimeout(() => {
    console.warn(`⏰ ensureProjectDirectory: Forcing cache cleanup for project ${project.id} after ${DIRECTORY_CREATION_TIMEOUT}ms`);
    projectCreationCache.delete(project.id);
    cacheTimeouts.delete(project.id);
  }, DIRECTORY_CREATION_TIMEOUT);
  
  cacheTimeouts.set(project.id, timeoutId);
  
  // Return the result
  return await creationPromise;
};

/**
 * Creates a project configuration for an existing cloned repository
 * @param repoPath Path to the cloned repository
 * @param projectName Name for the project (will be derived from repo if not provided)
 * @param mcpServerId MCP server ID
 * @param executeTool Function to execute tools on MCP server
 * @returns Project configuration for the cloned repo
 */
export const createProjectFromClonedRepo = async (
  repoPath: string,
  projectName?: string,
  mcpServerId?: string,
  executeTool?: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<{ 
  name: string; 
  customPath: string; 
  repoInfo?: { isCloned: boolean; repoUrl?: string; defaultBranch?: string }
}> => {
  // Normalize the path
  const normalizedPath = repoPath.replace(/\/$/, ''); // Remove trailing slash
  
  // Derive project name from directory if not provided
  let derivedName = projectName;
  if (!derivedName) {
    const pathParts = normalizedPath.split('/');
    derivedName = pathParts[pathParts.length - 1];
  }
  
  // Detect if this is a cloned repository
  let repoInfo;
  if (mcpServerId && executeTool) {
    repoInfo = await detectClonedRepository(normalizedPath, mcpServerId, executeTool);
  }
  
  return {
    name: derivedName,
    customPath: normalizedPath,
    repoInfo: repoInfo || undefined
  };
}; 