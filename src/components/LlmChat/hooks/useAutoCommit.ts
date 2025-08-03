import { useCallback, useRef, useEffect } from 'react';
import { useAutoCommitStore, AutoCommitContext } from '../../../stores/autoCommitStore';
import { useStore } from '../../../stores/rootStore';
import { getProjectPath } from '../../../lib/projectPathService';

/**
 * Hook for managing auto-commit functionality
 * 🚀 OPTIMIZED: Uses dynamic project paths for universal compatibility
 */
export const useAutoCommit = () => {
  const {
    config,
    isProcessing,
    shouldAutoCommit,
    executeAutoCommit,
    updateConfig,
    trackFileChange,
    clearPendingChanges,
    lastCommitTimestamp,
    lastCommitHash,
    lastPushTimestamp
  } = useAutoCommitStore();

  const { activeProjectId, projects } = useStore();
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Get active project
  const activeProject = activeProjectId ? projects.find(p => p.id === activeProjectId) : null;

  // 🚀 OPTIMIZED: Dynamic project path resolution
  const getProjectPathForAutoCommit = useCallback((projectId: string): string => {
    const project = projects.find(p => p.id === projectId);
    return getProjectPath(projectId, project?.name, project?.customPath);
  }, [projects]);

  // Cleanup debounce timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  // Main auto-commit trigger function
  const triggerAutoCommit = useCallback(async (context: Omit<AutoCommitContext, 'projectPath' | 'projectId'>) => {
    console.log('🔧 triggerAutoCommit called with:', context);
    
    if (!config.enabled) {
      console.log('❌ Auto-commit disabled in config');
      return false;
    }
    
    if (isProcessing) {
      console.log('⏳ Auto-commit already processing, skipping');
      return false;
    }
    
    // 🔒 System health check - avoid auto-commits during system overload
    try {
      const healthCheck = await new Promise((resolve) => {
        const timeout = setTimeout(() => resolve('timeout'), 5000); // 5 second health check
        // Simple check - if this takes too long, the system is overloaded
        Promise.resolve().then(() => {
          clearTimeout(timeout);
          resolve('healthy');
        });
      });
      
      if (healthCheck === 'timeout') {
        console.warn('🔒 Auto-commit skipped: System appears overloaded');
        return false;
      }
    } catch {
      console.warn('🔒 Auto-commit skipped: System health check failed');
      return false;
    }
    
    if (!activeProjectId) {
      console.log('❌ No active project ID');
      return false;
    }
    
    console.log('✅ Pre-checks passed, getting project path...');
    const projectPath = getProjectPathForAutoCommit(activeProjectId);
    
    console.log('✅ Project path obtained:', projectPath);
    
    const fullContext: AutoCommitContext = {
      ...context,
      projectId: activeProjectId,
      projectPath
    };
    
    console.log('🔍 Checking shouldAutoCommit with context:', fullContext);
    const shouldCommit = shouldAutoCommit(fullContext);
    console.log('🔍 shouldAutoCommit result:', shouldCommit);
    
    if (!shouldCommit) {
      console.log('❌ shouldAutoCommit returned false');
      return false;
    }
    
    // 🔒 IMPROVED: Add debouncing for file changes and tool executions with better race condition handling
    if (context.trigger === 'file_change' || context.trigger === 'tool_execution') {
      if (debounceTimeoutRef.current) {
        console.log('⏰ Clearing existing debounce timeout');
        clearTimeout(debounceTimeoutRef.current);
      }
      
      console.log(`⏰ Setting debounce timeout for ${config.conditions.delayAfterLastChange}ms`);
      debounceTimeoutRef.current = setTimeout(async () => {
        console.log('⏰ Debounce timeout fired, checking if auto-commit is still needed...');
        
        // 🔒 Re-check if operation is already in progress before executing
        const currentState = useAutoCommitStore.getState();
        if (currentState.isProcessing || currentState.activeOperations.has(fullContext.projectId)) {
          console.log('⏰ Skipping auto-commit: operation already in progress');
          return;
        }
        
        const result = await executeAutoCommit(fullContext);
        console.log('✅ Auto-commit execution result:', result);
      }, config.conditions.delayAfterLastChange);
      
      return true;
    }
    
    // For immediate triggers like build success
    console.log('🚀 Executing immediate auto-commit...');
    return await executeAutoCommit(fullContext);
  }, [
    config.enabled, 
    config.conditions.delayAfterLastChange,
    isProcessing, 
    activeProjectId, 
    shouldAutoCommit, 
    executeAutoCommit, 
    getProjectPathForAutoCommit
  ]);

  // Helper function to trigger auto-commit after tool execution
  const triggerToolExecutionCommit = useCallback(async (toolName: string, summary?: string) => {
    return await triggerAutoCommit({
      trigger: 'tool_execution',
      toolName,
      summary
    });
  }, [triggerAutoCommit]);

  // Helper function to trigger auto-commit after build success
  const triggerBuildSuccessCommit = useCallback(async (summary?: string) => {
    return await triggerAutoCommit({
      trigger: 'build_success',
      summary
    });
  }, [triggerAutoCommit]);

  // Helper function to trigger auto-commit after test success
  const triggerTestSuccessCommit = useCallback(async (summary?: string) => {
    return await triggerAutoCommit({
      trigger: 'test_success',
      summary
    });
  }, [triggerAutoCommit]);

  // Helper function to trigger auto-commit after file changes
  const triggerFileChangeCommit = useCallback(async (summary?: string) => {
    return await triggerAutoCommit({
      trigger: 'file_change',
      summary
    });
  }, [triggerAutoCommit]);

  return {
    // Configuration
    config,
    updateConfig,
    
    // State
    isProcessing,
    lastCommitTimestamp,
    lastCommitHash,
    lastPushTimestamp,
    
    // Actions
    triggerAutoCommit,
    triggerToolExecutionCommit,
    triggerBuildSuccessCommit,
    triggerTestSuccessCommit,
    triggerFileChangeCommit,
    trackFileChange,
    clearPendingChanges,
    
    // Aliases for useMessageSender compatibility
    onToolExecution: triggerToolExecutionCommit,
    onBuildSuccess: triggerBuildSuccessCommit,
    onTestSuccess: triggerTestSuccessCommit,
    
    // Utilities
    activeProject,
    getProjectPath: getProjectPathForAutoCommit
  };
};

