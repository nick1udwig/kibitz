/**
 * Enhanced Checkpoint Store
 * 
 * Integrates with LocalPersistenceService for Git-based checkpointing
 * with local file metadata caching for fast UI updates
 */

import { create } from 'zustand';
import { useStore } from './rootStore';
import { LocalPersistenceService, CheckpointMetadata } from '../lib/localPersistenceService';
import { ensureProjectDirectory } from '../lib/projectPathService';
import { createCommit, autoInitGitIfNeeded } from '../lib/gitService';
import { Project } from '../components/LlmChat/context/types';

/**
 * Enhanced checkpoint configuration
 */
export interface EnhancedCheckpointConfig {
  autoCheckpointEnabled: boolean;
  maxCheckpoints: number;
  autoInitGit: boolean;
  persistToFiles: boolean;
  branchOnCheckpoint: boolean;
}

/**
 * Checkpoint creation options
 */
export interface CheckpointCreateOptions {
  description: string;
  type?: 'manual' | 'auto' | 'tool-execution';
  tags?: string[];
  createBranch?: boolean;
  branchName?: string;
}

/**
 * Enhanced checkpoint state
 */
interface EnhancedCheckpointState {
  // Configuration
  config: EnhancedCheckpointConfig;
  
  // State
  checkpoints: Record<string, CheckpointMetadata[]>; // projectId -> checkpoints
  isProcessing: boolean;
  lastOperation: string | null;
  
  // Enhanced operations
  updateConfig: (updates: Partial<EnhancedCheckpointConfig>) => void;
  createProjectCheckpoint: (
    projectId: string, 
    options: CheckpointCreateOptions
  ) => Promise<{ success: boolean; checkpoint?: CheckpointMetadata; error?: string }>;
  
  loadProjectCheckpoints: (projectId: string) => Promise<CheckpointMetadata[]>;
  revertToCheckpoint: (
    projectId: string, 
    checkpointId: string,
    createBackup?: boolean
  ) => Promise<{ success: boolean; error?: string }>;
  
  // Auto-checkpoint handling
  handleToolExecution: (projectId: string, toolName: string) => Promise<void>;
  shouldCreateAutoCheckpoint: (projectId: string) => Promise<boolean>;
  
