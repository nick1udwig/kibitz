#!/usr/bin/env node

/**
 * Demo: GitHub Background Sync Service
 * 
 * This demonstrates how to:
 * 1. Start the background sync scheduler
 * 2. Start the API server for frontend control
 * 3. Test various sync operations
 * 4. Monitor sync activities
 */

import { createSyncAPI } from './github-sync-api.js';
import { MockMcpClient } from './test-github-sync-system.js';

class SyncServiceDemo {
  constructor() {
    this.mcpClient = new MockMcpClient();
    this.api = null;
    this.isRunning = false;
  }

  async startDemo() {
    console.log('🚀 GitHub Sync Service Demo');
    console.log('='.repeat(50));

    try {
      // Start the API server (includes scheduler)
      console.log('\n1. Starting API Server...');
      this.api = await createSyncAPI(this.mcpClient, {
        port: 3001,
        host: 'localhost',
        corsOrigin: 'http://localhost:3000',
        schedulerOptions: {
          scanInterval: 60000, // 1 minute for demo
          maxConcurrentSyncs: 2,
          maxRetries: 2
        }
      });

      console.log('✅ API Server started on http://localhost:3001');
      this.isRunning = true;

      // Demo various operations
      await this.demoAPIOperations();
      await this.demoSchedulerOperations();
      await this.demoMonitoring();

    } catch (error) {
      console.error('❌ Demo failed:', error.message);
    }
  }

  async demoAPIOperations() {
    console.log('\n📡 Testing API Operations');
    console.log('-'.repeat(30));

    try {
      // Test health endpoint
      console.log('\n🔍 Health Check:');
      const healthResponse = await fetch('http://localhost:3001/health');
      const health = await healthResponse.json();
      console.log(`✅ API Health: ${health.success ? 'OK' : 'Failed'}`);

      // Start the sync service
      console.log('\n▶️  Starting Sync Service:');
      const startResponse = await fetch('http://localhost:3001/api/sync/start', {
        method: 'POST'
      });
      const startResult = await startResponse.json();
      console.log(`✅ Service Start: ${startResult.success ? 'Success' : 'Failed'}`);

      // Get initial status
      console.log('\n📊 Initial Status:');
      const statusResponse = await fetch('http://localhost:3001/api/sync/status');
      const status = await statusResponse.json();
      
      if (status.success) {
        const scheduler = status.status.scheduler;
        console.log(`   Running: ${scheduler?.isRunning ? 'Yes' : 'No'}`);
        console.log(`   Queue Size: ${scheduler?.stats?.queueSize || 0}`);
        console.log(`   Total Scans: ${scheduler?.stats?.totalScans || 0}`);
      }

      // Get projects
      console.log('\n📋 Available Projects:');
      const projectsResponse = await fetch('http://localhost:3001/api/sync/projects');
      const projects = await projectsResponse.json();
      
      if (projects.success) {
        console.log(`   Total Projects: ${projects.summary.total}`);
        console.log(`   GitHub Enabled: ${projects.summary.enabled}`);
        console.log(`   With Pending Changes: ${projects.summary.withPendingChanges}`);
        
        // Show first few projects
        projects.projects.slice(0, 3).forEach(project => {
          console.log(`   📦 ${project.projectId}: ${project.github?.enabled ? 'Enabled' : 'Disabled'}`);
        });
      }

    } catch (error) {
      console.error('API operation failed:', error.message);
    }
  }

