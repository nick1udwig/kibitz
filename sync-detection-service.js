import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import {
  readProjectJson,
  updateBranchSyncStatus,
  getAllProjectsWithGitHub,
  BASE_PROJECTS_DIR
} from './project-json-manager.js';

const execAsync = promisify(exec);

/**
 * Logger utility for debugging
 */
const logger = {
  info: (msg, ...args) => console.log(`[SYNC-DETECT] ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[SYNC-DETECT] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[SYNC-DETECT] ${msg}`, ...args),
  debug: (msg, ...args) => process.env.DEBUG && console.log(`[SYNC-DETECT] ${msg}`, ...args)
};

/**
 * Executes a git command in the specified directory
 * @param {string} command - Git command to execute
 * @param {string} cwd - Working directory
 * @returns {Promise<string>} Command output
 */
async function execGit(command, cwd) {
  try {
    logger.debug(`Executing git command: ${command} in ${cwd}`);
    const { stdout, stderr } = await execAsync(`git ${command}`, { 
      cwd,
      timeout: 10000 // 10 second timeout
    });
    
    if (stderr && !stderr.includes('warning')) {
      logger.warn(`Git stderr: ${stderr}`);
    }
    
    return stdout.trim();
  } catch (error) {
    logger.debug(`Git command failed: ${error.message}`);
    throw new Error(`Git command failed: ${command} - ${error.message}`);
  }
}

/**
 * Checks if a git repository exists and is valid
 * @param {string} projectPath - Path to check
 * @returns {Promise<boolean>}
 */
