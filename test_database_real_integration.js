#!/usr/bin/env node

/**
 * Test script to verify database integration is working
 * This checks if projects are being saved to the database
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

async function testDatabaseIntegration() {
  try {
    console.log('🧪 Testing Real Database Integration...');
    
    // 1. Check if database exists
    const dbPath = path.join(__dirname, 'data', 'kibitz.db');
    if (!fs.existsSync(dbPath)) {
      console.log('❌ Database file not found:', dbPath);
      return;
    }
    
    console.log('✅ Database file exists:', dbPath);
    
    // 2. Open database connection
    const db = new Database(dbPath);
    
    // 3. Check tables exist
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log('📊 Tables in database:', tables.map(t => t.name).join(', '));
    
    // 4. Count records in each table
    const projectCount = db.prepare("SELECT COUNT(*) as count FROM projects").get();
    const checkpointCount = db.prepare("SELECT COUNT(*) as count FROM checkpoints").get();
    const branchCount = db.prepare("SELECT COUNT(*) as count FROM branches").get();
    const conversationCount = db.prepare("SELECT COUNT(*) as count FROM conversations").get();
    
    console.log('📈 Record counts:');
    console.log(`  Projects: ${projectCount.count}`);
    console.log(`  Checkpoints: ${checkpointCount.count}`);
    console.log(`  Branches: ${branchCount.count}`);
    console.log(`  Conversations: ${conversationCount.count}`);
    
    // 5. Show recent projects if any
    if (projectCount.count > 0) {
      const recentProjects = db.prepare("SELECT * FROM projects ORDER BY created_at DESC LIMIT 3").all();
      console.log('🆕 Recent projects:');
      recentProjects.forEach((project, index) => {
        console.log(`  ${index + 1}. ${project.name} (${project.id})`);
        console.log(`     Path: ${project.custom_path || 'N/A'}`);
        console.log(`     Created: ${new Date(project.created_at).toISOString()}`);
        console.log(`     Updated: ${new Date(project.updated_at).toISOString()}`);
        console.log(`     Order: ${project.order_index}`);
        console.log();
      });
    }
    
    // 6. Show recent activity
    const recentActivity = db.prepare(`
      SELECT 
        p.name as project_name,
        p.updated_at as last_activity,
        'active' as status,
        c.count as conversation_count
      FROM projects p
      LEFT JOIN (
        SELECT project_id, COUNT(*) as count 
        FROM conversations 
        GROUP BY project_id
      ) c ON p.id = c.project_id
      ORDER BY p.updated_at DESC
      LIMIT 5
    `).all();
    
    if (recentActivity.length > 0) {
      console.log('🔥 Recent activity:');
      recentActivity.forEach((activity, index) => {
        console.log(`  ${index + 1}. ${activity.project_name}`);
        console.log(`     Last activity: ${new Date(activity.last_activity).toISOString()}`);
        console.log(`     Status: ${activity.status}`);
        console.log(`     Conversations: ${activity.conversation_count || 0}`);
        console.log();
      });
    }
    
    // 7. Check for the specific project (3rri8up)
    const userProject = db.prepare("SELECT * FROM projects WHERE id LIKE '%3rri8up%' OR custom_path LIKE '%3rri8up_new-project%'").all();
    if (userProject.length > 0) {
      console.log('🎯 Found your project:');
      userProject.forEach(project => {
        console.log(`  Project: ${project.name} (${project.id})`);
        console.log(`  Path: ${project.custom_path || 'N/A'}`);
        console.log(`  Created: ${new Date(project.created_at).toISOString()}`);
        console.log(`  Updated: ${new Date(project.updated_at).toISOString()}`);
        console.log(`  Settings: ${project.settings || 'N/A'}`);
        console.log();
      });
    } else {
      console.log('⚠️ No project found matching "3rri8up_new-project"');
      console.log('This suggests the database integration is not yet active.');
      console.log('\n💡 Debugging tips:');
      console.log('1. Check if project exists in file system:');
      console.log('   ls -la /Users/test/gitrepo/projects/3rri8up_new-project');
      console.log('2. Check browser console for database logs');
      console.log('3. Verify rootStore.createProject is being called');
    }
    
    // 8. Performance check - check for optimizations
    console.log('🚀 Performance Analysis:');
    console.log(`  Total database operations: ${projectCount.count + checkpointCount.count + branchCount.count + conversationCount.count}`);
    
    if (projectCount.count === 0) {
      console.log('❌ No projects found in database');
      console.log('📝 This means:');
      console.log('   1. The database integration is not yet active');
      console.log('   2. Projects are being created but not saved to database');
      console.log('   3. The integration code needs to be triggered');
      console.log();
      console.log('💡 To fix this:');
      console.log('   1. Create a new project in the UI');
      console.log('   2. Check the browser console for database integration logs');
      console.log('   3. Look for "✅ Project XXX tracked in database" messages');
      console.log('   4. Re-run this test to verify the integration is working');
    } else {
      console.log('✅ Database integration is working!');
      console.log('🎉 Projects are being saved to the database');
    }
    
    db.close();
    console.log('\n✅ Database integration test completed');
    
  } catch (error) {
    console.error('❌ Error testing database integration:', error);
    console.error('Stack trace:', error.stack);
  }
}

// Run the test
testDatabaseIntegration().catch(console.error); 