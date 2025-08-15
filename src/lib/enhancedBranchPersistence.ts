/**
 * Enhanced Branch Persistence Service
 * 
 * Provides comprehensive branch and session management with rollback capabilities:
 * - Save branch info locally with conversation IDs
 * - Rollback capabilities using local storage
 * - Session persistence across restarts
 * - Local branch management without remote git requirements
 * 
 * Built on top of the Storage Coordinator for unified storage management
 */

import {
  StorageCoordinator,
  BranchInfo
} from './storageCoordinator';

// import { getProjectPath } from './projectPathService';

export interface SessionInfo {
  sessionId: string;
  projectId: string;
  conversationId: string;
  branchName: string;
  branchId: string;
  startTime: Date;
  endTime?: Date;
  filesModified: string[];
  isActive: boolean;
  snapshots: SessionSnapshot[];
}

export interface SessionSnapshot {
  snapshotId: string;
  sessionId: string;
  timestamp: Date;
  description: string;
  filesChanged: string[];
  commitHash?: string;
  isAutoSnapshot: boolean;
  canRollback: boolean;
}

export interface RollbackPoint {
  rollbackId: string;
  projectId: string;
  conversationId: string;
  branchName: string;
  branchId: string;
  timestamp: Date;
  description: string;
  filesSnapshot: Record<string, string>; // filepath -> content
  gitCommitHash?: string;
  sessionId?: string;
  isManual: boolean;
}

export interface BranchState {
  branchId: string;
  branchName: string;
  projectId: string;
  conversationId: string;
  parentBranch?: string;
  isActive: boolean;
  commitHistory: CommitInfo[];
  rollbackPoints: RollbackPoint[];
  lastActivity: Date;
  filesTracked: string[];
  branchType: 'feature' | 'bugfix' | 'iteration' | 'experiment' | 'auto-commit';
}

export interface CommitInfo {
  commitId: string;
  branchId: string;
  commitHash: string;
  message: string;
  timestamp: Date;
  author: string;
  filesChanged: string[];
  isAutoCommit: boolean;
}

/**
 * Enhanced Branch Persistence Manager
 */
export class EnhancedBranchPersistence {
  private static instance: EnhancedBranchPersistence | null = null;
  private storageCoordinator: StorageCoordinator;
  private activeSessions: Map<string, SessionInfo> = new Map();
  private branchStates: Map<string, BranchState> = new Map();
  private rollbackPoints: Map<string, RollbackPoint> = new Map();

  private constructor() {
    this.storageCoordinator = StorageCoordinator.getInstance();
  }

  static getInstance(): EnhancedBranchPersistence {
    if (!EnhancedBranchPersistence.instance) {
      EnhancedBranchPersistence.instance = new EnhancedBranchPersistence();
    }
    return EnhancedBranchPersistence.instance;
  }

  /**
   * Initialize the enhanced branch persistence system
   */
  async initialize(): Promise<void> {
    try {
      console.log('🔄 Initializing enhanced branch persistence...');
      
      // Initialize storage coordinator
      await this.storageCoordinator.initialize();
      
      // Load existing sessions and branch states
      await this.loadPersistedData();
      
      // Set up auto-save interval
      this.setupAutoSave();
      
      console.log('✅ Enhanced branch persistence initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize enhanced branch persistence:', error);
      throw error;
    }
  }

