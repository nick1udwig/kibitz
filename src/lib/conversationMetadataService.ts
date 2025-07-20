/**
 * Conversation Metadata Service
 * Captures and stores conversation metadata in JSON files for API access
 * 🚀 DIRECT APPROACH: Uses git data and conversation data to create comprehensive metadata
 */

import { executeGitCommand } from './gitService';
import { getProjectPath } from './projectPathService';

interface ConversationMetadata {
  conversationId: string;
  projectId: string;
  projectName: string;
  timestamp: number;
  messageCount: number;
  duration: number;
  lastActivity: number;
  status: 'active' | 'completed' | 'reverted';
}

interface GitBranch {
  branchName: string;
  commitHash: string;
  commitMessage: string;
  timestamp: number;
  author: string;
  filesChanged: string[];
  linesAdded: number;
  linesRemoved: number;
  isMainBranch: boolean;
  tags: string[];
  conversationId?: string; // Link to conversation
}

interface ConversationData {
  conversationId: string;
  projectId: string;
  metadata: ConversationMetadata;
  gitSnapshot: {
    currentBranch: string;
    lastCommitHash: string;
    lastCommitMessage: string;
    filesModified: string[];
    branchesCreated: string[];
  };
}

/**
 * Captures current git state for conversation
 */
async function captureGitSnapshot(
  projectPath: string,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<ConversationData['gitSnapshot']> {
  try {
    console.log('📸 ConversationMetadata: Capturing git snapshot...');

    // Get current branch
    const branchResult = await executeGitCommand(
      serverId,
      'git rev-parse --abbrev-ref HEAD',
      projectPath,
      executeTool
    );
    const currentBranch = branchResult.success ? branchResult.output.trim() : 'main';

    // Get last commit hash
    const commitHashResult = await executeGitCommand(
      serverId,
      'git rev-parse HEAD',
      projectPath,
      executeTool
    );
    const lastCommitHash = commitHashResult.success ? commitHashResult.output.trim() : '';

    // Get last commit message
    const commitMsgResult = await executeGitCommand(
      serverId,
      'git log -1 --pretty=format:"%s"',
      projectPath,
      executeTool
    );
    const lastCommitMessage = commitMsgResult.success ? commitMsgResult.output.trim() : '';

    // Get modified files (staged and unstaged)
    const modifiedResult = await executeGitCommand(
      serverId,
      'git status --porcelain',
      projectPath,
      executeTool
    );
    const filesModified = modifiedResult.success 
      ? modifiedResult.output.split('\n').filter(line => line.trim()).map(line => line.substring(3))
      : [];

    // Get all branches to see which were created recently
    const branchesResult = await executeGitCommand(
      serverId,
      'git branch -a',
      projectPath,
      executeTool
    );
    const branchesCreated = branchesResult.success 
      ? branchesResult.output.split('\n')
          .filter(line => line.includes('auto/') || line.includes('conversation/'))
          .map(line => line.replace(/^\*?\s+/, '').trim())
      : [];

    return {
      currentBranch,
      lastCommitHash,
      lastCommitMessage,
      filesModified,
      branchesCreated
    };

  } catch (error) {
    console.warn('⚠️ ConversationMetadata: Failed to capture git snapshot:', error);
    return {
      currentBranch: 'main',
      lastCommitHash: '',
      lastCommitMessage: '',
      filesModified: [],
      branchesCreated: []
    };
  }
}

/**
 * Creates comprehensive git branch data with conversation links
 */
async function captureGitBranches(
  projectPath: string,
  conversationId: string,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<GitBranch[]> {
  try {
    console.log('🌲 ConversationMetadata: Capturing git branches...');

    // Get all branches with commit info
    const branchesResult = await executeGitCommand(
      serverId,
      'git for-each-ref --format="%(refname:short)|%(objectname)|%(subject)|%(authordate:unix)|%(authorname)" refs/heads/',
      projectPath,
      executeTool
    );

    if (!branchesResult.success) {
      return [];
    }

    const branches: GitBranch[] = [];
    const branchLines = branchesResult.output.split('\n').filter(line => line.trim());

    for (const line of branchLines) {
      const [branchName, commitHash, commitMessage, timestamp, author] = line.split('|');
      
      if (!branchName || !commitHash) continue;

      // Get files changed in this branch
      const filesResult = await executeGitCommand(
        serverId,
        `git diff --name-only ${commitHash}~1..${commitHash} 2>/dev/null || echo ""`,
        projectPath,
        executeTool
      );
      const filesChanged = filesResult.success 
        ? filesResult.output.split('\n').filter(f => f.trim())
        : [];

      // Get line changes
      const statsResult = await executeGitCommand(
        serverId,
        `git show --stat --format="" ${commitHash} | tail -1`,
        projectPath,
        executeTool
      );
      
      let linesAdded = 0;
      let linesRemoved = 0;
      if (statsResult.success) {
        const statsMatch = statsResult.output.match(/(\d+) insertions?.*?(\d+) deletions?/);
        if (statsMatch) {
          linesAdded = parseInt(statsMatch[1]) || 0;
          linesRemoved = parseInt(statsMatch[2]) || 0;
        }
      }

      // Determine tags and conversation link
      const tags: string[] = [];
      let linkedConversationId: string | undefined;

      if (branchName.startsWith('auto/')) {
        tags.push('auto');
      } else if (branchName.startsWith('conversation/')) {
        tags.push('conversation');
        linkedConversationId = conversationId;
      } else if (branchName === 'main' || branchName === 'master') {
        tags.push('main');
      } else {
        tags.push('manual');
      }

      branches.push({
        branchName,
        commitHash: commitHash.substring(0, 7), // Short hash
        commitMessage,
        timestamp: parseInt(timestamp) * 1000, // Convert to milliseconds
        author: author || 'System',
        filesChanged,
        linesAdded,
        linesRemoved,
        isMainBranch: branchName === 'main' || branchName === 'master',
        tags,
        conversationId: linkedConversationId
      });
    }

    return branches;

  } catch (error) {
    console.warn('⚠️ ConversationMetadata: Failed to capture git branches:', error);
    return [];
  }
}

/**
 * Main function to save conversation metadata
 */
export async function saveConversationMetadata(
  projectId: string,
  projectName: string,
  metadata: ConversationMetadata,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<void> {
  try {
    console.log('💾 ConversationMetadata: Saving conversation metadata...');

    const projectPath = getProjectPath(projectId, projectName);
    
    // Capture git snapshot
    const gitSnapshot = await captureGitSnapshot(projectPath, serverId, executeTool);
    
    // Capture git branches with conversation links
    const gitBranches = await captureGitBranches(projectPath, metadata.conversationId, serverId, executeTool);

    // Create conversation data object
    const conversationData: ConversationData = {
      conversationId: metadata.conversationId,
      projectId,
      metadata,
      gitSnapshot
    };

    // Ensure .kibitz/api directory exists
    const mkdirResult = await executeGitCommand(
      serverId,
      `mkdir -p "${projectPath}/.kibitz/api"`,
      projectPath,
      executeTool
    );

    if (!mkdirResult.success) {
      throw new Error('Failed to create .kibitz/api directory');
    }

    // Save conversation metadata
    const conversationJson = JSON.stringify(conversationData, null, 2);
    const saveConversationResult = await executeGitCommand(
      serverId,
      `cat > "${projectPath}/.kibitz/api/conversation_${metadata.conversationId}.json" << 'EOF'\n${conversationJson}\nEOF`,
      projectPath,
      executeTool
    );

    if (!saveConversationResult.success) {
      throw new Error('Failed to save conversation metadata');
    }

    // Update/create project metadata with branches and conversations (v2 schema)
    const projectData = {
      projectId,
      projectName,
      projectPath,
      gitInitialized: true,
      lastActivity: metadata.timestamp,
      conversations: [{
        conversationId: metadata.conversationId,
        timestamp: metadata.timestamp,
        messageCount: metadata.messageCount,
        duration: metadata.duration,
        status: metadata.status,
        gitSnapshot
      }],
      repository: {
        defaultBranch: gitSnapshot.currentBranch,
        totalBranches: gitBranches.length,
        totalCommits: gitBranches.length,
        lastActivity: metadata.timestamp,
        size: 1024, // Placeholder
        languages: { "py": 1 } // Placeholder - could be enhanced to detect actual languages
      },
      branches: gitBranches.map(branch => ({
        ...branch,
        sync: {
          lastPushed: null,
          pushedHash: null,
          needsSync: false,
          syncError: null
        }
      })),
      
      // GitHub sync configuration (v2 schema)
      github: {
        enabled: false,
        remoteUrl: null,
        syncInterval: 300000, // 5 minutes
        syncBranches: ['main', 'auto/*'],
        lastSync: null,
        syncStatus: 'idle',
        authentication: {
          type: 'token',
          configured: false,
          lastValidated: null
        }
      },
      
      // Global sync state (v2 schema)
      sync: {
        lastAttempt: null,
        nextScheduled: null,
        consecutiveFailures: 0,
        pendingChanges: []
      },
      
      metadata: {
        generated: metadata.timestamp,
        version: '2.0',
        source: 'conversation-metadata-service'
      }
    };

    // Save updated project metadata
    const projectJson = JSON.stringify(projectData, null, 2);
    const saveProjectResult = await executeGitCommand(
      serverId,
      `cat > "${projectPath}/.kibitz/api/project.json" << 'EOF'\n${projectJson}\nEOF`,
      projectPath,
      executeTool
    );

    if (!saveProjectResult.success) {
      throw new Error('Failed to save project metadata');
    }

    // Save branches data separately for the branches API
    const branchesData = { branches: gitBranches };
    const branchesJson = JSON.stringify(branchesData, null, 2);
    const saveBranchesResult = await executeGitCommand(
      serverId,
      `cat > "${projectPath}/.kibitz/api/branches.json" << 'EOF'\n${branchesJson}\nEOF`,
      projectPath,
      executeTool
    );

    if (!saveBranchesResult.success) {
      throw new Error('Failed to save branches metadata');
    }

    console.log('✅ ConversationMetadata: Successfully saved all metadata files');
    console.log(`📋 Conversation: ${metadata.conversationId}`);
    console.log(`🌲 Branches: ${gitBranches.length}`);
    console.log(`📁 Files: ${gitSnapshot.filesModified.length}`);
    console.log(`💬 Messages: ${metadata.messageCount}`);

  } catch (error) {
    console.error('❌ ConversationMetadata: Failed to save metadata:', error);
    throw error;
  }
}

/**
 * Utility function to load conversation metadata
 */
export async function loadConversationMetadata(
  projectId: string,
  conversationId: string,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<ConversationData | null> {
  try {
    const projectPath = getProjectPath(projectId, 'temp'); // Name doesn't matter for loading
    
    const result = await executeGitCommand(
      serverId,
      `cat "${projectPath}/.kibitz/api/conversation_${conversationId}.json"`,
      projectPath,
      executeTool
    );

    if (result.success) {
      return JSON.parse(result.output);
    }
    
    return null;
  } catch (error) {
    console.warn('⚠️ ConversationMetadata: Failed to load conversation metadata:', error);
    return null;
  }
} 