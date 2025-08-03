/**
 * Enhanced Conversation Commit Service
 * 
 * Integrates git diff generation, LLM-powered commit messages, and conversation branch management.
 * Provides a complete solution for automatically tracking and documenting changes in conversation branches.
 * 
 * Features:
 * - Automatic git diff generation for each commit
 * - LLM-generated commit messages using project settings
 * - Robust error handling and fallback mechanisms
 * - JSON metadata storage with full commit history
 * - Integration with existing conversation branch system
 */

import {
  createConversationCommit,
  addCommitToConversationJSON,
  ConversationCommitInfo
} from './conversationBranchService';
import { generateCommitDiff } from './gitDiffService';
import { generateLLMCommitMessage } from './llmCommitMessageGenerator';
import { ProjectSettings } from '../components/LlmChat/context/types';

export interface EnhancedCommitRequest {
  projectPath: string;
  conversationId: string;
  branchName: string;
  commitHash: string;
  originalMessage: string;
  projectSettings: ProjectSettings;
  serverId: string;
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>;
}

export interface EnhancedCommitResult {
  success: boolean;
  commitInfo?: ConversationCommitInfo;
  error?: string;
  warnings?: string[];
  metrics?: {
    diffGenerationTime?: number;
    llmGenerationTime?: number;
    totalProcessingTime: number;
    filesChanged: number;
    linesChanged: number;
  };
}

export interface CommitProcessingOptions {
  enableLLMGeneration?: boolean;
  fallbackOnLLMFailure?: boolean;
  enableDiffGeneration?: boolean;
  maxRetries?: number;
  timeoutMs?: number;
}

const DEFAULT_OPTIONS: Required<CommitProcessingOptions> = {
  enableLLMGeneration: true,
  fallbackOnLLMFailure: true,
  enableDiffGeneration: true,
  maxRetries: 3,
  timeoutMs: 30000
};

/**
 * Process a commit with full enhancement (diff + LLM message generation)
 */
