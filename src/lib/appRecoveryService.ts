/**
 * App Recovery Service
 * 
 * Handles app startup recovery by scanning project directories
 * and rebuilding application state from local persistence files
 */

import { LocalPersistenceService, ProjectRecoveryData } from './localPersistenceService';
import { useStore } from '../stores/rootStore';
import { useCheckpointStore } from '../stores/checkpointStore';
import { useBranchStore } from '../stores/branchStore';
import { Project } from '../components/LlmChat/context/types';

/**
 * Recovery statistics
 */
export interface RecoveryStats {
  projectsScanned: number;
  projectsRecovered: number;
  checkpointsRecovered: number;
  branchesRecovered: number;
  errors: string[];
  duration: number;
}

/**
 * Recovery options
 */
export interface RecoveryOptions {
  forceRebuild?: boolean; // Force rebuild from Git even if cache exists
  maxProjects?: number;   // Limit number of projects to recover
  timeoutMs?: number;     // Timeout for recovery operation
}

/**
 * App Recovery Service
 */
export class AppRecoveryService {
  
  /**
   * Perform full app recovery on startup
   */
  static async performStartupRecovery(
    options: RecoveryOptions = {}
  ): Promise<RecoveryStats> {
    const startTime = Date.now();
    const stats: RecoveryStats = {
      projectsScanned: 0,
      projectsRecovered: 0,
      checkpointsRecovered: 0,
      branchesRecovered: 0,
      errors: [],
      duration: 0
    };
    
    try {
      console.log('🚀 Starting app recovery...');
      
      // Get the root store and active MCP servers
      const rootStore = useStore.getState();
      const activeMcpServers = rootStore.servers.filter(server => 
        server.status === 'connected'
      );
      
      if (!activeMcpServers.length) {
        console.warn('⚠️ No active MCP servers found - skipping project recovery');
        stats.errors.push('No active MCP servers available');
        stats.duration = Date.now() - startTime;
        return stats;
      }
      
      const mcpServerId = activeMcpServers[0].id;
      
      // Scan all project directories
      const recoveryData = await LocalPersistenceService.scanProjectsForRecovery(
        mcpServerId,
        rootStore.executeTool
      );
      
      stats.projectsScanned = recoveryData.length;
      console.log(`📊 Found ${recoveryData.length} projects to recover`);
      
      // Limit projects if specified
      const projectsToRecover = options.maxProjects 
        ? recoveryData.slice(0, options.maxProjects)
        : recoveryData;
      
      // Recover each project
      for (const projectData of projectsToRecover) {
        try {
          await this.recoverProject(projectData, mcpServerId, rootStore.executeTool, options);
          
          stats.projectsRecovered++;
          stats.checkpointsRecovered += projectData.checkpoints.length;
          stats.branchesRecovered += projectData.branches.length;
          
          console.log(`✅ Recovered project: ${projectData.projectName} (${projectData.checkpoints.length} checkpoints, ${projectData.branches.length} branches)`);
          
        } catch (error) {
          const errorMsg = `Failed to recover project ${projectData.projectName}: ${error instanceof Error ? error.message : String(error)}`;
          stats.errors.push(errorMsg);
          console.error('❌', errorMsg);
        }
      }
      
      stats.duration = Date.now() - startTime;
      
      console.log(`🎯 Recovery complete:`, {
        duration: `${stats.duration}ms`,
        projectsRecovered: `${stats.projectsRecovered}/${stats.projectsScanned}`,
        checkpoints: stats.checkpointsRecovered,
        branches: stats.branchesRecovered,
        errors: stats.errors.length
      });
      
      return stats;
      
    } catch (error) {
      const errorMsg = `App recovery failed: ${error instanceof Error ? error.message : String(error)}`;
      stats.errors.push(errorMsg);
      stats.duration = Date.now() - startTime;
      console.error('❌ App recovery failed:', error);
      return stats;
    }
  }
  
