// F12 Log Capture Script - Run this in browser console
// This will capture all console logs and save them to a downloadable text file

(function() {
  console.log('🔧 Starting F12 Log Capture System...');
  
  // Create log storage
  window.debugLogs = [];
  
  // Store original console methods
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalInfo = console.info;
  
  // Function to format log entry
  function formatLogEntry(type, args) {
    const timestamp = new Date().toISOString();
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    
    return `[${timestamp}] ${type.toUpperCase()}: ${message}`;
  }
  
  // Override console methods to capture logs
  console.log = function(...args) {
    window.debugLogs.push(formatLogEntry('log', args));
    originalLog.apply(console, args);
  };
  
  console.error = function(...args) {
    window.debugLogs.push(formatLogEntry('error', args));
    originalError.apply(console, args);
  };
  
  console.warn = function(...args) {
    window.debugLogs.push(formatLogEntry('warn', args));
    originalWarn.apply(console, args);
  };
  
  console.info = function(...args) {
    window.debugLogs.push(formatLogEntry('info', args));
    originalInfo.apply(console, args);
  };
  
  // Function to download logs
  window.downloadLogs = function() {
    const logContent = window.debugLogs.join('\n');
    const blob = new Blob([logContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `kibitz-debug-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log('📄 Debug logs downloaded!');
  };
  
  // Function to clear logs
  window.clearLogs = function() {
    window.debugLogs = [];
    console.log('🗑️ Debug logs cleared!');
  };
  
  // Function to view current log count
  window.logCount = function() {
    console.log(`📊 Current log count: ${window.debugLogs.length}`);
  };
  
  console.log('✅ F12 Log Capture System Ready!');
  console.log('📋 Available commands:');
  console.log('  - downloadLogs() - Download all captured logs');
  console.log('  - clearLogs() - Clear captured logs');
  console.log('  - logCount() - Show current log count');
  console.log('🎯 Now create files and the logs will be automatically captured!');
})(); 