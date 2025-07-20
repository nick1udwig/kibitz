/**
 * Seamless Integration Example
 * 
 * This example demonstrates how to integrate all the components to provide
 * a seamless Replit Agent v2 / Claude tool experience with proper storage,
 * auto-commit, and error handling.
 */

import { 
  initializeSeamlessWorkflow,
  createWorkflowSession,
  executeWorkflowCommand,
  createReadmeFiles,
  WorkflowSession,
  WorkflowResult
} from '../lib/seamlessWorkflowIntegration';

import { useStore } from '../stores/rootStore';

/**
 * Example: Complete Integration Workflow
 */
export class SeamlessIntegrationExample {
  private workflowIntegration: any;
  private currentSession: WorkflowSession | null = null;

  /**
   * Initialize the seamless integration
   */
  async initialize(): Promise<void> {
    console.log('🚀 Initializing seamless integration example...');
    
    // Get the store instance
    const store = useStore.getState();
    
    // Initialize the workflow with the store's executeTool function
    this.workflowIntegration = await initializeSeamlessWorkflow(store.executeTool);
    
    console.log('✅ Seamless integration initialized successfully');
  }

  /**
   * Create a new project session
   */
  async createProjectSession(
    projectId: string,
    conversationId: string,
    serverId: string = 'localhost-mcp'
  ): Promise<WorkflowSession> {
    console.log(`📝 Creating project session for ${projectId}...`);
    
    // Create workflow session
    this.currentSession = await createWorkflowSession(
      projectId,
      conversationId,
      serverId
    );
    
    // Initialize the session
    const initResult = await this.workflowIntegration.initializeWorkflowSession(
      this.currentSession.sessionId,
      [], // No initial files
      'wcgw' // Use wcgw mode for maximum flexibility
    );
    
    if (!initResult.success) {
      throw new Error(`Failed to initialize session: ${initResult.error}`);
    }
    
    console.log(`✅ Project session created and initialized: ${this.currentSession.sessionId}`);
    return this.currentSession;
  }

  /**
   * Execute a simple Python program creation workflow
   */
  async createPythonProgram(): Promise<WorkflowResult> {
    if (!this.currentSession) {
      throw new Error('No active session. Call createProjectSession first.');
    }

    console.log('🐍 Creating Python program...');
    
    // Step 1: Create Python file
    const createFileResult = await executeWorkflowCommand(
      this.currentSession.sessionId,
      'echo "print(\\"Hi Malik\\")" > hi_malik.py',
      { autoCommit: false, branchThreshold: 2 }
    );
    
    if (!createFileResult.success) {
      return createFileResult;
    }
    
    // Step 2: Test the program
    const testResult = await executeWorkflowCommand(
      this.currentSession.sessionId,
      'python3 hi_malik.py',
      { autoCommit: false, branchThreshold: 2 }
    );
    
    if (!testResult.success) {
      return testResult;
    }
    
    // Step 3: Create multiple README files as requested
    const readmeResult = await createReadmeFiles(
      this.currentSession.sessionId,
      3,
      'malik is very cute'
    );
    
    if (!readmeResult.success) {
      return readmeResult;
    }
    
    console.log('✅ Python program and README files created successfully');
    return {
      success: true,
      result: 'Python program created and README files generated',
      filesChanged: [
        'hi_malik.py',
        ...(readmeResult.filesChanged || [])
      ],
      branchCreated: readmeResult.branchCreated,
      sessionUpdated: readmeResult.sessionUpdated,
      needsUserInput: false
    };
  }

  /**
   * Execute a directory setup workflow
   */
  async setupProjectDirectory(): Promise<WorkflowResult> {
    if (!this.currentSession) {
      throw new Error('No active session. Call createProjectSession first.');
    }

    console.log('📁 Setting up project directory...');
    
    // Step 1: Create project structure
    const setupResult = await executeWorkflowCommand(
      this.currentSession.sessionId,
      'mkdir -p src tests docs && touch src/__init__.py tests/__init__.py docs/README.md',
      { autoCommit: false, branchThreshold: 2 }
    );
    
    if (!setupResult.success) {
      return setupResult;
    }
    
    // Step 2: Initialize git repository
    const gitResult = await executeWorkflowCommand(
      this.currentSession.sessionId,
      'git init && git add . && git commit -m "Initial commit"',
      { autoCommit: true, branchThreshold: 1 }
    );
    
    if (!gitResult.success) {
      return gitResult;
    }
    
    // Step 3: Create project files
    const projectFilesResult = await executeWorkflowCommand(
      this.currentSession.sessionId,
      'echo "# Project" > README.md && echo "print(\\"Hello World\\")" > src/main.py',
      { autoCommit: true, branchThreshold: 2 }
    );
    
    console.log('✅ Project directory setup completed');
    return {
      success: true,
      result: 'Project directory structure created with git initialization',
      filesChanged: [
        'src/', 'tests/', 'docs/',
        'src/__init__.py', 'tests/__init__.py', 'docs/README.md',
        'README.md', 'src/main.py'
      ],
      branchCreated: projectFilesResult.branchCreated,
      sessionUpdated: projectFilesResult.sessionUpdated,
      needsUserInput: false
    };
  }

