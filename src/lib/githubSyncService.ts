import { createSyncAPI } from './server/githubSync/github-sync-api.js';

class GitHubSyncService {
  private api: unknown = null;
  private isStarted = false;

  constructor() {
    // Don't auto-start - start manually when needed
    console.log('🔧 GitHub Sync Service initialized (not auto-started)');
  }

  private async init() {
    try {
      console.log('🚀 Initializing GitHub Sync Service...');
      
      // Create a mock MCP client for now (replace with real client when available)
      const mockMcpClient = {
        execute: async (command: string, args: Record<string, unknown>) => {
          console.log('🔧 Mock MCP Command:', command, args);
          
          // Simulate git commands for demo
          if (command.includes('git push')) {
            return {
              success: true,
              output: 'Everything up-to-date'
            };
          }
          
          if (command.includes('git status')) {
            return {
              success: true,
              output: 'On branch main\nnothing to commit, working tree clean'
            };
          }
          
          return {
            success: true,
            output: 'Mock command executed'
          };
        }
      };

      // Start the API server in the background
      try {
        this.api = await createSyncAPI(mockMcpClient, {
          port: 3001,
          host: 'localhost',
          corsOrigin: 'http://localhost:3000',
          schedulerOptions: {
            scanInterval: 300000, // 5 minutes
            maxConcurrentSyncs: 2,
            maxRetries: 3
          }
        });

        console.log('✅ GitHub Sync API started on port 3001');
        
        // Start the scheduler
        await this.startScheduler();
        
        this.isStarted = true;
        
      } catch (error) {
        console.warn('⚠️ GitHub Sync Service not available:', error);
        // Continue without background service
      }
    } catch (error) {
      console.error('❌ Failed to initialize GitHub Sync Service:', error);
    }
  }

  private async startScheduler() {
    try {
      const response = await fetch('http://localhost:3001/api/sync/start', {
        method: 'POST'
      });
      
      if (response.ok) {
        console.log('✅ GitHub Sync Scheduler started');
      } else {
        console.warn('⚠️ Failed to start GitHub Sync Scheduler');
      }
    } catch (error) {
      console.warn('⚠️ Could not start scheduler:', error);
    }
  }

  public async getStatus() {
    if (!this.isStarted) {
      return { running: false, error: 'Service not started' };
    }

    try {
      const response = await fetch('http://localhost:3001/api/sync/status');
      if (response.ok) {
        const status = await response.json();
        return { running: true, ...status };
      }
    } catch (error) {
      console.warn('Could not get sync status:', error);
    }
    
    return { running: false, error: 'Service not responding' };
  }

  public async triggerSync(projectId: string) {
    if (!this.isStarted) {
      console.log('⚠️ GitHub Sync Service not started, simulating sync');
      return { success: true, simulated: true };
    }

    try {
      const response = await fetch(`http://localhost:3001/api/sync/trigger/${projectId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ immediate: true }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log(`✅ Triggered sync for project ${projectId}`);
        return result;
      }
    } catch (error) {
      console.warn('Could not trigger sync:', error);
    }

    return { success: false, error: 'Failed to trigger sync' };
  }

  public async shutdown() {
    if (this.api) {
      try {
        await fetch('http://localhost:3001/api/sync/stop', { method: 'POST' });
        await this.api.stop();
        console.log('✅ GitHub Sync Service stopped');
      } catch (error) {
        console.warn('Error stopping GitHub Sync Service:', error);
      }
    }
  }
}

// Create singleton instance
export const githubSyncService = new GitHubSyncService();

// Auto-cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    githubSyncService.shutdown();
  });
} 