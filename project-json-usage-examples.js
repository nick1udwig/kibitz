import {
  readProjectJson,
  writeProjectJson,
  updateGitHubConfig,
  updateSyncStatus,
  updateBranchSyncStatus,
  getAllProjectsWithGitHub,
  ensureKibitzDirectory,
  migrateProjectToV2,
  getProjectPath,
  parseProjectDirectoryName,
  DEFAULT_GITHUB_CONFIG
} from './project-json-manager.js';

/**
 * Example usage of the project-json-manager module
 */

async function examples() {
  try {
    // Example 1: Read existing project data
    console.log('=== Reading Project Data ===');
    const projectPath = '/Users/test/gitrepo/projects/kvsird_new-project';
    const projectData = await readProjectJson(projectPath);
    console.log('Project ID:', projectData.projectId);
    console.log('GitHub enabled:', projectData.github?.enabled);

    // Example 2: Enable GitHub sync for a project
    console.log('\n=== Enabling GitHub Sync ===');
    await updateGitHubConfig(projectPath, {
      enabled: true,
      remoteUrl: 'https://github.com/user/repo.git',
      syncBranches: ['main', 'auto/*'],
      authentication: {
        type: 'token',
        configured: true,
        lastValidated: Date.now()
      }
    });
    console.log('✓ GitHub sync enabled');

    // Example 3: Update sync status
    console.log('\n=== Updating Sync Status ===');
    await updateSyncStatus(projectPath, 'syncing');
    console.log('✓ Sync status updated to "syncing"');

    // Example 4: Update branch sync information
    console.log('\n=== Updating Branch Sync ===');
    await updateBranchSyncStatus(projectPath, 'main', {
      lastPushed: Date.now(),
      pushedHash: 'abc123',
      needsSync: false,
      syncError: null
    });
    console.log('✓ Branch sync status updated');

    // Example 5: Get all projects with GitHub enabled
    console.log('\n=== Finding GitHub Projects ===');
    const githubProjects = await getAllProjectsWithGitHub();
    console.log(`Found ${githubProjects.length} projects with GitHub enabled:`);
    githubProjects.forEach(project => {
      console.log(`- ${project.projectId} (${project.directoryName})`);
    });

    // Example 6: Migrate project to v2 schema
    console.log('\n=== Migrating Project ===');
    const migrated = await migrateProjectToV2(projectPath);
    console.log(migrated ? '✓ Project migrated to v2' : '✓ Project already up to date');

    // Example 7: Working with project paths
    console.log('\n=== Path Utilities ===');
    const fullPath = getProjectPath('conv123', 'my-project');
    console.log('Generated path:', fullPath);
    
    const parsed = parseProjectDirectoryName('conv123_my-project');
    console.log('Parsed directory:', parsed);

    // Example 8: Creating a new project structure
    console.log('\n=== Creating New Project ===');
    const newProjectPath = getProjectPath('newconv', 'test-project');
    await ensureKibitzDirectory(newProjectPath);
    
    const newProjectData = {
      commit_hash: 'initial',
      branch: 'main',
      author: 'Test User',
      date: new Date().toISOString(),
      message: 'Initial commit',
      remote_url: null,
      is_dirty: false,
      projectId: 'newconv',
      projectName: 'test-project',
      projectPath: newProjectPath,
      gitInitialized: true,
      lastActivity: Date.now(),
      repository: {
        defaultBranch: 'main',
        totalBranches: 1,
        totalCommits: 1,
        lastActivity: Date.now(),
        size: 0,
        languages: {}
      },
      github: { ...DEFAULT_GITHUB_CONFIG },
      sync: {
        lastAttempt: null,
        nextScheduled: null,
        consecutiveFailures: 0,
        pendingChanges: []
      },
      branches: [{
        branchName: 'main',
        commitHash: 'initial',
        commitMessage: 'Initial commit',
        timestamp: Date.now(),
        author: 'Test User',
        filesChanged: [],
        linesAdded: 0,
        linesRemoved: 0,
        isMainBranch: true,
        tags: ['main'],
        sync: {
          lastPushed: null,
          pushedHash: null,
          needsSync: false,
          syncError: null
        }
      }],
      conversations: [],
      metadata: {
        generated: Date.now(),
        version: '2.0',
        source: 'example-script'
      }
    };
    
    await writeProjectJson(newProjectPath, newProjectData);
    console.log('✓ New project created');

  } catch (error) {
    console.error('Example failed:', error.message);
  }
}

// Advanced usage examples
async function advancedExamples() {
  console.log('\n=== Advanced Usage Examples ===');

  try {
    // Batch update multiple projects
    console.log('\n--- Batch GitHub Enable ---');
    const allProjects = await getAllProjectsWithGitHub();
    
    for (const project of allProjects) {
      if (!project.github.enabled) {
        await updateGitHubConfig(project.fullPath, {
          enabled: true,
          syncInterval: 600000 // 10 minutes
        });
        console.log(`✓ Enabled GitHub for ${project.projectId}`);
      }
    }

    // Error handling example
    console.log('\n--- Error Handling ---');
    try {
      await readProjectJson('/nonexistent/path');
    } catch (error) {
      console.log('✓ Properly caught error:', error.message);
    }

    // Sync status workflow
    console.log('\n--- Sync Workflow ---');
    const projectPath = '/Users/test/gitrepo/projects/kvsird_new-project';
    
    // Start sync
    await updateSyncStatus(projectPath, 'syncing');
    console.log('✓ Sync started');
    
    // Simulate sync process...
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Update branch as synced
    await updateBranchSyncStatus(projectPath, 'main', {
      lastPushed: Date.now(),
      pushedHash: 'new-hash-123',
      needsSync: false
    });
    
    // Complete sync
    await updateSyncStatus(projectPath, 'idle');
    console.log('✓ Sync completed');

  } catch (error) {
    console.error('Advanced example failed:', error.message);
  }
}

// Debug mode example
async function debugExample() {
  console.log('\n=== Debug Mode Example ===');
  console.log('Set DEBUG=1 environment variable to see debug logs');
  
  // Enable debug logging
  process.env.DEBUG = '1';
  
  const projectPath = '/Users/test/gitrepo/projects/kvsird_new-project';
  await readProjectJson(projectPath);
  console.log('✓ Check console for debug output');
}

// Run examples
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🚀 Running Project JSON Manager Examples\n');
  
  examples()
    .then(() => advancedExamples())
    .then(() => debugExample())
    .then(() => console.log('\n✅ All examples completed successfully'))
    .catch(error => console.error('\n❌ Examples failed:', error));
} 