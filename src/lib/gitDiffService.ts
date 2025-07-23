/**
 * Git Diff Service
 * 
 * Handles generation of git diffs between commits for conversation branches
 * and provides utilities for diff analysis and processing.
 */

import { executeGitCommand } from './gitService';

export interface GitDiffResult {
  success: boolean;
  diff: string;
  error?: string;
  filesChanged: string[];
  linesAdded: number;
  linesRemoved: number;
  commitHash?: string;
  parentHash?: string;
}

export interface CommitInfo {
  hash: string;
  parentHash: string;
  message: string;
  author: string;
  timestamp: string;
  diff: string;
  filesChanged: string[];
  linesAdded: number;
  linesRemoved: number;
}

/**
 * Generate git diff between current commit and its immediate parent
 */
export async function generateCommitDiff(
  projectPath: string,
  commitHash: string,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<GitDiffResult> {
  try {
    console.log(`🔍 gitDiffService: ===== GENERATING GIT DIFF =====`);
    console.log(`🔍 Generating diff for commit ${commitHash.substring(0, 8)}`);
    console.log(`🔍 Project path: ${projectPath}`);
    console.log(`🔍 Server ID: ${serverId}`);

    // Get parent commit hash
    console.log(`🔍 Step 1: Getting parent commit hash...`);
    const parentResult = await executeGitCommand(
      serverId,
      `git rev-parse ${commitHash}^`,
      projectPath,
      executeTool
    );

    if (!parentResult.success) {
      // If no parent (initial commit), use empty tree
      const emptyTreeResult = await executeGitCommand(
        serverId,
        `git diff 4b825dc642cb6eb9a060e54bf8d69288fbee4904 ${commitHash}`,
        projectPath,
        executeTool
      );

      if (!emptyTreeResult.success) {
        return {
          success: false,
          diff: '',
          error: `Failed to generate diff for initial commit: ${emptyTreeResult.error}`,
          filesChanged: [],
          linesAdded: 0,
          linesRemoved: 0,
          commitHash
        };
      }

      const statsResult = await generateDiffStats(projectPath, '4b825dc642cb6eb9a060e54bf8d69288fbee4904', commitHash, serverId, executeTool);

      return {
        success: true,
        diff: emptyTreeResult.output,
        filesChanged: statsResult.filesChanged,
        linesAdded: statsResult.linesAdded,
        linesRemoved: statsResult.linesRemoved,
        commitHash,
        parentHash: '4b825dc642cb6eb9a060e54bf8d69288fbee4904' // Empty tree hash
      };
    }

    const parentHash = parentResult.output.trim();

    // Generate diff between parent and current commit
    const diffResult = await executeGitCommand(
      serverId,
      `git diff ${parentHash} ${commitHash}`,
      projectPath,
      executeTool
    );

    if (!diffResult.success) {
      return {
        success: false,
        diff: '',
        error: `Failed to generate diff: ${diffResult.error}`,
        filesChanged: [],
        linesAdded: 0,
        linesRemoved: 0,
        commitHash,
        parentHash
      };
    }

    // Get diff statistics
    const statsResult = await generateDiffStats(projectPath, parentHash, commitHash, serverId, executeTool);

    console.log(`✅ Generated diff for commit ${commitHash.substring(0, 8)}: ${statsResult.filesChanged.length} files, +${statsResult.linesAdded}/-${statsResult.linesRemoved} lines`);

    return {
      success: true,
      diff: diffResult.output,
      filesChanged: statsResult.filesChanged,
      linesAdded: statsResult.linesAdded,
      linesRemoved: statsResult.linesRemoved,
      commitHash,
      parentHash
    };

  } catch (error) {
    console.error('❌ Error generating commit diff:', error);
    return {
      success: false,
      diff: '',
      error: error instanceof Error ? error.message : 'Unknown error',
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
      commitHash
    };
  }
}

/**
 * Generate diff statistics (files changed, lines added/removed)
 */
async function generateDiffStats(
  projectPath: string,
  fromHash: string,
  toHash: string,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<{ filesChanged: string[]; linesAdded: number; linesRemoved: number }> {
  try {
    // Get list of changed files
    const filesResult = await executeGitCommand(
      serverId,
      `git diff --name-only ${fromHash} ${toHash}`,
      projectPath,
      executeTool
    );

    const filesChanged = filesResult.success 
      ? filesResult.output.split('\n').filter(f => f.trim()).map(f => f.trim())
      : [];

    // Get numstat for line counts
    const numstatResult = await executeGitCommand(
      serverId,
      `git diff --numstat ${fromHash} ${toHash}`,
      projectPath,
      executeTool
    );

    let linesAdded = 0;
    let linesRemoved = 0;

    if (numstatResult.success && numstatResult.output.trim()) {
      numstatResult.output.split('\n').forEach(line => {
        const parts = line.trim().split('\t');
        if (parts.length >= 2) {
          const added = parseInt(parts[0]) || 0;
          const removed = parseInt(parts[1]) || 0;
          linesAdded += added;
          linesRemoved += removed;
        }
      });
    }

    return { filesChanged, linesAdded, linesRemoved };

  } catch (error) {
    console.error('❌ Error generating diff stats:', error);
    return { filesChanged: [], linesAdded: 0, linesRemoved: 0 };
  }
}

/**
 * Generate a comprehensive diff summary for a commit
 */
export async function generateCommitSummary(
  projectPath: string,
  commitHash: string,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<string> {
  try {
    const diffResult = await generateCommitDiff(projectPath, commitHash, serverId, executeTool);
    
    if (!diffResult.success) {
      return `Commit ${commitHash.substring(0, 8)}: Unable to generate diff`;
    }

    const { filesChanged, linesAdded, linesRemoved } = diffResult;
    
    if (filesChanged.length === 0) {
      return `Commit ${commitHash.substring(0, 8)}: No changes detected`;
    }

    const summary = [
      `Commit ${commitHash.substring(0, 8)}:`,
      `${filesChanged.length} file${filesChanged.length !== 1 ? 's' : ''} changed`,
      linesAdded > 0 ? `+${linesAdded} addition${linesAdded !== 1 ? 's' : ''}` : null,
      linesRemoved > 0 ? `-${linesRemoved} deletion${linesRemoved !== 1 ? 's' : ''}` : null
    ].filter(Boolean).join(', ');

    return summary;

  } catch (error) {
    console.error('❌ Error generating commit summary:', error);
    return `Commit ${commitHash.substring(0, 8)}: Error generating summary`;
  }
}

/**
 * Get detailed commit information including diff
 */
export async function getCommitInfo(
  projectPath: string,
  commitHash: string,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<CommitInfo | null> {
  try {
    // Get commit metadata
    const commitInfoResult = await executeGitCommand(
      serverId,
      `git show --format="%H|%P|%s|%an|%aI" --no-patch ${commitHash}`,
      projectPath,
      executeTool
    );

    if (!commitInfoResult.success) {
      console.error(`❌ Failed to get commit info for ${commitHash}:`, commitInfoResult.error);
      return null;
    }

    const [hash, parentHash, message, author, timestamp] = commitInfoResult.output.trim().split('|');

    // Generate diff
    const diffResult = await generateCommitDiff(projectPath, commitHash, serverId, executeTool);

    if (!diffResult.success) {
      console.error(`❌ Failed to generate diff for ${commitHash}:`, diffResult.error);
      return null;
    }

    return {
      hash,
      parentHash: parentHash || '',
      message,
      author,
      timestamp,
      diff: diffResult.diff,
      filesChanged: diffResult.filesChanged,
      linesAdded: diffResult.linesAdded,
      linesRemoved: diffResult.linesRemoved
    };

  } catch (error) {
    console.error('❌ Error getting commit info:', error);
    return null;
  }
}

/**
 * Check if a commit has any meaningful changes (excludes metadata-only changes)
 */
export function hasMeaningfulChanges(diffResult: GitDiffResult): boolean {
  if (!diffResult.success || !diffResult.diff) {
    return false;
  }

  // Filter out metadata-only files
  const meaningfulFiles = diffResult.filesChanged.filter(file => {
    const fileName = file.toLowerCase();
    return !fileName.includes('.json') || 
           !fileName.includes('metadata') ||
           !fileName.includes('config');
  });

  return meaningfulFiles.length > 0 || diffResult.linesAdded > 5;
} 