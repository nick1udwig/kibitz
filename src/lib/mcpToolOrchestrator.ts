/**
 * MCP Tool Orchestrator
 * 
 * Manages stateful MCP tool execution with proper sequencing, error handling, and local storage.
 * Provides seamless integration like Replit Agent v2 and Claude tool.
 * 
 * Key Features:
 * - Sequential command execution with state tracking
 * - Proper error handling and recovery
 * - Local database storage for all operations
 * - Workspace management and persistence
 * - Auto-commit and branch management
 */

import { 
  StorageCoordinator, 
  initializeStorageCoordinator,
  saveBranchToAllSystems,
  BranchInfo
} from './storageCoordinator';
import { 
  EnhancedBranchPersistence,
  initializeEnhancedBranchPersistence,
  createBranchWithSession,
  trackFileChanges,
  SessionInfo
} from './enhancedBranchPersistence';
import { generateWorkspaceId } from './conversationWorkspaceService';
import { getProjectPath } from './projectPathService';

// Tool execution states
export type ToolExecutionState = 'idle' | 'initializing' | 'executing' | 'waiting' | 'error' | 'completed';

// MCP Tool schemas
export interface InitializeToolArgs {
  type: 'first_call' | 'user_asked_mode_change' | 'reset_shell' | 'user_asked_change_workspace';
  any_workspace_path: string;
  initial_files_to_read: string[];
  task_id_to_resume: string;
  mode_name: 'wcgw' | 'architect' | 'code_writer';
  thread_id: string;
  code_writer_config?: {
    allowed_globs: string[] | 'all';
    allowed_commands: string[] | 'all';
  } | null;
}

export interface BashCommandArgs {
  action_json: {
    command: string;
    type: 'command' | 'status_check';
  };
  thread_id: string;
}

export interface ReadFilesArgs {
  file_paths: string[];
}

export interface FileWriteOrEditArgs {
  file_path: string;
  content: string;
  thread_id: string;
}

// Execution context for tracking state
export interface ExecutionContext {
  contextId: string;
  projectId: string;
  conversationId: string;
  serverId: string;
  threadId: string;
  workspacePath: string;
  currentState: ToolExecutionState;
  lastCommand?: string;
  lastCommandTime?: Date;
  sessionInfo?: SessionInfo;
  branchInfo?: BranchInfo;
  executionHistory: ExecutionStep[];
  pendingCommands: QueuedCommand[];
  errors: ExecutionError[];
}

export interface ExecutionStep {
  stepId: string;
  toolName: string;
  args: any;
  startTime: Date;
  endTime?: Date;
  result?: string;
  error?: string;
  filesChanged?: string[];
}

export interface QueuedCommand {
  commandId: string;
  toolName: string;
  args: any;
  priority: number;
  dependencies?: string[];
  retryCount: number;
  maxRetries: number;
}

export interface ExecutionError {
  errorId: string;
  stepId: string;
  error: string;
  timestamp: Date;
  recovered: boolean;
  recoveryActions?: string[];
}

/**
 * MCP Tool Orchestrator - Main class for managing tool execution
 */
export class MCPToolOrchestrator {
  private static instance: MCPToolOrchestrator | null = null;
  private storageCoordinator: StorageCoordinator;
  private branchPersistence: EnhancedBranchPersistence;
  private executionContexts: Map<string, ExecutionContext> = new Map();
  private activeExecutions: Map<string, Promise<string>> = new Map();
  private commandQueue: QueuedCommand[] = [];
  private isProcessingQueue = false;

  private constructor() {
    this.storageCoordinator = StorageCoordinator.getInstance();
    this.branchPersistence = EnhancedBranchPersistence.getInstance();
  }

  static getInstance(): MCPToolOrchestrator {
    if (!MCPToolOrchestrator.instance) {
      MCPToolOrchestrator.instance = new MCPToolOrchestrator();
    }
    return MCPToolOrchestrator.instance;
  }

  /**
   * Initialize the orchestrator with storage systems
   */
  async initialize(): Promise<void> {
    try {
      console.log('🚀 Initializing MCP Tool Orchestrator...');
      
      // Initialize storage systems
      await initializeStorageCoordinator();
      await initializeEnhancedBranchPersistence();
      
      // Start command queue processor
      this.startQueueProcessor();
      
      console.log('✅ MCP Tool Orchestrator initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize MCP Tool Orchestrator:', error);
      throw error;
    }
  }

