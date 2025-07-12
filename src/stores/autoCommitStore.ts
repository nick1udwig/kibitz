import { create } from 'zustand';
import { useStore } from './rootStore';
import { useCheckpointStore } from './checkpointStore';
// 🔓 RESTORED: Branch creation imports for automatic branching integration
import { useBranchStore } from './branchStore';
// import { shouldCreateCheckpoint, createAutoCheckpoint } from '../lib/checkpointRollbackService';
import { pushToRemote, autoSetupGitHub, executeGitCommand } from '../lib/gitService';
import { persistentStorage } from '../lib/persistentStorageService';
import { Checkpoint } from '../types/Checkpoint';

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

interface AutoCommitState {
  config: AutoCommitConfig;
  isProcessing: boolean;
  lastCommitTimestamp: number | null;
  pendingChanges: Set<string>; // Track files that have changed
  lastCommitHash: string | null;
  lastPushTimestamp: number | null;
  
  // 🔒 IMPROVED: Better concurrency control
  activeOperations: Map<string, Promise<boolean>>; // Track active operations by project
  operationQueue: Map<string, NodeJS.Timeout>; // Track debounce timeouts by project
  
  // Actions
  updateConfig: (updates: Partial<AutoCommitConfig>) => void;
  shouldAutoCommit: (context: AutoCommitContext) => boolean;
  executeAutoCommit: (context: AutoCommitContext) => Promise<boolean>;
  trackFileChange: (filePath: string) => void;
  clearPendingChanges: () => void;
}

export interface AutoCommitContext {
  projectId: string;
  projectPath: string;
  trigger: 'tool_execution' | 'build_success' | 'test_success' | 'file_change' | 'timer';
  toolName?: string;
  toolOutput?: string;
  changedFiles?: string[];
  buildOutput?: string;
  testResults?: string;
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
    delayAfterLastChange: 2000, // 2 seconds delay for debouncing
    skipConsecutiveCommits: true,
    requiredKeywords: [], // No keyword filtering by default
  },
  commitMessageTemplate: 'Auto-commit: {trigger} - {summary}',
  autoInitGit: true,
  autoPushToRemote: false,
  // 🌿 NEW: Enable auto-branch creation with lower thresholds
  branchManagement: {
    enabled: true,
    fileThreshold: 3, // Create branch when 3+ files change
    lineThreshold: 50, // Or when 50+ lines change
    branchPrefix: 'auto',
    keepHistory: true
  }
};

// Enhanced build detection
export const detectBuildSuccess = (toolName: string, toolOutput: string): boolean => {
  const toolNameLower = toolName.toLowerCase();
  const outputLower = toolOutput.toLowerCase();
  
  // Check for build-related tool names
  const isBuildTool = toolNameLower.includes('build') || 
                      toolNameLower.includes('compile') ||
                      toolNameLower.includes('npm') ||
                      toolNameLower.includes('yarn') ||
                      toolNameLower.includes('pnpm') ||
                      toolNameLower.includes('bun') ||
                      toolNameLower.includes('cargo') ||
                      toolNameLower.includes('make') ||
                      toolNameLower.includes('gradle') ||
                      toolNameLower.includes('maven');
  
  if (!isBuildTool) return false;
  
  // Check for successful completion indicators
  const successIndicators = [
    'completed successfully',
    'build successful',
    'compilation successful',
    'built successfully',
    'done in',
    'finished in',
    'success',
    'completed'
  ];
  
  // Check for failure indicators (which would override success)
  const failureIndicators = [
    'error',
    'failed',
    'failure',
    'compilation failed',
    'build failed',
    'exception',
    'fatal'
  ];
  
  const hasFailure = failureIndicators.some(indicator => 
    outputLower.includes(indicator)
  );
  
  if (hasFailure) return false;
  
  return successIndicators.some(indicator => 
    outputLower.includes(indicator)
  );
};

