/**
 * Branch Service
 * 
 * Intelligent Git branch management system that automatically creates branches
 * based on file changes and provides safe revert capabilities.
 */

import { executeGitCommand } from './gitService';

/**
 * Creates simple commit-focused JSON files for API
 * 🎯 SIMPLE APPROACH: Direct filesystem operations - no complex tools
 */
export async function createProjectJSONFiles(
  projectPath: string,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<void> {
  try {
    console.log('📋 createProjectJSONFiles: Creating simple commit-focused JSON...');
    console.log(`📋 createProjectJSONFiles: Project path: ${projectPath}`);
    
    // Extract project ID from path (format: projectId_projectName)
    const pathParts = projectPath.split('/');
    const dirName = pathParts[pathParts.length - 1];
    const projectIdMatch = dirName.match(/^([a-zA-Z0-9]+)_/);
    const projectId = projectIdMatch ? projectIdMatch[1] : 'unknown';
    
    console.log(`📋 createProjectJSONFiles: Extracted project ID: ${projectId} from directory: ${dirName}`);
    
    // 🚀 GET REAL GIT DATA - commit hash, branch, author, date, message
    console.log(`📋 createProjectJSONFiles: Fetching git log data...`);
    const gitLogResult = await executeGitCommand(
      serverId,
      'git log -1 --pretty=format:"%H|%s|%an|%ct"',
      projectPath,
      executeTool
    );
    
    console.log(`📋 createProjectJSONFiles: Fetching current branch...`);
    const gitBranchResult = await executeGitCommand(
      serverId,
      'git branch --show-current',
      projectPath,
      executeTool
    );
    
    console.log(`📋 createProjectJSONFiles: Git log result:`, {
      success: gitLogResult.success,
      output: gitLogResult.output?.substring(0, 100) + '...'
    });
    console.log(`📋 createProjectJSONFiles: Git branch result:`, {
      success: gitBranchResult.success,
      output: gitBranchResult.output
    });
    
    // Parse git data
    let commitHash = 'abc123def456...';
    let commitMessage = 'Add login feature';
    let author = 'johndoe';
    let date = '2025-07-18T14:32:00Z';
    let branch = 'feature/login';
    
    if (gitLogResult.success && gitLogResult.output) {
      const [fullHash, message, authorName, unixTimestamp] = gitLogResult.output.split('|');
      commitHash = fullHash || commitHash;
      commitMessage = message || commitMessage;
      author = authorName || author;
      
      // Convert unix timestamp to ISO format
      const timestamp = parseInt(unixTimestamp) * 1000;
      date = new Date(timestamp).toISOString();
      
      console.log(`📋 createProjectJSONFiles: Parsed real git data:`, {
        commitHash: commitHash.substring(0, 12) + '...',
        author,
        message: commitMessage.substring(0, 50) + '...',
        timestamp: date
      });
    } else {
      console.log(`📋 createProjectJSONFiles: Using fallback git data (no real git log found)`);
    }
    
    if (gitBranchResult.success && gitBranchResult.output) {
      branch = gitBranchResult.output.trim();
      console.log(`📋 createProjectJSONFiles: Using real branch name: ${branch}`);
    } else {
      console.log(`📋 createProjectJSONFiles: Using fallback branch name: ${branch}`);
    }
    
    // 📝 CREATE SIMPLE PROJECT DATA (matching your image format)
    const projectData = {
      commit_hash: commitHash,
      branch: branch,
      author: author,
      date: date,
      message: commitMessage,
      remote_url: null, // Placeholder as requested
      is_dirty: false
    };
    
    console.log(`✅ createProjectJSONFiles: Final project data prepared:`, {
      commit_hash: projectData.commit_hash.substring(0, 12) + '...',
      branch: projectData.branch,
      author: projectData.author,
      message: projectData.message.substring(0, 30) + '...'
    });
    
    // 🚀 SERVER-SIDE FILESYSTEM APPROACH - Only works in Node.js environment
    if (typeof window === 'undefined') {
      // We're in Node.js environment (server-side)
      const fs = await import('fs');
      const path = await import('path');
      
      const kibitzDir = path.join(projectPath, '.kibitz', 'api');
      const jsonFilePath = path.join(kibitzDir, 'project.json');
      
      console.log(`📋 createProjectJSONFiles: Creating directory: ${kibitzDir}`);
      
      // Create directory synchronously - guaranteed to work
      try {
        fs.mkdirSync(kibitzDir, { recursive: true });
        console.log(`✅ createProjectJSONFiles: Directory created successfully: ${kibitzDir}`);
      } catch (dirError) {
        console.error(`❌ createProjectJSONFiles: Failed to create directory:`, dirError);
        throw dirError;
      }
      
      // Write file synchronously - guaranteed to work
      try {
        fs.writeFileSync(jsonFilePath, JSON.stringify(projectData, null, 2), 'utf8');
        console.log(`✅ createProjectJSONFiles: File written successfully: ${jsonFilePath}`);
      } catch (writeError) {
        console.error(`❌ createProjectJSONFiles: Failed to write file:`, writeError);
        throw writeError;
      }
      
      // Verify file exists
      if (fs.existsSync(jsonFilePath)) {
        const fileStats = fs.statSync(jsonFilePath);
        console.log(`✅ createProjectJSONFiles: File verification successful:`, {
          path: jsonFilePath,
          size: fileStats.size + ' bytes',
          created: fileStats.birthtime
        });
      } else {
        console.error(`❌ createProjectJSONFiles: File verification failed - file not found`);
      }
      
      console.log(`✅ createProjectJSONFiles: Simple JSON successfully created for project ${projectId}`);
      console.log(`✅ createProjectJSONFiles: File location: ${jsonFilePath}`);
      
    } else {
      // We're in browser environment - fall back to tool-based approach
      console.log(`📋 createProjectJSONFiles: Browser environment detected - using tool-based file creation`);
      
      const fullJsonPath = `${projectPath}/.kibitz/api/project.json`;
      
      // Create directory first
      await executeTool(serverId, 'BashCommand', {
        action_json: {
          command: `mkdir -p "${projectPath}/.kibitz/api"`,
          type: 'command'
        },
        thread_id: 'git-operations'
      });
      
      // Write file using echo
      await executeTool(serverId, 'BashCommand', {
        action_json: {
          command: `echo '${JSON.stringify(projectData, null, 2)}' > "${fullJsonPath}"`,
          type: 'command'
        },
        thread_id: 'git-operations'
      });
      
      console.log(`✅ createProjectJSONFiles: File created via tools: ${fullJsonPath}`);
    }
    
  } catch (error) {
    console.error('❌ createProjectJSONFiles: Failed to create simple JSON:', error);
    console.error('❌ createProjectJSONFiles: Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : 'No stack trace'
    });
  }
}

