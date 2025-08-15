/**
 * Conversation Branch Service
 * 
 * Manages conversation-specific branching to prevent hash ID conflicts
 * and maintain separate commit histories for each conversation.
 * 
 * Enhanced with git diff generation and LLM-powered commit messages.
 */

import { executeGitCommand } from './versionControl/git';
import { generateCommitDiff } from './gitDiffService';
import { generateLLMCommitMessage, CommitMessageRequest, CommitMessageResult } from './llmCommitMessageGenerator';
import { ProjectSettings } from '../components/LlmChat/context/types';

export interface ConversationCommitInfo {
  hash: string;
  parentHash: string;
  message: string;
  llmGeneratedMessage?: string;
  author: string;
  timestamp: string;
  diff: string;
  filesChanged: string[];
  linesAdded: number;
  linesRemoved: number;
  llmProvider?: string;
  llmModel?: string;
  llmError?: string;
}

export interface ConversationBranchInfo {
  branchName: string;
  conversationId: string;
  interactionCount: number;
  baseBranch: string;
  startingHash: string;
  createdAt: number;
  commitHash?: string;
  commits?: ConversationCommitInfo[];
}

export interface ProjectConversation {
  conversationId: string;
  currentBranch: string;
  branches: ConversationBranchInfo[];
}

export interface ProjectBranch {
  branchName: string;
  commitHash: string;
  commitMessage: string;
  timestamp: number;
  conversationId?: string;
  interactionCount?: number;
}

export interface ProjectData {
  conversations?: ProjectConversation[];
  branches?: ProjectBranch[];
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
        console.log(`🔍 Checking if previous step exists: ${previousStepBranch}`);
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
          console.log(`❌ Previous step ${previousStepBranch} not found, error:`, branchCheckResult.error);
          
          // Previous step doesn't exist, find the latest existing step
          const latestBranch = await getLatestConversationBranch(projectPath, conversationId, serverId, executeTool);
          baseBranch = latestBranch || 'main';
          console.log(`⚠️ Previous step ${previousStepBranch} not found, using latest: ${baseBranch}`);
          
          // List available branches for debugging
          const listBranchesResult = await executeGitCommand(
            serverId,
            'git branch -a',
            projectPath,
            executeTool
          );
          if (listBranchesResult.success) {
            console.log(`🔍 Available branches:`, listBranchesResult.output.split('\n').map(b => b.trim()).filter(b => b));
          }
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
      
      // 🚨 CRITICAL: Don't fall back to main for conversation steps > 1
      // This breaks the incremental workflow!
      if (interactionCount > 1) {
        console.error(`🚨 CRITICAL: Cannot create step ${interactionCount} without previous step ${baseBranch}!`);
        return {
          success: false,
          error: `Cannot create incremental step ${interactionCount}: previous step ${baseBranch} not found. This breaks the conversation workflow.`
        };
      }
      
      // Only fall back to main for step 1
      console.log(`🔄 Falling back to main branch (step 1 only)`);
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
 * Create commit with diff generation and LLM commit message
 */
export async function createConversationCommit(
  projectPath: string,
  conversationId: string,
  commitHash: string,
  originalMessage: string,
  projectSettings: ProjectSettings,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<{
  success: boolean;
  commitInfo?: ConversationCommitInfo;
  error?: string;
}> {
  try {
    console.log(`🔄 Processing commit ${commitHash.substring(0, 8)} for conversation ${conversationId}`);

    // Generate git diff for this commit
    const diffResult = await generateCommitDiff(projectPath, commitHash, serverId, executeTool);
    
    if (!diffResult.success) {
      console.warn(`⚠️ Failed to generate diff for commit ${commitHash}: ${diffResult.error}`);
      // Continue with basic commit info
    }

    // Get commit metadata
    const commitMetaResult = await executeGitCommand(
      serverId,
      `git show --format="%H|%P|%an|%aI" --no-patch ${commitHash}`,
      projectPath,
      executeTool
    );

    if (!commitMetaResult.success) {
      return {
        success: false,
        error: `Failed to get commit metadata: ${commitMetaResult.error}`
      };
    }

    const [hash, parentHash, author, timestamp] = commitMetaResult.output.trim().split('|');

    // Generate LLM commit message if diff is available
    let llmResult: CommitMessageResult | null = null;
    if (diffResult.success && diffResult.diff.trim()) {
      const commitRequest: CommitMessageRequest = {
        gitDiff: diffResult.diff,
        filesChanged: diffResult.filesChanged,
        linesAdded: diffResult.linesAdded,
        linesRemoved: diffResult.linesRemoved,
        branchName: `conv-${conversationId}`,
        conversationId,
        previousMessage: originalMessage
      };

      llmResult = await generateLLMCommitMessage(commitRequest, projectSettings);
      
      if (llmResult.success) {
        console.log(`🤖 Generated LLM commit message: "${llmResult.message}"`);
      } else {
        console.warn(`⚠️ LLM commit message generation failed: ${llmResult.error}`);
      }
    }

    // Create commit info object
    const commitInfo: ConversationCommitInfo = {
      hash,
      parentHash: parentHash || '',
      message: originalMessage,
      llmGeneratedMessage: llmResult?.success ? llmResult.message : undefined,
      author,
      timestamp,
      diff: diffResult.success ? diffResult.diff : '',
      filesChanged: diffResult.success ? diffResult.filesChanged : [],
      linesAdded: diffResult.success ? diffResult.linesAdded : 0,
      linesRemoved: diffResult.success ? diffResult.linesRemoved : 0,
      llmProvider: llmResult?.provider,
      llmModel: llmResult?.model,
      llmError: llmResult?.success ? undefined : llmResult?.error
    };

    console.log(`✅ conversationBranchService: Created commit info for ${hash.substring(0, 8)}: ${commitInfo.filesChanged.length} files, +${commitInfo.linesAdded}/-${commitInfo.linesRemoved} lines`);
    console.log(`✅ conversationBranchService: LLM message generated: ${llmResult?.success ? 'YES' : 'NO'}`);
    if (llmResult?.success) {
      console.log(`✅ conversationBranchService: LLM message: "${llmResult.message}"`);
    } else if (llmResult?.error) {
      console.log(`⚠️ conversationBranchService: LLM error: ${llmResult.error}`);
    }
    
    return {
      success: true,
      commitInfo
    };

  } catch (error) {
    console.error('❌ Error creating conversation commit:', error);
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
  projectData: ProjectData,
  conversationId: string,
  branchInfo: ConversationBranchInfo
): ProjectData {
  // Initialize conversations structure if it doesn't exist
  if (!projectData.conversations) {
    projectData.conversations = [];
  }

  // Find or create conversation entry
  let conversation = projectData.conversations.find((c: ProjectConversation) => c.conversationId === conversationId);
  
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
    commitHash: branchInfo.commitHash || null,
    commits: branchInfo.commits || []
  });

  // Update current branch
  conversation.currentBranch = branchInfo.branchName;

  // Also add to main branches array with conversation metadata
  if (!projectData.branches) {
    projectData.branches = [];
  }

  // Check if branch already exists in main branches array
  const existingBranchIndex = projectData.branches.findIndex((b: ProjectBranch) => b.branchName === branchInfo.branchName);
  
  // Get the latest commit info for summary data
  const latestCommit = branchInfo.commits && branchInfo.commits.length > 0 
    ? branchInfo.commits[branchInfo.commits.length - 1]
    : null;

  const branchEntry = {
    branchName: branchInfo.branchName,
    commitHash: branchInfo.commitHash || branchInfo.startingHash,
    commitMessage: latestCommit?.llmGeneratedMessage || latestCommit?.message || `Conversation ${conversationId} - Step ${branchInfo.interactionCount}`,
    timestamp: branchInfo.createdAt,
    author: latestCommit?.author || 'Conversation System',
    filesChanged: latestCommit?.filesChanged || [],
    linesAdded: latestCommit?.linesAdded || 0,
    linesRemoved: latestCommit?.linesRemoved || 0,
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
    },
    commits: branchInfo.commits || [],
    diffData: latestCommit ? {
      gitDiff: latestCommit.diff,
      llmProvider: latestCommit.llmProvider,
      llmModel: latestCommit.llmModel,
      llmGeneratedMessage: latestCommit.llmGeneratedMessage,
      llmError: latestCommit.llmError
    } : null
  };

