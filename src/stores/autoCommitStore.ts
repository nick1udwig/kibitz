import { create } from 'zustand';
import { useStore } from './rootStore';
import { useCheckpointStore } from './checkpointStore';
// 🔓 RESTORED: Branch creation imports for automatic branching integration
import { useBranchStore } from './branchStore';
// import { shouldCreateCheckpoint, createAutoCheckpoint } from '../lib/checkpointRollbackService';
import { executeGitCommand } from '../lib/versionControl/git';
import { persistentStorage } from '../lib/persistentStorageService';
import { getProjectPath } from '../lib/projectPathService';
import { Checkpoint } from '../types/Checkpoint';
import { logDebug, logAutoCommit, logFileChange } from '../lib/debugStorageService';
import { 
  createConversationBranch, 
  updateConversationJSON,
  type ConversationBranchInfo 
} from '../lib/conversationBranchService';
import { prepareCommit, executeCommit, pushCurrentBranch } from '../lib/versionControl';
import { isPushOrchestratorEnabled } from '../lib/featureFlags';

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
  // New helper APIs for clarity and testing
  createLocalCommit: (
    context: AutoCommitContext
  ) => Promise<{ commitHash: string | null; branchName: string | null; commitMessage: string }>;
  enqueueEnhanceAndSync: (
    context: AutoCommitContext,
    payload: { commitHash: string; branchName: string | null; commitMessage: string }
  ) => void;
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

  // Create a fast local commit and (optionally) auto-create a step-* branch
  createLocalCommit: async (context: AutoCommitContext) => {
    const { config, pendingChanges } = get();
    const rootStore = useStore.getState();
    const checkpointStore = useCheckpointStore.getState();

    const activeProject = rootStore.projects.find(p => p.id === context.projectId);
    if (!activeProject) {
      console.warn('❌ createLocalCommit: Active project not found');
      return { commitHash: null, branchName: null, commitMessage: '' };
    }

    const activeMcpServers = rootStore.servers.filter(server => 
      server.status === 'connected' && 
      activeProject.settings.mcpServerIds?.includes(server.id)
    );
    if (!activeMcpServers.length) {
      console.warn('❌ createLocalCommit: No active MCP servers');
      return { commitHash: null, branchName: null, commitMessage: '' };
    }
    const mcpServerId = activeMcpServers[0].id;

    // Ensure git repo
    if (config.autoInitGit) {
      try {
        const gitCheckResult = await executeGitCommand(
          mcpServerId,
          'git rev-parse --is-inside-work-tree 2>/dev/null || echo "not-git"',
          context.projectPath,
          rootStore.executeTool
        );
        if (!gitCheckResult.success || gitCheckResult.output.includes('not-git')) {
          await checkpointStore.initializeGitRepository(
            context.projectPath,
            activeProject.name,
            mcpServerId,
            rootStore.executeTool
          );
        }
      } catch {}
    }

    // Decide up front if we should create a conv-<id>-step-N branch for this commit
    let targetBranchName: string | null = null;
    if (config.branchManagement?.enabled && context.conversationId) {
      const pendingFileCount = pendingChanges.size;
      // Respect project UI-configured minimum if higher
      let threshold = config.branchManagement?.fileThreshold || 2;
      try {
        const rootStore = useStore.getState();
        const activeProject = rootStore.projects.find(p => p.id === context.projectId);
        const uiMin = activeProject?.settings?.minFilesForAutoCommitPush;
        if (typeof uiMin === 'number' && uiMin > threshold) threshold = uiMin;
      } catch {}
      if (pendingFileCount >= threshold) {
        try {
          const convPrefix = `conv-${context.conversationId}-step-`;
          // Determine next step number by scanning existing conv-* branches for this conversation
          const listRes = await executeGitCommand(
            mcpServerId,
            'git for-each-ref refs/heads --format="%(refname:short)"',
            context.projectPath,
            rootStore.executeTool
          );
          let highestStep = 0;
          if (listRes.success) {
            const names = listRes.output.split('\n').map(s => s.trim()).filter(Boolean);
            const stepNums = names
              .filter(n => n.startsWith(convPrefix))
              .map(n => (n.match(/step-(\d+)$/)?.[1]))
              .filter(Boolean)
              .map(n => parseInt(n as string, 10));
            if (stepNums.length > 0) highestStep = Math.max(...stepNums);
          }
          const baseBranch = highestStep === 0 
            ? 'main' 
            : `${convPrefix}${highestStep}`;
          // Checkout base branch; if missing and this is not the first step, fall back to main
          let baseOk = true;
          const coBase = await executeGitCommand(
            mcpServerId,
            `git checkout ${baseBranch}`,
            context.projectPath,
            rootStore.executeTool
          );
          if (!coBase.success) {
            if (baseBranch !== 'main') {
              const coMain = await executeGitCommand(
                mcpServerId,
                'git checkout main',
                context.projectPath,
                rootStore.executeTool
              );
              baseOk = coMain.success;
            } else {
              baseOk = false;
            }
          }
          if (baseOk) {
            const nextStep = highestStep + 1;
            targetBranchName = `${convPrefix}${nextStep}`;
            await executeGitCommand(
              mcpServerId,
              `git checkout -b ${targetBranchName}`,
              context.projectPath,
              rootStore.executeTool
            );
          }
        } catch {}
      }
    }

    // Prepare commit (stage + diff + LLM message) and execute
    const prep = await prepareCommit({
      projectPath: context.projectPath,
      serverId: mcpServerId,
      executeTool: rootStore.executeTool,
      projectSettings: activeProject.settings,
      branchName: targetBranchName,
      conversationId: context.conversationId || null
    });
    if (!prep.success) {
      return { commitHash: null, branchName: targetBranchName, commitMessage: '' };
    }
    const exec = await executeCommit({
      projectPath: context.projectPath,
      serverId: mcpServerId,
      executeTool: rootStore.executeTool,
      projectSettings: activeProject.settings,
      branchName: targetBranchName,
      conversationId: context.conversationId || null
    }, prep.commitMessage);
    if (!exec.success || !exec.commitHash || exec.commitHash === 'failed' || exec.commitHash.startsWith('error:')) {
      console.warn('❌ createLocalCommit: commit failed or returned error:', exec.commitHash);
      return { commitHash: null, branchName: targetBranchName, commitMessage: prep.commitMessage };
    }
    const commitHash = exec.commitHash;
    const commitMessage = prep.commitMessage;

    // Ensure we report the actual current branch if Git auto-switched
    try {
      const br = await executeGitCommand(mcpServerId, 'git branch --show-current', context.projectPath, rootStore.executeTool);
      if (br.success && br.output.trim()) {
        targetBranchName = br.output.trim();
      }
    } catch {}

    return { commitHash, branchName: targetBranchName, commitMessage };
  },

  // Background enhanced processing and optional sync/push (amend-safe)
  enqueueEnhanceAndSync: (context: AutoCommitContext, payload: { commitHash: string; branchName: string | null; commitMessage: string }) => {
    const rootStore = useStore.getState();
    const { config } = get();
    const activeProject = rootStore.projects.find(p => p.id === context.projectId);
    if (!activeProject) return;

    const activeMcpServers = rootStore.servers.filter(server => 
      server.status === 'connected' && 
      activeProject.settings.mcpServerIds?.includes(server.id)
    );
    if (!activeMcpServers.length) return;
    const mcpServerId = activeMcpServers[0].id;

    setTimeout(async () => {
      try {
        const { enqueueEnhancedProcessing } = await import('../lib/enhancedConversationCommitService');
        enqueueEnhancedProcessing({
          projectPath: context.projectPath,
          conversationId: context.conversationId || 'auto-commit',
          branchName: payload.branchName || 'main',
          commitHash: payload.commitHash,
          originalMessage: payload.commitMessage,
          projectSettings: activeProject.settings,
          serverId: mcpServerId,
          executeTool: rootStore.executeTool,
          projectId: context.projectId
        }, { enableLLMGeneration: false });
      } catch (err) {
        console.warn('⚠️ enqueueEnhanceAndSync: failed to enqueue enhanced processing:', err);
      }

      // JSON regen: write immediately via generate endpoint to avoid visible delay
      try {
        await fetch(`/api/projects/${context.projectId}/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
      } catch {}
      // GitHub sync remains handled by the post-commit timer later in executeAutoCommit
    }, 0);
  },

  // Small helper to flush any buffered enhanced-commit payloads captured when API was temporarily unavailable
  // This keeps the UI smooth and converges state on the server when it becomes available
  // Returns number of flushed items
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _flushBufferedEnhancedCommits: async (projectId: string): Promise<number> => {
    try {
      if (typeof window === 'undefined') return 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bufRoot: any = (window as any).__kibitzBufferedEnhancedCommits;
      const list = bufRoot?.[projectId];
      if (!Array.isArray(list) || list.length === 0) return 0;
      const flushed = [] as number[];
      for (let i = 0; i < list.length; i++) {
        const payload = list[i];
        try {
          const res = await fetch(`/api/projects/${projectId}/enhanced-commit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          if (res.ok) flushed.push(i);
        } catch {
          // stop on first failure to retry later
          break;
        }
      }
      // Remove flushed entries
      if (flushed.length > 0) {
        const remaining = list.filter((_: unknown, idx: number) => !flushed.includes(idx));
        if (remaining.length > 0) bufRoot[projectId] = remaining; else delete bufRoot[projectId];
      }
      return flushed.length;
    } catch {
      return 0;
    }
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
    
    // Authoritative minimum files check from project settings if available
    try {
      const rootStore = useStore.getState();
      const activeProject = rootStore.projects.find(p => p.id === context.projectId);
      const uiMin = activeProject?.settings?.minFilesForAutoCommitPush;
      if (typeof uiMin === 'number' && uiMin > 0) {
        console.log(`🔍 Checking UI minFilesForAutoCommitPush: ${pendingChanges.size} >= ${uiMin}`);
        if (pendingChanges.size < uiMin) {
          console.log('❌ shouldAutoCommit: below UI-configured min files threshold');
          return false;
        }
      }
    } catch {}

    // Legacy minimum changes from auto-commit config (kept for compatibility)
    console.log(`🔍 Checking minimum changes (legacy): ${pendingChanges.size} >= ${config.conditions.minimumChanges}`);
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
    const __t0 = Date.now();
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
      console.log(`⏱️ executeAutoCommit short-circuit (already active) after ${Date.now() - __t0}ms for project ${context.projectId}`);
      return await activeOperations.get(context.projectId)!;
    }
    
    // 🚀 PERFORMANCE: Global rate limiting - prevent excessive auto-commits
    const now = Date.now();
    const lastCommitTime = get().lastCommitTimestamp;
    if (lastCommitTime && (now - lastCommitTime) < 2000) { // 2 second minimum between commits
      if (shouldLogDetails) {
        console.log('⏰ executeAutoCommit: Rate limited - too soon since last commit');
      }
      console.log(`⏱️ executeAutoCommit rate-limited after ${Date.now() - __t0}ms for project ${context.projectId}`);
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
          console.log(`⏱️ executeAutoCommit total time (no project): ${Date.now() - __t0}ms for project ${context.projectId}`);
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
          console.log(`⏱️ executeAutoCommit total time (no mcp): ${Date.now() - __t0}ms for project ${context.projectId}`);
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
        
        // 🔍 Streamlined commit process - helper functions (minimal logs)
        console.log('💾 executeAutoCommit: local commit → enqueue background enhance+sync');
        const { commitHash, branchName, commitMessage } = await get().createLocalCommit(context);
        if (!commitHash) {
          console.log('⚠️ executeAutoCommit: Auto-commit skipped or failed');
          console.log(`⏱️ executeAutoCommit total time (no commit): ${Date.now() - __t0}ms for project ${context.projectId}`);
          return false;
        }
        console.log(`✅ local commit ${commitHash.slice(0,7)} on ${branchName || 'main'}`);
        // Schedule enhance+sync. If orchestrator is disabled, we may still do a best-effort push below.
        get().enqueueEnhanceAndSync(context, { commitHash, branchName, commitMessage });

        // 💾 NEW: Save auto-commit to persistent storage
        const finalCommitMessage = generateCommitMessage(context, config, branchName);
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
        if (branchName && branchName.startsWith('conv-') && context.conversationId) {
          try {
            console.log('📋 executeAutoCommit: Updating conversation JSON with commit hash...');
            
            // Create a branch info object for JSON update
            const branchInfo: ConversationBranchInfo = {
              branchName: branchName,
              conversationId: context.conversationId,
              interactionCount: parseInt(branchName.split('-step-')[1]) || 1,
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
        
        // 🚀 AUTO-TRIGGER GITHUB SYNC AFTER SUCCESSFUL COMMIT (delay to avoid pushing empty repos)
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
              
              // Step 2: Wait a bit more for file system to sync and to avoid race with first commit
              await new Promise(resolve => setTimeout(resolve, 2000));

              // Step 2.5: Ensure GitHub sync is enabled before triggering
              try {
                const cfgRes = await fetch(`/api/github-sync/config?projectId=${context.projectId}`);
                let githubEnabled = false;
                if (cfgRes.ok) {
                  const cfg = await cfgRes.json();
                  githubEnabled = !!cfg.github?.enabled;
                }
                if (!githubEnabled) {
                  console.log('🔧 Enabling GitHub sync automatically before first sync...');
                  await fetch('/api/github-sync/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      projectId: context.projectId,
                      projectName: activeProject.name,
                      enabled: true,
                      syncBranches: ['main', 'step-*'],
                      authentication: { type: 'token', configured: true }
                    })
                  });
                  // Reflect in client store immediately
                  try {
                    useStore.getState().updateProjectSettings(context.projectId, {
                      settings: { ...activeProject.settings, enableGitHub: true }
                    });
                  } catch {}
                }
              } catch (cfgErr) {
                console.warn('⚠️ Could not ensure GitHub enabled before sync:', cfgErr);
              }

              // Step 3: Now trigger GitHub sync with JSON file guaranteed to exist
              console.log('🚀 Triggering server push orchestrator with JSON file ready...');
              const orchestratorEnabled = isPushOrchestratorEnabled();
              const syncResponse = await fetch('/api/github-sync/trigger', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  projectId: context.projectId,
                  immediate: true,
                  force: true,
                  // Carry commit context for dedupe and drift checks
                  branchName: branchName || undefined,
                  commitHash: commitHash || undefined
                }),
              });
              
              if (syncResponse.ok) {
                const result = await syncResponse.json();
                console.log('✅ Auto GitHub sync completed:', result.message);
                if (result.remoteUrl) {
                  console.log('🔗 Pushed to repository:', result.remoteUrl);
                }
                // When orchestrator is enabled, do not push client-side. Otherwise, fallback to client push.
                if (!orchestratorEnabled && config.autoPushToRemote) {
                  try {
                    const currentBranchRes = await executeGitCommand(
                      mcpServerId,
                      'git branch --show-current',
                      context.projectPath,
                      rootStore.executeTool
                    );
                    const currentBranch = currentBranchRes.success && currentBranchRes.output.trim()
                      ? currentBranchRes.output.trim()
                      : 'main';

                    const { pushToRemote, pushAllBranches } = await import('../lib/gitService');
                    console.log(`📤 AUTO-PUSH AFTER SYNC (fallback): Pushing current branch '${currentBranch}'...`);
                    let pushResult = await pushToRemote(
                      context.projectPath,
                      mcpServerId,
                      rootStore.executeTool,
                      currentBranch
                    );

                    if (!pushResult.success) {
                      console.warn('⚠️ AUTO-PUSH AFTER SYNC (fallback): Branch push failed:', pushResult.error || pushResult.output);
                      try {
                        await new Promise(r => setTimeout(r, 800));
                        console.log('🔁 AUTO-PUSH AFTER SYNC (fallback): Falling back to pushAllBranches...');
                        const batchResult = await pushAllBranches(
                          context.projectPath,
                          mcpServerId,
                          rootStore.executeTool
                        );
                        pushResult = { success: batchResult.success, output: batchResult.output, error: batchResult.error } as any;
                      } catch (retryErr) {
                        console.warn('⚠️ AUTO-PUSH AFTER SYNC (fallback): Batch push error:', retryErr);
                      }
                    }

                    if (pushResult.success) {
                      console.log('✅ AUTO-PUSH AFTER SYNC (fallback): Push successful');
                      set({ lastPushTimestamp: Date.now() });
                    } else {
                      console.warn('⚠️ AUTO-PUSH AFTER SYNC (fallback): Push ultimately failed:', pushResult.error || pushResult.output);
                    }
                  } catch (pushErr) {
                    console.warn('⚠️ AUTO-PUSH AFTER SYNC (fallback): Exception pushing:', pushErr);
                  }
                }

                // After successful sync/push, try flushing any buffered enhanced-commit updates
                try {
                  const flushed = await (get() as any)._flushBufferedEnhancedCommits(context.projectId);
                  if (flushed > 0) console.log(`🧹 Flushed ${flushed} buffered enhanced-commit updates`);
                } catch {}
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
          branchName || undefined
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
              branchName: branchName // Include branch info for UI updates
            }
          }));
          console.log('📡 executeAutoCommit: Auto-commit event dispatched');
          
          // 🌿 NEW: If auto-branch was created, also trigger branch refresh
          if (branchName) {
            window.dispatchEvent(new CustomEvent('newBranchDetected', {
              detail: {
                projectId: context.projectId,
                commitHash: commitHash,
                timestamp: timestamp,
                branchName: branchName,
                trigger: 'auto-commit'
              }
            }));
            console.log('🌿 executeAutoCommit: New branch detection event dispatched for:', branchName);
          }
        } catch (eventError) {
          console.warn('⚠️ executeAutoCommit: Failed to dispatch auto-commit event:', eventError);
        }
        
        // Auto-push handled by server orchestrator (or fallback client push above)
        
        console.log(`⏱️ executeAutoCommit total time: ${Date.now() - __t0}ms for project ${context.projectId}`);
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
        
        console.log(`⏱️ executeAutoCommit total time (failure): ${Date.now() - __t0}ms for project ${context.projectId}`);
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