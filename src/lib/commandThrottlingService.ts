/**
 * Command Throttling Service for Kibitz
 * 
 * Handles high BashCommand load by:
 * - Request queuing and rate limiting
 * - Command prioritization
 * - Automatic retry with backoff
 * - Circuit breaker pattern
 */

import { generateWorkspaceId } from './conversationWorkspaceService';

export interface ThrottledCommand {
  id: string;
  command: string;
  projectPath: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>;
  resolve: (result: any) => void;
  reject: (error: Error) => void;
  createdAt: number;
  retryCount: number;
  maxRetries: number;
}

export interface ThrottleConfig {
  maxConcurrentCommands: number;
  maxQueueSize: number;
  commandTimeout: number;
  retryDelay: number;
  circuitBreakerThreshold: number;
  circuitBreakerTimeout: number;
}

export interface ThrottleStatistics {
  totalRequests: number;
  completedRequests: number;
  failedRequests: number;
  queueSize: number;
  activeCommands: number;
  averageResponseTime: number;
  circuitBreakerOpen: boolean;
}

/**
 * Command Throttling Service
 */
export class CommandThrottlingService {
  private static instance: CommandThrottlingService | null = null;
  private commandQueue: ThrottledCommand[] = [];
  private activeCommands: Map<string, ThrottledCommand> = new Map();
  private statistics: ThrottleStatistics = {
    totalRequests: 0,
    completedRequests: 0,
    failedRequests: 0,
    queueSize: 0,
    activeCommands: 0,
    averageResponseTime: 0,
    circuitBreakerOpen: false
  };
  private config: ThrottleConfig = {
    maxConcurrentCommands: 5,     // Reduced from unlimited
    maxQueueSize: 50,             // Prevent memory issues
    commandTimeout: 30000,        // 30 second timeout
    retryDelay: 1000,             // 1 second retry delay
    circuitBreakerThreshold: 10,  // 10 failures to open circuit
    circuitBreakerTimeout: 30000  // 30 second circuit breaker timeout
  };
  private circuitBreakerFailures = 0;
  private circuitBreakerOpenTime = 0;
  private isProcessing = false;
  private responseTimes: number[] = [];

  private constructor() {}

  static getInstance(): CommandThrottlingService {
    if (!CommandThrottlingService.instance) {
      CommandThrottlingService.instance = new CommandThrottlingService();
    }
    return CommandThrottlingService.instance;
  }

  /**
   * Initialize the throttling service
   */
  async initialize(config?: Partial<ThrottleConfig>): Promise<void> {
    if (config) {
      this.config = { ...this.config, ...config };
    }

    // Start processing queue
    this.startQueueProcessor();
    
    // Start statistics updater
    this.startStatisticsUpdater();
    
    console.log('✅ Command throttling service initialized');
  }

