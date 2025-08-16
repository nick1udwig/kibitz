/**
 * Local Persistence Service
 * 
 * SuperClaude-inspired persistence using Git + local files
 * - Git stores all commits/branches (the source of truth)
 * - .kibitz/ metadata files provide fast access for UI
 * - Project-based isolation with no external database
 * - Survives app restarts by scanning project directories
 */

import { executeGitCommand } from './versionControl/git';
// import { ensureProjectDirectory } from './projectPathService';
import { getProjectsBaseDir } from './pathConfig';
// import { Checkpoint } from '../types/Checkpoint';
// import { BranchInfo } from './branchService';

// Base directory for all projects
const BASE_PROJECTS_DIR = getProjectsBaseDir();

/**
 * Checkpoint metadata stored in .kibitz/checkpoints.json
 */
export interface CheckpointMetadata {
  id: string;
  projectId: string;
  description: string;
  timestamp: Date;
  commitHash: string;
  branchName?: string;
  filesChanged: string[];
  linesChanged: number;
  type: 'manual' | 'auto' | 'tool-execution';
  tags: string[];
}

/**
 * Branch metadata stored in .kibitz/branches.json
 */
export interface BranchMetadata {
  name: string;
  type: 'feature' | 'bugfix' | 'iteration' | 'experiment' | 'checkpoint';
  createdAt: Date;
  parentBranch: string;
  commitHash: string;
  description: string;
  filesChanged: string[];
  isActive: boolean;
  checkpointCount: number;
}

/**
 * Project metadata stored in .kibitz/config.json
 */
export interface ProjectMetadata {
  projectId: string;
  projectName: string;
  projectPath: string;
  lastUpdated: Date;
  gitInitialized: boolean;
  totalCheckpoints: number;
  totalBranches: number;
  settings: {
    autoCommitEnabled: boolean;
    branchingEnabled: boolean;
    maxCheckpoints: number;
    maxBranches: number;
  };
}

/**
 * Recovery data for app startup
 */
export interface ProjectRecoveryData {
  projectId: string;
  projectName: string;
  projectPath: string;
  hasGit: boolean;
  checkpoints: CheckpointMetadata[];
  branches: BranchMetadata[];
  metadata: ProjectMetadata;
}

/**
 * Local Persistence Service
 */
export class LocalPersistenceService {
  
  /**
   * Initialize .kibitz directory for a project
   */
  static async initializeProjectPersistence(
    projectPath: string,
    projectId: string,
    projectName: string,
    serverId: string,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`🔧 Initializing persistence for project: ${projectPath}`);
      
      // First, ensure we're in the right directory and initialize MCP
      await this.ensureProjectDirectory(projectPath, serverId, executeTool);
      
      // Create .kibitz directory using proper MCP tools
      const createDirResult = await this.createKibitzDirectory(projectPath, serverId, executeTool);
      if (!createDirResult.success) {
        return { success: false, error: createDirResult.error };
      }
      
      // Initialize metadata files
      const initialMetadata: ProjectMetadata = {
        projectId,
        projectName,
        projectPath,
        lastUpdated: new Date(),
        gitInitialized: false,
        totalCheckpoints: 0,
        totalBranches: 0,
        settings: {
          autoCommitEnabled: true,
          branchingEnabled: true,
          maxCheckpoints: 100,
          maxBranches: 50
        }
      };
      
      const initialCheckpoints: CheckpointMetadata[] = [];
      const initialBranches: BranchMetadata[] = [];
      
      // Write initial files using robust method
      const configResult = await this.writeMetadataFileRobust(projectPath, 'config.json', initialMetadata, serverId, executeTool);
      if (!configResult.success) {
        return { success: false, error: `Failed to create config.json: ${configResult.error}` };
      }
      
      const checkpointsResult = await this.writeMetadataFileRobust(projectPath, 'checkpoints.json', initialCheckpoints, serverId, executeTool);
      if (!checkpointsResult.success) {
        return { success: false, error: `Failed to create checkpoints.json: ${checkpointsResult.error}` };
      }
      
      const branchesResult = await this.writeMetadataFileRobust(projectPath, 'branches.json', initialBranches, serverId, executeTool);
      if (!branchesResult.success) {
        return { success: false, error: `Failed to create branches.json: ${branchesResult.error}` };
      }
      
