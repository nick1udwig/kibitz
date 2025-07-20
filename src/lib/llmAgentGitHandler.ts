/**
 * LLM Agent Git Handler
 * 
 * Handles git operations at the end of LLM agent cycles to ensure:
 * - Git repository is initialized
 * - Changes are staged and committed
 * - Project state is saved to JSON files
 */

import { getProjectPath } from './projectPathService';

export interface LlmAgentGitResult {
  success: boolean;
  gitInitialized: boolean;
  changesCommitted: boolean;
  commitSha?: string;
  error?: string;
}

export class LlmAgentGitHandler {
  private static instance: LlmAgentGitHandler | null = null;

  static getInstance(): LlmAgentGitHandler {
    if (!LlmAgentGitHandler.instance) {
      LlmAgentGitHandler.instance = new LlmAgentGitHandler();
    }
    return LlmAgentGitHandler.instance;
  }

  /**
   * Handle git operations at the end of LLM agent cycle
   */
  async handleEndOfAgentCycle(
    projectId: string,
    projectName: string,
    mcpServerId: string,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>,
    options: {
      autoCommit?: boolean;
      commitMessage?: string;
      forceInit?: boolean;
    } = {}
  ): Promise<LlmAgentGitResult> {
    const {
      autoCommit = true,
      commitMessage = `End of LLM agent cycle: ${new Date().toISOString()}`,
      forceInit = false
    } = options;

    try {
      console.log(`🔄 LlmAgentGitHandler: Starting end-of-cycle git operations for project ${projectId}`);

      // Get project path
      const projectPath = getProjectPath(projectId, projectName);
      console.log(`📂 LlmAgentGitHandler: Project path: ${projectPath}`);

      // Step 1: Initialize MCP thread
      const threadId = await this.initializeMcpThread(projectPath, executeTool, mcpServerId);

      // Step 2: Initialize git repository if needed
      let gitInitialized = false;
      if (forceInit || await this.needsGitInit(projectPath, executeTool, mcpServerId, threadId)) {
        gitInitialized = await this.initializeGit(projectPath, executeTool, mcpServerId, threadId);
        if (!gitInitialized) {
          return {
            success: false,
            gitInitialized: false,
            changesCommitted: false,
            error: 'Failed to initialize git repository'
          };
        }
      } else {
        gitInitialized = true;
        console.log(`✅ LlmAgentGitHandler: Git repository already initialized`);
      }

      // Step 3: Check for changes and commit if auto-commit is enabled
      let changesCommitted = false;
      let commitSha: string | undefined;

      if (autoCommit) {
        const hasChanges = await this.checkForChanges(projectPath, executeTool, mcpServerId, threadId);
        
        if (hasChanges) {
          console.log(`🔄 LlmAgentGitHandler: Changes detected, creating commit...`);
          const commitResult = await this.createCommit(projectPath, commitMessage, executeTool, mcpServerId, threadId);
          
          if (commitResult.success) {
            changesCommitted = true;
            commitSha = commitResult.commitSha;
            console.log(`✅ LlmAgentGitHandler: Commit created with SHA: ${commitSha}`);
          } else {
            console.warn(`⚠️ LlmAgentGitHandler: Failed to create commit: ${commitResult.error}`);
            // Don't fail the entire operation if commit fails
          }
        } else {
          console.log(`ℹ️ LlmAgentGitHandler: No changes to commit`);
        }
      }

      // Step 4: Extract and save comprehensive project data to JSON
      if (autoCommit && (gitInitialized || changesCommitted)) {
        try {
          console.log(`📋 LlmAgentGitHandler: Extracting comprehensive project data...`);
          const { extractAndSaveProjectData } = await import('./projectDataExtractor');
          
          // Extract all project data and save structured JSON files
          const projectData = await extractAndSaveProjectData(
            projectId,
            projectName,
            mcpServerId,
            executeTool
          );
          
          console.log(`✅ LlmAgentGitHandler: Project data extracted and saved:`, {
            branches: projectData.repository.totalBranches,
            commits: projectData.repository.totalCommits,
            jsonFiles: ['.kibitz/api/project.json', '.kibitz/api/branches.json', '.kibitz/summary.json']
          });
          
        } catch (error) {
          console.warn(`⚠️ LlmAgentGitHandler: Project data extraction failed, but continuing:`, error);
          // Don't fail the entire operation
        }
      }

      return {
        success: true,
        gitInitialized,
        changesCommitted,
        commitSha
      };

    } catch (error) {
      console.error('❌ LlmAgentGitHandler: End-of-cycle git operations failed:', error);
      return {
        success: false,
        gitInitialized: false,
        changesCommitted: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Initialize MCP thread for git operations
   */
  private async initializeMcpThread(
    projectPath: string,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>,
    mcpServerId: string
  ): Promise<string> {
    const threadId = `llm-git-${Date.now()}`;
    
    try {
      console.log(`🔧 LlmAgentGitHandler: Initializing MCP thread: ${threadId}`);
      await executeTool(mcpServerId, 'Initialize', {
        type: "first_call",
        any_workspace_path: projectPath,
        initial_files_to_read: [],
        task_id_to_resume: "",
        mode_name: "wcgw",
        thread_id: threadId
      });
      console.log(`✅ LlmAgentGitHandler: MCP thread initialized: ${threadId}`);
      return threadId;
    } catch (error) {
      console.warn(`⚠️ LlmAgentGitHandler: Failed to initialize MCP thread, using default:`, error);
      return "git-operations"; // Fallback to default
    }
  }

  /**
   * Check if git repository needs initialization
   */
  private async needsGitInit(
    projectPath: string,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>,
    mcpServerId: string,
    threadId: string
  ): Promise<boolean> {
    try {
      const result = await executeTool(mcpServerId, 'BashCommand', {
        action_json: {
          command: `cd "${projectPath}" && test -d .git && echo "has_git" || echo "no_git"`,
          type: 'command'
        },
        thread_id: threadId
      });

      const hasGit = this.extractCommandOutput(result).trim() === 'has_git';
      console.log(`🔍 LlmAgentGitHandler: Git repository exists: ${hasGit}`);
      return !hasGit;
    } catch (error) {
      console.warn(`⚠️ LlmAgentGitHandler: Failed to check git status, assuming init needed:`, error);
      return true;
    }
  }

  /**
   * Initialize git repository
   */
  private async initializeGit(
    projectPath: string,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>,
    mcpServerId: string,
    threadId: string
  ): Promise<boolean> {
    try {
      console.log(`🔄 LlmAgentGitHandler: Initializing git repository...`);
      
      const initResult = await executeTool(mcpServerId, 'BashCommand', {
        action_json: {
          command: `cd "${projectPath}" && git init && git config user.email "agent@kibitz.ai" && git config user.name "Kibitz Agent"`,
          type: 'command'
        },
        thread_id: threadId
      });

      const output = this.extractCommandOutput(initResult);
      const success = output.includes('Initialized empty Git repository') || 
                     output.includes('Reinitialized existing Git repository') ||
                     !output.includes('Error:');

      if (success) {
        console.log(`✅ LlmAgentGitHandler: Git repository initialized successfully`);
      } else {
        console.error(`❌ LlmAgentGitHandler: Git initialization failed:`, output);
      }

      return success;
    } catch (error) {
      console.error('❌ LlmAgentGitHandler: Git initialization error:', error);
      return false;
    }
  }

  /**
   * Check for uncommitted changes
   */
  private async checkForChanges(
    projectPath: string,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>,
    mcpServerId: string,
    threadId: string
  ): Promise<boolean> {
    try {
      const statusResult = await executeTool(mcpServerId, 'BashCommand', {
        action_json: {
          command: `cd "${projectPath}" && git status --porcelain`,
          type: 'command'
        },
        thread_id: threadId
      });

      const statusOutput = this.extractCommandOutput(statusResult).trim();
      const hasChanges = statusOutput.length > 0;
      
      console.log(`🔍 LlmAgentGitHandler: Changes detected: ${hasChanges}`);
      if (hasChanges) {
        console.log(`📄 LlmAgentGitHandler: Changed files:\n${statusOutput}`);
      }

      return hasChanges;
    } catch (error) {
      console.warn(`⚠️ LlmAgentGitHandler: Failed to check for changes:`, error);
      return false;
    }
  }

  /**
   * Create commit with all changes
   */
  private async createCommit(
    projectPath: string,
    commitMessage: string,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>,
    mcpServerId: string,
    threadId: string
  ): Promise<{ success: boolean; commitSha?: string; error?: string }> {
    try {
      // Add all changes
      const addResult = await executeTool(mcpServerId, 'BashCommand', {
        action_json: {
          command: `cd "${projectPath}" && git add .`,
          type: 'command'
        },
        thread_id: threadId
      });

      console.log(`🔄 LlmAgentGitHandler: Added all changes to staging`);

      // Create commit
      const commitResult = await executeTool(mcpServerId, 'BashCommand', {
        action_json: {
          command: `cd "${projectPath}" && git commit -m "${commitMessage}"`,
          type: 'command'
        },
        thread_id: threadId
      });

      const commitOutput = this.extractCommandOutput(commitResult);
      const commitSuccess = !commitOutput.includes('Error:') && 
                           !commitOutput.includes('fatal:') &&
                           !commitOutput.includes('nothing to commit');

      if (commitSuccess) {
        // Get commit SHA
        const shaResult = await executeTool(mcpServerId, 'BashCommand', {
          action_json: {
            command: `cd "${projectPath}" && git rev-parse HEAD`,
            type: 'command'
          },
          thread_id: threadId
        });

        const commitSha = this.extractCommandOutput(shaResult).trim();

        return {
          success: true,
          commitSha
        };
      } else {
        return {
          success: false,
          error: `Commit failed: ${commitOutput}`
        };
      }

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Extract command output from MCP result
   */
  private extractCommandOutput(result: string): string {
    try {
      // Extract output from structured result
      const lines = result.split('\n');
      const outputStart = lines.findIndex(line => 
        line.includes('status = process exited') || 
        line.includes('---')
      );
      
      if (outputStart > 0) {
        return lines.slice(0, outputStart).join('\n');
      }
      return result;
    } catch {
      return result;
    }
  }
}

/**
 * Convenience function to trigger git operations at end of LLM cycle
 */
export async function triggerEndOfLlmCycleGit(
  projectId: string,
  projectName: string,
  mcpServerId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>,
  options?: {
    autoCommit?: boolean;
    commitMessage?: string;
    forceInit?: boolean;
  }
): Promise<LlmAgentGitResult> {
  const handler = LlmAgentGitHandler.getInstance();
  return handler.handleEndOfAgentCycle(projectId, projectName, mcpServerId, executeTool, options);
} 