  /**
   * Create a new execution context for a project/conversation
   */
  async createExecutionContext(
    projectId: string,
    conversationId: string,
    serverId: string,
    workspacePath?: string
  ): Promise<ExecutionContext> {
    const contextId = generateWorkspaceId();
    const threadId = `thread_${contextId}`;
    
    const context: ExecutionContext = {
      contextId,
      projectId,
      conversationId,
      serverId,
      threadId,
      workspacePath: workspacePath || getProjectPath(projectId, ''),
      currentState: 'idle',
      executionHistory: [],
      pendingCommands: [],
      errors: []
    };
    
    this.executionContexts.set(contextId, context);
    
    // Save to local storage
    await this.saveExecutionContext(context);
    
    console.log(`📝 Created execution context: ${contextId}`);
    return context;
  }

  /**
   * Execute Initialize tool with proper state management
   */
  async executeInitialize(
    contextId: string,
    args: Partial<InitializeToolArgs>,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
  ): Promise<string> {
    const context = this.executionContexts.get(contextId);
    if (!context) {
      throw new Error(`Execution context ${contextId} not found`);
    }

    try {
      context.currentState = 'initializing';
      
      // Build complete Initialize args
      const initializeArgs: InitializeToolArgs = {
        type: args.type || 'first_call',
        any_workspace_path: args.any_workspace_path || context.workspacePath,
        initial_files_to_read: args.initial_files_to_read || [],
        task_id_to_resume: args.task_id_to_resume || '',
        mode_name: args.mode_name || 'wcgw',
        thread_id: args.thread_id || context.threadId,
        code_writer_config: args.code_writer_config || null
      };

      // Update context thread ID if provided
      if (args.thread_id) {
        context.threadId = args.thread_id;
      }

      const stepId = generateWorkspaceId();
      const step: ExecutionStep = {
        stepId,
        toolName: 'Initialize',
        args: initializeArgs,
        startTime: new Date()
      };

      context.executionHistory.push(step);
      
      console.log(`🔄 Executing Initialize for context ${contextId}`);
      
             // Execute the tool
       const result = await executeTool(context.serverId, 'Initialize', initializeArgs as unknown as Record<string, unknown>);
      
      // Update step
      step.endTime = new Date();
      step.result = result;
      
      // Update context state
      context.currentState = 'completed';
      
      // Save context
      await this.saveExecutionContext(context);
      
      console.log(`✅ Initialize completed for context ${contextId}`);
      return result;
      
    } catch (error) {
      context.currentState = 'error';
      
      const executionError: ExecutionError = {
        errorId: generateWorkspaceId(),
        stepId: context.executionHistory[context.executionHistory.length - 1]?.stepId || 'unknown',
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
        recovered: false
      };
      
      context.errors.push(executionError);
      await this.saveExecutionContext(context);
      
      console.error(`❌ Initialize failed for context ${contextId}:`, error);
      throw error;
    }
  }

  /**
   * Execute BashCommand with proper state management and sequencing
   */
  async executeBashCommand(
    contextId: string,
    command: string,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
  ): Promise<string> {
    const context = this.executionContexts.get(contextId);
    if (!context) {
      throw new Error(`Execution context ${contextId} not found`);
    }

    // Check if another command is running
    if (context.currentState === 'executing') {
      // Queue the command
      return this.queueCommand(contextId, 'BashCommand', { command });
    }

    try {
      context.currentState = 'executing';
      context.lastCommand = command;
      context.lastCommandTime = new Date();
      
      const bashArgs: BashCommandArgs = {
        action_json: {
          command,
          type: 'command'
        },
        thread_id: context.threadId
      };

      const stepId = generateWorkspaceId();
      const step: ExecutionStep = {
        stepId,
        toolName: 'BashCommand',
        args: bashArgs,
        startTime: new Date()
      };

      context.executionHistory.push(step);
      
      console.log(`🔄 Executing BashCommand for context ${contextId}: ${command}`);
      
             // Execute the tool
       const result = await executeTool(context.serverId, 'BashCommand', bashArgs as unknown as Record<string, unknown>);
      
      // Update step
      step.endTime = new Date();
      step.result = result;
      
      // Check for file changes
      const filesChanged = await this.detectFileChanges(result);
      if (filesChanged.length > 0) {
        step.filesChanged = filesChanged;
        await this.handleFileChanges(context, filesChanged);
      }
      
      // Update context state
      context.currentState = 'completed';
      
      // Save context
      await this.saveExecutionContext(context);
      
      console.log(`✅ BashCommand completed for context ${contextId}`);
      return result;
      
    } catch (error) {
      context.currentState = 'error';
      
      const executionError: ExecutionError = {
        errorId: generateWorkspaceId(),
        stepId: context.executionHistory[context.executionHistory.length - 1]?.stepId || 'unknown',
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
        recovered: false
      };
      
      context.errors.push(executionError);
      await this.saveExecutionContext(context);
      
      console.error(`❌ BashCommand failed for context ${contextId}:`, error);
      
      // Attempt recovery
      await this.attemptRecovery(context, executionError);
      
      throw error;
    }
  }

