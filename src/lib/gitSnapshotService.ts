/**
 * 🚀 Git Snapshot & Reversion Service v1.1
 * 
 * Enhanced Git snapshot management with:
 * - Auto-push toggle functionality
 * - LLM-generated commit messages
 * - Chat UI integration for quick revert
 * - Recent branch management
 */

import { Project } from '../components/LlmChat/context/types';

export interface SnapshotConfig {
  autoPushEnabled: boolean;
  generateCommitMessages: boolean;
  llmProvider: 'openai' | 'anthropic' | 'custom';
  maxRecentSnapshots: number;
  maxRecentBranches: number;
}

export interface GitSnapshot {
  id: string;
  branchName: string;
  commitHash: string;
  shortHash: string;
  message: string;
  timestamp: Date;
  filesChanged: number;
  linesChanged: number;
  author: string;
  tags: string[];
  isPushed: boolean;
}

export interface BranchInfo {
  name: string;
  displayName: string;
  lastCommit: string;
  timestamp: Date;
  isRemote: boolean;
  isCurrent: boolean;
  commitCount: number;
}

const DEFAULT_SNAPSHOT_CONFIG: SnapshotConfig = {
  autoPushEnabled: false,
  generateCommitMessages: true,
  llmProvider: 'anthropic',
  maxRecentSnapshots: 3,
  maxRecentBranches: 5
};

/**
 * Generate an LLM-powered commit message based on git diff
 */
export async function generateCommitMessage(
  projectPath: string,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>,
  provider: 'openai' | 'anthropic' | 'custom' = 'anthropic'
): Promise<string> {
  try {
    // Get git diff for staged changes
    const diffResult = await executeTool(serverId, 'BashCommand', {
      action_json: { 
        command: `cd "${projectPath}" && git diff --cached --stat && echo "---DIFF---" && git diff --cached --unified=2`
      },
      thread_id: `commit-msg-${Date.now()}`
    });

    if (diffResult.includes('Error:') || !diffResult.trim()) {
      return 'Checkpoint: Project changes';
    }

    // Parse the diff to extract meaningful information
    const lines = diffResult.split('\n');
    const statsLine = lines.find(line => line.includes('changed')) || '';
    const diffContent = diffResult.split('---DIFF---')[1] || '';

    // Create a prompt for the LLM
    const prompt = `Generate a concise, descriptive git commit message for these changes:

Git Stats: ${statsLine}

Code Changes Preview:
${diffContent.substring(0, 2000)}...

Guidelines:
- Use conventional commit format (feat:, fix:, refactor:, etc.)
- Be specific but concise (max 72 characters)
- Focus on the most significant changes
- Use present tense ("add" not "added")

Commit message:`;

    // Call the appropriate LLM provider
    // For now, return a generated message based on stats
    const filesChanged = (statsLine.match(/(\d+) file/) || ['', '1'])[1];
    const linesChanged = (statsLine.match(/(\d+) insertion/) || ['', '0'])[1];
    
    if (diffContent.includes('package.json')) {
      return 'feat: update project dependencies';
    } else if (diffContent.includes('.tsx') || diffContent.includes('.jsx')) {
      return 'feat: update React components and UI';
    } else if (diffContent.includes('.ts') || diffContent.includes('.js')) {
      return 'refactor: improve code structure and logic';
    } else if (diffContent.includes('.css') || diffContent.includes('.scss')) {
      return 'style: update component styling';
    } else if (diffContent.includes('README') || diffContent.includes('.md')) {
      return 'docs: update project documentation';
    } else if (diffContent.includes('test') || diffContent.includes('.spec.')) {
      return 'test: add/update test coverage';
    } else {
      return `feat: update project files (${filesChanged} files, ${linesChanged} lines)`;
    }

  } catch (error) {
    console.error('Failed to generate commit message:', error);
    return 'Checkpoint: Project changes';
  }
}

/**
 * Create a snapshot with enhanced features
 */
