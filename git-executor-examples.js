import { GitExecutor, createGitExecutor } from './git-executor.js';

/**
 * Example usage of the GitExecutor class
 * This demonstrates how to use the class with an MCP client
 */

// Mock MCP client for demonstration purposes
// In real usage, this would be your actual MCP client instance
class MockMcpClient {
  async callTool(toolName, params) {
    console.log(`[MOCK MCP] Calling tool: ${toolName}`, params);
    
    // Simulate successful command execution
    // In real usage, this would make actual MCP calls
    return {
      stdout: 'Command executed successfully',
      stderr: '',
      exitCode: 0
    };
  }
}

async function basicUsageExamples() {
  console.log('=== GitExecutor Basic Usage Examples ===\n');
  
  // Create GitExecutor instance
  const mcpClient = new MockMcpClient();
  const gitExecutor = createGitExecutor(mcpClient);
  
  const projectPath = '/Users/test/gitrepo/projects/kvsird_new-project';

  try {
    // Example 1: Execute basic git command
    console.log('1. Basic Git Command Execution:');
    const statusResult = await gitExecutor.executeGitCommand('status', [], {
      cwd: projectPath
    });
    console.log('Git status result:', statusResult.success);

    // Example 2: Push a branch
    console.log('\n2. Push Branch:');
    const pushResult = await gitExecutor.pushBranch(projectPath, 'main', {
      setUpstream: true
    });
    console.log('Push result:', pushResult);

    // Example 3: Check remote status
    console.log('\n3. Check Remote Status:');
    const remoteStatus = await gitExecutor.getRemoteStatus(projectPath, 'main');
    console.log('Remote status:', remoteStatus);

    // Example 4: Push multiple branches
    console.log('\n4. Push Multiple Branches:');
    const batchResult = await gitExecutor.pushAllBranches(projectPath, ['main', 'auto/feature-1'], {
      setUpstream: true
    });
    console.log('Batch push result:', batchResult);

  } catch (error) {
    console.error('Basic examples failed:', error.message);
  }
}

async function repositoryCreationExamples() {
  console.log('\n=== Repository Creation Examples ===\n');
  
  const mcpClient = new MockMcpClient();
  const gitExecutor = createGitExecutor(mcpClient);
  const projectPath = '/Users/test/gitrepo/projects/kvsird_new-project';

  try {
    // Example 1: Create private repository
    console.log('1. Create Private Repository:');
    const createResult = await gitExecutor.createRemoteRepo(projectPath, 'my-new-repo', {
      private: true,
      description: 'A new project repository',
      addOrigin: true
    });
    console.log('Repository creation result:', createResult);

    // Example 2: Setup initial push
    console.log('\n2. Setup Initial Push:');
    const initialPush = await gitExecutor.setupInitialPush(projectPath, 'main');
    console.log('Initial push result:', initialPush);

    // Example 3: Create public repository
    console.log('\n3. Create Public Repository:');
    const publicRepo = await gitExecutor.createRemoteRepo(projectPath, 'public-project', {
      private: false,
      description: 'Open source project',
      addOrigin: false
    });
    console.log('Public repository result:', publicRepo);

  } catch (error) {
    console.error('Repository creation examples failed:', error.message);
  }
}

async function advancedGitOperations() {
  console.log('\n=== Advanced Git Operations ===\n');
  
  const mcpClient = new MockMcpClient();
  const gitExecutor = createGitExecutor(mcpClient);
  const projectPath = '/Users/test/gitrepo/projects/kvsird_new-project';

  try {
    // Example 1: Force push with lease
    console.log('1. Force Push with Lease:');
    const forceResult = await gitExecutor.pushBranch(projectPath, 'feature-branch', {
      force: true,
      setUpstream: true
    });
    console.log('Force push result:', forceResult);

    // Example 2: Execute custom git command
    console.log('\n2. Custom Git Command:');
    const logResult = await gitExecutor.executeGitCommand('log', ['--oneline', '-5'], {
      cwd: projectPath
    });
    console.log('Git log result:', logResult);

    // Example 3: Execute GitHub CLI command
    console.log('\n3. GitHub CLI Command:');
    const prList = await gitExecutor.executeGhCommand(['pr', 'list'], {
      cwd: projectPath
    });
    console.log('PR list result:', prList);

    // Example 4: Check tool availability
    console.log('\n4. Tool Validation:');
    const validation = await gitExecutor.validateTools();
    console.log('Tool validation:', validation);

  } catch (error) {
    console.error('Advanced operations failed:', error.message);
  }
}

async function errorHandlingExamples() {
  console.log('\n=== Error Handling Examples ===\n');
  
  const mcpClient = new MockMcpClient();
  const gitExecutor = createGitExecutor(mcpClient);
  const projectPath = '/nonexistent/path';

  try {
    // Example 1: Graceful error handling
    console.log('1. Graceful Error Handling:');
    const result = await gitExecutor.executeGitCommand('status', [], {
      cwd: projectPath,
      ignoreErrors: true
    });
    console.log('Error handled gracefully:', !result.success);

    // Example 2: Push non-existent branch
    console.log('\n2. Push Non-existent Branch:');
    const pushResult = await gitExecutor.pushBranch(projectPath, 'nonexistent-branch');
    console.log('Push failed as expected:', !pushResult.success);

    // Example 3: Remote status for invalid repo
    console.log('\n3. Remote Status Invalid Repo:');
    const statusResult = await gitExecutor.getRemoteStatus(projectPath, 'main');
    console.log('Remote status error handled:', statusResult.error !== undefined);

  } catch (error) {
    console.log('Expected error caught:', error.message);
  }
}

