import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';
// Do not import TS from JS here. Read from environment directly to work in Node contexts
function getEnvProjectsBaseDir() {
  const value = process.env.PROJECT_WORKSPACE_PATH || process.env.USER_PROJECTS_PATH || process.env.NEXT_PUBLIC_PROJECTS_DIR || '/Users/test/gitrepo/projects';
  return value.replace(/\/+$/, '');
}

/**
 * Default GitHub configuration for new projects
 */
const DEFAULT_GITHUB_CONFIG = {
  enabled: false,
  remoteUrl: null,
  syncInterval: 300000, // 5 minutes
  syncBranches: ['main', 'step-*'],
  lastSync: null,
  syncStatus: 'idle',
  authentication: {
    type: 'token',
    configured: false,
    lastValidated: null
  }
};

/**
 * Default sync configuration for new projects
 */
const DEFAULT_SYNC_CONFIG = {
  lastAttempt: null,
  nextScheduled: null,
  consecutiveFailures: 0,
  pendingChanges: []
};

/**
 * Default branch sync configuration
 */
const DEFAULT_BRANCH_SYNC = {
  lastPushed: null,
  pushedHash: null,
  needsSync: true,  // ✅ New branches need to be synced to GitHub
  syncError: null
};

/**
 * Base projects directory
 */
const BASE_PROJECTS_DIR = `${getEnvProjectsBaseDir()}/`;

/**
 * Logger utility for debugging
 */
const logger = {
  info: (msg, ...args) => console.log(`[INFO] ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[WARN] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] ${msg}`, ...args),
  // Always log debug messages to measure real latency end-to-end
  debug: (msg, ...args) => console.log(`[DEBUG] ${msg}`, ...args)
};

/**
 * Validates if a path exists and is accessible
 * @param {string} filePath - Path to validate
 * @returns {Promise<boolean>}
 */
async function validatePath(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Safely parses JSON with error handling
 * @param {string} jsonString - JSON string to parse
 * @param {string} filePath - File path for error context
 * @returns {Object} Parsed JSON object
 */
function safeJsonParse(jsonString, filePath) {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    throw new Error(`Invalid JSON in ${filePath}: ${error.message}`);
  }
}

/**
 * Validates project.json structure
 * @param {Object} data - Project data to validate
 * @returns {boolean} True if valid
 */
function validateProjectJson(data) {
  const requiredFields = ['projectId', 'projectName', 'projectPath', 'metadata'];
  return requiredFields.every(field => data.hasOwnProperty(field));
}

/**
 * Creates a file lock for concurrent access protection
 * @param {string} filePath - Path to lock
 * @returns {Promise<string>} Lock file path
 */
