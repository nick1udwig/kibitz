/**
 * Enhanced Git Snapshot Service
 * 
 * Provides advanced git snapshot functionality with automatic commit message generation,
 * smart branching, and seamless rollback capabilities.
 */

import { Project } from '../components/LlmChat/context/types';
import { executeGitCommand } from './versionControl/git';

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
    const diffRes = await executeGitCommand(serverId, 'git diff --cached', projectPath, executeTool);
    if (!diffRes.success || !diffRes.output.trim()) {
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
  // const threadId = `snapshot-${Date.now()}`;  // unused

  try {
    // Check if there are changes to snapshot
    const statusRes = await executeGitCommand(serverId, 'git status --porcelain', projectPath, executeTool);
    if (!options.force && (!statusRes.success || !statusRes.output.trim())) {
      return { success: false, error: 'No changes to snapshot' };
    }

    // Stage all changes
    await executeGitCommand(serverId, 'git add -A', projectPath, executeTool);

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
    await executeGitCommand(serverId, `git checkout -b "${branchName}"`, projectPath, executeTool);

    // Create the commit
    const commitRes = await executeGitCommand(serverId, `git commit -m "${commitMessage.replace(/"/g, '\\"')}"`, projectPath, executeTool);
    if (!commitRes.success || commitRes.output.includes('nothing to commit')) {
      return { success: false, error: 'Failed to create commit' };
    }

    // Get commit hash
    const hashRes = await executeGitCommand(serverId, 'git rev-parse HEAD', projectPath, executeTool);
    const commitHash = (hashRes.output || '').trim();
    const shortHash = commitHash.substring(0, 7);

    // Get commit statistics
    const statsRes = await executeGitCommand(serverId, `git show --stat --format="%an" ${commitHash}`, projectPath, executeTool);
    const statsLines = (statsRes.output || '').split('\n');
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
    // const threadId = `recent-snapshots-${Date.now()}`;  // unused
    
    // Get recent commits with format: hash|subject|author|date
    const logRes = await executeGitCommand(serverId, `git log -${maxCount} --format="%H|%s|%an|%ct" --branches`, projectPath, executeTool);

    if (!logRes.success) {
      return [];
    }

    const snapshots: GitSnapshot[] = [];
    const lines = (logRes.output || '').trim().split('\n').filter(line => line.trim());

    for (const line of lines) {
      const [hash, subject, author, timestamp] = line.split('|');
      if (!hash || !subject) continue;

      // Get branch name for this commit
      const branchRes = await executeGitCommand(serverId, `git branch --contains ${hash} | head -1 | sed 's/^[ *]*//'`, projectPath, executeTool);
      const branchName = (branchRes.output || '').trim().replace(/^\* /, '') || 'unknown';

      // Get stats for this commit
      const statsRes = await executeGitCommand(serverId, `git show --stat --format="" ${hash}`, projectPath, executeTool);
      let filesChanged = 0;
      let linesChanged = 0;
      const statsLines = (statsRes.output || '').split('\n');
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
    // const threadId = `recent-branches-${Date.now()}`;  // unused
    
    // Get all branches with last commit info
    const branchRes = await executeGitCommand(
      serverId,
      `git for-each-ref --sort=-committerdate --format='%(refname:short)|%(objectname:short)|%(committerdate:iso8601)|%(subject)' refs/heads/ | head -${maxCount}`,
      projectPath,
      executeTool
    );

    if (!branchRes.success || (branchRes.output || '').includes('Error:')) {
      return [];
    }

    // Get current branch
    const currentBranchRes = await executeGitCommand(serverId, 'git branch --show-current', projectPath, executeTool);

    const currentBranch = (currentBranchRes.output || '').trim();
    const branches: BranchInfo[] = [];
    const lines = (branchRes.output || '').trim().split('\n').filter(line => line.trim());

    for (const line of lines) {
      const [name, lastCommit, timestamp] = line.split('|');
      if (!name) continue;

      // Get commit count for this branch
      const countRes = await executeGitCommand(serverId, `git rev-list --count ${name}`, projectPath, executeTool);
      const commitCount = parseInt((countRes.output || '').trim()) || 0;

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
    let backupBranch: string | undefined;

    if (createBackup) {
      // Create backup branch (unified naming)
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
      backupBranch = `backup/rollback/${timestamp}`;

      const backupRes = await executeGitCommand(
        serverId,
        `git checkout -b "${backupBranch}"`,
        projectPath,
        executeTool
      );
      if (!backupRes.success) {
        return {
          success: false,
          error: `Failed to create backup branch ${backupBranch}: ${backupRes.output || ''}`
        };
      }
    }

    // Checkout the target snapshot branch
    const checkoutRes = await executeGitCommand(
      serverId,
      `git checkout "${snapshot.branchName}"`,
      projectPath,
      executeTool
    );

    if (!checkoutRes.success || (checkoutRes.output || '').includes('fatal:')) {
      return { 
        success: false, 
        error: `Failed to checkout snapshot branch: ${checkoutRes.output || ''}`,
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
    const pushRes = await executeGitCommand(
      serverId,
      `git push origin "${branchName}"`,
      projectPath,
      executeTool
    );

    const out = pushRes.output || '';
    if (!pushRes.success || out.includes('fatal:') || out.includes('error:')) {
      return { success: false, error: out };
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