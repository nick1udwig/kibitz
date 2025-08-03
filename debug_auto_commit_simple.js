/**
 * Simple Auto-Commit Debug Script
 * 
 * Paste this into your browser console (F12) for immediate debugging
 */

console.clear();
console.log('🔧 SIMPLE AUTO-COMMIT DEBUG');
console.log('============================');

// 🔍 Check System State
function checkSystemState() {
  console.log('\n📊 SYSTEM STATE CHECK:');
  
  // Check if stores are available
  const stores = {
    rootStore: window.useStore?.getState?.(),
    autoCommitStore: window.useAutoCommitStore?.getState?.(),
    branchStore: window.useBranchStore?.getState?.(),
    checkpointStore: window.useCheckpointStore?.getState?.()
  };
  
  console.log('├── Root Store Available:', !!stores.rootStore);
  console.log('├── Auto-Commit Store Available:', !!stores.autoCommitStore);
  console.log('├── Branch Store Available:', !!stores.branchStore);
  console.log('└── Checkpoint Store Available:', !!stores.checkpointStore);
  
  if (stores.autoCommitStore) {
    const autoCommit = stores.autoCommitStore;
    console.log('\n🎯 AUTO-COMMIT STATUS:');
    console.log('├── Enabled:', autoCommit.config?.enabled);
    console.log('├── Pending Changes:', autoCommit.pendingChanges?.size || 0);
    console.log('├── Processing:', autoCommit.isProcessing);
    console.log('├── Last Commit:', autoCommit.lastCommitTimestamp ? new Date(autoCommit.lastCommitTimestamp).toLocaleString() : 'Never');
    console.log('└── Triggers:', autoCommit.config?.triggers);
    
    // Show pending changes
    if (autoCommit.pendingChanges?.size > 0) {
      console.log('\n📁 PENDING CHANGES:');
      Array.from(autoCommit.pendingChanges).forEach((file, i) => {
        console.log(`${i+1}. ${file}`);
      });
    }
  }
  
  if (stores.rootStore) {
    const root = stores.rootStore;
    console.log('\n🗂️ PROJECT INFO:');
    console.log('├── Active Project ID:', root.activeProjectId);
    console.log('├── Projects Count:', root.projects?.length || 0);
    console.log('├── Active Servers:', root.servers?.filter(s => s.status === 'connected').length || 0);
    
    if (root.activeProjectId) {
      const project = root.projects?.find(p => p.id === root.activeProjectId);
      if (project) {
        console.log('├── Project Name:', project.name);
        console.log('└── Project Path: (will be generated)');
      }
    }
  }
}

// 🧪 Test File Change Tracking
function testFileTracking() {
  console.log('\n🧪 TESTING FILE CHANGE TRACKING:');
  
  try {
    const autoCommitStore = window.useAutoCommitStore?.getState?.();
    if (!autoCommitStore) {
      console.error('❌ Auto-commit store not available');
      return;
    }
    
    // Test tracking multiple files
    const testFiles = [
      'README1.md',
      'README2.md', 
      'README3.md',
      'README4.md'
    ];
    
    console.log('📝 Tracking test files...');
    testFiles.forEach(file => {
      autoCommitStore.trackFileChange(file);
      console.log(`✅ Tracked: ${file}`);
    });
    
    // Check pending changes
    setTimeout(() => {
      const updatedStore = window.useAutoCommitStore?.getState?.();
      console.log('📊 Updated pending changes:', updatedStore?.pendingChanges?.size || 0);
      
      // Test auto-commit trigger
      const context = {
        trigger: 'tool_execution',
        toolName: 'FileWriteOrEdit',
        projectId: 'fh9n1s',
        projectPath: '/Users/test/gitrepo/projects/fh9n1s_new-project',
        timestamp: Date.now()
      };
      
      console.log('🔍 Testing auto-commit trigger...');
      const shouldCommit = updatedStore.shouldAutoCommit(context);
      console.log('🎯 Should auto-commit:', shouldCommit);
      
      if (shouldCommit) {
        console.log('✅ Auto-commit conditions met - triggering...');
        updatedStore.executeAutoCommit(context);
      } else {
        console.log('❌ Auto-commit conditions not met');
        console.log('🔍 Debug info:');
        console.log('  - Enabled:', updatedStore.config?.enabled);
        console.log('  - Pending changes:', updatedStore.pendingChanges?.size);
        console.log('  - Min changes required:', updatedStore.config?.conditions?.minimumChanges);
        console.log('  - Processing:', updatedStore.isProcessing);
      }
    }, 100);
    
  } catch (error) {
    console.error('❌ File tracking test failed:', error);
  }
}

// 💾 Check Local Storage
function checkLocalStorage() {
  console.log('\n💾 LOCAL STORAGE CHECK:');
  console.log('├── LocalStorage Keys:', Object.keys(localStorage));
  console.log('├── SessionStorage Keys:', Object.keys(sessionStorage));
  
  // Check for relevant data
  const relevantKeys = ['auto-commit', 'project', 'branch', 'checkpoint', 'conversation'];
  const foundData = {};
  
  relevantKeys.forEach(key => {
    Object.keys(localStorage).forEach(storageKey => {
      if (storageKey.toLowerCase().includes(key)) {
        foundData[storageKey] = localStorage.getItem(storageKey);
      }
    });
  });
  
  console.log('├── Relevant Data Found:', Object.keys(foundData));
  console.log('└── Data Preview:', Object.keys(foundData).slice(0, 5));
}

// 🔄 Monitor Git Service Errors
function monitorGitErrors() {
  console.log('\n🔄 MONITORING GIT SERVICE ERRORS:');
  
  // Override console.error to catch git errors
  const originalError = console.error;
  console.error = function(...args) {
    const message = args.join(' ');
    if (message.includes('git') || message.includes('Git') || message.includes('type') || message.includes('BashCommand')) {
      console.log('🚨 GIT ERROR DETECTED:', message);
    }
    originalError.apply(console, args);
  };
  
  console.log('✅ Git error monitoring enabled');
}

// 🎯 Main Debug Function
function runDebug() {
  checkSystemState();
  checkLocalStorage();
  monitorGitErrors();
  
  console.log('\n🎯 DEBUG COMMANDS:');
  console.log('├── testFileTracking() - Test file change tracking');
  console.log('├── checkSystemState() - Check system state');
  console.log('├── checkLocalStorage() - Check local storage');
  console.log('└── window.debugAutoCommit - Full debugging (if available)');
}

// 🚀 Run the debug
runDebug();

// 📝 Global commands
window.testFileTracking = testFileTracking;
window.checkSystemState = checkSystemState;
window.checkLocalStorage = checkLocalStorage;

console.log('\n✅ Simple debug script loaded!');
console.log('💡 Run testFileTracking() to test the file change system'); 