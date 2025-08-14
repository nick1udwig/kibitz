import { ProjectSettings } from '../../components/LlmChat/context/types';

export interface McpExecutor {
  (serverId: string, toolName: string, args: Record<string, unknown>): Promise<string>;
}

export interface CommitPreparationContext {
  projectPath: string;
  serverId: string;
  executeTool: McpExecutor;
  projectSettings: ProjectSettings;
  branchName?: string | null;
  conversationId?: string | null;
}

export interface CommitPreparationResult {
  success: boolean;
  commitMessage: string;
  filesChanged: string[];
  linesAdded: number;
  linesRemoved: number;
  diff?: string;
  error?: string;
}

export interface CommitExecutionResult {
  success: boolean;
  commitHash: string | null;
  message: string;
  error?: string;
}

export interface RollbackToCommitParams {
  projectPath: string;
  serverId: string;
  executeTool: McpExecutor;
  commitHash: string;
  options?: RollbackOptions;
}

export interface RollbackOptions {
  stashChanges?: boolean;
  createBackup?: boolean;
  force?: boolean;
}

export interface RollbackResult {
  success: boolean;
  error?: string;
  backupBranch?: string;
  message?: string;
}

export interface PushResult {
  success: boolean;
  output: string;
  error?: string;
}