  async demoSchedulerOperations() {
    console.log('\n⚙️  Testing Scheduler Operations');
    console.log('-'.repeat(30));

    try {
      // Trigger a manual sync scan
      console.log('\n🔄 Triggering Manual Sync Scan:');
      const triggerResponse = await fetch('http://localhost:3001/api/sync/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ immediate: true })
      });
      const triggerResult = await triggerResponse.json();
      console.log(`✅ Scan Triggered: ${triggerResult.success ? 'Success' : 'Failed'}`);
      
      if (triggerResult.success) {
        console.log(`   Queue Size: ${triggerResult.queueSize}`);
      }

      // Wait a moment for processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check queue status
      console.log('\n📥 Queue Status:');
      const queueResponse = await fetch('http://localhost:3001/api/sync/queue');
      const queue = await queueResponse.json();
      
      if (queue.success) {
        console.log(`   Queued Items: ${queue.stats.queueSize}`);
        console.log(`   Active Syncs: ${queue.stats.activeSyncs}`);
        
        if (queue.queue.length > 0) {
          console.log('   Next in Queue:');
          queue.queue.slice(0, 2).forEach(item => {
            const scheduledIn = Math.max(0, Math.round(item.scheduledIn / 1000));
            console.log(`     ${item.projectId} (priority: ${item.priority}, in ${scheduledIn}s)`);
          });
        }
      }

      // Trigger specific project sync (if projects exist)
      const projectsResponse = await fetch('http://localhost:3001/api/sync/projects');
      const projects = await projectsResponse.json();
      
      if (projects.success && projects.projects.length > 0) {
        const firstProject = projects.projects[0];
        console.log(`\n🎯 Triggering Sync for Specific Project: ${firstProject.projectId}`);
        
        const projectSyncResponse = await fetch(`http://localhost:3001/api/sync/trigger/${firstProject.projectId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ immediate: true, priority: 15 })
        });
        
        const projectSyncResult = await projectSyncResponse.json();
        console.log(`✅ Project Sync: ${projectSyncResult.success ? 'Scheduled' : 'Failed'}`);
      }

    } catch (error) {
      console.error('Scheduler operation failed:', error.message);
    }
  }

  async demoMonitoring() {
    console.log('\n📈 Testing Monitoring Features');
    console.log('-'.repeat(30));

    try {
      // Get configuration
      console.log('\n⚙️  Current Configuration:');
      const configResponse = await fetch('http://localhost:3001/api/sync/config');
      const config = await configResponse.json();
      
      if (config.success) {
        console.log(`   Scan Interval: ${config.config.scheduler.scanInterval / 1000}s`);
        console.log(`   Max Concurrent: ${config.config.scheduler.maxConcurrentSyncs}`);
        console.log(`   Max Retries: ${config.config.scheduler.maxRetries}`);
      }

      // Wait for some activity
      console.log('\n⏱️  Waiting for sync activity (30 seconds)...');
      await new Promise(resolve => setTimeout(resolve, 30000));

      // Get updated status
      console.log('\n📊 Updated Status:');
      const statusResponse = await fetch('http://localhost:3001/api/sync/status');
      const status = await statusResponse.json();
      
      if (status.success && status.status.scheduler) {
        const stats = status.status.scheduler.stats;
        console.log(`   Total Scans: ${stats.totalScans}`);
        console.log(`   Total Syncs: ${stats.totalSyncs}`);
        console.log(`   Successful: ${stats.successfulSyncs}`);
        console.log(`   Failed: ${stats.failedSyncs}`);
        console.log(`   Uptime: ${status.status.scheduler.uptimeFormatted}`);
      }

      // Get sync history
      console.log('\n📚 Recent Sync History:');
      const historyResponse = await fetch('http://localhost:3001/api/sync/history?limit=5');
      const history = await historyResponse.json();
      
      if (history.success && history.history.length > 0) {
        history.history.forEach(record => {
          const duration = record.duration_ms ? `${Math.round(record.duration_ms / 1000)}s` : 'N/A';
          const status = record.status === 'success' ? '✅' : '❌';
          console.log(`   ${status} ${record.project_id} (${duration}, ${record.branches_synced || 0} branches)`);
        });
      } else {
        console.log('   No sync history available yet');
      }

    } catch (error) {
      console.error('Monitoring operation failed:', error.message);
    }
  }

  async demonstrateConfigUpdate() {
    console.log('\n🔧 Testing Configuration Update');
    console.log('-'.repeat(30));

    try {
      // Update configuration
      const newConfig = {
        schedulerOptions: {
          scanInterval: 120000, // 2 minutes
          maxConcurrentSyncs: 3
        }
      };

      const updateResponse = await fetch('http://localhost:3001/api/sync/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig)
      });

      const updateResult = await updateResponse.json();
      console.log(`✅ Config Update: ${updateResult.success ? 'Success' : 'Failed'}`);
      
      if (updateResult.success) {
        console.log(`   New Scan Interval: ${updateResult.config.scheduler.scanInterval / 1000}s`);
        console.log(`   New Max Concurrent: ${updateResult.config.scheduler.maxConcurrentSyncs}`);
      }

    } catch (error) {
      console.error('Config update failed:', error.message);
    }
  }

  async demonstrateShutdown() {
    console.log('\n🛑 Demonstrating Graceful Shutdown');
    console.log('-'.repeat(30));

    try {
      // Stop the sync service
      console.log('\n⏹️  Stopping Sync Service:');
      const stopResponse = await fetch('http://localhost:3001/api/sync/stop', {
        method: 'POST'
      });
      const stopResult = await stopResponse.json();
      console.log(`✅ Service Stop: ${stopResult.success ? 'Success' : 'Failed'}`);

      // Verify it's stopped
      const statusResponse = await fetch('http://localhost:3001/api/sync/status');
      const status = await statusResponse.json();
      
      if (status.success) {
        console.log(`   Service Running: ${status.status.serviceRunning ? 'Yes' : 'No'}`);
      }

    } catch (error) {
      console.error('Shutdown operation failed:', error.message);
    }
  }

  async showFrontendIntegration() {
    console.log('\n🌐 Frontend Integration Examples');
    console.log('-'.repeat(30));

    console.log('\n📝 JavaScript fetch examples for your frontend:');
    
    console.log('\n// Start sync service');
    console.log('const startSync = async () => {');
    console.log('  const response = await fetch(\'http://localhost:3001/api/sync/start\', {');
    console.log('    method: \'POST\'');
    console.log('  });');
    console.log('  const result = await response.json();');
    console.log('  console.log(result);');
    console.log('};');

    console.log('\n// Get sync status');
    console.log('const getStatus = async () => {');
    console.log('  const response = await fetch(\'http://localhost:3001/api/sync/status\');');
    console.log('  const status = await response.json();');
    console.log('  return status.status.scheduler;');
    console.log('};');

    console.log('\n// Trigger sync for specific project');
    console.log('const triggerProjectSync = async (projectId) => {');
    console.log('  const response = await fetch(`http://localhost:3001/api/sync/trigger/${projectId}`, {');
    console.log('    method: \'POST\',');
    console.log('    headers: { \'Content-Type\': \'application/json\' },');
    console.log('    body: JSON.stringify({ immediate: true })');
    console.log('  });');
    console.log('  return await response.json();');
    console.log('};');

    console.log('\n// Get projects with sync status');
    console.log('const getProjects = async () => {');
    console.log('  const response = await fetch(\'http://localhost:3001/api/sync/projects\');');
    console.log('  const data = await response.json();');
    console.log('  return data.projects;');
    console.log('};');
  }

  async cleanup() {
    if (this.api) {
      console.log('\n🧹 Cleaning up...');
      
      // Stop scheduler if running
      if (this.api.scheduler && this.api.scheduler.isRunning) {
        await this.api.scheduler.stop();
      }
      
      // Stop API server
      await this.api.stop();
      
      console.log('✅ Cleanup completed');
    }
  }

  async runFullDemo() {
    try {
      await this.startDemo();
      await this.demonstrateConfigUpdate();
      
      // Show frontend integration examples
      await this.showFrontendIntegration();
      
      // Optional: demonstrate shutdown
      console.log('\n❓ Demonstrate shutdown? (Will stop the service)');
      console.log('   In production, you would keep this running continuously');
      
      // For demo purposes, we'll wait a bit then shutdown
      console.log('\n⏱️  Demo will shutdown in 10 seconds... (Ctrl+C to keep running)');
      
      const shutdownTimer = setTimeout(async () => {
        await this.demonstrateShutdown();
        await this.cleanup();
        process.exit(0);
      }, 10000);
      
      // Allow user to cancel shutdown
      process.on('SIGINT', async () => {
        clearTimeout(shutdownTimer);
        console.log('\n\n🔄 Demo interrupted - keeping service running');
        console.log('📋 Service is now running in background');
        console.log('🌐 API available at: http://localhost:3001');
        console.log('📚 API documentation: See github-sync-api.js');
        console.log('\nPress Ctrl+C again to shutdown completely');
        
        process.on('SIGINT', async () => {
          await this.cleanup();
          process.exit(0);
        });
      });

    } catch (error) {
      console.error('❌ Demo failed:', error.message);
      await this.cleanup();
      process.exit(1);
    }
  }
}

// Production integration example
async function productionIntegration() {
  console.log('\n🏭 Production Integration Example');
  console.log('='.repeat(50));

  console.log('\n// In your main application:');
  console.log('import { createSyncAPI } from \'./github-sync-api.js\';');
  console.log('');
  console.log('// Start the sync service');
  console.log('const syncAPI = await createSyncAPI(yourMcpClient, {');
  console.log('  port: 3001,');
  console.log('  schedulerOptions: {');
  console.log('    scanInterval: 300000, // 5 minutes');
  console.log('    maxConcurrentSyncs: 3,');
  console.log('    maxRetries: 3');
  console.log('  }');
  console.log('});');
  console.log('');
  console.log('// The service will now:');
  console.log('// 1. Scan for projects every 5 minutes');
  console.log('// 2. Queue projects with pending changes');
  console.log('// 3. Sync up to 3 projects concurrently');
  console.log('// 4. Retry failed syncs with exponential backoff');
  console.log('// 5. Provide REST API for frontend control');
  console.log('');
  console.log('// Start the sync scheduler automatically');
  console.log('await fetch(\'http://localhost:3001/api/sync/start\', { method: \'POST\' });');
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const demo = new SyncServiceDemo();
  
  if (process.argv.includes('--production-example')) {
    productionIntegration();
  } else {
    demo.runFullDemo();
  }
}

export { SyncServiceDemo }; 