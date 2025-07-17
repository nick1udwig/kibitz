/**
 * Comprehensive Auto-Commit Debugging Script
 * 
 * This script helps track and debug auto-commit functionality by:
 * 1. Monitoring all relevant logs
 * 2. Tracking file changes and pending changes
 * 3. Showing auto-commit status and triggers
 * 4. Providing local storage debugging
 * 5. Monitoring branch creation
 * 
 * To use: Copy and paste this into your browser console (F12)
 */

// 🔧 Debug Configuration
const DEBUG_CONFIG = {
  trackLogs: true,
  trackAutoCommit: true,
  trackFileChanges: true,
  trackBranches: true,
  trackLocalStorage: true,
  showTimestamps: true,
  logLevel: 'ALL' // 'ERROR', 'WARN', 'INFO', 'DEBUG', 'ALL'
};

// 🗂️ Debug Data Storage
const debugData = {
  logs: [],
  autoCommitEvents: [],
  fileChanges: [],
  branchEvents: [],
  errors: [],
  systemState: {}
};

// 🎯 Auto-Commit Status Tracker
const autoCommitStatus = {
  enabled: false,
  pendingChanges: 0,
  lastCommitTime: null,
  isProcessing: false,
  lastError: null,
  triggers: {}
};

// 🔍 Log Interceptor
const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info,
  debug: console.debug
};

// 📝 Enhanced Console Logging
function enhancedLog(level, ...args) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    level,
    timestamp,
    message: args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' '),
    args: args
  };
  
  debugData.logs.push(logEntry);
  
  // Keep only last 1000 logs to prevent memory issues
  if (debugData.logs.length > 1000) {
    debugData.logs = debugData.logs.slice(-1000);
  }
  
  // Check for auto-commit related logs
  if (logEntry.message.includes('auto-commit') || logEntry.message.includes('AutoCommit')) {
    debugData.autoCommitEvents.push(logEntry);
  }
  
  // Check for file change logs
  if (logEntry.message.includes('trackFileChange') || logEntry.message.includes('FileWriteOrEdit')) {
    debugData.fileChanges.push(logEntry);
  }
  
  // Check for branch logs
  if (logEntry.message.includes('branch') || logEntry.message.includes('Branch')) {
    debugData.branchEvents.push(logEntry);
  }
  
  // Check for errors
  if (level === 'error' || logEntry.message.includes('error') || logEntry.message.includes('Error')) {
    debugData.errors.push(logEntry);
  }
  
  // Call original console method
  originalConsole[level].apply(console, args);
}

// 🎪 Override console methods
if (DEBUG_CONFIG.trackLogs) {
  console.log = (...args) => enhancedLog('log', ...args);
  console.error = (...args) => enhancedLog('error', ...args);
  console.warn = (...args) => enhancedLog('warn', ...args);
  console.info = (...args) => enhancedLog('info', ...args);
  console.debug = (...args) => enhancedLog('debug', ...args);
}

// 🔄 System State Monitor
function updateSystemState() {
  try {
    // Get stores from window if available
    const stores = {
      rootStore: window.useStore?.getState?.(),
      autoCommitStore: window.useAutoCommitStore?.getState?.(),
      branchStore: window.useBranchStore?.getState?.(),
      checkpointStore: window.useCheckpointStore?.getState?.()
    };
    
    debugData.systemState = {
      timestamp: new Date().toISOString(),
      stores: stores,
      localStorage: {
        keys: Object.keys(localStorage),
        autoCommitData: localStorage.getItem('auto-commit-data'),
        projectData: localStorage.getItem('project-data'),
        branchData: localStorage.getItem('branch-data')
      },
      sessionStorage: {
        keys: Object.keys(sessionStorage),
        currentProject: sessionStorage.getItem('current-project'),
        activeConversation: sessionStorage.getItem('active-conversation')
      }
    };
    
    // Update auto-commit status
    if (stores.autoCommitStore) {
      autoCommitStatus.enabled = stores.autoCommitStore.config?.enabled || false;
      autoCommitStatus.pendingChanges = stores.autoCommitStore.pendingChanges?.size || 0;
      autoCommitStatus.lastCommitTime = stores.autoCommitStore.lastCommitTimestamp;
      autoCommitStatus.isProcessing = stores.autoCommitStore.isProcessing || false;
      autoCommitStatus.triggers = stores.autoCommitStore.config?.triggers || {};
    }
    
  } catch (error) {
    console.error('❌ Debug: Failed to update system state:', error);
  }
}

