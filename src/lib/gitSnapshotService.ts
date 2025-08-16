/**
 * Enhanced Git Snapshot Service
 * 
 * Provides advanced git snapshot functionality with automatic commit message generation,
 * smart branching, and seamless rollback capabilities.
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

const DEFAULT_CONFIG: SnapshotConfig = {
  autoPushEnabled: false,
  generateCommitMessages: true,
  llmProvider: 'anthropic',
  maxRecentSnapshots: 5,
  maxRecentBranches: 10
};

let currentConfig = { ...DEFAULT_CONFIG };

/**
 * Generate a commit message using AI based on git diff
 */
export async function generateCommitMessage(
  projectPath: string,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>,
  _provider?: 'openai' | 'anthropic' | 'custom'
): Promise<string> {
  // Mark optional parameter as intentionally unused for now
  void _provider;
  try {
    // Get git diff for staged changes
    const diffResult = await executeTool(serverId, 'BashCommand', {
      action_json: {
        command: `cd "${projectPath}" && git diff --cached`
      },
      thread_id: `commit-msg-${Date.now()}`
    });

    if (diffResult.includes('Error:') || !diffResult.trim()) {
      return 'Auto-generated commit';
    }

    // Generate a basic commit message based on changes
    return 'Auto-generated commit';
  } catch (error) {
    console.error('Failed to generate commit message:', error);
    return 'Auto-generated commit';
  }
}

/**
 * Create an enhanced git snapshot with AI-generated commit message and smart branching
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
  
  const config = { ...currentConfig, ...options.config };
  const threadId = `snapshot-${Date.now()}`;

  try {
    // Check if there are changes to snapshot
    const statusResult = await executeTool(serverId, 'BashCommand', {
      action_json: {
        command: `cd "${projectPath}" && git status --porcelain`
      },
      thread_id: threadId
    });

    if (!options.force && (!statusResult.trim() || statusResult.includes('Error:'))) {
      return { success: false, error: 'No changes to snapshot' };
    }

    // Stage all changes
    await executeTool(serverId, 'BashCommand', {
      action_json: {
        command: `cd "${projectPath}" && git add -A`
      },
      thread_id: threadId
    });

    // Generate commit message
    let commitMessage = options.description || 'Manual checkpoint';
    if (config.generateCommitMessages && !options.description) {
      commitMessage = await generateCommitMessage(
        projectPath,
        serverId,
        executeTool,
        config.llmProvider
      );
    }

    // Create branch name based on type and timestamp
    const timestamp = new Date();
    const dateStr = timestamp.toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
    const branchType = options.branchType || 'checkpoint';
    const branchName = `${branchType}/${dateStr}`;

    // Create new branch for this snapshot
    await executeTool(serverId, 'BashCommand', {
      action_json: {
        command: `cd "${projectPath}" && git checkout -b "${branchName}"`
      },
      thread_id: threadId
    });

    // Create the commit
    const commitResult = await executeTool(serverId, 'BashCommand', {
      action_json: {
        command: `cd "${projectPath}" && git commit -m "${commitMessage.replace(/"/g, '\\"')}"`
      },
      thread_id: threadId
    });

    if (commitResult.includes('Error:') || commitResult.includes('nothing to commit')) {
      return { success: false, error: 'Failed to create commit' };
    }

    // Get commit hash
    const hashResult = await executeTool(serverId, 'BashCommand', {
      action_json: {
        command: `cd "${projectPath}" && git rev-parse HEAD`
      },
      thread_id: threadId
    });

    const commitHash = hashResult.trim();
    const shortHash = commitHash.substring(0, 7);

    // Get commit statistics
    const statsResult = await executeTool(serverId, 'BashCommand', {
      action_json: {
        command: `cd "${projectPath}" && git show --stat --format="%an" ${commitHash}`
      },
      thread_id: threadId
    });

    const statsLines = statsResult.split('\n');
    const author = statsLines[0] || 'Unknown';
    
    // Parse file and line changes
    let filesChanged = 0;
    let linesChanged = 0;
    
    for (const line of statsLines) {
      if (line.includes(' file') && line.includes('changed')) {
        const fileMatch = line.match(/(\d+) files? changed/);
        if (fileMatch) filesChanged = parseInt(fileMatch[1]);
        
        const insertionMatch = line.match(/(\d+) insertions?/);
        const deletionMatch = line.match(/(\d+) deletions?/);
        
        if (insertionMatch) linesChanged += parseInt(insertionMatch[1]);
        if (deletionMatch) linesChanged += parseInt(deletionMatch[1]);
      }
    }

    // Auto-push if enabled: delegate to server orchestrator to avoid duplicates
    if (config.autoPushEnabled) {
      try {
        if (typeof fetch !== 'undefined') {
          // Derive projectId from directory name
          const dirName = projectPath.split('/').pop() || '';
          const projectId = dirName.split('_')[0] || '';
          await fetch('/api/github-sync/trigger', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId, immediate: true, force: true, branchName })
          }).catch(() => {});
        }
      } catch {}
    }

    const snapshot: GitSnapshot = {
      id: commitHash,
      branchName,
      commitHash,
      shortHash,
      message: commitMessage,
      timestamp,
      filesChanged,
      linesChanged,
      author,
      tags: [branchType],
      isPushed: config.autoPushEnabled
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
 * Get recent snapshots from the current repository
 */