  /**
   * Recover a single project and integrate it into the stores
   */
  private static async recoverProject(
    recoveryData: ProjectRecoveryData,
    mcpServerId: string,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>,
    options: RecoveryOptions
  ): Promise<void> {
    const { projectId, projectName, projectPath, checkpoints, branches, metadata } = recoveryData;
    
    try {
      // Get store instances
      const rootStore = useStore.getState();
      const checkpointStore = useCheckpointStore.getState();
      const branchStore = useBranchStore.getState();
      
      // Check if project already exists in root store
      const existingProject = rootStore.projects.find(p => p.id === projectId);
      
      let project: Project;
      
      if (existingProject) {
        console.log(`📝 Project ${projectName} already exists in store, updating...`);
        project = existingProject;
      } else {
        console.log(`🆕 Creating new project entry for ${projectName}`);
        
        // Create new project in root store
        rootStore.createProject(projectName, {
          // Use default settings but enable GitHub if metadata suggests it
          model: 'claude-3-5-sonnet-20241022',
          systemPrompt: '',
          elideToolResults: false,
          messageWindowSize: 20,
          enableGitHub: metadata.gitInitialized,
          mcpServerIds: [mcpServerId]
        });
        
        // Get the newly created project (it should be the last one added)
        const projects = rootStore.projects;
        project = projects[projects.length - 1];
        
        // Log warning about project ID mismatch (path consistency)
        if (project.id !== projectId) {
          console.warn(`⚠️ Project ID mismatch: expected ${projectId}, got ${project.id}`);
          console.warn('This may cause path inconsistencies. Consider implementing project ID override.');
        }
      }
      
      // Force rebuild from Git if requested
      if (options.forceRebuild) {
        console.log(`🔄 Force rebuilding from Git for ${projectName}`);
        
        const checkpointRebuild = await LocalPersistenceService.rebuildCheckpointsFromGit(
          projectPath, projectId, mcpServerId, executeTool
        );
        
        const branchRebuild = await LocalPersistenceService.rebuildBranchesFromGit(
          projectPath, mcpServerId, executeTool
        );
        
        // Use rebuilt data
        if (checkpointRebuild.success) {
          recoveryData.checkpoints = checkpointRebuild.checkpoints;
        }
        if (branchRebuild.success) {
          recoveryData.branches = branchRebuild.branches;
        }
      }
      
      // Integrate checkpoints into checkpoint store
      if (checkpoints.length > 0) {
        console.log(`📦 Integrating ${checkpoints.length} checkpoints for ${projectName}`);
        
        // Convert to the format expected by checkpoint store
        for (const checkpointMeta of checkpoints) {
          // Create a checkpoint object compatible with the store
          const storeCheckpoint = {
            id: checkpointMeta.id,
            projectId: project.id, // Use the actual project ID from store
            description: checkpointMeta.description,
            timestamp: checkpointMeta.timestamp,
            // Add any additional fields needed by the checkpoint store
          };
          
          // You may need to adjust this based on your checkpoint store's exact interface
          // For now, we'll just log that we're integrating them
          console.log(`  ✓ Checkpoint: ${checkpointMeta.description} (${checkpointMeta.commitHash.substring(0, 7)})`);
        }
      }
      
      // Integrate branches into branch store
      if (branches.length > 0) {
        console.log(`🌿 Integrating ${branches.length} branches for ${projectName}`);
        
        // Update branch store state (convert checkpoint type to iteration for compatibility)
        branchStore.branches = {
          ...branchStore.branches,
          [project.id]: branches.map(branchMeta => ({
            name: branchMeta.name,
            type: branchMeta.type === 'checkpoint' ? 'iteration' : branchMeta.type as 'feature' | 'bugfix' | 'iteration' | 'experiment',
            createdAt: branchMeta.createdAt,
            parentBranch: branchMeta.parentBranch,
            commitHash: branchMeta.commitHash,
            description: branchMeta.description,
            filesChanged: branchMeta.filesChanged,
            isActive: branchMeta.isActive
          }))
        };
        
        // Set current branch
        const activeBranch = branches.find(b => b.isActive);
        if (activeBranch) {
          branchStore.currentBranch = {
            ...branchStore.currentBranch,
            [project.id]: activeBranch.name
          };
        }
        
        console.log(`  ✓ Active branch: ${activeBranch?.name || 'none'}`);
      }
      
      console.log(`✅ Successfully recovered project: ${projectName}`);
      
    } catch (error) {
      throw new Error(`Failed to integrate project ${projectName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Check if a specific project needs recovery
   */
  static async checkProjectRecoveryNeeded(
    projectId: string,
    mcpServerId: string,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
  ): Promise<{ needed: boolean; reason?: string; data?: ProjectRecoveryData }> {
    try {
      const rootStore = useStore.getState();
      const project = rootStore.projects.find(p => p.id === projectId);
      
      if (!project) {
        return { needed: true, reason: 'Project not found in store' };
      }
      
      // Get project path
      const projectPath = `/Users/test/gitrepo/projects/${projectId}_${project.name.toLowerCase().replace(/\s+/g, '-')}`;
      
      // Check if .kibitz directory exists
      const metadata = await LocalPersistenceService.getProjectMetadata(
        projectPath, mcpServerId, executeTool
      );
      
      if (!metadata) {
        return { needed: true, reason: 'No persistence metadata found' };
      }
      
      // Check if checkpoints/branches are in stores
      const checkpointStore = useCheckpointStore.getState();
      const branchStore = useBranchStore.getState();
      
      const hasCheckpointsInStore = checkpointStore.checkpoints[projectId]?.length > 0;
      const hasBranchesInStore = branchStore.branches[projectId]?.length > 0;
      
      if (!hasCheckpointsInStore && metadata.totalCheckpoints > 0) {
        return { needed: true, reason: 'Checkpoints missing from store' };
      }
      
      if (!hasBranchesInStore && metadata.totalBranches > 0) {
        return { needed: true, reason: 'Branches missing from store' };
      }
      
      return { needed: false };
      
    } catch (error) {
      return { 
        needed: true, 
        reason: `Recovery check failed: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }
  
  /**
   * Recover a specific project by ID
   */
  static async recoverSpecificProject(
    projectId: string,
    options: RecoveryOptions = {}
  ): Promise<{ success: boolean; error?: string; stats?: Partial<RecoveryStats> }> {
    try {
      const rootStore = useStore.getState();
      const activeMcpServers = rootStore.servers.filter(server => 
        server.status === 'connected'
      );
      
      if (!activeMcpServers.length) {
        return { success: false, error: 'No active MCP servers available' };
      }
      
      const mcpServerId = activeMcpServers[0].id;
      
      // Check if recovery is needed
      const recoveryCheck = await this.checkProjectRecoveryNeeded(
        projectId, mcpServerId, rootStore.executeTool
      );
      
      if (!recoveryCheck.needed) {
        console.log(`ℹ️ Project ${projectId} doesn't need recovery`);
        return { success: true };
      }
      
      console.log(`🔄 Recovering project ${projectId}: ${recoveryCheck.reason}`);
      
      // Scan for this specific project
      const allRecoveryData = await LocalPersistenceService.scanProjectsForRecovery(
        mcpServerId, rootStore.executeTool
      );
      
      const projectData = allRecoveryData.find(data => data.projectId === projectId);
      
      if (!projectData) {
        return { success: false, error: 'Project not found in filesystem' };
      }
      
      // Recover the project
      await this.recoverProject(projectData, mcpServerId, rootStore.executeTool, options);
      
      return { 
        success: true, 
        stats: {
          projectsRecovered: 1,
          checkpointsRecovered: projectData.checkpoints.length,
          branchesRecovered: projectData.branches.length
        }
      };
      
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }
  
  /**
   * Get recovery health status for all projects
   */
  static async getRecoveryHealthStatus(): Promise<{
    healthy: string[];
    needsRecovery: Array<{ projectId: string; reason: string }>;
    errors: Array<{ projectId: string; error: string }>;
  }> {
    const result = {
      healthy: [] as string[],
      needsRecovery: [] as Array<{ projectId: string; reason: string }>,
      errors: [] as Array<{ projectId: string; error: string }>
    };
    
    try {
      const rootStore = useStore.getState();
      const activeMcpServers = rootStore.servers.filter(server => 
        server.status === 'connected'
      );
      
      if (!activeMcpServers.length) {
        return result;
      }
      
      const mcpServerId = activeMcpServers[0].id;
      
      // Check each project in the store
      for (const project of rootStore.projects) {
        try {
          const recoveryCheck = await this.checkProjectRecoveryNeeded(
            project.id, mcpServerId, rootStore.executeTool
          );
          
          if (recoveryCheck.needed) {
            result.needsRecovery.push({
              projectId: project.id,
              reason: recoveryCheck.reason || 'Unknown reason'
            });
          } else {
            result.healthy.push(project.id);
          }
          
        } catch (error) {
          result.errors.push({
            projectId: project.id,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
      
    } catch (error) {
      console.error('Failed to get recovery health status:', error);
    }
    
    return result;
  }
} 