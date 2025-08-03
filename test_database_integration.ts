/**
 * Test Database Integration
 * 
 * Simple test to verify the database integration works correctly
 */

import { initializeDatabaseIntegration } from './src/lib/existingDatabaseIntegration';
import { initializeOptimizedGitService } from './src/lib/optimizedGitService';
import { initializeCommandThrottling } from './src/lib/commandThrottlingService';

// Mock executeTool for testing
const mockExecuteTool = async (serverId: string, toolName: string, args: Record<string, unknown>): Promise<string> => {
  console.log(`Mock executeTool: ${toolName} with args:`, args);
  
  // Mock responses for different commands
  const command = (args.action_json as any)?.command || '';
  
  if (command.includes('git init')) {
    return 'Initialized empty Git repository';
  } else if (command.includes('git status')) {
    return '## main\n?? README.md\n?? src/\n';
  } else if (command.includes('git add')) {
    return '';
  } else if (command.includes('git commit')) {
    return '[main abc123] Initial commit\n 1 file changed, 1 insertion(+)\n';
  } else if (command.includes('git rev-parse HEAD')) {
    return 'abc123def456\n';
  } else if (command.includes('echo')) {
    return 'README created';
  } else if (command.includes('git checkout -b')) {
    return 'Switched to a new branch';
  } else {
    return 'Command executed successfully';
  }
};

async function testDatabaseIntegration() {
  console.log('🧪 Testing Database Integration...');
  
  try {
    // Initialize services
    console.log('1. Initializing services...');
    await initializeDatabaseIntegration();
    await initializeOptimizedGitService();
    await initializeCommandThrottling();
    
    console.log('✅ All services initialized successfully');
    
    // Test database operations
    console.log('2. Testing database operations...');
    const { useDatabaseIntegration } = await import('./src/lib/existingDatabaseIntegration');
    const dbService = useDatabaseIntegration();
    
    // Create test project
    const projectResult = await dbService.createProject('test-conversation-123', 'Test Project');
    console.log('Project creation result:', projectResult);
    
    if (projectResult.success) {
      // Test project metadata
      const metadata = await dbService.getProjectMetadata(projectResult.projectId);
      console.log('Project metadata:', metadata);
      
      // Test project statistics
      const stats = await dbService.getProjectStatistics(projectResult.projectId);
      console.log('Project statistics:', stats);
      
      // Test database statistics
      const dbStats = await dbService.getDatabaseStatistics();
      console.log('Database statistics:', dbStats);
      
      // Test health check
      const health = await dbService.healthCheck();
      console.log('Health check:', health);
    }
    
    // Test optimized Git service
    console.log('3. Testing optimized Git service...');
    const { getOptimizedGitService } = await import('./src/lib/optimizedGitService');
    const gitService = getOptimizedGitService();
    
    // Test project creation with Git tracking
    const gitResult = await gitService.createProjectWithTracking(
      'test-conversation-456',
      'Git Test Project',
      mockExecuteTool
    );
    console.log('Git project creation result:', gitResult);
    
    if (gitResult.success) {
      // Test Git status
      const status = await gitService.getGitStatus(gitResult.projectPath, mockExecuteTool);
      console.log('Git status:', status);
      
      // Test Git log
      const log = await gitService.getGitLog(gitResult.projectPath, mockExecuteTool);
      console.log('Git log:', log);
      
      // Test auto-commit
      const autoCommitResult = await gitService.executeOptimizedAutoCommit(
        gitResult.projectId,
        'test-conversation-456',
        gitResult.projectPath,
        mockExecuteTool
      );
      console.log('Auto-commit result:', autoCommitResult);
    }
    
    // Test command throttling
    console.log('4. Testing command throttling...');
    const { getCommandThrottlingService } = await import('./src/lib/commandThrottlingService');
    const throttlingService = getCommandThrottlingService();
    
    // Test throttled command execution
    const throttledResult = await throttlingService.executeThrottledCommand(
      '/test/path',
      'git status',
      mockExecuteTool,
      { priority: 'high' }
    );
    console.log('Throttled command result:', throttledResult);
    
    // Test statistics
    const throttleStats = throttlingService.getStatistics();
    console.log('Throttling statistics:', throttleStats);
    
    const queueStatus = throttlingService.getQueueStatus();
    console.log('Queue status:', queueStatus);
    
    console.log('🎉 All tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  }
}

// Run the test
if (require.main === module) {
  testDatabaseIntegration()
    .then(() => {
      console.log('✅ Database integration test completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Database integration test failed:', error);
      process.exit(1);
    });
}

export { testDatabaseIntegration }; 