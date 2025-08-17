import { create } from 'zustand';
import { useStore } from './rootStore';
import { ensureProjectDirectory } from '../lib/projectPathService';

// Simple debounce map to prevent duplicate branch detection triggers
const toolTriggerDebounceMs = 1500;
const lastToolTriggerAt: Map<string, number> = new Map();
import {
  BranchType,
  BranchInfo,
  ChangeDetectionResult,
  RevertOptions,
  detectChanges,
  createBranch,
  listBranches,
  revertToState,
  autoCreateBranchIfNeeded,
  mergeBranch
} from '@/lib/versionControl';

/**
 * Branch management configuration
 */
export interface BranchConfig {
  autoCreateBranches: boolean;  // Automatically create branches based on changes
  changeThreshold: number;      // Minimum files changed to trigger branch creation
  enableSmartNaming: boolean;   // Use intelligent branch naming
  defaultBranchType: BranchType; // Default branch type for manual creation
  autoMergeBugfixes: boolean;   // Automatically merge bugfix branches
  backupBeforeRevert: boolean;  // Create backup branches before reverting
}

/**
 * Branch management state
 */
interface BranchState {
  // Configuration
  config: BranchConfig;
  
  // Current state
  branches: Record<string, BranchInfo[]>; // projectId -> branches
  currentBranch: Record<string, string>; // projectId -> current branch name
  pendingChanges: Record<string, ChangeDetectionResult>; // projectId -> pending changes
  isProcessing: boolean;
  // Dedicated switching flag so UI doesn't get blocked by background refreshes
  isSwitching: boolean;
  lastOperation: string | null;
  
  // Auto-refresh
  _refreshInterval: NodeJS.Timeout | null;
  
  // Operations
  updateConfig: (updates: Partial<BranchConfig>) => void;
  detectProjectChanges: (projectId: string) => Promise<ChangeDetectionResult>;
  createProjectBranch: (projectId: string, branchName: string, branchType: BranchType, description: string) => Promise<boolean>;
  listProjectBranches: (projectId: string) => Promise<BranchInfo[]>;
  switchToBranch: (projectId: string, branchName: string) => Promise<boolean>;
  revertProject: (projectId: string, options: RevertOptions) => Promise<{ success: boolean; backupBranch?: string }>;
  autoCreateBranchForProject: (projectId: string) => Promise<{ created: boolean; branchInfo?: BranchInfo; reason?: string }>;
  mergeProjectBranch: (projectId: string, sourceBranch: string, targetBranch?: string) => Promise<boolean>;
  
  // Integration with auto-commit
  handleToolExecution: (projectId: string, toolName: string) => Promise<void>;
  shouldCreateBranchForChanges: (projectId: string) => Promise<boolean>;
  
  // Current branch detection
  refreshCurrentBranch: (projectId: string) => Promise<string>;
  
  // Auto-refresh management
  startAutoRefresh: (projectId: string) => void;
  stopAutoRefresh: () => void;
}

/**
 * Default configuration
 */
const DEFAULT_BRANCH_CONFIG: BranchConfig = {
  autoCreateBranches: true, // creates incremental branches e.g main to step 1 and step n + 1
  changeThreshold: 2, // Trigger at 2+ files changed (matches user requirement)
  enableSmartNaming: true,
  defaultBranchType: 'iteration',
  autoMergeBugfixes: false,
  backupBeforeRevert: true,
};

