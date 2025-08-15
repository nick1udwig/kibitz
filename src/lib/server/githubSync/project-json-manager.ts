// TypeScript wrapper for project-json-manager.js functions
// This provides proper typing and avoids ES6 import issues in Next.js

export interface GitHubConfig {
  enabled: boolean;
  remoteUrl: string | null;
  syncBranches: string[];
  syncStatus: 'idle' | 'syncing' | 'error' | 'disabled';
  authentication: {
    type: string;
    configured: boolean;
  };
}

export interface ProjectData {
  projectId: string;
  projectName: string;
  projectPath: string;
  github?: GitHubConfig;
  metadata?: {
    version: string;
    generated: number;
  };
}

// Dynamic import to avoid ES6 module issues
let projectJsonManager: any = null;

async function getProjectJsonManager() {
  if (!projectJsonManager) {
    try {
      projectJsonManager = await import('../../../../scripts/project-json-manager.js');
    } catch (error) {
      console.error('Failed to load project-json-manager:', error);
      throw new Error('Project JSON manager not available');
    }
  }
  return projectJsonManager;
}

export async function updateGitHubConfig(projectPath: string, config: Partial<GitHubConfig>): Promise<void> {
  const manager = await getProjectJsonManager();
  return manager.updateGitHubConfig(projectPath, config);
}

export async function readProjectJson(projectPath: string): Promise<ProjectData> {
  const manager = await getProjectJsonManager();
  return manager.readProjectJson(projectPath);
}

export async function writeProjectJson(projectPath: string, data: ProjectData): Promise<void> {
  const manager = await getProjectJsonManager();
  return manager.writeProjectJson(projectPath, data);
}

export async function ensureKibitzDirectory(projectPath: string): Promise<void> {
  const manager = await getProjectJsonManager();
  return manager.ensureKibitzDirectory(projectPath);
}

export async function validateProjectJson(data: any): Promise<boolean> {
  const manager = await getProjectJsonManager();
  return manager.validateProjectJson(data);
}
