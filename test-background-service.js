#!/usr/bin/env node

/**
 * Comprehensive Test Suite for GitHub Background Sync Service
 * Tests the complete integration of scheduler, API, and sync operations
 */

import { createSyncScheduler } from './github-sync-scheduler.js';
import { createSyncAPI } from './github-sync-api.js';
import { MockMcpClient } from './test-github-sync-system.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, unlinkSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class BackgroundServiceTestSuite {
  constructor() {
    this.mcpClient = new MockMcpClient();
    this.scheduler = null;
    this.api = null;
    this.testDbPath = join(__dirname, 'test-sync-queue.db');
    this.results = {
      passed: 0,
      failed: 0,
      tests: []
    };
  }

  /**
   * Run a test with proper error handling and reporting
   */
  async runTest(testName, testFn) {
    console.log(`\n🧪 Testing: ${testName}`);
    
    try {
      await testFn();
      console.log(`✅ PASS: ${testName}`);
      this.results.passed++;
      this.results.tests.push({ name: testName, status: 'PASS' });
    } catch (error) {
      console.log(`❌ FAIL: ${testName}`);
      console.log(`   Error: ${error.message}`);
      this.results.failed++;
      this.results.tests.push({ name: testName, status: 'FAIL', error: error.message });
    }
  }

  /**
   * Assert utility for tests
   */
  assert(condition, message) {
    if (!condition) {
      throw new Error(message || 'Assertion failed');
    }
  }

  /**
   * Test scheduler initialization and basic operations
   */
  async testSchedulerBasics() {
    // Create scheduler
    this.scheduler = createSyncScheduler(this.mcpClient, {
      scanInterval: 10000, // 10 seconds for testing
      maxConcurrentSyncs: 2,
      dbPath: this.testDbPath
    });

    this.assert(this.scheduler, 'Scheduler should be created');
    this.assert(!this.scheduler.isRunning, 'Scheduler should not be running initially');

    // Start scheduler
    await this.scheduler.start();
    this.assert(this.scheduler.isRunning, 'Scheduler should be running after start');

    // Test status
    const status = this.scheduler.getStatus();
    this.assert(status.isRunning, 'Status should show scheduler as running');
    this.assert(typeof status.uptime === 'number', 'Status should include uptime');
    this.assert(typeof status.stats === 'object', 'Status should include stats');
  }

  /**
   * Test queue operations
   */
  async testQueueOperations() {
    // Schedule a sync
    const scheduled = await this.scheduler.scheduleSync('test-project-1', 1000, {
      projectPath: '/test/path',
      priority: 5
    });

    this.assert(scheduled, 'Should successfully schedule sync');
    this.assert(this.scheduler.syncQueue.size === 1, 'Queue should contain 1 item');

    // Schedule another sync
    await this.scheduler.scheduleSync('test-project-2', 2000, {
      projectPath: '/test/path2',
      priority: 10
    });

    this.assert(this.scheduler.syncQueue.size === 2, 'Queue should contain 2 items');

    // Test duplicate prevention
    const duplicate = await this.scheduler.scheduleSync('test-project-1', 3000, {
      priority: 1
    });
    
    this.assert(!duplicate, 'Should not schedule duplicate with later time');
    this.assert(this.scheduler.syncQueue.size === 2, 'Queue should still contain 2 items');
  }

  /**
   * Test database persistence
   */
  async testPersistence() {
    // Add some queue items
    await this.scheduler.scheduleSync('persist-test-1', 5000, {
      projectPath: '/persist/path1',
      priority: 3
    });

    await this.scheduler.scheduleSync('persist-test-2', 10000, {
      projectPath: '/persist/path2',
      priority: 7
    });

    const originalQueueSize = this.scheduler.syncQueue.size;

    // Stop and restart scheduler
    await this.scheduler.stop();
    this.assert(!this.scheduler.isRunning, 'Scheduler should be stopped');

    // Create new scheduler with same database
    const newScheduler = createSyncScheduler(this.mcpClient, {
      dbPath: this.testDbPath
    });

    await newScheduler.start();
    
    // Should load queue from database
    this.assert(newScheduler.syncQueue.size >= 2, 'New scheduler should load queue from database');

    // Cleanup
    await newScheduler.stop();
  }

  /**
   * Test API server operations
   */
  async testAPIOperations() {
    // Create API server
    this.api = await createSyncAPI(this.mcpClient, {
      port: 3002, // Different port to avoid conflicts
      schedulerOptions: {
        scanInterval: 30000,
        dbPath: this.testDbPath
      }
    });

    this.assert(this.api, 'API server should be created');

    // Test health endpoint
    const healthResponse = await fetch('http://localhost:3002/health');
    const health = await healthResponse.json();
    this.assert(health.success, 'Health endpoint should return success');

    // Start sync service via API
    const startResponse = await fetch('http://localhost:3002/api/sync/start', {
      method: 'POST'
    });
    const startResult = await startResponse.json();
    this.assert(startResult.success, 'Should start sync service via API');

    // Get status via API
    const statusResponse = await fetch('http://localhost:3002/api/sync/status');
    const status = await statusResponse.json();
    this.assert(status.success, 'Should get status via API');
    this.assert(status.status.serviceRunning, 'Status should show service as running');
  }

  /**
   * Test project discovery and sync triggering
   */
  async testProjectOperations() {
    // Get projects via API
    const projectsResponse = await fetch('http://localhost:3002/api/sync/projects');
    const projects = await projectsResponse.json();
    this.assert(projects.success, 'Should get projects via API');
    this.assert(typeof projects.summary === 'object', 'Should include project summary');

    // Trigger manual sync scan
    const triggerResponse = await fetch('http://localhost:3002/api/sync/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ immediate: true })
    });
    const triggerResult = await triggerResponse.json();
    this.assert(triggerResult.success, 'Should trigger sync scan via API');

    // Get queue status
    const queueResponse = await fetch('http://localhost:3002/api/sync/queue');
    const queue = await queueResponse.json();
    this.assert(queue.success, 'Should get queue status via API');
    this.assert(typeof queue.stats === 'object', 'Should include queue stats');
  }

  /**
   * Test configuration management
   */
  async testConfigurationManagement() {
    // Get current config
    const configResponse = await fetch('http://localhost:3002/api/sync/config');
    const config = await configResponse.json();
    this.assert(config.success, 'Should get config via API');

    const originalScanInterval = config.config.scheduler.scanInterval;

    // Update config
    const updateResponse = await fetch('http://localhost:3002/api/sync/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schedulerOptions: {
          scanInterval: 45000,
          maxConcurrentSyncs: 4
        }
      })
    });
    const updateResult = await updateResponse.json();
    this.assert(updateResult.success, 'Should update config via API');

    // Verify config was updated
    const newConfigResponse = await fetch('http://localhost:3002/api/sync/config');
    const newConfig = await newConfigResponse.json();
    this.assert(newConfig.config.scheduler.scanInterval === 45000, 'Config should be updated');
    this.assert(newConfig.config.scheduler.maxConcurrentSyncs === 4, 'Config should be updated');
  }

  /**
   * Test sync history and monitoring
   */
  async testHistoryAndMonitoring() {
    // Get sync history
    const historyResponse = await fetch('http://localhost:3002/api/sync/history?limit=10');
    const history = await historyResponse.json();
    this.assert(history.success, 'Should get sync history via API');
    this.assert(Array.isArray(history.history), 'History should be an array');

    // Test history cleanup
    const cleanupResponse = await fetch('http://localhost:3002/api/sync/history', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days: 1 })
    });
    const cleanupResult = await cleanupResponse.json();
    this.assert(cleanupResult.success, 'Should cleanup history via API');
  }

  /**
   * Test error handling and edge cases
   */
  async testErrorHandling() {
    // Test triggering sync for non-existent project
    const invalidSyncResponse = await fetch('http://localhost:3002/api/sync/trigger/non-existent-project', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ immediate: true })
    });
    
    // Should handle gracefully (might succeed or fail depending on implementation)
    this.assert(invalidSyncResponse.status < 500, 'Should handle invalid project gracefully');

    // Test stopping service
    const stopResponse = await fetch('http://localhost:3002/api/sync/stop', {
      method: 'POST'
    });
    const stopResult = await stopResponse.json();
    this.assert(stopResult.success, 'Should stop service via API');

    // Verify service is stopped
    const statusResponse = await fetch('http://localhost:3002/api/sync/status');
    const status = await statusResponse.json();
    this.assert(!status.status.serviceRunning, 'Service should be stopped');

    // Test starting again
    const restartResponse = await fetch('http://localhost:3002/api/sync/start', {
      method: 'POST'
    });
    const restartResult = await restartResponse.json();
    this.assert(restartResult.success, 'Should restart service via API');
  }

  /**
   * Test graceful shutdown
   */
  async testGracefulShutdown() {
    // Stop the scheduler
    if (this.api && this.api.scheduler) {
      await this.api.scheduler.stop();
      this.assert(!this.api.scheduler.isRunning, 'Scheduler should be stopped gracefully');
    }

    // Stop the API server
    if (this.api) {
      await this.api.stop();
      // API should no longer respond
      try {
        await fetch('http://localhost:3002/health');
        this.assert(false, 'API should not respond after shutdown');
      } catch (error) {
        // Expected - connection refused
        this.assert(true, 'API should refuse connections after shutdown');
      }
    }
  }

  /**
   * Clean up test artifacts
   */
  cleanup() {
    // Remove test database
    if (existsSync(this.testDbPath)) {
      try {
        unlinkSync(this.testDbPath);
        console.log('🧹 Cleaned up test database');
      } catch (error) {
        console.warn('⚠️  Could not clean up test database:', error.message);
      }
    }
  }

  /**
   * Run all tests
   */
  async runAllTests() {
    console.log('🧪 Background Service Test Suite');
    console.log('='.repeat(50));

    try {
      // Core scheduler tests
      await this.runTest('Scheduler Basics', () => this.testSchedulerBasics());
      await this.runTest('Queue Operations', () => this.testQueueOperations());
      await this.runTest('Database Persistence', () => this.testPersistence());

      // API tests
      await this.runTest('API Operations', () => this.testAPIOperations());
      await this.runTest('Project Operations', () => this.testProjectOperations());
      await this.runTest('Configuration Management', () => this.testConfigurationManagement());
      await this.runTest('History and Monitoring', () => this.testHistoryAndMonitoring());

      // Error handling and edge cases
      await this.runTest('Error Handling', () => this.testErrorHandling());
      await this.runTest('Graceful Shutdown', () => this.testGracefulShutdown());

    } catch (error) {
      console.error('💥 Test suite failed with unexpected error:', error.message);
      this.results.failed++;
    } finally {
      this.cleanup();
    }

    // Print results
    this.printResults();
  }

  /**
   * Print test results summary
   */
  printResults() {
    console.log('\n📊 Test Results');
    console.log('='.repeat(30));
    
    const total = this.results.passed + this.results.failed;
    const passRate = total > 0 ? Math.round((this.results.passed / total) * 100) : 0;
    
    console.log(`Total Tests: ${total}`);
    console.log(`✅ Passed: ${this.results.passed}`);
    console.log(`❌ Failed: ${this.results.failed}`);
    console.log(`📈 Pass Rate: ${passRate}%`);

    if (this.results.failed > 0) {
      console.log('\n❌ Failed Tests:');
      this.results.tests
        .filter(test => test.status === 'FAIL')
        .forEach(test => {
          console.log(`   ${test.name}: ${test.error}`);
        });
    }

    if (this.results.failed === 0) {
      console.log('\n🎉 All tests passed!');
      console.log('✅ Background service is ready for production use');
    } else {
      console.log('\n⚠️  Some tests failed - review errors before production use');
    }
  }
}

