/**
 * Conversation Branch Switching Service
 * Handles switching between conversation branches and syncing frontend with git state
 * 🚀 CORE FEATURE: Maps conversations to branches and switches repos accordingly
 */

import { executeGitCommand } from './gitService';
import { getProjectPath } from './projectPathService';

export interface ConversationBranch {
  branchName: string;
  conversationId: string;
  commitHash: string;
  timestamp: number;
  messageCount: number;
  filesChanged: string[];
  isActive: boolean;
}

export interface BranchSwitchResult {
  success: boolean;
  currentBranch: string;
  files: string[];
  error?: string;
}

/**
 * Get all conversation branches for a project
 */
export const getConversationBranches = async (
  projectId: string,
  projectName: string,
  mcpServerId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<ConversationBranch[]> => {
  try {
    const projectPath = getProjectPath(projectId, projectName);
    
    // Get all branches that start with "conversation/"
    const branchResult = await executeGitCommand(
      mcpServerId,
      'git branch -a --format="%(refname:short),%(objectname),%(authordate:unix)"',
      projectPath,
      executeTool
    );
    
    if (!branchResult.success) {
      console.warn('Failed to get branches:', branchResult.output);
      return [];
    }
    
    const branches: ConversationBranch[] = [];
    const lines = branchResult.output.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      const [branchName, commitHash, timestamp] = line.split(',');
      
      if (branchName && branchName.startsWith('conversation/')) {
        // Extract conversation ID from branch name (format: conversation/YYYYMMDD-HHMM or conversation/conversationId)
        const conversationId = branchName.replace('conversation/', '');
        
        // Get files changed in this branch compared to main
        const filesResult = await executeGitCommand(
          mcpServerId,
          `git diff --name-only main..${branchName}`,
          projectPath,
          executeTool
        );
        
        const filesChanged = filesResult.success ? 
          filesResult.output.split('\n').filter(f => f.trim()) : [];
        
        branches.push({
          branchName,
          conversationId,
          commitHash: commitHash?.substring(0, 8) || '',
          timestamp: parseInt(timestamp) || Date.now(),
          messageCount: 0, // TODO: Extract from commit messages
          filesChanged,
          isActive: false
        });
      }
    }
    
    return branches.sort((a, b) => b.timestamp - a.timestamp);
    
  } catch (error) {
    console.error('Error getting conversation branches:', error);
    return [];
  }
};

/**
 * Switch to a specific conversation branch
 */
export const switchToConversationBranch = async (
  projectId: string,
  projectName: string,
  branchName: string,
  mcpServerId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<BranchSwitchResult> => {
  try {
    const projectPath = getProjectPath(projectId, projectName);
    
    // Switch to the branch
    const switchResult = await executeGitCommand(
      mcpServerId,
      `git checkout ${branchName}`,
      projectPath,
      executeTool
    );
    
    if (!switchResult.success) {
      return {
        success: false,
        currentBranch: '',
        files: [],
        error: `Failed to switch to branch: ${switchResult.output}`
      };
    }
    
    // Get current branch to confirm
    const currentBranchResult = await executeGitCommand(
      mcpServerId,
      'git branch --show-current',
      projectPath,
      executeTool
    );
    
    // Get list of files in current state
    const filesResult = await executeGitCommand(
      mcpServerId,
      'git ls-files',
      projectPath,
      executeTool
    );
    
    const files = filesResult.success ? 
      filesResult.output.split('\n').filter(f => f.trim()) : [];
    
    console.log(`✅ Successfully switched to conversation branch: ${branchName}`);
    
    return {
      success: true,
      currentBranch: currentBranchResult.output?.trim() || branchName,
      files,
    };
    
  } catch (error) {
    console.error('Error switching conversation branch:', error);
    return {
      success: false,
      currentBranch: '',
      files: [],
      error: `Unexpected error: ${error}`
    };
  }
};

/**
 * Get current active branch
 */
export const getCurrentBranch = async (
  projectId: string,
  projectName: string,
  mcpServerId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<string> => {
  try {
    const projectPath = getProjectPath(projectId, projectName);
    
    const result = await executeGitCommand(
      mcpServerId,
      'git branch --show-current',
      projectPath,
      executeTool
    );
    
    return result.success ? result.output.trim() : 'main';
    
  } catch (error) {
    console.error('Error getting current branch:', error);
    return 'main';
  }
};

/**
 * Get files for a specific branch without switching to it
 */
export const getFilesForBranch = async (
  projectId: string,
  projectName: string,
  branchName: string,
  mcpServerId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<string[]> => {
  try {
    const projectPath = getProjectPath(projectId, projectName);
    
    const result = await executeGitCommand(
      mcpServerId,
      `git ls-tree -r --name-only ${branchName}`,
      projectPath,
      executeTool
    );
    
    return result.success ? 
      result.output.split('\n').filter(f => f.trim()) : [];
    
  } catch (error) {
    console.error('Error getting files for branch:', error);
    return [];
  }
}; 