      console.log(`✅ Initialized persistence for project: ${projectName}`);
      return { success: true };
      
    } catch (error) {
      console.error('Failed to initialize project persistence:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }

  /**
   * Ensure project directory exists and MCP is initialized
   */
  private static async ensureProjectDirectory(
    projectPath: string,
    serverId: string,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
  ): Promise<void> {
    try {
      // Initialize MCP with the project directory
      await executeTool(serverId, 'Initialize', {
        type: "first_call",
        any_workspace_path: projectPath,
        initial_files_to_read: [],
        task_id_to_resume: "",
        mode_name: "wcgw",
        thread_id: "kibitz-persistence"
      });
      
      // Ensure the project directory exists
      await executeTool(serverId, 'BashCommand', {
        action_json: {
          command: `mkdir -p "${projectPath}"`,
          type: 'command'
        },
        thread_id: "kibitz-persistence"
      });
      
    } catch (error) {
      console.error('Failed to ensure project directory:', error);
      throw error;
    }
  }

  /**
   * Create .kibitz directory using proper MCP tools
   */
  private static async createKibitzDirectory(
    projectPath: string,
    serverId: string,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Create .kibitz directory
      const result = await executeTool(serverId, 'BashCommand', {
        action_json: {
          command: `cd "${projectPath}" && mkdir -p .kibitz`,
          type: 'command'
        },
        thread_id: "kibitz-persistence"
      });
      
      if (result.includes('Error:') || result.includes('error')) {
        return { success: false, error: result };
      }
      
      // Verify directory was created
      const verifyResult = await executeTool(serverId, 'BashCommand', {
        action_json: {
          command: `cd "${projectPath}" && ls -la .kibitz`,
          type: 'command'
        },
        thread_id: "kibitz-persistence"
      });
      
      if (verifyResult.includes('No such file or directory')) {
        return { success: false, error: 'Failed to create .kibitz directory' };
      }
      
      return { success: true };
      
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }

  /**
   * Robust file writing using MCP FileWriteOrEdit tool
   */
  private static async writeMetadataFileRobust(
    projectPath: string,
    filename: string,
    data: Record<string, unknown>,
    serverId: string,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const content = JSON.stringify(data, null, 2);
      const filePath = `.kibitz/${filename}`;
      
      // Preferred: write via BashCommand with heredoc for maximum compatibility
      try {
        const writeResult = await executeTool(serverId, 'BashCommand', {
          action_json: {
            command: `cd "${projectPath}" && mkdir -p .kibitz && cat > "${filePath}" <<'JSON'\n${content}\nJSON`,
            type: 'command'
          },
          thread_id: "kibitz-persistence"
        });
        if (writeResult.includes('Error:')) {
          throw new Error(writeResult);
        }
      } catch {
        // Fallback: echo with escaped content
        const escaped = content.replace(/"/g, '\\"').replace(/\n/g, '\\n');
        const echoResult = await executeTool(serverId, 'BashCommand', {
          action_json: {
            command: `cd "${projectPath}" && mkdir -p .kibitz && echo "${escaped}" > "${filePath}"`,
            type: 'command'
          },
          thread_id: "kibitz-persistence"
        });
        if (echoResult.includes('Error:')) {
          // Last resort: attempt FileWriteOrEdit minimal schema (may not be supported)
          try {
            const feResult = await executeTool(serverId, 'FileWriteOrEdit', {
              file_path: filePath,
              content: content,
              thread_id: "kibitz-persistence"
            });
            if (feResult.includes('Error:')) return { success: false, error: feResult };
          } catch (err) {
            return { success: false, error: err instanceof Error ? err.message : String(err) };
          }
        }
      }
      
      // Verify file was written correctly
      const verifyResult = await executeTool(serverId, 'BashCommand', {
        action_json: {
          command: `cd "${projectPath}" && cat "${filePath}" 2>/dev/null || echo "FILE_NOT_FOUND"`,
          type: 'command'
        },
        thread_id: "kibitz-persistence"
      });
      
      if (verifyResult.includes('FILE_NOT_FOUND') || verifyResult.includes('No such file')) {
        return { success: false, error: 'File verification failed' };
      }
      
      // Parse to verify JSON is valid
      try {
        JSON.parse(verifyResult);
      } catch {
        return { success: false, error: 'Written file contains invalid JSON' };
      }
      
      return { success: true };
      
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }

  /**
   * Robust file reading using MCP BashCommand tool
   */
  private static async readMetadataFileRobust<T>(
    projectPath: string,
    filename: string,
    serverId: string,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
  ): Promise<T | null> {
    try {
      const filePath = `.kibitz/${filename}`;
      
      // Use BashCommand cat for robust file reading
      const result = await executeTool(serverId, 'BashCommand', {
        action_json: {
          command: `cd "${projectPath}" && cat "${filePath}" 2>/dev/null || echo "FILE_NOT_FOUND"`,
          type: 'command'
        },
        thread_id: "kibitz-persistence"
      });
      
      if (result.includes('FILE_NOT_FOUND') || result.includes('No such file')) {
        console.warn(`File ${filename} not found, returning null`);
        return null;
      }
      
      const content = result.trim();
      if (!content) {
        console.warn(`File ${filename} is empty, returning null`);
        return null;
      }
      
      try {
        return JSON.parse(content);
      } catch (parseError) {
        console.error(`Failed to parse JSON from ${filename}:`, parseError);
        return null;
      }
      
    } catch (error) {
      console.error(`Failed to read ${filename}:`, error);
      return null;
    }
  }
  
  /**
   * Save checkpoint metadata to local cache
   */
  static async saveCheckpoint(
    projectPath: string,
    checkpoint: CheckpointMetadata,
    serverId: string,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Read existing checkpoints
      const existingCheckpoints = await this.readMetadataFileRobust<CheckpointMetadata[]>(
        projectPath, 'checkpoints.json', serverId, executeTool
      ) || [];
      
      // Add new checkpoint (keep them sorted by timestamp)
      const updatedCheckpoints = [...existingCheckpoints, checkpoint]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
      // Limit to max checkpoints
      const metadata = await this.getProjectMetadata(projectPath, serverId, executeTool);
      const maxCheckpoints = metadata?.settings.maxCheckpoints || 100;
      const trimmedCheckpoints = updatedCheckpoints.slice(0, maxCheckpoints);
      
      // Write back to file
      const writeResult = await this.writeMetadataFileRobust(projectPath, 'checkpoints.json', trimmedCheckpoints, serverId, executeTool);
      if (!writeResult.success) {
        return writeResult;
      }
      
      // Update project metadata
      if (metadata) {
        metadata.totalCheckpoints = trimmedCheckpoints.length;
        metadata.lastUpdated = new Date();
        const metadataResult = await this.writeMetadataFileRobust(projectPath, 'config.json', metadata, serverId, executeTool);
        if (!metadataResult.success) {
          return metadataResult;
        }
      }
      
      console.log(`✅ Saved checkpoint: ${checkpoint.description}`);
      return { success: true };
      
    } catch (error) {
      console.error('Failed to save checkpoint:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }
  
  /**
   * Save branch metadata to local cache
   */
  static async saveBranch(
    projectPath: string,
    branch: BranchMetadata,
    serverId: string,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Read existing branches
      const existingBranches = await this.readMetadataFileRobust<BranchMetadata[]>(
        projectPath, 'branches.json', serverId, executeTool
      ) || [];
      
      // Update or add branch
      const existingIndex = existingBranches.findIndex(b => b.name === branch.name);
      if (existingIndex >= 0) {
        existingBranches[existingIndex] = branch;
      } else {
        existingBranches.push(branch);
      }
      
      // Mark all other branches as inactive if this one is active
      if (branch.isActive) {
        existingBranches.forEach(b => {
          if (b.name !== branch.name) {
            b.isActive = false;
          }
        });
      }
      
      // Write back to file
      const writeResult = await this.writeMetadataFileRobust(projectPath, 'branches.json', existingBranches, serverId, executeTool);
      if (!writeResult.success) {
        return writeResult;
      }
      
      // Update project metadata
      const metadata = await this.getProjectMetadata(projectPath, serverId, executeTool);
      if (metadata) {
        metadata.totalBranches = existingBranches.length;
        metadata.lastUpdated = new Date();
        const metadataResult = await this.writeMetadataFileRobust(projectPath, 'config.json', metadata, serverId, executeTool);
        if (!metadataResult.success) {
          return metadataResult;
        }
      }
      
      console.log(`✅ Saved branch: ${branch.name}`);
      return { success: true };
      
    } catch (error) {
      console.error('Failed to save branch:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }
  
  /**
   * Get all checkpoints for a project
   */
  static async getCheckpoints(
    projectPath: string,
    serverId: string,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
  ): Promise<CheckpointMetadata[]> {
    const checkpoints = await this.readMetadataFileRobust<CheckpointMetadata[]>(
      projectPath, 'checkpoints.json', serverId, executeTool
    );
    
    // Convert date strings back to Date objects
    return (checkpoints || []).map(checkpoint => ({
      ...checkpoint,
      timestamp: new Date(checkpoint.timestamp)
    }));
  }
  
  /**
   * Get all branches for a project
   */
  static async getBranches(
    projectPath: string,
    serverId: string,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
  ): Promise<BranchMetadata[]> {
    const branches = await this.readMetadataFileRobust<BranchMetadata[]>(
      projectPath, 'branches.json', serverId, executeTool
    );
    
    // Convert date strings back to Date objects
    return (branches || []).map(branch => ({
      ...branch,
      createdAt: new Date(branch.createdAt)
    }));
  }
  
  /**
   * Get project metadata
   */
  static async getProjectMetadata(
    projectPath: string,
    serverId: string,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
  ): Promise<ProjectMetadata | null> {
    const metadata = await this.readMetadataFileRobust<ProjectMetadata>(
      projectPath, 'config.json', serverId, executeTool
    );
    
    if (metadata) {
      // Convert date strings back to Date objects
      metadata.lastUpdated = new Date(metadata.lastUpdated);
    }
    
    return metadata;
  }
  
  /**
   * Scan Git history and rebuild checkpoint cache
   */
  static async rebuildCheckpointsFromGit(
    projectPath: string,
    projectId: string,
    serverId: string,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
  ): Promise<{ success: boolean; checkpoints: CheckpointMetadata[]; error?: string }> {
    try {
      console.log(`🔍 Rebuilding checkpoints from Git history: ${projectPath}`);
      
      // Get all commits with detailed info
      const gitLogResult = await executeGitCommand(
        serverId,
        'git log --pretty=format:"%H|%h|%an|%ae|%ai|%s" --date=iso',
        projectPath,
        executeTool
      );
      
      if (!gitLogResult.success) {
        return { 
          success: false, 
          checkpoints: [], 
          error: 'Failed to read Git history' 
        };
      }
      
      const checkpoints: CheckpointMetadata[] = [];
      const lines = gitLogResult.output.split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        const parts = line.split('|');
        if (parts.length >= 6) {
          const [commitHash, shortHash, , , dateStr, message] = parts;
          
          // Get files changed in this commit
          const filesResult = await executeGitCommand(
            serverId,
            `git diff-tree --no-commit-id --name-only -r ${commitHash}`,
            projectPath,
            executeTool
          );
          
          const filesChanged = filesResult.success 
            ? filesResult.output.split('\n').filter(f => f.trim())
            : [];
          
          // Get line changes
          const statsResult = await executeGitCommand(
            serverId,
            `git show --stat ${commitHash} | grep "changed" || echo "0 insertions"`,
            projectPath,
            executeTool
          );
          
          const linesChanged = parseInt(
            (statsResult.output.match(/(\d+) insertion/) || ['', '0'])[1]
          ) || 0;
          
          // Determine checkpoint type
          let type: 'manual' | 'auto' | 'tool-execution' = 'manual';
          if (message.includes('Auto-commit') || message.includes('Automatic')) {
            type = 'auto';
          } else if (message.includes('Tool execution') || message.includes('After tool')) {
            type = 'tool-execution';
          }
          
          const checkpoint: CheckpointMetadata = {
            id: shortHash,
            projectId,
            description: message,
            timestamp: new Date(dateStr),
            commitHash,
            filesChanged,
            linesChanged,
            type,
            tags: [type, 'git-history']
          };
          
          checkpoints.push(checkpoint);
        }
      }
      
      // Save rebuilt checkpoints
      await this.writeMetadataFileRobust(projectPath, 'checkpoints.json', checkpoints, serverId, executeTool);
      
      console.log(`✅ Rebuilt ${checkpoints.length} checkpoints from Git history`);
      return { success: true, checkpoints };
      
    } catch (error) {
      console.error('Failed to rebuild checkpoints from Git:', error);
      return { 
        success: false, 
        checkpoints: [], 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }
  
  /**
   * Scan Git branches and rebuild branch cache
   */
  static async rebuildBranchesFromGit(
    projectPath: string,
    serverId: string,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
  ): Promise<{ success: boolean; branches: BranchMetadata[]; error?: string }> {
    try {
      console.log(`🔍 Rebuilding branches from Git: ${projectPath}`);
      
      // Get all branches with commit info
      const branchResult = await executeGitCommand(
        serverId,
        'git for-each-ref --format="%(refname:short)|%(objectname)|%(committerdate:iso)|%(subject)" refs/heads/',
        projectPath,
        executeTool
      );
      
      if (!branchResult.success) {
        return { 
          success: false, 
          branches: [], 
          error: 'Failed to read Git branches' 
        };
      }
      
      // Get current branch
      const currentBranchResult = await executeGitCommand(
        serverId,
        'git branch --show-current',
        projectPath,
        executeTool
      );
      
      const currentBranch = currentBranchResult.success ? currentBranchResult.output.trim() : '';
      
      const branches: BranchMetadata[] = [];
      const lines = branchResult.output.split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        const parts = line.split('|');
        if (parts.length >= 4) {
          const [name, commitHash, dateStr, description] = parts;
          
          // Determine branch type from name
          let type: 'feature' | 'bugfix' | 'iteration' | 'experiment' | 'checkpoint' = 'iteration';
          if (name.startsWith('feature/')) type = 'feature';
          else if (name.startsWith('bugfix/')) type = 'bugfix';
          else if (name.startsWith('experiment/')) type = 'experiment';
          else if (name.includes('checkpoint') || name.includes('kibitz')) type = 'checkpoint';
          
          // Get parent branch (simplified - assume main for now)
          const parentBranch = name === 'main' ? '' : 'main';
          
          // Get files changed (compare with parent)
          let filesChanged: string[] = [];
          if (parentBranch) {
            const diffResult = await executeGitCommand(
              serverId,
              `git diff --name-only ${parentBranch}...${name}`,
              projectPath,
              executeTool
            );
            
            if (diffResult.success) {
              filesChanged = diffResult.output.split('\n').filter(f => f.trim());
            }
          }
          
          // Count checkpoints in this branch
          const logResult = await executeGitCommand(
            serverId,
            `git rev-list --count ${name}`,
            projectPath,
            executeTool
          );
          
          const checkpointCount = logResult.success ? parseInt(logResult.output.trim()) || 0 : 0;
          
          const branch: BranchMetadata = {
            name,
            type,
            createdAt: new Date(dateStr),
            parentBranch,
            commitHash,
            description,
            filesChanged,
            isActive: name === currentBranch,
            checkpointCount
          };
          
          branches.push(branch);
        }
      }
      
      // Save rebuilt branches
      await this.writeMetadataFileRobust(projectPath, 'branches.json', branches, serverId, executeTool);
      
      console.log(`✅ Rebuilt ${branches.length} branches from Git`);
      return { success: true, branches };
      
    } catch (error) {
      console.error('Failed to rebuild branches from Git:', error);
      return { 
        success: false, 
        branches: [], 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }
  
  /**
   * Scan all project directories for app restart recovery
   */
  static async scanProjectsForRecovery(
    serverId: string,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
  ): Promise<ProjectRecoveryData[]> {
    try {
      console.log('🔍 Scanning projects for recovery...');
      
      // List all project directories
      const listResult = await executeGitCommand(
        serverId,
        `find "${BASE_PROJECTS_DIR}" -maxdepth 1 -type d -name "*_*" 2>/dev/null || echo ""`,
        '/', // Execute from root since we're scanning the base directory
        executeTool
      );
      
      if (!listResult.success) {
        console.warn('No projects found or failed to scan');
        return [];
      }
      
      const projectDirs = listResult.output
        .split('\n')
        .filter(line => line.trim())
        .filter(path => path.includes('_')); // Only directories with projectId_name format
      
      const recoveryData: ProjectRecoveryData[] = [];
      
      for (const projectPath of projectDirs) {
        try {
          // Extract projectId and name from directory name
          const dirName = projectPath.split('/').pop() || '';
          const underscoreIndex = dirName.indexOf('_');
          if (underscoreIndex === -1) continue;
          
          const projectId = dirName.substring(0, underscoreIndex);
          const projectName = dirName.substring(underscoreIndex + 1).replace(/-/g, ' ');
        
        // Check if it's a Git repository
        const gitCheckResult = await executeGitCommand(
          serverId,
          'git rev-parse --is-inside-work-tree',
          projectPath,
          executeTool
        );
        
        const hasGit = gitCheckResult.success && gitCheckResult.output.includes('true');
          
          // Try to read metadata files
          let metadata: ProjectMetadata | null = null;
          let checkpoints: CheckpointMetadata[] = [];
          let branches: BranchMetadata[] = [];
          
          if (hasGit) {
            // Check if .kibitz directory exists
            const kibitzCheckResult = await executeGitCommand(
              serverId,
              'test -d .kibitz && echo "exists" || echo "missing"',
              projectPath,
              executeTool
            );
            
            if (kibitzCheckResult.output.includes('exists')) {
              // Read existing metadata
              metadata = await this.getProjectMetadata(projectPath, serverId, executeTool);
              checkpoints = await this.getCheckpoints(projectPath, serverId, executeTool);
              branches = await this.getBranches(projectPath, serverId, executeTool);
            } else {
              // Initialize persistence for existing Git repo
              await this.initializeProjectPersistence(
                projectPath, projectId, projectName, serverId, executeTool
              );
              
              // Rebuild from Git history
              const checkpointRebuild = await this.rebuildCheckpointsFromGit(
                projectPath, projectId, serverId, executeTool
              );
              const branchRebuild = await this.rebuildBranchesFromGit(
                projectPath, serverId, executeTool
              );
              
              if (checkpointRebuild.success) checkpoints = checkpointRebuild.checkpoints;
              if (branchRebuild.success) branches = branchRebuild.branches;
              
              metadata = await this.getProjectMetadata(projectPath, serverId, executeTool);
            }
          }
          
          // Create recovery data
          const projectRecovery: ProjectRecoveryData = {
            projectId,
            projectName,
            projectPath,
            hasGit,
            checkpoints,
            branches,
            metadata: metadata || {
              projectId,
              projectName,
              projectPath,
              lastUpdated: new Date(),
              gitInitialized: hasGit,
              totalCheckpoints: checkpoints.length,
              totalBranches: branches.length,
              settings: {
                autoCommitEnabled: true,
                branchingEnabled: true,
                maxCheckpoints: 100,
                maxBranches: 50
              }
            }
          };
          
          recoveryData.push(projectRecovery);
          console.log(`✅ Recovered project: ${projectName} (${checkpoints.length} checkpoints, ${branches.length} branches)`);
          
        } catch (error) {
          console.error(`Failed to recover project from ${projectPath}:`, error);
          // Continue with other projects
        }
      }
      
      console.log(`🎯 Recovery complete: Found ${recoveryData.length} projects`);
      return recoveryData;
      
    } catch (error) {
      console.error('Failed to scan projects for recovery:', error);
      return [];
    }
  }
  
  /**
   * Helper: Write metadata file using old method (deprecated)
   */
  private static async writeMetadataFile(
    projectPath: string,
    filename: string,
    data: Record<string, unknown>,
    serverId: string,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
  ): Promise<void> {
    console.warn('writeMetadataFile is deprecated, use writeMetadataFileRobust instead');
    const result = await this.writeMetadataFileRobust(projectPath, filename, data, serverId, executeTool);
    if (!result.success) {
      throw new Error(result.error || 'Failed to write metadata file');
    }
  }
  
  /**
   * Helper: Read metadata file using old method (deprecated)
   */
  private static async readMetadataFile<T>(
    projectPath: string,
    filename: string,
    serverId: string,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
  ): Promise<T | null> {
    console.warn('readMetadataFile is deprecated, use readMetadataFileRobust instead');
    return await this.readMetadataFileRobust<T>(projectPath, filename, serverId, executeTool);
  }
} 