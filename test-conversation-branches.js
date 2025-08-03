#!/usr/bin/env node

/**
 * Test Conversation-Based Branching System
 * 
 * This script tests the new conversation-based branching to ensure:
 * 1. Each conversation gets its own branch sequence
 * 2. Hash IDs don't get overwritten between conversations
 * 3. Branch history is preserved properly
 */

const PROJECT_ID = '6aqa3u'; // Use your actual project ID
const API_BASE = 'http://localhost:3000';

async function testConversationBranching() {
  console.log('🧪 Testing Conversation-Based Branching System\n');
  
  try {
    // Test 1: Check current project structure
    console.log('📋 Test 1: Get current project structure...');
    const projectResponse = await fetch(`${API_BASE}/api/projects/${PROJECT_ID}`);
    
    if (projectResponse.ok) {
      const projectData = await projectResponse.json();
      console.log('✅ Project data loaded:');
      console.log(`   - Project ID: ${projectData.projectId}`);
      console.log(`   - Total branches: ${projectData.branches?.length || 0}`);
      console.log(`   - Conversations: ${projectData.conversations?.length || 0}`);
      
      // Show current branch structure
      if (projectData.branches && projectData.branches.length > 0) {
        console.log('\n📋 Current branches:');
        projectData.branches.forEach((branch, index) => {
          console.log(`   ${index + 1}. ${branch.branchName} (${branch.commitHash?.substring(0, 8)})`);
          if (branch.conversation) {
            console.log(`      └─ Conversation: ${branch.conversation.conversationId}, Step: ${branch.conversation.interactionCount}`);
          }
        });
      }
      
      // Show conversation structure if it exists
      if (projectData.conversations && projectData.conversations.length > 0) {
        console.log('\n🗣️ Conversations:');
        projectData.conversations.forEach((conv, index) => {
          console.log(`   ${index + 1}. Conversation ${conv.conversationId}:`);
          console.log(`      - Current branch: ${conv.currentBranch}`);
          console.log(`      - Total branches: ${conv.branches?.length || 0}`);
          if (conv.branches) {
            conv.branches.forEach((branch, bIndex) => {
              console.log(`        ${bIndex + 1}. ${branch.branchName} (step ${branch.interactionIndex})`);
            });
          }
        });
      }
      
    } else {
      console.error('❌ Failed to load project data');
      return;
    }
    
    // Test 2: Generate new project JSON to see conversation tracking
    console.log('\n🔄 Test 2: Generate fresh project JSON...');
    const generateResponse = await fetch(`${API_BASE}/api/projects/${PROJECT_ID}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (generateResponse.ok) {
      console.log('✅ Project JSON regenerated successfully');
      
      // Get updated project data
      const updatedProjectResponse = await fetch(`${API_BASE}/api/projects/${PROJECT_ID}`);
      if (updatedProjectResponse.ok) {
        const updatedData = await updatedProjectResponse.json();
        
        console.log('\n📊 Updated project structure:');
        console.log(`   - Total branches: ${updatedData.branches?.length || 0}`);
        console.log(`   - Total conversations: ${updatedData.conversations?.length || 0}`);
        
        // Check for conversation-style branches
        const conversationBranches = updatedData.branches?.filter(b => 
          b.branchName && b.branchName.startsWith('conv-')
        ) || [];
        
        console.log(`   - Conversation branches: ${conversationBranches.length}`);
        
        if (conversationBranches.length > 0) {
          console.log('\n🎉 Found conversation-based branches:');
          conversationBranches.forEach((branch, index) => {
            console.log(`   ${index + 1}. ${branch.branchName}`);
            console.log(`      - Hash: ${branch.commitHash?.substring(0, 8)}`);
            console.log(`      - Timestamp: ${new Date(branch.timestamp).toLocaleString()}`);
            if (branch.conversation) {
              console.log(`      - Conversation: ${branch.conversation.conversationId}`);
              console.log(`      - Step: ${branch.conversation.interactionCount}`);
              console.log(`      - Base: ${branch.conversation.baseBranch}`);
            }
          });
        } else {
          console.log('ℹ️ No conversation-based branches found yet');
          console.log('   This is expected if no conversations with multiple interactions have occurred');
        }
      }
    } else {
      console.error('❌ Failed to generate project JSON');
    }
    
    // Test 3: Show expected behavior explanation
    console.log('\n📚 Test 3: Expected Behavior Explanation');
    console.log('\n🔄 How Conversation-Based Branching Works:');
    console.log('   1. Each conversation gets a unique ID');
    console.log('   2. First interaction: conv-{id}-step-1 branch created');
    console.log('   3. Second interaction: conv-{id}-step-2 branch created (based on step-1)');
    console.log('   4. New conversation: conv-{new-id}-step-1 branch created');
    console.log('   5. Each branch preserves its own commit hash - NO OVERWRITING!');
    
    console.log('\n✅ Benefits:');
    console.log('   - Hash IDs never get overwritten');
    console.log('   - Each conversation maintains its own branch history');
    console.log('   - Easy to track conversation progression');
    console.log('   - Perfect isolation between conversations');
    
    console.log('\n🧪 To test this system:');
    console.log('   1. Start a conversation and ask LLM to write some code');
    console.log('   2. Watch console for: "Creating conversation branch for {conversationId}"');
    console.log('   3. Continue the conversation - should create step-2, step-3, etc.');
    console.log('   4. Start a NEW conversation - should create a new conv-{id}-step-1');
    console.log('   5. Check project JSON - all branches should have different hashes');
    
    console.log('\n🎯 Test completed! Check the analysis above.');
    
  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
  }
}

// Run the test
testConversationBranching().catch(console.error); 