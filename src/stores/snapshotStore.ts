/**
 * 🚀 Enhanced Snapshot Store for Git Snapshot & Reversion Feature v1.1
 * 
 * Manages enhanced Git snapshots with:
 * - Auto-push configuration
 * - Recent snapshots for chat UI
 * - Quick revert functionality
 * - LLM-generated commit messages
 */

import { create } from 'zustand';
import { Project } from '../components/LlmChat/context/types';
import {
  SnapshotConfig,
  GitSnapshot,
  BranchInfo,
  createEnhancedSnapshot,
  getRecentSnapshots,
  getRecentBranches,
  quickRevertToSnapshot,
  updateSnapshotConfig,
  pushSnapshotToRemote
} from '../lib/gitSnapshotService';

interface SnapshotState {
  // Configuration
  config: SnapshotConfig;
  
  // State
  recentSnapshots: Record<string, GitSnapshot[]>; // projectId -> snapshots
  recentBranches: Record<string, BranchInfo[]>; // projectId -> branches
  isLoading: boolean;
  lastOperation: string | null;
  
  // Actions
  updateConfig: (updates: Partial<SnapshotConfig>) => void;
  
  // Snapshot operations
  createSnapshot: (
    projectId: string,
    project: Project,
    serverId: string,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>,
    options?: {
      description?: string;
      branchType?: 'feature' | 'bugfix' | 'experiment' | 'checkpoint';
      force?: boolean;
    }
  ) => Promise<{ success: boolean; snapshot?: GitSnapshot; error?: string }>;
  
  // Recent data loading
  loadRecentSnapshots: (
    projectId: string,
    projectPath: string,
    serverId: string,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
  ) => Promise<void>;
  
  loadRecentBranches: (
    projectId: string,
    projectPath: string,
    serverId: string,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
  ) => Promise<void>;
  
  // Revert operations
  revertToSnapshot: (
    projectId: string,
    snapshot: GitSnapshot,
    projectPath: string,
    serverId: string,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>,
    createBackup?: boolean
  ) => Promise<{ success: boolean; backupBranch?: string; error?: string }>;
  
  // Remote operations
  pushSnapshot: (
    projectPath: string,
    branchName: string,
    serverId: string,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
  ) => Promise<{ success: boolean; error?: string }>;
  
  // Auto-operations
  createAutoSnapshotIfNeeded: (
    projectId: string,
    project: Project,
    serverId: string,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>,
    operation: string
  ) => Promise<GitSnapshot | null>;
  
  // Getters
  getRecentSnapshotsForProject: (projectId: string) => GitSnapshot[];
  getRecentBranchesForProject: (projectId: string) => BranchInfo[];
}

const DEFAULT_CONFIG: SnapshotConfig = {
  autoPushEnabled: false,
  generateCommitMessages: true,
  llmProvider: 'anthropic',
  maxRecentSnapshots: 3,
  maxRecentBranches: 5
};

