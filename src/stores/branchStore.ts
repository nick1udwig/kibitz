import { create } from 'zustand';
import { useStore } from './rootStore';
import { ensureProjectDirectory } from '../lib/projectPathService';
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
} from '../lib/branchService';

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
  lastOperation: string | null;
  
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
}

/**
 * Default configuration
 */
const DEFAULT_BRANCH_CONFIG: BranchConfig = {
  autoCreateBranches: true,
  changeThreshold: 2,
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
  lastOperation: null,
  
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
      throw new Error('No active MCP servers available');
    }
    
    try {
      set({ isProcessing: true, lastOperation: 'Detecting changes' });
      
      const mcpServerId = activeMcpServers[0].id;
      const projectPath = await ensureProjectDirectory(project, mcpServerId, rootStore.executeTool);
      
      const changeResult = await detectChanges(projectPath, mcpServerId, rootStore.executeTool);
      
      // Update pending changes
      set(state => ({
        pendingChanges: {
          ...state.pendingChanges,
          [projectId]: changeResult
        }
      }));
      
      return changeResult;
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
      set({ isProcessing: true, lastOperation: `Switching to branch: ${branchName}` });
      
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
        
        console.log(`Successfully switched to branch: ${branchName}`);
        return true;
      } else {
        console.error('Failed to switch branch:', result.error);
        return false;
      }
    } finally {
      set({ isProcessing: false, lastOperation: null });
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
    
    if (!config.autoCreateBranches) {
      console.log(`🔒 handleToolExecution: Auto-branch creation disabled, skipping`);
      return;
    }
    
    // Skip auto-branching for certain tools
    const skipTools = ['Initialize', 'BashCommand'];
    if (skipTools.includes(toolName)) {
      console.log(`🔒 handleToolExecution: Skipping auto-branch for tool: ${toolName}`);
      return;
    }
    
    console.log(`✅ handleToolExecution: Tool ${toolName} eligible for auto-branching`);
    
    try {
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
  }
})); 