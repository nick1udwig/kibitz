/**
 * Checkpoint & Rollback API
 * 
 * Unified API for all checkpoint and rollback operations.
 * Provides clean interface, standardized responses, and handles complexity internally.
 */

import { ensureProjectDirectory } from '../lib/projectPathService';
import { Project } from '../components/LlmChat/context/types';

/**
 * Standard API Response Format
 */
export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T | undefined;
  error?: string;
  message?: string;
  timestamp: string;
}

/**
 * Branch Switch Response
 */
export interface BranchSwitchResponse {
  targetBranch: string;
  backupBranch?: string;
  commitHash?: string;
  previousBranch: string;
}

/**
 * Checkpoint Creation Response
 */
export interface CheckpointCreationResponse {
  checkpointBranch: string;
  backupBranch?: string;
  commitHash: string;
  description: string;
  filesChanged: number;
  linesChanged: number;
}

/**
 * Repository Analysis Response
 */
export interface RepoAnalysisResponse {
  analysis: unknown;
  topBranches: unknown[];
  checkpoints: unknown[];
  recommendations: string[];
}

/**
 * Checkpoint & Rollback API Class
 */
export class CheckpointAPI {
  private projectId: string;
  private project: Project;
  private serverId: string;
  private executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>;

  constructor(
    projectId: string,
    project: Project,
    serverId: string,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
  ) {
    this.projectId = projectId;
    this.project = project;
    this.serverId = serverId;
    this.executeTool = executeTool;
  }

