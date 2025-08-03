/**
 * Debug Storage Service
 * 
 * This service helps with debugging by providing persistent storage
 * for auto-commit events, file changes, and system state.
 */

export interface DebugLogEntry {
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'debug';
  category: 'auto-commit' | 'file-change' | 'branch' | 'git' | 'system';
  message: string;
  data?: any;
  projectId?: string;
  conversationId?: string;
}

export interface AutoCommitEvent {
  timestamp: number;
  projectId: string;
  projectPath: string;
  trigger: string;
  toolName: string;
  filesChanged: string[];
  success: boolean;
  error?: string;
  commitHash?: string;
  branchName?: string;
}

export interface FileChangeEvent {
  timestamp: number;
  projectId: string;
  filePath: string;
  action: 'created' | 'modified' | 'deleted';
  toolName: string;
  tracked: boolean;
}

export interface SystemStateSnapshot {
  timestamp: number;
  projectId: string;
  projectName: string;
  projectPath: string;
  autoCommitEnabled: boolean;
  pendingChanges: number;
  lastCommitTime: number | null;
  activeBranch: string;
  gitStatus: string;
  mcpServerStatus: string;
}

class DebugStorageService {
  private readonly MAX_LOGS = 1000;
  private readonly MAX_EVENTS = 500;
  private readonly STORAGE_PREFIX = 'kibitz_debug_';

  // 📝 Log Management
  logDebugEvent(entry: DebugLogEntry): void {
    const logs = this.getDebugLogs();
    logs.push(entry);
    
    // Keep only recent logs
    if (logs.length > this.MAX_LOGS) {
      logs.splice(0, logs.length - this.MAX_LOGS);
    }
    
    localStorage.setItem(`${this.STORAGE_PREFIX}logs`, JSON.stringify(logs));
  }

  getDebugLogs(category?: string): DebugLogEntry[] {
    try {
      const logs = JSON.parse(localStorage.getItem(`${this.STORAGE_PREFIX}logs`) || '[]');
      return category ? logs.filter((log: DebugLogEntry) => log.category === category) : logs;
    } catch (error) {
      console.error('Failed to get debug logs:', error);
      return [];
    }
  }

  // 🎯 Auto-Commit Event Management
  logAutoCommitEvent(event: AutoCommitEvent): void {
    const events = this.getAutoCommitEvents();
    events.push(event);
    
    // Keep only recent events
    if (events.length > this.MAX_EVENTS) {
      events.splice(0, events.length - this.MAX_EVENTS);
    }
    
    localStorage.setItem(`${this.STORAGE_PREFIX}auto_commits`, JSON.stringify(events));
    
    // Also log as debug entry
    this.logDebugEvent({
      timestamp: event.timestamp,
      level: event.success ? 'info' : 'error',
      category: 'auto-commit',
      message: `Auto-commit ${event.success ? 'succeeded' : 'failed'} for ${event.filesChanged.length} files`,
      data: event,
      projectId: event.projectId
    });
  }

  getAutoCommitEvents(projectId?: string): AutoCommitEvent[] {
    try {
      const events = JSON.parse(localStorage.getItem(`${this.STORAGE_PREFIX}auto_commits`) || '[]');
      return projectId ? events.filter((event: AutoCommitEvent) => event.projectId === projectId) : events;
    } catch (error) {
      console.error('Failed to get auto-commit events:', error);
      return [];
    }
  }

  // 📁 File Change Event Management
  logFileChangeEvent(event: FileChangeEvent): void {
    const events = this.getFileChangeEvents();
    events.push(event);
    
    // Keep only recent events
    if (events.length > this.MAX_EVENTS) {
      events.splice(0, events.length - this.MAX_EVENTS);
    }
    
    localStorage.setItem(`${this.STORAGE_PREFIX}file_changes`, JSON.stringify(events));
    
    // Also log as debug entry
    this.logDebugEvent({
      timestamp: event.timestamp,
      level: 'info',
      category: 'file-change',
      message: `File ${event.action}: ${event.filePath} (tracked: ${event.tracked})`,
      data: event,
      projectId: event.projectId
    });
  }

  getFileChangeEvents(projectId?: string): FileChangeEvent[] {
    try {
      const events = JSON.parse(localStorage.getItem(`${this.STORAGE_PREFIX}file_changes`) || '[]');
      return projectId ? events.filter((event: FileChangeEvent) => event.projectId === projectId) : events;
    } catch (error) {
      console.error('Failed to get file change events:', error);
      return [];
    }
  }

  // 📊 System State Management
  saveSystemStateSnapshot(snapshot: SystemStateSnapshot): void {
    const snapshots = this.getSystemStateSnapshots();
    snapshots.push(snapshot);
    
    // Keep only recent snapshots (last 100)
    if (snapshots.length > 100) {
      snapshots.splice(0, snapshots.length - 100);
    }
    
    localStorage.setItem(`${this.STORAGE_PREFIX}system_state`, JSON.stringify(snapshots));
  }

  getSystemStateSnapshots(projectId?: string): SystemStateSnapshot[] {
    try {
      const snapshots = JSON.parse(localStorage.getItem(`${this.STORAGE_PREFIX}system_state`) || '[]');
      return projectId ? snapshots.filter((snapshot: SystemStateSnapshot) => snapshot.projectId === projectId) : snapshots;
    } catch (error) {
      console.error('Failed to get system state snapshots:', error);
      return [];
    }
  }

