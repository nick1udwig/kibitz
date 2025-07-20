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
    delayAfterLastChange: 3000, // 3 seconds delay for better batching of multiple files
    skipConsecutiveCommits: true,
    requiredKeywords: [], // No keyword filtering by default
  },
  commitMessageTemplate: 'Auto-commit: {trigger} - {summary}',
  autoInitGit: true,
  autoPushToRemote: false,
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
    
    console.log('🔍 shouldAutoCommit check starting...');
    console.log('📋 Config:', config);
    console.log('📋 Context:', context);
    console.log('📋 Last commit timestamp:', lastCommitTimestamp);
    console.log('📋 Pending changes:', pendingChanges.size);
    
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
      console.log('❌ shouldAutoCommit: config.enabled is false');
      logDebug('warn', 'auto-commit', 'Auto-commit disabled in config', { config }, context.projectId);
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
    if (config.conditions.skipConsecutiveCommits && lastCommitTimestamp) {
      const timeSinceLastCommit = Date.now() - lastCommitTimestamp;
      const minInterval = config.conditions.delayAfterLastChange * 2; // Double the delay for consecutive check
      
      if (timeSinceLastCommit < minInterval) {
        console.log(`❌ shouldAutoCommit: consecutive commit too soon (${timeSinceLastCommit}ms < ${minInterval}ms)`);
        return false;
      }
    }
    
    console.log('✅ shouldAutoCommit: all checks passed');
    return true;
  },

  executeAutoCommit: async (context: AutoCommitContext) => {
    console.log('🚀 executeAutoCommit starting with context:', context);
    const { config, activeOperations, pendingChanges } = get();
    
    // 🔍 Debug logging
    logDebug('info', 'auto-commit', 'Starting auto-commit execution', {
      context,
      pendingChangesCount: pendingChanges.size,
      pendingChangesList: Array.from(pendingChanges),
      config: config
    }, context.projectId);
    
    // 🔒 IMPROVED: Check if operation already active for this project
    if (activeOperations.has(context.projectId)) {
      console.log('⏭️ executeAutoCommit: Operation already active for project', context.projectId, 'reusing existing promise');
      return await activeOperations.get(context.projectId)!;
    }
    
    // 🔒 IMPROVED: Create operation promise and track it - TIMEOUT REMOVED
    const operationPromise = (async () => {
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
                const statsLines = commitStatsResult.output.trim().split('\n').filter(line => 
                  line.trim() && !line.includes('changed,') && !line.includes('insertion') && !line.includes('deletion')
                );
                const changedFileCount = statsLines.length;
                fileCount = changedFileCount;
                
                console.log(`🔍 executeAutoCommit: Commit shows ${changedFileCount} files changed, threshold: ${threshold}`);
                console.log(`🔍 executeAutoCommit: Changed files:`, statsLines);
                
                if (changedFileCount >= threshold) {
                  console.log(`✅ executeAutoCommit: Commit file threshold met (${changedFileCount} >= ${threshold})`);
                  shouldCreateBranch = true;
                }
              } else {
                console.warn('⚠️ executeAutoCommit: Could not get commit stats for branch decision:', commitStatsResult.error);
              }
            }
            
            if (shouldCreateBranch) {
              // Generate auto-branch name with timestamp
              const timestamp = new Date();
              const dateStr = timestamp.toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
              actualBranchName = `auto/${dateStr}`;
              
              console.log(`🌿 executeAutoCommit: Creating auto-branch ${actualBranchName} for ${fileCount} files`);
              
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