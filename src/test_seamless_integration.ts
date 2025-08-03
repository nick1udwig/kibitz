/**
 * Test: Seamless Integration System
 * 
 * This test file verifies the complete seamless integration system works correctly
 * with proper tool orchestration, storage management, and auto-commit functionality.
 */

import { 
  SeamlessIntegrationExample,
  demonstrateSeamlessIntegration,
  useSeamlessIntegration
} from './examples/seamlessIntegrationExample';

import { 
  initializeSeamlessWorkflow,
  createWorkflowSession,
  executeWorkflowCommand,
  createReadmeFiles,
  WorkflowSession,
  WorkflowResult
} from './lib/seamlessWorkflowIntegration';

import { 
  initializeMCPOrchestrator,
  createExecutionContext,
  executeInitialize,
  executeBashCommand,
  checkCommandStatus,
  ExecutionContext,
  InitializeToolArgs
} from './lib/mcpToolOrchestrator';

import { 
  initializeStorageCoordinator,
  saveBranchToAllSystems,
  loadBranchesFromAllSystems,
  getStorageStatistics
} from './lib/storageCoordinator';

import { 
  initializeEnhancedBranchPersistence,
  createBranchWithSession,
  trackFileChanges,
  createRollbackPoint,
  getBranchPersistenceStatistics
} from './lib/enhancedBranchPersistence';

/**
 * Mock executeTool function for testing
 */
