/**
 * System Diagnostics Utility
 * 
 * Provides health monitoring and diagnostics for the Kibitz system
 * to help prevent cascading failures and timeout issues.
 */

export interface SystemHealth {
  websocketConnections: {
    serverId: string;
    state: string;
    status: string;
  }[];
  activeInitializations: {
    projectId: string;
    timestamp: number;
    age: number;
  }[];
  recentErrors: {
    type: string;
    message: string;
    timestamp: number;
  }[];
  recommendations: string[];
}

/**
 * Performance monitoring for system health
 */
export class SystemDiagnostics {
  private static instance: SystemDiagnostics;
  private errors: Array<{ type: string; message: string; timestamp: number }> = [];
  private maxErrors = 50;

  static getInstance(): SystemDiagnostics {
    if (!SystemDiagnostics.instance) {
      SystemDiagnostics.instance = new SystemDiagnostics();
    }
    return SystemDiagnostics.instance;
  }

  /**
   * Record a system error for diagnostics
   */
  recordError(type: string, message: string): void {
    this.errors.unshift({
      type,
      message,
      timestamp: Date.now()
    });

    // Keep only recent errors
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(0, this.maxErrors);
    }
  }

  /**
   * Get recent errors within time window
   */
  getRecentErrors(windowMs: number = 60000): Array<{ type: string; message: string; timestamp: number }> {
    const cutoff = Date.now() - windowMs;
    return this.errors.filter(error => error.timestamp > cutoff);
  }

  /**
   * Check if system is experiencing cascading failures
   */
  isSystemUnhealthy(): boolean {
    const recentErrors = this.getRecentErrors(30000); // Last 30 seconds
    
    // Too many errors in short time
    if (recentErrors.length > 10) {
      return true;
    }

    // Too many timeout errors
    const timeoutErrors = recentErrors.filter(e => 
      e.message.includes('timeout') || e.message.includes('Initialize timeout')
    );
    if (timeoutErrors.length > 3) {
      return true;
    }

    // Too many WebSocket errors
    const wsErrors = recentErrors.filter(e => 
      e.message.includes('WebSocket') || e.message.includes('CLOSING')
    );
    if (wsErrors.length > 5) {
      return true;
    }

    return false;
  }

  /**
   * Get system health recommendations
   */
  getHealthRecommendations(): string[] {
    const recommendations: string[] = [];
    const recentErrors = this.getRecentErrors(60000);

    if (recentErrors.length > 20) {
      recommendations.push('System experiencing high error rate - consider refreshing the page');
    }

    const timeoutErrors = recentErrors.filter(e => 
      e.message.includes('timeout') || e.message.includes('Initialize timeout')
    );
    if (timeoutErrors.length > 5) {
      recommendations.push('Multiple timeout errors detected - check MCP server connection');
    }

    const wsErrors = recentErrors.filter(e => 
      e.message.includes('WebSocket') || e.message.includes('CLOSING')
    );
    if (wsErrors.length > 8) {
      recommendations.push('WebSocket connection unstable - reconnection may be needed');
    }

    const gitErrors = recentErrors.filter(e => 
      e.message.includes('git') || e.message.includes('newline')
    );
    if (gitErrors.length > 3) {
      recommendations.push('Git command errors detected - check project directory setup');
    }

    return recommendations;
  }

  /**
   * Clear diagnostic data
   */
  clearDiagnostics(): void {
    this.errors = [];
  }
}

/**
 * Global error handler for system diagnostics
 */
export const recordSystemError = (type: string, error: any): void => {
  const diagnostics = SystemDiagnostics.getInstance();
  const message = error instanceof Error ? error.message : String(error);
  diagnostics.recordError(type, message);
  
  // Log to console for debugging
  console.error(`[${type}]`, message);
};

/**
 * Check if operation should be throttled due to system health
 */
export const shouldThrottleOperation = (): boolean => {
  const diagnostics = SystemDiagnostics.getInstance();
  return diagnostics.isSystemUnhealthy();
}; 