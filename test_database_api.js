const fetch = require('node-fetch');

async function testDatabaseAPI() {
  const baseURL = 'http://localhost:3000/api/database';
  
  console.log('🧪 Testing Database API...\n');
  
  try {
    // Test 1: Initialize database
    console.log('1. Testing database initialization...');
    const initResponse = await fetch(baseURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation: 'initialize' })
    });
    
    const initResult = await initResponse.json();
    console.log('✅ Initialize result:', initResult);
    
    // Test 2: Create a test project
    console.log('\n2. Testing project creation...');
    const testProjectData = {
      id: 'test-project-' + Date.now(),
      name: 'Test Project',
      settings: {
        provider: 'anthropic',
        model: 'claude-3-sonnet-20240229'
      },
      created_at: Date.now(),
      updated_at: Date.now(),
      order_index: 0,
      custom_path: '/test/path',
      conversation: {
        id: 'test-conversation-' + Date.now(),
        name: 'Test Project - Main',
        created_at: Date.now(),
        updated_at: Date.now()
      }
    };
    
    const createResponse = await fetch(baseURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'create_project',
        data: testProjectData
      })
    });
    
    const createResult = await createResponse.json();
    console.log('✅ Create project result:', createResult);
    
    // Test 3: Get all projects
    console.log('\n3. Testing get all projects...');
    const getResponse = await fetch(baseURL + '?operation=get_all_projects');
    const getResult = await getResponse.json();
    console.log('✅ Get projects result:', {
      success: getResult.success,
      projectCount: getResult.data?.length || 0,
      firstProject: getResult.data?.[0]?.name || 'none'
    });
    
    // Test 4: Create a standalone conversation
    console.log('\n4. Testing conversation creation...');
    const conversationData = {
      id: 'test-conversation-standalone-' + Date.now(),
      project_id: testProjectData.id,
      name: 'Test Conversation 2',
      created_at: Date.now(),
      updated_at: Date.now()
    };
    
    const convResponse = await fetch(baseURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'create_conversation',
        data: conversationData
      })
    });
    
    const convResult = await convResponse.json();
    console.log('✅ Create conversation result:', convResult);
    
    console.log('\n🎉 All tests completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testDatabaseAPI(); 