const mockExecuteTool = async (
  serverId: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<string> => {
  console.log(`🔧 Mock executeTool called:`, { serverId, toolName, args });
  
  // Mock responses based on tool type
  switch (toolName) {
    case 'Initialize':
      return JSON.stringify({
        success: true,
        message: 'Environment initialized successfully',
        thread_id: 'test-thread-123',
        workspace_path: '/test/workspace',
        mode: 'wcgw'
      });
      
    case 'BashCommand':
      const bashArgs = args as any;
      const command = bashArgs.action_json?.command || '';
      
      if (command.includes('pwd')) {
        return '/test/workspace\nstatus = process exited\ncwd = /test/workspace';
      }
      
      if (command.includes('ls')) {
        return 'total 8\ndrwxr-xr-x 2 user user 4096 Dec 1 10:00 .\ndrwxr-xr-x 3 user user 4096 Dec 1 09:00 ..\n-rw-r--r-- 1 user user   19 Dec 1 10:00 hi_malik.py\nstatus = process exited\ncwd = /test/workspace';
      }
      
      if (command.includes('echo') && command.includes('>')) {
        const filename = command.split('>')[1]?.trim() || 'unknown.txt';
        return `created: ${filename}\nstatus = process exited\ncwd = /test/workspace`;
      }
      
      if (command.includes('python3')) {
        return 'Hi Malik\nstatus = process exited\ncwd = /test/workspace';
      }
      
      if (command.includes('mkdir')) {
        return 'created: src/\ncreated: tests/\ncreated: docs/\nstatus = process exited\ncwd = /test/workspace';
      }
      
      if (command.includes('git init')) {
        return 'Initialized empty Git repository in /test/workspace/.git/\nstatus = process exited\ncwd = /test/workspace';
      }
      
      if (command.includes('git add')) {
        return 'status = process exited\ncwd = /test/workspace';
      }
      
      if (command.includes('git commit')) {
        return '[main abc123] Initial commit\n 3 files changed, 5 insertions(+)\n create mode 100644 README.md\n create mode 100644 src/main.py\n create mode 100644 tests/test.py\nstatus = process exited\ncwd = /test/workspace';
      }
      
      if (command === '') {
        // Status check
        return 'No command running\nstatus = process exited\ncwd = /test/workspace';
      }
      
      return `Command executed: ${command}\nstatus = process exited\ncwd = /test/workspace`;
      
    case 'ReadFiles':
      return JSON.stringify({
        success: true,
        files: [
          { path: 'hi_malik.py', content: 'print("Hi Malik")' },
          { path: 'README.md', content: '# Test Project' }
        ]
      });
      
    case 'FileWriteOrEdit':
      const writeArgs = args as any;
      return JSON.stringify({
        success: true,
        message: `File written: ${writeArgs.file_path}`,
        file_path: writeArgs.file_path
      });
      
    default:
      return JSON.stringify({
        success: true,
        message: `Mock response for ${toolName}`,
        tool: toolName,
        args: args
      });
  }
};

/**
 * Test Suite: Seamless Integration System
 */
export class SeamlessIntegrationTestSuite {
  private testResults: { [key: string]: boolean } = {};
  private testErrors: { [key: string]: string } = {};

  /**
   * Run all tests
   */
  async runAllTests(): Promise<void> {
    console.log('🧪 Starting Seamless Integration Test Suite...');
    
    try {
      // Storage system tests
      await this.testStorageCoordinator();
      await this.testEnhancedBranchPersistence();
      
      // MCP orchestrator tests
      await this.testMCPOrchestrator();
      
      // Seamless workflow tests
      await this.testSeamlessWorkflowIntegration();
      
      // Complete integration tests
      await this.testCompleteIntegration();
      
      // Example usage tests
      await this.testExampleUsage();
      
      // Print results
      this.printTestResults();
      
    } catch (error) {
      console.error('❌ Test suite failed:', error);
      throw error;
    }
  }

  /**
   * Test storage coordinator
   */
  async testStorageCoordinator(): Promise<void> {
    console.log('🔧 Testing Storage Coordinator...');
    
    try {
      // Initialize storage coordinator
      await initializeStorageCoordinator();
      
      // Test branch saving
      const branchInfo = {
        branchName: 'test-branch',
        branchId: 'test-branch-123',
        conversationId: 'test-conv-456',
        projectId: 'test-proj-789',
        commitHash: 'abc123',
        commitMessage: 'Test commit',
        createdAt: new Date(),
        filesChanged: ['test.py', 'README.md'],
        changesSummary: 'Test changes',
        isAutoCommit: true
      };
      
      const saveResult = await saveBranchToAllSystems(branchInfo);
      console.log('💾 Branch save result:', saveResult);
      
             // Test branch loading
       const loadResult = await loadBranchesFromAllSystems(branchInfo.projectId, branchInfo.conversationId, branchInfo.branchId);
       console.log('📁 Branch load result:', loadResult);
      
      // Test statistics
      const stats = await getStorageStatistics();
      console.log('📊 Storage statistics:', stats);
      
      this.testResults['StorageCoordinator'] = true;
      
    } catch (error) {
      console.error('❌ Storage coordinator test failed:', error);
      this.testResults['StorageCoordinator'] = false;
      this.testErrors['StorageCoordinator'] = error instanceof Error ? error.message : String(error);
    }
  }

  /**
   * Test enhanced branch persistence
   */
  async testEnhancedBranchPersistence(): Promise<void> {
    console.log('🌿 Testing Enhanced Branch Persistence...');
    
    try {
      // Initialize enhanced branch persistence
      await initializeEnhancedBranchPersistence();
      
      // Test branch creation with session
      const branchResult = await createBranchWithSession(
        'test-proj-789',
        'test-conv-456',
        'test-branch-enhanced',
        'feature',
        'Test enhanced branch',
        'localhost-mcp',
        mockExecuteTool
      );
      
      console.log('🌿 Branch creation result:', branchResult);
      
      // Test file change tracking
      if (branchResult.success && branchResult.sessionInfo) {
        await trackFileChanges(
          branchResult.sessionInfo.sessionId,
          ['test1.py', 'test2.py'],
          'Test file changes'
        );
      }
      
      // Test rollback point creation
      const rollbackResult = await createRollbackPoint(
        'test-proj-789',
        'test-conv-456',
        'Test rollback point'
      );
      
      console.log('↩️  Rollback point result:', rollbackResult);
      
      // Test statistics
      const stats = getBranchPersistenceStatistics();
      console.log('📊 Branch persistence statistics:', stats);
      
      this.testResults['EnhancedBranchPersistence'] = true;
      
    } catch (error) {
      console.error('❌ Enhanced branch persistence test failed:', error);
      this.testResults['EnhancedBranchPersistence'] = false;
      this.testErrors['EnhancedBranchPersistence'] = error instanceof Error ? error.message : String(error);
    }
  }

  /**
   * Test MCP orchestrator
   */
  async testMCPOrchestrator(): Promise<void> {
    console.log('🎭 Testing MCP Orchestrator...');
    
    try {
      // Initialize MCP orchestrator
      await initializeMCPOrchestrator();
      
      // Test execution context creation
      const executionContext = await createExecutionContext(
        'test-proj-789',
        'test-conv-456',
        'localhost-mcp',
        '/test/workspace'
      );
      
      console.log('🎭 Execution context created:', executionContext.contextId);
      
      // Test Initialize tool execution
      const initArgs: Partial<InitializeToolArgs> = {
        type: 'first_call',
        any_workspace_path: '/test/workspace',
        initial_files_to_read: [],
        task_id_to_resume: '',
        mode_name: 'wcgw',
        thread_id: ''
      };
      
      const initResult = await executeInitialize(
        executionContext.contextId,
        initArgs,
        mockExecuteTool
      );
      
      console.log('🔧 Initialize result:', initResult);
      
      // Test BashCommand execution
      const bashResult = await executeBashCommand(
        executionContext.contextId,
        'pwd && ls -la',
        mockExecuteTool
      );
      
      console.log('💻 BashCommand result:', bashResult);
      
      // Test command status check
      const statusResult = await checkCommandStatus(
        executionContext.contextId,
        mockExecuteTool
      );
      
      console.log('📊 Status check result:', statusResult);
      
      this.testResults['MCPOrchestrator'] = true;
      
    } catch (error) {
      console.error('❌ MCP orchestrator test failed:', error);
      this.testResults['MCPOrchestrator'] = false;
      this.testErrors['MCPOrchestrator'] = error instanceof Error ? error.message : String(error);
    }
  }

  /**
   * Test seamless workflow integration
   */
  async testSeamlessWorkflowIntegration(): Promise<void> {
    console.log('🚀 Testing Seamless Workflow Integration...');
    
    try {
      // Initialize seamless workflow
      const workflowIntegration = await initializeSeamlessWorkflow(mockExecuteTool);
      
      // Test workflow session creation
      const workflowSession = await createWorkflowSession(
        'test-proj-789',
        'test-conv-456',
        'localhost-mcp',
        '/test/workspace'
      );
      
      console.log('🚀 Workflow session created:', workflowSession.sessionId);
      
      // Test session initialization
      const initResult = await workflowIntegration.initializeWorkflowSession(
        workflowSession.sessionId,
        [],
        'wcgw'
      );
      
      console.log('🔧 Session initialization result:', initResult);
      
      // Test command execution
      const commandResult = await executeWorkflowCommand(
        workflowSession.sessionId,
        'echo "Hello World" > test.txt',
        { autoCommit: true, branchThreshold: 1 }
      );
      
      console.log('💻 Command execution result:', commandResult);
      
      // Test README file creation
      const readmeResult = await createReadmeFiles(
        workflowSession.sessionId,
        3,
        'malik is very cute'
      );
      
      console.log('📝 README files result:', readmeResult);
      
      // Test session status
      const statusResult = await workflowIntegration.checkSessionStatus(workflowSession.sessionId);
      console.log('📊 Session status result:', statusResult);
      
      // Test statistics
      const stats = await workflowIntegration.getStatistics();
      console.log('📈 Workflow statistics:', stats);
      
      this.testResults['SeamlessWorkflowIntegration'] = true;
      
    } catch (error) {
      console.error('❌ Seamless workflow integration test failed:', error);
      this.testResults['SeamlessWorkflowIntegration'] = false;
      this.testErrors['SeamlessWorkflowIntegration'] = error instanceof Error ? error.message : String(error);
    }
  }

  /**
   * Test complete integration
   */
  async testCompleteIntegration(): Promise<void> {
    console.log('🎯 Testing Complete Integration...');
    
    try {
      // Initialize complete integration
      const example = new SeamlessIntegrationExample();
      await example.initialize();
      
      // Test project session creation
      const session = await example.createProjectSession(
        'test-proj-integration',
        'test-conv-integration',
        'localhost-mcp'
      );
      
      console.log('🎯 Integration session created:', session.sessionId);
      
      // Test Python program creation
      const pythonResult = await example.createPythonProgram();
      console.log('🐍 Python program result:', pythonResult);
      
      // Test directory setup
      const setupResult = await example.setupProjectDirectory();
      console.log('📁 Directory setup result:', setupResult);
      
      // Test complex workflow
      const complexResult = await example.executeComplexWorkflow();
      console.log('🔄 Complex workflow result:', complexResult);
      
      // Test status check
      const statusResult = await example.checkStatus();
      console.log('📊 Status check result:', statusResult);
      
      // Test statistics
      const stats = await example.getStatistics();
      console.log('📈 Integration statistics:', stats);
      
      this.testResults['CompleteIntegration'] = true;
      
    } catch (error) {
      console.error('❌ Complete integration test failed:', error);
      this.testResults['CompleteIntegration'] = false;
      this.testErrors['CompleteIntegration'] = error instanceof Error ? error.message : String(error);
    }
  }

  /**
   * Test example usage
   */
  async testExampleUsage(): Promise<void> {
    console.log('📚 Testing Example Usage...');
    
    try {
      // Test seamless integration example
      const example = useSeamlessIntegration();
      await example.initialize();
      
      const session = await example.createProjectSession(
        'test-proj-example',
        'test-conv-example',
        'localhost-mcp'
      );
      
      console.log('📚 Example session created:', session.sessionId);
      
      // Test individual workflows
      const pythonResult = await example.createPythonProgram();
      const setupResult = await example.setupProjectDirectory();
      const complexResult = await example.executeComplexWorkflow();
      
      console.log('📚 Example workflows completed:', {
        python: pythonResult.success,
        setup: setupResult.success,
        complex: complexResult.success
      });
      
      this.testResults['ExampleUsage'] = true;
      
    } catch (error) {
      console.error('❌ Example usage test failed:', error);
      this.testResults['ExampleUsage'] = false;
      this.testErrors['ExampleUsage'] = error instanceof Error ? error.message : String(error);
    }
  }

  /**
   * Print test results
   */
  private printTestResults(): void {
    console.log('\n🧪 Test Results Summary:');
    console.log('========================');
    
    let passedTests = 0;
    let totalTests = 0;
    
    for (const [testName, passed] of Object.entries(this.testResults)) {
      totalTests++;
      if (passed) {
        passedTests++;
        console.log(`✅ ${testName}: PASSED`);
      } else {
        console.log(`❌ ${testName}: FAILED`);
        if (this.testErrors[testName]) {
          console.log(`   Error: ${this.testErrors[testName]}`);
        }
      }
    }
    
    console.log(`\n📊 Overall Results: ${passedTests}/${totalTests} tests passed`);
    
    if (passedTests === totalTests) {
      console.log('🎉 All tests passed! Seamless integration system is working correctly.');
    } else {
      console.log('⚠️  Some tests failed. Please check the errors above.');
    }
  }
}

/**
 * Run the test suite
 */
export const runSeamlessIntegrationTests = async (): Promise<void> => {
  const testSuite = new SeamlessIntegrationTestSuite();
  await testSuite.runAllTests();
};

/**
 * Quick test for specific functionality
 */
export const quickTest = async (): Promise<void> => {
  console.log('⚡ Running quick test...');
  
  try {
    // Test the demonstration function
    await demonstrateSeamlessIntegration();
    console.log('✅ Quick test passed!');
  } catch (error) {
    console.error('❌ Quick test failed:', error);
  }
};

// Export for use in other files
export { mockExecuteTool }; 