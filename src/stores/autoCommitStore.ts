import { create } from 'zustand';
import { useStore } from './rootStore';
import { useCheckpointStore } from './checkpointStore';
// 🔓 RESTORED: Branch creation imports for automatic branching integration
import { useBranchStore } from './branchStore';
// import { shouldCreateCheckpoint, createAutoCheckpoint } from '../lib/checkpointRollbackService';
import { pushToRemote, autoSetupGitHub, executeGitCommand } from '../lib/gitService';
import { persistentStorage } from '../lib/persistentStorageService';
import { getProjectPath } from '../lib/projectPathService';
import { Checkpoint } from '../types/Checkpoint';
import { logDebug, logAutoCommit, logFileChange } from '../lib/debugStorageService';
import { 
  createConversationBranch, 
  updateConversationJSON,
  type ConversationBranchInfo 
} from '../lib/conversationBranchService';

export interface AutoCommitConfig {
  enabled: boolean;
  triggers: {
    afterToolExecution: boolean;
    afterSuccessfulBuild: boolean; 
    afterTestSuccess: boolean;
    onFileChanges: boolean;
    timeBased: boolean;
  };
  conditions: {
    minimumChanges: number; // Minimum number of file changes before commit
    delayAfterLastChange: number; // Wait time (ms) after last change before committing
    skipConsecutiveCommits: boolean; // Skip if last commit was very recent
    requiredKeywords: string[]; // Only commit if tool output contains these keywords
  };
  commitMessageTemplate: string;
  autoInitGit: boolean; // Automatically initialize git for new projects
  autoPushToRemote: boolean; // Automatically push commits to remote
  // 🌿 NEW: Branch management configuration
  branchManagement?: {
    enabled: boolean;
    fileThreshold: number; // Minimum files changed to trigger branch creation
    lineThreshold: number; // Minimum lines changed to trigger branch creation
    branchPrefix: string; // Prefix for auto-created branches (e.g., "auto")
    keepHistory: boolean; // Whether to retain auto-created branches
  };
}

export interface AutoCommitContext {
  projectId: string;
  projectPath: string;
  conversationId?: string; // Add conversation ID for branch tracking
  trigger: 'tool_execution' | 'file_change' | 'build_success' | 'test_success' | 'timer';
  toolName?: string;
  summary?: string;
}

export interface AutoCommitState {
  config: AutoCommitConfig;
  isProcessing: boolean;
  lastCommitTimestamp: number | null;
  pendingChanges: Set<string>;
  lastCommitHash: string | null;
  lastPushTimestamp: number | null;
  
  // 🔒 IMPROVED: Better concurrency control
  activeOperations: Map<string, Promise<boolean>>;
  operationQueue: Map<string, AutoCommitContext[]>;

  updateConfig: (updates: Partial<AutoCommitConfig>) => void;
  shouldAutoCommit: (context: AutoCommitContext) => boolean;
  executeAutoCommit: (context: AutoCommitContext) => Promise<boolean>;
  trackFileChange: (filePath: string) => void;
  clearPendingChanges: () => void;
}

// 🔒 FIXED: Improved default configuration for better auto-branch creation
const DEFAULT_CONFIG: AutoCommitConfig = {
  enabled: true,
  triggers: {
    afterToolExecution: true,
    afterSuccessfulBuild: true,
    afterTestSuccess: true,
    onFileChanges: true,
    timeBased: false,
  },
  conditions: {
    minimumChanges: 1, // Keep at 1 for responsiveness
    delayAfterLastChange: 1000, // 1 second delay (reduced for Docker compatibility)
    skipConsecutiveCommits: false, // Disable to allow rapid commits during development
    requiredKeywords: [], // No keyword filtering by default
  },
  commitMessageTemplate: 'Auto-commit: {trigger} - {summary}',
  autoInitGit: true,
  autoPushToRemote: true,  // ✅ Enable auto-push for immediate branch pushing
  // 🌿 NEW: Enable auto-branch creation with 2-file threshold
  branchManagement: {
    enabled: true,
    fileThreshold: 2, // Create branch when 2+ files change (as requested by user)
    lineThreshold: 30, // Or when 30+ lines change (lowered for responsiveness)
    branchPrefix: 'auto',
    keepHistory: true
  }
};

/**
 * Generates a commit message based on context and configuration
 * @param context Auto-commit context
 * @param config Auto-commit configuration
 * @param branchName Optional branch name if auto-branch was created
 */
const generateCommitMessage = (
  context: AutoCommitContext,
  config: AutoCommitConfig,
  branchName: string | null
): string => {
  let message = config.commitMessageTemplate;
  
  // Replace placeholders
  message = message.replace('{trigger}', context.trigger);
  message = message.replace('{summary}', context.summary || 'changes detected');
  message = message.replace('{toolName}', context.toolName || 'unknown');
  message = message.replace('{timestamp}', new Date().toISOString());
  
  // Add branch info if available
  if (branchName) {
    message += ` (branch: ${branchName})`;
  }
  
  return message;
};