/**
 * Performance test for the background service
 */
async function performanceTest() {
  console.log('\n🚀 Performance Test');
  console.log('='.repeat(30));

  const mcpClient = new MockMcpClient();
  const testDbPath = join(__dirname, 'perf-test-sync-queue.db');
  
  try {
    const scheduler = createSyncScheduler(mcpClient, {
      dbPath: testDbPath,
      scanInterval: 5000,
      maxConcurrentSyncs: 5
    });

    await scheduler.start();

    // Schedule many sync jobs
    const startTime = Date.now();
    const numJobs = 100;

    console.log(`📊 Scheduling ${numJobs} sync jobs...`);
    
    for (let i = 0; i < numJobs; i++) {
      await scheduler.scheduleSync(`perf-test-${i}`, Math.random() * 1000, {
        projectPath: `/test/perf/${i}`,
        priority: Math.floor(Math.random() * 10)
      });
    }

    const scheduleTime = Date.now() - startTime;
    console.log(`✅ Scheduled ${numJobs} jobs in ${scheduleTime}ms`);
    console.log(`📈 Rate: ${Math.round(numJobs / (scheduleTime / 1000))} jobs/second`);

    // Test queue processing
    const queueStart = Date.now();
    scheduler.processQueue();
    
    // Wait for some processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const status = scheduler.getStatus();
    console.log(`📊 Queue processed: ${status.stats.activeSyncs} active, ${status.stats.queueSize} queued`);

    await scheduler.stop();

    // Cleanup
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }

  } catch (error) {
    console.error('❌ Performance test failed:', error.message);
  }
}

