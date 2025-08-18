import { create } from 'zustand';
import { Checkpoint, CheckpointConfig } from '../types/Checkpoint';
import { 
  createCheckpoint, 
  getCheckpoints, 
  getCheckpointById, 
  deleteCheckpoint,
  getShortHash,
  // createAutoCheckpoint
} from '../lib/checkpointService';
import { 
  initGitRepository, 
  createGitHubRepository
} from '../lib/gitService';
import { createCommit, executeGitCommand } from '../lib/versionControl/git';
import { Project } from '../components/LlmChat/context/types';
// import { ensureProjectDirectory, getGitHubRepoName } from '../lib/projectPathService';

// Default checkpoint configuration
const DEFAULT_CHECKPOINT_CONFIG: CheckpointConfig = {
  autoCheckpointEnabled: true,
  checkpointFrequency: 'onCommit',
  maxCheckpoints: 20,
  gitIntegrationEnabled: true,
};

interface CheckpointState {
  // State
  checkpoints: Record<string, Checkpoint[]>; // projectId -> checkpoints
  selectedCheckpointId: string | null;
  isRollbackMode: boolean;
  config: CheckpointConfig;
  isLoading: boolean;
  
  // Methods
  initialize: (projectId: string) => Promise<void>;
  createManualCheckpoint: (projectId: string, project: Project, description: string) => Promise<Checkpoint>;
  createAutoCheckpointAfterOperation: () => Promise<Checkpoint | null>;
  selectCheckpoint: (checkpointId: string | null) => void;
  deleteCheckpointById: (projectId: string, checkpointId: string) => Promise<void>;
  rollbackToCheckpoint: (projectId: string, checkpointId: string) => Promise<Project | null>;
  updateConfig: (updates: Partial<CheckpointConfig>) => void;
  
  // Git integration methods
  initializeGitRepository: (
    projectPath: string, 
    projectName: string, 
    mcpServerId: string, 
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
  ) => Promise<boolean>;
  
  createGitHubRepo: (
    repoName: string, 
    description: string | undefined, 
    mcpServerId: string,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
  ) => Promise<boolean>;
  
  createGitCommit: (
    projectPath: string, 
    message: string, 
    mcpServerId: string, 
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
  ) => Promise<string>;
}

