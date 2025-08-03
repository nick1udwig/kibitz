/**
 * 🚀 Project Management & Checkpoint API
 * 
 * Unified API for complete project lifecycle management including:
 * - Project initialization (hardcoded directory + git setup)
 * - GitHub integration (optional, user-configurable)
 * - Checkpoint & rollback functionality
 * - Repository analysis and branch management
 * 
 * Supports both new projects and cloned repositories.
 */

import { Project } from '../components/LlmChat/context/types';
import { analyzeRepository, type RepoAnalysis } from '../lib/repoAnalysisService';
import { safeRollback, createAutoCheckpoint, shouldCreateCheckpoint, listCheckpoints } from '../lib/checkpointRollbackService';
import { ensureProjectDirectory, getProjectPath, sanitizeProjectName } from '../lib/projectPathService';
import { autoInitGitIfNeeded, createGitHubRepository, getGitHubUsername } from '../lib/gitService';
import { autoSetupGitHub } from '../lib/gitService';

// Constants
const BASE_PROJECT_DIR = '/Users/test/gitrepo/projects';

/**
 * Configuration for project initialization
 */
export interface ProjectInitConfig {
  projectName: string;
  projectId?: string; // Optional, will be generated if not provided
  enableGitHub?: boolean; // Whether to create GitHub repository
  isClonedRepo?: boolean; // Whether this is an existing cloned repository
  repoPath?: string; // Path for cloned repositories
  autoCheckpoint?: boolean; // Whether to create initial checkpoint
  description?: string; // Project description
}

/**
 * API Response format
 */
export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: string;
  requestId?: string;
}

/**
 * Project initialization result
 */
export interface ProjectSetupResult {
  projectId: string;
  projectPath: string;
  isGitRepo: boolean;
  hasGitHubRepo: boolean;
  gitHubRepoUrl?: string;
  defaultBranch: string;
  repoAnalysis?: RepoAnalysis;
  initialCheckpoint?: any;
  setupSummary: string[];
}

/**
 * Branch operation result
 */
export interface BranchOperationResult {
  success: boolean;
  targetBranch: string;
  previousBranch: string;
  backupBranch?: string;
  commitHash?: string;
  message: string;
}

/**
 * Checkpoint operation result
 */
export interface CheckpointOperationResult {
  checkpointId: string;
  branchName: string;
  commitHash: string;
  description: string;
  filesChanged: number;
  linesChanged: number;
  timestamp: string;
}

/**
 * 🎯 Main Project Management & Checkpoint API Class
 */
export class ProjectCheckpointAPI {
  private project: Project;
  private serverId: string;
  private executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>;
  private requestId: string;

  constructor(
    project: Project,
    serverId: string,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
  ) {
    this.project = project;
    this.serverId = serverId;
    this.executeTool = executeTool;
    this.requestId = Math.random().toString(36).substring(7);
  }