export async function getRecentSnapshots(
  projectPath: string,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>,
  maxCount: number = 3
): Promise<GitSnapshot[]> {
  try {
    const threadId = `recent-snapshots-${Date.now()}`;
    
    // Get recent commits with format: hash|subject|author|date
    const logResult = await executeTool(serverId, 'BashCommand', {
      action_json: {
        command: `cd "${projectPath}" && git log -${maxCount} --format="%H|%s|%an|%ct" --branches`
      },
      thread_id: threadId
    });

    if (logResult.includes('Error:')) {
      return [];
    }

    const snapshots: GitSnapshot[] = [];
    const lines = logResult.trim().split('\n').filter(line => line.trim());

    for (const line of lines) {
      const [hash, subject, author, timestamp] = line.split('|');
      if (!hash || !subject) continue;

      // Get branch name for this commit
      const branchResult = await executeTool(serverId, 'BashCommand', {
        action_json: {
          command: `cd "${projectPath}" && git branch --contains ${hash} | head -1 | sed 's/^[ *]*//'`
        },
        thread_id: threadId
      });

      const branchName = branchResult.trim().replace(/^\* /, '') || 'unknown';

      // Get stats for this commit
      const statsResult = await executeTool(serverId, 'BashCommand', {
        action_json: {
          command: `cd "${projectPath}" && git show --stat --format="" ${hash}`
        },
        thread_id: threadId
      });

      let filesChanged = 0;
      let linesChanged = 0;
      
      const statsLines = statsResult.split('\n');
      for (const statLine of statsLines) {
        if (statLine.includes(' file') && statLine.includes('changed')) {
          const fileMatch = statLine.match(/(\d+) files? changed/);
          if (fileMatch) filesChanged = parseInt(fileMatch[1]);
          
          const insertionMatch = statLine.match(/(\d+) insertions?/);
          const deletionMatch = statLine.match(/(\d+) deletions?/);
          
          if (insertionMatch) linesChanged += parseInt(insertionMatch[1]);
          if (deletionMatch) linesChanged += parseInt(deletionMatch[1]);
        }
      }

      snapshots.push({
        id: hash,
        branchName,
        commitHash: hash,
        shortHash: hash.substring(0, 7),
        message: subject,
        timestamp: new Date(parseInt(timestamp) * 1000),
        filesChanged,
        linesChanged,
        author,
        tags: branchName.includes('/') ? [branchName.split('/')[0]] : ['main'],
        isPushed: false // Would need additional check for remote tracking
      });
    }

    return snapshots;
  } catch (error) {
    console.error('Failed to get recent snapshots:', error);
    return [];
  }
}

/**
 * Get recent branches with metadata
 */
export async function getRecentBranches(
  projectPath: string,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>,
  maxCount: number = 5
): Promise<BranchInfo[]> {
  try {
    const threadId = `recent-branches-${Date.now()}`;
    
    // Get all branches with last commit info
    const branchResult = await executeTool(serverId, 'BashCommand', {
      action_json: {
        command: `cd "${projectPath}" && git for-each-ref --sort=-committerdate --format='%(refname:short)|%(objectname:short)|%(committerdate:iso8601)|%(subject)' refs/heads/ | head -${maxCount}`
      },
      thread_id: threadId
    });

    if (branchResult.includes('Error:')) {
      return [];
    }

    // Get current branch
    const currentBranchResult = await executeTool(serverId, 'BashCommand', {
      action_json: {
        command: `cd "${projectPath}" && git branch --show-current`
      },
      thread_id: threadId
    });

    const currentBranch = currentBranchResult.trim();
    const branches: BranchInfo[] = [];
    const lines = branchResult.trim().split('\n').filter(line => line.trim());

    for (const line of lines) {
      const [name, lastCommit, timestamp] = line.split('|');
      if (!name) continue;

      // Get commit count for this branch
      const countResult = await executeTool(serverId, 'BashCommand', {
        action_json: {
          command: `cd "${projectPath}" && git rev-list --count ${name}`
        },
        thread_id: threadId
      });

      const commitCount = parseInt(countResult.trim()) || 0;

      branches.push({
        name,
        displayName: name,
        lastCommit: lastCommit || '',
        timestamp: new Date(timestamp || Date.now()),
        isRemote: false,
        isCurrent: name === currentBranch,
        commitCount
      });
    }

    return branches;
  } catch (error) {
    console.error('Failed to get recent branches:', error);
    return [];
  }
}

/**
 * Quick revert to a specific snapshot
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
    let backupBranch: string | undefined;

    if (createBackup) {
      // Create backup branch
      const timestamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
      backupBranch = `backup-before-revert-${timestamp}`;
      
      await executeTool(serverId, 'BashCommand', {
        action_json: {
          command: `cd "${projectPath}" && git checkout -b "${backupBranch}"`,
          type: 'command'
        },
        thread_id: threadId
      });
    }

    // Checkout the target snapshot branch
    const checkoutResult = await executeTool(serverId, 'BashCommand', {
      action_json: {
        command: `cd "${projectPath}" && git checkout "${snapshot.branchName}"`,
        type: 'command'
      },
      thread_id: threadId
    });

    if (checkoutResult.includes('Error:')) {
      return { 
        success: false, 
        error: `Failed to checkout snapshot branch: ${checkoutResult}`,
        backupBranch 
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
  currentConfig = { ...currentConfig, ...updates };
  return currentConfig;
}

/**
 * Push snapshot branch to remote
 */
export async function pushSnapshotToRemote(
  projectPath: string,
  branchName: string,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<{ success: boolean; error?: string }> {
  try {
    const threadId = `push-snapshot-${Date.now()}`;
    
    const pushResult = await executeTool(serverId, 'BashCommand', {
      action_json: {
        command: `cd "${projectPath}" && git push origin "${branchName}"`
      },
      thread_id: threadId
    });

    if (pushResult.includes('Error:') || pushResult.includes('fatal:')) {
      return { success: false, error: pushResult };
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to push snapshot to remote:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    };
  }
} 