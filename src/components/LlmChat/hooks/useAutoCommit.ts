import { useCallback, useRef, useEffect } from 'react';
import { useAutoCommitStore, AutoCommitContext } from '../../../stores/autoCommitStore';
import { useStore } from '../../../stores/rootStore';
import { ensureProjectDirectory } from '../../../lib/projectPathService';

// Helper to detect if tool output indicates file changes
const detectFileChanges = (toolName: string, toolOutput: string): string[] => {
  const toolNameLower = toolName.toLowerCase();
  const changedFiles: string[] = [];
  
  // Look for file paths in output
  const filePatterns = [
    /(?:created|modified|updated|wrote to|saved)\s+([^\s]+\.[\w]+)/gi,
    /(?:file|path):\s*([^\s]+\.[\w]+)/gi,
    /([^\s]+\.[\w]+)\s+(?:created|modified|updated)/gi
  ];
  
  filePatterns.forEach(pattern => {
    const matches = toolOutput.matchAll(pattern);
    for (const match of matches) {
      if (match[1]) {
        changedFiles.push(match[1]);
      }
    }
  });
  
  // If no specific files detected but tool likely modified files
  if (changedFiles.length === 0 && (
    toolNameLower.includes('write') || 
    toolNameLower.includes('create') || 
    toolNameLower.includes('edit') ||
    toolNameLower.includes('save')
  )) {
    // Use unique identifier per operation to avoid Set deduplication issues
    changedFiles.push(`unknown_file_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`);
  }
  
  return [...new Set(changedFiles)]; // Remove duplicates
};

// Export helper functions
export { detectFileChanges };

export const useAutoCommit = () => {
  const { 
    shouldAutoCommit, 
    executeAutoCommit, 
    trackFileChange,
    config,
    isProcessing 
  } = useAutoCommitStore();
  
  const { 
    projects, 
    activeProjectId, 
    servers,
    executeTool 
  } = useStore();
  
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Helper to get project path
  const getProjectPath = useCallback(async (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return null;
    
    const activeMcpServers = servers.filter(server => 
      server.status === 'connected' && 
      project.settings.mcpServerIds?.includes(server.id)
    );
    
    if (!activeMcpServers.length) return null;
    
    try {
      const projectPath = await ensureProjectDirectory(
        project, 
        activeMcpServers[0].id, 
        executeTool
      );
      return projectPath;
    } catch (error) {
      console.error('Failed to get project path:', error);
      return null;
    }
  }, [projects, servers, executeTool]);

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
    const projectPath = await getProjectPath(activeProjectId);
    if (!projectPath) {
      console.log('❌ Failed to get project path');
      return false;
    }
    
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
    getProjectPath
  ]);

  // Specific trigger functions for different scenarios
  const onToolExecution = useCallback(async (toolName: string, toolOutput: string) => {
    // Automatically track file changes for this tool execution
    const changedFiles = detectFileChanges(toolName, toolOutput);
    console.log('📁 onToolExecution: Detected file changes:', changedFiles);
    
    // Track the changes in the store
    changedFiles.forEach(trackFileChange);
    
    return await triggerAutoCommit({
      trigger: 'tool_execution',
      toolName,
      toolOutput
    });
  }, [triggerAutoCommit, trackFileChange]);

  const onBuildSuccess = useCallback(async (buildOutput: string) => {
    return await triggerAutoCommit({
      trigger: 'build_success',
      buildOutput
    });
  }, [triggerAutoCommit]);

  const onTestSuccess = useCallback(async (testResults: string) => {
    return await triggerAutoCommit({
      trigger: 'test_success',
      testResults
    });
  }, [triggerAutoCommit]);

  const onFileChange = useCallback(async (changedFiles: string[]) => {
    // Track individual file changes
    changedFiles.forEach(trackFileChange);
    
    return await triggerAutoCommit({
      trigger: 'file_change',
      changedFiles
    });
  }, [triggerAutoCommit, trackFileChange]);

  // Clean up debounce timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  return {
    triggerAutoCommit,
    onToolExecution,
    onBuildSuccess,
    onTestSuccess,
    onFileChange,
    isProcessing,
    config
  };
};

// Helper function to detect if tool output indicates success
export const detectToolSuccess = (toolName: string, toolOutput: string): boolean => {
  const toolNameLower = toolName.toLowerCase();
  const outputLower = toolOutput.toLowerCase();
  
  // File creation/modification tools
  if (toolNameLower.includes('write') || toolNameLower.includes('create') || toolNameLower.includes('edit')) {
    return !outputLower.includes('error') && 
           !outputLower.includes('failed') && 
           !outputLower.includes('permission denied');
  }
  
  // Build tools
  if (toolNameLower.includes('build') || toolNameLower.includes('compile') || toolNameLower.includes('npm') || toolNameLower.includes('yarn')) {
    return outputLower.includes('success') || 
           outputLower.includes('built') || 
           outputLower.includes('completed successfully') ||
           outputLower.includes('✓') ||
           (outputLower.includes('completed') && !outputLower.includes('error'));
  }
  
  // Test tools
  if (toolNameLower.includes('test') || toolNameLower.includes('jest') || toolNameLower.includes('pytest')) {
    return (outputLower.includes('passed') || outputLower.includes('ok') || outputLower.includes('✓')) && 
           !outputLower.includes('failed') && 
           !outputLower.includes('error');
  }
  
  // Git operations
  if (toolNameLower.includes('git')) {
    return !outputLower.includes('error') && 
           !outputLower.includes('failed') && 
           !outputLower.includes('fatal');
  }
  
  // Default: assume success if no error indicators
  return !outputLower.includes('error') && 
         !outputLower.includes('failed') && 
         !outputLower.includes('fatal') &&
         !outputLower.includes('exception');
}; 