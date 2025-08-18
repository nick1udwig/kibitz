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
// import { generateLLMCommitMessage } from './llmCommitMessageGenerator';
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
  projectId?: string; // Ensure server route receives the correct project id for JSON updates
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

    // Step 1: Create commit info
    // If enableLLMGeneration is false, skip LLM generation and only collect metadata/diff
    console.log('📝 Step 1: Creating enhanced commit metadata' + (opts.enableLLMGeneration ? ' with LLM generation...' : ' (metadata-only)...'));
    const commitResult = opts.enableLLMGeneration
      ? await createConversationCommitWithRetry(request, opts, warnings)
      : await createCommitInfoWithoutLLM(request);
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
      diffGenerationTime: (commitResult as Record<string, unknown>).diffGenerationTime,
      llmGenerationTime: (commitResult as Record<string, unknown>).llmGenerationTime,
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

    // Step 2: Store enhanced commit data in project JSON via server route to avoid concurrent writes
    try {
      console.log('📝 Step 2: Sending enhanced commit data to server for JSON update...');
      // If API is not yet ready, buffer and retry to keep UI smooth
      const projectId = request.projectId || 'unknown';
      const apiUrl = `/api/projects/${encodeURIComponent(projectId)}/enhanced-commit`;
      const payload = { branchName: request.branchName, commitInfo };

      const doPost = async () => fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      let response: Response | null = null;
      try {
        response = await doPost();
      } catch {}
      
      if (!response || !response.ok) {
        console.log('🕒 Buffering enhanced-commit update for retry');
        // Buffer in-memory; a later call to generate API will flush via server
        (window as Record<string, unknown>).__kibitzBufferedEnhancedCommits = (window as Record<string, unknown>).__kibitzBufferedEnhancedCommits || {};
        const list = ((window as Record<string, unknown>).__kibitzBufferedEnhancedCommits as Record<string, unknown[]>)[projectId] || [];
        list.push(payload);
        ((window as Record<string, unknown>).__kibitzBufferedEnhancedCommits as Record<string, unknown[]>)[projectId] = list;
      }
    } catch (jsonError) {
      console.error('❌ Failed to send enhanced commit data to server:', jsonError);
      warnings.push('Failed to send enhanced commit data to server');
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
 * Enqueue enhanced processing in the background without blocking the caller.
 * Performs safe amend: only when HEAD equals the original commit hash.
 */
export function enqueueEnhancedProcessing(
  request: EnhancedCommitRequest,
  options: CommitProcessingOptions = {}
): void {
  setTimeout(async () => {
    try {
      const result = await processEnhancedCommit(request, options);
      if (!result.success) {
        console.warn('⚠️ enqueueEnhancedProcessing: Enhanced processing failed:', result.error);
        return;
      }

      // Skip amend in metadata-only mode; only attempt amend if LLM generation was enabled
      if ((options.enableLLMGeneration ?? DEFAULT_OPTIONS.enableLLMGeneration)) {
        try {
          const { executeGitCommand } = await import('./versionControl/git');
          const headRes = await executeGitCommand(
            request.serverId,
            'git rev-parse HEAD',
            request.projectPath,
            request.executeTool
          );
          const headHash = headRes.success ? headRes.output.trim() : '';
          const llmMsg = result.commitInfo?.llmGeneratedMessage;
          if (llmMsg && headHash === request.commitHash) {
            await executeGitCommand(
              request.serverId,
              `git commit --amend -m "${llmMsg.replace(/"/g, '\\"')}"`,
              request.projectPath,
              request.executeTool
            );
          }
        } catch (amendErr) {
          console.warn('⚠️ enqueueEnhancedProcessing: Amend skipped/failed:', amendErr);
        }
      }
    } catch (err) {
      console.error('❌ enqueueEnhancedProcessing: Unexpected error:', err);
    }
  }, 0);
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
 * Create commit info without LLM generation (metadata and diff only)
 */
async function createCommitInfoWithoutLLM(
  request: EnhancedCommitRequest
): Promise<{
  success: boolean;
  commitInfo?: ConversationCommitInfo;
  error?: string;
}> {
  try {
    // Generate git diff for this commit
    const diffResult = await generateCommitDiff(
      request.projectPath,
      request.commitHash,
      request.serverId,
      request.executeTool
    );

    // Get commit metadata
    const { executeGitCommand } = await import('./versionControl/git');
    const commitMetaRes = await executeGitCommand(
      request.serverId,
      `git show --format="%H|%P|%an|%aI" --no-patch ${request.commitHash}`,
      request.projectPath,
      request.executeTool
    );

    // Parse output from executeTool wrapper
    const metaOutput = commitMetaRes.output || '';
    const parsed = metaOutput.includes('"content"')
      ? (() => {
          try { const j = JSON.parse(metaOutput); return j.content?.[0]?.text || ''; } catch { return metaOutput; }
        })()
      : metaOutput;
    const line = parsed.trim().split('\n')[0];
    const [hash, parentHash, author, timestamp] = line.split('|');

    const commitInfo: ConversationCommitInfo = {
      hash,
      parentHash: parentHash || '',
      message: request.originalMessage,
      author,
      timestamp,
      diff: diffResult.success ? diffResult.diff : '',
      filesChanged: diffResult.success ? diffResult.filesChanged : [],
      linesAdded: diffResult.success ? diffResult.linesAdded : 0,
      linesRemoved: diffResult.success ? diffResult.linesRemoved : 0,
    } as ConversationCommitInfo;

    return { success: true, commitInfo };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

/**
 * Update project JSON with commit information
 */
export async function updateProjectJSONWithCommit(
  projectData: Record<string, unknown>,
  conversationId: string,
  branchName: string,
  commitInfo: ConversationCommitInfo
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`📝 Updating project JSON with commit ${commitInfo.hash.substring(0, 8)}`);
    
    addCommitToConversationJSON(
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
  projectData: Record<string, unknown>,
  conversationId: string,
  branchName?: string
): ConversationCommitInfo[] {
  const commits: ConversationCommitInfo[] = [];

  // Get commits from conversation-specific data
  if (projectData.conversations) {
    const conversation = projectData.conversations.find((c: Record<string, unknown>) => c.conversationId === conversationId);
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
    await generateCommitDiff(projectPath, 'HEAD', serverId, executeTool);
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