  if (existingBranchIndex >= 0) {
    projectData.branches[existingBranchIndex] = branchEntry;
  } else {
    projectData.branches.push(branchEntry);
  }

  return projectData;
}

/**
 * Add commit information to existing conversation branch in project JSON
 */
export function addCommitToConversationJSON(
  projectData: ProjectData,
  conversationId: string,
  branchName: string,
  commitInfo: ConversationCommitInfo
): ProjectData {
  // Update conversation-specific data
  if (projectData.conversations) {
    const conversation = projectData.conversations.find((c: ProjectConversation) => c.conversationId === conversationId);
    if (conversation && conversation.branches) {
      const branch = conversation.branches.find((b: ConversationBranchInfo) => b.branchName === branchName);
      if (branch) {
        if (!branch.commits) {
          branch.commits = [];
        }
        branch.commits.push(commitInfo);
        
        // Update branch metadata
        branch.commitHash = commitInfo.hash;
        if (commitInfo.llmGeneratedMessage) {
          branch.lastLLMMessage = commitInfo.llmGeneratedMessage;
        }
      }
    }
  }

  // Update main branches array
  if (projectData.branches) {
    const branchIndex = projectData.branches.findIndex((b: ProjectBranch) => b.branchName === branchName);
    if (branchIndex >= 0) {
      const branch = projectData.branches[branchIndex];
      
      // Add commit to commits array
      if (!branch.commits) {
        branch.commits = [];
      }
      branch.commits.push(commitInfo);
      
      // Update branch summary with latest commit info
      branch.commitHash = commitInfo.hash;
      branch.commitMessage = commitInfo.llmGeneratedMessage || commitInfo.message;
      branch.author = commitInfo.author;
      branch.timestamp = new Date(commitInfo.timestamp).getTime();
      branch.filesChanged = commitInfo.filesChanged;
      branch.linesAdded = commitInfo.linesAdded;
      branch.linesRemoved = commitInfo.linesRemoved;
      
      console.log(`✅ conversationBranchService: Updated branch ${branchName} summary:`);
      console.log(`   - Commit Message: "${branch.commitMessage}"`);
      console.log(`   - LLM Generated: ${!!commitInfo.llmGeneratedMessage}`);
      console.log(`   - Files Changed: ${branch.filesChanged.length}`);
      console.log(`   - Lines: +${branch.linesAdded}/-${branch.linesRemoved}`);
      
      // Update diff data
      branch.diffData = {
        gitDiff: commitInfo.diff,
        llmProvider: commitInfo.llmProvider,
        llmModel: commitInfo.llmModel,
        llmGeneratedMessage: commitInfo.llmGeneratedMessage,
        llmError: commitInfo.llmError
      };
      
      console.log(`✅ Added commit ${commitInfo.hash.substring(0, 8)} to branch ${branchName} in project JSON`);
    }
  }

  return projectData;
}