// Helper function to detect if tool output indicates success
export const detectToolSuccess = (toolName: string, toolOutput: string): boolean => {
  const toolNameLower = toolName.toLowerCase();
  const outputLower = toolOutput.toLowerCase();
  
  // 🔧 DEBUG: Log all tool executions for debugging
  console.log(`🔍 detectToolSuccess: Checking tool "${toolName}" with output length: ${toolOutput.length}`);
  console.log(`🔍 detectToolSuccess: Tool name lowercase: "${toolNameLower}"`);
  console.log(`🔍 detectToolSuccess: Output preview: "${toolOutput.substring(0, 200)}..."`);
  
  // File creation/modification tools (expanded patterns)
  if (toolNameLower.includes('write') || 
      toolNameLower.includes('create') || 
      toolNameLower.includes('edit') ||
      toolNameLower.includes('file') ||
      toolNameLower.includes('bash') ||
      toolNameLower.includes('command')) {
    
    const hasError = outputLower.includes('error') || 
                     outputLower.includes('failed') || 
                     outputLower.includes('permission denied') ||
                     outputLower.includes('cannot') ||
                     outputLower.includes('fatal');
    
    const isSuccess = !hasError;
    console.log(`🔍 detectToolSuccess: File/Command tool "${toolName}" -> Success: ${isSuccess} (hasError: ${hasError})`);
    return isSuccess;
  }
  
  // Build tools
  if (toolNameLower.includes('build') || toolNameLower.includes('compile') || toolNameLower.includes('npm') || toolNameLower.includes('yarn')) {
    const isSuccess = (outputLower.includes('success') || 
           outputLower.includes('built') || 
           outputLower.includes('completed successfully') ||
           outputLower.includes('✓') ||
           (outputLower.includes('completed') && !outputLower.includes('error'))) &&
           !outputLower.includes('error') && !outputLower.includes('failed');
    console.log(`🔍 detectToolSuccess: Build tool "${toolName}" -> Success: ${isSuccess}`);
    return isSuccess;
  }
  
  // Test tools
  if (toolNameLower.includes('test') || toolNameLower.includes('jest') || toolNameLower.includes('pytest')) {
    const isSuccess = (outputLower.includes('passed') || outputLower.includes('ok') || outputLower.includes('✓')) && 
           !outputLower.includes('failed') && 
           !outputLower.includes('error');
    console.log(`🔍 detectToolSuccess: Test tool "${toolName}" -> Success: ${isSuccess}`);
    return isSuccess;
  }
  
  // Git operations
  if (toolNameLower.includes('git')) {
    const isSuccess = !outputLower.includes('error') && 
           !outputLower.includes('failed') && 
           !outputLower.includes('fatal');
    console.log(`🔍 detectToolSuccess: Git tool "${toolName}" -> Success: ${isSuccess}`);
    return isSuccess;
  }
  
  // Default: assume success if no error indicators (more permissive)
  const isSuccess = !outputLower.includes('error') && 
         !outputLower.includes('failed') && 
         !outputLower.includes('fatal') &&
         !outputLower.includes('exception') &&
         !outputLower.includes('cannot') &&
         !outputLower.includes('permission denied');
  
  console.log(`🔍 detectToolSuccess: Default tool "${toolName}" -> Success: ${isSuccess}`);
  return isSuccess;
};