  /**
   * Execute a BashCommand with throttling
   */
  async executeThrottledCommand(
    projectPath: string,
    command: string,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>,
    options: {
      priority?: 'low' | 'medium' | 'high' | 'urgent';
      timeout?: number;
      maxRetries?: number;
    } = {}
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      // Check circuit breaker
      if (this.isCircuitBreakerOpen()) {
        reject(new Error('Circuit breaker is open - too many failures'));
        return;
      }

      // Check queue capacity
      if (this.commandQueue.length >= this.config.maxQueueSize) {
        reject(new Error('Command queue is full'));
        return;
      }

      // Create throttled command
      const throttledCommand: ThrottledCommand = {
        id: generateWorkspaceId(),
        command,
        projectPath,
        priority: options.priority || 'medium',
        executeTool,
        resolve,
        reject,
        createdAt: Date.now(),
        retryCount: 0,
        maxRetries: options.maxRetries || 3
      };

      // Add to queue
      this.addToQueue(throttledCommand);
      this.statistics.totalRequests++;

      // Start processing if not already running
      if (!this.isProcessing) {
        this.processQueue();
      }
    });
  }

  /**
   * Add command to queue with priority ordering
   */
  private addToQueue(command: ThrottledCommand): void {
    const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
    
    // Find insertion point based on priority
    let insertIndex = this.commandQueue.length;
    for (let i = 0; i < this.commandQueue.length; i++) {
      if (priorityOrder[command.priority] > priorityOrder[this.commandQueue[i].priority]) {
        insertIndex = i;
        break;
      }
    }
    
    this.commandQueue.splice(insertIndex, 0, command);
    this.updateStatistics();
  }

  /**
   * Process the command queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      while (this.commandQueue.length > 0 && this.activeCommands.size < this.config.maxConcurrentCommands) {
        const command = this.commandQueue.shift();
        if (!command) break;

        // Check if command is too old
        if (Date.now() - command.createdAt > this.config.commandTimeout) {
          command.reject(new Error('Command timeout in queue'));
          this.statistics.failedRequests++;
          continue;
        }

        // Execute command
        this.executeCommand(command);
      }
    } finally {
      this.isProcessing = false;
      this.updateStatistics();
    }

    // Continue processing if there are more commands
    if (this.commandQueue.length > 0) {
      setTimeout(() => this.processQueue(), 100);
    }
  }

  /**
   * Execute a single command
   */
  private async executeCommand(command: ThrottledCommand): Promise<void> {
    this.activeCommands.set(command.id, command);
    const startTime = Date.now();

    try {
      console.log(`🔄 Executing throttled command: ${command.command.substring(0, 50)}...`);

      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Command timeout: ${command.command}`));
        }, this.config.commandTimeout);
      });

      // Execute command with timeout
      const commandPromise = this.executeBashCommand(
        command.projectPath,
        command.command,
        command.executeTool
      );

      const result = await Promise.race([commandPromise, timeoutPromise]);
      
      // Success
      const responseTime = Date.now() - startTime;
      this.recordResponseTime(responseTime);
      this.resetCircuitBreaker();
      
      command.resolve(result);
      this.statistics.completedRequests++;
      
      console.log(`✅ Throttled command completed in ${responseTime}ms`);

    } catch (error) {
      console.error(`❌ Throttled command failed:`, error);
      
      // Increment circuit breaker failures
      this.circuitBreakerFailures++;
      
      // Check if we should retry
      if (command.retryCount < command.maxRetries) {
        command.retryCount++;
        console.log(`🔄 Retrying command (attempt ${command.retryCount}/${command.maxRetries})`);
        
        // Add back to queue with delay
        setTimeout(() => {
          this.addToQueue(command);
          this.processQueue();
        }, this.config.retryDelay * command.retryCount);
      } else {
        // Max retries reached
        command.reject(error instanceof Error ? error : new Error(String(error)));
        this.statistics.failedRequests++;
      }
    } finally {
      this.activeCommands.delete(command.id);
      this.updateStatistics();
    }
  }

  /**
   * Execute BashCommand with proper formatting
   */
  private async executeBashCommand(
    projectPath: string,
    command: string,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
  ): Promise<string> {
    const fullCommand = `cd "${projectPath}" && ${command}`;
    
    return await executeTool('localhost-mcp', 'BashCommand', {
      action_json: {
        command: fullCommand,
        type: 'command'
      },
      thread_id: `throttled_${Date.now()}`
    });
  }

  /**
   * Circuit breaker logic
   */
  private isCircuitBreakerOpen(): boolean {
    // Check if circuit breaker should be opened
    if (this.circuitBreakerFailures >= this.config.circuitBreakerThreshold) {
      if (this.circuitBreakerOpenTime === 0) {
        this.circuitBreakerOpenTime = Date.now();
        this.statistics.circuitBreakerOpen = true;
        console.log('⚠️ Circuit breaker opened due to too many failures');
      }
      
      // Check if circuit breaker timeout has passed
      if (Date.now() - this.circuitBreakerOpenTime > this.config.circuitBreakerTimeout) {
        this.resetCircuitBreaker();
        return false;
      }
      
      return true;
    }
    
    return false;
  }

  /**
   * Reset circuit breaker
   */
  private resetCircuitBreaker(): void {
    if (this.circuitBreakerOpenTime > 0) {
      console.log('✅ Circuit breaker reset');
    }
    this.circuitBreakerFailures = 0;
    this.circuitBreakerOpenTime = 0;
    this.statistics.circuitBreakerOpen = false;
  }

  /**
   * Record response time for statistics
   */
  private recordResponseTime(responseTime: number): void {
    this.responseTimes.push(responseTime);
    
    // Keep only last 100 response times
    if (this.responseTimes.length > 100) {
      this.responseTimes.shift();
    }
    
    // Calculate average response time
    this.statistics.averageResponseTime = 
      this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length;
  }

  /**
   * Update statistics
   */
  private updateStatistics(): void {
    this.statistics.queueSize = this.commandQueue.length;
    this.statistics.activeCommands = this.activeCommands.size;
  }

  /**
   * Start statistics updater
   */
  private startStatisticsUpdater(): void {
    setInterval(() => {
      this.updateStatistics();
      
      // Log statistics every 30 seconds if there's activity
      if (this.statistics.totalRequests > 0 && this.statistics.totalRequests % 10 === 0) {
        console.log('📊 Command throttling statistics:', {
          totalRequests: this.statistics.totalRequests,
          completedRequests: this.statistics.completedRequests,
          failedRequests: this.statistics.failedRequests,
          queueSize: this.statistics.queueSize,
          activeCommands: this.statistics.activeCommands,
          averageResponseTime: Math.round(this.statistics.averageResponseTime),
          circuitBreakerOpen: this.statistics.circuitBreakerOpen
        });
      }
    }, 5000);
  }

  /**
   * Start queue processor
   */
  private startQueueProcessor(): void {
    setInterval(() => {
      if (!this.isProcessing && this.commandQueue.length > 0) {
        this.processQueue();
      }
    }, 1000);
  }

  /**
   * Get current statistics
   */
  getStatistics(): ThrottleStatistics {
    return { ...this.statistics };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ThrottleConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('🔧 Updated throttling configuration:', this.config);
  }

  /**
   * Clear queue (emergency function)
   */
  clearQueue(): void {
    const clearedCount = this.commandQueue.length;
    this.commandQueue.forEach(command => {
      command.reject(new Error('Queue cleared'));
    });
    this.commandQueue = [];
    this.updateStatistics();
    console.log(`🧹 Cleared ${clearedCount} commands from queue`);
  }

  /**
   * Get queue status
   */
  getQueueStatus(): {
    queueSize: number;
    activeCommands: number;
    priorityBreakdown: { [key: string]: number };
    oldestCommand: number;
  } {
    const priorityBreakdown = { urgent: 0, high: 0, medium: 0, low: 0 };
    let oldestCommand = 0;

    this.commandQueue.forEach(command => {
      priorityBreakdown[command.priority]++;
      if (oldestCommand === 0 || command.createdAt < oldestCommand) {
        oldestCommand = command.createdAt;
      }
    });

    return {
      queueSize: this.commandQueue.length,
      activeCommands: this.activeCommands.size,
      priorityBreakdown,
      oldestCommand: oldestCommand ? Date.now() - oldestCommand : 0
    };
  }
}

// Convenience functions
export const getCommandThrottlingService = (): CommandThrottlingService => {
  return CommandThrottlingService.getInstance();
};

export const initializeCommandThrottling = async (config?: Partial<ThrottleConfig>): Promise<CommandThrottlingService> => {
  const service = CommandThrottlingService.getInstance();
  await service.initialize(config);
  return service;
};

// Hook for React components
export const useCommandThrottling = () => {
  const service = getCommandThrottlingService();

  const executeCommand = async (
    projectPath: string,
    command: string,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>,
    options?: {
      priority?: 'low' | 'medium' | 'high' | 'urgent';
      timeout?: number;
      maxRetries?: number;
    }
  ) => {
    return await service.executeThrottledCommand(projectPath, command, executeTool, options);
  };

  const getStatistics = () => {
    return service.getStatistics();
  };

  const getQueueStatus = () => {
    return service.getQueueStatus();
  };

  const clearQueue = () => {
    return service.clearQueue();
  };

  return {
    executeCommand,
    getStatistics,
    getQueueStatus,
    clearQueue
  };
}; 