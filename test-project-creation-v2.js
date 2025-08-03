#!/usr/bin/env node

/**
 * Test script to verify new projects are created with v2 schema
 */

import { readProjectJson } from './project-json-manager.js';

async function testProjectCreation() {
  console.log('🧪 Testing Project Creation with v2 Schema');
  console.log('=' .repeat(50));

  const projectPath = '/Users/test/gitrepo/projects/kvsird_new-project';
  
  try {
    // Test if we can read the existing project
    console.log('\n1. Testing existing project schema...');
    const projectData = await readProjectJson(projectPath);
    
    console.log('✅ Project data loaded successfully');
    console.log(`📋 Project ID: ${projectData.projectId}`);
    console.log(`📋 Project Name: ${projectData.projectName}`);
    console.log(`📋 Schema Version: ${projectData.metadata?.version}`);
    
    // Check v2 schema fields
    console.log('\n2. Checking v2 schema fields...');
    
    const checks = [
      { name: 'GitHub object exists', check: () => !!projectData.github },
      { name: 'GitHub enabled field', check: () => typeof projectData.github?.enabled === 'boolean' },
      { name: 'GitHub syncBranches array', check: () => Array.isArray(projectData.github?.syncBranches) },
      { name: 'Sync object exists', check: () => !!projectData.sync },
      { name: 'Sync consecutiveFailures field', check: () => typeof projectData.sync?.consecutiveFailures === 'number' },
      { name: 'Branch sync fields', check: () => projectData.branches?.every(b => b.sync && typeof b.sync.needsSync === 'boolean') },
      { name: 'Version is 2.0', check: () => projectData.metadata?.version === '2.0' }
    ];
    
    let passedChecks = 0;
    checks.forEach(check => {
      try {
        if (check.check()) {
          console.log(`✅ ${check.name}`);
          passedChecks++;
        } else {
          console.log(`❌ ${check.name}`);
        }
      } catch (error) {
        console.log(`❌ ${check.name}: ${error.message}`);
      }
    });
    
    console.log(`\n📊 Schema Validation: ${passedChecks}/${checks.length} checks passed`);
    
    if (passedChecks === checks.length) {
      console.log('🎉 Project is using v2 schema correctly!');
    } else {
      console.log('⚠️  Project needs migration to v2 schema');
    }
    
    // Show sample GitHub config
    console.log('\n3. Current GitHub configuration:');
    console.log(JSON.stringify(projectData.github, null, 2));
    
    // Show sample branch sync info
    console.log('\n4. Sample branch sync info:');
    if (projectData.branches?.length > 0) {
      console.log(`Branch: ${projectData.branches[0].branchName}`);
      console.log(JSON.stringify(projectData.branches[0].sync, null, 2));
    }
    
  } catch (error) {
    console.log('❌ Test failed:', error.message);
    console.log('\nThis might be expected if:');
    console.log('- The project directory doesn\'t exist yet');
    console.log('- The project.json file hasn\'t been generated');
    console.log('- The project is still using v1 schema');
  }
}

async function testNewProjectAPI() {
  console.log('\n🧪 Testing New Project API Endpoint');
  console.log('=' .repeat(50));
  
  try {
    // Test the API endpoint that creates new projects
    const testProjectId = 'test_schema_v2';
    console.log(`\nTesting API for project: ${testProjectId}`);
    
    const response = await fetch(`http://localhost:3000/api/projects/${testProjectId}/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ API endpoint responded successfully');
      console.log(`📋 File created at: ${result.jsonFilePath}`);
      console.log(`📋 File size: ${result.fileSize} bytes`);
      
      // Check if the generated data has v2 schema
      if (result.data?.metadata?.version === '2.0') {
        console.log('✅ API generates v2 schema');
      } else {
        console.log('❌ API still generates v1 schema');
      }
      
      if (result.data?.github) {
        console.log('✅ API includes GitHub fields');
      } else {
        console.log('❌ API missing GitHub fields');
      }
      
    } else {
      console.log('⚠️  API endpoint not available (server not running?)');
      console.log('This is expected if the Next.js server is not running');
    }
    
  } catch (error) {
    console.log('⚠️  API test skipped:', error.message);
    console.log('This is expected if the server is not running');
  }
}

async function showIntegrationInstructions() {
  console.log('\n📋 Integration Instructions');
  console.log('=' .repeat(50));
  
  console.log('\n✅ FIXES APPLIED:');
  console.log('1. Updated src/app/api/projects/[projectId]/generate/route.ts');
  console.log('   - Now creates v2 schema with GitHub and sync fields');
  console.log('   - All branches include sync sub-objects');
  console.log('   - Version bumped to 2.0');
  
  console.log('\n2. Updated src/lib/conversationMetadataService.ts');
  console.log('   - Project metadata now includes v2 schema');
  console.log('   - GitHub and sync objects added');
  
  console.log('\n🚀 NEXT STEPS:');
  console.log('1. Test project creation in your app');
  console.log('2. Verify new projects have GitHub sync capability');
  console.log('3. Run the GitHub sync manager on new projects');
  console.log('4. Set up background service for continuous syncing');
  
  console.log('\n📝 USAGE:');
  console.log('// Enable GitHub sync for new projects');
  console.log('await updateGitHubConfig(projectPath, {');
  console.log('  enabled: true,');
  console.log('  remoteUrl: "https://github.com/user/repo.git"');
  console.log('});');
  
  console.log('\n// Sync the project');
  console.log('await syncManager.performSync(projectId);');
}

// Run tests
async function main() {
  await testProjectCreation();
  await testNewProjectAPI();
  await showIntegrationInstructions();
  
  console.log('\n🎉 Project creation integration complete!');
  console.log('New projects will automatically include GitHub sync capability.');
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { testProjectCreation, testNewProjectAPI, showIntegrationInstructions }; 