export const useSnapshotStore = create<SnapshotState>((set, get) => ({
  // Initial state
  config: DEFAULT_CONFIG,
  recentSnapshots: {},
  recentBranches: {},
  isLoading: false,
  lastOperation: null,
  
  // Update configuration
  updateConfig: (updates: Partial<SnapshotConfig>) => {
    set(state => ({
      config: updateSnapshotConfig(updates)
    }));
  },
  
  // Create a new snapshot
  createSnapshot: async (
    projectId: string,
    project: Project,
    serverId: string,
    executeTool,
    options = {}
  ) => {
    set({ isLoading: true, lastOperation: 'Creating snapshot...' });
    
    try {
      // Get project path using the project path service
      const projectPath = project.customPath || `${process.env.NEXT_PUBLIC_PROJECTS_DIR || ''}/${projectId}_${project.name}`;
      
      const result = await createEnhancedSnapshot(
        projectPath,
        project,
        serverId,
        executeTool,
        {
          ...options,
          config: get().config
        }
      );
      
      if (result.success && result.snapshot) {
        // Update recent snapshots
        set(state => ({
          recentSnapshots: {
            ...state.recentSnapshots,
            [projectId]: [
              result.snapshot!,
              ...(state.recentSnapshots[projectId] || []).slice(0, state.config.maxRecentSnapshots - 1)
            ]
          }
        }));
      }
      
      set({ isLoading: false, lastOperation: null });
      return result;
      
    } catch (error) {
      console.error('Failed to create snapshot:', error);
      set({ isLoading: false, lastOperation: null });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  },
  
  // Load recent snapshots for a project
  loadRecentSnapshots: async (projectId: string, projectPath: string, serverId: string, executeTool) => {
    set({ isLoading: true, lastOperation: 'Loading recent snapshots...' });
    
    try {
      const snapshots = await getRecentSnapshots(
        projectPath,
        serverId,
        executeTool,
        get().config.maxRecentSnapshots
      );
      
      set(state => ({
        recentSnapshots: {
          ...state.recentSnapshots,
          [projectId]: snapshots
        },
        isLoading: false,
        lastOperation: null
      }));
      
    } catch (error) {
      console.error('Failed to load recent snapshots:', error);
      set({ isLoading: false, lastOperation: null });
    }
  },
  
  // Load recent branches for a project
  loadRecentBranches: async (projectId: string, projectPath: string, serverId: string, executeTool) => {
    set({ isLoading: true, lastOperation: 'Loading recent branches...' });
    
    try {
      const branches = await getRecentBranches(
        projectPath,
        serverId,
        executeTool,
        get().config.maxRecentBranches
      );
      
      set(state => ({
        recentBranches: {
          ...state.recentBranches,
          [projectId]: branches
        },
        isLoading: false,
        lastOperation: null
      }));
      
    } catch (error) {
      console.error('Failed to load recent branches:', error);
      set({ isLoading: false, lastOperation: null });
    }
  },
  
  // Revert to a snapshot
  revertToSnapshot: async (
    projectId: string,
    snapshot: GitSnapshot,
    projectPath: string,
    serverId: string,
    executeTool,
    createBackup = true
  ) => {
    set({ isLoading: true, lastOperation: `Reverting to snapshot ${snapshot.shortHash}...` });
    
    try {
      const result = await quickRevertToSnapshot(
        projectPath,
        snapshot,
        serverId,
        executeTool,
        createBackup
      );
      
      if (result.success) {
        // Refresh recent snapshots and branches after revert
        await get().loadRecentSnapshots(projectId, projectPath, serverId, executeTool);
        await get().loadRecentBranches(projectId, projectPath, serverId, executeTool);
      }
      
      set({ isLoading: false, lastOperation: null });
      return result;
      
    } catch (error) {
      console.error('Failed to revert to snapshot:', error);
      set({ isLoading: false, lastOperation: null });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  },
  
  // Push snapshot to remote
  pushSnapshot: async (projectPath: string, branchName: string, serverId: string, executeTool) => {
    set({ isLoading: true, lastOperation: `Pushing ${branchName} to remote...` });
    
    try {
      const result = await pushSnapshotToRemote(projectPath, branchName, serverId, executeTool);
      
      set({ isLoading: false, lastOperation: null });
      return result;
      
    } catch (error) {
      console.error('Failed to push snapshot:', error);
      set({ isLoading: false, lastOperation: null });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  },
  
  // Create auto-snapshot if needed (based on project activity)
  createAutoSnapshotIfNeeded: async (
    projectId: string,
    project: Project,
    serverId: string,
    executeTool,
    operation: string
  ) => {
    // Only create auto-snapshots for significant operations
    const significantOperations = [
      'major_code_change',
      'file_creation',
      'file_deletion',
      'dependency_update',
      'configuration_change'
    ];
    
    if (!significantOperations.includes(operation)) {
      return null;
    }
    
    try {
      const result = await get().createSnapshot(
        projectId,
        project,
        serverId,
        executeTool,
        {
          description: `Auto-snapshot: ${operation}`,
          branchType: 'checkpoint',
          force: false
        }
      );
      
      return result.success ? result.snapshot! : null;
      
    } catch (error) {
      console.error('Failed to create auto-snapshot:', error);
      return null;
    }
  },
  
  // Getters
  getRecentSnapshotsForProject: (projectId: string) => {
    return get().recentSnapshots[projectId] || [];
  },
  
  getRecentBranchesForProject: (projectId: string) => {
    return get().recentBranches[projectId] || [];
  }
}));

// Helper hooks for easier access
export const useSnapshotConfig = () => {
  const config = useSnapshotStore(state => state.config);
  const updateConfig = useSnapshotStore(state => state.updateConfig);
  return { config, updateConfig };
};

export const useRecentSnapshots = (projectId: string) => {
  const snapshots = useSnapshotStore(state => state.getRecentSnapshotsForProject(projectId));
  const loadSnapshots = useSnapshotStore(state => state.loadRecentSnapshots);
  const isLoading = useSnapshotStore(state => state.isLoading);
  return { snapshots, loadSnapshots, isLoading };
};

export const useRecentBranches = (projectId: string) => {
  const branches = useSnapshotStore(state => state.getRecentBranchesForProject(projectId));
  const loadBranches = useSnapshotStore(state => state.loadRecentBranches);
  const isLoading = useSnapshotStore(state => state.isLoading);
  return { branches, loadBranches, isLoading };
};

export const useSnapshotOperations = () => {
  const createSnapshot = useSnapshotStore(state => state.createSnapshot);
  const revertToSnapshot = useSnapshotStore(state => state.revertToSnapshot);
  const pushSnapshot = useSnapshotStore(state => state.pushSnapshot);
  const isLoading = useSnapshotStore(state => state.isLoading);
  const lastOperation = useSnapshotStore(state => state.lastOperation);
  
  return {
    createSnapshot,
    revertToSnapshot,
    pushSnapshot,
    isLoading,
    lastOperation
  };
}; 