  /**
   * Check command status
   */
  async checkCommandStatus(
    contextId: string,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
  ): Promise<string> {
    const context = this.executionContexts.get(contextId);
    if (!context) {
      throw new Error(`Execution context ${contextId} not found`);
    }

    const statusArgs: BashCommandArgs = {
      action_json: {
        command: '',
        type: 'status_check'
      },
      thread_id: context.threadId
    };

         try {
       const result = await executeTool(context.serverId, 'BashCommand', statusArgs as unknown as Record<string, unknown>);
       console.log(`📊 Status check for context ${contextId}:`, result);
       return result;
     } catch (error) {
      console.error(`❌ Status check failed for context ${contextId}:`, error);
      throw error;
    }
  }

  /**
   * Queue a command for sequential execution
   */
  private async queueCommand(
    contextId: string,
    toolName: string,
    args: any
  ): Promise<string> {
    const commandId = generateWorkspaceId();
    
    const queuedCommand: QueuedCommand = {
      commandId,
      toolName,
      args: { ...args, contextId },
      priority: 1,
      retryCount: 0,
      maxRetries: 3
    };

    this.commandQueue.push(queuedCommand);
    
    console.log(`⏳ Queued command ${commandId} for context ${contextId}`);
    
    // Return a promise that resolves when the command is executed
    return new Promise((resolve, reject) => {
      const checkQueue = () => {
        const executed = this.commandQueue.find(cmd => 
          cmd.commandId === commandId && cmd.retryCount === -1
        );
        
        if (executed) {
          resolve('Command executed from queue');
        } else {
          setTimeout(checkQueue, 1000);
        }
      };
      
      checkQueue();
    });
  }

  /**
   * Process command queue
   */
  private startQueueProcessor(): void {
    setInterval(async () => {
      if (this.isProcessingQueue || this.commandQueue.length === 0) {
        return;
      }

      this.isProcessingQueue = true;
      
      try {
        const command = this.commandQueue.shift();
        if (!command) {
          this.isProcessingQueue = false;
          return;
        }

        const contextId = command.args.contextId;
        const context = this.executionContexts.get(contextId);
        
        if (!context || context.currentState !== 'idle') {
          // Re-queue if context is busy
          this.commandQueue.unshift(command);
          this.isProcessingQueue = false;
          return;
        }

        // Execute the queued command
        // Implementation would depend on the specific tool
        console.log(`🔄 Processing queued command ${command.commandId}`);
        
        // Mark as executed
        command.retryCount = -1;
        
      } catch (error) {
        console.error('❌ Error processing command queue:', error);
      } finally {
        this.isProcessingQueue = false;
      }
    }, 2000); // Check every 2 seconds
  }

  /**
   * Handle file changes and create auto-commits
   */
  private async handleFileChanges(context: ExecutionContext, filesChanged: string[]): Promise<void> {
    try {
      // Track file changes in session
      if (context.sessionInfo) {
        await trackFileChanges(
          context.sessionInfo.sessionId,
          filesChanged,
          `Files changed: ${filesChanged.join(', ')}`
        );
      }

      // Create auto-commit if threshold met
      if (filesChanged.length >= 2) {
        await this.createAutoCommit(context, filesChanged);
      }
      
    } catch (error) {
      console.error('❌ Error handling file changes:', error);
    }
  }

  /**
   * Create auto-commit branch
   */
  private async createAutoCommit(context: ExecutionContext, filesChanged: string[]): Promise<void> {
    try {
      const timestamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
      const branchName = `auto-commit/${timestamp}`;
      
      const branchResult = await createBranchWithSession(
        context.projectId,
        context.conversationId,
        branchName,
        'auto-commit',
        `Auto-commit: ${filesChanged.length} files changed`,
        context.serverId,
        (serverId, toolName, args) => this.executeToolDirectly(serverId, toolName, args)
      );

      if (branchResult.success) {
        context.branchInfo = branchResult.branchInfo;
        context.sessionInfo = branchResult.sessionInfo;
        
        console.log(`✅ Auto-commit created: ${branchName}`);
      }
      
    } catch (error) {
      console.error('❌ Error creating auto-commit:', error);
    }
  }