async function syncWorkflowExample() {
  console.log('\n=== Complete Sync Workflow Example ===\n');
  
  const mcpClient = new MockMcpClient();
  const gitExecutor = createGitExecutor(mcpClient);
  const projectPath = '/Users/test/gitrepo/projects/kvsird_new-project';

  try {
    // Step 1: Validate tools
    console.log('Step 1: Validate Required Tools');
    const validation = await gitExecutor.validateTools();
    if (!validation.allAvailable) {
      throw new Error('Required tools not available');
    }
    console.log('✓ Tools validated');

    // Step 2: Check remote status
    console.log('\nStep 2: Check Remote Status');
    const branches = ['main', 'auto/feature-1', 'auto/feature-2'];
    const remoteStatuses = [];
    
    for (const branch of branches) {
      const status = await gitExecutor.getRemoteStatus(projectPath, branch);
      remoteStatuses.push(status);
      console.log(`Branch ${branch}: needsPush=${status.needsPush}, ahead=${status.ahead}`);
    }

    // Step 3: Push branches that need syncing
    console.log('\nStep 3: Push Branches Needing Sync');
    const branchesToPush = remoteStatuses
      .filter(status => status.needsPush)
      .map(status => status.branchName);

    if (branchesToPush.length > 0) {
      const pushResults = await gitExecutor.pushAllBranches(projectPath, branchesToPush);
      console.log(`✓ Pushed ${pushResults.successfulPushes}/${pushResults.totalBranches} branches`);
    } else {
      console.log('✓ All branches up to date');
    }

    // Step 4: Create repository if needed
    console.log('\nStep 4: Create Repository if Needed');
    const mainStatus = remoteStatuses.find(s => s.branchName === 'main');
    if (!mainStatus?.exists) {
      const repoResult = await gitExecutor.createRemoteRepo(projectPath, 'auto-created-repo', {
        private: true,
        description: 'Automatically created repository'
      });
      
      if (repoResult.success) {
        await gitExecutor.setupInitialPush(projectPath, 'main');
        console.log('✓ Repository created and initialized');
      }
    }

    console.log('\n🎉 Sync workflow completed successfully!');

  } catch (error) {
    console.error('Sync workflow failed:', error.message);
  }
}

async function performanceExample() {
  console.log('\n=== Performance Considerations ===\n');
  
  const mcpClient = new MockMcpClient();
  const gitExecutor = createGitExecutor(mcpClient);
  const projectPath = '/Users/test/gitrepo/projects/kvsird_new-project';

  try {
    // Example 1: Timeout handling
    console.log('1. Timeout Handling:');
    const timeoutResult = await gitExecutor.executeGitCommand('log', ['--all'], {
      cwd: projectPath,
      timeout: 5000, // 5 second timeout
      ignoreErrors: true
    });
    console.log('Timeout handled:', timeoutResult.success);

    // Example 2: Parallel operations (where safe)
    console.log('\n2. Parallel Remote Status Checks:');
    const branches = ['main', 'develop', 'feature-1'];
    const statusPromises = branches.map(branch => 
      gitExecutor.getRemoteStatus(projectPath, branch)
    );
    
    const statuses = await Promise.all(statusPromises);
    statuses.forEach(status => {
      console.log(`${status.branchName}: ${status.exists ? 'exists' : 'not found'}`);
    });

    // Example 3: Sequential operations for safety
    console.log('\n3. Sequential Push Operations:');
    // Note: Pushes are done sequentially to avoid conflicts
    const pushBranches = ['main', 'develop'];
    for (const branch of pushBranches) {
      const result = await gitExecutor.pushBranch(projectPath, branch);
      console.log(`Push ${branch}: ${result.success ? 'success' : 'failed'}`);
    }

  } catch (error) {
    console.error('Performance examples failed:', error.message);
  }
}

// Integration with sync detection service
async function integrationExample() {
  console.log('\n=== Integration with Sync Detection ===\n');

  // This would normally import from your sync detection service
  // import { getAllPendingProjects } from './sync-detection-service.js';
  
  const mcpClient = new MockMcpClient();
  const gitExecutor = createGitExecutor(mcpClient);

  try {
    // Mock pending projects data
    const pendingProjects = [
      {
        projectPath: '/Users/test/gitrepo/projects/proj1_test',
        branches: [
          { branchName: 'main', needsSync: true, pendingCommits: 3 },
          { branchName: 'auto/feature', needsSync: true, pendingCommits: 1 }
        ]
      }
    ];

    console.log('Processing pending projects for sync...');

    for (const project of pendingProjects) {
      console.log(`\nProject: ${project.projectPath}`);
      
      const branchesToSync = project.branches
        .filter(b => b.needsSync)
        .map(b => b.branchName);

      if (branchesToSync.length > 0) {
        const pushResult = await gitExecutor.pushAllBranches(
          project.projectPath,
          branchesToSync
        );

        console.log(`Synced ${pushResult.successfulPushes} branches`);
      }
    }

    console.log('\n✓ All pending projects processed');

  } catch (error) {
    console.error('Integration example failed:', error.message);
  }
}

// Run all examples
async function runAllExamples() {
  console.log('🚀 GitExecutor Usage Examples\n');
  
  try {
    await basicUsageExamples();
    await repositoryCreationExamples();
    await advancedGitOperations();
    await errorHandlingExamples();
    await syncWorkflowExample();
    await performanceExample();
    await integrationExample();
    
    console.log('\n✅ All examples completed successfully!');
  } catch (error) {
    console.error('\n❌ Examples failed:', error);
  }
}

// Export for use in other modules
export {
  basicUsageExamples,
  repositoryCreationExamples,
  advancedGitOperations,
  errorHandlingExamples,
  syncWorkflowExample,
  performanceExample,
  integrationExample
};

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllExamples();
} 