async function createLock(filePath) {
  const lockPath = `${filePath}.lock`;
  const lockTimeout = 5000; // 5 seconds
  const startTime = Date.now();
  
  while (existsSync(lockPath)) {
    if (Date.now() - startTime > lockTimeout) {
      throw new Error(`Lock timeout for ${filePath}`);
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  await fs.writeFile(lockPath, process.pid.toString());
  return lockPath;
}

/**
 * Removes a file lock
 * @param {string} lockPath - Lock file path to remove
 */
async function removeLock(lockPath) {
  try {
    await fs.unlink(lockPath);
  } catch (error) {
    logger.warn(`Failed to remove lock ${lockPath}:`, error.message);
  }
}

/**
 * Reads project.json from .kibitz/api/ subdirectory
 * @param {string} projectPath - Path to the project directory
 * @returns {Promise<Object>} Project data object
 * @throws {Error} If file doesn't exist or is invalid
 */
export async function readProjectJson(projectPath) {
  const jsonPath = path.join(projectPath, '.kibitz', 'api', 'project.json');
  
  logger.debug(`Reading project.json from: ${jsonPath}`);
  
  if (!await validatePath(jsonPath)) {
    throw new Error(`Project JSON file not found: ${jsonPath}`);
  }
  
  try {
    const content = await fs.readFile(jsonPath, 'utf8');
    const data = safeJsonParse(content, jsonPath);
    
    if (!validateProjectJson(data)) {
      throw new Error(`Invalid project.json structure in ${jsonPath}`);
    }
    
    logger.debug(`Successfully read project.json for project: ${data.projectId}`);
    return data;
  } catch (error) {
    logger.error(`Failed to read project.json from ${jsonPath}:`, error.message);
    throw error;
  }
}

/**
 * Derive project identity (id and name) from a project path
 * Directory format: {projectId}_{projectName}
 */
function deriveProjectIdentity(projectPath) {
  const dirName = path.basename(projectPath);
  const parts = dirName.split('_');
  const projectId = parts[0] || 'unknown';
  const projectName = parts.length > 1 ? parts.slice(1).join('_') : 'project';
  return { projectId, projectName };
}

/**
 * Creates a minimal, valid project.json structure in memory
 */
function buildDefaultProjectData(projectPath) {
  const { projectId, projectName } = deriveProjectIdentity(projectPath);
  const now = Date.now();
  return {
    // Basic git-like fields (placeholders)
    commit_hash: 'unknown',
    branch: 'main',
    author: 'Unknown',
    date: new Date(now).toISOString(),
    message: 'Initialized project metadata',
    remote_url: null,
    is_dirty: false,

    // Required project info
    projectId,
    projectName,
    projectPath,

    // Minimal repository and branches info
    repository: {
      defaultBranch: 'main',
      totalBranches: 0,
      totalCommits: 0,
      lastActivity: now,
      size: 0,
      languages: {}
    },
    branches: [],
    conversations: [],

    // v2 schema sections with defaults
    github: { ...DEFAULT_GITHUB_CONFIG },
    sync: { ...DEFAULT_SYNC_CONFIG },

    metadata: {
      generated: now,
      version: '2.0',
      source: 'auto-init'
    }
  };
}

/**
 * Writes updated project.json with proper formatting and locking
 * @param {string} projectPath - Path to the project directory
 * @param {Object} data - Project data to write
 * @returns {Promise<void>}
 * @throws {Error} If write operation fails
 */
export async function writeProjectJson(projectPath, data) {
  const jsonPath = path.join(projectPath, '.kibitz', 'api', 'project.json');
  let lockPath;
  
  logger.debug(`Writing project.json to: ${jsonPath}`);
  
  try {
    // Ensure directory exists
    await ensureKibitzDirectory(projectPath);
    
    // Validate data structure
    if (!validateProjectJson(data)) {
      throw new Error('Invalid project data structure');
    }
    
    // Create lock for concurrent access protection
    lockPath = await createLock(jsonPath);
    
    // Update metadata
    data.metadata = {
      ...data.metadata,
      generated: Date.now(),
      version: data.metadata?.version || '2.0'
    };
    
    // Write with proper formatting
    const jsonContent = JSON.stringify(data, null, 2);
    await fs.writeFile(jsonPath, jsonContent, 'utf8');
    
    logger.debug(`Successfully wrote project.json for project: ${data.projectId}`);
  } catch (error) {
    logger.error(`Failed to write project.json to ${jsonPath}:`, error.message);
    throw error;
  } finally {
    if (lockPath) {
      await removeLock(lockPath);
    }
  }
}

/**
 * Updates just the GitHub configuration section
 * @param {string} projectPath - Path to the project directory
 * @param {Object} config - GitHub configuration object
 * @returns {Promise<void>}
 * @throws {Error} If update fails
 */
export async function updateGitHubConfig(projectPath, config) {
  logger.debug(`Updating GitHub config for project: ${projectPath}`);
  
  try {
    let data;
    try {
      data = await readProjectJson(projectPath);
    } catch (readErr) {
      // If project.json doesn't exist or is invalid, initialize a minimal valid one
      logger.warn(`project.json missing or invalid at ${projectPath}, creating a default one:`, readErr?.message || readErr);
      await ensureKibitzDirectory(projectPath);
      data = buildDefaultProjectData(projectPath);
    }
    
    // Merge with existing GitHub config
    data.github = {
      ...DEFAULT_GITHUB_CONFIG,
      ...data.github,
      ...config
    };
    
    await writeProjectJson(projectPath, data);
    logger.info(`Updated GitHub config for project: ${data.projectId}`);
  } catch (error) {
    logger.error(`Failed to update GitHub config for ${projectPath}:`, error.message);
    throw error;
  }
}

/**
 * Updates sync status field
 * @param {string} projectPath - Path to the project directory
 * @param {string} status - New sync status ('idle' | 'syncing' | 'error' | 'disabled')
 * @returns {Promise<void>}
 * @throws {Error} If update fails
 */
export async function updateSyncStatus(projectPath, status) {
  const validStatuses = ['idle', 'syncing', 'error', 'disabled'];
  
  if (!validStatuses.includes(status)) {
    throw new Error(`Invalid sync status: ${status}. Must be one of: ${validStatuses.join(', ')}`);
  }
  
  logger.debug(`Updating sync status to '${status}' for project: ${projectPath}`);
  
  try {
    const data = await readProjectJson(projectPath);
    
    // Ensure sync object exists
    if (!data.sync) {
      data.sync = { ...DEFAULT_SYNC_CONFIG };
    }
    
    // Ensure github object exists
    if (!data.github) {
      data.github = { ...DEFAULT_GITHUB_CONFIG };
    }
    
    data.github.syncStatus = status;
    data.sync.lastAttempt = Date.now();
    
    await writeProjectJson(projectPath, data);
    logger.info(`Updated sync status to '${status}' for project: ${data.projectId}`);
  } catch (error) {
    logger.error(`Failed to update sync status for ${projectPath}:`, error.message);
    throw error;
  }
}

/**
 * Updates specific branch's sync information
 * @param {string} projectPath - Path to the project directory
 * @param {string} branchName - Name of the branch to update
 * @param {Object} syncData - Sync data object { lastPushed?, pushedHash?, needsSync?, syncError? }
 * @returns {Promise<void>}
 * @throws {Error} If update fails
 */
export async function updateBranchSyncStatus(projectPath, branchName, syncData) {
  logger.debug(`Updating branch sync status for '${branchName}' in project: ${projectPath}`);
  
  try {
    const data = await readProjectJson(projectPath);
    
    // Find the branch
    const branchIndex = data.branches.findIndex(branch => branch.branchName === branchName);
    
    if (branchIndex === -1) {
      throw new Error(`Branch '${branchName}' not found in project`);
    }
    
    // Ensure branch has sync object
    if (!data.branches[branchIndex].sync) {
      data.branches[branchIndex].sync = { ...DEFAULT_BRANCH_SYNC };
    }
    
    // Update sync data
    data.branches[branchIndex].sync = {
      ...data.branches[branchIndex].sync,
      ...syncData
    };
    
    await writeProjectJson(projectPath, data);
    logger.info(`Updated sync status for branch '${branchName}' in project: ${data.projectId}`);
  } catch (error) {
    logger.error(`Failed to update branch sync status for ${projectPath}:`, error.message);
    throw error;
  }
}

/**
 * Scans all project directories and returns those with GitHub enabled
 * @returns {Promise<Array>} Array of project objects with GitHub enabled
 * @throws {Error} If scanning fails
 */
export async function getAllProjectsWithGitHub() {
  logger.debug(`Scanning projects directory: ${BASE_PROJECTS_DIR}`);
  
  try {
    if (!await validatePath(BASE_PROJECTS_DIR)) {
      throw new Error(`Projects directory not found: ${BASE_PROJECTS_DIR}`);
    }
    
    const entries = await fs.readdir(BASE_PROJECTS_DIR, { withFileTypes: true });
    const projectDirs = entries.filter(entry => entry.isDirectory()).map(entry => entry.name);
    
    const githubProjects = [];
    
    for (const dirName of projectDirs) {
      const projectPath = path.join(BASE_PROJECTS_DIR, dirName);
      const jsonPath = path.join(projectPath, '.kibitz', 'api', 'project.json');
      
      try {
        if (await validatePath(jsonPath)) {
          const data = await readProjectJson(projectPath);
          
          if (data.github?.enabled) {
            githubProjects.push({
              ...data,
              directoryName: dirName,
              fullPath: projectPath
            });
          }
        }
      } catch (error) {
        logger.warn(`Skipping invalid project ${dirName}:`, error.message);
      }
    }
    
    logger.info(`Found ${githubProjects.length} projects with GitHub enabled`);
    return githubProjects;
  } catch (error) {
    logger.error(`Failed to scan projects directory:`, error.message);
    throw error;
  }
}

/**
 * Creates .kibitz/api/ directory structure if it doesn't exist
 * @param {string} projectPath - Path to the project directory
 * @returns {Promise<void>}
 * @throws {Error} If directory creation fails
 */
export async function ensureKibitzDirectory(projectPath) {
  const kibitzPath = path.join(projectPath, '.kibitz');
  const apiPath = path.join(kibitzPath, 'api');
  
  logger.debug(`Ensuring .kibitz/api/ directory exists: ${apiPath}`);
  
  try {
    await fs.mkdir(apiPath, { recursive: true });
    logger.debug(`Created directory structure: ${apiPath}`);
  } catch (error) {
    logger.error(`Failed to create .kibitz/api/ directory:`, error.message);
    throw error;
  }
}

/**
 * Migrates existing project.json files to version 2 with GitHub fields
 * @param {string} projectPath - Path to the project directory
 * @returns {Promise<boolean>} True if migration was performed, false if already up to date
 * @throws {Error} If migration fails
 */
export async function migrateProjectToV2(projectPath) {
  logger.debug(`Checking migration status for project: ${projectPath}`);
  
  try {
    const data = await readProjectJson(projectPath);
    
    // Check if already migrated
    if (data.metadata?.version === '2.0' && data.github && data.sync) {
      logger.debug(`Project already migrated to v2: ${data.projectId}`);
      return false;
    }
    
    logger.info(`Migrating project to v2: ${data.projectId}`);
    
    // Add GitHub configuration if missing
    if (!data.github) {
      data.github = { ...DEFAULT_GITHUB_CONFIG };
    }
    
    // Add sync configuration if missing
    if (!data.sync) {
      data.sync = { ...DEFAULT_SYNC_CONFIG };
    }
    
    // Add sync info to branches if missing
    if (data.branches && Array.isArray(data.branches)) {
      data.branches = data.branches.map(branch => ({
        ...branch,
        sync: branch.sync || { ...DEFAULT_BRANCH_SYNC }
      }));
    }
    
    // Update metadata version
    data.metadata = {
      ...data.metadata,
      version: '2.0',
      migrated: Date.now()
    };
    
    await writeProjectJson(projectPath, data);
    logger.info(`Successfully migrated project to v2: ${data.projectId}`);
    return true;
  } catch (error) {
    logger.error(`Failed to migrate project ${projectPath}:`, error.message);
    throw error;
  }
}

/**
 * Utility function to get project directory from conversation ID and project name
 * @param {string} conversationId - Conversation identifier
 * @param {string} projectName - Project name
 * @returns {string} Full project path
 */
export function getProjectPath(conversationId, projectName) {
  return path.join(BASE_PROJECTS_DIR, `${conversationId}_${projectName}`);
}

/**
 * Utility function to parse project directory name
 * @param {string} dirName - Directory name in format {conversationId}_{projectName}
 * @returns {Object} Object with conversationId and projectName
 */
export function parseProjectDirectoryName(dirName) {
  const parts = dirName.split('_');
  if (parts.length < 2) {
    throw new Error(`Invalid project directory name format: ${dirName}`);
  }
  
  return {
    conversationId: parts[0],
    projectName: parts.slice(1).join('_') // Handle project names with underscores
  };
}

// Export default configuration objects for external use
export {
  DEFAULT_GITHUB_CONFIG,
  DEFAULT_SYNC_CONFIG,
  DEFAULT_BRANCH_SYNC,
  BASE_PROJECTS_DIR
}; 