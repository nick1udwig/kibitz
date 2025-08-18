/**
 * Git Integration Service
 * 
 * Handles local Git operations for the auto-commit branch system.
 * Provides branch creation, commit functionality, and change detection.
 */

import { AutoCommitBranch, BranchOperationResult } from '../components/LlmChat/context/types';
import { saveAutoCommitBranch } from './db';
import { getProjectPath } from './projectPathService';

export interface GitChangeDetection {
  hasChanges: boolean;
  changedFiles: string[];
  addedFiles: string[];
  modifiedFiles: string[];
  deletedFiles: string[];
  totalChanges: number;
}

export interface GitBranchInfo {
  currentBranch: string;
  allBranches: string[];
  isGitRepository: boolean;
  lastCommitHash?: string;
  lastCommitMessage?: string;
}

export interface GitCommitOptions {
  message: string;
  author?: {
    name: string;
    email: string;
  };
  includeUntracked?: boolean;
}

export interface GitBranchOptions {
  baseBranch?: string;
  switchToBranch?: boolean;
  force?: boolean;
}

export class GitService {
  private projectId: string;
  private projectPath: string;
  private executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>;
  private mcpServerId: string;

  constructor(
    projectId: string,
    projectPath: string,
    mcpServerId: string,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
  ) {
    this.projectId = projectId;
    this.projectPath = projectPath;
    this.mcpServerId = mcpServerId;
    this.executeTool = executeTool;
  }

  /**
   * Initialize Git repository if it doesn't exist
   */
  async initializeRepository(): Promise<boolean> {
    try {
      console.log(`🔧 GitService: Initializing Git repository at ${this.projectPath}`);
      
      // Check if already a Git repository
      const isGitRepo = await this.isGitRepository();
      if (isGitRepo) {
        console.log(`✅ GitService: Git repository already exists at ${this.projectPath}`);
        return true;
      }

      // Initialize Git repository
      const { executeGitCommand } = await import('./versionControl/git');
      await executeGitCommand(this.mcpServerId, '(git init -b main || git init); git show-ref --verify --quiet refs/heads/master && git branch -m master main || true', this.projectPath, this.executeTool);

      // Do not set identity here; rely on repo/global git config or env-provided values
      // Ensure HEAD references main without creating a commit
      try {
        await executeGitCommand(this.mcpServerId, 'git symbolic-ref HEAD refs/heads/main || true', this.projectPath, this.executeTool);
      } catch {}

      console.log(`✅ GitService: Git repository initialized at ${this.projectPath}`);
      return true;
    } catch (error) {
      console.error(`❌ GitService: Failed to initialize Git repository:`, error);
      return false;
    }
  }

  /**
   * Check if directory is a Git repository
   */
  async isGitRepository(): Promise<boolean> {
    try {
      const { executeGitCommand } = await import('./versionControl/git');
      const res = await executeGitCommand(this.mcpServerId, 'git rev-parse --is-inside-work-tree', this.projectPath, this.executeTool);
      return res.success && (res.output || '').trim() === 'true';
    } catch {
      return false;
    }
  }

  /**
   * Get current branch information
   */
  async getBranchInfo(): Promise<GitBranchInfo> {
    try {
      const isGitRepo = await this.isGitRepository();
      if (!isGitRepo) {
        return {
          currentBranch: 'main',
          allBranches: [],
          isGitRepository: false
        };
      }

      // Get current branch
      const { executeGitCommand } = await import('./versionControl/git');
      const currentBranchRes = await executeGitCommand(this.mcpServerId, 'git branch --show-current', this.projectPath, this.executeTool);
      const currentBranch = (currentBranchRes.output || '').trim() || 'main';

      // Get all branches
      const allBranchesRes = await executeGitCommand(this.mcpServerId, `git branch --format='%(refname:short)'`, this.projectPath, this.executeTool);
      const allBranches = (allBranchesRes.output || '').trim() ? (allBranchesRes.output || '').trim().split('\n') : [];

      // Get last commit info
      let lastCommitHash: string | undefined;
      let lastCommitMessage: string | undefined;
      try {
        const commitHashRes = await executeGitCommand(this.mcpServerId, `git log -1 --format='%H'`, this.projectPath, this.executeTool);
        lastCommitHash = (commitHashRes.output || '').trim();

        const commitMessageRes = await executeGitCommand(this.mcpServerId, `git log -1 --format='%s'`, this.projectPath, this.executeTool);
        lastCommitMessage = (commitMessageRes.output || '').trim();
      } catch {
        // No commits yet, which is fine
      }

      return {
        currentBranch,
        allBranches,
        isGitRepository: true,
        lastCommitHash,
        lastCommitMessage
      };
    } catch (error) {
      console.error(`❌ GitService: Failed to get branch info:`, error);
      return {
        currentBranch: 'main',
        allBranches: [],
        isGitRepository: false
      };
    }
  }

