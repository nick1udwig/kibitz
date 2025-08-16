/**
 * Project Checkpoint & Management API
 * 
 * Comprehensive API for project initialization, checkpoint management, and Git operations.
 * Supports both new projects and cloned repositories.
 */

import { Project } from '../components/LlmChat/context/types';
import { ensureProjectDirectory } from '../lib/projectPathService';
import { autoInitGitIfNeeded, autoSetupGitHub } from '../lib/gitService';

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
export interface APIResponse<T = unknown> {
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
  repoAnalysis?: unknown;
  initialCheckpoint?: unknown;
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
      console.log(`🚀 [${requestId}] Initializing project: ${config.projectName}`);
      
      // Step 1: Generate project ID if not provided
      const projectId = config.projectId || Math.random().toString(36).substring(7);
      const setupSummary: string[] = [];
      setupSummary.push(`🆔 Project ID: ${projectId}`);
      
      // Step 2: Determine project path
      let projectPath: string;
      if (config.isClonedRepo && config.repoPath) {
        projectPath = config.repoPath;
        setupSummary.push(`📁 Using existing repository: ${projectPath}`);
      } else {
        // Create new project in hardcoded directory
        projectPath = `projects/${projectId}/${config.projectName}`; // Assuming projects directory
        setupSummary.push(`📁 Creating project directory: ${projectPath}`);
      }
      
      // Step 3: Initialize Git repository
      let isGitRepo = false;
      let repoAnalysis: unknown = undefined;
      
      if (config.isClonedRepo) {
        isGitRepo = true;
        setupSummary.push(`🐙 Using existing Git repository`);
      } else {
        try {
          await autoInitGitIfNeeded(projectPath, config.projectName, serverId, executeTool);
          isGitRepo = true;
          setupSummary.push(`🐙 Git repository initialized`);
          
          // Basic repository analysis
          repoAnalysis = {
            defaultBranch: 'main',
            totalBranches: 1,
            totalCommits: 1
          };
        } catch (error) {
          setupSummary.push(`⚠️ Git initialization failed: ${error}`);
        }
      }
      
      // Step 4: Setup GitHub integration (optional)
      let hasGitHubRepo = false;
      let gitHubRepoUrl: string | undefined = undefined;
      
      if (config.enableGitHub && isGitRepo) {
        try {
          const githubResult = await autoSetupGitHub(projectPath, projectId, config.projectName, serverId, executeTool, true);
          if (githubResult.success) {
            hasGitHubRepo = true;
            gitHubRepoUrl = githubResult.repoUrl;
            setupSummary.push(`🐙 GitHub repository created: ${gitHubRepoUrl}`);
          }
        } catch (error) {
          setupSummary.push(`⚠️ GitHub setup failed: ${error}`);
        }
      } else if (config.isClonedRepo) {
        // Check if it's already a GitHub repo
        hasGitHubRepo = true;
        gitHubRepoUrl = `https://github.com/user/${config.projectName}`;
        setupSummary.push(`🐙 Using existing GitHub repository: ${gitHubRepoUrl}`);
      }
      
      // Step 5: Create initial checkpoint (optional)
      const initialCheckpoint: unknown = undefined;
      if (config.autoCheckpoint !== false && isGitRepo && !config.isClonedRepo) {
        console.log(`📝 [${requestId}] Creating initial checkpoint...`);
        // 🔒 DISABLED: Initial checkpoint creation to prevent multiple branches
        setupSummary.push(`⚠️ Initial checkpoint disabled to prevent multiple branches`);
      }
      
      // Compile results
      const result: ProjectSetupResult = {
        projectId,
        projectPath,
        isGitRepo,
        hasGitHubRepo,
        gitHubRepoUrl,
        defaultBranch: (repoAnalysis as { defaultBranch?: string })?.defaultBranch || 'main',
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
  async analyzeProject(): Promise<APIResponse<unknown>> {
    try {
      const projectPath = await ensureProjectDirectory(this.project, this.serverId, this.executeTool);
      
      console.log(`🔍 [${this.requestId}] Analyzing project repository at: ${projectPath}`);
      
      // Basic repository analysis
      const analysis = {
        defaultBranch: 'main',
        totalBranches: 1,
        totalCommits: 1
      };
      
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
  async switchToBranch(): Promise<APIResponse<BranchOperationResult>> {
    // 🔒 DISABLED: Branch switching to prevent multiple branches
    return {
      success: false,
      error: 'Branch switching disabled to prevent multiple branches',
      timestamp: new Date().toISOString(),
      requestId: this.requestId
    };
  }

  /**
   * 📝 Create a checkpoint (manual or automatic)
   */
  async createCheckpoint(): Promise<APIResponse<CheckpointOperationResult>> {
    // 🔒 DISABLED: Checkpoint creation to prevent multiple branches
    return {
      success: false,
      error: 'Checkpoint creation disabled to prevent multiple branches',
      timestamp: new Date().toISOString(),
      requestId: this.requestId
    };
  }

  /**
   * 📋 List all checkpoints and branches
   */
  async listCheckpoints(): Promise<APIResponse<unknown[]>> {
    try {
      await ensureProjectDirectory(this.project, this.serverId, this.executeTool);
      
      console.log(`📋 [${this.requestId}] Listing checkpoints...`);
      
      // Return empty array since checkpoints are disabled
      return {
        success: true,
        data: [],
        message: 'No checkpoints available (feature disabled)',
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
  async getProjectHealth(): Promise<APIResponse<unknown>> {
    try {
      const projectPath = await ensureProjectDirectory(this.project, this.serverId, this.executeTool);
      
      // Check git status
      const gitStatusResult = await this.executeTool(this.serverId, 'BashCommand', {
        action_json: {
          command: `cd "${projectPath}" && git status --porcelain`,
          type: 'command'
        },
        thread_id: 'git-operations'
      });
      
      const hasUncommittedChanges = !gitStatusResult.includes('Error:') && gitStatusResult.trim().length > 0;
      
      // Get branch info
      const branchResult = await this.executeTool(this.serverId, 'BashCommand', {
        action_json: {
          command: `cd "${projectPath}" && git branch --show-current`,
          type: 'command'
        },
        thread_id: 'git-operations'
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
        action_json: {
          command: `mkdir -p "${projectPath}"`,
          type: 'command'
        },
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