/**
 * 🚀 OPTIMIZED: Get project path dynamically
 * @param projectId Project ID
 * @param projectName Optional project name
 */
const getAutoCommitProjectPath = (projectId: string, projectName?: string): string => {
  return getProjectPath(projectId, projectName);
};

export const useAutoCommitStore = create<AutoCommitState>((set, get) => ({
  config: DEFAULT_CONFIG,
  isProcessing: false,
  lastCommitTimestamp: null,
  pendingChanges: new Set(),
  lastCommitHash: null,
  lastPushTimestamp: null,
  
  // 🔒 IMPROVED: Better concurrency control
  activeOperations: new Map(),
  operationQueue: new Map(),

  updateConfig: (updates) => {
    set(state => ({
      config: { ...state.config, ...updates }
    }));
  },

  shouldAutoCommit: (context: AutoCommitContext) => {
    const { config, lastCommitTimestamp, pendingChanges, isProcessing, activeOperations } = get();
    
    // 🚀 PERFORMANCE: Reduce logging overhead in hot path
    const shouldLogDetails = !context.toolName?.includes('git-') && !context.toolName?.includes('auto-');
    
    if (shouldLogDetails) {
      console.log('🔍 shouldAutoCommit check starting...');
      console.log('📋 Context:', { trigger: context.trigger, toolName: context.toolName, projectId: context.projectId });
      console.log('📋 State:', { enabled: config.enabled, pendingChanges: pendingChanges.size, isProcessing });
    }
    
    // 🔍 Debug logging
    logDebug('info', 'auto-commit', 'Auto-commit check starting', {
      config,
      context,
      lastCommitTimestamp,
      pendingChangesCount: pendingChanges.size,
      pendingChangesList: Array.from(pendingChanges),
      isProcessing,
      activeOperationsCount: activeOperations.size
    }, context.projectId);
    
    if (!config.enabled) {
      if (shouldLogDetails) {
        console.log('❌ shouldAutoCommit: disabled in config');
      }
      return false;
    }
    
    // 🔒 IMPROVED: Better operation tracking with timeout cleanup  
    if (isProcessing || activeOperations.has(context.projectId)) {
      if (shouldLogDetails) {
        console.log('❌ shouldAutoCommit: operation already in progress');
      }
      return false;
    }
    
    // Check if trigger is enabled
    switch (context.trigger) {
      case 'tool_execution':
        if (!config.triggers.afterToolExecution) {
          console.log('❌ shouldAutoCommit: afterToolExecution trigger disabled');
          return false;
        }
        console.log('✅ shouldAutoCommit: afterToolExecution trigger enabled');
        break;
      case 'build_success':
        if (!config.triggers.afterSuccessfulBuild) {
          console.log('❌ shouldAutoCommit: afterSuccessfulBuild trigger disabled');
          return false;
        }
        console.log('✅ shouldAutoCommit: afterSuccessfulBuild trigger enabled');
        break;
      case 'test_success':
        if (!config.triggers.afterTestSuccess) {
          console.log('❌ shouldAutoCommit: afterTestSuccess trigger disabled');
          return false;
        }
        console.log('✅ shouldAutoCommit: afterTestSuccess trigger enabled');
        break;
      case 'file_change':
        if (!config.triggers.onFileChanges) {
          console.log('❌ shouldAutoCommit: onFileChanges trigger disabled');
          return false;
        }
        console.log('✅ shouldAutoCommit: onFileChanges trigger enabled');
        break;
      case 'timer':
        if (!config.triggers.timeBased) {
          console.log('❌ shouldAutoCommit: timeBased trigger disabled');
          return false;
        }
        console.log('✅ shouldAutoCommit: timeBased trigger enabled');
        break;
    }
    
    // Check minimum changes
    console.log(`🔍 Checking minimum changes: ${pendingChanges.size} >= ${config.conditions.minimumChanges}`);
    if (pendingChanges.size < config.conditions.minimumChanges) {
      console.log('❌ shouldAutoCommit: not enough pending changes');
      logDebug('warn', 'auto-commit', 'Not enough pending changes for auto-commit', {
        pendingChangesCount: pendingChanges.size,
        requiredMinimum: config.conditions.minimumChanges,
        pendingChangesList: Array.from(pendingChanges)
      }, context.projectId);
      return false;
    }
    console.log('✅ shouldAutoCommit: minimum changes satisfied');
    logDebug('info', 'auto-commit', 'Minimum changes satisfied', {
      pendingChangesCount: pendingChanges.size,
      requiredMinimum: config.conditions.minimumChanges
    }, context.projectId);
    
    // Check consecutive commits
    console.log(`🕐 TIMING DEBUG: skipConsecutiveCommits=${config.conditions.skipConsecutiveCommits}, lastCommitTimestamp=${lastCommitTimestamp}`);
    if (config.conditions.skipConsecutiveCommits && lastCommitTimestamp) {
      const timeSinceLastCommit = Date.now() - lastCommitTimestamp;
      const minInterval = config.conditions.delayAfterLastChange * 2; // Double the delay for consecutive check
      
      console.log(`🕐 TIMING DEBUG: timeSinceLastCommit=${timeSinceLastCommit}ms, minInterval=${minInterval}ms`);
      
      if (timeSinceLastCommit < minInterval) {
        console.log(`❌ shouldAutoCommit: consecutive commit too soon (${timeSinceLastCommit}ms < ${minInterval}ms)`);
        return false;
      }
    } else {
      console.log(`🕐 TIMING DEBUG: Consecutive commit check SKIPPED (skipConsecutiveCommits=${config.conditions.skipConsecutiveCommits})`);
    }
    
    if (shouldLogDetails) {
      console.log('✅ shouldAutoCommit: all checks passed');
    }
    return true;
  },

  executeAutoCommit: async (context: AutoCommitContext): Promise<boolean> => {
    const { config, activeOperations, pendingChanges } = get();
    
    // 🚀 PERFORMANCE: Reduce logging for internal operations
    const shouldLogDetails = !context.toolName?.includes('git-') && !context.toolName?.includes('auto-');
    if (shouldLogDetails) {
      console.log('🚀 executeAutoCommit starting with context:', context);
    }
    
    // 🔍 Debug logging
    logDebug('info', 'auto-commit', 'Starting auto-commit execution', {
      context,
      pendingChangesCount: pendingChanges.size,
      pendingChangesList: Array.from(pendingChanges),
      config: config
    }, context.projectId);
    
    // 🔒 IMPROVED: Check if operation already active for this project
    if (activeOperations.has(context.projectId)) {
      if (shouldLogDetails) {
        console.log('⏭️ executeAutoCommit: Operation already active for project', context.projectId);
      }
      return await activeOperations.get(context.projectId)!;
    }
    
    // 🚀 PERFORMANCE: Global rate limiting - prevent excessive auto-commits
    const now = Date.now();
    const lastCommitTime = get().lastCommitTimestamp;
    if (lastCommitTime && (now - lastCommitTime) < 2000) { // 2 second minimum between commits
      if (shouldLogDetails) {
        console.log('⏰ executeAutoCommit: Rate limited - too soon since last commit');
      }
      return false;
    }
    
    // 🔒 IMPROVED: Create operation promise and track it - TIMEOUT REMOVED
    const operationPromise = (async (): Promise<boolean> => {
      set({ isProcessing: true });
      
      try {
        // Get store instances
        const rootStore = useStore.getState();
        const checkpointStore = useCheckpointStore.getState();
        
        const activeProject = rootStore.projects.find(p => p.id === context.projectId);
        if (!activeProject) {
          console.warn('❌ executeAutoCommit: Active project not found for auto-commit');
          return false;
        }
        console.log('✅ executeAutoCommit: Active project found:', activeProject.name);

        // Get active MCP servers
        const activeMcpServers = rootStore.servers.filter(server => 
          server.status === 'connected' && 
          activeProject.settings.mcpServerIds?.includes(server.id)
        );
        
        if (!activeMcpServers.length) {
          console.warn('❌ executeAutoCommit: No active MCP servers for auto-commit');
          return false;
        }
        console.log('✅ executeAutoCommit: Active MCP servers found:', activeMcpServers.length);
        
        const mcpServerId = activeMcpServers[0].id;
        
        // 🔒 FIXED: Simple git initialization with proper command execution
        if (config.autoInitGit) {
          try {
            console.log('🔧 executeAutoCommit: Checking git initialization...');
            
            // FIXED: Use executeGitCommand instead of direct BashCommand
            const gitCheckResult = await executeGitCommand(
              mcpServerId,
              'git rev-parse --is-inside-work-tree 2>/dev/null || echo "not-git"',
              context.projectPath,
              rootStore.executeTool
            );
            
            if (!gitCheckResult.success || gitCheckResult.output.includes('not-git')) {
              console.log('🔧 executeAutoCommit: Initializing git repository...');
              await checkpointStore.initializeGitRepository(
                context.projectPath,
                activeProject.name,
                mcpServerId,
                rootStore.executeTool
              );
            } else {
              console.log('✅ executeAutoCommit: Git repository already exists');
            }
          } catch (initError) {
            console.warn('⚠️ executeAutoCommit: Git init check failed:', initError);
          }
        }
        
        // 🔍 FIXED: Streamlined commit process - branch logic moved to createGitCommitWithBranchLogic
        console.log('💾 executeAutoCommit: Starting commit process...');
        
        // 🔍 FIXED: Use regular commit first, then handle branch creation post-commit  
        const commitMessage = generateCommitMessage(context, config, null);
        console.log('📝 executeAutoCommit: Generated commit message:', commitMessage);
        
        const commitHash = await checkpointStore.createGitCommit(
          context.projectPath,
          commitMessage,
          mcpServerId,
          rootStore.executeTool
        );
        console.log('💾 executeAutoCommit: Commit result:', commitHash);
        
        if (!commitHash || commitHash === 'no_changes') {
          console.log('⚠️ executeAutoCommit: Auto-commit skipped: no changes detected');
          return false;
        }
        
        if (commitHash === 'failed' || commitHash.startsWith('error:')) {
          console.error('❌ executeAutoCommit: Auto-commit failed:', commitHash);
          return false;
        }

        // 🔍 FIXED: Post-commit branch creation based on actual commit stats
        let actualBranchName = null;
        if (config.branchManagement?.enabled) {
          try {
            console.log('🔍 executeAutoCommit: Checking if auto-branch should be created post-commit...');
            console.log(`🔍 executeAutoCommit: Pending changes count: ${pendingChanges.size}`);
            
            // Check threshold based on pending changes first (for immediate tool executions)
            const pendingFileCount = pendingChanges.size;
            const threshold = config.branchManagement?.fileThreshold || 2;
            
            let shouldCreateBranch = false;
            let fileCount = 0;
            
            // Method 1: Check pending changes count (for multiple files in single tool execution)
            if (pendingFileCount >= threshold) {
              console.log(`✅ executeAutoCommit: Pending changes threshold met (${pendingFileCount} >= ${threshold})`);
              shouldCreateBranch = true;
              fileCount = pendingFileCount;
            } else {
              // Method 2: Check actual commit stats (fallback for git-detected changes)
              const commitStatsResult = await executeGitCommand(
                mcpServerId,
                `git show --stat --format="" ${commitHash}`,
                context.projectPath,
                rootStore.executeTool
              );
              
              if (commitStatsResult.success) {
                // Parse git show --stat output more carefully
                const statsOutput = commitStatsResult.output.trim();
                console.log(`🔍 executeAutoCommit: Raw git show --stat output:`, statsOutput);
                
                const statsLines = statsOutput.split('\n').filter(line => line.trim());
                
                // Count actual file change lines (those with | symbols indicating changes)
                const fileChangeLines = statsLines.filter(line => 
                  line.includes('|') && !line.includes('changed,') && !line.includes('insertion') && !line.includes('deletion')
                );
                
                const changedFileCount = fileChangeLines.length;
                fileCount = changedFileCount;
                
                console.log(`🔍 executeAutoCommit: Commit shows ${changedFileCount} files changed, threshold: ${threshold}`);
                console.log(`🔍 executeAutoCommit: File change lines:`, fileChangeLines);
                console.log(`🔍 executeAutoCommit: All stats lines:`, statsLines);
                
                if (changedFileCount >= threshold) {
                  console.log(`✅ executeAutoCommit: Commit file threshold met (${changedFileCount} >= ${threshold})`);
                  shouldCreateBranch = true;
                }
              } else {
                console.warn('⚠️ executeAutoCommit: Could not get commit stats for branch decision:', commitStatsResult.error);
              }
            }
            
            if (shouldCreateBranch) {
              // 🌿 NEW: Create conversation-specific branch instead of timestamp-based
              if (context.conversationId) {
                console.log(`🌿 executeAutoCommit: Creating conversation branch for ${context.conversationId}`);
                
                const branchResult = await createConversationBranch(
                  context.projectPath,
                  context.conversationId,
                  mcpServerId,
                  rootStore.executeTool
                );
                
                if (branchResult.success && branchResult.branchInfo) {
                  actualBranchName = branchResult.branchInfo.branchName;
                  console.log(`✅ executeAutoCommit: Successfully created conversation branch: ${actualBranchName}`);
                  
                  // Update conversation tracking in project JSON
                  try {
                    // We'll update the JSON after commit to include the commit hash
                    console.log(`📋 executeAutoCommit: Will update conversation JSON after commit`);
                  } catch (jsonError) {
                    console.warn('⚠️ executeAutoCommit: Failed to update conversation JSON:', jsonError);
                  }
                } else {
                  console.warn('⚠️ executeAutoCommit: Failed to create conversation branch:', branchResult.error);
                  actualBranchName = null;
                }
              } else {
                // Fallback to timestamp-based branch if no conversation ID
                console.log(`⚠️ executeAutoCommit: No conversation ID provided, falling back to timestamp branch`);
                const timestamp = new Date();
                const dateStr = timestamp.toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
                const randomSuffix = Math.random().toString(36).substring(2, 8); // Add random suffix to prevent duplicates
                actualBranchName = `auto/${dateStr}-${randomSuffix}`;
                
                console.log(`🌿 executeAutoCommit: Creating fallback auto-branch ${actualBranchName} for ${fileCount} files`);
                
                // Create branch from current commit
                const createBranchResult = await executeGitCommand(
                  mcpServerId,
                  `git checkout -b "${actualBranchName}"`,
                  context.projectPath,
                  rootStore.executeTool
                );
                
                if (!createBranchResult.success) {
                  console.warn('⚠️ executeAutoCommit: Failed to create fallback auto-branch:', createBranchResult.error || createBranchResult.output);
                  actualBranchName = null;
                } else {
                  console.log('✅ executeAutoCommit: Successfully created fallback auto-branch:', actualBranchName);
                }
              }
            } else {
              console.log(`❌ executeAutoCommit: File threshold not met (pending: ${pendingFileCount}, commit: ${fileCount}, threshold: ${threshold}), no auto-branch needed`);
            }
          } catch (branchError) {
            console.warn('⚠️ executeAutoCommit: Error in post-commit branch creation:', branchError);
          }
        }
        
        // 🔍 FIXED: Verify which branch we actually ended up on
        try {
          const currentBranchResult = await executeGitCommand(
            mcpServerId,
            'git branch --show-current',
            context.projectPath,
            rootStore.executeTool
          );
          
          console.log(`🔍 executeAutoCommit: Final branch check:`, currentBranchResult);
          
          if (currentBranchResult.success) {
            const finalBranch = currentBranchResult.output.trim();
            console.log(`🔍 executeAutoCommit: Currently on branch: ${finalBranch}`);
            
            // Update actualBranchName if we ended up on a different branch
            if (finalBranch && finalBranch !== 'main' && finalBranch.startsWith('auto/')) {
              actualBranchName = finalBranch;
            }
          }
        } catch (branchCheckError) {
          console.warn('⚠️ executeAutoCommit: Could not verify final branch:', branchCheckError);
        }

        // 🚀 NEW: Process enhanced commit with git diff + LLM message generation
        try {
          console.log('🤖 executeAutoCommit: ===== STARTING ENHANCED COMMIT PROCESSING =====');
          console.log('🤖 executeAutoCommit: Processing enhanced commit with diff and LLM...');
          console.log('🤖 executeAutoCommit: Commit hash:', commitHash);
          console.log('🤖 executeAutoCommit: Project path:', context.projectPath);
          console.log('🤖 executeAutoCommit: Conversation ID:', context.conversationId);
          console.log('🤖 executeAutoCommit: Branch name:', actualBranchName);
          
          const { processEnhancedCommit } = await import('../lib/enhancedConversationCommitService');
          console.log('🤖 executeAutoCommit: Enhanced commit service imported successfully');
          
          const enhancedRequest = {
            projectPath: context.projectPath,
            conversationId: context.conversationId || 'auto-commit',
            branchName: actualBranchName || 'main',
            commitHash: commitHash,
            originalMessage: commitMessage,
            projectSettings: activeProject.settings,
            serverId: mcpServerId,
            executeTool: rootStore.executeTool
          };

          console.log('🤖 executeAutoCommit: Enhanced request object:', JSON.stringify({
            ...enhancedRequest,
            executeTool: '[FUNCTION]' // Don't log the function
          }, null, 2));
          
          console.log('🤖 executeAutoCommit: Project settings for LLM:', JSON.stringify({
            provider: activeProject.settings.provider,
            hasAnthropicKey: !!activeProject.settings.anthropicApiKey,
            hasOpenAIKey: !!activeProject.settings.openaiApiKey,
            hasOpenRouterKey: !!activeProject.settings.openRouterApiKey,
            hasLegacyKey: !!activeProject.settings.apiKey,
            
            model: 'claude-3-haiku-20241022',
          }, null, 2));

          console.log('🤖 executeAutoCommit: Calling processEnhancedCommit...');
          const enhancedResult = await processEnhancedCommit(enhancedRequest);
          console.log('🤖 executeAutoCommit: Enhanced commit result:', JSON.stringify(enhancedResult, null, 2));
          
          if (enhancedResult.success) {
            console.log('✅ executeAutoCommit: Enhanced commit processed successfully');
            console.log(`   LLM Message: "${enhancedResult.commitInfo?.llmGeneratedMessage}"`);
            console.log(`   Files Changed: ${enhancedResult.commitInfo?.filesChanged.length}`);
            console.log(`   Lines: +${enhancedResult.commitInfo?.linesAdded}/-${enhancedResult.commitInfo?.linesRemoved}`);
            console.log(`   Processing Time: ${enhancedResult.metrics?.totalProcessingTime}ms`);

            // 🚀 NEW: Update the actual git commit message with LLM-generated message
            if (enhancedResult.commitInfo?.llmGeneratedMessage) {
              try {
                console.log('📝 executeAutoCommit: Updating git commit message with LLM-generated message...');
                console.log(`📝 Original: "${commitMessage}"`);
                console.log(`📝 Enhanced: "${enhancedResult.commitInfo.llmGeneratedMessage}"`);
                
                const amendResult = await executeGitCommand(
                  mcpServerId,
                  `git commit --amend -m "${enhancedResult.commitInfo.llmGeneratedMessage.replace(/"/g, '\\"')}"`,
                  context.projectPath,
                  rootStore.executeTool
                );
                
                if (amendResult.success) {
                  console.log('✅ executeAutoCommit: Successfully updated git commit message with LLM-generated message!');
                } else {
                  console.warn('⚠️ executeAutoCommit: Failed to amend commit message:', amendResult.error);
                }
              } catch (amendError) {
                console.warn('⚠️ executeAutoCommit: Error amending commit message:', amendError);
              }
            }

            // Force update of project JSON to include enhanced commit data
            try {
              console.log('📝 executeAutoCommit: Triggering project JSON update with enhanced data...');
              
              // Log enhanced commit data for verification
              if (enhancedResult.commitInfo?.llmGeneratedMessage) {
                console.log('📝 executeAutoCommit: Enhanced commit data available:');
                console.log('📝 LLM Generated Message:', enhancedResult.commitInfo.llmGeneratedMessage);
                console.log('📝 Files Changed:', enhancedResult.commitInfo.filesChanged.length);
                console.log('📝 Lines Added/Removed:', `+${enhancedResult.commitInfo.linesAdded}/-${enhancedResult.commitInfo.linesRemoved}`);
                console.log('📝 Git Diff Length:', enhancedResult.commitInfo.diff.length);
              }
              
              // Add a small delay to ensure enhanced processing is complete
              await new Promise(resolve => setTimeout(resolve, 500));
              
              console.log('📝 executeAutoCommit: Calling project JSON generation API...');
              const generateResponse = await fetch(`/api/projects/${context.projectId}/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
              });
              
              if (generateResponse.ok) {
                console.log('✅ executeAutoCommit: Project JSON regenerated successfully');
                
                // Verify the update by checking if enhanced data is present
                try {
                  const responseData = await generateResponse.json();
                  console.log('📝 executeAutoCommit: Project JSON regeneration result:', {
                    success: responseData.success,
                    branchCount: responseData.data?.branches?.length || 0,
                    conversationCount: responseData.data?.conversations?.length || 0,
                    fileSize: responseData.fileSize
                  });
                  
                  // Check if any branches have enhanced commit data
                  const branchesWithCommits = responseData.data?.branches?.filter((b: any) => 
                    b.commits && b.commits.length > 0
                  ) || [];
                  
                  const branchesWithLLMMessages = branchesWithCommits.filter((b: any) => 
                    b.commits.some((c: any) => c.llmGeneratedMessage)
                  );
                  
                  console.log('📝 executeAutoCommit: Enhanced commit verification:', {
                    branchesWithCommits: branchesWithCommits.length,
                    branchesWithLLMMessages: branchesWithLLMMessages.length,
                    hasConversations: (responseData.data?.conversations?.length || 0) > 0
                  });
                  
                  if (branchesWithLLMMessages.length > 0) {
                    console.log('✅ executeAutoCommit: Enhanced commit data successfully integrated into JSON!');
                  } else {
                    console.warn('⚠️ executeAutoCommit: No enhanced commit data found in regenerated JSON');
                  }
                  
                } catch (readError) {
                  console.log('✅ executeAutoCommit: Project JSON updated (couldn\'t verify enhanced data)');
                }
              } else {
                console.warn('⚠️ executeAutoCommit: Project JSON regeneration failed:', await generateResponse.text());
              }
            } catch (jsonError) {
              console.warn('⚠️ executeAutoCommit: Failed to trigger project JSON update:', jsonError);
            }
            
          } else {
            console.warn('⚠️ executeAutoCommit: Enhanced commit processing failed:', enhancedResult.error);
            if (enhancedResult.warnings) {
              enhancedResult.warnings.forEach(warning => console.warn(`   Warning: ${warning}`));
            }
          }
        } catch (enhancedError) {
          console.error('❌ executeAutoCommit: Enhanced commit processing threw error:', enhancedError);
          // Continue with regular auto-commit even if enhanced processing fails
        }

        // 💾 NEW: Save auto-commit to persistent storage
        const finalCommitMessage = generateCommitMessage(context, config, actualBranchName);
        try {
          const checkpoint: Checkpoint = {
            id: `auto_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            projectId: context.projectId,
            timestamp: new Date(),
            description: finalCommitMessage,
            commitHash: commitHash,
            tags: ['auto'],
            snapshotData: {
              project: activeProject,
              files: [] // File snapshots can be added later if needed
            }
          };
          
          await persistentStorage.createCheckpoint(checkpoint);
          console.log('✅ executeAutoCommit: Auto-commit saved to persistent storage');
        } catch (storageError) {
          console.error('⚠️ executeAutoCommit: Failed to save auto-commit to persistent storage:', storageError);
          // Continue anyway - the Git commit succeeded
        }

        // Success! Store the full commit hash and clear operation state
        const timestamp = Date.now();
        set({ 
          lastCommitTimestamp: timestamp,
          pendingChanges: new Set(), // Clear tracked changes after successful commit
          lastCommitHash: commitHash
        });
        
        console.log('🧹 executeAutoCommit: Cleared pending changes after successful commit');
        
        console.log('✅ Auto-commit completed and stored:', {
          commitHash,
          timestamp,
          projectId: context.projectId
        });
        
        console.log(`✅ executeAutoCommit: Auto-commit successful: ${finalCommitMessage} (${commitHash})`);
        
        // 🌿 NEW: Update conversation JSON if this was a conversation branch
        if (actualBranchName && actualBranchName.startsWith('conv-') && context.conversationId) {
          try {
            console.log('📋 executeAutoCommit: Updating conversation JSON with commit hash...');
            
            // Create a branch info object for JSON update
            const branchInfo: ConversationBranchInfo = {
              branchName: actualBranchName,
              conversationId: context.conversationId,
              interactionCount: parseInt(actualBranchName.split('-step-')[1]) || 1,
              baseBranch: 'main', // This would be set correctly in createConversationBranch
              startingHash: '', // This would be set correctly in createConversationBranch  
              createdAt: Date.now(),
              commitHash: commitHash
            };
            
            // We'll update the JSON via the project generation API which already handles this
            console.log('📋 executeAutoCommit: Conversation branch info ready for JSON update');
            
          } catch (convError) {
            console.warn('⚠️ executeAutoCommit: Failed to prepare conversation JSON update:', convError);
          }
        }
        
        // 🚀 AUTO-TRIGGER GITHUB SYNC AFTER SUCCESSFUL COMMIT
        setTimeout(async () => {
          try {
            console.log('🔄 Starting GitHub sync process after auto-commit...');
            
            // Step 1: Ensure JSON file exists by generating it first
            console.log('📋 Generating project JSON file before sync...');
            const generateResponse = await fetch(`/api/projects/${context.projectId}/generate`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              }
            });
            
            if (generateResponse.ok) {
              console.log('✅ Project JSON file generated successfully');
              
              // Step 2: Wait a bit more for file system to sync
              await new Promise(resolve => setTimeout(resolve, 1000));
              
              // Step 3: Now trigger GitHub sync with JSON file guaranteed to exist
              console.log('🚀 Triggering GitHub sync with JSON file ready...');
              const syncResponse = await fetch('/api/github-sync/trigger', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  projectId: context.projectId,
                  immediate: true
                }),
              });
              
              if (syncResponse.ok) {
                const result = await syncResponse.json();
                console.log('✅ Auto GitHub sync completed:', result.message);
                if (result.remoteUrl) {
                  console.log('🔗 Pushed to repository:', result.remoteUrl);
                }
              } else {
                const errorText = await syncResponse.text();
                console.log('⚠️ GitHub sync failed:', errorText);
              }
              
            } else {
              console.log('⚠️ Failed to generate project JSON, skipping GitHub sync');
            }
            
          } catch (error) {
            console.log('⚠️ Could not complete GitHub sync process:', error);
          }
        }, 3000); // 3 second delay + JSON generation ensures proper timing
        
        // 🔍 Debug logging success
        logAutoCommit(
          context.projectId,
          context.projectPath,
          context.trigger,
          context.toolName || 'unknown',
          Array.from(pendingChanges),
          true,
          undefined,
          commitHash,
          actualBranchName || undefined
        );
        
        // 🧹 Clear pending changes after successful commit
        const { clearPendingChanges } = get();
        clearPendingChanges();
        console.log('🧹 Cleared pending changes after successful auto-commit');
        
        // 🔗 NEW: Trigger commit tracking integration for revert buttons
        try {
          // Dispatch a custom event to notify other parts of the app about the new commit
          window.dispatchEvent(new CustomEvent('autoCommitCreated', {
            detail: {
              commitHash,
              projectId: context.projectId,
              projectPath: context.projectPath,
              message: finalCommitMessage,
              timestamp,
              trigger: context.trigger,
              branchName: actualBranchName // Include branch info for UI updates
            }
          }));
          console.log('📡 executeAutoCommit: Auto-commit event dispatched');
          
          // 🌿 NEW: If auto-branch was created, also trigger branch refresh
          if (actualBranchName) {
            window.dispatchEvent(new CustomEvent('newBranchDetected', {
              detail: {
                projectId: context.projectId,
                commitHash: commitHash,
                timestamp: timestamp,
                branchName: actualBranchName,
                trigger: 'auto-commit'
              }
            }));
            console.log('🌿 executeAutoCommit: New branch detection event dispatched for:', actualBranchName);
          }
        } catch (eventError) {
          console.warn('⚠️ executeAutoCommit: Failed to dispatch auto-commit event:', eventError);
        }
        
        // Auto-push if enabled
        console.log(`📤 AUTO-PUSH DEBUG: Config check - autoPushToRemote = ${config.autoPushToRemote}`);
        if (config.autoPushToRemote) {
          try {
            console.log('📤 AUTO-PUSH DEBUG: Auto-pushing to remote...');
            
            // 🔧 FIX: Get current branch using proper git service
            console.log('📤 AUTO-PUSH DEBUG: Getting current branch...');
            
            // Use gitService.executeGitCommand which handles thread_id initialization properly
            const { executeGitCommand, pushAllBranches } = await import('../lib/gitService');
            const branchResult = await executeGitCommand(
              mcpServerId,
              'git branch --show-current', 
              context.projectPath,
              rootStore.executeTool
            );
            
            console.log(`📤 AUTO-PUSH DEBUG: Branch command result: "${branchResult.output}"`);
            
            let currentBranch = null; // Don't fallback to 'main' if detection fails
            if (branchResult.success && branchResult.output && !branchResult.output.includes('error')) {
              const branchMatch = branchResult.output.match(/([^\s]+)/);
              if (branchMatch && branchMatch[1]) {
                currentBranch = branchMatch[1].trim();
              }
            }
            
            // 🚨 CRITICAL: If we can't detect current branch, skip auto-push
            if (!currentBranch) {
              console.warn(`⚠️ AUTO-PUSH DEBUG: Could not detect current branch, skipping auto-push to prevent pushing wrong branch`);
              console.warn(`⚠️ AUTO-PUSH DEBUG: Branch detection result:`, branchResult);
              return false; // Exit early with explicit boolean return
            }
            
            console.log(`📤 AUTO-PUSH DEBUG: Detected current branch: '${currentBranch}'`);
            
            // 🚀 NEW: Push all conversation branches, not just current one
            console.log(`📤 AUTO-PUSH DEBUG: Pushing all conversation and auto branches...`);
            const pushAllResult = await pushAllBranches(
              context.projectPath,
              mcpServerId,
              rootStore.executeTool
            );
            
            console.log(`📤 AUTO-PUSH DEBUG: Push all branches result:`, pushAllResult);
            
            if (!pushAllResult.success && pushAllResult.error?.includes('No remote origin configured')) {
              console.log('🔧 executeAutoCommit: No remote origin found, checking if GitHub setup is allowed...');
              
              const setupResult = await autoSetupGitHub(
                context.projectPath,
                activeProject.id,
                activeProject.name,
                mcpServerId,
                rootStore.executeTool,
                activeProject.settings.enableGitHub || false
              );
              
              if (setupResult.success) {
                console.log('✅ executeAutoCommit: GitHub setup successful:', setupResult.repoUrl);
                set({ lastPushTimestamp: Date.now() });
              } else {
                console.warn('⚠️ executeAutoCommit: GitHub setup failed:', setupResult.error);
              }
            } else if (pushAllResult.success) {
              console.log('✅ executeAutoCommit: Auto-push successful:', pushAllResult.output);
              set({ lastPushTimestamp: Date.now() });
            } else {
              console.warn('⚠️ executeAutoCommit: Auto-push failed:', pushAllResult.error || pushAllResult.output);
            }
          } catch (pushError) {
            console.warn('⚠️ executeAutoCommit: Auto-push failed:', pushError);
          }
        }
        
        return true;
        
      } catch (error) {
        console.error('❌ executeAutoCommit: Auto-commit execution failed:', error);
        // Record error for diagnostics
        if (typeof error === 'object' && error !== null) {
          console.error('❌ executeAutoCommit: Error details:', error);
        }
        
        // 🔍 Debug logging failure
        logAutoCommit(
          context.projectId,
          context.projectPath,
          context.trigger,
          context.toolName || 'unknown',
          Array.from(pendingChanges),
          false,
          error instanceof Error ? error.message : String(error)
        );
        
        logDebug('error', 'auto-commit', 'Auto-commit execution failed', {
          context,
          error: error instanceof Error ? error.message : String(error),
          pendingChangesCount: pendingChanges.size
        }, context.projectId);
        
        return false;
      } finally {
        // Always clear the timeout and reset processing state
        // clearTimeout(processingTimeout); // Removed as per edit hint
        set({ isProcessing: false });
        
        // 🔒 CRITICAL: Ensure operation tracking is cleaned up even on errors
        set(state => {
          const newActiveOperations = new Map(state.activeOperations);
          newActiveOperations.delete(context.projectId);
          return { activeOperations: newActiveOperations };
        });
        
        console.log('🧹 executeAutoCommit: Cleanup completed, isProcessing reset to false, operation tracking cleared');
        
        return true; // Return success
      }
    })();
    
    set(state => ({
      activeOperations: new Map(state.activeOperations).set(context.projectId, operationPromise)
    }));
    
    try {
      const result = await operationPromise;
      return result || false;
    } finally {
      // 🔒 REMOVED: Cleanup now happens inside the operation promise to avoid race conditions
      // Operation tracking cleanup is handled in the inner finally block
      console.log('🔒 executeAutoCommit: Outer cleanup - operation promise completed');
    }
  },

  trackFileChange: (filePath: string) => {
    console.log('📁 trackFileChange: Adding file to pending changes:', filePath);
    
    // 🔍 Debug logging
    const { activeProjectId } = useStore.getState();
    logFileChange(
      activeProjectId || 'unknown',
      filePath,
      'created',
      'FileWriteOrEdit',
      true
    );
    
    set(state => {
      const newPendingChanges = new Set([...state.pendingChanges, filePath]);
      console.log('📁 trackFileChange: Total pending changes:', newPendingChanges.size);
      
      // 🔍 Debug logging
      logDebug('info', 'auto-commit', `File change tracked: ${filePath} (total: ${newPendingChanges.size})`, {
        filePath,
        totalPendingChanges: newPendingChanges.size,
        allPendingChanges: Array.from(newPendingChanges)
      }, activeProjectId || 'unknown');
      
      return { pendingChanges: newPendingChanges };
    });
  },

  clearPendingChanges: () => {
    set({ pendingChanges: new Set() });
  },
})); 