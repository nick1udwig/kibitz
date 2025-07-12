/**
 * Branch Service
 * 
 * Intelligent Git branch management system that automatically creates branches
 * based on file changes and provides safe revert capabilities.
 */

import { executeGitCommand } from './gitService';

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
    
    // Get diff stats for line counts
    let linesAdded = 0;
    let linesRemoved = 0;
    
    try {
      console.log('📈 detectChanges: Getting diff stats...');
      const diffResult = await executeGitCommand(
        serverId,
        'git diff --cached --numstat',
        projectPath,
        executeTool
      );
      
      console.log('📊 detectChanges: Diff result:', diffResult);
      
      if (diffResult.success && diffResult.output.trim()) {
        const diffLines = diffResult.output.trim().split('\n');
        console.log('📝 detectChanges: Diff lines:', diffLines);
        
        for (const line of diffLines) {
          if (line.trim()) {
            console.log('🔍 detectChanges: Parsing diff line:', line);
            // Format: "added\tremoved\tfilename"
            const parts = line.split('\t');
            if (parts.length >= 2) {
              const added = parseInt(parts[0]) || 0;
              const removed = parseInt(parts[1]) || 0;
              linesAdded += added;
              linesRemoved += removed;
              console.log('➕ detectChanges: Added lines:', added, 'Removed lines:', removed);
            }
          }
        }
      } else {
        console.log('ℹ️ detectChanges: No diff stats available, using fallback...');
        // Fallback: if we have staged files, assume some line changes
        if (filesChanged > 0) {
          linesAdded = filesChanged * 5; // Estimate 5 lines per file
          console.log('🔄 detectChanges: Using fallback estimate:', linesAdded, 'lines');
        }
      }
    } catch (diffError) {
      console.error('⚠️ detectChanges: Error getting diff stats:', diffError);
      // Fallback: estimate based on file count
      if (filesChanged > 0) {
        linesAdded = filesChanged * 5;
        console.log('🔄 detectChanges: Using error fallback estimate:', linesAdded, 'lines');
      }
    }
    
    console.log('📈 detectChanges: Final stats - Files:', filesChanged, 'Lines added:', linesAdded, 'Lines removed:', linesRemoved);
    
    // Determine if we should create a branch
    const shouldCreateBranch = filesChanged >= 2 || linesAdded + linesRemoved >= 30; // 🔧 LOWERED: 2+ files or 30+ lines
    console.log('🎯 detectChanges: Should create branch:', shouldCreateBranch, '(threshold: 2 files or 30 lines)');
    
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
 */
export const autoCreateBranchIfNeeded = async (
  projectPath: string,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<{ branchCreated: boolean; branchInfo?: BranchInfo; reason?: string }> => {
  // 🔒 RE-ENABLED: Single auto-branch creation with strict controls
  try {
    console.log('🔍 autoCreateBranchIfNeeded: Checking if branch should be created...');
    
    const changeResult = await detectChanges(projectPath, serverId, executeTool);
    
    if (!changeResult.shouldCreateBranch) {
      return {
        branchCreated: false,
        reason: `Only ${changeResult.filesChanged} files changed (threshold: 3), ${changeResult.linesAdded + changeResult.linesRemoved} lines (threshold: 50)`
      };
    }

    // Create timestamp for branch name
    const now = new Date();
    const timestamp = now.toISOString()
      .slice(0, 19)
      .replace(/[-:]/g, '')
      .replace('T', '-');
    
    const branchName = `auto/${timestamp}`;
    
    console.log(`🌿 autoCreateBranchIfNeeded: Creating branch ${branchName} for ${changeResult.filesChanged} files changed`);
    
    // Get current branch
    const currentBranchResult = await executeGitCommand(
      serverId,
      'git branch --show-current',
      projectPath,
      executeTool
    );
    
    const currentBranch = currentBranchResult.success ? currentBranchResult.output.trim() : 'main';
    
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
      description: `Auto-created branch: ${changeResult.filesChanged} files, ${changeResult.linesAdded + changeResult.linesRemoved} lines changed`,
      filesChanged: changeResult.changedFiles,
      parentBranch: currentBranch,
      createdAt: now,
      commitHash: commitHash,
      isActive: true
    };
    
    console.log(`✅ autoCreateBranchIfNeeded: Successfully created branch: ${branchName}`);
    
    return {
      branchCreated: true,
      branchInfo,
      reason: `Created ${branchName}: ${changeResult.filesChanged} files changed`
    };
    
  } catch (error) {
    console.error('❌ autoCreateBranchIfNeeded: Error creating branch:', error);
    return {
      branchCreated: false,
      reason: `Error creating branch: ${error instanceof Error ? error.message : String(error)}`
    };
  }

  /* ORIGINAL DISABLED CODE REMOVED */
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