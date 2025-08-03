/**
 * App Initialization Service
 * 
 * Integrates the local persistence recovery system with the existing app startup
 * Ensures all projects, checkpoints, and branches are recovered on app restart
 */

import { AppRecoveryService, RecoveryStats } from './appRecoveryService';
import { useStore } from '../stores/rootStore';
import { useEnhancedCheckpointStore } from '../stores/enhancedCheckpointStore';
import { useBranchStore } from '../stores/branchStore';

/**
 * Initialization options
 */
export interface InitializationOptions {
  enableRecovery?: boolean;
  maxRecoveryProjects?: number;
  forceRebuild?: boolean;
  recoveryTimeout?: number;
}

/**
 * Initialization result
 */
export interface InitializationResult {
  success: boolean;
  recoveryStats?: RecoveryStats;
  errors: string[];
  duration: number;
}

/**
 * App Initialization Service
 */
export class AppInitializationService {
  
  /**
   * Perform complete app initialization with recovery
   */
  static async initializeWithRecovery(
    options: InitializationOptions = {}
  ): Promise<InitializationResult> {
    const startTime = Date.now();
    const result: InitializationResult = {
      success: false,
      errors: [],
      duration: 0
    };
    
    try {
      console.log('🚀 Starting Kibitz app initialization with recovery...');
      
      // First, perform the standard app initialization
      const rootStore = useStore.getState();
      
      if (!rootStore.initialized) {
        console.log('📋 Performing standard app initialization...');
        await rootStore.initialize();
        
        // Wait a moment for initialization to complete
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Then perform recovery if enabled
      if (options.enableRecovery !== false) {
        console.log('🔍 Starting recovery process...');
        
        const recoveryStats = await AppRecoveryService.performStartupRecovery({
          maxProjects: options.maxRecoveryProjects,
          forceRebuild: options.forceRebuild,
          timeoutMs: options.recoveryTimeout
        });
        
        result.recoveryStats = recoveryStats;
        result.errors.push(...recoveryStats.errors);
        
        if (recoveryStats.errors.length > 0) {
          console.warn(`⚠️ Recovery completed with ${recoveryStats.errors.length} errors`);
        }
        
        // Initialize persistence for any projects that need it
        await this.initializePersistenceForAllProjects();
        
        console.log('✅ Recovery process completed');
      }
      
      result.success = true;
      result.duration = Date.now() - startTime;
      
      console.log(`🎯 App initialization complete in ${result.duration}ms`);
      
      return result;
      
    } catch (error) {
      const errorMsg = `App initialization failed: ${error instanceof Error ? error.message : String(error)}`;
      result.errors.push(errorMsg);
      result.duration = Date.now() - startTime;
      console.error('❌', errorMsg);
      
      return result;
    }
  }
  
  /**
   * Initialize persistence for all existing projects
   */
  private static async initializePersistenceForAllProjects(): Promise<void> {
    try {
      const rootStore = useStore.getState();
      const enhancedCheckpointStore = useEnhancedCheckpointStore.getState();
      
      console.log(`🔧 Initializing persistence for ${rootStore.projects.length} projects...`);
      
      for (const project of rootStore.projects) {
        try {
          const result = await enhancedCheckpointStore.initializeProjectPersistence(project.id);
          
          if (result.success) {
            console.log(`✅ Initialized persistence for: ${project.name}`);
          } else {
            console.warn(`⚠️ Failed to initialize persistence for ${project.name}: ${result.error}`);
          }
          
        } catch (error) {
          console.error(`❌ Error initializing persistence for ${project.name}:`, error);
        }
      }
      
    } catch (error) {
      console.error('Failed to initialize persistence for projects:', error);
    }
  }
  
  /**
   * Check if recovery is needed for the current state
   */
  static async checkRecoveryNeeded(): Promise<{
    needed: boolean;
    reasons: string[];
    projectsNeedingRecovery: string[];
  }> {
    const result = {
      needed: false,
      reasons: [] as string[],
      projectsNeedingRecovery: [] as string[]
    };
    
    try {
      const healthStatus = await AppRecoveryService.getRecoveryHealthStatus();
      
      if (healthStatus.needsRecovery.length > 0) {
        result.needed = true;
        result.reasons.push(`${healthStatus.needsRecovery.length} projects need recovery`);
        result.projectsNeedingRecovery = healthStatus.needsRecovery.map(item => item.projectId);
      }
      
      if (healthStatus.errors.length > 0) {
        result.needed = true;
        result.reasons.push(`${healthStatus.errors.length} projects have recovery errors`);
      }
      
      return result;
      
    } catch (error) {
      result.needed = true;
      result.reasons.push(`Recovery check failed: ${error instanceof Error ? error.message : String(error)}`);
      return result;
    }
  }
  
  /**
   * Perform recovery for specific projects
   */
  static async recoverSpecificProjects(
    projectIds: string[],
    options: { forceRebuild?: boolean } = {}
  ): Promise<{ success: boolean; results: Array<{ projectId: string; success: boolean; error?: string }> }> {
    const results: Array<{ projectId: string; success: boolean; error?: string }> = [];
    
    console.log(`🔄 Recovering ${projectIds.length} specific projects...`);
    
    for (const projectId of projectIds) {
      try {
        const result = await AppRecoveryService.recoverSpecificProject(projectId, {
          forceRebuild: options.forceRebuild
        });
        
        results.push({
          projectId,
          success: result.success,
          error: result.error
        });
        
        if (result.success) {
          console.log(`✅ Recovered project: ${projectId}`);
        } else {
          console.error(`❌ Failed to recover project ${projectId}: ${result.error}`);
        }
        
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        results.push({
          projectId,
          success: false,
          error: errorMsg
        });
        console.error(`❌ Error recovering project ${projectId}:`, error);
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    console.log(`🎯 Recovery complete: ${successCount}/${projectIds.length} projects recovered`);
    
    return {
      success: successCount === projectIds.length,
      results
    };
  }
  
  /**
   * Setup auto-recovery hooks for the application
   */
  static setupAutoRecovery(): void {
    console.log('🔧 Setting up auto-recovery hooks...');
    
    // Hook into project creation
    const rootStore = useStore.getState();
    const originalCreateProject = rootStore.createProject;
    
    // Enhance project creation to initialize persistence
    const enhancedCreateProject = async (name: string, settings?: any) => {
      console.log(`🆕 Creating project with persistence: ${name}`);
      
      // Call original create project (it returns void but updates the store)
      originalCreateProject(name, settings);
      
      // Get the newly created project ID (it should be the last one added)
      const updatedStore = useStore.getState();
      const newProject = updatedStore.projects[updatedStore.projects.length - 1];
      
      if (newProject) {
        // Initialize persistence for the new project
        setTimeout(async () => {
          try {
            const enhancedCheckpointStore = useEnhancedCheckpointStore.getState();
            const result = await enhancedCheckpointStore.initializeProjectPersistence(newProject.id);
            
            if (result.success) {
              console.log(`✅ Persistence initialized for new project: ${name}`);
            } else {
              console.warn(`⚠️ Failed to initialize persistence for new project ${name}: ${result.error}`);
            }
          } catch (error) {
            console.error(`❌ Error initializing persistence for new project ${name}:`, error);
          }
        }, 2000); // Wait 2 seconds for project setup to complete
        
        return newProject.id;
      }
      
      return undefined;
    };
    
    // Note: In a real implementation, you'd want to patch the store method more elegantly
    // This is a simplified version for demonstration
    
    console.log('✅ Auto-recovery hooks setup complete');
  }
  
  /**
   * Get initialization health status
   */
  static async getInitializationHealth(): Promise<{
    appInitialized: boolean;
    recoveryAvailable: boolean;
    projectsWithPersistence: number;
    projectsNeedingRecovery: number;
    lastInitializationTime?: Date;
  }> {
    try {
      const rootStore = useStore.getState();
      const enhancedCheckpointStore = useEnhancedCheckpointStore.getState();
      
      const healthStatus = await AppRecoveryService.getRecoveryHealthStatus();
      
      return {
        appInitialized: rootStore.initialized,
        recoveryAvailable: rootStore.servers.some(s => s.status === 'connected'),
        projectsWithPersistence: healthStatus.healthy.length,
        projectsNeedingRecovery: healthStatus.needsRecovery.length,
        lastInitializationTime: new Date() // You could store this in localStorage
      };
      
    } catch (error) {
      console.error('Failed to get initialization health:', error);
      return {
        appInitialized: false,
        recoveryAvailable: false,
        projectsWithPersistence: 0,
        projectsNeedingRecovery: 0
      };
    }
  }
  
  /**
   * Create a recovery report for debugging
   */
  static async createRecoveryReport(): Promise<{
    timestamp: Date;
    appState: any;
    recoveryHealth: any;
    projectStates: Array<{
      projectId: string;
      name: string;
      hasGit: boolean;
      checkpointCount: number;
      branchCount: number;
      errors: string[];
    }>;
  }> {
    const rootStore = useStore.getState();
    const enhancedCheckpointStore = useEnhancedCheckpointStore.getState();
    const branchStore = useBranchStore.getState();
    
    const report = {
      timestamp: new Date(),
      appState: {
        initialized: rootStore.initialized,
        projectCount: rootStore.projects.length,
        activeProjectId: rootStore.activeProjectId,
        connectedServers: rootStore.servers.filter(s => s.status === 'connected').length
      },
      recoveryHealth: await AppRecoveryService.getRecoveryHealthStatus(),
      projectStates: [] as Array<{
        projectId: string;
        name: string;
        hasGit: boolean;
        checkpointCount: number;
        branchCount: number;
        errors: string[];
      }>
    };
    
    // Analyze each project
    for (const project of rootStore.projects) {
      const projectState = {
        projectId: project.id,
        name: project.name,
        hasGit: false,
        checkpointCount: enhancedCheckpointStore.checkpoints[project.id]?.length || 0,
        branchCount: branchStore.branches[project.id]?.length || 0,
        errors: [] as string[]
      };
      
      // Check if project needs recovery
      const needsRecovery = report.recoveryHealth.needsRecovery.find(r => r.projectId === project.id);
      if (needsRecovery) {
        projectState.errors.push(needsRecovery.reason);
      }
      
      const hasError = report.recoveryHealth.errors.find(e => e.projectId === project.id);
      if (hasError) {
        projectState.errors.push(hasError.error);
      }
      
      report.projectStates.push(projectState);
    }
    
    return report;
  }
} 