  /**
   * Get project path with proper error handling
   */
  private async getProjectPath(): Promise<string> {
    try {
      return await ensureProjectDirectory(this.project, this.serverId, this.executeTool);
    } catch (error) {
      throw new Error(`Failed to get project path: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create standardized API response
   */
  private createResponse<T>(success: boolean, data?: T, error?: string, message?: string): APIResponse<T> {
    return {
      success,
      data: success ? data : undefined,
      error,
      message,
      timestamp: new Date().toISOString()
    } as APIResponse<T>;
  }

  /**
   * Analyze repository and get comprehensive branch information
   */
  async analyzeRepository(): Promise<APIResponse<RepoAnalysisResponse>> {
    // 🔒 DISABLED: Repository analysis to prevent checkpoint creation
    return this.createResponse<RepoAnalysisResponse>(
      false,
      undefined,
      'Repository analysis disabled to prevent multiple branches'
    );

    /* ORIGINAL CODE DISABLED:
    try {
      console.log(`🔍 CheckpointAPI: Analyzing repository for project ${this.projectId}`);
      
      const projectPath = await this.getProjectPath();
      
      // Get full repository analysis
      const analysis = await analyzeRepository(projectPath, this.serverId, this.executeTool);
      
      // Get top 10 branches (prioritize current and main branches)
      const topBranches = analysis.branches
        .sort((a, b) => {
          if (a.isActive && !b.isActive) return -1;
          if (!a.isActive && b.isActive) return 1;
          if ((a.name === 'main' || a.name === 'master') && (b.name !== 'main' && b.name !== 'master')) return -1;
          if ((a.name !== 'main' && a.name !== 'master') && (b.name === 'main' || b.name === 'master')) return 1;
          return b.commitCount - a.commitCount;
        })
        .slice(0, 10);
      
      // Get checkpoint branches
      const checkpoints = await listCheckpoints(projectPath, this.serverId, this.executeTool);
      
      // Generate recommendations
      const recommendations: string[] = [];
      
      // Check if checkpoint should be created
      const checkpointCheck = await shouldCreateCheckpoint(
        projectPath,
        this.serverId,
        this.executeTool
      );
      
      if (checkpointCheck.shouldCreate) {
        recommendations.push(`💡 Consider creating a checkpoint: ${checkpointCheck.reason}`);
      }
      
      if (analysis.branches.some(b => b.hasUnmergedChanges)) {
        recommendations.push('🔀 You have branches with unmerged changes');
      }
      
      if (checkpoints.filter(c => c.name.startsWith('checkpoint/')).length > 10) {
        recommendations.push('🧹 Consider cleaning up old checkpoint branches');
      }
      
      const responseData: RepoAnalysisResponse = {
        analysis,
        topBranches,
        checkpoints,
        recommendations
      };
      
      return this.createResponse(
        true,
        responseData,
        undefined,
        `Repository analysis complete: ${analysis.totalBranches} branches, ${analysis.totalCommits} commits`
      );
      
    } catch (error) {
      console.error('CheckpointAPI: Repository analysis failed:', error);
      return this.createResponse(
        false,
        undefined,
        error instanceof Error ? error.message : String(error)
      );
    }
    */
  }

  /**
   * Switch to a different branch with automatic backup
   */
  async switchToBranch(): Promise<APIResponse<BranchSwitchResponse>> {
    // 🔒 DISABLED: Branch switching to prevent backup branch creation
    return this.createResponse<BranchSwitchResponse>(
      false,
      undefined,
      'Branch switching disabled to prevent multiple branches'
    );

    /* ORIGINAL CODE DISABLED:
    try {
      console.log(`🔄 CheckpointAPI: Switching to branch ${branchName} for project ${this.projectId}`);
      
      const projectPath = await this.getProjectPath();
      
      // Get current branch for response
      const currentBranchResult = await this.executeTool(this.serverId, 'BashCommand', {
        command: `cd "${projectPath}" && git branch --show-current`,
        type: 'command',
        thread_id: 'checkpoint-api'
      });
      
      const previousBranch = currentBranchResult.includes('Error:') ? 'unknown' : currentBranchResult.trim();
      
      // Perform safe rollback
      const result = await safeRollback(
        projectPath,
        this.serverId,
        this.executeTool,
        {
          targetBranch: branchName,
          createBackup
        }
      );
      
      if (result.success) {
        const responseData: BranchSwitchResponse = {
          targetBranch: result.branchName || branchName,
          backupBranch: result.backupBranch,
          commitHash: result.commitHash,
          previousBranch
        };
        
        let message = `Successfully switched to branch: ${result.branchName}`;
        if (result.backupBranch) {
          message += ` (backup: ${result.backupBranch})`;
        }
        
        return this.createResponse(true, responseData, undefined, message);
      } else {
        return this.createResponse(false, undefined, result.error);
      }
      
    } catch (error) {
      console.error('CheckpointAPI: Branch switch failed:', error);
      return this.createResponse(
        false,
        undefined,
        error instanceof Error ? error.message : String(error)
      );
    }
    */
  }

  /**
   * Create a manual checkpoint
   */
  async createCheckpoint(): Promise<APIResponse<CheckpointCreationResponse>> {
    // 🔒 DISABLED: Checkpoint creation to prevent multiple branches
    return this.createResponse(
      false,
      {
        checkpointBranch: '',
        commitHash: '',
        description: 'Disabled',
        filesChanged: 0,
        linesChanged: 0
      } as CheckpointCreationResponse,
      'Checkpoint creation disabled to prevent multiple branches'
    );

    /* ORIGINAL CODE DISABLED:
    try {
      console.log(`📝 CheckpointAPI: Creating checkpoint for project ${this.projectId}`);
      
      const projectPath = await this.getProjectPath();
      
      // Check if checkpoint should be created
      const checkResult = await shouldCreateCheckpoint(
        projectPath,
        this.serverId,
        this.executeTool,
        { filesChanged: 1, linesChanged: 10 } // Lower threshold for manual checkpoints
      );
      
      if (!checkResult.shouldCreate) {
        return this.createResponse(
          false,
          undefined,
          `Not enough changes for checkpoint: ${checkResult.reason}`
        );
      }
      
      // Create the checkpoint
      const options: Partial<CheckpointOptions> = {
        description: description || `Manual checkpoint: ${checkResult.changes.filesChanged} files changed`,
        createBackup: true,
        branchType
      };
      
      const result = await createAutoCheckpoint(
        projectPath,
        this.serverId,
        this.executeTool,
        options
      );
      
      if (result.success) {
        const responseData: CheckpointCreationResponse = {
          checkpointBranch: result.branchName!,
          backupBranch: result.backupBranch,
          commitHash: result.commitHash!,
          description: options.description!,
          filesChanged: checkResult.changes.filesChanged,
          linesChanged: checkResult.changes.linesAdded + checkResult.changes.linesRemoved
        };
        
        let message = `Checkpoint created: ${result.branchName}`;
        if (result.backupBranch) {
          message += ` (backup: ${result.backupBranch})`;
        }
        
        return this.createResponse(true, responseData, undefined, message);
      } else {
        return this.createResponse(false, undefined, result.error);
      }
      
    } catch (error) {
      console.error('CheckpointAPI: Checkpoint creation failed:', error);
      return this.createResponse(
        false,
        undefined,
        error instanceof Error ? error.message : String(error)
      );
    }
    */
  }

  /**
   * List all checkpoints for the project
   */
  async listCheckpoints(): Promise<APIResponse<unknown[]>> {
    // 🔒 DISABLED: Checkpoint listing to prevent multiple branches
    return this.createResponse(
      true,
      [],
      undefined,
      'Checkpoint listing disabled to prevent multiple branches'
    );
  }

  /**
   * Check if auto-checkpoint should be created
   */
  async shouldAutoCheckpoint(): Promise<APIResponse<{ shouldCreate: boolean; reason: string; changes: unknown }>> {
    // 🔒 DISABLED: Checkpoint checks to prevent multiple branches
    return this.createResponse(true, {
      shouldCreate: false,
      reason: 'Auto-checkpoint disabled to prevent multiple branches',
      changes: {}
    });
  }
}

/**
 * Factory function to create CheckpointAPI instance
 */
export const createCheckpointAPI = (
  projectId: string,
  project: Project,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): CheckpointAPI => {
  return new CheckpointAPI(projectId, project, serverId, executeTool);
}; 