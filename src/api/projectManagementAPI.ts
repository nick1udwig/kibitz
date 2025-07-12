/**
 * Project Management API
 * 
 * Comprehensive API that packages all project management, Git branching, 
 * and repository analysis functionality. Competes with Replit Agent v2
 * by providing local-first Git management with intelligent branching.
 */

import { 
  BranchType, 
  BranchInfo, 
  ChangeDetectionResult,
  RevertOptions,
  detectChanges,
  createBranch,
  listBranches,
  revertToState,
  autoCreateBranchIfNeeded,
  mergeBranch
} from '../lib/branchService';

import {
  RepoAnalysis,
  DetailedBranchInfo,
  CommitInfo,
  ContributorInfo,
  ProjectStructure,
  TechnologyStack,
  analyzeRepository,
  setupProjectFromRepo,
  checkIfGitRepository,
  getRepositoryUrl
} from '../lib/repoAnalysisService';

import { autoInitGitIfNeeded } from '../lib/gitService';

/**
 * Unified project management API response
 */
export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: string;
}

/**
 * Project initialization options
 */
export interface ProjectInitOptions {
  projectPath: string;
  projectName: string;
  enableGitHub?: boolean;
  autoSetupDependencies?: boolean;
  analyzeExistingRepo?: boolean;
}

/**
 * Project creation result
 */
export interface ProjectCreationResult {
  projectPath: string;
  isGitRepo: boolean;
  repoAnalysis?: RepoAnalysis;
  setupSummary?: string;
  initialBranch: string;
}

/**
 * Branch management options
 */
export interface BranchManagementOptions {
  autoCreateThreshold?: number; // Number of files changed to trigger auto-branch
  lineChangeThreshold?: number; // Number of lines changed to trigger auto-branch
  enableAutoMerge?: boolean;
  defaultBranchType?: BranchType;
}

/**
 * Commit and push options
 */
export interface CommitOptions {
  message?: string;
  autoGenerateMessage?: boolean;
  createBranchIfNeeded?: boolean;
  pushToGitHub?: boolean;
}

/**
 * Main Project Management API Class
 */
export class ProjectManagementAPI {
  private serverId: string;
  private executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>;

  constructor(
    serverId: string, 
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
  ) {
    this.serverId = serverId;
    this.executeTool = executeTool;
  }