// 📊 Debug Dashboard
function showDebugDashboard() {
  console.clear();
  console.log('🔧 AUTO-COMMIT DEBUG DASHBOARD');
  console.log('================================');
  
  // System Status
  console.log('\n📊 SYSTEM STATUS:');
  console.log('├── Auto-Commit Enabled:', autoCommitStatus.enabled);
  console.log('├── Pending Changes:', autoCommitStatus.pendingChanges);
  console.log('├── Processing:', autoCommitStatus.isProcessing);
  console.log('├── Last Commit:', autoCommitStatus.lastCommitTime ? new Date(autoCommitStatus.lastCommitTime).toLocaleString() : 'Never');
  console.log('└── Triggers:', autoCommitStatus.triggers);
  
  // Recent Logs
  console.log('\n📝 RECENT AUTO-COMMIT LOGS (last 10):');
  debugData.autoCommitEvents.slice(-10).forEach((log, i) => {
    console.log(`${i+1}. [${log.timestamp}] ${log.message}`);
  });
  
  // File Changes
  console.log('\n📁 RECENT FILE CHANGES (last 10):');
  debugData.fileChanges.slice(-10).forEach((log, i) => {
    console.log(`${i+1}. [${log.timestamp}] ${log.message}`);
  });
  
  // Recent Errors
  console.log('\n❌ RECENT ERRORS (last 5):');
  debugData.errors.slice(-5).forEach((log, i) => {
    console.log(`${i+1}. [${log.timestamp}] ${log.message}`);
  });
  
  // Branch Events
  console.log('\n🌿 RECENT BRANCH EVENTS (last 5):');
  debugData.branchEvents.slice(-5).forEach((log, i) => {
    console.log(`${i+1}. [${log.timestamp}] ${log.message}`);
  });
  
  // Local Storage Debug
  console.log('\n💾 LOCAL STORAGE DEBUG:');
  console.log('├── LocalStorage Keys:', debugData.systemState.localStorage?.keys || []);
  console.log('├── SessionStorage Keys:', debugData.systemState.sessionStorage?.keys || []);
  console.log('└── Project Data Available:', !!debugData.systemState.localStorage?.projectData);
  
  console.log('\n🎯 COMMANDS:');
  console.log('├── debugAutoCommit.showDashboard() - Show this dashboard');
  console.log('├── debugAutoCommit.forceAutoCommit() - Force auto-commit trigger');
  console.log('├── debugAutoCommit.showLogs() - Show all logs');
  console.log('├── debugAutoCommit.clearLogs() - Clear all logs');
  console.log('├── debugAutoCommit.exportLogs() - Export logs to file');
  console.log('└── debugAutoCommit.testFileChange() - Test file change tracking');
}

// 🚀 Force Auto-Commit Test
function forceAutoCommit() {
  console.log('🚀 Force triggering auto-commit...');
  
  try {
    // Try to get the auto-commit store
    const autoCommitStore = window.useAutoCommitStore?.getState?.();
    if (!autoCommitStore) {
      console.error('❌ Auto-commit store not found');
      return;
    }
    
    // Try to trigger auto-commit
    const context = {
      trigger: 'tool_execution',
      toolName: 'FileWriteOrEdit',
      projectId: 'test-project',
      projectPath: '/Users/test/gitrepo/projects/test-project',
      timestamp: Date.now()
    };
    
    console.log('📋 Auto-commit context:', context);
    
    const shouldCommit = autoCommitStore.shouldAutoCommit(context);
    console.log('🔍 Should auto-commit:', shouldCommit);
    
    if (shouldCommit) {
      autoCommitStore.executeAutoCommit(context);
      console.log('✅ Auto-commit triggered');
    } else {
      console.log('❌ Auto-commit conditions not met');
    }
    
  } catch (error) {
    console.error('❌ Failed to force auto-commit:', error);
  }
}

// 📁 Test File Change Tracking
function testFileChange() {
  console.log('📁 Testing file change tracking...');
  
  try {
    const autoCommitStore = window.useAutoCommitStore?.getState?.();
    if (!autoCommitStore) {
      console.error('❌ Auto-commit store not found');
      return;
    }
    
    const testFile = `test-file-${Date.now()}.txt`;
    console.log('📝 Tracking test file:', testFile);
    
    autoCommitStore.trackFileChange(testFile);
    console.log('✅ File change tracked');
    
    // Show updated status
    setTimeout(() => {
      updateSystemState();
      console.log('📊 Updated pending changes:', autoCommitStatus.pendingChanges);
    }, 100);
    
  } catch (error) {
    console.error('❌ Failed to test file change:', error);
  }
}

// 📄 Export Logs
function exportLogs() {
  const exportData = {
    timestamp: new Date().toISOString(),
    config: DEBUG_CONFIG,
    autoCommitStatus: autoCommitStatus,
    debugData: debugData
  };
  
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `auto-commit-debug-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  
  console.log('📤 Debug logs exported to file');
}

// 🧹 Clear Logs
function clearLogs() {
  debugData.logs = [];
  debugData.autoCommitEvents = [];
  debugData.fileChanges = [];
  debugData.branchEvents = [];
  debugData.errors = [];
  console.log('🧹 All debug logs cleared');
}

// 🔄 Start Monitoring
function startMonitoring() {
  console.log('🔄 Starting auto-commit monitoring...');
  
  // Update system state every 5 seconds
  setInterval(updateSystemState, 5000);
  
  // Show dashboard every 30 seconds
  setInterval(() => {
    if (DEBUG_CONFIG.trackAutoCommit) {
      showDebugDashboard();
    }
  }, 30000);
  
  // Initial update
  updateSystemState();
  showDebugDashboard();
}

// 🎯 Global Debug Object
window.debugAutoCommit = {
  showDashboard: showDebugDashboard,
  forceAutoCommit: forceAutoCommit,
  testFileChange: testFileChange,
  showLogs: () => console.log('📝 All Logs:', debugData.logs),
  clearLogs: clearLogs,
  exportLogs: exportLogs,
  config: DEBUG_CONFIG,
  data: debugData,
  status: autoCommitStatus
};

// 🚀 Auto-start monitoring
startMonitoring();

console.log('🎯 Auto-Commit Debug Script Loaded!');
console.log('Use debugAutoCommit.showDashboard() to see the debug dashboard');
console.log('Use debugAutoCommit.forceAutoCommit() to test auto-commit');
console.log('Use debugAutoCommit.testFileChange() to test file tracking'); 