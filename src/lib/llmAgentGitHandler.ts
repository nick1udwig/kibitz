/**
 * LLM Agent Git Handler
 * 
 * Handles git operations at the end of LLM agent cycles to ensure:
 * - Git repository is initialized
 * - Changes are staged and committed
 * - Project state is saved to JSON files
 */

import { getProjectPath } from './projectPathService';
import { VersionControlManager } from './versionControl';
import { executeGitCommand } from './versionControl/git';
import GitThreadManager from './versionControl/GitThreadManager';
import type { ProjectSettings } from '../components/LlmChat/context/types';

export interface LlmAgentGitResult {
  success: boolean;
  gitInitialized: boolean;
  changesCommitted: boolean;
  commitSha?: string;
  error?: string;
}

export class LlmAgentGitHandler {
  private static instance: LlmAgentGitHandler | null = null;
  // Thread handling is delegated to GitThreadManager; no local cache here.

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

      // Step 1: Ensure MCP thread is initialized via centralized manager (one-time per project/server)
      await GitThreadManager.getInstance().getThreadId(mcpServerId, projectPath, executeTool);

      // Step 2: Initialize git repository if needed
      let gitInitialized = false;
      if (forceInit || await this.needsGitInit(projectPath, executeTool, mcpServerId)) {
        gitInitialized = await this.initializeGit(projectPath, executeTool, mcpServerId);
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
        const hasChanges = await this.checkForChanges(projectPath, executeTool, mcpServerId);
        
        // Enforce UI-configured min files before auto commit/push
        if (hasChanges) {
          let changedCount = 0;
          let minFiles = 0;
          let activeConversationId: string | null = null;
          try {
            const { useStore } = await import('../stores/rootStore');
            const st = useStore.getState();
            // projectId is passed in; resolve current project
            const project = st.projects.find(p => p.id === projectId);
            activeConversationId = st.activeConversationId || null;
            // Count changed files now
            const statusRes = await executeGitCommand(mcpServerId, 'git status --porcelain', projectPath, executeTool);
            const output = (statusRes.output || '').trim();
            changedCount = output ? output.split('\n').filter(l => l.trim()).length : 0;
            minFiles = (project?.settings?.minFilesForAutoCommitPush ?? 0) as number;
            if (minFiles > 0 && changedCount < minFiles) {
              console.log(`ℹ️ LlmAgentGitHandler: Skipping auto-commit (changed ${changedCount} < min ${minFiles})`);
              // Still proceed to JSON extraction for freshness if repo exists
              return {
                success: true,
                gitInitialized,
                changesCommitted: false
              };
            }
          } catch (e) {
            console.warn('⚠️ LlmAgentGitHandler: Could not enforce minFilesForAutoCommitPush, continuing', e);
          }

          // Fallback step-branch creation here too (when auto-commit path didn't run)
          // If we have an active conversation and threshold satisfied, ensure we advance to next conv-<id>-step-N
          try {
            if (activeConversationId && (changedCount >= Math.max(2, minFiles))) {
              const convPrefix = `conv-${activeConversationId}-step-`;
              // Determine current branch
              const curBrRes = await executeGitCommand(mcpServerId, 'git branch --show-current', projectPath, executeTool);
              const curBranch = (curBrRes.success && curBrRes.output.trim()) ? curBrRes.output.trim() : 'main';
              // Scan existing steps to find highest
              const refsRes = await executeGitCommand(mcpServerId, 'git for-each-ref refs/heads --format="%(refname:short)"', projectPath, executeTool);
              const namesText = refsRes.output || '';
              let highestStep = 0;
              if (namesText.trim()) {
                namesText.split('\n').map(s => s.trim()).filter(Boolean)
                  .filter(n => n.startsWith(convPrefix))
                  .forEach(n => { const m = n.match(/step-(\d+)$/); if (m) highestStep = Math.max(highestStep, parseInt(m[1], 10)); });
              }
              const baseBranch = highestStep === 0 ? 'main' : `${convPrefix}${highestStep}`;
              const nextBranch = `${convPrefix}${highestStep + 1}`;
              if (curBranch !== nextBranch) {
                // Try to create directly from base
                let mkRes = await executeGitCommand(mcpServerId, `git checkout -b ${nextBranch} ${baseBranch}`, projectPath, executeTool);
                let mkOk = mkRes.success;
                if (!mkOk) {
                  // Fallback: stash → checkout base → create → pop
                  await executeGitCommand(mcpServerId, 'git stash push -u -m "kibitz-autobranch" || true', projectPath, executeTool);
                  const coRes = await executeGitCommand(mcpServerId, `git checkout ${baseBranch}`, projectPath, executeTool);
                  const coOk = coRes.success;
                  if (coOk) {
                    mkRes = await executeGitCommand(mcpServerId, `git checkout -b ${nextBranch}`, projectPath, executeTool);
                    mkOk = mkRes.success;
                  }
                  await executeGitCommand(mcpServerId, 'git stash pop || true', projectPath, executeTool);
                }
                if (mkOk) {
                  console.log(`🌿 LlmAgentGitHandler: Created step branch ${nextBranch}`);
                } else {
                  console.log(`⚠️ LlmAgentGitHandler: Could not create step branch, continuing on ${curBranch}`);
                }
              }
            }
          } catch (stepErr) {
            console.warn('⚠️ LlmAgentGitHandler: Step-branch fallback failed:', stepErr);
          }

          console.log(`🔄 LlmAgentGitHandler: Changes detected, creating commit...`);
          // Resolve ProjectSettings for VersionControlManager
          let projectSettings: ProjectSettings;
          try {
            const { useStore } = await import('../stores/rootStore');
            const st = useStore.getState();
            const project = st.projects.find(p => p.id === projectId);
            projectSettings = project?.settings as ProjectSettings;
          } catch {
            projectSettings = {
              model: 'default',
              systemPrompt: '',
              mcpServerIds: [],
              elideToolResults: false,
              messageWindowSize: 20,
              enableGitHub: false
            } as ProjectSettings;
          }
          const commitResult = await this.createCommit(projectPath, commitMessage, projectSettings, executeTool, mcpServerId);
          
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
   * Check if git repository needs initialization
   */
  private async needsGitInit(
    projectPath: string,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>,
    mcpServerId: string
  ): Promise<boolean> {
    try {
      const res = await executeGitCommand(mcpServerId, 'git rev-parse --is-inside-work-tree', projectPath, executeTool);
      const hasGit = res.success && res.output.includes('true');
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
    mcpServerId: string
  ): Promise<boolean> {
    try {
      console.log(`🔄 LlmAgentGitHandler: Initializing git repository...`);
      
      // Do not hardcode identity; just initialize repo. Identity must come from env or git config
      const initRes = await executeGitCommand(
        mcpServerId,
        '(git init -b main || git init); git show-ref --verify --quiet refs/heads/master && git branch -m master main || true',
        projectPath,
        executeTool
      );

      const output = (initRes.output || '');
      const success = output.includes('Initialized empty Git repository') || 
                     output.includes('Reinitialized existing Git repository') ||
                     !output.includes('Error:');

      if (success) {
        console.log(`✅ LlmAgentGitHandler: Git repository initialized successfully`);
        // Ensure HEAD references main branch without creating commits
        try {
          await executeGitCommand(mcpServerId, 'git symbolic-ref HEAD refs/heads/main || true', projectPath, executeTool);
        } catch {}
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
    mcpServerId: string
  ): Promise<boolean> {
    try {
      const res = await executeGitCommand(mcpServerId, 'git status --porcelain', projectPath, executeTool);
      const txt = (res.output || '').trim();
      const hasChanges = res.success && txt.length > 0;
      console.log(`🔍 LlmAgentGitHandler: Changes detected: ${hasChanges}`);
      if (hasChanges) {
        console.log(`📄 LlmAgentGitHandler: Changed files:\n${txt}`);
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
    projectSettings: ProjectSettings,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>,
    mcpServerId: string
  ): Promise<{ success: boolean; commitSha?: string; error?: string }> {
    try {
      // Use VersionControlManager for standardized commit
      const vcm = new VersionControlManager(projectPath, mcpServerId, executeTool);
      const executed = await vcm.executeCommit(commitMessage, projectSettings);
      if (executed.success && executed.commitHash && executed.commitHash !== 'no_changes') {
        const commitSha = executed.commitHash;

        console.log(`🚀 LLM-AGENT: Commit successful. Requesting server push orchestrator...`);
        // Delegate pushing to server orchestrator to avoid duplicate initiators
        try {
          // Resolve branch
          const branchResult = await executeGitCommand(mcpServerId, 'git branch --show-current', projectPath, executeTool);
          const currentBranch = (branchResult.success && branchResult.output.trim()) ? branchResult.output.trim() : 'main';

          // HEAD check
          try {
            const headCheck = await executeGitCommand(mcpServerId, 'git rev-parse --verify HEAD', projectPath, executeTool);
            const headOk = headCheck.success && (headCheck.output || '').toLowerCase().includes('fatal') === false;
            if (!headOk || !currentBranch) {
              console.log('ℹ️ LLM-AGENT PUSH: No commits or branch missing; skipping orchestrator request.');
              return { success: true } as { success: boolean };
            }
          } catch {
            console.log('ℹ️ LLM-AGENT PUSH: HEAD not found; skipping orchestrator request.');
            return { success: true } as { success: boolean };
          }

          if (typeof fetch !== 'undefined') {
            const dirName = projectPath.split('/').pop() || '';
            const projectId = dirName.split('_')[0] || '';
            const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';
            await fetch(`${BASE_PATH}/api/github-sync/trigger`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ projectId, immediate: true, force: true, branchName: currentBranch })
            }).catch(() => {});
          }
        } catch (pushError) {
          console.log(`❌ LLM-AGENT: Error requesting orchestrator:`, pushError);
        }

        return { success: true, commitSha };
      }
      return { success: false, error: executed.error || 'Commit failed' };

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