// 🔧 MISSING FUNCTION: Detect build success specifically
export const detectBuildSuccess = (toolName: string, toolOutput: string): boolean => {
  const toolNameLower = toolName.toLowerCase();
  const outputLower = toolOutput.toLowerCase();
  
  // Check if this is a build-related tool
  const isBuildTool = toolNameLower.includes('build') || 
                     toolNameLower.includes('compile') || 
                     toolNameLower.includes('npm') || 
                     toolNameLower.includes('yarn') ||
                     toolNameLower.includes('webpack') ||
                     toolNameLower.includes('vite') ||
                     toolNameLower.includes('rollup') ||
                     toolNameLower.includes('tsc') ||
                     toolNameLower.includes('babel');
  
  if (!isBuildTool) return false;
  
  // Check for success indicators
  return (outputLower.includes('success') || 
          outputLower.includes('built') || 
          outputLower.includes('completed successfully') ||
          outputLower.includes('✓') ||
          outputLower.includes('build completed') ||
          outputLower.includes('compilation successful') ||
          (outputLower.includes('completed') && !outputLower.includes('error'))) &&
         !outputLower.includes('error') && 
         !outputLower.includes('failed') && 
         !outputLower.includes('warning');
};

// 🔧 MISSING FUNCTION: Detect test success specifically  
export const detectTestSuccess = (toolName: string, toolOutput: string): boolean => {
  const toolNameLower = toolName.toLowerCase();
  const outputLower = toolOutput.toLowerCase();
  
  // Check if this is a test-related tool
  const isTestTool = toolNameLower.includes('test') || 
                    toolNameLower.includes('jest') || 
                    toolNameLower.includes('pytest') ||
                    toolNameLower.includes('mocha') ||
                    toolNameLower.includes('karma') ||
                    toolNameLower.includes('vitest') ||
                    toolNameLower.includes('cypress') ||
                    toolNameLower.includes('spec');
  
  if (!isTestTool) return false;
  
  // Check for success indicators
  return (outputLower.includes('passed') || 
          outputLower.includes('ok') || 
          outputLower.includes('✓') ||
          outputLower.includes('all tests passed') ||
          outputLower.includes('tests passed') ||
          (outputLower.includes('test') && outputLower.includes('success'))) && 
         !outputLower.includes('failed') && 
         !outputLower.includes('error') &&
         !outputLower.includes('failing');
};