  /**
   * Detect changes in the repository
   */
  async detectChanges(): Promise<GitChangeDetection> {
    try {
      const isGitRepo = await this.isGitRepository();
      if (!isGitRepo) {
        return {
          hasChanges: false,
          changedFiles: [],
          addedFiles: [],
          modifiedFiles: [],
          deletedFiles: [],
          totalChanges: 0
        };
      }

      // Get status of all files
      const { executeGitCommand } = await import('./versionControl/git');
      const statusRes = await executeGitCommand(this.mcpServerId, 'git status --porcelain', this.projectPath, this.executeTool);

      const statusLines = (statusRes.output || '').trim().split('\n').filter(line => line.trim());
      const changedFiles: string[] = [];
      const addedFiles: string[] = [];
      const modifiedFiles: string[] = [];
      const deletedFiles: string[] = [];

      statusLines.forEach(line => {
        if (line.length < 3) return;
        
        const status = line.substring(0, 2);
        const filename = line.substring(3);
        
        changedFiles.push(filename);
        
        if (status.includes('A')) addedFiles.push(filename);
        if (status.includes('M')) modifiedFiles.push(filename);
        if (status.includes('D')) deletedFiles.push(filename);
      });

      // Filter for specific file patterns we care about
      const importantFiles = changedFiles.filter(file => 
        file.endsWith('.ts') || 
        file.endsWith('.tsx') ||
        file.endsWith('.js') ||
        file.endsWith('.jsx') ||
        file.includes('config.json') ||
        file.includes('package.json') ||
        file.endsWith('.md')
      );

      const hasChanges = importantFiles.length > 0;

      console.log(`🔧 GitService: Change detection - ${changedFiles.length} total files, ${importantFiles.length} important files`);

      return {
        hasChanges,
        changedFiles: importantFiles,
        addedFiles: addedFiles.filter(file => importantFiles.includes(file)),
        modifiedFiles: modifiedFiles.filter(file => importantFiles.includes(file)),
        deletedFiles: deletedFiles.filter(file => importantFiles.includes(file)),
        totalChanges: importantFiles.length
      };
    } catch (error) {
      console.error(`❌ GitService: Failed to detect changes:`, error);
      return {
        hasChanges: false,
        changedFiles: [],
        addedFiles: [],
        modifiedFiles: [],
        deletedFiles: [],
        totalChanges: 0
      };
    }
  }