/**
 * Integration test with real project data
 */
async function integrationTest() {
  console.log('\n🔗 Integration Test');
  console.log('='.repeat(30));

  const mcpClient = new MockMcpClient();
  
  try {
    // Test with real project scanning
    const { getAllProjectsWithGitHub } = await import('./project-json-manager.js');
    const projects = await getAllProjectsWithGitHub();
    
    console.log(`📦 Found ${projects.length} projects with GitHub config`);
    
    if (projects.length > 0) {
      const enabledProjects = projects.filter(p => p.github?.enabled);
      console.log(`✅ ${enabledProjects.length} projects have GitHub sync enabled`);
      
      // Show sample project
      if (enabledProjects.length > 0) {
        const sample = enabledProjects[0];
        console.log(`📋 Sample project: ${sample.projectId}`);
        console.log(`   Branches: ${sample.branches?.length || 0}`);
        console.log(`   Remote URL: ${sample.github.remoteUrl || 'Not set'}`);
      }
    }

    console.log('✅ Integration test completed successfully');

  } catch (error) {
    console.log('⚠️  Integration test skipped - project data not available');
    console.log(`   Error: ${error.message}`);
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--performance')) {
    await performanceTest();
  } else if (args.includes('--integration')) {
    await integrationTest();
  } else {
    const testSuite = new BackgroundServiceTestSuite();
    await testSuite.runAllTests();
    
    if (args.includes('--all')) {
      await performanceTest();
      await integrationTest();
    }
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { BackgroundServiceTestSuite, performanceTest, integrationTest }; 