async function isValidGitRepo(projectPath) {
  try {
    await execGit('rev-parse --git-dir', projectPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Gets the current branch name
 * @param {string} projectPath - Project directory path
 * @returns {Promise<string>} Current branch name
 */
async function getCurrentBranch(projectPath) {
  try {
    return await execGit('branch --show-current', projectPath);
  } catch {
    // Fallback for detached HEAD or other issues
    try {
      const output = await execGit('rev-parse --abbrev-ref HEAD', projectPath);
      return output === 'HEAD' ? 'detached' : output;
    } catch {
      return 'unknown';
    }
  }
}

/**
 * Gets the latest commit hash for a branch
 * @param {string} projectPath - Project directory path
 * @param {string} branchName - Branch name
 * @returns {Promise<string|null>} Commit hash or null if branch doesn't exist
 */
async function getLatestCommitHash(projectPath, branchName) {
  try {
    return await execGit(`rev-parse ${branchName}`, projectPath);
  } catch {
    return null;
  }
}

/**
 * Gets list of commits between two references
 * @param {string} projectPath - Project directory path
 * @param {string} fromRef - Starting reference (exclusive)
 * @param {string} toRef - Ending reference (inclusive)
 * @returns {Promise<Array>} Array of commit objects
 */
async function getCommitsBetween(projectPath, fromRef, toRef) {
  try {
    // Use fromRef..toRef to get commits from fromRef to toRef (exclusive..inclusive)
    const range = fromRef ? `${fromRef}..${toRef}` : toRef;
    const output = await execGit(`log ${range} --pretty=format:"%H|%s|%an|%ad" --date=iso`, projectPath);
    
    if (!output) {
      return [];
    }
    
    return output.split('\n').map(line => {
      const [hash, message, author, date] = line.split('|');
      return {
        hash: hash.replace(/"/g, ''),
        message: message.replace(/"/g, ''),
        author: author.replace(/"/g, ''),
        date: new Date(date.replace(/"/g, ''))
      };
    });
  } catch {
    return [];
  }
}

/**
 * Checks if a branch name matches a pattern (supports wildcards)
 * @param {string} branchName - Branch name to test
 * @param {string} pattern - Pattern with optional wildcards (*, ?)
 * @returns {boolean} True if branch matches pattern
 */
function matchesBranchPattern(branchName, pattern) {
  // Convert glob pattern to regex
  const regexPattern = pattern
    .replace(/\*/g, '.*')  // * matches any characters
    .replace(/\?/g, '.')   // ? matches single character
    .replace(/\./g, '\\.')  // Escape literal dots
    .replace(/\+/g, '\\+'); // Escape literal plus signs
  
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(branchName);
}

/**
 * Detects pending changes by comparing local commits vs last pushed hashes
 * @param {string} projectPath - Path to the project directory
 * @returns {Promise<Object>} Object with branch sync status and pending commits
 */
export async function detectPendingChanges(projectPath) {
  logger.debug(`Detecting pending changes for project: ${projectPath}`);
  
  try {
    // Check if it's a valid git repository
    if (!await isValidGitRepo(projectPath)) {
      throw new Error('Not a valid git repository');
    }
    
    // Read project data
    const projectData = await readProjectJson(projectPath);
    
    if (!projectData.branches || !Array.isArray(projectData.branches)) {
      throw new Error('No branches found in project data');
    }
    
    const results = {
      projectId: projectData.projectId,
      projectPath,
      branches: [],
      totalPendingCommits: 0,
      hasChanges: false
    };
    
    // Check each branch for pending changes
    for (const branchInfo of projectData.branches) {
      const branchName = branchInfo.branchName;
      const lastPushedHash = branchInfo.sync?.pushedHash;
      
      try {
        // Get current commit hash for this branch
        const currentHash = await getLatestCommitHash(projectPath, branchName);
        
        if (!currentHash) {
          logger.warn(`Branch ${branchName} not found in git repository`);
          continue;
        }
        
        // If no previous push, all commits are pending
        const pendingCommits = lastPushedHash 
          ? await getCommitsBetween(projectPath, lastPushedHash, currentHash)
          : await getCommitsBetween(projectPath, null, currentHash);
        
        const needsSync = pendingCommits.length > 0 || currentHash !== lastPushedHash;
        
        const branchResult = {
          branchName,
          currentHash,
          lastPushedHash,
          needsSync,
          pendingCommits: pendingCommits.length,
          commits: pendingCommits.slice(0, 5), // Only include first 5 commits for performance
          syncError: branchInfo.sync?.syncError || null
        };
        
        results.branches.push(branchResult);
        results.totalPendingCommits += pendingCommits.length;
        
        if (needsSync) {
          results.hasChanges = true;
        }
        
        logger.debug(`Branch ${branchName}: ${pendingCommits.length} pending commits`);
        
      } catch (error) {
        logger.warn(`Failed to check branch ${branchName}:`, error.message);
        results.branches.push({
          branchName,
          currentHash: null,
          lastPushedHash,
          needsSync: false,
          pendingCommits: 0,
          commits: [],
          syncError: error.message
        });
      }
    }
    
    logger.info(`Project ${projectData.projectId}: ${results.totalPendingCommits} total pending commits across ${results.branches.length} branches`);
    return results;
    
  } catch (error) {
    logger.error(`Failed to detect pending changes for ${projectPath}:`, error.message);
    throw error;
  }
}

/**
 * Filters branches based on syncBranches patterns (supports wildcards)
 * @param {Object} projectData - Project data from JSON
 * @returns {Array} Array of branch names that should be synced
 */
export function getBranchesToSync(projectData) {
  logger.debug(`Filtering branches to sync for project: ${projectData.projectId}`);
  
  try {
    if (!projectData.github?.syncBranches || !Array.isArray(projectData.github.syncBranches)) {
      logger.warn('No syncBranches configuration found');
      return [];
    }
    
    if (!projectData.branches || !Array.isArray(projectData.branches)) {
      logger.warn('No branches found in project data');
      return [];
    }
    
    const patterns = projectData.github.syncBranches;
    const branchesToSync = [];
    
    for (const branch of projectData.branches) {
      const branchName = branch.branchName;
      
      // Check if branch matches any of the sync patterns
      const shouldSync = patterns.some(pattern => matchesBranchPattern(branchName, pattern));
      
      if (shouldSync) {
        branchesToSync.push(branchName);
        logger.debug(`Branch ${branchName} matches sync patterns`);
      } else {
        logger.debug(`Branch ${branchName} does not match sync patterns`);
      }
    }
    
    logger.info(`Project ${projectData.projectId}: ${branchesToSync.length} branches marked for sync`);
    return branchesToSync;
    
  } catch (error) {
    logger.error(`Failed to filter branches for sync:`, error.message);
    return [];
  }
}

/**
 * Checks if project has recent activity within sync threshold
 * @param {Object} projectData - Project data from JSON
 * @returns {boolean} True if project has recent activity
 */
export function hasRecentActivity(projectData) {
  try {
    const syncInterval = projectData.github?.syncInterval || 300000; // Default 5 minutes
    const lastActivity = projectData.lastActivity || 0;
    const threshold = Date.now() - syncInterval;
    
    const isRecent = lastActivity > threshold;
    
    logger.debug(`Project ${projectData.projectId}: last activity ${new Date(lastActivity).toISOString()}, threshold ${new Date(threshold).toISOString()}, recent: ${isRecent}`);
    
    return isRecent;
    
  } catch (error) {
    logger.error(`Failed to check recent activity:`, error.message);
    return false;
  }
}

/**
 * Marks a specific branch as needing sync
 * @param {string} projectPath - Path to the project directory
 * @param {string} branchName - Name of the branch to mark
 * @param {string} [reason] - Optional reason for marking (for syncError field)
 * @returns {Promise<void>}
 */
export async function markBranchForSync(projectPath, branchName, reason = null) {
  logger.debug(`Marking branch ${branchName} for sync in project: ${projectPath}`);
  
  try {
    const syncData = {
      needsSync: true,
      syncError: reason
    };
    
    await updateBranchSyncStatus(projectPath, branchName, syncData);
    logger.info(`Marked branch ${branchName} for sync${reason ? ` (${reason})` : ''}`);
    
  } catch (error) {
    logger.error(`Failed to mark branch ${branchName} for sync:`, error.message);
    throw error;
  }
}

/**
 * Gets all projects with pending changes that need syncing
 * @param {Object} options - Configuration options
 * @param {boolean} options.checkRecentActivity - Only include projects with recent activity
 * @param {boolean} options.enabledOnly - Only check GitHub-enabled projects
 * @returns {Promise<Array>} Array of projects with pending changes
 */
export async function getAllPendingProjects(options = {}) {
  const {
    checkRecentActivity = true,
    enabledOnly = true
  } = options;
  
  logger.info('Scanning all projects for pending changes...');
  
  try {
    // Get all GitHub projects
    const allProjects = await getAllProjectsWithGitHub();
    
    // Filter to only enabled projects if requested
    const projectsToCheck = enabledOnly 
      ? allProjects.filter(project => project.github?.enabled)
      : allProjects;
    
    const pendingProjects = [];
    
    for (const project of projectsToCheck) {
      try {
        logger.debug(`Checking project: ${project.projectId}`);
        
        // Skip if checking recent activity and project is not recently active
        if (checkRecentActivity && !hasRecentActivity(project)) {
          logger.debug(`Skipping ${project.projectId} - no recent activity`);
          continue;
        }
        
        // Get branches that should be synced
        const branchesToSync = getBranchesToSync(project);
        
        if (branchesToSync.length === 0) {
          logger.debug(`Skipping ${project.projectId} - no branches configured for sync`);
          continue;
        }
        
        // Detect pending changes
        const changeResults = await detectPendingChanges(project.fullPath);
        
        // Filter results to only include branches that should be synced
        const filteredBranches = changeResults.branches.filter(branch => 
          branchesToSync.includes(branch.branchName) && branch.needsSync
        );
        
        if (filteredBranches.length > 0) {
          const totalPending = filteredBranches.reduce((sum, branch) => sum + branch.pendingCommits, 0);
          
          pendingProjects.push({
            ...changeResults,
            branches: filteredBranches,
            totalPendingCommits: totalPending,
            hasChanges: true,
            syncBranches: branchesToSync,
            githubConfig: project.github
          });
          
          logger.info(`Project ${project.projectId}: ${filteredBranches.length} branches need sync (${totalPending} commits)`);
        } else {
          logger.debug(`Project ${project.projectId}: no pending changes`);
        }
        
      } catch (error) {
        logger.warn(`Failed to check project ${project.projectId}:`, error.message);
      }
    }
    
    logger.info(`Found ${pendingProjects.length} projects with pending changes`);
    return pendingProjects;
    
  } catch (error) {
    logger.error('Failed to get all pending projects:', error.message);
    throw error;
  }
}

/**
 * Updates branch sync status based on detection results
 * @param {string} projectPath - Path to the project directory
 * @param {Array} detectionResults - Results from detectPendingChanges
 * @returns {Promise<void>}
 */
export async function updateBranchSyncFlags(projectPath, detectionResults) {
  logger.debug(`Updating branch sync flags for project: ${projectPath}`);
  
  try {
    for (const branch of detectionResults.branches) {
      if (branch.needsSync !== undefined) {
        await updateBranchSyncStatus(projectPath, branch.branchName, {
          needsSync: branch.needsSync,
          syncError: branch.syncError
        });
      }
    }
    
    logger.info(`Updated sync flags for ${detectionResults.branches.length} branches`);
    
  } catch (error) {
    logger.error(`Failed to update branch sync flags:`, error.message);
    throw error;
  }
}

/**
 * Utility function to get a summary of sync status across all projects
 * @returns {Promise<Object>} Summary statistics
 */
export async function getSyncSummary() {
  logger.info('Generating sync summary...');
  
  try {
    const allProjects = await getAllProjectsWithGitHub();
    const pendingProjects = await getAllPendingProjects();
    
    const summary = {
      totalProjects: allProjects.length,
      enabledProjects: allProjects.filter(p => p.github?.enabled).length,
      projectsWithPendingChanges: pendingProjects.length,
      totalPendingCommits: pendingProjects.reduce((sum, p) => sum + p.totalPendingCommits, 0),
      branchesNeedingSync: pendingProjects.reduce((sum, p) => sum + p.branches.length, 0),
      recentlyActiveProjects: allProjects.filter(hasRecentActivity).length,
      lastScanned: new Date().toISOString()
    };
    
    logger.info('Sync Summary:', summary);
    return summary;
    
  } catch (error) {
    logger.error('Failed to generate sync summary:', error.message);
    throw error;
  }
}

// Export utility functions
export {
  matchesBranchPattern,
  getCurrentBranch,
  getLatestCommitHash,
  isValidGitRepo
}; 