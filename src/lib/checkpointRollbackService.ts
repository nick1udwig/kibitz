/**
 * Checkpoint and Rollback Service
 * 
 * Provides automatic branching after substantial changes and safe rollback functionality.
 * This service distinguishes between new projects (Kibitz-managed) and cloned projects (GitHub-managed).
 */

import { executeGitCommand } from './gitService';
import { detectChanges, ChangeDetectionResult } from './branchService';

export interface CheckpointOptions {
  description: string;
  createBackup: boolean;
  branchType: 'feature' | 'bugfix' | 'experiment' | 'checkpoint';
}

export interface RollbackOptions {
  targetBranch: string;
  createBackup: boolean;
  backupBranchName?: string;
}

export interface CheckpointResult {
  success: boolean;
  branchName?: string;
  commitHash?: string;
  backupBranch?: string;
  error?: string;
}

/**
 * Creates an automatic checkpoint branch after substantial changes
 */
export const createAutoCheckpoint = async (
  projectPath: string,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>,
  options: Partial<CheckpointOptions> = {}
): Promise<CheckpointResult> => {
  // 🔒 DISABLED: Auto-checkpoint creation to prevent multiple branches  
  return {
    success: false,
    error: 'Auto-checkpoint creation disabled to prevent multiple branches'
  };

  /* ORIGINAL CODE DISABLED:
  try {
    console.log('🔍 Checking for substantial changes to create checkpoint...');
    
    // Detect current changes
    const changes = await detectChanges(projectPath, serverId, executeTool);
    
    // Only create checkpoint if changes are substantial
    if (!changes.shouldCreateBranch) {
      return {
        success: false,
        error: `Changes not substantial enough for checkpoint (${changes.filesChanged} files, ${changes.linesAdded + changes.linesRemoved} lines)`
      };
    }
    
    // Generate checkpoint branch name
    const timestamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
    const branchType = options.branchType || 'checkpoint';
    const branchName = `${branchType}/${timestamp}`;
    
    // 🔒 REDUCED: Skip backup branch creation to prevent multiple branches
    let backupBranch: string | undefined;
    if (false && options.createBackup) { // Disabled backup branch creation
      const currentBranchResult = await executeGitCommand(
        serverId,
        'git branch --show-current',
        projectPath,
        executeTool
      );
      
      if (currentBranchResult.success) {
        const currentBranch = currentBranchResult.output.trim();
        backupBranch = `backup/${currentBranch}-${timestamp}`;
        
        const backupResult = await executeGitCommand(
          serverId,
          `git checkout -b ${backupBranch}`,
          projectPath,
          executeTool
        );
        
        if (!backupResult.success) {
          console.warn('Failed to create backup branch:', backupResult.error);
        } else {
          console.log(`✅ Created backup branch: ${backupBranch}`);
          
          // Switch back to original branch
          await executeGitCommand(
            serverId,
            `git checkout ${currentBranch}`,
            projectPath,
            executeTool
          );
        }
      }
    }
    
    // Commit current changes
    const addResult = await executeGitCommand(
      serverId,
      'git add .',
      projectPath,
      executeTool
    );
    
    if (!addResult.success) {
      return {
        success: false,
        error: `Failed to stage changes: ${addResult.error}`
      };
    }
    
    const description = options.description || `Auto-checkpoint: ${changes.filesChanged} files changed, ${changes.linesAdded + changes.linesRemoved} lines modified`;
    const commitResult = await executeGitCommand(
      serverId,
      `git commit -m "${description}"`,
      projectPath,
      executeTool
    );
    
    if (!commitResult.success && !commitResult.output.includes('nothing to commit')) {
      return {
        success: false,
        error: `Failed to commit changes: ${commitResult.error}`
      };
    }
    
    // Get the commit hash
    const hashResult = await executeGitCommand(
      serverId,
      'git rev-parse HEAD',
      projectPath,
      executeTool
    );
    
    const commitHash = hashResult.success ? hashResult.output.trim() : '';
    
    // Create the checkpoint branch
    const createBranchResult = await executeGitCommand(
      serverId,
      `git checkout -b ${branchName}`,
      projectPath,
      executeTool
    );
    
    if (!createBranchResult.success) {
      return {
        success: false,
        error: `Failed to create checkpoint branch: ${createBranchResult.error}`,
        commitHash,
        backupBranch
      };
    }
    
    console.log(`✅ Created checkpoint branch: ${branchName}`);
    
    return {
      success: true,
      branchName,
      commitHash,
      backupBranch
    };
    
  } catch (error) {
    console.error('Failed to create auto checkpoint:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
  */
};

/**
 * Performs a safe rollback to a specified branch or commit
 */