  // 🔍 Debug Utilities
  getDebugSummary(projectId?: string): any {
    const summary = {
      totalLogs: this.getDebugLogs().length,
      totalAutoCommits: this.getAutoCommitEvents(projectId).length,
      totalFileChanges: this.getFileChangeEvents(projectId).length,
      totalSnapshots: this.getSystemStateSnapshots(projectId).length,
      recentErrors: this.getDebugLogs('system').filter(log => log.level === 'error').slice(-5),
      lastAutoCommit: this.getAutoCommitEvents(projectId).slice(-1)[0],
      lastFileChange: this.getFileChangeEvents(projectId).slice(-1)[0],
      lastSnapshot: this.getSystemStateSnapshots(projectId).slice(-1)[0]
    };
    
    return summary;
  }

  // 📤 Export Debug Data
  exportDebugData(projectId?: string): any {
    return {
      timestamp: Date.now(),
      projectId: projectId,
      logs: this.getDebugLogs(),
      autoCommitEvents: this.getAutoCommitEvents(projectId),
      fileChangeEvents: this.getFileChangeEvents(projectId),
      systemStateSnapshots: this.getSystemStateSnapshots(projectId),
      summary: this.getDebugSummary(projectId)
    };
  }

  // 🧹 Cleanup
  clearDebugData(category?: string): void {
    if (category) {
      localStorage.removeItem(`${this.STORAGE_PREFIX}${category}`);
    } else {
      // Clear all debug data
      const keys = Object.keys(localStorage).filter(key => key.startsWith(this.STORAGE_PREFIX));
      keys.forEach(key => localStorage.removeItem(key));
    }
  }

  // 📊 Statistics
  getStatistics(): any {
    const logs = this.getDebugLogs();
    const autoCommits = this.getAutoCommitEvents();
    const fileChanges = this.getFileChangeEvents();
    
    return {
      totalLogs: logs.length,
      logsByCategory: {
        'auto-commit': logs.filter(log => log.category === 'auto-commit').length,
        'file-change': logs.filter(log => log.category === 'file-change').length,
        'branch': logs.filter(log => log.category === 'branch').length,
        'git': logs.filter(log => log.category === 'git').length,
        'system': logs.filter(log => log.category === 'system').length
      },
      autoCommitStats: {
        total: autoCommits.length,
        successful: autoCommits.filter(event => event.success).length,
        failed: autoCommits.filter(event => !event.success).length,
        averageFilesChanged: autoCommits.reduce((sum, event) => sum + event.filesChanged.length, 0) / autoCommits.length || 0
      },
      fileChangeStats: {
        total: fileChanges.length,
        tracked: fileChanges.filter(event => event.tracked).length,
        untracked: fileChanges.filter(event => !event.tracked).length,
        byAction: {
          created: fileChanges.filter(event => event.action === 'created').length,
          modified: fileChanges.filter(event => event.action === 'modified').length,
          deleted: fileChanges.filter(event => event.action === 'deleted').length
        }
      }
    };
  }
}

// 🌐 Global instance
export const debugStorage = new DebugStorageService();

// 🔧 Helper function to easily log from anywhere
export function logDebug(
  level: 'info' | 'warn' | 'error' | 'debug',
  category: 'auto-commit' | 'file-change' | 'branch' | 'git' | 'system',
  message: string,
  data?: any,
  projectId?: string,
  conversationId?: string
): void {
  debugStorage.logDebugEvent({
    timestamp: Date.now(),
    level,
    category,
    message,
    data,
    projectId,
    conversationId
  });
}

// 🎯 Auto-commit specific helper
export function logAutoCommit(
  projectId: string,
  projectPath: string,
  trigger: string,
  toolName: string,
  filesChanged: string[],
  success: boolean,
  error?: string,
  commitHash?: string,
  branchName?: string
): void {
  debugStorage.logAutoCommitEvent({
    timestamp: Date.now(),
    projectId,
    projectPath,
    trigger,
    toolName,
    filesChanged,
    success,
    error,
    commitHash,
    branchName
  });
}

// 📁 File change specific helper
export function logFileChange(
  projectId: string,
  filePath: string,
  action: 'created' | 'modified' | 'deleted',
  toolName: string,
  tracked: boolean
): void {
  debugStorage.logFileChangeEvent({
    timestamp: Date.now(),
    projectId,
    filePath,
    action,
    toolName,
    tracked
  });
}

// 📊 System state helper
export function logSystemState(
  projectId: string,
  projectName: string,
  projectPath: string,
  autoCommitEnabled: boolean,
  pendingChanges: number,
  lastCommitTime: number | null,
  activeBranch: string,
  gitStatus: string,
  mcpServerStatus: string
): void {
  debugStorage.saveSystemStateSnapshot({
    timestamp: Date.now(),
    projectId,
    projectName,
    projectPath,
    autoCommitEnabled,
    pendingChanges,
    lastCommitTime,
    activeBranch,
    gitStatus,
    mcpServerStatus
  });
}

// 🌐 Make available globally for debugging
if (typeof window !== 'undefined') {
  (window as any).debugStorage = debugStorage;
  (window as any).logDebug = logDebug;
  (window as any).logAutoCommit = logAutoCommit;
  (window as any).logFileChange = logFileChange;
  (window as any).logSystemState = logSystemState;
} 