/**
 * Persistent Storage Service
 * 
 * Provides a simple interface for persistent storage operations,
 * wrapping the LocalPersistenceService for backward compatibility
 */

import { LocalPersistenceService, CheckpointMetadata } from './localPersistenceService';
import { getProjectPath } from './projectPathService';
import { Checkpoint } from '../types/Checkpoint';
import { useStore } from '../stores/rootStore';

/**
 * Simple persistent storage interface
 */
class PersistentStorageService {
  
  /**
   * Create a checkpoint in persistent storage
   */
  async createCheckpoint(checkpoint: Checkpoint): Promise<{ success: boolean; error?: string }> {
    try {
      // Get the root store to access projects and MCP servers
      const rootStore = useStore.getState();
      const project = rootStore.projects.find(p => p.id === checkpoint.projectId);
      
      if (!project) {
        return { success: false, error: `Project ${checkpoint.projectId} not found` };
      }
      
      const activeMcpServers = rootStore.servers.filter(server => 
        server.status === 'connected' && project.settings.mcpServerIds?.includes(server.id)
      );
      
      if (!activeMcpServers.length) {
        return { success: false, error: 'No active MCP servers available' };
      }
      
      const mcpServerId = activeMcpServers[0].id;
      
      // Resolve project path using shared config (no hardcoded base paths)
      const projectPath = getProjectPath(checkpoint.projectId, project.name);
      
      // Convert Checkpoint to CheckpointMetadata format
      const checkpointMetadata: CheckpointMetadata = {
        id: checkpoint.id,
        projectId: checkpoint.projectId,
        description: checkpoint.description,
        timestamp: checkpoint.timestamp,
        commitHash: checkpoint.commitHash || '',
        filesChanged: [], // Could extract from snapshotData if needed
        linesChanged: 0,  // Could calculate if needed
        type: checkpoint.tags?.includes('auto') ? 'auto' : 'manual',
        tags: checkpoint.tags || []
      };
      
      // Use LocalPersistenceService to save
      const result = await LocalPersistenceService.saveCheckpoint(
        projectPath,
        checkpointMetadata,
        mcpServerId,
        rootStore.executeTool
      );
      
      return result;
      
    } catch (error) {
      console.error('Failed to create checkpoint in persistent storage:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }
  
  /**
   * Get checkpoints for a project
   */
  async getCheckpoints(projectId: string): Promise<Checkpoint[]> {
    try {
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
      
      const mcpServerId = activeMcpServers[0].id;
      const projectPath = getProjectPath(projectId, project.name);
      
      // Get checkpoints from LocalPersistenceService
      const checkpointMetadata = await LocalPersistenceService.getCheckpoints(
        projectPath,
        mcpServerId,
        rootStore.executeTool
      );
      
      // Convert CheckpointMetadata to Checkpoint format
      return checkpointMetadata.map(meta => ({
        id: meta.id,
        projectId: meta.projectId,
        timestamp: meta.timestamp,
        description: meta.description,
        commitHash: meta.commitHash,
        tags: meta.tags,
        snapshotData: {
          project: project,
          files: [] // File snapshots would need to be reconstructed if needed
        }
      }));
      
    } catch (error) {
      console.error('Failed to get checkpoints from persistent storage:', error);
      return [];
    }
  }
  
  /**
   * Initialize persistent storage for a project
   */
  async initializeProject(projectId: string): Promise<{ success: boolean; error?: string }> {
    try {
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
      
      const mcpServerId = activeMcpServers[0].id;
      const projectPath = getProjectPath(projectId, project.name);
      
      // Initialize using LocalPersistenceService
      const result = await LocalPersistenceService.initializeProjectPersistence(
        projectPath,
        projectId,
        project.name,
        mcpServerId,
        rootStore.executeTool
      );
      
      return result;
      
    } catch (error) {
      console.error('Failed to initialize project in persistent storage:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }
  
  /**
   * Health check for persistent storage
   */
  async healthCheck(): Promise<{ status: 'healthy' | 'error'; issues: string[] }> {
    try {
      const rootStore = useStore.getState();
      const issues: string[] = [];
      
      if (!rootStore.initialized) {
        issues.push('Root store not initialized');
      }
      
      const connectedServers = rootStore.servers.filter(s => s.status === 'connected');
      if (connectedServers.length === 0) {
        issues.push('No connected MCP servers');
      }
      
      if (rootStore.projects.length === 0) {
        issues.push('No projects available');
      }
      
      return {
        status: issues.length === 0 ? 'healthy' : 'error',
        issues
      };
      
    } catch (error) {
      return {
        status: 'error',
        issues: [`Health check failed: ${error instanceof Error ? error.message : String(error)}`]
      };
    }
  }
}

// Export singleton instance
export const persistentStorage = new PersistentStorageService(); 