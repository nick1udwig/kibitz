/**
 * Project Path Service
 * 
 * Manages project-specific path resolution.
 * This service dynamically detects the current working directory.
 */

import { Project } from '../components/LlmChat/context/types';
import { getProjectsBaseDir } from './pathConfig';

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
  // Always resolve from shared config. In the browser, NEXT_PUBLIC_PROJECTS_DIR
  // should be provided to hydrate UI-only path usage; on server, runtime envs.
  return getProjectsBaseDir();
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
  
  // If custom path is provided (for cloned repos or UI override), normalize and use that
  if (cleanCustomPath && cleanCustomPath !== 'undefined' && cleanCustomPath.trim() !== '') {
    let normalizedCustom = cleanCustomPath.trim();
    // Strip masked bullets and trailing slashes
    normalizedCustom = normalizedCustom.replace(/[•\u2022]+/g, '').replace(/\/+$/g, '');
    // If it looks like a macOS path missing leading slash (e.g., "Users/..."), add it
    if (!normalizedCustom.startsWith('/') && /^Users\//.test(normalizedCustom)) {
      normalizedCustom = '/' + normalizedCustom;
    }
    projectPathCache.set(cacheKey, normalizedCustom);
    return normalizedCustom;
  }
  
  // 🚨 VALIDATION: Ensure project data is valid
  if (!cleanProjectId || cleanProjectId.trim() === '') {
    console.error(`❌ getProjectPath: Invalid projectId: "${cleanProjectId}"`);
    throw new Error(`Invalid projectId: "${cleanProjectId}" - cannot generate project path`);
  }
  
  // Create project-specific subdirectories in the base projects directory  
  // Prefer server-only resolution to include persisted UI override when available
  let baseDir = getCurrentWorkingDirectory();
  if (typeof process !== 'undefined' && (process as any).versions?.node) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const srv = require('./server/pathConfigServer') as typeof import('./server/pathConfigServer');
      if (srv && typeof srv.getServerProjectsBaseDir === 'function') {
        baseDir = srv.getServerProjectsBaseDir();
      }
    } catch {
      // fall back to client-safe base dir
    }
  }
  // Extra hardening: strip invisible/zero-width/control characters from base dir
  const cleanBaseDir = String(baseDir)
    .replace(/[•\u2022]+/g, '')
    .replace(/[\u200B\u200C\u200D\u2060\uFEFF\u00A0\u202F]+/g, '')
    .replace(/[\u0000-\u001F\u007F]+/g, '')
    .replace(/\/+$/, '');
  const sanitizedName = cleanProjectName ? sanitizeProjectName(cleanProjectName) : 'project';
  let fullPath = `${cleanBaseDir}/${cleanProjectId}_${sanitizedName}`;
  // Fix accidental loss of leading slash if baseDir came in as "Users/..."
  if (!fullPath.startsWith('/')) {
    fullPath = '/' + fullPath;
  }
  // Final hardening: remove any invisible/zero-width/control characters from result
  fullPath = fullPath
    .replace(/[•\u2022]+/g, '')
    .replace(/[\u200B\u200C\u200D\u2060\uFEFF\u00A0\u202F]+/g, '')
    .replace(/[\u0000-\u001F\u007F]+/g, '')
    .replace(/\/+$/, '');
  
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
  
  // 🚨 CRITICAL: Validate project path is absolute and complete.
  // Use server base dir when available for strict validation.
  const baseDir = (typeof process !== 'undefined' && (process as any).versions?.node)
    ? (() => { try { const srv = require('./server/pathConfigServer'); return srv.getServerProjectsBaseDir?.() || getProjectsBaseDir(); } catch { return getProjectsBaseDir(); } })()
    : getProjectsBaseDir();
  // If a customPath was provided, only require an absolute path
  const hasCustom = !!(project.customPath && String(project.customPath).trim());
  const pathIsAbsolute = projectPath.startsWith('/');
  if ((hasCustom && !pathIsAbsolute) || (!hasCustom && (!projectPath.startsWith(`${baseDir}/`) || projectPath.length < baseDir.length + 5))) {
    console.error(`❌ Invalid project path detected: "${projectPath}"`);
    console.error(`❌ Expected format: ${baseDir}/{projectId}_{projectName}`);
    throw new Error(`Invalid project path: ${projectPath}`);
  }
  
  // 🚀 CRITICAL: Initialize MCP environment with the specific project directory FIRST
  // Many MCP servers require Initialize before any BashCommand on a given thread
  console.log(`🔧 Preparing MCP environment for project directory: ${projectPath}`);
  // Initialize at most once per (server, projectPath)
  const initKey = `${mcpServerId}|${projectPath}`;
  const g: any = globalThis as any;
  if (!g.__kibitzInitCache) g.__kibitzInitCache = new Set<string>();
  if (!g.__kibitzInitCache.has(initKey)) {
    try {
      const initArgs = {
        type: 'first_call',
        any_workspace_path: projectPath,
        initial_files_to_read: [],
        task_id_to_resume: '',
        mode_name: 'wcgw',
        thread_id: 'git-operations'
      } as const;
      const result = await executeTool(mcpServerId, 'Initialize', initArgs as unknown as Record<string, unknown>);
      if (typeof result === 'string' && result.toLowerCase().includes('skipped')) {
        console.log('ℹ️ Initialize not supported by server, proceeding without it');
      } else {
        console.log(`✅ MCP environment initialized for project: ${project.name}`);
      }
    } catch (error) {
      const message = String(error || 'unknown');
      if (/not found/i.test(message) || /initialize/i.test(message)) {
        console.log('ℹ️ Initialize not available on this server; continuing');
      } else {
        console.error(`❌ MCP preflight error:`, error);
        // Do not throw here; avoid blocking app due to transient init issues
      }
    } finally {
      g.__kibitzInitCache.add(initKey);
    }
  }

  // Ensure directory exists (mkdir -p) AFTER Initialize so thread is ready
  try {
    await createProjectDirectory(projectPath, mcpServerId, executeTool);
  } catch {}
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