  /**
   * Create a new branch
   */
  async createBranch(branchName: string, options: GitBranchOptions = {}): Promise<BranchOperationResult> {
    try {
      console.log(`🔧 GitService: Creating branch ${branchName} in ${this.projectPath}`);

      // Ensure Git repository exists
      const initialized = await this.initializeRepository();
      if (!initialized) {
        return {
          success: false,
          error: 'Failed to initialize Git repository'
        };
      }

      // Check if branch already exists
      const branchInfo = await this.getBranchInfo();
      if (branchInfo.allBranches.includes(branchName)) {
        console.log(`⚠️ GitService: Branch ${branchName} already exists`);
        if (options.force) {
          // Delete existing branch first
          const { executeGitCommand } = await import('./versionControl/git');
          await executeGitCommand(this.mcpServerId, `git branch -D ${branchName}`, this.projectPath, this.executeTool);
        } else {
          return {
            success: false,
            error: `Branch ${branchName} already exists`
          };
        }
      }

      // Create new branch
      const baseBranch = options.baseBranch || branchInfo.currentBranch;
      await executeGitCommand(this.mcpServerId, `git checkout -b ${branchName} ${baseBranch}`, this.projectPath, this.executeTool);

      // Switch to branch if requested
      if (options.switchToBranch !== false) {
        await executeGitCommand(this.mcpServerId, `git checkout ${branchName}`, this.projectPath, this.executeTool);
      }

      console.log(`✅ GitService: Successfully created branch ${branchName}`);
      return {
        success: true,
        branchName,
        filesChanged: []
      };
    } catch (error) {
      console.error(`❌ GitService: Failed to create branch ${branchName}:`, error);
      return {
        success: false,
        error: `Failed to create branch: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Commit changes to the current branch
   */
  async commitChanges(options: GitCommitOptions): Promise<BranchOperationResult> {
    try {
      console.log(`🔧 GitService: Committing changes with message: ${options.message}`);

      // Ensure Git repository exists
      const initialized = await this.initializeRepository();
      if (!initialized) {
        return {
          success: false,
          error: 'Failed to initialize Git repository'
        };
      }

      // Check for changes
      const changes = await this.detectChanges();
      if (!changes.hasChanges) {
        console.log(`⚠️ GitService: No changes to commit`);
        return {
          success: false,
          error: 'No changes to commit'
        };
      }

      // Stage changes
      const stageCommand = options.includeUntracked 
        ? `cd "${this.projectPath}" && git add -A`
        : `cd "${this.projectPath}" && git add -u`;

      await executeGitCommand(this.mcpServerId, stageCommand.replace(/^cd .*? &&\s*/, ''), this.projectPath, this.executeTool);

      // Do not assume identity; only set if explicit author provided
      let authorConfig = '';
      if (options.author) {
        authorConfig = `git config user.name "${options.author.name}" && git config user.email "${options.author.email}" && `;
      }

      // Commit changes
      const commitCommand = `${authorConfig}git commit -m "${options.message}"`;
      await executeGitCommand(this.mcpServerId, commitCommand, this.projectPath, this.executeTool);

      // Get commit hash
      const commitHashRes = await executeGitCommand(this.mcpServerId, `git log -1 --format='%H'`, this.projectPath, this.executeTool);
      const commitHash = (commitHashRes.output || '').trim();

      console.log(`✅ GitService: Successfully committed changes. Hash: ${commitHash}`);
      
      // 🚀 NEW: Generate JSON files for API after successful commit
      try {
        console.log('📋 GitService.commitChanges: Generating project JSON files for API...');
        const { extractAndSaveProjectData } = await import('./projectDataExtractor');
        
        // Extract project name from path (format: projectId_projectName)
        const pathParts = this.projectPath.split('/');
        const dirName = pathParts[pathParts.length - 1];
        const projectName = dirName.replace(/^[a-zA-Z0-9]+_/, '').replace(/-/g, ' ');
        
        await extractAndSaveProjectData(
          this.projectId,
          projectName || 'New Project',
          this.mcpServerId,
          this.executeTool
        );
        
        console.log('✅ GitService.commitChanges: JSON files generated successfully');
      } catch (jsonError) {
        console.warn('⚠️ GitService.commitChanges: Failed to generate JSON files, but commit was successful:', jsonError);
      }
      
      return {
        success: true,
        commitHash,
        filesChanged: changes.changedFiles
      };
    } catch (error) {
      console.error(`❌ GitService: Failed to commit changes:`, error);
      return {
        success: false,
        error: `Failed to commit changes: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Create an auto-commit branch with automatic commit
   */
  async createAutoCommitBranch(conversationId: string): Promise<BranchOperationResult> {
    try {
      console.log(`🔧 GitService: Creating auto-commit branch for conversation ${conversationId}`);

      // Check for changes first
      const changes = await this.detectChanges();
      if (!changes.hasChanges) {
        console.log(`⚠️ GitService: No changes detected, skipping auto-commit`);
        return {
          success: false,
          error: 'No changes to commit'
        };
      }

      // Generate branch name
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const branchName = `auto-commit-${conversationId}-${timestamp}`;

      // Create branch
      const branchResult = await this.createBranch(branchName);
      if (!branchResult.success) {
        return branchResult;
      }

      // Commit changes
      const commitMessage = `Auto-commit: ${changes.totalChanges} files changed`;
      const commitResult = await this.commitChanges({
        message: commitMessage,
        includeUntracked: true,
        author: {
          name: 'Auto-Commit Agent',
          email: 'auto-commit@kibitz.local'
        }
      });

      if (!commitResult.success) {
        return commitResult;
      }

      // Create auto-commit branch metadata
      const autoCommitBranch: AutoCommitBranch = {
        branchId: `branch-${Date.now()}`,
        conversationId,
        projectId: this.projectId,
        branchName,
        commitHash: commitResult.commitHash!,
        commitMessage,
        createdAt: new Date(),
        changesSummary: this.generateChangesSummary(changes),
        isAutoCommit: true,
        filesChanged: changes.changedFiles,
        workspaceSnapshot: {
          fileCount: changes.totalChanges,
          totalSize: 0, // We'll calculate this later if needed
          lastModified: new Date()
        }
      };

      // Save to database
      await saveAutoCommitBranch(autoCommitBranch);

      console.log(`✅ GitService: Successfully created auto-commit branch ${branchName}`);
      return {
        success: true,
        branchId: autoCommitBranch.branchId,
        branchName,
        commitHash: commitResult.commitHash,
        filesChanged: changes.changedFiles
      };
    } catch (error) {
      console.error(`❌ GitService: Failed to create auto-commit branch:`, error);
      return {
        success: false,
        error: `Failed to create auto-commit branch: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Generate a summary of changes for commit message
   */
  private generateChangesSummary(changes: GitChangeDetection): string {
    const parts: string[] = [];
    
    if (changes.addedFiles.length > 0) {
      parts.push(`Added ${changes.addedFiles.length} files`);
    }
    
    if (changes.modifiedFiles.length > 0) {
      parts.push(`Modified ${changes.modifiedFiles.length} files`);
    }
    
    if (changes.deletedFiles.length > 0) {
      parts.push(`Deleted ${changes.deletedFiles.length} files`);
    }
    
    return parts.join(', ') || 'No changes detected';
  }
}

/**
 * Create a GitService instance for a project
 */
export const createGitService = (
  projectId: string,
  projectName: string,
  mcpServerId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): GitService => {
  const projectPath = getProjectPath(projectId, projectName);
  return new GitService(projectId, projectPath, mcpServerId, executeTool);
}; 