/**
 * Extract language statistics from file list
 */
export function getLanguageStats(files: string[]): Record<string, number> {
  const stats: Record<string, number> = {};
  
  files.forEach(file => {
    const ext = file.split('.').pop()?.toLowerCase();
    if (ext) {
      stats[ext] = (stats[ext] || 0) + 1;
    }
  });
  
  return stats;
}

/**
 * Branch types for automatic classification
 */
export type BranchType = 'feature' | 'bugfix' | 'iteration' | 'experiment';

/**
 * Change detection result
 */
export interface ChangeDetectionResult {
  filesChanged: number;
  changedFiles: string[];
  linesAdded: number;
  linesRemoved: number;
  shouldCreateBranch: boolean;
  suggestedBranchType: BranchType;
  suggestedBranchName: string;
  description: string;
}

/**
 * Branch metadata
 */
export interface BranchInfo {
  name: string;
  type: BranchType;
  createdAt: Date;
  parentBranch: string;
  commitHash: string;
  description: string;
  filesChanged: string[];
  isActive: boolean;
}

/**
 * Revert options
 */
export interface RevertOptions {
  targetBranch?: string;
  targetCommit?: string;
  createBackupBranch?: boolean;
  backupBranchName?: string;
}

/**
 * Detects changes in the working directory and suggests branch creation
 */
