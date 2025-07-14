// MCP Initialize Debug Script
// Run this in browser console to test Initialize tool execution

async function debugMCPInitialize() {
  console.log('🔧 Starting MCP Initialize Debug Test...');
  
  // Get root store
  const { useStore } = await import('./src/stores/rootStore');
  const rootStore = useStore.getState();
  
  // Find active MCP servers
  const activeMcpServers = rootStore.servers.filter(server => server.status === 'connected');
  
  if (!activeMcpServers.length) {
    console.error('❌ No active MCP servers found');
    return;
  }
  
  console.log(`✅ Found ${activeMcpServers.length} active MCP server(s)`);
  
  const mcpServerId = activeMcpServers[0].id;
  const testProjectPath = '/Users/test/gitrepo/projects/debug-test';
  
  console.log(`🔧 Testing Initialize with server: ${mcpServerId}`);
  console.log(`🔧 Test project path: ${testProjectPath}`);
  
  // Test different argument combinations
  const testCases = [
    {
      name: 'Full Arguments',
      args: {
        type: "first_call",
        any_workspace_path: testProjectPath,
        initial_files_to_read: [],
        task_id_to_resume: "",
        mode_name: "wcgw",
        thread_id: `debug-test-${Date.now()}`
      }
    },
    {
      name: 'Simplified Arguments',
      args: {
        type: "first_call",
        any_workspace_path: testProjectPath
      }
    },
    {
      name: 'Minimal Arguments',
      args: {
        any_workspace_path: testProjectPath
      }
    }
  ];
  
  for (const testCase of testCases) {
    console.log(`\n🧪 Testing: ${testCase.name}`);
    console.log(`📋 Arguments:`, JSON.stringify(testCase.args, null, 2));
    
    try {
      const startTime = Date.now();
      const result = await rootStore.executeTool(mcpServerId, 'Initialize', testCase.args);
      const duration = Date.now() - startTime;
      
      console.log(`✅ ${testCase.name} - SUCCESS (${duration}ms)`);
      console.log(`📋 Result (first 200 chars):`, result.substring(0, 200));
      
      // Check if thread_id was returned
      const threadMatch = result.match(/thread_id=([a-z0-9]+)/i);
      if (threadMatch) {
        console.log(`🔗 Thread ID extracted: ${threadMatch[1]}`);
      } else {
        console.warn(`⚠️ No thread_id found in response`);
      }
      
      break; // Stop on first success
      
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`❌ ${testCase.name} - FAILED (${duration}ms):`, error.message);
      
      if (error.message.includes('timeout')) {
        console.error(`⏰ Timeout detected - MCP server may be unresponsive`);
      }
      if (error.message.includes('validation')) {
        console.error(`🔍 Validation error - MCP server couldn't parse arguments`);
      }
    }
  }
  
  console.log('\n🔧 MCP Initialize Debug Test Complete');
}

// Export for browser console use
window.debugMCPInitialize = debugMCPInitialize;

console.log('🔧 MCP Initialize Debug Script loaded. Run: debugMCPInitialize()'); 