export const safeRollback = async (
  projectPath: string,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>,
  options: RollbackOptions
): Promise<CheckpointResult> => {
  try {
    console.log(`🔄 Starting safe rollback to: ${options.targetBranch}`);
    
    // Clean the branch name - remove origin/ prefix if present
    let cleanBranchName = options.targetBranch;
    if (cleanBranchName.startsWith('origin/')) {
      cleanBranchName = cleanBranchName.replace('origin/', '');
      console.log(`🧹 Cleaned branch name: ${options.targetBranch} -> ${cleanBranchName}`);
    }
    
    // Get current branch
    const currentBranchResult = await executeGitCommand(
      serverId,
      'git branch --show-current',
      projectPath,
      executeTool
    );
    
    if (!currentBranchResult.success) {
      return {
        success: false,
        error: 'Failed to get current branch'
      };
    }
    
    const currentBranch = currentBranchResult.output.trim();
    
    // 🔒 REDUCED: Skip backup branch creation to prevent multiple branches  
    let backupBranch: string | undefined;
    if (false && options.createBackup) { // Disabled backup branch creation
      const timestamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
      backupBranch = options.backupBranchName || `backup/${currentBranch}-${timestamp}`;
      
      // Check if there are uncommitted changes
      const statusResult = await executeGitCommand(
        serverId,
        'git status --porcelain',
        projectPath,
        executeTool
      );
      
      if (statusResult.success && statusResult.output.trim()) {
        // Commit changes before creating backup
        await executeGitCommand(
          serverId,
          'git add .',
          projectPath,
          executeTool
        );
        
        await executeGitCommand(
          serverId,
          `git commit -m "Auto-backup before rollback to ${cleanBranchName}"`,
          projectPath,
          executeTool
        );
      }
      
      // Create backup branch
      const backupResult = await executeGitCommand(
        serverId,
        `git checkout -b ${backupBranch}`,
        projectPath,
        executeTool
      );
      
      if (backupResult.success) {
        console.log(`✅ Created backup branch: ${backupBranch}`);
        
        // Switch back to current branch for the rollback
        await executeGitCommand(
          serverId,
          `git checkout ${currentBranch}`,
          projectPath,
          executeTool
        );
      } else {
        console.warn('Failed to create backup branch:', backupResult.error);
      }
    }
    
    // First, ensure we have the latest remote information
    console.log('📡 Fetching latest remote information...');
    await executeGitCommand(
      serverId,
      'git fetch --all',
      projectPath,
      executeTool
    );
    
    // Check if branch exists locally
    const localBranchResult = await executeGitCommand(
      serverId,
      `git branch --list ${cleanBranchName}`,
      projectPath,
      executeTool
    );
    
    let branchExists = localBranchResult.success && localBranchResult.output.trim().includes(cleanBranchName);
    
    // If branch doesn't exist locally, try to create it from remote
    if (!branchExists) {
      console.log(`Branch ${cleanBranchName} not found locally, checking remote...`);
      
      // Check if remote branch exists
      const remoteBranchResult = await executeGitCommand(
        serverId,
        `git branch -r --list origin/${cleanBranchName}`,
        projectPath,
        executeTool
      );
      
      if (remoteBranchResult.success && remoteBranchResult.output.trim()) {
        console.log(`Found remote branch origin/${cleanBranchName}, creating local tracking branch...`);
        
        // Create local branch tracking the remote
        const trackResult = await executeGitCommand(
          serverId,
          `git checkout -b ${cleanBranchName} origin/${cleanBranchName}`,
          projectPath,
          executeTool
        );
        
        if (trackResult.success) {
          console.log(`✅ Created local tracking branch: ${cleanBranchName}`);
          branchExists = true;
        } else {
          console.error(`Failed to create tracking branch: ${trackResult.error}`);
        }
      } else {
        // Try alternative remote check
        const allRemotesResult = await executeGitCommand(
          serverId,
          'git branch -r',
          projectPath,
          executeTool
        );
        
        console.log('Available remote branches:', allRemotesResult.output);
        
        return {
          success: false,
          error: `Branch ${cleanBranchName} not found locally or on remote. Available remote branches: ${allRemotesResult.output}`,
          backupBranch
        };
      }
    }
    
    // Perform the rollback (checkout to target branch)
    if (branchExists) {
      const rollbackResult = await executeGitCommand(
        serverId,
        `git checkout ${cleanBranchName}`,
        projectPath,
        executeTool
      );
      
      if (!rollbackResult.success) {
        return {
          success: false,
          error: `Failed to rollback to ${cleanBranchName}: ${rollbackResult.error}`,
          backupBranch
        };
      }
    }
    
    // Get the commit hash we rolled back to
    const hashResult = await executeGitCommand(
      serverId,
      'git rev-parse HEAD',
      projectPath,
      executeTool
    );
    
    const commitHash = hashResult.success ? hashResult.output.trim() : '';
    
    console.log(`✅ Successfully rolled back to: ${cleanBranchName}`);
    
    return {
      success: true,
      branchName: cleanBranchName,
      commitHash,
      backupBranch
    };
    
  } catch (error) {
    console.error('Safe rollback failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

/**
 * Lists all checkpoint branches for a project
 */
export const listCheckpoints = async (
  projectPath: string,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<{ name: string; date: Date; description: string; commitHash: string }[]> => {
  try {
    // Get all branches that start with checkpoint/, feature/, bugfix/, experiment/
    const branchResult = await executeGitCommand(
      serverId,
      'git branch --format="%(refname:short)|%(objectname:short)|%(authordate:iso8601)|%(subject)"',
      projectPath,
      executeTool
    );
    
    if (!branchResult.success) return [];
    
    const checkpoints: { name: string; date: Date; description: string; commitHash: string }[] = [];
    
    for (const line of branchResult.output.split('\n')) {
      if (!line.trim()) continue;
      
      const parts = line.split('|');
      if (parts.length < 4) continue;
      
      const branchName = parts[0].trim();
      const commitHash = parts[1].trim();
      const dateStr = parts[2].trim();
      const description = parts[3].trim();
      
      // Only include checkpoint-type branches
      if (branchName.startsWith('checkpoint/') || 
          branchName.startsWith('feature/') || 
          branchName.startsWith('bugfix/') || 
          branchName.startsWith('experiment/')) {
        
        checkpoints.push({
          name: branchName,
          date: new Date(dateStr),
          description,
          commitHash
        });
      }
    }
    
    // Sort by date, newest first
    return checkpoints.sort((a, b) => b.date.getTime() - a.date.getTime());
    
  } catch (error) {
    console.error('Failed to list checkpoints:', error);
    return [];
  }
};

/**
 * Checks if substantial changes have been made that warrant a checkpoint
 */
export const shouldCreateCheckpoint = async (
  projectPath: string,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>,
  threshold: { filesChanged?: number; linesChanged?: number } = { filesChanged: 3, linesChanged: 50 }
): Promise<{ shouldCreate: boolean; changes: ChangeDetectionResult; reason: string }> => {
  // 🔒 DISABLED: Checkpoint creation check to prevent multiple branches
  return {
    shouldCreate: false,
    changes: {
      filesChanged: 0,
      changedFiles: [],
      linesAdded: 0,
      linesRemoved: 0,
      shouldCreateBranch: false,
      suggestedBranchType: 'iteration',
      suggestedBranchName: ''
    },
    reason: 'Checkpoint creation disabled to prevent multiple branches'
  };

  /* ORIGINAL CODE DISABLED:
  try {
    const changes = await detectChanges(projectPath, serverId, executeTool);
    
    const filesThreshold = threshold.filesChanged || 3;
    const linesThreshold = threshold.linesChanged || 50;
    const totalLines = changes.linesAdded + changes.linesRemoved;
    
    let shouldCreate = false;
    let reason = '';
    
    if (changes.filesChanged >= filesThreshold) {
      shouldCreate = true;
      reason = `${changes.filesChanged} files changed (threshold: ${filesThreshold})`;
    } else if (totalLines >= linesThreshold) {
      shouldCreate = true;
      reason = `${totalLines} lines changed (threshold: ${linesThreshold})`;
    } else {
      reason = `Not enough changes: ${changes.filesChanged} files, ${totalLines} lines`;
    }
    
    return {
      shouldCreate,
      changes,
      reason
    };
    
  } catch (error) {
    console.error('Failed to check if checkpoint should be created:', error);
    return {
      shouldCreate: false,
      changes: {
        filesChanged: 0,
        changedFiles: [],
        linesAdded: 0,
        linesRemoved: 0,
        shouldCreateBranch: false,
        suggestedBranchType: 'iteration',
        suggestedBranchName: ''
      },
      reason: 'Error checking changes'
    };
  }
  */
};

/**
 * Cleans up old checkpoint branches (keeps last N checkpoints)
 */
export const cleanupOldCheckpoints = async (
  projectPath: string,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>,
  keepCount: number = 10
): Promise<{ deleted: string[]; kept: string[]; error?: string }> => {
  try {
    const checkpoints = await listCheckpoints(projectPath, serverId, executeTool);
    
    // Only clean up actual checkpoint/ branches, not feature/bugfix branches
    const checkpointBranches = checkpoints.filter(c => c.name.startsWith('checkpoint/'));
    
    if (checkpointBranches.length <= keepCount) {
      return {
        deleted: [],
        kept: checkpointBranches.map(c => c.name)
      };
    }
    
    // Keep the newest ones, delete the oldest
    const toDelete = checkpointBranches.slice(keepCount);
    const deleted: string[] = [];
    
    for (const branch of toDelete) {
      const deleteResult = await executeGitCommand(
        serverId,
        `git branch -D ${branch.name}`,
        projectPath,
        executeTool
      );
      
      if (deleteResult.success) {
        deleted.push(branch.name);
        console.log(`🗑️ Deleted old checkpoint: ${branch.name}`);
      }
    }
    
    return {
      deleted,
      kept: checkpointBranches.slice(0, keepCount).map(c => c.name)
    };
    
  } catch (error) {
    console.error('Failed to cleanup old checkpoints:', error);
    return {
      deleted: [],
      kept: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }
}; 