// 🔧 MISSING FUNCTION: Detect file changes from tool output
export const detectFileChanges = (toolName: string, toolOutput: string): string[] => {
  const toolNameLower = toolName.toLowerCase();
  const outputLower = toolOutput.toLowerCase();
  
  // 🔧 DEBUG: Log file detection attempts
  console.log(`🔍 detectFileChanges: Analyzing tool "${toolName}" for file changes`);
  console.log(`🔍 detectFileChanges: Output preview: "${toolOutput.substring(0, 300)}..."`);
  
  // For file creation/modification tools, extract file names
  if (toolNameLower.includes('write') || 
      toolNameLower.includes('create') || 
      toolNameLower.includes('edit') || 
      toolNameLower.includes('file') ||
      toolNameLower.includes('bash') ||
      toolNameLower.includes('command')) {
    
    const filePatterns = [
      // Standard success messages
      /created?\s+(?:file\s+)?['"`]?([^'"`\s]+\.[a-zA-Z0-9]+)['"`]?/gi,
      /wrote\s+(?:to\s+)?['"`]?([^'"`\s]+\.[a-zA-Z0-9]+)['"`]?/gi,
      /modified\s+['"`]?([^'"`\s]+\.[a-zA-Z0-9]+)['"`]?/gi,
      /updated\s+['"`]?([^'"`\s]+\.[a-zA-Z0-9]+)['"`]?/gi,
      /saved\s+(?:to\s+)?['"`]?([^'"`\s]+\.[a-zA-Z0-9]+)['"`]?/gi,
      // FileWriteOrEdit specific patterns
      /successfully\s+(?:created|wrote|saved)\s+['"`]?([^'"`\s]+\.[a-zA-Z0-9]+)['"`]?/gi,
      /file\s+['"`]?([^'"`\s]+\.[a-zA-Z0-9]+)['"`]?\s+(?:has been|was)\s+(?:created|written|saved)/gi,
      // Path-based patterns (more aggressive)
      /(?:^|\s)([a-zA-Z0-9_/-]*[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+)(?:\s|$|:)/g,
      // Tool argument patterns (capture file_path arguments)
      /"file_path":\s*"([^"]+)"/g,
      /file_path.*?['"`]([^'"`]+)['"`]/gi,
      // BashCommand file creation patterns
      /echo.*?>\s*([a-zA-Z0-9_-]+\.[a-zA-Z0-9]+)/gi,
      /cat\s*>\s*([a-zA-Z0-9_-]+\.[a-zA-Z0-9]+)/gi,
      /touch\s+([a-zA-Z0-9_.-]+)/gi,
      // Python file patterns (since user created .py files)
      /([a-zA-Z0-9_-]+\.py)(?:\s|$|'|")/gi,
      /([a-zA-Z0-9_-]+\.js)(?:\s|$|'|")/gi,
      /([a-zA-Z0-9_-]+\.md)(?:\s|$|'|")/gi,
      /([a-zA-Z0-9_-]+\.txt)(?:\s|$|'|")/gi
    ];
    
    const files: string[] = [];
    filePatterns.forEach((pattern, index) => {
      let match;
      let patternMatches = 0;
      while ((match = pattern.exec(toolOutput)) !== null) {
        const filename = match[1];
        // Filter out obviously non-file matches
        if (filename && 
            !filename.includes('http') && 
            !filename.includes('://') &&
            filename.includes('.') &&
            filename.length < 100 &&
            filename.length > 2) {
          files.push(filename);
          patternMatches++;
        }
      }
      if (patternMatches > 0) {
        console.log(`🔍 detectFileChanges: Pattern ${index} matched ${patternMatches} files`);
      }
    });
    
    // Remove duplicates and clean up paths
    const uniqueFiles = [...new Set(files)].map(file => {
      // Remove any path prefixes, just keep the filename
      return file.split('/').pop() || file;
    });
    
    console.log(`🔍 detectFileChanges: Detected ${uniqueFiles.length} files from ${toolName}:`, uniqueFiles);
    return uniqueFiles;
  }
  
  // For git tools, extract changed files
  if (toolNameLower.includes('git')) {
    const gitPatterns = [
      /\s+([a-zA-Z0-9_-]+\.[a-zA-Z0-9]+)\s*\|\s*\d+/g, // git status format
      /(?:new file|modified|deleted):\s+([^\s]+)/g
    ];
    
    const files: string[] = [];
    gitPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(toolOutput)) !== null) {
        files.push(match[1]);
      }
    });
    
    const uniqueFiles = [...new Set(files)];
    console.log(`🔍 detectFileChanges: Git detected ${uniqueFiles.length} files:`, uniqueFiles);
    return uniqueFiles;
  }

  console.log(`🔍 detectFileChanges: No files detected for tool "${toolName}"`);
  return [];
}; 