export const useBranchStore = create<BranchState>((set, get) => ({
  // Initial state
  config: DEFAULT_BRANCH_CONFIG,
  branches: {},
  currentBranch: {},
  pendingChanges: {},
  isProcessing: false,
  isSwitching: false,
  lastOperation: null,
  
  // Auto-refresh interval for current branch
  _refreshInterval: null as NodeJS.Timeout | null,
  
  // Update configuration
  updateConfig: (updates: Partial<BranchConfig>) => {
    set(state => ({
      config: { ...state.config, ...updates }
    }));
  },
  
  // Detect changes in a project
  detectProjectChanges: async (projectId: string): Promise<ChangeDetectionResult> => {
    const rootStore = useStore.getState();
    const project = rootStore.projects.find(p => p.id === projectId);
    
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }
    
    const activeMcpServers = rootStore.servers.filter(server => 
      server.status === 'connected' && project.settings.mcpServerIds?.includes(server.id)
    );
    
    if (!activeMcpServers.length) {
      console.warn('No active MCP servers available for branch detection, returning empty result');
      return {
        filesChanged: 0,
        changedFiles: [],
        linesAdded: 0,
        linesRemoved: 0,
        shouldCreateBranch: false,
        suggestedBranchType: 'iteration',
        suggestedBranchName: '',
        description: 'No MCP servers available for change detection'
      };
    }
    
    try {
      set({ isProcessing: true, lastOperation: 'Detecting changes' });
      
      const mcpServerId = activeMcpServers[0].id;
      
      // 🔧 TIMEOUT PROTECTION: Use ensureProjectDirectory with error handling
      let projectPath: string;
      try {
        projectPath = await ensureProjectDirectory(project, mcpServerId, rootStore.executeTool);
        console.log(`🔍 detectProjectChanges: Using project path: ${projectPath}`);
      } catch (pathError) {
        console.warn(`⚠️ detectProjectChanges: Failed to ensure project directory, using fallback path:`, pathError);
        // Fallback to basic path generation without MCP verification, using configured base dir
        const { getProjectsBaseDir } = await import('../lib/pathConfig');
        const baseDir = getProjectsBaseDir();
        projectPath = `${baseDir}/${projectId}_${project.name.toLowerCase().replace(/\s+/g, '-')}`;
      }
      
      const changeResult = await detectChanges(projectPath, mcpServerId, rootStore.executeTool);
      
      // Update pending changes
      set(state => ({
        pendingChanges: {
          ...state.pendingChanges,
          [projectId]: changeResult
        }
      }));
      
      return changeResult;
    } catch (error) {
      console.warn(`⚠️ detectProjectChanges: Non-fatal error for project ${projectId}:`, error);
      // Return empty change result instead of throwing
      const emptyResult: ChangeDetectionResult = {
        filesChanged: 0,
        changedFiles: [],
        linesAdded: 0,
        linesRemoved: 0,
        shouldCreateBranch: false,
        suggestedBranchType: 'iteration',
        suggestedBranchName: '',
        description: 'Unable to detect changes due to system issues'
      };
      
      set(state => ({
        pendingChanges: {
          ...state.pendingChanges,
          [projectId]: emptyResult
        }
      }));
      
      return emptyResult;
    } finally {
      set({ isProcessing: false, lastOperation: null });
    }
  },
  
  // Create a new branch for a project
  createProjectBranch: async (
    projectId: string, 
    branchName: string, 
    branchType: BranchType, 
    description: string
  ): Promise<boolean> => {
    const rootStore = useStore.getState();
    const project = rootStore.projects.find(p => p.id === projectId);
    
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }
    
    const activeMcpServers = rootStore.servers.filter(server => 
      server.status === 'connected' && project.settings.mcpServerIds?.includes(server.id)
    );
    
    if (!activeMcpServers.length) {
      throw new Error('No active MCP servers available');
    }
    
    try {
      set({ isProcessing: true, lastOperation: `Creating ${branchType} branch: ${branchName}` });
      
      const mcpServerId = activeMcpServers[0].id;
      const projectPath = await ensureProjectDirectory(project, mcpServerId, rootStore.executeTool);
      
      const result = await createBranch(
        projectPath,
        branchName,
        branchType,
        description,
        mcpServerId,
        rootStore.executeTool
      );
      
      if (result.success && result.branchInfo) {
        // Update branches list
        set(state => ({
          branches: {
            ...state.branches,
            [projectId]: [...(state.branches[projectId] || []), result.branchInfo!]
          },
          currentBranch: {
            ...state.currentBranch,
            [projectId]: branchName
          }
        }));
        
        console.log(`Successfully created ${branchType} branch: ${branchName}`);
        return true;
      } else {
        console.error('Failed to create branch:', result.error);
        return false;
      }
    } finally {
      set({ isProcessing: false, lastOperation: null });
    }
  },
  
  // List all branches for a project
  listProjectBranches: async (projectId: string): Promise<BranchInfo[]> => {
    const rootStore = useStore.getState();
    const project = rootStore.projects.find(p => p.id === projectId);
    
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }
    
    const activeMcpServers = rootStore.servers.filter(server => 
      server.status === 'connected' && project.settings.mcpServerIds?.includes(server.id)
    );
    
    if (!activeMcpServers.length) {
      return [];
    }
    
    try {
      set({ isProcessing: true, lastOperation: 'Listing branches' });
      
      const mcpServerId = activeMcpServers[0].id;
      const projectPath = await ensureProjectDirectory(project, mcpServerId, rootStore.executeTool);
      
      const branches = await listBranches(projectPath, mcpServerId, rootStore.executeTool);
      
      // Update store
      set(state => ({
        branches: {
          ...state.branches,
          [projectId]: branches
        }
      }));
      
      return branches;
    } finally {
      set({ isProcessing: false, lastOperation: null });
    }
  },
  
  // Switch to a different branch
  switchToBranch: async (projectId: string, branchName: string): Promise<boolean> => {
    const rootStore = useStore.getState();
    const project = rootStore.projects.find(p => p.id === projectId);
    
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }
    
    const activeMcpServers = rootStore.servers.filter(server => 
      server.status === 'connected' && project.settings.mcpServerIds?.includes(server.id)
    );
    
    if (!activeMcpServers.length) {
      throw new Error('No active MCP servers available');
    }
    
    try {
      set({ isProcessing: true, isSwitching: true, lastOperation: `Switching to branch: ${branchName}` });
      
      const mcpServerId = activeMcpServers[0].id;
      const projectPath = await ensureProjectDirectory(project, mcpServerId, rootStore.executeTool);
      
      const result = await revertToState(
        projectPath,
        { targetBranch: branchName, createBackupBranch: false },
        mcpServerId,
        rootStore.executeTool
      );
      
      if (result.success) {
        set(state => ({
          currentBranch: {
            ...state.currentBranch,
            [projectId]: branchName
          }
        }));
        
        // Ensure the target branch contains project.json so UI features remain available
        try {
          const { checkProjectJsonOnBranch, mergeProjectJsonForBranchSwitch } = await import('../lib/branchService');
          const hasProjectJson = await checkProjectJsonOnBranch(
            projectPath,
            branchName,
            mcpServerId,
            rootStore.executeTool
          );
          if (!hasProjectJson) {
            // Determine best source branch: previous step if conv-*-step-N, else main
            let sourceBranch = 'main';
            const match = branchName.match(/^conv-[^-]+-step-(\d+)$/);
            if (match) {
              const stepNum = parseInt(match[1], 10);
              if (!Number.isNaN(stepNum) && stepNum > 1) {
                const prevStepBranch = branchName.replace(/step-\d+$/, `step-${stepNum - 1}`);
                sourceBranch = prevStepBranch;
              }
            }

            // If chosen source branch lacks project.json, fall back to main
            try {
              const sourceHasJson = await checkProjectJsonOnBranch(
                projectPath,
                sourceBranch,
                mcpServerId,
                rootStore.executeTool
              );
              if (!sourceHasJson) {
                sourceBranch = 'main';
              }
            } catch {}

            console.log(`📦 project.json missing on ${branchName}. Copying from ${sourceBranch}...`);
            await mergeProjectJsonForBranchSwitch(
              projectPath,
              sourceBranch,
              branchName,
              mcpServerId,
              rootStore.executeTool
            );
            console.log(`✅ project.json ensured on ${branchName}`);
          }
        } catch (projectJsonError) {
          console.warn('⚠️ Failed to ensure project.json on target branch:', projectJsonError);
        }

        // Ensure the local workspace is now on the requested branch by asking Git directly
        try {
          const res = await fetch(`/api/projects/${projectId}/branches/current`);
          const data = await res.json();
          if (data?.currentBranch && data.currentBranch !== branchName) {
            console.warn(`Branch switch mismatch (expected ${branchName}, got ${data.currentBranch}). Retrying revert once.`);
            const retry = await revertToState(
              projectPath,
              { targetBranch: branchName, createBackupBranch: false },
              mcpServerId,
              rootStore.executeTool
            );
            if (!retry.success) {
              console.warn('Retry switch failed:', retry.error);
            }
          }
        } catch {}
        
        // 🚀 UI REFRESH FIX: Trigger comprehensive UI refresh after successful branch switch
        try {
          console.log(`🔄 Triggering UI refresh after successful branch switch to: ${branchName}`);
          
          // 1. Refresh branch list and current branch state
          setTimeout(async () => {
            try {
              const { listProjectBranches, refreshCurrentBranch } = get();
              await listProjectBranches(projectId);
              await refreshCurrentBranch(projectId);
              console.log(`✅ Branch state refreshed for project ${projectId}`);
            } catch (refreshError) {
              console.warn('⚠️ Failed to refresh branch state:', refreshError);
            }
          }, 100);
          
          // 2. Generate project metadata if missing or stale on new branch (trigger the project.json creation)
          setTimeout(async () => {
            try {
              console.log(`📋 Checking if project data needs regeneration on branch ${branchName}...`);
              const checkRes = await fetch(`/api/projects/${projectId}`);
              let needsGenerate = !checkRes.ok;
              if (checkRes.ok) {
                try {
                  const data = await checkRes.json();
                  const branches = Array.isArray(data?.branches) ? data.branches : [];
                  const hasCurrent = branches.some((b: { branchName?: string; name?: string }) =>
                    (b?.branchName || b?.name) === branchName
                  );
                  if (!hasCurrent) {
                    console.log(`📋 Project data exists but does not include current branch ${branchName}. Will regenerate.`);
                    needsGenerate = true;
                  }
                } catch (e) {
                  console.warn('⚠️ Failed to parse project data JSON; will regenerate:', e);
                  needsGenerate = true;
                }
              }
              if (needsGenerate) {
                console.log(`🔄 Generating project data for new branch ${branchName}...`);
                // Notify UI that generation has started so empty states can reflect progress
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('projectDataGenerating', {
                    detail: { projectId, branchName, timestamp: Date.now() }
                  }));
                }
                const generateRes = await fetch(`/api/projects/${projectId}/generate`, { method: 'POST' });
                if (generateRes.ok) {
                  console.log(`✅ Project data generated for branch ${branchName}`);
                  // Notify UI that project data is ready so components can refresh automatically
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('projectDataReady', {
                      detail: { projectId, branchName, timestamp: Date.now() }
                    }));
                  }
                } else {
                  console.warn(`⚠️ Failed to generate project data for branch ${branchName}`);
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('projectDataFailed', {
                      detail: { projectId, branchName, timestamp: Date.now() }
                    }));
                  }
                }
              } else {
                console.log(`✅ Project data already exists on branch ${branchName}`);
              }
            } catch (generateError) {
              console.warn('⚠️ Failed to check/generate project data:', generateError);
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('projectDataFailed', {
                  detail: { projectId, branchName, timestamp: Date.now() }
                }));
              }
            }
          }, 200);
          
          // 3. Dispatch events to notify UI components about the branch change
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('branchSwitched', {
              detail: {
                projectId,
                branchName,
                timestamp: Date.now()
              }
            }));
            console.log(`📡 Branch switch event dispatched for ${projectId} -> ${branchName}`);
          }
          
        } catch (refreshError) {
          console.warn('⚠️ UI refresh after branch switch failed:', refreshError);
        }
        
        console.log(`✅ Successfully switched to branch: ${branchName}`);
        return true;
      } else {
        console.error('Failed to switch branch:', result.error);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('branchSwitchFailed', {
            detail: { projectId, targetBranch: branchName, error: result.error }
          }));
        }
        return false;
      }
    } finally {
      set({ isProcessing: false, isSwitching: false, lastOperation: null });
    }
  },
  
  // Revert project to a previous state
  revertProject: async (
    projectId: string, 
    options: RevertOptions
  ): Promise<{ success: boolean; backupBranch?: string }> => {
    const rootStore = useStore.getState();
    const project = rootStore.projects.find(p => p.id === projectId);
    
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }
    
    const activeMcpServers = rootStore.servers.filter(server => 
      server.status === 'connected' && project.settings.mcpServerIds?.includes(server.id)
    );
    
    if (!activeMcpServers.length) {
      throw new Error('No active MCP servers available');
    }
    
    try {
      const { config } = get();
      set({ isProcessing: true, lastOperation: 'Reverting project state' });
      
      const mcpServerId = activeMcpServers[0].id;
      const projectPath = await ensureProjectDirectory(project, mcpServerId, rootStore.executeTool);
      
      // Use backup setting from config if not explicitly specified
      const revertOptions: RevertOptions = {
        ...options,
        createBackupBranch: options.createBackupBranch ?? config.backupBeforeRevert
      };
      
      const result = await revertToState(
        projectPath,
        revertOptions,
        mcpServerId,
        rootStore.executeTool
      );
      
      if (result.success) {
        // Update current branch if we reverted to a branch
        if (options.targetBranch) {
          set(state => ({
            currentBranch: {
              ...state.currentBranch,
              [projectId]: options.targetBranch!
            }
          }));
        }
        
        console.log('Successfully reverted project state');
      }
      
      return result;
    } finally {
      set({ isProcessing: false, lastOperation: null });
    }
  },
  
  // Automatically create a branch if changes warrant it
  autoCreateBranchForProject: async (projectId: string): Promise<{ created: boolean; branchInfo?: BranchInfo; reason?: string }> => {
    const { config } = get();
    
    console.log(`🌿 autoCreateBranchForProject: Starting for project ${projectId}`);
    console.log(`🌿 autoCreateBranchForProject: Auto-branch creation enabled? ${config.autoCreateBranches}`);
    
    if (!config.autoCreateBranches) {
      console.log('🔒 autoCreateBranchForProject: Auto-branch creation is disabled in config');
      return {
        created: false,
        reason: 'Auto-branch creation is disabled'
      };
    }
    
    const rootStore = useStore.getState();
    const project = rootStore.projects.find(p => p.id === projectId);
    
    if (!project) {
      console.error(`❌ autoCreateBranchForProject: Project ${projectId} not found`);
      throw new Error(`Project ${projectId} not found`);
    }
    
    console.log(`🔍 autoCreateBranchForProject: Found project: ${project.name}`);
    
    const activeMcpServers = rootStore.servers.filter(server => 
      server.status === 'connected' && project.settings.mcpServerIds?.includes(server.id)
    );
    
    console.log(`🔍 autoCreateBranchForProject: Active MCP servers: ${activeMcpServers.length}`);
    
    if (!activeMcpServers.length) {
      console.warn('⚠️ autoCreateBranchForProject: No active MCP servers available');
      return {
        created: false,
        reason: 'No active MCP servers available'
      };
    }
    
    try {
      set({ isProcessing: true, lastOperation: 'Auto-creating branch' });
      
      const mcpServerId = activeMcpServers[0].id;
      console.log(`🔍 autoCreateBranchForProject: Using MCP server: ${mcpServerId}`);
      
      const projectPath = await ensureProjectDirectory(project, mcpServerId, rootStore.executeTool);
      console.log(`🔍 autoCreateBranchForProject: Project path: ${projectPath}`);
      
      const result = await autoCreateBranchIfNeeded(projectPath, mcpServerId, rootStore.executeTool);
      console.log(`🔍 autoCreateBranchForProject: Auto-branch result:`, result);
      
      if (result.branchCreated && result.branchInfo) {
        console.log(`✅ autoCreateBranchForProject: Branch created successfully: ${result.branchInfo.name}`);
        
        // Update branches list
        set(state => ({
          branches: {
            ...state.branches,
            [projectId]: [...(state.branches[projectId] || []), result.branchInfo!]
          },
          currentBranch: {
            ...state.currentBranch,
            [projectId]: result.branchInfo!.name
          }
        }));
      } else {
        console.log(`ℹ️ autoCreateBranchForProject: No branch created. Reason: ${result.reason}`);
      }
      
      return {
        created: result.branchCreated,
        branchInfo: result.branchInfo,
        reason: result.reason
      };
    } catch (error) {
      console.error('❌ autoCreateBranchForProject: Error during branch creation:', error);
      throw error;
    } finally {
      set({ isProcessing: false, lastOperation: null });
    }
  },
  
  // Merge a branch back to main
  mergeProjectBranch: async (
    projectId: string, 
    sourceBranch: string, 
    targetBranch: string = 'main'
  ): Promise<boolean> => {
    const rootStore = useStore.getState();
    const project = rootStore.projects.find(p => p.id === projectId);
    
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }
    
    const activeMcpServers = rootStore.servers.filter(server => 
      server.status === 'connected' && project.settings.mcpServerIds?.includes(server.id)
    );
    
    if (!activeMcpServers.length) {
      throw new Error('No active MCP servers available');
    }
    
    try {
      set({ isProcessing: true, lastOperation: `Merging ${sourceBranch} into ${targetBranch}` });
      
      const mcpServerId = activeMcpServers[0].id;
      const projectPath = await ensureProjectDirectory(project, mcpServerId, rootStore.executeTool);
      
      const result = await mergeBranch(
        projectPath,
        sourceBranch,
        targetBranch,
        mcpServerId,
        rootStore.executeTool
      );
      
      if (result.success) {
        // Update current branch
        set(state => ({
          currentBranch: {
            ...state.currentBranch,
            [projectId]: targetBranch
          }
        }));
        
        console.log(`Successfully merged ${sourceBranch} into ${targetBranch}`);
        return true;
      } else {
        console.error('Failed to merge branch:', result.error);
        return false;
      }
    } finally {
      set({ isProcessing: false, lastOperation: null });
    }
  },
  
  // Handle tool execution and potentially create branches
  handleToolExecution: async (projectId: string, toolName: string): Promise<void> => {
    const { config } = get();
    
    console.log(`🔧 handleToolExecution: Called for project ${projectId}, tool: ${toolName}`);
    console.log(`🔧 handleToolExecution: Auto-branch creation enabled? ${config.autoCreateBranches}`);
    
    // Debounce per project to avoid rapid duplicate triggers
    const now = Date.now();
    const last = lastToolTriggerAt.get(projectId) || 0;
    if (now - last < toolTriggerDebounceMs) {
      console.log(`⏱️ handleToolExecution: Debounced duplicate trigger for project ${projectId}`);
      return;
    }
    lastToolTriggerAt.set(projectId, now);
    
    if (!config.autoCreateBranches) {
      console.log(`🔒 handleToolExecution: Auto-branch creation disabled, skipping`);
      return;
    }
    
    // Skip auto-branching for certain tools that don't modify files
    const skipTools = ['Initialize', 'ReadFiles'];
    
    // 🚨 DEBUG: Enhanced logging to catch the exact issue
    console.log(`🔍 DEBUG: toolName = "${toolName}" (length: ${toolName.length})`);
    console.log(`🔍 DEBUG: skipTools = ${JSON.stringify(skipTools)}`);
    console.log(`🔍 DEBUG: skipTools.includes(toolName) = ${skipTools.includes(toolName)}`);
    
    if (skipTools.includes(toolName)) {
      console.log(`🔒 handleToolExecution: Skipping auto-branch for tool: ${toolName}`);
      return;
    }
    
    // Only create branches for tools that actually modify files
    // Avoid reacting to internal Git/Bash traffic which causes thrash
    const eligibleTools = ['FileWriteOrEdit'];
    if (!eligibleTools.includes(toolName)) {
      console.log(`🔒 handleToolExecution: Tool ${toolName} not eligible for auto-branching`);
      return;
    }
    
    console.log(`✅ handleToolExecution: Tool ${toolName} eligible for auto-branching`);
    
    try {
      // Small delay to let the tool operation complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Detect changes after tool execution
      console.log(`🔍 handleToolExecution: Detecting changes for project ${projectId}...`);
      const changeResult = await get().detectProjectChanges(projectId);
      console.log(`🔍 handleToolExecution: Change detection result:`, changeResult);
      
      // Auto-create branch if changes warrant it
      if (changeResult.shouldCreateBranch) {
        console.log(`✅ handleToolExecution: Changes warrant branch creation, proceeding...`);
        const branchResult = await get().autoCreateBranchForProject(projectId);
        
        if (branchResult.created) {
          console.log(`✅ handleToolExecution: Auto-created branch after ${toolName}: ${branchResult.branchInfo?.name}`);
        } else {
          console.log(`ℹ️ handleToolExecution: Branch not created: ${branchResult.reason}`);
        }
      } else {
        console.log(`ℹ️ handleToolExecution: Changes do not warrant branch creation`);
      }
    } catch (error) {
      console.error('❌ handleToolExecution: Failed to handle tool execution for branching:', error);
    }
  },
  
  // Check if changes should trigger branch creation
  shouldCreateBranchForChanges: async (projectId: string): Promise<boolean> => {
    const { config } = get();
    
    if (!config.autoCreateBranches) {
      return false;
    }
    
    try {
      const changeResult = await get().detectProjectChanges(projectId);
      return changeResult.shouldCreateBranch;
    } catch (error) {
      console.error('Failed to check if branch should be created:', error);
      return false;
    }
  },
  
  // Get and update current branch for a project
  refreshCurrentBranch: async (projectId: string): Promise<string> => {
    try {
      console.log(`🔍 Refreshing current branch for project ${projectId}`);
      
      // Call the API endpoint to get the actual current branch
      const response = await fetch(`/api/projects/${projectId}/branches/current`);
      const data = await response.json();
      
      if (data.error) {
        console.warn('Failed to get current branch from API:', data.error);
        return 'main'; // Fallback
      }
      
      const currentBranch = data.currentBranch || 'main';
      console.log(`🔍 Current branch for project ${projectId}: ${currentBranch}`);
      
      // Update the store with the actual current branch
      set(state => ({
        currentBranch: {
          ...state.currentBranch,
          [projectId]: currentBranch
        }
      }));
      
      return currentBranch;
    } catch (error) {
      console.error('Error refreshing current branch:', error);
      return 'main'; // Fallback
    }
  },
  
  // Start auto-refresh for a project (every 30 seconds)
  startAutoRefresh: (projectId: string) => {
    const { _refreshInterval } = get();
    
    // Clear existing interval if any
    if (_refreshInterval) {
      clearInterval(_refreshInterval);
    }
    
    console.log(`🔄 Starting auto-refresh for project ${projectId} (every 30 seconds)`);
    
    const interval = setInterval(async () => {
      try {
        console.log(`🔄 Auto-refreshing branch status for project ${projectId}`);
        await get().refreshCurrentBranch(projectId);
        await get().listProjectBranches(projectId);
        await get().detectProjectChanges(projectId);
      } catch (error) {
        console.error('Error during auto-refresh:', error);
      }
    }, 30000); // 30 seconds
    
    set({ _refreshInterval: interval });
  },
  
  // Stop auto-refresh
  stopAutoRefresh: () => {
    const { _refreshInterval } = get();
    
    if (_refreshInterval) {
      console.log('🛑 Stopping auto-refresh');
      clearInterval(_refreshInterval);
      set({ _refreshInterval: null });
    }
  }
})); 