export async function processEnhancedCommit(
  request: EnhancedCommitRequest,
  options: CommitProcessingOptions = {}
): Promise<EnhancedCommitResult> {
  const startTime = Date.now();
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const warnings: string[] = [];
  
  try {
    console.log('🚀 enhancedConversationCommitService: ===== ENHANCED COMMIT SERVICE CALLED =====');
    console.log(`🚀 Processing enhanced commit ${request.commitHash.substring(0, 8)} for conversation ${request.conversationId}`);
    console.log('🔍 Request details:', {
      projectPath: request.projectPath,
      conversationId: request.conversationId,
      branchName: request.branchName,
      commitHash: request.commitHash.substring(0, 8),
      originalMessage: request.originalMessage,
      hasProjectSettings: !!request.projectSettings,
      serverId: request.serverId
    });
    console.log('🔍 Project settings details:', {
      provider: request.projectSettings?.provider,
      hasAnthropicKey: !!request.projectSettings?.anthropicApiKey,
      hasOpenAIKey: !!request.projectSettings?.openaiApiKey,
      hasOpenRouterKey: !!request.projectSettings?.openRouterApiKey,
      model: request.projectSettings?.model
    });

    // Step 1: Create the enhanced commit with diff and LLM generation
    console.log('📝 Step 1: Creating enhanced commit with diff and LLM generation...');
    const commitResult = await createConversationCommitWithRetry(request, opts, warnings);
    console.log('📝 Step 1 result:', commitResult.success ? 'SUCCESS' : 'FAILED', commitResult.error || '');
    
    if (!commitResult.success) {
      return {
        success: false,
        error: commitResult.error,
        warnings,
        metrics: {
          totalProcessingTime: Date.now() - startTime,
          filesChanged: 0,
          linesChanged: 0
        }
      };
    }

    const commitInfo = commitResult.commitInfo!;
    
    // Calculate metrics
    const metrics = {
      diffGenerationTime: commitResult.diffGenerationTime,
      llmGenerationTime: commitResult.llmGenerationTime,
      totalProcessingTime: Date.now() - startTime,
      filesChanged: commitInfo.filesChanged.length,
      linesChanged: commitInfo.linesAdded + commitInfo.linesRemoved
    };

    console.log(`✅ Enhanced commit processed successfully:
      - Commit: ${commitInfo.hash.substring(0, 8)}
      - Files: ${metrics.filesChanged}
      - Lines: +${commitInfo.linesAdded}/-${commitInfo.linesRemoved}
      - LLM Message: ${commitInfo.llmGeneratedMessage ? '✓' : '✗'}
      - Processing Time: ${metrics.totalProcessingTime}ms`);

    // Step 2: Store enhanced commit data in project JSON
    try {
      console.log('📝 Step 2: Storing enhanced commit data in project JSON...');
      
      // Use Node.js built-in modules for better reliability
      const path = require('path');
      const fs = require('fs');
      const jsonFilePath = path.join(request.projectPath, '.kibitz', 'api', 'project.json');
      
      console.log('📝 Looking for project JSON at:', jsonFilePath);
      
      if (fs.existsSync(jsonFilePath)) {
        console.log('📝 Found existing project JSON, updating with enhanced commit data...');
        
        try {
          const projectDataRaw = fs.readFileSync(jsonFilePath, 'utf8');
          const projectData = JSON.parse(projectDataRaw);
          console.log('📝 Successfully read project JSON, size:', projectDataRaw.length, 'bytes');
          console.log('📝 Project has', projectData.branches?.length || 0, 'branches');
          
          // Initialize branches array if it doesn't exist
          if (!projectData.branches) {
            projectData.branches = [];
            console.log('📝 Initialized empty branches array');
          }
          
          // Find the branch and update it with enhanced commit data
          let branchIndex = -1;
          if (request.branchName) {
            branchIndex = projectData.branches.findIndex((b: any) => b.branchName === request.branchName);
          }
          if (branchIndex < 0 && request.commitHash) {
            branchIndex = projectData.branches.findIndex((b: any) => b.commitHash === request.commitHash);
          }
          
          if (branchIndex >= 0) {
            console.log('📝 Found branch at index', branchIndex, ':', projectData.branches[branchIndex].branchName);
            const branch = projectData.branches[branchIndex];
            
            // Update branch with enhanced commit data
            if (commitInfo.llmGeneratedMessage) {
              const oldMessage = branch.commitMessage;
              branch.commitMessage = commitInfo.llmGeneratedMessage;
              console.log('📝 Updated commit message from:', oldMessage, 'to:', commitInfo.llmGeneratedMessage);
            }
            
            // Add to commits array
            if (!branch.commits) {
              branch.commits = [];
              console.log('📝 Initialized commits array for branch');
            }
            
            // Check if this commit already exists
            const existingCommitIndex = branch.commits.findIndex((c: any) => c.hash === commitInfo.hash);
            
            if (existingCommitIndex >= 0) {
              // Update existing commit
              branch.commits[existingCommitIndex] = commitInfo;
              console.log('📝 Updated existing commit at index', existingCommitIndex);
            } else {
              // Add new commit
              branch.commits.push(commitInfo);
              console.log('📝 Added new commit to array, total commits:', branch.commits.length);
            }
            
            // Update diffData
            branch.diffData = {
              gitDiff: commitInfo.diff,
              llmProvider: commitInfo.llmProvider,
              llmModel: commitInfo.llmModel,
              llmGeneratedMessage: commitInfo.llmGeneratedMessage,
              llmError: commitInfo.llmError
            };
            console.log('📝 Updated diffData with LLM info');
            
            // Update other branch metadata
            branch.filesChanged = commitInfo.filesChanged;
            branch.linesAdded = commitInfo.linesAdded;
            branch.linesRemoved = commitInfo.linesRemoved;
            branch.timestamp = new Date(commitInfo.timestamp).getTime();
            
            // Save updated project JSON with better error handling
            const updatedJson = JSON.stringify(projectData, null, 2);
            fs.writeFileSync(jsonFilePath, updatedJson, 'utf8');
            
            // Verify the write
            if (fs.existsSync(jsonFilePath)) {
              const verifySize = fs.statSync(jsonFilePath).size;
              console.log('✅ Successfully updated project JSON with enhanced commit data, new size:', verifySize, 'bytes');
            } else {
              throw new Error('File disappeared after write');
            }
            
          } else {
            console.warn('⚠️ Could not find branch in project JSON to update');
            console.log('📝 Available branches:', projectData.branches.map((b: any) => b.branchName));
            console.log('📝 Looking for branch:', request.branchName, 'or commit:', request.commitHash?.substring(0, 8));
            
            // Create a new branch entry if it doesn't exist
            const newBranch = {
              branchName: request.branchName || `unknown-${Date.now()}`,
              commitHash: request.commitHash,
              commitMessage: commitInfo.llmGeneratedMessage || commitInfo.message,
              timestamp: new Date(commitInfo.timestamp).getTime(),
              author: commitInfo.author,
              filesChanged: commitInfo.filesChanged,
              linesAdded: commitInfo.linesAdded,
              linesRemoved: commitInfo.linesRemoved,
              isMainBranch: false,
              tags: [],
              sync: {
                lastPushed: null,
                pushedHash: null,
                needsSync: false,
                syncError: null
              },
              commits: [commitInfo],
              diffData: {
                gitDiff: commitInfo.diff,
                llmProvider: commitInfo.llmProvider,
                llmModel: commitInfo.llmModel,
                llmGeneratedMessage: commitInfo.llmGeneratedMessage,
                llmError: commitInfo.llmError
              }
            };
            
            projectData.branches.push(newBranch);
            console.log('📝 Created new branch entry:', newBranch.branchName);
            
            // Save the updated JSON
            const updatedJson = JSON.stringify(projectData, null, 2);
            fs.writeFileSync(jsonFilePath, updatedJson, 'utf8');
            console.log('✅ Successfully added new branch to project JSON');
          }
          
        } catch (parseError) {
          console.error('❌ Failed to parse/update project JSON:', parseError);
          warnings.push(`Failed to parse project JSON file: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
        }
        
      } else {
        console.log('📝 Project JSON not found, enhanced data will be included in next generation');
        warnings.push('Project JSON file not found for immediate update');
      }
      
    } catch (jsonError) {
      console.error('❌ Failed to integrate enhanced commit data with project JSON:', jsonError);
      warnings.push(`Failed to store enhanced commit data in project JSON: ${jsonError instanceof Error ? jsonError.message : 'Unknown error'}`);
    }

    return {
      success: true,
      commitInfo,
      warnings: warnings.length > 0 ? warnings : undefined,
      metrics
    };

  } catch (error) {
    console.error('❌ Fatal error processing enhanced commit:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown fatal error',
      warnings,
      metrics: {
        totalProcessingTime: Date.now() - startTime,
        filesChanged: 0,
        linesChanged: 0
      }
    };
  }
}

/**
 * Create conversation commit with retry logic and comprehensive error handling
 */
async function createConversationCommitWithRetry(
  request: EnhancedCommitRequest,
  options: Required<CommitProcessingOptions>,
  warnings: string[]
): Promise<{
  success: boolean;
  commitInfo?: ConversationCommitInfo;
  error?: string;
  diffGenerationTime?: number;
  llmGenerationTime?: number;
}> {
  let lastError: string | undefined;

  for (let attempt = 1; attempt <= options.maxRetries; attempt++) {
    try {
      const attemptStartTime = Date.now();
      
      console.log(`🔄 Attempt ${attempt}/${options.maxRetries} for commit ${request.commitHash.substring(0, 8)}`);

      // Create the commit with timeout
      const commitPromise = createConversationCommit(
        request.projectPath,
        request.conversationId,
        request.commitHash,
        request.originalMessage,
        request.projectSettings,
        request.serverId,
        request.executeTool
      );

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Commit processing timeout')), options.timeoutMs);
      });

      const result = await Promise.race([commitPromise, timeoutPromise]);

      if (result.success) {
        const processingTime = Date.now() - attemptStartTime;
        console.log(`✅ Commit created successfully on attempt ${attempt} (${processingTime}ms)`);
        
        // Parse timing information if available (would need to be added to createConversationCommit)
        return {
          success: true,
          commitInfo: result.commitInfo,
          diffGenerationTime: undefined, // Would be set by createConversationCommit if timing was added
          llmGenerationTime: undefined   // Would be set by createConversationCommit if timing was added
        };
      } else {
        lastError = result.error;
        warnings.push(`Attempt ${attempt} failed: ${result.error}`);
        
        if (attempt < options.maxRetries) {
          const retryDelay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff, max 5s
          console.log(`⏳ Retrying in ${retryDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }

    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Unknown error';
      warnings.push(`Attempt ${attempt} threw error: ${lastError}`);
      
      if (attempt < options.maxRetries) {
        const retryDelay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.log(`⏳ Retrying after error in ${retryDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  return {
    success: false,
    error: `All ${options.maxRetries} attempts failed. Last error: ${lastError}`
  };
}

/**
 * Update project JSON with commit information
 */
export async function updateProjectJSONWithCommit(
  projectData: any,
  conversationId: string,
  branchName: string,
  commitInfo: ConversationCommitInfo
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`📝 Updating project JSON with commit ${commitInfo.hash.substring(0, 8)}`);
    
    const updatedProjectData = addCommitToConversationJSON(
      projectData,
      conversationId,
      branchName,
      commitInfo
    );

    console.log(`✅ Project JSON updated successfully`);
    
    return { success: true };

  } catch (error) {
    console.error('❌ Error updating project JSON:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Validate project settings for LLM commit generation
 */
export function validateLLMSettings(projectSettings: ProjectSettings): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check if provider is configured
  if (!projectSettings.provider) {
    errors.push('No LLM provider configured');
  }

  // Check if model is specified
  if (!projectSettings.model) {
    warnings.push('No model specified, will use default');
  }

  // Check API key based on provider
  switch (projectSettings.provider) {
    case 'anthropic':
      if (!projectSettings.anthropicApiKey && !projectSettings.apiKey) {
        errors.push('No Anthropic API key configured');
      }
      break;
    case 'openai':
      if (!projectSettings.openaiApiKey) {
        errors.push('No OpenAI API key configured');
      }
      break;
    case 'openrouter':
      if (!projectSettings.openRouterApiKey) {
        errors.push('No OpenRouter API key configured');
      }
      break;
    default:
      errors.push(`Unsupported provider: ${projectSettings.provider}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Get detailed commit history for a conversation branch
 */
export function getConversationCommitHistory(
  projectData: any,
  conversationId: string,
  branchName?: string
): ConversationCommitInfo[] {
  const commits: ConversationCommitInfo[] = [];

  // Get commits from conversation-specific data
  if (projectData.conversations) {
    const conversation = projectData.conversations.find((c: any) => c.conversationId === conversationId);
    if (conversation && conversation.branches) {
      for (const branch of conversation.branches) {
        if (!branchName || branch.branchName === branchName) {
          if (branch.commits && Array.isArray(branch.commits)) {
            commits.push(...branch.commits);
          }
        }
      }
    }
  }

  // Sort by timestamp (newest first)
  return commits.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

/**
 * Generate summary statistics for conversation commits
 */
export function generateCommitStatistics(commits: ConversationCommitInfo[]): {
  totalCommits: number;
  totalFilesChanged: number;
  totalLinesAdded: number;
  totalLinesRemoved: number;
  llmGeneratedCount: number;
  llmSuccessRate: number;
  mostChangedFiles: { file: string; changes: number }[];
  commitsByProvider: Record<string, number>;
} {
  const fileChangeCounts: Record<string, number> = {};
  const providerCounts: Record<string, number> = {};
  
  let totalFilesChanged = 0;
  let totalLinesAdded = 0;
  let totalLinesRemoved = 0;
  let llmGeneratedCount = 0;

  for (const commit of commits) {
    totalLinesAdded += commit.linesAdded;
    totalLinesRemoved += commit.linesRemoved;
    
    if (commit.llmGeneratedMessage) {
      llmGeneratedCount++;
    }

    if (commit.llmProvider) {
      providerCounts[commit.llmProvider] = (providerCounts[commit.llmProvider] || 0) + 1;
    }

    for (const file of commit.filesChanged) {
      fileChangeCounts[file] = (fileChangeCounts[file] || 0) + 1;
      totalFilesChanged++;
    }
  }

  const mostChangedFiles = Object.entries(fileChangeCounts)
    .map(([file, changes]) => ({ file, changes }))
    .sort((a, b) => b.changes - a.changes)
    .slice(0, 10);

  return {
    totalCommits: commits.length,
    totalFilesChanged,
    totalLinesAdded,
    totalLinesRemoved,
    llmGeneratedCount,
    llmSuccessRate: commits.length > 0 ? (llmGeneratedCount / commits.length) * 100 : 0,
    mostChangedFiles,
    commitsByProvider: providerCounts
  };
}

/**
 * Health check for the enhanced commit system
 */
export async function performSystemHealthCheck(
  projectPath: string,
  projectSettings: ProjectSettings,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<{
  overall: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    gitAccess: boolean;
    llmConfig: boolean;
    mcpConnection: boolean;
  };
  details: string[];
}> {
  const checks = {
    gitAccess: false,
    llmConfig: false,
    mcpConnection: false
  };
  const details: string[] = [];

  try {
    // Test git access
    const gitTestResult = await generateCommitDiff(projectPath, 'HEAD', serverId, executeTool);
    checks.gitAccess = true;
    details.push('✅ Git access working');
  } catch (error) {
    details.push(`❌ Git access failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  // Test LLM configuration
  const llmValidation = validateLLMSettings(projectSettings);
  checks.llmConfig = llmValidation.isValid;
  if (llmValidation.isValid) {
    details.push('✅ LLM configuration valid');
  } else {
    details.push(`❌ LLM configuration invalid: ${llmValidation.errors.join(', ')}`);
  }

  // Test MCP connection
  try {
    await executeTool(serverId, 'BashCommand', {
      action_json: { command: 'echo "test"' },
      thread_id: 'health-check'
    });
    checks.mcpConnection = true;
    details.push('✅ MCP connection working');
  } catch (error) {
    details.push(`❌ MCP connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  // Determine overall health
  const healthyChecks = Object.values(checks).filter(Boolean).length;
  let overall: 'healthy' | 'degraded' | 'unhealthy';
  
  if (healthyChecks === 3) {
    overall = 'healthy';
  } else if (healthyChecks >= 2) {
    overall = 'degraded';
  } else {
    overall = 'unhealthy';
  }

  return { overall, checks, details };
} 