  // Recovery and maintenance
  initializeProjectPersistence: (projectId: string) => Promise<{ success: boolean; error?: string }>;
  rebuildFromGit: (projectId: string, force?: boolean) => Promise<{ success: boolean; error?: string }>;
  cleanupOldCheckpoints: (projectId: string, keepCount?: number) => Promise<void>;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: EnhancedCheckpointConfig = {
  autoCheckpointEnabled: true,
  maxCheckpoints: 100,
  autoInitGit: true,
  persistToFiles: true,
  branchOnCheckpoint: false, // Don't create branches by default
};

export const useEnhancedCheckpointStore = create<EnhancedCheckpointState>((set, get) => ({
  // Initial state
  config: DEFAULT_CONFIG,
  checkpoints: {},
  isProcessing: false,
  lastOperation: null,
  
  // Update configuration
  updateConfig: (updates: Partial<EnhancedCheckpointConfig>) => {
    set(state => ({
      config: { ...state.config, ...updates }
    }));
  },
  
  // Create a new checkpoint
  createProjectCheckpoint: async (
    projectId: string, 
    options: CheckpointCreateOptions
  ): Promise<{ success: boolean; checkpoint?: CheckpointMetadata; error?: string }> => {
    const { config } = get();
    const rootStore = useStore.getState();
    const project = rootStore.projects.find(p => p.id === projectId);
    
    if (!project) {
      return { success: false, error: `Project ${projectId} not found` };
    }
    
    const activeMcpServers = rootStore.servers.filter(server => 
      server.status === 'connected' && project.settings.mcpServerIds?.includes(server.id)
    );
    
    if (!activeMcpServers.length) {
      return { success: false, error: 'No active MCP servers available' };
    }
    
    try {
      set({ isProcessing: true, lastOperation: `Creating checkpoint: ${options.description}` });
      
      const mcpServerId = activeMcpServers[0].id;
      const projectPath = await ensureProjectDirectory(project, mcpServerId, rootStore.executeTool);
      
      // Auto-initialize Git if needed
      if (config.autoInitGit) {
        const gitResult = await autoInitGitIfNeeded(
          projectPath, project.name, mcpServerId, rootStore.executeTool
        );
        
        if (!gitResult.success) {
          console.warn('Failed to initialize Git, but continuing with checkpoint');
        }
      }
      
      // Create Git commit
      const commitResult = await createCommit(
        projectPath,
        options.description,
        mcpServerId,
        rootStore.executeTool
      );
      
      if (!commitResult.success) {
        return { 
          success: false, 
          error: `Failed to create Git commit: ${commitResult.commitHash || 'Unknown error'}` 
        };
      }
      
      if (commitResult.commitHash === 'no_changes') {
        return { 
          success: false, 
          error: 'No changes to commit' 
        };
      }
      
      // Create checkpoint metadata
      const checkpoint: CheckpointMetadata = {
        id: commitResult.commitHash?.substring(0, 7) || `cp_${Date.now()}`,
        projectId,
        description: options.description,
        timestamp: new Date(),
        commitHash: commitResult.commitHash || '',
        filesChanged: [], // Would need to get from Git diff
        linesChanged: 0,   // Would need to get from Git stats
        type: options.type || 'manual',
        tags: options.tags || []
      };
      
      // Save to local persistence if enabled
      if (config.persistToFiles) {
        await LocalPersistenceService.saveCheckpoint(
          projectPath, checkpoint, mcpServerId, rootStore.executeTool
        );
      }
      
      // Update store state
      set(state => ({
        checkpoints: {
          ...state.checkpoints,
          [projectId]: [...(state.checkpoints[projectId] || []), checkpoint]
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, config.maxCheckpoints) // Limit to max checkpoints
        }
      }));
      
      console.log(`✅ Created checkpoint: ${options.description} (${checkpoint.id})`);
      return { success: true, checkpoint };
      
    } catch (error) {
      console.error('Failed to create checkpoint:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    } finally {
      set({ isProcessing: false, lastOperation: null });
    }
  },
  
  // Load checkpoints for a project
  loadProjectCheckpoints: async (projectId: string): Promise<CheckpointMetadata[]> => {
    const rootStore = useStore.getState();
    const project = rootStore.projects.find(p => p.id === projectId);
    
    if (!project) {
      console.error(`Project ${projectId} not found`);
      return [];
    }
    
    const activeMcpServers = rootStore.servers.filter(server => 
      server.status === 'connected' && project.settings.mcpServerIds?.includes(server.id)
    );
    
    if (!activeMcpServers.length) {
      console.warn('No active MCP servers available for loading checkpoints');
      return [];
    }
    
    try {
      const mcpServerId = activeMcpServers[0].id;
      const projectPath = await ensureProjectDirectory(project, mcpServerId, rootStore.executeTool);
      
      // Load from local persistence
      const checkpoints = await LocalPersistenceService.getCheckpoints(
        projectPath, mcpServerId, rootStore.executeTool
      );
      
      // Update store state
      set(state => ({
        checkpoints: {
          ...state.checkpoints,
          [projectId]: checkpoints
        }
      }));
      
      console.log(`📦 Loaded ${checkpoints.length} checkpoints for project: ${project.name}`);
      return checkpoints;
      
    } catch (error) {
      console.error('Failed to load checkpoints:', error);
      return [];
    }
  },
  
  // Revert to a checkpoint
  revertToCheckpoint: async (
    projectId: string, 
    checkpointId: string,
    createBackup: boolean = true
  ): Promise<{ success: boolean; error?: string }> => {
    const rootStore = useStore.getState();
    const project = rootStore.projects.find(p => p.id === projectId);
    
    if (!project) {
      return { success: false, error: `Project ${projectId} not found` };
    }
    
    const activeMcpServers = rootStore.servers.filter(server => 
      server.status === 'connected' && project.settings.mcpServerIds?.includes(server.id)
    );
    
    if (!activeMcpServers.length) {
      return { success: false, error: 'No active MCP servers available' };
    }
    
    const { checkpoints } = get();
    const projectCheckpoints = checkpoints[projectId] || [];
    const targetCheckpoint = projectCheckpoints.find(cp => cp.id === checkpointId);
    
    if (!targetCheckpoint) {
      return { success: false, error: `Checkpoint ${checkpointId} not found` };
    }
    
    try {
      set({ isProcessing: true, lastOperation: `Reverting to checkpoint: ${targetCheckpoint.description}` });
      
      const mcpServerId = activeMcpServers[0].id;
      const projectPath = await ensureProjectDirectory(project, mcpServerId, rootStore.executeTool);
      
      // Use the branch service for safe revert
      const { revertToState } = await import('../lib/branchService');
      
      const revertResult = await revertToState(
        projectPath,
        {
          targetCommit: targetCheckpoint.commitHash,
          createBackupBranch: createBackup,
          backupBranchName: createBackup ? `backup/before-revert-${Date.now()}` : undefined
        },
        mcpServerId,
        rootStore.executeTool
      );
      
      if (!revertResult.success) {
        return { success: false, error: revertResult.error };
      }
      
      console.log(`✅ Reverted to checkpoint: ${targetCheckpoint.description}`);
      if (revertResult.backupBranch) {
        console.log(`📄 Created backup branch: ${revertResult.backupBranch}`);
      }
      
      return { success: true };
      
    } catch (error) {
      console.error('Failed to revert to checkpoint:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    } finally {
      set({ isProcessing: false, lastOperation: null });
    }
  },
  
  // Handle tool execution for auto-checkpointing
  handleToolExecution: async (projectId: string, toolName: string): Promise<void> => {
    const { config } = get();
    
    if (!config.autoCheckpointEnabled) {
      return;
    }
    
    // Skip certain tools
    const skipTools = ['Initialize', 'BashCommand'];
    if (skipTools.includes(toolName)) {
      return;
    }
    
    try {
      // Check if we should create an auto-checkpoint
      const shouldCreate = await get().shouldCreateAutoCheckpoint(projectId);
      
      if (shouldCreate) {
        const result = await get().createProjectCheckpoint(projectId, {
          description: `Auto-checkpoint after ${toolName}`,
          type: 'tool-execution',
          tags: ['auto', 'tool-execution', toolName.toLowerCase()]
        });
        
        if (result.success) {
          console.log(`🤖 Auto-created checkpoint after ${toolName}`);
        }
      }
    } catch (error) {
      console.error('Failed to handle tool execution for auto-checkpointing:', error);
    }
  },
  
  // Check if auto-checkpoint should be created
  shouldCreateAutoCheckpoint: async (projectId: string): Promise<boolean> => {
    const { config, checkpoints } = get();
    
    if (!config.autoCheckpointEnabled) {
      return false;
    }
    
    const projectCheckpoints = checkpoints[projectId] || [];
    
    // Don't create if we just created one recently (within 5 minutes)
    const recentCheckpoint = projectCheckpoints.find(cp => 
      Date.now() - new Date(cp.timestamp).getTime() < 5 * 60 * 1000
    );
    
    if (recentCheckpoint) {
      console.log('⏱️ Skipping auto-checkpoint - recent checkpoint exists');
      return false;
    }
    
    // You could add more sophisticated logic here
    // For now, always create if no recent checkpoint exists
    return true;
  },
  
  // Initialize persistence for a project
  initializeProjectPersistence: async (projectId: string): Promise<{ success: boolean; error?: string }> => {
    const rootStore = useStore.getState();
    const project = rootStore.projects.find(p => p.id === projectId);
    
    if (!project) {
      return { success: false, error: `Project ${projectId} not found` };
    }
    
    const activeMcpServers = rootStore.servers.filter(server => 
      server.status === 'connected' && project.settings.mcpServerIds?.includes(server.id)
    );
    
    if (!activeMcpServers.length) {
      return { success: false, error: 'No active MCP servers available' };
    }
    
    try {
      const mcpServerId = activeMcpServers[0].id;
      const projectPath = await ensureProjectDirectory(project, mcpServerId, rootStore.executeTool);
      
      const result = await LocalPersistenceService.initializeProjectPersistence(
        projectPath, projectId, project.name, mcpServerId, rootStore.executeTool
      );
      
      if (result.success) {
        console.log(`✅ Initialized persistence for project: ${project.name}`);
      }
      
      return result;
      
    } catch (error) {
      console.error('Failed to initialize project persistence:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  },
  
  // Rebuild checkpoints from Git history
  rebuildFromGit: async (projectId: string, force: boolean = false): Promise<{ success: boolean; error?: string }> => {
    const rootStore = useStore.getState();
    const project = rootStore.projects.find(p => p.id === projectId);
    
    if (!project) {
      return { success: false, error: `Project ${projectId} not found` };
    }
    
    const activeMcpServers = rootStore.servers.filter(server => 
      server.status === 'connected' && project.settings.mcpServerIds?.includes(server.id)
    );
    
    if (!activeMcpServers.length) {
      return { success: false, error: 'No active MCP servers available' };
    }
    
    try {
      set({ isProcessing: true, lastOperation: 'Rebuilding checkpoints from Git history' });
      
      const mcpServerId = activeMcpServers[0].id;
      const projectPath = await ensureProjectDirectory(project, mcpServerId, rootStore.executeTool);
      
      const result = await LocalPersistenceService.rebuildCheckpointsFromGit(
        projectPath, projectId, mcpServerId, rootStore.executeTool
      );
      
      if (result.success) {
        // Update store state with rebuilt checkpoints
        set(state => ({
          checkpoints: {
            ...state.checkpoints,
            [projectId]: result.checkpoints
          }
        }));
        
        console.log(`✅ Rebuilt ${result.checkpoints.length} checkpoints from Git history`);
      }
      
      return { success: result.success, error: result.error };
      
    } catch (error) {
      console.error('Failed to rebuild checkpoints from Git:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    } finally {
      set({ isProcessing: false, lastOperation: null });
    }
  },
  
  // Clean up old checkpoints
  cleanupOldCheckpoints: async (projectId: string, keepCount: number = 50): Promise<void> => {
    const { checkpoints, config } = get();
    const projectCheckpoints = checkpoints[projectId] || [];
    
    if (projectCheckpoints.length <= keepCount) {
      return; // Nothing to clean up
    }
    
    try {
      // Keep the most recent checkpoints
      const sortedCheckpoints = [...projectCheckpoints]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
      const keepCheckpoints = sortedCheckpoints.slice(0, keepCount);
      
      // Update store state
      set(state => ({
        checkpoints: {
          ...state.checkpoints,
          [projectId]: keepCheckpoints
        }
      }));
      
      // If persistence is enabled, update the file too
      if (config.persistToFiles) {
        const rootStore = useStore.getState();
        const project = rootStore.projects.find(p => p.id === projectId);
        
        if (project) {
          const activeMcpServers = rootStore.servers.filter(server => 
            server.status === 'connected' && project.settings.mcpServerIds?.includes(server.id)
          );
          
          if (activeMcpServers.length > 0) {
            const mcpServerId = activeMcpServers[0].id;
            const projectPath = await ensureProjectDirectory(project, mcpServerId, rootStore.executeTool);
            
            // Write the cleaned up checkpoints back to file
            for (const checkpoint of keepCheckpoints) {
              await LocalPersistenceService.saveCheckpoint(
                projectPath, checkpoint, mcpServerId, rootStore.executeTool
              );
            }
          }
        }
      }
      
      const removedCount = projectCheckpoints.length - keepCheckpoints.length;
      console.log(`🧹 Cleaned up ${removedCount} old checkpoints for project ${projectId}`);
      
    } catch (error) {
      console.error('Failed to cleanup old checkpoints:', error);
    }
  }
})); 