  /**
   * Execute a complex workflow with error handling
   */
  async executeComplexWorkflow(): Promise<WorkflowResult> {
    if (!this.currentSession) {
      throw new Error('No active session. Call createProjectSession first.');
    }

    console.log('🔄 Executing complex workflow...');
    
    try {
      // Step 1: Setup environment
      const envResult = await executeWorkflowCommand(
        this.currentSession.sessionId,
        'pwd && ls -la',
        { autoCommit: false, retryOnError: true }
      );
      
      if (!envResult.success) {
        return envResult;
      }
      
      // Step 2: Create multiple files
      const commands = [
        'echo "# Main Application" > app.py',
        'echo "# Configuration" > config.py',
        'echo "# Utilities" > utils.py',
        'echo "# Tests" > test_app.py'
      ];
      
      const results: WorkflowResult[] = [];
      
      for (const command of commands) {
        const result = await executeWorkflowCommand(
          this.currentSession.sessionId,
          command,
          { autoCommit: false, retryOnError: true }
        );
        
        results.push(result);
        
        if (!result.success) {
          console.error(`❌ Command failed: ${command}`);
          return result;
        }
      }
      
      // Step 3: Create auto-commit for all changes
      const allFiles = results.flatMap(r => r.filesChanged || []);
      const commitResult = await executeWorkflowCommand(
        this.currentSession.sessionId,
        'git add . && git commit -m "Add application files"',
        { autoCommit: true, branchThreshold: 1 }
      );
      
      console.log('✅ Complex workflow completed successfully');
      return {
        success: true,
        result: 'Complex workflow completed with multiple files created',
        filesChanged: allFiles,
        branchCreated: commitResult.branchCreated,
        sessionUpdated: commitResult.sessionUpdated,
        needsUserInput: false
      };
      
    } catch (error) {
      console.error('❌ Complex workflow failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        needsUserInput: true
      };
    }
  }

  /**
   * Check session status
   */
  async checkStatus(): Promise<WorkflowResult> {
    if (!this.currentSession) {
      throw new Error('No active session. Call createProjectSession first.');
    }

    return await this.workflowIntegration.checkSessionStatus(this.currentSession.sessionId);
  }

  /**
   * Get session statistics
   */
  async getStatistics(): Promise<any> {
    return await this.workflowIntegration.getStatistics();
  }

  /**
   * Get current session info
   */
  getCurrentSession(): WorkflowSession | null {
    return this.currentSession;
  }
}

/**
 * Example usage demonstration
 */
export const demonstrateSeamlessIntegration = async (): Promise<void> => {
  console.log('🎯 Starting seamless integration demonstration...');
  
  try {
    // Initialize the example
    const example = new SeamlessIntegrationExample();
    await example.initialize();
    
    // Create a project session
    const session = await example.createProjectSession(
      'demo-project-id',
      'demo-conversation-id',
      'localhost-mcp'
    );
    
    console.log('📊 Session created:', {
      sessionId: session.sessionId,
      projectId: session.projectId,
      conversationId: session.conversationId,
      workflowState: session.workflowState
    });
    
    // Execute Python program creation
    const pythonResult = await example.createPythonProgram();
    console.log('🐍 Python program result:', {
      success: pythonResult.success,
      filesChanged: pythonResult.filesChanged,
      branchCreated: pythonResult.branchCreated?.branchName
    });
    
    // Setup project directory
    const setupResult = await example.setupProjectDirectory();
    console.log('📁 Directory setup result:', {
      success: setupResult.success,
      filesChanged: setupResult.filesChanged?.length,
      branchCreated: setupResult.branchCreated?.branchName
    });
    
    // Execute complex workflow
    const complexResult = await example.executeComplexWorkflow();
    console.log('🔄 Complex workflow result:', {
      success: complexResult.success,
      filesChanged: complexResult.filesChanged?.length,
      branchCreated: complexResult.branchCreated?.branchName
    });
    
    // Check final status
    const statusResult = await example.checkStatus();
    console.log('📊 Final status:', statusResult);
    
    // Get statistics
    const stats = await example.getStatistics();
    console.log('📈 Statistics:', stats);
    
    console.log('🎉 Seamless integration demonstration completed successfully!');
    
  } catch (error) {
    console.error('❌ Demonstration failed:', error);
    throw error;
  }
};

/**
 * Export for use in components
 */
export const useSeamlessIntegration = () => {
  return new SeamlessIntegrationExample();
};

/**
 * React hook for seamless integration
 */
export const useSeamlessWorkflow = () => {
  const store = useStore();
  
  const initialize = async () => {
    const example = new SeamlessIntegrationExample();
    await example.initialize();
    return example;
  };
  
  const createSession = async (projectId: string, conversationId: string) => {
    const example = await initialize();
    return await example.createProjectSession(projectId, conversationId);
  };
  
  const executeCommand = async (
    sessionId: string,
    command: string,
    options: any = {}
  ) => {
    return await executeWorkflowCommand(sessionId, command, options);
  };
  
  return {
    initialize,
    createSession,
    executeCommand,
    createReadmeFiles,
    demonstrateSeamlessIntegration
  };
}; 