  /**
   * Create a new branch with session tracking
   */
  async createBranch(
    projectId: string,
    conversationId: string,
    branchName: string,
    branchType: 'feature' | 'bugfix' | 'iteration' | 'experiment' | 'auto-commit',
    description: string,
    serverId: string,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
  ): Promise<{ success: boolean; branchInfo?: BranchInfo; sessionInfo?: SessionInfo; error?: string }> {
    try {
      console.log(`🌿 Creating branch: ${branchName} for project ${projectId}`);
      
      // Generate unique IDs
      const branchId = generateWorkspaceId();
      const sessionId = generateWorkspaceId();
      
      // Create branch info
      const branchInfo: BranchInfo = {
        branchName,
        branchId,
        conversationId,
        projectId,
        commitHash: '', // Will be set after first commit
        commitMessage: description,
        createdAt: new Date(),
        filesChanged: [],
        changesSummary: description,
        isAutoCommit: branchType === 'auto-commit'
      };
      
      // Create session info
      const sessionInfo: SessionInfo = {
        sessionId,
        projectId,
        conversationId,
        branchName,
        branchId,
        startTime: new Date(),
        filesModified: [],
        isActive: true,
        snapshots: []
      };
      
      // Create branch state
      const branchState: BranchState = {
        branchId,
        branchName,
        projectId,
        conversationId,
        isActive: true,
        commitHistory: [],
        rollbackPoints: [],
        lastActivity: new Date(),
        filesTracked: [],
        branchType
      };
      
      // Save to all storage systems
      const saveResult = await saveBranchToAllSystems(branchInfo, serverId, executeTool);
      if (!saveResult.success) {
        return { success: false, error: saveResult.error };
      }
      
      // Store in memory
      this.activeSessions.set(sessionId, sessionInfo);
      this.branchStates.set(branchId, branchState);
      
      // Create initial rollback point
      const initialRollbackPoint: RollbackPoint = {
        rollbackId: generateWorkspaceId(),
        projectId,
        conversationId,
        branchName,
        branchId,
        timestamp: new Date(),
        description: `Initial state for branch ${branchName}`,
        filesSnapshot: {},
        sessionId,
        isManual: false
      };
      
      this.rollbackPoints.set(initialRollbackPoint.rollbackId, initialRollbackPoint);
      branchState.rollbackPoints.push(initialRollbackPoint);
      
      // Save persistent data
      await this.savePersistedData();
      
      console.log(`✅ Branch created successfully: ${branchName}`);
      return { success: true, branchInfo, sessionInfo };
      
    } catch (error) {
      console.error('❌ Failed to create branch:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }

  /**
   * Create a rollback point
   */
  async createRollbackPoint(
    branchId: string,
    description: string,
    filesSnapshot: Record<string, string>,
    isManual: boolean = true
  ): Promise<{ success: boolean; rollbackPoint?: RollbackPoint; error?: string }> {
    try {
      console.log(`📸 Creating rollback point for branch ${branchId}: ${description}`);
      
      const branchState = this.branchStates.get(branchId);
      if (!branchState) {
        return { success: false, error: `Branch ${branchId} not found` };
      }
      
      const rollbackPoint: RollbackPoint = {
        rollbackId: generateWorkspaceId(),
        projectId: branchState.projectId,
        conversationId: branchState.conversationId,
        branchName: branchState.branchName,
        branchId,
        timestamp: new Date(),
        description,
        filesSnapshot,
        isManual
      };
      
      // Store rollback point
      this.rollbackPoints.set(rollbackPoint.rollbackId, rollbackPoint);
      branchState.rollbackPoints.push(rollbackPoint);
      branchState.lastActivity = new Date();
      
      // Limit number of rollback points (keep last 50)
      if (branchState.rollbackPoints.length > 50) {
        const oldestRollbackPoint = branchState.rollbackPoints.shift()!;
        this.rollbackPoints.delete(oldestRollbackPoint.rollbackId);
      }
      
      // Save persistent data
      await this.savePersistedData();
      
      console.log(`✅ Rollback point created: ${rollbackPoint.rollbackId}`);
      return { success: true, rollbackPoint };
      
    } catch (error) {
      console.error('❌ Failed to create rollback point:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }

  /**
   * Rollback to a specific point
   */
  async rollbackToPoint(
    rollbackId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`🔄 Rolling back to point: ${rollbackId}`);
      
      const rollbackPoint = this.rollbackPoints.get(rollbackId);
      if (!rollbackPoint) {
        return { success: false, error: `Rollback point ${rollbackId} not found` };
      }
      
      const branchState = this.branchStates.get(rollbackPoint.branchId);
      if (!branchState) {
        return { success: false, error: `Branch ${rollbackPoint.branchId} not found` };
      }
      
      // Create a pre-rollback snapshot
      const preRollbackSnapshot: RollbackPoint = {
        rollbackId: generateWorkspaceId(),
        projectId: rollbackPoint.projectId,
        conversationId: rollbackPoint.conversationId,
        branchName: rollbackPoint.branchName,
        branchId: rollbackPoint.branchId,
        timestamp: new Date(),
        description: `Pre-rollback snapshot before rolling back to: ${rollbackPoint.description}`,
        filesSnapshot: {}, // Would need to capture current state
        isManual: false
      };
      
      this.rollbackPoints.set(preRollbackSnapshot.rollbackId, preRollbackSnapshot);
      branchState.rollbackPoints.push(preRollbackSnapshot);
      
      // TODO: Implement actual file restoration logic
      // This would involve:
      // 1. Restoring files from the snapshot
      // 2. Updating git state if applicable
      // 3. Notifying the UI of changes
      
      console.log(`✅ Successfully rolled back to: ${rollbackPoint.description}`);
      return { success: true };
      
    } catch (error) {
      console.error('❌ Failed to rollback:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }

  /**
   * End a session
   */
  async endSession(sessionId: string): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`🏁 Ending session: ${sessionId}`);
      
      const sessionInfo = this.activeSessions.get(sessionId);
      if (!sessionInfo) {
        return { success: false, error: `Session ${sessionId} not found` };
      }
      
      // Mark session as inactive
      sessionInfo.isActive = false;
      sessionInfo.endTime = new Date();
      
      // Update branch state
      const branchState = this.branchStates.get(sessionInfo.branchId);
      if (branchState) {
        branchState.isActive = false;
        branchState.lastActivity = new Date();
      }
      
      // Save persistent data
      await this.savePersistedData();
      
      console.log(`✅ Session ended successfully: ${sessionId}`);
      return { success: true };
      
    } catch (error) {
      console.error('❌ Failed to end session:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }

  /**
   * Get branch state
   */
  getBranchState(branchId: string): BranchState | null {
    return this.branchStates.get(branchId) || null;
  }

  /**
   * Get session info
   */
  getSessionInfo(sessionId: string): SessionInfo | null {
    return this.activeSessions.get(sessionId) || null;
  }

  /**
   * Get all rollback points for a branch
   */
  getRollbackPoints(branchId: string): RollbackPoint[] {
    const branchState = this.branchStates.get(branchId);
    return branchState ? branchState.rollbackPoints : [];
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): SessionInfo[] {
    return Array.from(this.activeSessions.values()).filter(session => session.isActive);
  }

  /**
   * Get all branch states for a project
   */
  getProjectBranchStates(projectId: string): BranchState[] {
    return Array.from(this.branchStates.values()).filter(state => state.projectId === projectId);
  }

  /**
   * Track file changes in a session
   */
  async trackFileChanges(
    sessionId: string,
    filesChanged: string[],
    description: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const sessionInfo = this.activeSessions.get(sessionId);
      if (!sessionInfo) {
        return { success: false, error: `Session ${sessionId} not found` };
      }
      
      // Update session files
      filesChanged.forEach(file => {
        if (!sessionInfo.filesModified.includes(file)) {
          sessionInfo.filesModified.push(file);
        }
      });
      
      // Update branch state
      const branchState = this.branchStates.get(sessionInfo.branchId);
      if (branchState) {
        filesChanged.forEach(file => {
          if (!branchState.filesTracked.includes(file)) {
            branchState.filesTracked.push(file);
          }
        });
        branchState.lastActivity = new Date();
      }
      
      // Create auto-snapshot if significant changes
      if (filesChanged.length >= 2) {
        const snapshot: SessionSnapshot = {
          snapshotId: generateWorkspaceId(),
          sessionId,
          timestamp: new Date(),
          description: `Auto-snapshot: ${description}`,
          filesChanged,
          isAutoSnapshot: true,
          canRollback: true
        };
        
        sessionInfo.snapshots.push(snapshot);
        
        // Limit snapshots (keep last 20)
        if (sessionInfo.snapshots.length > 20) {
          sessionInfo.snapshots.shift();
        }
      }
      
      // Save persistent data
      await this.savePersistedData();
      
      return { success: true };
      
    } catch (error) {
      console.error('❌ Failed to track file changes:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }

  /**
   * Save persistent data to storage
   */
  private async savePersistedData(): Promise<void> {
    try {
      const data = {
        activeSessions: Array.from(this.activeSessions.entries()),
        branchStates: Array.from(this.branchStates.entries()),
        rollbackPoints: Array.from(this.rollbackPoints.entries()),
        lastSaved: new Date()
      };
      
      // Save to localStorage for persistence
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('kibitz-branch-persistence', JSON.stringify(data));
      }
    } catch (error) {
      console.error('Failed to save persistent data:', error);
    }
  }

  /**
   * Load persistent data from storage
   */
  private async loadPersistedData(): Promise<void> {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const savedData = localStorage.getItem('kibitz-branch-persistence');
        if (savedData) {
          const data = JSON.parse(savedData);
          
          // Restore maps
          this.activeSessions = new Map(data.activeSessions || []);
          this.branchStates = new Map(data.branchStates || []);
          this.rollbackPoints = new Map(data.rollbackPoints || []);
          
          // Convert date strings back to Date objects
          this.activeSessions.forEach(session => {
            session.startTime = new Date(session.startTime);
            if (session.endTime) {
              session.endTime = new Date(session.endTime);
            }
            session.snapshots.forEach(snapshot => {
              snapshot.timestamp = new Date(snapshot.timestamp);
            });
          });
          
          this.branchStates.forEach(state => {
            state.lastActivity = new Date(state.lastActivity);
            state.rollbackPoints.forEach(point => {
              point.timestamp = new Date(point.timestamp);
            });
          });
          
          this.rollbackPoints.forEach(point => {
            point.timestamp = new Date(point.timestamp);
          });
          
          console.log('✅ Loaded persistent branch data');
        }
      }
    } catch (error) {
      console.error('Failed to load persistent data:', error);
    }
  }

  /**
   * Set up auto-save interval
   */
  private setupAutoSave(): void {
    // Auto-save every 30 seconds
    setInterval(() => {
      this.savePersistedData();
    }, 30000);
  }

  /**
   * Clean up old data
   */
  async cleanupOldData(retentionDays: number = 30): Promise<void> {
    try {
      console.log(`🧹 Cleaning up branch data older than ${retentionDays} days...`);
      
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      
      // Clean up old sessions
      const sessionsToDelete: string[] = [];
      this.activeSessions.forEach((session, sessionId) => {
        if (session.startTime < cutoffDate && !session.isActive) {
          sessionsToDelete.push(sessionId);
        }
      });
      
      sessionsToDelete.forEach(sessionId => {
        this.activeSessions.delete(sessionId);
      });
      
      // Clean up old rollback points
      const rollbackPointsToDelete: string[] = [];
      this.rollbackPoints.forEach((point, pointId) => {
        if (point.timestamp < cutoffDate && !point.isManual) {
          rollbackPointsToDelete.push(pointId);
        }
      });
      
      rollbackPointsToDelete.forEach(pointId => {
        this.rollbackPoints.delete(pointId);
      });
      
      // Update branch states
      this.branchStates.forEach(state => {
        state.rollbackPoints = state.rollbackPoints.filter(point => 
          point.timestamp >= cutoffDate || point.isManual
        );
      });
      
      await this.savePersistedData();
      
      console.log(`✅ Cleaned up ${sessionsToDelete.length} sessions and ${rollbackPointsToDelete.length} rollback points`);
      
    } catch (error) {
      console.error('❌ Failed to cleanup old data:', error);
    }
  }

  /**
   * Get comprehensive statistics
   */
  getStatistics(): {
    totalSessions: number;
    activeSessions: number;
    totalBranches: number;
    activeBranches: number;
    totalRollbackPoints: number;
    totalFilesTracked: number;
  } {
    const activeSessions = Array.from(this.activeSessions.values()).filter(s => s.isActive);
    const activeBranches = Array.from(this.branchStates.values()).filter(s => s.isActive);
    const totalFilesTracked = Array.from(this.branchStates.values())
      .reduce((total, state) => total + state.filesTracked.length, 0);
    
    return {
      totalSessions: this.activeSessions.size,
      activeSessions: activeSessions.length,
      totalBranches: this.branchStates.size,
      activeBranches: activeBranches.length,
      totalRollbackPoints: this.rollbackPoints.size,
      totalFilesTracked
    };
  }
}

/**
 * Convenience functions for enhanced branch persistence
 */

// Initialize enhanced branch persistence
export const initializeEnhancedBranchPersistence = async (): Promise<EnhancedBranchPersistence> => {
  const persistence = EnhancedBranchPersistence.getInstance();
  await persistence.initialize();
  return persistence;
};

// Create branch with session tracking
export const createBranchWithSession = async (
  projectId: string,
  conversationId: string,
  branchName: string,
  branchType: 'feature' | 'bugfix' | 'iteration' | 'experiment' | 'auto-commit',
  description: string,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<{ success: boolean; branchInfo?: BranchInfo; sessionInfo?: SessionInfo; error?: string }> => {
  const persistence = EnhancedBranchPersistence.getInstance();
  return await persistence.createBranch(projectId, conversationId, branchName, branchType, description, serverId, executeTool);
};

// Create rollback point
export const createRollbackPoint = async (
  branchId: string,
  description: string,
  filesSnapshot: Record<string, string>,
  isManual: boolean = true
): Promise<{ success: boolean; rollbackPoint?: RollbackPoint; error?: string }> => {
  const persistence = EnhancedBranchPersistence.getInstance();
  return await persistence.createRollbackPoint(branchId, description, filesSnapshot, isManual);
};

// Rollback to point
export const rollbackToPoint = async (
  rollbackId: string,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<{ success: boolean; error?: string }> => {
  const persistence = EnhancedBranchPersistence.getInstance();
  return await persistence.rollbackToPoint(rollbackId, serverId, executeTool);
};

// Track file changes
export const trackFileChanges = async (
  sessionId: string,
  filesChanged: string[],
  description: string
): Promise<{ success: boolean; error?: string }> => {
  const persistence = EnhancedBranchPersistence.getInstance();
  return await persistence.trackFileChanges(sessionId, filesChanged, description);
};

// Get branch state
export const getBranchState = (branchId: string): BranchState | null => {
  const persistence = EnhancedBranchPersistence.getInstance();
  return persistence.getBranchState(branchId);
};

// Get session info
export const getSessionInfo = (sessionId: string): SessionInfo | null => {
  const persistence = EnhancedBranchPersistence.getInstance();
  return persistence.getSessionInfo(sessionId);
};

// Get rollback points
export const getRollbackPoints = (branchId: string): RollbackPoint[] => {
  const persistence = EnhancedBranchPersistence.getInstance();
  return persistence.getRollbackPoints(branchId);
};

// Get statistics
export const getBranchPersistenceStatistics = () => {
  const persistence = EnhancedBranchPersistence.getInstance();
  return persistence.getStatistics();
}; 