// Create the checkpoint store
export const useCheckpointStore = create<CheckpointState>((set, get) => ({
  // Initial state
  checkpoints: {},
  selectedCheckpointId: null,
  isRollbackMode: false,
  config: DEFAULT_CHECKPOINT_CONFIG,
  isLoading: false,
  
  // Initialize checkpoints for a project
  initialize: async (projectId: string) => {
    set({ isLoading: true });
    
    try {
      const checkpoints = await getCheckpoints(projectId);
      
      set(state => ({
        checkpoints: {
          ...state.checkpoints,
          [projectId]: checkpoints
        },
        isLoading: false
      }));
    } catch (error) {
      console.error('Failed to initialize checkpoints:', error);
      set({ isLoading: false });
    }
  },
  
  // Create a manual checkpoint
  createManualCheckpoint: async (projectId: string, project: Project, description: string) => {
    set({ isLoading: true });
    
    try {
      const checkpoint = await createCheckpoint(projectId, project, description);
      
      set(state => ({
        checkpoints: {
          ...state.checkpoints,
          [projectId]: [
            checkpoint,
            ...(state.checkpoints[projectId] || [])
          ]
        },
        isLoading: false
      }));
      
      return checkpoint;
    } catch (error) {
      console.error('Failed to create manual checkpoint:', error);
      set({ isLoading: false });
      throw error;
    }
  },
  
  // Create an automatic checkpoint after an operation
  createAutoCheckpointAfterOperation: async () => {
    // 🔒 DISABLED: Auto-checkpoint creation to prevent multiple branches
    console.log('⚠️ Auto-checkpoint creation disabled to prevent multiple branches');
    return null;

    /* ORIGINAL CODE DISABLED:
    const { config } = get();
    
    // Skip if auto-checkpointing is disabled
    if (!config.autoCheckpointEnabled) {
      return null;
    }
    
    try {
      const checkpoint = await createAutoCheckpoint(projectId, project, operation);
      
      set(state => ({
        checkpoints: {
          ...state.checkpoints,
          [projectId]: [
            checkpoint,
            ...(state.checkpoints[projectId] || [])
          ]
        }
      }));
      
      // Enforce max checkpoints limit by removing oldest auto checkpoints
      const projectCheckpoints = get().checkpoints[projectId] || [];
      if (projectCheckpoints.length > config.maxCheckpoints) {
        // Find oldest auto checkpoints to remove
        const autoCheckpoints = projectCheckpoints
          .filter(cp => cp.tags.includes('auto'))
          .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        
        // Remove oldest auto checkpoints
        const checkpointsToRemove = autoCheckpoints.slice(
          0, 
          projectCheckpoints.length - config.maxCheckpoints
        );
        
        // Delete each checkpoint
        for (const cp of checkpointsToRemove) {
          await get().deleteCheckpointById(projectId, cp.id);
        }
      }
      
      return checkpoint;
    } catch (error) {
      console.error('Failed to create auto checkpoint:', error);
      return null;
    }
    */
  },
  
  // Select a checkpoint
  selectCheckpoint: (checkpointId: string | null) => {
    set({
      selectedCheckpointId: checkpointId,
      isRollbackMode: !!checkpointId
    });
  },
  
  // Delete a checkpoint
  deleteCheckpointById: async (projectId: string, checkpointId: string) => {
    set({ isLoading: true });
    
    try {
      await deleteCheckpoint(projectId, checkpointId);
      
      set(state => ({
        checkpoints: {
          ...state.checkpoints,
          [projectId]: (state.checkpoints[projectId] || []).filter(cp => cp.id !== checkpointId)
        },
        selectedCheckpointId: state.selectedCheckpointId === checkpointId ? null : state.selectedCheckpointId,
        isRollbackMode: state.selectedCheckpointId === checkpointId ? false : state.isRollbackMode,
        isLoading: false
      }));
    } catch (error) {
      console.error('Failed to delete checkpoint:', error);
      set({ isLoading: false });
      throw error;
    }
  },
  
  // Rollback to a checkpoint
  rollbackToCheckpoint: async (projectId: string, checkpointId: string) => {
    set({ isLoading: true });
    
    try {
      const checkpoint = await getCheckpointById(projectId, checkpointId);
      
      if (!checkpoint) {
        console.error(`Checkpoint with ID ${checkpointId} not found`);
        set({ isLoading: false });
        return null;
      }
      
      const { project } = checkpoint.snapshotData;
      
      set({
        isLoading: false,
        isRollbackMode: false,
        selectedCheckpointId: null
      });
      
      return project;
    } catch (error) {
      console.error('Failed to rollback to checkpoint:', error);
      set({ isLoading: false });
      return null;
    }
  },
  
  // Update checkpoint configuration
  updateConfig: (updates: Partial<CheckpointConfig>) => {
    set(state => ({
      config: {
        ...state.config,
        ...updates
      }
    }));
  },
  
  // Initialize Git repository
  initializeGitRepository: async (
    projectPath: string, 
    projectName: string, 
    mcpServerId: string,
    executeTool
  ) => {
    set({ isLoading: true });
    
    try {
      const result = await initGitRepository(
        {
          projectPath,
          projectName,
          addFiles: false,  // Don't automatically add files
          initialCommit: false,  // Don't automatically commit
          commitMessage: 'Initial commit'
        },
        mcpServerId,
        executeTool
      );
      
      set({ isLoading: false });
      return result.success;
    } catch (error) {
      console.error('Failed to initialize Git repository:', error);
      set({ isLoading: false });
      return false;
    }
  },
  
  // Create GitHub repository
  createGitHubRepo: async (
    repoName: string, 
    description: string | undefined, 
    mcpServerId: string,
    executeTool
  ) => {
    set({ isLoading: true });
    
    try {
      const result = await createGitHubRepository(
        {
          repoName,
          description
        },
        mcpServerId,
        executeTool
      );
      
      set({ isLoading: false });
      return result.success;
    } catch (error) {
      console.error('Failed to create GitHub repository:', error);
      set({ isLoading: false });
      return false;
    }
  },
  
  // Create Git commit
  createGitCommit: async (
    projectPath: string, 
    message: string, 
    mcpServerId: string, 
    executeTool
  ) => {
    set({ isLoading: true });
    
    try {
      console.log(`Creating Git commit at ${projectPath} with message: "${message}"`);

      // Pre-flight: ensure git user.name and user.email are configured somewhere
      try {
        const nameRes = await executeGitCommand(mcpServerId, 'git config --get user.name', projectPath, executeTool);
        const emailRes = await executeGitCommand(mcpServerId, 'git config --get user.email', projectPath, executeTool);
        if (!nameRes.success || !nameRes.output.trim() || !emailRes.success || !emailRes.output.trim()) {
          console.warn('Git identity not configured. Configure GIT_USER_NAME and GIT_USER_EMAIL in .env/.env.local or set global git config.');
        }
      } catch {}

      // Check if this is a Git repository and initialize if needed (using cached git executor)
      try {
        const gitCheck = await executeGitCommand(
          mcpServerId,
          'git rev-parse --is-inside-work-tree 2>/dev/null || echo not-git',
          projectPath,
          executeTool
        );
        if (!gitCheck.success || gitCheck.output.includes('not-git')) {
          console.log('Not a Git repository, initializing...');
          const initSuccess = await get().initializeGitRepository(
            projectPath,
            'Project',
            mcpServerId,
            executeTool
          );
          if (!initSuccess) {
            console.error('Failed to initialize Git repository');
            set({ isLoading: false });
            return 'not_git_repo';
          }
        }
      } catch (gitCheckError) {
        console.warn('Git check failed, attempting initialization:', gitCheckError);
        const initSuccess = await get().initializeGitRepository(
          projectPath,
          'Project',
          mcpServerId,
          executeTool
        );
        if (!initSuccess) {
          console.error('Failed to initialize Git repository');
          set({ isLoading: false });
          return 'not_git_repo';
        }
      }
      
      console.log("Calling createCommit function...");
      const result = await createCommit(
        projectPath,
        message,
        mcpServerId,
        executeTool
      );
      console.log("createCommit result:", result);
      
      set({ isLoading: false });
      
      if (result.success) {
        if (!result.commitHash) {
          console.warn("Commit reported as successful but no commit hash was returned");
          return "unknown";
        } else if (result.commitHash === "no_changes") {
          return "no_changes";
        } else if (result.commitHash === "unknown") {
          return "unknown";
        } else {
          try {
            const shortHash = getShortHash(result.commitHash);
            console.log(`Got short hash: ${shortHash} from full hash: ${result.commitHash}`);
            return shortHash;
          } catch (hashError) {
            console.error("Error getting short hash:", hashError, "Full hash:", result.commitHash);
            return result.commitHash.substring(0, 7); // Fallback method
          }
        }
      }
      
      return "failed";
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error('Failed to create Git commit:', errorMessage);
      set({ isLoading: false });
      
      // Return a meaningful error message
      if (errorMessage.includes("not a git repository")) {
        return "not_git_repo";
      } else if (errorMessage.includes("nothing to commit")) {
        return "no_changes";
      } else {
        // Just return a short version of the error
        return `error: ${errorMessage.substring(0, 30)}`;
      }
    }
  }
})); 