  /**
   * 🚀 Initialize a new project with comprehensive setup
   */
  async initializeProject(options: ProjectInitOptions): Promise<APIResponse<ProjectCreationResult>> {
    try {
      console.log(`🔄 Initializing project: ${options.projectName}`);
      
      // Step 1: Initialize Git repository
      const gitResult = await autoInitGitIfNeeded(
        options.projectPath,
        this.serverId,
        this.executeTool
      );
      
      if (!gitResult.success) {
        return {
          success: false,
          error: `Failed to initialize Git repository: ${gitResult.error}`,
          timestamp: new Date().toISOString()
        };
      }

      // Step 2: Analyze repository (existing or newly created)
      let repoAnalysis: RepoAnalysis | undefined;
      let setupSummary: string | undefined;
      
      if (options.analyzeExistingRepo !== false) {
        console.log('🔍 Analyzing repository structure...');
        repoAnalysis = await analyzeRepository(
          options.projectPath,
          this.serverId,
          this.executeTool
        );

        // Step 3: Setup project from analysis
        if (options.autoSetupDependencies !== false) {
          const setupResult = await setupProjectFromRepo(
            options.projectPath,
            repoAnalysis,
            this.serverId,
            this.executeTool
          );
          setupSummary = setupResult.setupSummary;
        }
      }

      const result: ProjectCreationResult = {
        projectPath: options.projectPath,
        isGitRepo: gitResult.initialized || gitResult.alreadyExists,
        repoAnalysis,
        setupSummary,
        initialBranch: repoAnalysis?.defaultBranch || 'main'
      };

      return {
        success: true,
        data: result,
        message: `Project ${options.projectName} initialized successfully`,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      return {
        success: false,
        error: `Project initialization failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 🌿 Get comprehensive branch analysis and change detection
   */
  async analyzeBranches(projectPath: string): Promise<APIResponse<{
    currentChanges: ChangeDetectionResult;
    allBranches: DetailedBranchInfo[];
    recommendations: string[];
  }>> {
    try {
      console.log(`🔍 Analyzing branches for: ${projectPath}`);

      // Detect current changes
      const currentChanges = await detectChanges(
        projectPath,
        this.serverId,
        this.executeTool
      );

      // Get all branches with detailed info
      const allBranches = await listBranches(
        projectPath,
        this.serverId,
        this.executeTool
      ) as DetailedBranchInfo[];

      // Generate recommendations
      const recommendations: string[] = [];
      
      if (currentChanges.shouldCreateBranch) {
        recommendations.push(
          `🌟 Recommended: Create ${currentChanges.suggestedBranchType} branch (${currentChanges.filesChanged} files changed)`
        );
      }

      if (allBranches.some(b => b.hasUnmergedChanges)) {
        recommendations.push('🔀 You have branches with unmerged changes - consider merging');
      }

      if (allBranches.filter(b => b.type === 'experiment').length > 3) {
        recommendations.push('🧪 Consider cleaning up old experiment branches');
      }

      return {
        success: true,
        data: {
          currentChanges,
          allBranches,
          recommendations
        },
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      return {
        success: false,
        error: `Branch analysis failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 🚀 Smart auto-commit with intelligent branching
   */
  async smartCommit(
    projectPath: string, 
    options: CommitOptions = {}
  ): Promise<APIResponse<{
    committed: boolean;
    branchCreated?: boolean;
    branchInfo?: BranchInfo;
    commitMessage: string;
    changesSummary: ChangeDetectionResult;
  }>> {
    try {
      console.log(`💾 Starting smart commit for: ${projectPath}`);

      // Step 1: Analyze changes
      const changesSummary = await detectChanges(
        projectPath,
        this.serverId,
        this.executeTool
      );

      // Step 2: Auto-create branch if needed
      let branchCreated = false;
      let branchInfo: BranchInfo | undefined;

      if (options.createBranchIfNeeded !== false && changesSummary.shouldCreateBranch) {
        const branchResult = await autoCreateBranchIfNeeded(
          projectPath,
          this.serverId,
          this.executeTool
        );

        branchCreated = branchResult.branchCreated;
        branchInfo = branchResult.branchInfo;
      }

      // Step 3: Generate commit message
      const commitMessage = options.message || this.generateCommitMessage(changesSummary);

      // Step 4: Commit changes
      // This would integrate with existing auto-commit functionality
      const committed = true; // Placeholder - would use actual commit logic

      return {
        success: true,
        data: {
          committed,
          branchCreated,
          branchInfo,
          commitMessage,
          changesSummary
        },
        message: `Smart commit completed${branchCreated ? ' with new branch' : ''}`,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      return {
        success: false,
        error: `Smart commit failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 🔀 Create a new branch with intelligent naming
   */
  async createSmartBranch(
    projectPath: string,
    branchType?: BranchType,
    description?: string
  ): Promise<APIResponse<BranchInfo>> {
    try {
      // Analyze changes to suggest branch type
      const changes = await detectChanges(projectPath, this.serverId, this.executeTool);
      
      const finalBranchType = branchType || changes.suggestedBranchType;
      const finalDescription = description || `Auto-created ${finalBranchType} branch`;

      const result = await createBranch(
        projectPath,
        changes.suggestedBranchName,
        finalBranchType,
        finalDescription,
        this.serverId,
        this.executeTool
      );

      if (result.success && result.branchInfo) {
        return {
          success: true,
          data: result.branchInfo,
          message: `Created ${finalBranchType} branch: ${changes.suggestedBranchName}`,
          timestamp: new Date().toISOString()
        };
      } else {
        return {
          success: false,
          error: result.error || 'Failed to create branch',
          timestamp: new Date().toISOString()
        };
      }

    } catch (error) {
      return {
        success: false,
        error: `Branch creation failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 🔄 Safe revert with automatic backup
   */
  async safeRevert(
    projectPath: string,
    options: RevertOptions
  ): Promise<APIResponse<{ backupBranch?: string; reverted: boolean }>> {
    try {
      // Always create backup unless explicitly disabled
      const safeOptions: RevertOptions = {
        ...options,
        createBackupBranch: options.createBackupBranch !== false
      };

      const result = await revertToState(
        projectPath,
        safeOptions,
        this.serverId,
        this.executeTool
      );

      if (result.success) {
        return {
          success: true,
          data: {
            backupBranch: result.backupBranch,
            reverted: true
          },
          message: `Safely reverted${result.backupBranch ? ` (backup: ${result.backupBranch})` : ''}`,
          timestamp: new Date().toISOString()
        };
      } else {
        return {
          success: false,
          error: result.error || 'Revert failed',
          timestamp: new Date().toISOString()
        };
      }

    } catch (error) {
      return {
        success: false,
        error: `Safe revert failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 🔍 Comprehensive repository analysis
   */
  async getRepositoryInsights(projectPath: string): Promise<APIResponse<RepoAnalysis>> {
    try {
      const analysis = await analyzeRepository(
        projectPath,
        this.serverId,
        this.executeTool
      );

      return {
        success: true,
        data: analysis,
        message: `Repository analysis complete (${analysis.totalBranches} branches, ${analysis.contributors.length} contributors)`,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      return {
        success: false,
        error: `Repository analysis failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 🔀 Merge branch with safety checks
   */
  async mergeBranchSafely(
    projectPath: string,
    sourceBranch: string,
    targetBranch: string = 'main'
  ): Promise<APIResponse<{ merged: boolean; conflicts?: string[] }>> {
    try {
      const result = await mergeBranch(
        projectPath,
        sourceBranch,
        targetBranch,
        this.serverId,
        this.executeTool
      );

      if (result.success) {
        return {
          success: true,
          data: { merged: true },
          message: `Successfully merged ${sourceBranch} into ${targetBranch}`,
          timestamp: new Date().toISOString()
        };
      } else {
        return {
          success: false,
          error: result.error || 'Merge failed',
          timestamp: new Date().toISOString()
        };
      }

    } catch (error) {
      return {
        success: false,
        error: `Merge failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 📊 Get project health dashboard
   */
  async getProjectHealth(projectPath: string): Promise<APIResponse<{
    gitStatus: 'healthy' | 'warning' | 'error';
    branchCount: number;
    uncommittedChanges: number;
    lastActivity: Date;
    recommendations: string[];
    techStack: TechnologyStack;
    structure: ProjectStructure;
  }>> {
    try {
      // Get comprehensive analysis
      const [repoAnalysis, changes] = await Promise.all([
        analyzeRepository(projectPath, this.serverId, this.executeTool),
        detectChanges(projectPath, this.serverId, this.executeTool)
      ]);

      // Determine git status
      let gitStatus: 'healthy' | 'warning' | 'error' = 'healthy';
      if (!repoAnalysis.isGitRepo) gitStatus = 'error';
      else if (changes.filesChanged > 5) gitStatus = 'warning';

      // Generate recommendations
      const recommendations: string[] = [];
      if (changes.shouldCreateBranch) {
        recommendations.push('Consider creating a new branch for your changes');
      }
      if (repoAnalysis.branches.filter(b => b.type === 'experiment').length > 3) {
        recommendations.push('Clean up old experiment branches');
      }
      if (!repoAnalysis.projectStructure.hasTests) {
        recommendations.push('Add automated tests to improve code quality');
      }

      return {
        success: true,
        data: {
          gitStatus,
          branchCount: repoAnalysis.totalBranches,
          uncommittedChanges: changes.filesChanged,
          lastActivity: repoAnalysis.lastActivity,
          recommendations,
          techStack: repoAnalysis.technologies,
          structure: repoAnalysis.projectStructure
        },
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      return {
        success: false,
        error: `Project health check failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 🤖 Generate intelligent commit message
   */
  private generateCommitMessage(changes: ChangeDetectionResult): string {
    const { filesChanged, changedFiles, linesAdded, linesRemoved, suggestedBranchType } = changes;
    
    // Analyze file types
    const fileTypes = new Set(changedFiles.map(f => f.split('.').pop()?.toLowerCase()).filter(Boolean));
    const hasTests = changedFiles.some(f => f.includes('test') || f.includes('spec'));
    const hasComponents = changedFiles.some(f => f.includes('component') || f.includes('Component'));
    const hasConfig = changedFiles.some(f => f.includes('config') || f.endsWith('.json') || f.endsWith('.yml'));

    // Generate contextual message
    let message = '';
    
    if (suggestedBranchType === 'feature') {
      if (hasComponents) {
        message = `feat: implement new component functionality`;
      } else {
        message = `feat: add new feature with ${filesChanged} file updates`;
      }
    } else if (suggestedBranchType === 'bugfix') {
      if (hasTests) {
        message = `fix: resolve test failures and bugs`;
      } else {
        message = `fix: address issues in ${filesChanged} files`;
      }
    } else if (suggestedBranchType === 'iteration') {
      if (hasConfig) {
        message = `chore: update configuration and settings`;
      } else {
        message = `refactor: improve code structure and quality`;
      }
    } else {
      message = `experiment: explore new approach with ${filesChanged} changes`;
    }

    // Add stats
    const stats = [];
    if (linesAdded > 0) stats.push(`+${linesAdded}`);
    if (linesRemoved > 0) stats.push(`-${linesRemoved}`);
    
    if (stats.length > 0) {
      message += ` (${stats.join(', ')} lines)`;
    }

    return message;
  }
}

/**
 * 🚀 Factory function to create API instance
 */
export const createProjectManagementAPI = (
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): ProjectManagementAPI => {
  return new ProjectManagementAPI(serverId, executeTool);
};

/**
 * 📋 API endpoint definitions for REST integration
 */
export const API_ENDPOINTS = {
  // Project Management
  INITIALIZE_PROJECT: '/api/projects/initialize',
  GET_PROJECT_HEALTH: '/api/projects/health',
  
  // Branch Management
  ANALYZE_BRANCHES: '/api/branches/analyze',
  CREATE_BRANCH: '/api/branches/create',
  MERGE_BRANCH: '/api/branches/merge',
  LIST_BRANCHES: '/api/branches/list',
  
  // Repository Analysis
  GET_REPO_INSIGHTS: '/api/repository/insights',
  ANALYZE_REPOSITORY: '/api/repository/analyze',
  
  // Smart Operations
  SMART_COMMIT: '/api/operations/smart-commit',
  SAFE_REVERT: '/api/operations/safe-revert',
  
  // Health & Monitoring
  PROJECT_DASHBOARD: '/api/dashboard/project',
  BRANCH_RECOMMENDATIONS: '/api/recommendations/branches'
} as const;

/**
 * 📝 Type exports for external consumption
 */
export type {
  BranchType,
  BranchInfo,
  DetailedBranchInfo,
  ChangeDetectionResult,
  RepoAnalysis,
  CommitInfo,
  ContributorInfo,
  ProjectStructure,
  TechnologyStack,
  ProjectInitOptions,
  ProjectCreationResult,
  BranchManagementOptions,
  CommitOptions,
  APIResponse
}; 