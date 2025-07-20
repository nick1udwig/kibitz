#!/usr/bin/env node

/**
 * Test Real GitHub Sync Integration
 * 
 * This script tests the new real GitHub sync functionality
 * to ensure it's working correctly instead of just simulating.
 */

const PROJECT_ID = 'negpm'; // Use your actual project ID
const API_BASE = 'http://localhost:3000';

async function testRealGitHubSync() {
  console.log('🧪 Testing Real GitHub Sync Integration\n');
  
  try {
    // Test 1: Check GitHub config API
    console.log('📋 Test 1: Get current project data...');
    const projectResponse = await fetch(`${API_BASE}/api/projects/${PROJECT_ID}`);
    
    if (projectResponse.ok) {
      const projectData = await projectResponse.json();
      console.log('✅ Project data loaded successfully:');
      console.log(`   - Project ID: ${projectData.projectId}`);
      console.log(`   - GitHub enabled: ${projectData.github?.enabled}`);
      console.log(`   - Remote URL: ${projectData.github?.remoteUrl || projectData.remote_url}`);
      console.log(`   - Sync status: ${projectData.github?.syncStatus}\n`);
      
      if (!projectData.github?.enabled) {
        console.log('⚠️  GitHub sync is disabled, enabling it...');
        
        // Enable GitHub sync
        const enableResponse = await fetch(`${API_BASE}/api/github-sync/config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: PROJECT_ID,
            enabled: true,
                         remoteUrl: `https://github.com/malikrohail/${PROJECT_ID}-project.git`,
            syncBranches: ['main', 'auto/*'],
            authentication: { type: 'token', configured: true }
          })
        });
        
        if (enableResponse.ok) {
          console.log('✅ GitHub sync enabled successfully\n');
        } else {
          const error = await enableResponse.text();
          console.error('❌ Failed to enable GitHub sync:', error);
          return;
        }
      }
    } else {
      console.error('❌ Failed to load project data');
      return;
    }
    
    // Test 2: Trigger real GitHub sync
    console.log('🚀 Test 2: Trigger REAL GitHub sync (not simulation)...');
    const syncResponse = await fetch(`${API_BASE}/api/github-sync/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: PROJECT_ID,
        immediate: true
      })
    });
    
    if (syncResponse.ok) {
      const result = await syncResponse.json();
      console.log('✅ GitHub sync response received:');
      console.log(`   - Success: ${result.success}`);
      console.log(`   - Message: ${result.message || result.error}`);
      console.log(`   - Details: ${result.details || 'No details'}`);
      console.log(`   - Remote URL: ${result.remoteUrl || 'No URL'}\n`);
      
      if (result.success) {
        console.log('🎉 REAL GitHub sync completed successfully!');
        console.log('   This means your code should now be pushed to GitHub\n');
        
        // Test 3: Verify updated project data
        console.log('🔍 Test 3: Verify project data was updated...');
        const updatedProjectResponse = await fetch(`${API_BASE}/api/projects/${PROJECT_ID}`);
        
        if (updatedProjectResponse.ok) {
          const updatedData = await updatedProjectResponse.json();
          console.log('✅ Updated project data:');
          console.log(`   - Remote URL: ${updatedData.github?.remoteUrl || updatedData.remote_url}`);
          console.log(`   - Last sync: ${updatedData.github?.lastSync}`);
          console.log(`   - Sync status: ${updatedData.github?.syncStatus}\n`);
        }
        
      } else {
        console.log('❌ GitHub sync failed:');
        console.log(`   Error: ${result.error}`);
        console.log('\n💡 Possible reasons:');
        console.log('   - GitHub CLI not installed (`brew install gh`)');
        console.log('   - Not authenticated with GitHub (`gh auth login`)');
        console.log('   - Project directory not accessible');
        console.log('   - Git repository not properly initialized\n');
      }
      
    } else {
      const error = await syncResponse.text();
      console.error('❌ GitHub sync API call failed:', error);
    }
    
    // Test 4: Check GitHub status endpoint
    console.log('📊 Test 4: Check GitHub sync status...');
    const statusResponse = await fetch(`${API_BASE}/api/github-sync/status`);
    
    if (statusResponse.ok) {
      const status = await statusResponse.json();
      console.log('✅ GitHub sync status:');
      console.log(`   - Total projects: ${status.projects?.total || 0}`);
      console.log(`   - GitHub enabled: ${status.projects?.enabled || 0}`);
      console.log(`   - Automated: ${status.automated}`);
      console.log(`   - Timestamp: ${status.timestamp}\n`);
    }
    
    console.log('🎯 Test completed! Check the console output above for results.');
    
  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
  }
}

// Run the test
testRealGitHubSync().catch(console.error); 