export const detectChanges = async (
  projectPath: string,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<ChangeDetectionResult> => {
  try {
    console.log('🔍 detectChanges: Starting change detection for path:', projectPath);
    
    // Get git status to see what files have changed
    const statusResult = await executeGitCommand(
      serverId,
      'git status --porcelain',
      projectPath,
      executeTool
    );
    
    console.log('📋 detectChanges: Git status result:', statusResult);
    
    if (!statusResult.success) {
      console.error('❌ detectChanges: Failed to get git status:', statusResult.error);
      return {
        filesChanged: 0,
        changedFiles: [],
        linesAdded: 0,
        linesRemoved: 0,
        shouldCreateBranch: false,
        suggestedBranchType: 'iteration',
        suggestedBranchName: '',
        description: 'Failed to detect changes'
      };
    }
    
    const statusOutput = statusResult.output.trim();
    console.log('📄 detectChanges: Raw git status output:', statusOutput);
    
    if (!statusOutput) {
      console.log('ℹ️ detectChanges: No changes detected in git status');
      return {
        filesChanged: 0,
        changedFiles: [],
        linesAdded: 0,
        linesRemoved: 0,
        shouldCreateBranch: false,
        suggestedBranchType: 'iteration',
        suggestedBranchName: '',
        description: 'No changes detected'
      };
    }
    
    // Parse the status output
    const statusLines = statusOutput.split('\n').filter(line => line.trim());
    console.log('📝 detectChanges: Status lines:', statusLines);
    
    const changedFiles = statusLines.map(line => {
      // Git status format: XY filename
      const status = line.substring(0, 2);
      const filename = line.substring(3);
      console.log('📂 detectChanges: File status:', { status, filename });
      return filename;
    });
    
    const filesChanged = changedFiles.length;
    console.log('📊 detectChanges: Files changed count:', filesChanged);
    console.log('📋 detectChanges: Changed files list:', changedFiles);
    
    // Get diff stats for line counts (skip heavy diff when only untracked files)
    let linesAdded = 0;
    let linesRemoved = 0;

    try {
      const onlyUntracked = statusLines.every(l => l.startsWith('??'));
      if (onlyUntracked) {
        // Cheap estimate: 5 lines per new file to avoid extra git diff calls
        linesAdded = filesChanged * 5;
        console.log('ℹ️ detectChanges: Only untracked files detected, skipping git diff. Estimated linesAdded:', linesAdded);
      } else {
        console.log('📈 detectChanges: Getting diff stats...');
        // Try staged first, then unstaged
        let diffResult = await executeGitCommand(
          serverId,
          'git diff --cached --numstat',
          projectPath,
          executeTool
        );
        if (diffResult.success && !diffResult.output.trim()) {
          diffResult = await executeGitCommand(
            serverId,
            'git diff --numstat',
            projectPath,
            executeTool
          );
        }
        if (diffResult.success && diffResult.output.trim()) {
          for (const line of diffResult.output.trim().split('\n')) {
            const parts = line.split('\t');
            if (parts.length >= 2) {
              linesAdded += parseInt(parts[0]) || 0;
              linesRemoved += parseInt(parts[1]) || 0;
            }
          }
        } else if (filesChanged > 0) {
          linesAdded = filesChanged * 5;
        }
      }
    } catch (diffError) {
      console.error('⚠️ detectChanges: Error getting diff stats:', diffError);
      if (filesChanged > 0) {
        linesAdded = filesChanged * 5;
      }
    }
    
    console.log('📈 detectChanges: Final stats - Files:', filesChanged, 'Lines added:', linesAdded, 'Lines removed:', linesRemoved);
    
    // Determine if we should create a branch - improved logic for meaningful changes
    const hasSignificantChanges = linesAdded + linesRemoved >= 10; // Lower line threshold for meaningful changes
    const hasSingleMeaningfulFile = filesChanged === 1 && (
      changedFiles.some(file => 
        file.endsWith('.py') || file.endsWith('.js') || file.endsWith('.ts') || 
        file.endsWith('.tsx') || file.endsWith('.jsx') || file.endsWith('.go') ||
        file.endsWith('.java') || file.endsWith('.cpp') || file.endsWith('.c') ||
        file.endsWith('.rs') || file.endsWith('.rb') || file.endsWith('.php') ||
        file.includes('README') || file.includes('config')
      ) && linesAdded + linesRemoved >= 5
    );
    
    const shouldCreateBranch = filesChanged >= 2 || hasSignificantChanges || hasSingleMeaningfulFile;
    
    const reason = filesChanged >= 2 ? 
      `${filesChanged} files changed (≥2)` :
      hasSignificantChanges ? 
        `${linesAdded + linesRemoved} lines changed (≥10)` :
        hasSingleMeaningfulFile ?
          `meaningful single file change (${changedFiles[0]}, ${linesAdded + linesRemoved} lines)` :
          `insufficient changes (${filesChanged} files, ${linesAdded + linesRemoved} lines)`;
    
    console.log('🎯 detectChanges: Should create branch:', shouldCreateBranch, `(${reason})`);
    
    // Suggest branch type based on file patterns and changes
    const suggestedBranchType = suggestBranchType(changedFiles, linesAdded, linesRemoved);
    const suggestedBranchName = generateBranchName(suggestedBranchType, changedFiles);

    return {
      filesChanged,
      changedFiles,
      linesAdded,
      linesRemoved,
      shouldCreateBranch,
      suggestedBranchType,
      suggestedBranchName,
      description: 'Change detection successful'
    };
  } catch (error) {
    console.error('Failed to detect changes:', error);
    return {
      filesChanged: 0,
      changedFiles: [],
      linesAdded: 0,
      linesRemoved: 0,
      shouldCreateBranch: false,
      suggestedBranchType: 'iteration',
      suggestedBranchName: '',
      description: 'Error detecting changes'
    };
  }
};

/**
 * Suggests branch type based on file patterns and change analysis
 */
export const suggestBranchType = (
  changedFiles: string[],
  linesAdded: number,
  linesRemoved: number
): BranchType => {
  // Analyze file patterns
  const hasTestFiles = changedFiles.some(file => 
    file.includes('test') || file.includes('spec') || file.endsWith('.test.ts') || file.endsWith('.spec.ts')
  );
  
  const hasDocFiles = changedFiles.some(file => 
    file.endsWith('.md') || file.includes('doc') || file.includes('README')
  );
  
  const hasConfigFiles = changedFiles.some(file => 
    file.includes('config') || file.endsWith('.json') || file.endsWith('.yml') || file.endsWith('.yaml')
  );
  
  const hasComponentFiles = changedFiles.some(file => 
    file.includes('component') || file.includes('Component') || file.endsWith('.tsx') || file.endsWith('.jsx')
  );

  // Analyze change magnitude
  const totalChanges = linesAdded + linesRemoved;
  const isLargeChange = totalChanges > 100;
  const isSmallChange = totalChanges < 20;

  // Classification logic
  if (hasTestFiles && !hasComponentFiles) {
    return 'bugfix'; // Test-only changes usually indicate bug fixes
  }
  
  if (hasDocFiles && isSmallChange) {
    return 'iteration'; // Documentation updates are iterations
  }
  
  if (hasConfigFiles && isSmallChange) {
    return 'iteration'; // Config changes are usually iterations
  }
  
  if (hasComponentFiles && isLargeChange) {
    return 'feature'; // Large component changes indicate new features
  }
  
  if (linesRemoved > linesAdded * 2) {
    return 'bugfix'; // More deletions than additions suggest bug fixes
  }
  
  if (isLargeChange) {
    return 'feature'; // Large changes are usually features
  }
  
  if (changedFiles.length === 1 && isSmallChange) {
    return 'bugfix'; // Single file, small change suggests bug fix
  }

  // Default to iteration for moderate changes
  return 'iteration';
};

/**
 * Generates a branch name based on type with date/time convention
 */
export const generateBranchName = (
  branchType: BranchType,
  changedFiles: string[]
): string => {
  const now = new Date();
  
  // Format: YYYY-MM-DD-HHMM
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  
  const timestamp = `${year}-${month}-${day}-${hours}${minutes}`;
  
  return `${branchType}/${timestamp}`;
};

/**
 * Creates a new branch with the given name and type
 */
export const createBranch = async (
  projectPath: string,
  branchName: string,
  branchType: BranchType,
  description: string,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<{ success: boolean; branchInfo?: BranchInfo; error?: string }> => {
  try {
    // Get current branch and commit
    const currentBranchResult = await executeGitCommand(
      serverId,
      'git branch --show-current',
      projectPath,
      executeTool
    );
    
    const currentCommitResult = await executeGitCommand(
      serverId,
      'git rev-parse HEAD',
      projectPath,
      executeTool
    );
    
    if (!currentBranchResult.success || !currentCommitResult.success) {
      return {
        success: false,
        error: 'Failed to get current Git state'
      };
    }
    
    const parentBranch = currentBranchResult.output.trim() || 'main';
    const commitHash = currentCommitResult.output.trim();
    
    // Create and checkout new branch
    const createBranchResult = await executeGitCommand(
      serverId,
      `git checkout -b ${branchName}`,
      projectPath,
      executeTool
    );
    
    if (!createBranchResult.success) {
      return {
        success: false,
        error: `Failed to create branch: ${createBranchResult.error || createBranchResult.output}`
      };
    }
    
    // Get changed files for metadata
    const statusResult = await executeGitCommand(
      serverId,
      'git status --porcelain',
      projectPath,
      executeTool
    );
    
    const changedFiles = statusResult.success 
      ? statusResult.output.split('\n').filter(line => line.trim()).map(line => line.substring(3))
      : [];
    
    const branchInfo: BranchInfo = {
      name: branchName,
      type: branchType,
      createdAt: new Date(),
      parentBranch,
      commitHash,
      description,
      filesChanged: changedFiles,
      isActive: true
    };
    
    console.log(`Successfully created ${branchType} branch: ${branchName}`);
    return { success: true, branchInfo };
    
  } catch (error) {
    console.error('Failed to create branch:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

/**
 * Lists all branches with their metadata
 */
export const listBranches = async (
  projectPath: string,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<BranchInfo[]> => {
  try {
    // Get all branches with commit info
    const branchResult = await executeGitCommand(
      serverId,
      'git branch -v --format="%(refname:short)|%(objectname)|%(committerdate:iso8601)|%(subject)"',
      projectPath,
      executeTool
    );
    
    if (!branchResult.success) {
      console.error('Failed to list branches:', branchResult.error);
      return [];
    }
    
    // Get current branch
    const currentBranchResult = await executeGitCommand(
      serverId,
      'git branch --show-current',
      projectPath,
      executeTool
    );
    
    const currentBranch = currentBranchResult.success ? currentBranchResult.output.trim() : '';
    
    const branches: BranchInfo[] = [];
    
    branchResult.output.split('\n').forEach(line => {
      if (!line.trim()) return;
      
      const parts = line.split('|');
      if (parts.length >= 4) {
        const name = parts[0].trim();
        const commitHash = parts[1].trim();
        const dateStr = parts[2].trim();
        const description = parts[3].trim();
        
        // Determine branch type from name
        let type: BranchType = 'iteration';
        if (name.startsWith('feature/')) type = 'feature';
        else if (name.startsWith('bugfix/')) type = 'bugfix';
        else if (name.startsWith('experiment/')) type = 'experiment';
        
        branches.push({
          name,
          type,
          createdAt: new Date(dateStr),
          parentBranch: 'main', // We'd need more complex logic to determine this
          commitHash,
          description,
          filesChanged: [], // Would need to calculate this
          isActive: name === currentBranch
        });
      }
    });
    
    return branches;
  } catch (error) {
    console.error('Failed to list branches:', error);
    return [];
  }
};

/**
 * Reverts to a specific branch or commit
 */
export const revertToState = async (
  projectPath: string,
  options: RevertOptions,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<{ success: boolean; backupBranch?: string; error?: string }> => {
  try {
    let backupBranch: string | undefined;
    
    // Create backup branch if requested
    if (options.createBackupBranch) {
      const timestamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '');
      backupBranch = options.backupBranchName || `backup/before-revert-${timestamp}`;
      
      const backupResult = await executeGitCommand(
        serverId,
        `git checkout -b ${backupBranch}`,
        projectPath,
        executeTool
      );
      
      if (!backupResult.success) {
        return {
          success: false,
          error: `Failed to create backup branch: ${backupResult.error}`
        };
      }
      
      console.log(`Created backup branch: ${backupBranch}`);
    }
    
    // Revert to target
    let revertCommand: string;
    if (options.targetBranch) {
      revertCommand = `git checkout ${options.targetBranch}`;
    } else if (options.targetCommit) {
      revertCommand = `git checkout ${options.targetCommit}`;
    } else {
      return {
        success: false,
        error: 'Must specify either targetBranch or targetCommit'
      };
    }
    
    const revertResult = await executeGitCommand(
      serverId,
      revertCommand,
      projectPath,
      executeTool
    );
    
    if (!revertResult.success) {
      return {
        success: false,
        error: `Failed to revert: ${revertResult.error || revertResult.output}`,
        backupBranch
      };
    }
    
    console.log(`Successfully reverted to ${options.targetBranch || options.targetCommit}`);
    return { success: true, backupBranch };
    
  } catch (error) {
    console.error('Failed to revert:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

/**
 * Automatically creates a branch if changes warrant it
 * 🚀 OPTIMIZED: Re-enabled with dynamic path support
 */
export const autoCreateBranchIfNeeded = async (
  projectPath: string,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<{ branchCreated: boolean; branchInfo?: BranchInfo; reason?: string }> => {
  try {
    console.log('🔍 autoCreateBranchIfNeeded: Checking if branch should be created...');
    
    const changeResult = await detectChanges(projectPath, serverId, executeTool);
    
    if (!changeResult.shouldCreateBranch) {
      return {
        branchCreated: false,
        reason: `Branch creation threshold not met: ${changeResult.filesChanged} files changed (need 2+) OR ${changeResult.linesAdded + changeResult.linesRemoved} lines changed (need 30+)`
      };
    }

    // 🚀 NEW: Check for existing auto branches from today first
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
    
    // Get all branches and check for existing auto branches from today
    const branchListResult = await executeGitCommand(
      serverId,
      'git branch -a',
      projectPath,
      executeTool
    );
    
    let existingAutoBranch: string | null = null;
    
    if (branchListResult.success) {
      const branches = branchListResult.output.split('\n').map(b => b.trim().replace(/^\*\s*/, ''));
      
      // Look for auto branches from today (format: auto/YYYYMMDD-HHMMSS)
      const todayAutoBranches = branches.filter(branch => 
        branch.startsWith(`auto/${today}`)
      ).sort().reverse(); // Most recent first
      
      if (todayAutoBranches.length > 0) {
        existingAutoBranch = todayAutoBranches[0];
        console.log(`🔄 autoCreateBranchIfNeeded: Found existing auto branch from today: ${existingAutoBranch}`);
      }
    }
    
    // Get current branch
    const currentBranchResult = await executeGitCommand(
      serverId,
      'git branch --show-current',
      projectPath,
      executeTool
    );
    
    const currentBranch = currentBranchResult.success ? currentBranchResult.output.trim() : 'main';
    let branchName: string = ''; // Initialize with default value
    let branchCreated = false;
    
    if (existingAutoBranch && existingAutoBranch !== currentBranch) {
      // Use existing auto branch - just switch to it
      branchName = existingAutoBranch;
      console.log(`🔄 autoCreateBranchIfNeeded: Switching to existing auto branch: ${branchName}`);
      
      const switchResult = await executeGitCommand(
        serverId,
        `git checkout ${branchName}`,
        projectPath,
        executeTool
      );
      
      if (!switchResult.success) {
        console.warn(`⚠️ autoCreateBranchIfNeeded: Failed to switch to existing branch, creating new one`);
        // Fall back to creating a new branch
        existingAutoBranch = null;
      } else {
        console.log(`✅ autoCreateBranchIfNeeded: Switched to existing auto branch: ${branchName}`);
      }
    }
    
    if (!existingAutoBranch) {
      // Create new auto branch only if no existing one found
      const now = new Date();
      const timestamp = now.toISOString()
        .slice(0, 19)
        .replace(/[-:]/g, '')
        .replace('T', '-');
      
      branchName = `auto/${timestamp}`;
      
      console.log(`🌿 autoCreateBranchIfNeeded: Creating NEW auto branch ${branchName} for ${changeResult.filesChanged} files changed`);
      
      // Create the new branch
      const createBranchResult = await executeGitCommand(
        serverId,
        `git checkout -b ${branchName}`,
        projectPath,
        executeTool
      );
      
      if (!createBranchResult.success) {
        console.error('❌ autoCreateBranchIfNeeded: Failed to create branch:', createBranchResult.error);
        return {
          branchCreated: false,
          reason: `Failed to create branch: ${createBranchResult.error}`
        };
      }
      
      branchCreated = true;
    }
    
    // Get current commit hash
    const commitHashResult = await executeGitCommand(
      serverId,
      'git rev-parse HEAD',
      projectPath,
      executeTool
    );
    
    const commitHash = commitHashResult.success ? commitHashResult.output.trim() : '';
    
    const branchInfo: BranchInfo = {
      name: branchName,
      type: changeResult.suggestedBranchType || 'auto',
      description: branchCreated 
        ? `Auto-created branch: ${changeResult.filesChanged} files, ${changeResult.linesAdded + changeResult.linesRemoved} lines changed`
        : `Using existing auto branch: ${changeResult.filesChanged} files, ${changeResult.linesAdded + changeResult.linesRemoved} lines changed`,
      filesChanged: changeResult.changedFiles,
      parentBranch: currentBranch,
      createdAt: new Date(),
      commitHash: commitHash,
      isActive: true
    };
    
    console.log(`✅ autoCreateBranchIfNeeded: Successfully created branch: ${branchName}`);
    
    // 🚀 IMMEDIATE JSON GENERATION - Create .kibitz/api/project.json at the END
    try {
      console.log(`📋 autoCreateBranchIfNeeded: Starting JSON generation for project at ${projectPath}`);
      await createProjectJSONFiles(projectPath, serverId, executeTool);
      console.log(`✅ autoCreateBranchIfNeeded: JSON files successfully created in .kibitz/api/ folder`);
    } catch (jsonError) {
      console.error(`❌ autoCreateBranchIfNeeded: Failed to create JSON files:`, jsonError);
    }
    
    return {
      branchCreated,
      branchInfo,
      reason: branchCreated 
        ? `Created ${branchName}: ${changeResult.filesChanged} files changed`
        : `Using existing ${branchName}: ${changeResult.filesChanged} files changed`
    };
    
  } catch (error) {
    console.error('❌ autoCreateBranchIfNeeded: Error creating branch:', error);
    return {
      branchCreated: false,
      reason: `Error creating branch: ${error instanceof Error ? error.message : String(error)}`
    };
  }
};

/**
 * Merges a branch back to main (or specified target)
 */
export const mergeBranch = async (
  projectPath: string,
  sourceBranch: string,
  targetBranch: string = 'main',
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<{ success: boolean; error?: string }> => {
  try {
    // Switch to target branch
    const checkoutResult = await executeGitCommand(
      serverId,
      `git checkout ${targetBranch}`,
      projectPath,
      executeTool
    );
    
    if (!checkoutResult.success) {
      return {
        success: false,
        error: `Failed to checkout ${targetBranch}: ${checkoutResult.error}`
      };
    }
    
    // Merge the source branch
    const mergeResult = await executeGitCommand(
      serverId,
      `git merge ${sourceBranch} --no-ff -m "Merge ${sourceBranch} into ${targetBranch}"`,
      projectPath,
      executeTool
    );
    
    if (!mergeResult.success) {
      return {
        success: false,
        error: `Failed to merge ${sourceBranch}: ${mergeResult.error || mergeResult.output}`
      };
    }
    
    console.log(`Successfully merged ${sourceBranch} into ${targetBranch}`);
    return { success: true };
    
  } catch (error) {
    console.error('Failed to merge branch:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}; 