// Enhanced test detection
export const detectTestSuccess = (toolName: string, toolOutput: string): boolean => {
  const toolNameLower = toolName.toLowerCase();
  const outputLower = toolOutput.toLowerCase();
  
  // Check for test-related tool names
  const isTestTool = toolNameLower.includes('test') || 
                     toolNameLower.includes('jest') ||
                     toolNameLower.includes('mocha') ||
                     toolNameLower.includes('cypress') ||
                     toolNameLower.includes('playwright') ||
                     toolNameLower.includes('vitest') ||
                     toolNameLower.includes('pytest') ||
                     toolNameLower.includes('cargo test') ||
                     toolNameLower.includes('go test');
  
  if (!isTestTool) return false;
  
  // Check for test success indicators
  const successIndicators = [
    'all tests passed',
    'tests passed',
    'test passed',
    '✓',
    '✔',
    'passed',
    'ok',
    'success'
  ];
  
  const failureIndicators = [
    'failed',
    'failure',
    'error',
    'exception',
    '✗',
    '✖',
    'assertion'
  ];
  
  const hasFailure = failureIndicators.some(indicator => 
    outputLower.includes(indicator)
  );
  
  if (hasFailure) return false;
  
  return successIndicators.some(indicator => 
    outputLower.includes(indicator)
  );
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
    
    console.log('🔍 shouldAutoCommit check starting...');
    console.log('📋 Config:', config);
    console.log('📋 Context:', context);
    console.log('📋 Last commit timestamp:', lastCommitTimestamp);
    console.log('📋 Pending changes:', pendingChanges.size);
    
    if (!config.enabled) {
      console.log('❌ shouldAutoCommit: config.enabled is false');
      return false;
    }
    
    // 🔒 IMPROVED: Better operation tracking with timeout cleanup
    if (isProcessing) {
      console.log('❌ shouldAutoCommit: global isProcessing is true, blocking new auto-commit');
      return false;
    }
    
    if (activeOperations.has(context.projectId)) {
      console.log('❌ shouldAutoCommit: operation already in progress for project', context.projectId, 'blocking concurrent auto-commit');
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
      return false;
    }
    console.log('✅ shouldAutoCommit: minimum changes satisfied');
    
    // Check if too soon after last commit
    if (config.conditions.skipConsecutiveCommits && lastCommitTimestamp) {
      const timeSinceLastCommit = Date.now() - lastCommitTimestamp;
      console.log(`🔍 Checking consecutive commits: ${timeSinceLastCommit}ms since last commit, min delay: ${config.conditions.delayAfterLastChange}ms`);
      if (timeSinceLastCommit < config.conditions.delayAfterLastChange) {
        console.log('❌ shouldAutoCommit: too soon after last commit');
        return false;
      }
      console.log('✅ shouldAutoCommit: enough time since last commit');
    }
    
    // Check required keywords in tool output
    if (config.conditions.requiredKeywords.length > 0 && context.toolOutput) {
      console.log(`🔍 Checking required keywords: ${config.conditions.requiredKeywords} in output`);
      const hasRequiredKeyword = config.conditions.requiredKeywords.some(keyword =>
        context.toolOutput!.toLowerCase().includes(keyword.toLowerCase())
      );
      if (!hasRequiredKeyword) {
        console.log('❌ shouldAutoCommit: required keywords not found in output');
        return false;
      }
      console.log('✅ shouldAutoCommit: required keywords found');
    }
    
    console.log('✅ shouldAutoCommit: all conditions passed!');
    return true;
  },

  executeAutoCommit: async (context: AutoCommitContext) => {
    console.log('🚀 executeAutoCommit starting with context:', context);
    const { config, activeOperations } = get();
    
    // 🔒 IMPROVED: Check if operation already active for this project
    if (activeOperations.has(context.projectId)) {
      console.log('⏭️ executeAutoCommit: Operation already active for project', context.projectId, 'reusing existing promise');
      return await activeOperations.get(context.projectId)!;
    }
    
    // 🔒 IMPROVED: Create operation promise and track it - FIXED INLINE IMPLEMENTATION
    const operationPromise = (async () => {
      // Add timeout to prevent stuck processing state
      const processingTimeout = setTimeout(() => {
        console.error('⏰ executeAutoCommit: Timeout - forcing isProcessing reset');
        set({ isProcessing: false });
      }, 60000); // 60 second timeout
      
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
            
            // Get the commit details to count files
            const commitStatsResult = await executeGitCommand(
              mcpServerId,
              `git show --stat --format="" ${commitHash}`,
              context.projectPath,
              rootStore.executeTool
            );
            
            if (commitStatsResult.success) {
              const statsLines = commitStatsResult.output.trim().split('\n').filter(line => 
                line.trim() && !line.includes('changed,') && !line.includes('insertion') && !line.includes('deletion')
              );
              const changedFileCount = statsLines.length;
              const threshold = config.branchManagement?.fileThreshold || 3;
              
              console.log(`🔍 executeAutoCommit: Commit shows ${changedFileCount} files changed, threshold: ${threshold}`);
              console.log(`🔍 executeAutoCommit: Changed files:`, statsLines);
              
              if (changedFileCount >= threshold) {
                console.log(`✅ executeAutoCommit: File threshold met (${changedFileCount} >= ${threshold}), creating post-commit auto-branch`);
                
                // Generate auto-branch name with timestamp
                const timestamp = new Date();
                const dateStr = timestamp.toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
                actualBranchName = `auto/${dateStr}`;
                
                console.log('🌿 executeAutoCommit: Creating post-commit auto-branch:', actualBranchName);
                
                // Create branch from current commit
                const createBranchResult = await executeGitCommand(
                  mcpServerId,
                  `git checkout -b "${actualBranchName}"`,
                  context.projectPath,
                  rootStore.executeTool
                );
                
                if (!createBranchResult.success) {
                  console.warn('⚠️ executeAutoCommit: Failed to create post-commit auto-branch:', createBranchResult.error || createBranchResult.output);
                  actualBranchName = null;
                } else {
                  console.log('✅ executeAutoCommit: Successfully created post-commit auto-branch:', actualBranchName);
                }
              } else {
                console.log(`❌ executeAutoCommit: File threshold not met (${changedFileCount} < ${threshold}), no auto-branch needed`);
              }
            } else {
              console.warn('⚠️ executeAutoCommit: Could not get commit stats for branch decision:', commitStatsResult.error);
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
        if (config.autoPushToRemote) {
          try {
            console.log('📤 executeAutoCommit: Auto-pushing to remote...');
            
            const pushResult = await pushToRemote(
              context.projectPath,
              mcpServerId,
              rootStore.executeTool
            );
            
            if (!pushResult.success && pushResult.error?.includes('No remote origin configured')) {
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
            } else if (pushResult.success) {
              console.log('✅ executeAutoCommit: Auto-push successful:', pushResult.output);
              set({ lastPushTimestamp: Date.now() });
            } else {
              console.warn('⚠️ executeAutoCommit: Auto-push failed:', pushResult.error || pushResult.output);
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
        return false;
      } finally {
        // Always clear the timeout and reset processing state
        clearTimeout(processingTimeout);
        set({ isProcessing: false });
        
        // 🔒 CRITICAL: Ensure operation tracking is cleaned up even on errors
        set(state => {
          const newActiveOperations = new Map(state.activeOperations);
          newActiveOperations.delete(context.projectId);
          return { activeOperations: newActiveOperations };
        });
        
        console.log('🧹 executeAutoCommit: Cleanup completed, isProcessing reset to false, operation tracking cleared');
      }
    })();
    
    set(state => ({
      activeOperations: new Map(state.activeOperations).set(context.projectId, operationPromise)
    }));
    
    try {
      const result = await operationPromise;
      return result;
    } finally {
      // 🔒 REMOVED: Cleanup now happens inside the operation promise to avoid race conditions
      // Operation tracking cleanup is handled in the inner finally block
      console.log('🔒 executeAutoCommit: Outer cleanup - operation promise completed');
    }
  },

  trackFileChange: (filePath: string) => {
    console.log('📁 trackFileChange: Adding file to pending changes:', filePath);
    set(state => {
      const newPendingChanges = new Set([...state.pendingChanges, filePath]);
      console.log('📁 trackFileChange: Total pending changes:', newPendingChanges.size);
      return { pendingChanges: newPendingChanges };
    });
  },

  clearPendingChanges: () => {
    set({ pendingChanges: new Set() });
  },
}));