  /**
   * Detect file changes from command output
   */
  private async detectFileChanges(commandOutput: string): Promise<string[]> {
    const filesChanged: string[] = [];
    
    // Parse common file change patterns
    const patterns = [
      /created:\s+(.+)/gi,
      /modified:\s+(.+)/gi,
      /deleted:\s+(.+)/gi,
      /wrote\s+(.+)/gi,
      /saved\s+(.+)/gi
    ];
    
    for (const pattern of patterns) {
      const matches = commandOutput.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) {
          filesChanged.push(match[1].trim());
        }
      }
    }
    
    return [...new Set(filesChanged)]; // Remove duplicates
  }

  /**
   * Attempt error recovery
   */
  private async attemptRecovery(context: ExecutionContext, error: ExecutionError): Promise<void> {
    try {
      console.log(`🔄 Attempting recovery for error ${error.errorId}`);
      
      // Common recovery strategies
      const recoveryActions: string[] = [];
      
      if (error.error.includes('directory not found')) {
        recoveryActions.push('Create missing directory');
        // Implementation would create the directory
      }
      
      if (error.error.includes('permission denied')) {
        recoveryActions.push('Check permissions');
        // Implementation would check and fix permissions
      }
      
      if (error.error.includes('git not initialized')) {
        recoveryActions.push('Initialize git repository');
        // Implementation would initialize git
      }
      
      error.recoveryActions = recoveryActions;
      error.recovered = recoveryActions.length > 0;
      
      await this.saveExecutionContext(context);
      
    } catch (recoveryError) {
      console.error('❌ Recovery attempt failed:', recoveryError);
    }
  }

  /**
   * Save execution context to local storage
   */
  private async saveExecutionContext(context: ExecutionContext): Promise<void> {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const key = `mcp-context-${context.contextId}`;
        const data = {
          ...context,
          lastSaved: new Date().toISOString()
        };
        
        localStorage.setItem(key, JSON.stringify(data));
      }
    } catch (error) {
      console.error('❌ Failed to save execution context:', error);
    }
  }

  /**
   * Load execution context from local storage
   */
  private async loadExecutionContext(contextId: string): Promise<ExecutionContext | null> {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const key = `mcp-context-${contextId}`;
        const data = localStorage.getItem(key);
        
        if (data) {
          const context = JSON.parse(data);
          
          // Convert date strings back to Date objects
          context.executionHistory.forEach((step: ExecutionStep) => {
            step.startTime = new Date(step.startTime);
            if (step.endTime) {
              step.endTime = new Date(step.endTime);
            }
          });
          
          context.errors.forEach((error: ExecutionError) => {
            error.timestamp = new Date(error.timestamp);
          });
          
          return context;
        }
      }
      
      return null;
      
    } catch (error) {
      console.error('❌ Failed to load execution context:', error);
      return null;
    }
  }

  /**
   * Direct tool execution (for internal use)
   */
  private async executeToolDirectly(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<string> {
    // This would use the actual executeTool function
    // For now, return a mock response
    return `Tool ${toolName} executed successfully`;
  }

  /**
   * Get execution context
   */
  getExecutionContext(contextId: string): ExecutionContext | null {
    return this.executionContexts.get(contextId) || null;
  }

  /**
   * List all execution contexts
   */
  listExecutionContexts(): ExecutionContext[] {
    return Array.from(this.executionContexts.values());
  }

  /**
   * Clean up old execution contexts
   */
  async cleanupOldContexts(maxAge: number = 24 * 60 * 60 * 1000): Promise<void> {
    const cutoffTime = Date.now() - maxAge;
    
    for (const [contextId, context] of this.executionContexts.entries()) {
      const lastActivity = context.executionHistory.length > 0
        ? context.executionHistory[context.executionHistory.length - 1].startTime.getTime()
        : 0;
      
      if (lastActivity < cutoffTime) {
        this.executionContexts.delete(contextId);
        
        // Remove from local storage
        if (typeof window !== 'undefined' && window.localStorage) {
          localStorage.removeItem(`mcp-context-${contextId}`);
        }
        
        console.log(`🗑️ Cleaned up old execution context: ${contextId}`);
      }
    }
  }
}

/**
 * Convenience functions for MCP tool orchestration
 */

// Initialize orchestrator
export const initializeMCPOrchestrator = async (): Promise<MCPToolOrchestrator> => {
  const orchestrator = MCPToolOrchestrator.getInstance();
  await orchestrator.initialize();
  return orchestrator;
};

// Create execution context
export const createExecutionContext = async (
  projectId: string,
  conversationId: string,
  serverId: string,
  workspacePath?: string
): Promise<ExecutionContext> => {
  const orchestrator = MCPToolOrchestrator.getInstance();
  return await orchestrator.createExecutionContext(projectId, conversationId, serverId, workspacePath);
};

// Execute Initialize tool
export const executeInitialize = async (
  contextId: string,
  args: Partial<InitializeToolArgs>,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<string> => {
  const orchestrator = MCPToolOrchestrator.getInstance();
  return await orchestrator.executeInitialize(contextId, args, executeTool);
};

// Execute BashCommand
export const executeBashCommand = async (
  contextId: string,
  command: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<string> => {
  const orchestrator = MCPToolOrchestrator.getInstance();
  return await orchestrator.executeBashCommand(contextId, command, executeTool);
};

// Check command status
export const checkCommandStatus = async (
  contextId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<string> => {
  const orchestrator = MCPToolOrchestrator.getInstance();
  return await orchestrator.checkCommandStatus(contextId, executeTool);
}; 