  /**
   * 🏗️ Initialize a new project with complete setup
   */
  static async initializeNewProject(
    config: ProjectInitConfig,
    serverId: string,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
  ): Promise<APIResponse<ProjectSetupResult>> {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(7);
    
    try {
      console.log(`🚀 [${requestId}] Initializing new project: ${config.projectName}`);
      
      // Generate project ID if not provided
      const projectId = config.projectId || Math.random().toString(36).substring(7);
      const setupSummary: string[] = [];
      
      // Step 1: Determine project path
      let projectPath: string;
      let isGitRepo = false;
      
      if (config.isClonedRepo && config.repoPath) {
        // Use existing cloned repository
        projectPath = config.repoPath;
        setupSummary.push(`✅ Using cloned repository at: ${projectPath}`);
        
        // Verify it's a git repository
        try {
          const gitCheck = await executeTool(serverId, 'BashCommand', {
            action_json: {
              command: `test -d "${projectPath}/.git" && echo "is_git" || echo "not_git"`
            },
            thread_id: requestId
          });
          isGitRepo = gitCheck.includes('is_git');
        } catch (error) {
          return {
            success: false,
            error: `Failed to verify cloned repository: ${error}`,
            timestamp: new Date().toISOString(),
            requestId
          };
        }
      } else {
        // Create new project in hardcoded directory
        projectPath = getProjectPath(projectId, config.projectName);
        setupSummary.push(`📁 Creating project directory: ${projectPath}`);
        
        // Create project directory
        const dirCreated = await this.createProjectDirectory(projectPath, serverId, executeTool, requestId);
        if (!dirCreated) {
          return {
            success: false,
            error: `Failed to create project directory: ${projectPath}`,
            timestamp: new Date().toISOString(),
            requestId
          };
        }
        setupSummary.push(`✅ Project directory created successfully`);
      }
      
      // Step 2: Initialize Git (always for new projects, verify for cloned)
      if (!isGitRepo) {
        console.log(`🔧 [${requestId}] Initializing Git repository...`);
        const gitResult = await autoInitGitIfNeeded(
          projectPath,
          config.projectName,
          serverId,
          executeTool
        );
        
        if (gitResult.success) {
          isGitRepo = true;
          setupSummary.push(`✅ Git repository initialized`);
        } else {
          setupSummary.push(`⚠️ Git initialization failed: ${gitResult.error}`);
        }
      } else {
        setupSummary.push(`✅ Git repository already exists`);
      }
      
      // Step 3: Analyze repository
      console.log(`🔍 [${requestId}] Analyzing repository structure...`);
      let repoAnalysis: RepoAnalysis | undefined;
      try {
        repoAnalysis = await analyzeRepository(projectPath, serverId, executeTool);
        setupSummary.push(`📊 Repository analysis complete: ${repoAnalysis.totalBranches} branches, ${repoAnalysis.totalCommits} commits`);
      } catch (error) {
        console.warn(`Analysis failed: ${error}`);
        setupSummary.push(`⚠️ Repository analysis failed, continuing...`);
      }
      
      // Step 4: GitHub setup (optional)
      let hasGitHubRepo = false;
      let gitHubRepoUrl: string | undefined;
      
      if (config.enableGitHub && !config.isClonedRepo) {
        console.log(`🐙 [${requestId}] Setting up GitHub repository...`);
        try {
          const githubResult = await autoSetupGitHub(
            projectPath,
            projectId,
            config.projectName,
            serverId,
            executeTool,
            true // Enable GitHub
          );
          
          if (githubResult.success && githubResult.repoUrl) {
            hasGitHubRepo = true;
            gitHubRepoUrl = githubResult.repoUrl;
            setupSummary.push(`🐙 GitHub repository created: ${gitHubRepoUrl}`);
          } else {
            setupSummary.push(`⚠️ GitHub setup failed: ${githubResult.error}`);
          }
        } catch (error) {
          setupSummary.push(`⚠️ GitHub setup failed: ${error}`);
        }
      } else if (config.isClonedRepo && repoAnalysis?.repoUrl) {
        hasGitHubRepo = true;
        gitHubRepoUrl = repoAnalysis.repoUrl;
        setupSummary.push(`🐙 Using existing GitHub repository: ${gitHubRepoUrl}`);
      }
      
      // Step 5: Create initial checkpoint (optional)
      let initialCheckpoint: any = undefined;
      if (config.autoCheckpoint !== false && isGitRepo && !config.isClonedRepo) {
        console.log(`📝 [${requestId}] Creating initial checkpoint...`);
        // 🔒 DISABLED: Initial checkpoint creation to prevent multiple branches
        setupSummary.push(`⚠️ Initial checkpoint disabled to prevent multiple branches`);
        
        /* ORIGINAL CODE DISABLED:
        try {
          const checkpointResult = await createAutoCheckpoint(
            projectPath,
            serverId,
            executeTool,
            {
              description: `Initial project setup: ${config.projectName}`,
              createBackup: false,
              branchType: 'checkpoint'
            }
          );
          
          if (checkpointResult.success) {
            initialCheckpoint = checkpointResult;
            setupSummary.push(`📝 Initial checkpoint created: ${checkpointResult.branchName}`);
          }
        } catch (error) {
          setupSummary.push(`⚠️ Initial checkpoint failed: ${error}`);
        }
        */
      }
      
      // Compile results
      const result: ProjectSetupResult = {
        projectId,
        projectPath,
        isGitRepo,
        hasGitHubRepo,
        gitHubRepoUrl,
        defaultBranch: repoAnalysis?.defaultBranch || 'main',
        repoAnalysis,
        initialCheckpoint,
        setupSummary
      };
      
      const duration = Date.now() - startTime;
      console.log(`✅ [${requestId}] Project setup completed in ${duration}ms`);
      
      return {
        success: true,
        data: result,
        message: `Project ${config.projectName} initialized successfully`,
        timestamp: new Date().toISOString(),
        requestId
      };
      
    } catch (error) {
      console.error(`❌ [${requestId}] Project initialization failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
        requestId
      };
    }
  }

  /**
   * 🔍 Analyze current project repository
   */
  async analyzeProject(): Promise<APIResponse<RepoAnalysis>> {
    try {
      const projectPath = await ensureProjectDirectory(this.project, this.serverId, this.executeTool);
      
      console.log(`🔍 [${this.requestId}] Analyzing project repository at: ${projectPath}`);
      
      const analysis = await analyzeRepository(projectPath, this.serverId, this.executeTool);
      
      return {
        success: true,
        data: analysis,
        message: `Repository analysis complete: ${analysis.totalBranches} branches, ${analysis.totalCommits} commits`,
        timestamp: new Date().toISOString(),
        requestId: this.requestId
      };
      
    } catch (error) {
      console.error(`❌ [${this.requestId}] Repository analysis failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
        requestId: this.requestId
      };
    }
  }