function generateCommitMessage(context: AutoCommitContext, config: AutoCommitConfig, branchName?: string | null): string {
  let summary = '';
  
  // 🆔 NEW: Get project context for scoped messages
  const rootStore = useStore.getState();
  const activeProject = rootStore.projects.find(p => p.id === context.projectId);
  const projectName = activeProject?.name || 'unknown';
  const projectPrefix = `[${projectName}]`;
  
  switch (context.trigger) {
    case 'tool_execution':
      summary = context.toolName ? `executed ${context.toolName}` : 'tool execution completed';
      // Enhanced detection for specific operations
      if (context.toolOutput && context.toolName) {
        const output = context.toolOutput.toLowerCase();
        const toolName = context.toolName.toLowerCase();
        
        if (detectBuildSuccess(context.toolName, context.toolOutput)) {
          summary = 'successful build completed';
        } else if (detectTestSuccess(context.toolName, context.toolOutput)) {
          summary = 'tests passed successfully';
        } else if (toolName.includes('install') && output.includes('package')) {
          summary = 'packages installed';
        } else if (toolName.includes('create') || toolName.includes('write')) {
          // Try to extract filename from tool output
          const fileMatch = context.toolOutput.match(/(?:created|wrote|saved|modified).*?([a-zA-Z0-9._-]+\.[a-zA-Z0-9]+)/i);
          if (fileMatch && fileMatch[1]) {
            summary = `created/modified ${fileMatch[1]}`;
          } else {
            summary = 'files created/modified';
          }
        }
      }
      break;
    case 'build_success':
      summary = 'successful build';
      break;
    case 'test_success':
      summary = 'tests passed';
      break;
    case 'file_change':
      summary = `${context.changedFiles?.length || 'multiple'} files changed`;
      break;
    case 'timer':
      summary = 'periodic checkpoint';
      break;
  }
  
  // 🆔 NEW: Create project-scoped commit message
  const baseMessage = config.commitMessageTemplate
    .replace('{trigger}', context.trigger.replace('_', ' '))
    .replace('{summary}', summary)
    .replace('{toolName}', context.toolName || '')
    .replace('{timestamp}', new Date().toISOString());
  
  // Add branch info if auto-branch was created
  const branchSuffix = branchName ? ` [${branchName}]` : '';
  
  // Add project prefix to ensure commit isolation
  return `${projectPrefix} ${baseMessage}${branchSuffix}`;
} 