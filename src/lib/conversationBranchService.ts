/**
 * Conversation Branch Service
 * 
 * Manages conversation-specific branching to prevent hash ID conflicts
 * and maintain separate commit histories for each conversation.
 */

import { executeGitCommand } from './gitService';

export interface ConversationBranchInfo {
  branchName: string;
  conversationId: string;
  interactionCount: number;
  baseBranch: string;
  startingHash: string;
  createdAt: number;
  commitHash?: string;
}

export interface ConversationBranchResult {
  success: boolean;
  branchInfo?: ConversationBranchInfo;
  error?: string;
}

/**
 * Get all branches for a specific conversation
 */
export async function getConversationBranches(
  projectPath: string,
  conversationId: string,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<string[]> {
  try {
    const branchResult = await executeGitCommand(
      serverId,
      'git branch -a',
      projectPath,
      executeTool
    );

    if (!branchResult.success) {
      console.warn('⚠️ Failed to get branch list:', branchResult.error);
      return [];
    }

    const branches = branchResult.output
      .split('\n')
      .map(branch => branch.trim().replace(/^\*\s*/, '').replace(/^remotes\/origin\//, ''))
      .filter(branch => branch && branch.startsWith(`conv-${conversationId}-`))
      .sort();

    console.log(`🔍 Found ${branches.length} branches for conversation ${conversationId}:`, branches);
    return branches;

  } catch (error) {
    console.error('❌ Error getting conversation branches:', error);
    return [];
  }
}

/**
 * Get the latest branch for a conversation
 */
export async function getLatestConversationBranch(
  projectPath: string,
  conversationId: string,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<string | null> {
  const branches = await getConversationBranches(projectPath, conversationId, serverId, executeTool);
  return branches.length > 0 ? branches[branches.length - 1] : null;
}

/**
 * Get the next interaction count for a conversation
 */
export async function getNextInteractionCount(
  projectPath: string,
  conversationId: string,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<number> {
  const branches = await getConversationBranches(projectPath, conversationId, serverId, executeTool);
  
  if (branches.length === 0) {
    return 1; // First interaction
  }
  
  // Extract step numbers and find the highest
  let maxStepNumber = 0;
  branches.forEach(branchName => {
    const stepMatch = branchName.match(/conv-.*-step-(\d+)$/);
    if (stepMatch) {
      const stepNumber = parseInt(stepMatch[1], 10);
      if (stepNumber > maxStepNumber) {
        maxStepNumber = stepNumber;
      }
    }
  });
  
  console.log(`🔢 Found ${branches.length} conversation branches, highest step: ${maxStepNumber}, next step: ${maxStepNumber + 1}`);
  return maxStepNumber + 1;
}

/**
 * Get current commit hash
 */
export async function getCurrentCommitHash(
  projectPath: string,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<string> {
  try {
    const hashResult = await executeGitCommand(
      serverId,
      'git rev-parse HEAD',
      projectPath,
      executeTool
    );

    return hashResult.success ? hashResult.output.trim() : '';
  } catch (error) {
    console.error('❌ Error getting commit hash:', error);
    return '';
  }
}

/**
 * Create a conversation-specific branch following append-only strategy
 */
export async function createConversationBranch(
  projectPath: string,
  conversationId: string,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>,
  options: {
    interactionCount?: number;
    baseBranch?: string;
  } = {}
): Promise<ConversationBranchResult> {
  try {
    console.log(`🌿 Creating conversation branch for ${conversationId}`);

    // Get interaction count
    const interactionCount = options.interactionCount || 
      await getNextInteractionCount(projectPath, conversationId, serverId, executeTool);

    // Determine base branch - CRITICAL: Find the EXACT previous step
    let baseBranch = options.baseBranch;
    if (!baseBranch) {
      if (interactionCount === 1) {
        // First interaction always starts from main
        baseBranch = 'main';
      } else {
        // Find the immediate previous step (step-{interactionCount-1})
        const previousStepBranch = `conv-${conversationId}-step-${interactionCount - 1}`;
        
        // Verify the previous step exists
        const branchCheckResult = await executeGitCommand(
          serverId,
          `git show-ref --verify --quiet refs/heads/${previousStepBranch}`,
          projectPath,
          executeTool
        );
        
        if (branchCheckResult.success) {
          baseBranch = previousStepBranch;
          console.log(`✅ Found previous step: ${previousStepBranch}`);
        } else {
          // Previous step doesn't exist, find the latest existing step
          const latestBranch = await getLatestConversationBranch(projectPath, conversationId, serverId, executeTool);
          baseBranch = latestBranch || 'main';
          console.log(`⚠️ Previous step ${previousStepBranch} not found, using latest: ${baseBranch}`);
        }
      }
    }

    console.log(`📋 Using base branch: ${baseBranch} for interaction ${interactionCount}`);

    // CRITICAL: Always checkout the base branch first to ensure proper incremental building
    console.log(`🔄 Checking out base branch: ${baseBranch}`);
    const checkoutResult = await executeGitCommand(
      serverId,
      `git checkout ${baseBranch}`,
      projectPath,
      executeTool
    );

    if (!checkoutResult.success) {
      console.error(`❌ Failed to checkout ${baseBranch}:`, checkoutResult.error);
      console.log(`🔄 Falling back to main branch`);
      const mainCheckoutResult = await executeGitCommand(serverId, 'git checkout main', projectPath, executeTool);
      if (!mainCheckoutResult.success) {
        return {
          success: false,
          error: `Failed to checkout any base branch: ${mainCheckoutResult.error}`
        };
      }
      baseBranch = 'main';
    }

    console.log(`✅ Successfully checked out base branch: ${baseBranch}`);

    // Get starting hash (before any changes)
    const startingHash = await getCurrentCommitHash(projectPath, serverId, executeTool);

    // Create new branch name
    const newBranchName = `conv-${conversationId}-step-${interactionCount}`;

    console.log(`🌿 Creating new conversation branch: ${newBranchName}`);

    // Create and checkout new branch
    const createResult = await executeGitCommand(
      serverId,
      `git checkout -b ${newBranchName}`,
      projectPath,
      executeTool
    );

    if (!createResult.success) {
      return {
        success: false,
        error: `Failed to create branch ${newBranchName}: ${createResult.error}`
      };
    }

    // Verify the new branch was created successfully and get its starting state
    const verifyResult = await executeGitCommand(
      serverId,
      'git branch --show-current',
      projectPath,
      executeTool
    );

    if (!verifyResult.success || verifyResult.output.trim() !== newBranchName) {
      return {
        success: false,
        error: `Branch creation verification failed. Expected: ${newBranchName}, Got: ${verifyResult.output?.trim()}`
      };
    }

    // Get the actual current hash after creating the branch
    const actualHash = await getCurrentCommitHash(projectPath, serverId, executeTool);

    const branchInfo: ConversationBranchInfo = {
      branchName: newBranchName,
      conversationId,
      interactionCount,
      baseBranch,
      startingHash: actualHash, // Use actual hash after branch creation
      createdAt: Date.now()
    };

    console.log(`✅ Created conversation branch: ${newBranchName} (step ${interactionCount})`);
    console.log(`   - Base branch: ${baseBranch}`);
    console.log(`   - Starting hash: ${actualHash.substring(0, 8)}`);
    console.log(`   - This branch will build incrementally on: ${baseBranch}`);

    return {
      success: true,
      branchInfo
    };

  } catch (error) {
    console.error('❌ Error creating conversation branch:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Update conversation branches in project JSON
 */
export function updateConversationJSON(
  projectData: any,
  conversationId: string,
  branchInfo: ConversationBranchInfo
): any {
  // Initialize conversations structure if it doesn't exist
  if (!projectData.conversations) {
    projectData.conversations = [];
  }

  // Find or create conversation entry
  let conversation = projectData.conversations.find((c: any) => c.conversationId === conversationId);
  
  if (!conversation) {
    conversation = {
      conversationId,
      createdAt: Date.now(),
      branches: [],
      currentBranch: null
    };
    projectData.conversations.push(conversation);
  }

  // Add new branch info
  conversation.branches.push({
    branchName: branchInfo.branchName,
    baseBranch: branchInfo.baseBranch,
    startingHash: branchInfo.startingHash,
    interactionIndex: branchInfo.interactionCount,
    createdAt: branchInfo.createdAt,
    commitHash: branchInfo.commitHash || null
  });

  // Update current branch
  conversation.currentBranch = branchInfo.branchName;

  // Also add to main branches array with conversation metadata
  if (!projectData.branches) {
    projectData.branches = [];
  }

  // Check if branch already exists in main branches array
  const existingBranchIndex = projectData.branches.findIndex((b: any) => b.branchName === branchInfo.branchName);
  
  const branchEntry = {
    branchName: branchInfo.branchName,
    commitHash: branchInfo.commitHash || branchInfo.startingHash,
    commitMessage: `Conversation ${conversationId} - Step ${branchInfo.interactionCount}`,
    timestamp: branchInfo.createdAt,
    author: 'Conversation System',
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    isMainBranch: false,
    tags: [`conversation-${conversationId}`, `step-${branchInfo.interactionCount}`],
    sync: {
      lastPushed: null,
      pushedHash: null,
      needsSync: false,
      syncError: null
    },
    conversation: {
      conversationId,
      interactionCount: branchInfo.interactionCount,
      baseBranch: branchInfo.baseBranch
    }
  };

  if (existingBranchIndex >= 0) {
    projectData.branches[existingBranchIndex] = branchEntry;
  } else {
    projectData.branches.push(branchEntry);
  }

  return projectData;
} 