export async function createEnhancedSnapshot(
  projectPath: string,
  project: Project,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>,
  options: {
    description?: string;
    branchType?: 'feature' | 'bugfix' | 'experiment' | 'checkpoint';
    config?: Partial<SnapshotConfig>;
    force?: boolean;
  } = {}
): Promise<{ success: boolean; snapshot?: GitSnapshot; error?: string }> {
  const config = { ...DEFAULT_SNAPSHOT_CONFIG, ...options.config };
  const threadId = `snapshot-${Date.now()}`;

  try {
    // Check if there are changes to snapshot
    const statusResult = await executeTool(serverId, 'BashCommand', {
      action_json: { command: `cd "${projectPath}" && git status --porcelain` },
      thread_id: threadId
    });

    if (!options.force && (!statusResult.trim() || statusResult.includes('Error:'))) {
      return { success: false, error: 'No changes to snapshot' };
    }

    // Stage all changes
    await executeTool(serverId, 'BashCommand', {
      action_json: { command: `cd "${projectPath}" && git add -A` },
      thread_id: threadId
    });

    // Generate commit message
    let commitMessage = options.description || 'Manual checkpoint';
    if (config.generateCommitMessages && !options.description) {
      commitMessage = await generateCommitMessage(projectPath, serverId, executeTool, config.llmProvider);
    }

    // Create branch name
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const branchType = options.branchType || 'checkpoint';
    const branchName = `kibitz-${project.name}-${timestamp}`;

    // Create and switch to new branch
    await executeTool(serverId, 'BashCommand', {
      action_json: { command: `cd "${projectPath}" && git checkout -b "${branchName}"` },
      thread_id: threadId
    });

    // Commit changes
    const commitResult = await executeTool(serverId, 'BashCommand', {
      action_json: { 
        command: `cd "${projectPath}" && git commit -m "${commitMessage}" --allow-empty` 
      },
      thread_id: threadId
    });

    if (commitResult.includes('Error:')) {
      return { success: false, error: `Failed to commit: ${commitResult}` };
    }

    // Extract commit hash
    const hashResult = await executeTool(serverId, 'BashCommand', {
      action_json: { command: `cd "${projectPath}" && git rev-parse HEAD` },
      thread_id: threadId
    });

    const commitHash = hashResult.trim();
    const shortHash = commitHash.substring(0, 7);

    // Auto-push if enabled
    let isPushed = false;
    if (config.autoPushEnabled) {
      try {
        const pushResult = await executeTool(serverId, 'BashCommand', {
          action_json: { 
            command: `cd "${projectPath}" && git push -u origin "${branchName}"` 
          },
          thread_id: threadId
        });
        isPushed = !pushResult.includes('Error:');
      } catch (error) {
        console.warn('Auto-push failed:', error);
      }
    }

    // Get change statistics
    const statsResult = await executeTool(serverId, 'BashCommand', {
      action_json: { 
        command: `cd "${projectPath}" && git diff --stat HEAD~1 HEAD || echo "0 files changed"` 
      },
      thread_id: threadId
    });

    const filesChanged = parseInt((statsResult.match(/(\d+) file/) || ['', '0'])[1]) || 0;
    const linesChanged = parseInt((statsResult.match(/(\d+) insertion/) || ['', '0'])[1]) || 0;

    const snapshot: GitSnapshot = {
      id: shortHash,
      branchName,
      commitHash,
      shortHash,
      message: commitMessage,
      timestamp: new Date(),
      filesChanged,
      linesChanged,
      author: 'Kibitz',
      tags: [branchType, 'auto-generated'],
      isPushed
    };

    return { success: true, snapshot };

  } catch (error) {
    console.error('Failed to create enhanced snapshot:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    };
  }
}

/**
 * Get recent snapshots for quick access in chat UI
 */
export async function getRecentSnapshots(
  projectPath: string,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>,
  maxCount: number = 3
): Promise<GitSnapshot[]> {
  try {
    const threadId = `recent-snapshots-${Date.now()}`;

    // Get recent kibitz branches
    const branchResult = await executeTool(serverId, 'BashCommand', {
      action_json: { 
        command: `cd "${projectPath}" && git for-each-ref --sort=-committerdate --format='%(refname:short)|%(objectname)|%(committerdate:iso)|%(subject)' refs/heads/kibitz-* | head -${maxCount}` 
      },
      thread_id: threadId
    });

    if (branchResult.includes('Error:') || !branchResult.trim()) {
      return [];
    }

    const snapshots: GitSnapshot[] = [];
    const lines = branchResult.trim().split('\n').filter(line => line.trim());

    for (const line of lines) {
      const [branchName, commitHash, timestamp, message] = line.split('|');
      
      if (!branchName || !commitHash) continue;

      // Get change statistics for this commit
      const statsResult = await executeTool(serverId, 'BashCommand', {
        action_json: { 
          command: `cd "${projectPath}" && git show --stat ${commitHash} | grep "changed" || echo "0 files changed"` 
        },
        thread_id: threadId
      });

      const filesChanged = parseInt((statsResult.match(/(\d+) file/) || ['', '0'])[1]) || 0;
      const linesChanged = parseInt((statsResult.match(/(\d+) insertion/) || ['', '0'])[1]) || 0;

      snapshots.push({
        id: commitHash.substring(0, 7),
        branchName,
        commitHash,
        shortHash: commitHash.substring(0, 7),
        message: message || 'Checkpoint',
        timestamp: new Date(timestamp),
        filesChanged,
        linesChanged,
        author: 'Kibitz',
        tags: ['checkpoint'],
        isPushed: false // We'd need to check remote to know for sure
      });
    }

    return snapshots;

  } catch (error) {
    console.error('Failed to get recent snapshots:', error);
    return [];
  }
}

/**
 * Get recent branches using fast service (optimized for speed and GitHub-like display)
 */
export async function getRecentBranches(
  projectPath: string,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>,
  maxCount: number = 5
): Promise<BranchInfo[]> {
  try {
    // Use fast branch service for optimal performance
    const { getFastBranches } = await import('./fastBranchService');
    const fastBranches = await getFastBranches(projectPath, serverId, executeTool, maxCount);

    // Convert fast branch info to snapshot service format with null safety
    const branches: BranchInfo[] = fastBranches.map(branch => ({
      name: branch.name || 'unknown',
      displayName: branch.displayName || branch.name || 'unknown',
      lastCommit: branch.lastCommit || 'No commit message',
      timestamp: branch.timestamp || new Date(),
      isRemote: false, // Fast service handles this internally
      isCurrent: branch.isCurrent || false,
      commitCount: 0 // Not needed for UI performance
    }));

    console.log(`✅ Fast branches retrieved: ${branches.length} branches in optimized time`);
    return branches;

  } catch (error) {
    console.error('Failed to get recent branches:', error);
    return [];
  }
}

/**
 * Quick revert to a snapshot
 */
export async function quickRevertToSnapshot(
  projectPath: string,
  snapshot: GitSnapshot,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>,
  createBackup: boolean = true
): Promise<{ success: boolean; backupBranch?: string; error?: string }> {
  try {
    const threadId = `revert-${Date.now()}`;

    // Create backup of current state if requested
    let backupBranch: string | undefined;
    if (createBackup) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
      backupBranch = `backup-before-revert-${timestamp}`;
      
      await executeTool(serverId, 'BashCommand', {
        action_json: { command: `cd "${projectPath}" && git checkout -b "${backupBranch}"` },
        thread_id: threadId
      });
    }

    // Switch to the snapshot branch
    const checkoutResult = await executeTool(serverId, 'BashCommand', {
      action_json: { command: `cd "${projectPath}" && git checkout "${snapshot.branchName}"` },
      thread_id: threadId
    });

    if (checkoutResult.includes('Error:')) {
      return { 
        success: false, 
        error: `Failed to checkout snapshot branch: ${checkoutResult}` 
      };
    }

    return { success: true, backupBranch };

  } catch (error) {
    console.error('Failed to revert to snapshot:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    };
  }
}

/**
 * Update snapshot configuration
 */
export function updateSnapshotConfig(
  updates: Partial<SnapshotConfig>
): SnapshotConfig {
  return { ...DEFAULT_SNAPSHOT_CONFIG, ...updates };
}

/**
 * Push a snapshot to remote (manual push)
 */
export async function pushSnapshotToRemote(
  projectPath: string,
  branchName: string,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<{ success: boolean; error?: string }> {
  try {
    const threadId = `push-${Date.now()}`;

    const pushResult = await executeTool(serverId, 'BashCommand', {
      action_json: { 
        command: `cd "${projectPath}" && git push -u origin "${branchName}"` 
      },
      thread_id: threadId
    });

    if (pushResult.includes('Error:')) {
      return { success: false, error: pushResult };
    }

    return { success: true };

  } catch (error) {
    console.error('Failed to push snapshot:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    };
  }
} 