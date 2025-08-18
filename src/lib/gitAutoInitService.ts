/**
 * Git Auto-Initialization Service
 *
 * This service ensures that a Git repository is initialized in the current workspace.
 * It's designed to run once for a project, making sure that auto-commit
 * features can function correctly.
 *
 * Optimized for production with dynamic path detection.
 */
import { executeGitCommand } from './versionControl/git';
// import { getProjectPath } from './projectPathService';

// 🚀 PREVENT REPETITIVE OPERATIONS - Cache initialization results
const initializationCache = new Map<string, Promise<{ success: boolean; message?: string }>>();

// 🚀 PERFORMANCE: In-memory flags to prevent repeated Git checks
const gitInitializedProjects = new Set<string>();

/**
 * 🚀 PERFORMANCE: Clear git initialization flags (useful for testing)
 */
export const clearGitInitializationFlags = (): void => {
  gitInitializedProjects.clear();
  initializationCache.clear();
};

/**
 * Auto-initializes Git for a project if needed
 * 🚀 OPTIMIZED: Prevents duplicate operations with caching
 */
export const autoInitializeGitForProject = async (
  projectId: string,
  projectName: string,
  projectPath: string,
  mcpServerId: string = 'localhost-mcp',
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<{ success: boolean; message?: string }> => {
  
  // 🚀 PERFORMANCE: Quick check for already initialized projects
  if (gitInitializedProjects.has(projectId)) {
    return { success: true, message: 'Project Git already initialized (cached)' };
  }
  
  // 🔧 PREVENT DUPLICATE OPERATIONS - Check cache first
  const cacheKey = `${projectId}-${projectPath}`;
  if (initializationCache.has(cacheKey)) {
    return await initializationCache.get(cacheKey)!;
  }

  const initPromise = performGitInitialization(projectId, projectName, projectPath, mcpServerId, executeTool);
  initializationCache.set(cacheKey, initPromise);
  
  // Clean up cache after completion (success or failure)
  try {
    const result = await initPromise;
    // Keep successful results in cache for 5 minutes, remove failed ones immediately
    if (result.success) {
      setTimeout(() => initializationCache.delete(cacheKey), 5 * 60 * 1000);
    } else {
      initializationCache.delete(cacheKey);
    }
    return result;
  } catch (error) {
    initializationCache.delete(cacheKey);
    throw error;
  }
};

async function performGitInitialization(
  projectId: string,
  projectName: string,
  projectPath: string,
  mcpServerId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<{ success: boolean; message?: string }> {
  try {
    console.log(`🔧 autoInitializeGitForProject: Starting Git initialization for project ${projectId}`);
    console.log(`🔧 autoInitializeGitForProject: Working in directory: ${projectPath}`);
    
    console.log('🔧 autoInitializeGitForProject: Step 1 - Check if Git is already initialized');
    const gitCheckResult = await executeGitCommand(mcpServerId, 'git rev-parse --git-dir', projectPath, executeTool);
    
    if (gitCheckResult.success) {
      console.log('✅ autoInitializeGitForProject: Git repository already exists, skipping initialization');
      
      // 🚀 IMPORTANT: Generate JSON files for existing projects that don't have them  
      console.log('📋 autoInitializeGitForProject: Checking for JSON files...');
      const jsonCheckResult = await executeGitCommand(mcpServerId, 'ls -la .kibitz/api/project.json', projectPath, executeTool);
      
      if (!jsonCheckResult.success) {
        console.log('📋 autoInitializeGitForProject: No JSON files found, generating them now...');
        
        try {
          const { extractAndSaveProjectData } = await import('./projectDataExtractor');
          await extractAndSaveProjectData(projectId, projectName, mcpServerId, executeTool);
          console.log('✅ autoInitializeGitForProject: JSON files generated successfully');
        } catch (jsonError) {
          console.warn('⚠️ autoInitializeGitForProject: Failed to generate JSON files:', jsonError);
          // Don't fail the whole operation if JSON generation fails
        }
      } else {
        console.log('✅ autoInitializeGitForProject: JSON files already exist');
      }
      
      // 🚀 PERFORMANCE: Mark project as Git-initialized to prevent future checks
      gitInitializedProjects.add(projectId);
      return { success: true, message: 'Git repository already initialized with JSON files' };
    }

    // Git doesn't exist, so initialize it
    console.log('🔧 autoInitializeGitForProject: Step 2 - Initialize Git repository (prefer main)');
    const gitInitResult = await executeGitCommand(mcpServerId, 'git init -b main || git init', projectPath, executeTool);
    // Ensure master->main rename if older git created master
    await executeGitCommand(mcpServerId, 'git show-ref --verify --quiet refs/heads/master && git branch -m master main || true', projectPath, executeTool);
    
    if (!gitInitResult.success) {
      console.error('❌ autoInitializeGitForProject: Failed to initialize Git repository:', gitInitResult.output);
      return { success: false, message: `Failed to initialize Git: ${gitInitResult.output}` };
    }

    console.log('✅ autoInitializeGitForProject: Git repository initialized successfully');
    
    // 🚀 AUTO-GENERATE JSON FILES for new repos
    // Defer heavy extraction so init returns quickly; write minimal file later
    setTimeout(async () => {
      try {
        console.log('📋 autoInitializeGitForProject: Deferred JSON extraction start...');
        const { extractAndSaveProjectData } = await import('./projectDataExtractor');
        await extractAndSaveProjectData(projectId, projectName, mcpServerId, executeTool);
        console.log('✅ autoInitializeGitForProject: Deferred JSON extraction completed');
      } catch (jsonError) {
        console.warn('⚠️ autoInitializeGitForProject: Deferred JSON extraction failed:', jsonError);
      }
    }, 0);

          // 🚀 PERFORMANCE: Mark project as Git-initialized to prevent future checks
      gitInitializedProjects.add(projectId);
      return { success: true, message: 'Git repository initialized and JSON files created' };

  } catch (error) {
    console.error('❌ autoInitializeGitForProject: Unexpected error:', error);
    return { success: false, message: `Unexpected error: ${error}` };
  }
}

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
    const { executeGitCommand } = await import('./versionControl/git');
    const gitCheckResult = await executeGitCommand(mcpServerId, 'git --version', '.', executeTool);
    const isGit = gitCheckResult.success && !(gitCheckResult.output || '').includes('not found');

    if (!isGit) {
      return { isGit: false, hasCommits: false };
    }

    // Check if there are any commits
    try {
      const logResult = await executeGitCommand(mcpServerId, 'git log --oneline -1', '.', executeTool);
      const hasCommits = logResult.success && (logResult.output || '').trim().length > 0;
      return { isGit: true, hasCommits };
    } catch {
      return { isGit: true, hasCommits: false };
    }
  } catch (error) {
    console.error('Failed to check Git availability:', error);
    return { isGit: false, hasCommits: false };
  }
}; 