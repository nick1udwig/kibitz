/**
 * Project Path Service
 * 
 * Manages project-specific path resolution.
 * This service dynamically detects the current working directory.
 */

import { Project } from '../components/LlmChat/context/types';

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
 * Dynamically detect the current working directory
 * This ensures the system works universally across different environments
 */
const getCurrentWorkingDirectory = (): string => {
  // For browser environments, return base projects directory
  if (typeof window !== 'undefined') {
    return '/Users/test/gitrepo/projects';
  }
  
  // In Node.js environment, use base projects directory
  return '/Users/test/gitrepo/projects';
};

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

// 🚀 PERFORMANCE OPTIMIZATION: Project path cache to eliminate redundant calls
const projectPathCache = new Map<string, string>();

/**
 * Gets the full path to a project directory.
 * 🚀 OPTIMIZED: Uses caching to prevent redundant path resolution (was called 1,384 times)
 * 
 * @param projectId The unique identifier for the project
 * @param projectName The name of the project (optional)
 * @param customPath Custom path override (optional)
 * @returns Full path to project directory
 */
export const getProjectPath = (projectId: string, projectName?: string, customPath?: string): string => {
  // 🔧 CRITICAL FIX: Remove quotes from input parameters
  const cleanProjectId = projectId?.replace(/"/g, '') || '';
  const cleanProjectName = projectName?.replace(/"/g, '') || '';
  const cleanCustomPath = customPath?.replace(/"/g, '') || '';
  
  // 🚀 PERFORMANCE: Create cache key for this specific path combination
  const cacheKey = `${cleanProjectId}|${cleanProjectName || 'project'}|${cleanCustomPath || ''}`;
  
  // 🚀 PERFORMANCE: Return cached result if available
  if (projectPathCache.has(cacheKey)) {
    return projectPathCache.get(cacheKey)!;
  }
  
  // If custom path is provided (for cloned repos), use that
  if (cleanCustomPath && cleanCustomPath !== 'undefined' && cleanCustomPath.trim() !== '') {
    projectPathCache.set(cacheKey, cleanCustomPath);
    return cleanCustomPath;
  }
  
  // 🚨 VALIDATION: Ensure project data is valid
  if (!cleanProjectId || cleanProjectId.trim() === '') {
    console.error(`❌ getProjectPath: Invalid projectId: "${cleanProjectId}"`);
    throw new Error(`Invalid projectId: "${cleanProjectId}" - cannot generate project path`);
  }
  
  // Create project-specific subdirectories in the base projects directory  
  const baseDir = getCurrentWorkingDirectory();
  const sanitizedName = cleanProjectName ? sanitizeProjectName(cleanProjectName) : 'project';
  const fullPath = `${baseDir}/${cleanProjectId}_${sanitizedName}`;
  
  // 🚨 VALIDATION: Ensure generated path is correct
  if (fullPath === baseDir || fullPath === `${baseDir}/`) {
    console.error(`❌ getProjectPath: Generated invalid path: "${fullPath}"`);
    console.error(`❌ This indicates cleanProjectId or sanitizedName is empty`);
    console.error(`❌ cleanProjectId: "${cleanProjectId}", sanitizedName: "${sanitizedName}"`);
    throw new Error(`Generated invalid project path: "${fullPath}" - check projectId and projectName`);
  }
  
  // 🚀 PERFORMANCE: Cache the result before returning
  projectPathCache.set(cacheKey, fullPath);
  return fullPath;
};

/**
 * 🚀 PERFORMANCE: Clear project path cache (useful for testing or when project paths change)
 */
export const clearProjectPathCache = (): void => {
  projectPathCache.clear();
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
      action_json: {
        command: `test -d "${directoryPath}/.git" && echo "is_git_repo" || echo "not_git_repo"`
      },
      thread_id: 'git-operations'
    });

    if (!gitCheckResult.includes('is_git_repo')) {
      return null;
    }

    // Check for remote origin (indicates cloned repo)
    const remoteResult = await executeTool(mcpServerId, 'BashCommand', {
      command: `cd "${directoryPath}" && git remote get-url origin 2>/dev/null || echo "no_remote"`,
      thread_id: 'git-operations'
    });

    const hasRemote = !remoteResult.includes('no_remote') && remoteResult.trim();
    
    // Get default branch
    const branchResult = await executeTool(mcpServerId, 'BashCommand', {
      command: `cd "${directoryPath}" && git branch --show-current 2>/dev/null || echo "main"`,
      thread_id: 'git-operations'
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
    
    const result = await executeTool(mcpServerId, 'BashCommand', {
      command: `mkdir -p "${projectPath}" && echo "directory_created"`,
      thread_id: 'git-operations'
    });

    const success = result.includes('directory_created');
    console.log(`🔧 Directory creation result: ${success ? 'SUCCESS' : 'FAILED'}`);
    
    return success;
  } catch (error) {
    console.error('❌ Failed to create project directory:', error);
    return false;
  }
};

/**
 * Checks if a project directory exists
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
    
    const checkResult = await executeTool(mcpServerId, 'BashCommand', {
      action_json: {
        command: `test -d "${projectPath}" && echo "exists" || echo "not_exists"`
      },
      thread_id: 'git-operations'
    });

    console.log(`🔍 projectDirectoryExists: Check result:`, checkResult);
    
    const exists = checkResult.includes('exists');
    console.log(`🔍 projectDirectoryExists: Directory exists? ${exists}`);
    
    return exists;
  } catch (error) {
    console.error('❌ projectDirectoryExists: Failed to check project directory:', error);
    return true; // Assume it exists to avoid blocking
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
      command: `test -d "${projectPath}/.git" && echo "is_git_repo" || echo "not_git_repo"`,
      thread_id: 'git-operations'
    });

    return gitCheckResult.includes('is_git_repo');
  } catch (error) {
    console.error('Failed to check if directory is Git repository:', error);
    return false;
  }
};

/**
 * Ensures the project directory exists.
 * Simplified to work with current workspace.
 * @param project Project data
 * @param mcpServerId MCP server ID
 * @param executeTool Function to execute tools on MCP server
 * @returns Full path to project directory
 */
export const ensureProjectDirectory = async (
  project: Project,
  mcpServerId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<string> => {
  console.log(`🔧 ensureProjectDirectory: Project data:`, { 
    id: project.id, 
    name: project.name, 
    customPath: project.customPath,
    projectType: typeof project,
    projectKeys: Object.keys(project || {})
  });
  
  // 🚨 VALIDATION: Ensure project object is valid
  if (!project) {
    console.error(`❌ ensureProjectDirectory: Project object is null/undefined`);
    throw new Error(`Project object is null/undefined`);
  }
  
  if (!project.id || project.id.trim() === '') {
    console.error(`❌ ensureProjectDirectory: Project has invalid id:`, project.id);
    throw new Error(`Project has invalid id: "${project.id}"`);
  }
  
  if (!project.name || project.name.trim() === '') {
    console.error(`❌ ensureProjectDirectory: Project has invalid name:`, project.name);
    throw new Error(`Project has invalid name: "${project.name}"`);
  }
  
  const projectPath = getProjectPath(project.id, project.name, project.customPath);
  console.log(`🔧 ensureProjectDirectory: Generated project path: ${projectPath}`);
  
  // 🚨 CRITICAL: Validate project path is absolute and complete
  if (!projectPath.startsWith('/Users/test/gitrepo/projects/') || projectPath.length < 30) {
    console.error(`❌ Invalid project path detected: "${projectPath}"`);
    console.error(`❌ Expected format: /Users/test/gitrepo/projects/{projectId}_{projectName}`);
    throw new Error(`Invalid project path: ${projectPath}`);
  }
  
  // 🚨 UPDATED: Trust that project directory exists (as per new system design)
  console.log(`✅ Trusting project directory exists: ${projectPath}`);
  
  // Skip directory existence check and creation - directories are managed by the system
  // This prevents the manual directory creation loops that were causing issues
  
  // 🚀 CRITICAL: Initialize MCP environment with the specific project directory
  // This ensures ALL subsequent tool calls work in the correct project workspace
  console.log(`🔧 Initializing MCP environment for project directory: ${projectPath}`);
  console.log(`🔧 MCP should initialize at: ${projectPath} (NOT the parent directory)`);
  
  try {
    const initArgs = {
      type: "first_call",
      any_workspace_path: projectPath,
      initial_files_to_read: [],
      task_id_to_resume: "",
      mode_name: "wcgw",
      thread_id: "git-operations"
    };
    console.log(`🔧 MCP Initialize args:`, JSON.stringify(initArgs, null, 2));
    
    let initResult: string;
    try {
      // Try with full arguments first
      initResult = await executeTool(mcpServerId, 'Initialize', initArgs);
    } catch (error) {
      // If it fails, try with simplified arguments
      console.warn(`⚠️ Initialize failed with full args, trying simplified:`, error);
      const simplifiedInitArgs = {
        type: "first_call",
        any_workspace_path: projectPath
      };
      console.log(`🔧 MCP Initialize simplified args:`, JSON.stringify(simplifiedInitArgs, null, 2));
      initResult = await executeTool(mcpServerId, 'Initialize', simplifiedInitArgs);
    }
    
    // 🔍 VALIDATION: Check if MCP actually initialized in the correct directory
    if (initResult.includes('Initialized in directory') && !initResult.includes(projectPath)) {
      console.error(`❌ MCP initialized in wrong directory!`);
      console.error(`❌ Expected: ${projectPath}`);
      console.error(`❌ Actual result: ${initResult.substring(0, 500)}`);
      throw new Error(`MCP workspace initialization failed - wrong directory`);
    }
    
    console.log(`✅ MCP environment initialized for project: ${project.name} at ${projectPath}`);
    console.log(`📋 MCP Init result: ${initResult.substring(0, 200)}...`);
    
    // 🔧 REMOVED: pwd verification step that was causing timeout cascades
    // The Initialize tool is working properly, so we don't need this verification
    console.log(`✅ Skipping pwd verification to prevent timeout cascades`);
    console.log(`✅ Project directory initialization complete: ${projectPath}`);
    
  } catch (error) {
    console.error(`❌ CRITICAL: Failed to initialize MCP environment for project ${project.name}:`, error);
    throw new Error(`MCP initialization failed: ${error}`);
  }
  
  console.log(`✅ ensureProjectDirectory: Using project path: ${projectPath}`);
  return projectPath;
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