  /**
   * 🔄 Switch to a different branch with automatic backup
   */
  async switchToBranch(
    branchName: string,
    createBackup: boolean = true
  ): Promise<APIResponse<BranchOperationResult>> {
    try {
      const projectPath = await ensureProjectDirectory(this.project, this.serverId, this.executeTool);
      
      console.log(`🔄 [${this.requestId}] Switching to branch: ${branchName}`);
      
      // Get current branch
      const currentBranchResult = await this.executeTool(this.serverId, 'BashCommand', {
        command: `cd "${projectPath}" && git branch --show-current`,
        type: 'command',
        thread_id: this.requestId
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
      
      const operationResult: BranchOperationResult = {
        success: result.success,
        targetBranch: result.branchName || branchName,
        previousBranch,
        backupBranch: result.backupBranch,
        commitHash: result.commitHash,
        message: result.success 
          ? `Successfully switched to branch: ${result.branchName}`
          : `Failed to switch to branch: ${result.error}`
      };
      
      return {
        success: result.success,
        data: operationResult,
        message: operationResult.message,
        timestamp: new Date().toISOString(),
        requestId: this.requestId
      };
      
    } catch (error) {
      console.error(`❌ [${this.requestId}] Branch switch failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
        requestId: this.requestId
      };
    }
  }

  /**
   * 📝 Create a checkpoint (manual or automatic)
   */
  async createCheckpoint(
    description?: string,
    branchType: 'feature' | 'bugfix' | 'experiment' | 'checkpoint' = 'checkpoint',
    force: boolean = false
  ): Promise<APIResponse<CheckpointOperationResult>> {
    // 🔒 DISABLED: Checkpoint creation to prevent multiple branches
    return {
      success: false,
      error: 'Checkpoint creation disabled to prevent multiple branches',
      timestamp: new Date().toISOString(),
      requestId: this.requestId
    };

    /* ORIGINAL CODE DISABLED:
    try {
      const projectPath = await ensureProjectDirectory(this.project, this.serverId, this.executeTool);
      
      console.log(`📝 [${this.requestId}] Creating checkpoint...`);
      
      // Check if checkpoint should be created (unless forced)
      if (!force) {
        const checkResult = await shouldCreateCheckpoint(
          projectPath,
          this.serverId,
          this.executeTool,
          { filesChanged: 1, linesChanged: 10 } // Lower threshold for manual checkpoints
        );
        
        if (!checkResult.shouldCreate) {
          return {
            success: false,
            error: `Not enough changes for checkpoint: ${checkResult.reason}`,
            timestamp: new Date().toISOString(),
            requestId: this.requestId
          };
        }
      }
      
      // Create the checkpoint
      const result = await createAutoCheckpoint(
        projectPath,
        this.serverId,
        this.executeTool,
        {
          description: description || `Manual checkpoint`,
          createBackup: true,
          branchType
        }
      );
      
      if (result.success) {
        const checkpointResult: CheckpointOperationResult = {
          checkpointId: result.branchName || 'unknown',
          branchName: result.branchName || 'unknown',
          commitHash: result.commitHash || 'unknown',
          description: description || 'Manual checkpoint',
          filesChanged: 0, // Will be populated from change detection if needed
          linesChanged: 0, // Will be populated from change detection if needed
          timestamp: new Date().toISOString()
        };
        
        return {
          success: true,
          data: checkpointResult,
          message: `Checkpoint created successfully: ${result.branchName}`,
          timestamp: new Date().toISOString(),
          requestId: this.requestId
        };
      } else {
        return {
          success: false,
          error: result.error || 'Failed to create checkpoint',
          timestamp: new Date().toISOString(),
          requestId: this.requestId
        };
      }
      
    } catch (error) {
      console.error(`❌ [${this.requestId}] Checkpoint creation failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
        requestId: this.requestId
      };
    }
    */
  }

  /**
   * 📋 List all checkpoints and branches
   */
  async listCheckpoints(): Promise<APIResponse<any[]>> {
    try {
      const projectPath = await ensureProjectDirectory(this.project, this.serverId, this.executeTool);
      
      console.log(`📋 [${this.requestId}] Listing checkpoints...`);
      
      const checkpoints = await listCheckpoints(projectPath, this.serverId, this.executeTool);
      
      return {
        success: true,
        data: checkpoints,
        message: `Found ${checkpoints.length} checkpoints`,
        timestamp: new Date().toISOString(),
        requestId: this.requestId
      };
      
    } catch (error) {
      console.error(`❌ [${this.requestId}] Failed to list checkpoints:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
        requestId: this.requestId
      };
    }
  }

  /**
   * 🛠️ Get project configuration and health status
   */
  async getProjectHealth(): Promise<APIResponse<any>> {
    try {
      const projectPath = await ensureProjectDirectory(this.project, this.serverId, this.executeTool);
      
      // Check git status
      const gitStatusResult = await this.executeTool(this.serverId, 'BashCommand', {
        command: `cd "${projectPath}" && git status --porcelain`,
        type: 'command',
        thread_id: this.requestId
      });
      
      const hasUncommittedChanges = !gitStatusResult.includes('Error:') && gitStatusResult.trim().length > 0;
      
      // Get branch info
      const branchResult = await this.executeTool(this.serverId, 'BashCommand', {
        command: `cd "${projectPath}" && git branch --show-current`,
        type: 'command',
        thread_id: this.requestId
      });
      
      const currentBranch = branchResult.includes('Error:') ? 'unknown' : branchResult.trim();
      
      const health = {
        projectId: this.project.id,
        projectName: this.project.name,
        projectPath,
        currentBranch,
        hasUncommittedChanges,
        gitEnabled: true,
        githubEnabled: this.project.settings.enableGitHub || false,
        lastChecked: new Date().toISOString()
      };
      
      return {
        success: true,
        data: health,
        message: `Project health check complete`,
        timestamp: new Date().toISOString(),
        requestId: this.requestId
      };
      
    } catch (error) {
      console.error(`❌ [${this.requestId}] Project health check failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
        requestId: this.requestId
      };
    }
  }

  /**
   * Helper: Create project directory
   */
  private static async createProjectDirectory(
    projectPath: string,
    serverId: string,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>,
    threadId: string
  ): Promise<boolean> {
    try {
      // Initialize MCP environment with project directory
      await executeTool(serverId, 'Initialize', {
        type: "first_call",
        any_workspace_path: projectPath,
        initial_files_to_read: [],
        task_id_to_resume: "",
        mode_name: "wcgw",
        thread_id: threadId
      });

      // Create the project directory
      const createDirResult = await executeTool(serverId, 'BashCommand', {
        command: `mkdir -p "${projectPath}"`,
        type: 'command',
        thread_id: threadId
      });

      if (createDirResult.includes('Error:')) {
        return false;
      }

      // Re-initialize with project-specific directory
      await executeTool(serverId, 'Initialize', {
        type: "first_call",
        any_workspace_path: projectPath,
        initial_files_to_read: [],
        task_id_to_resume: "",
        mode_name: "wcgw",
        thread_id: threadId
      });

      // Create basic README
      const readmeContent = `# ${projectPath.split('/').pop()}

This is a Kibitz project directory.

## Getting Started

This directory was automatically created for your project workspace.
`;

      const createReadmeResult = await executeTool(serverId, 'FileWriteOrEdit', {
        file_path: `README.md`,
        content: readmeContent,
        thread_id: threadId
      });

      return !createReadmeResult.includes('Error:');
    } catch (error) {
      console.error('Failed to create project directory:', error);
      return false;
    }
  }
}

/**
 * 🏭 Factory function to create API instance
 */
export const createProjectCheckpointAPI = (
  project: Project,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): ProjectCheckpointAPI => {
  return new ProjectCheckpointAPI(project, serverId, executeTool);
};

/**
 * 📋 Usage Examples & Integration Points
 */
export const USAGE_EXAMPLES = {
  // Initialize new project
  newProject: `
    const result = await ProjectCheckpointAPI.initializeNewProject({
      projectName: "My New App",
      enableGitHub: true,
      autoCheckpoint: true,
      description: "A new React application"
    }, serverId, executeTool);
  `,
  
  // Initialize from cloned repo
  clonedRepo: `
    const result = await ProjectCheckpointAPI.initializeNewProject({
      projectName: "Cloned Project",
      isClonedRepo: true,
      repoPath: "/path/to/existing/repo",
      enableGitHub: false,
      autoCheckpoint: false
    }, serverId, executeTool);
  `,
  
  // Use API for existing project
  existingProject: `
    const api = createProjectCheckpointAPI(project, serverId, executeTool);
    
    // Analyze repository
    const analysis = await api.analyzeProject();
    
    // Create checkpoint
    const checkpoint = await api.createCheckpoint("Before major refactoring", "feature");
    
    // Switch to branch
    const switchResult = await api.switchToBranch("feature/new-ui", true);
    
    // Check health
    const health = await api.getProjectHealth();
  `
} as const; 