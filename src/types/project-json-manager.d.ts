declare module '@/lib/server/githubSync/project-json-manager.js' {
  // Minimal ambient declarations to appease TypeScript for JS re-export module
  export function readProjectJson(projectPath: string): Promise<any>;
  export function writeProjectJson(projectPath: string, data: any): Promise<void>;
  export function updateGitHubConfig(projectPath: string, config: any): Promise<void>;
  export function updateSyncStatus(projectPath: string, status: string): Promise<void>;
  export function updateBranchSyncStatus(projectPath: string, branchName: string, syncData: any): Promise<void>;
  export function getAllProjectsWithGitHub(): Promise<any[]>;
  export function ensureKibitzDirectory(projectPath: string): Promise<void>;
  export function migrateProjectToV2(projectPath: string): Promise<boolean>;
  export function getProjectPath(conversationId: string, projectName: string): string;
}


