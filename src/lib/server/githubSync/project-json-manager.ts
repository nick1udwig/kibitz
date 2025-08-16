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
// Use a minimally-typed interface instead of any to satisfy lint rules
type ProjectJsonManagerModule = {
  updateGitHubConfig: (projectPath: string, config: Partial<GitHubConfig>) => Promise<void>;
  readProjectJson: (projectPath: string) => Promise<ProjectData>;
  writeProjectJson: (projectPath: string, data: ProjectData) => Promise<void>;
  ensureKibitzDirectory: (projectPath: string) => Promise<void>;
  validateProjectJson?: (data: unknown) => Promise<boolean>;
} | null;

let projectJsonManager: ProjectJsonManagerModule = null;

async function getProjectJsonManager(): Promise<NonNullable<ProjectJsonManagerModule>> {
  if (!projectJsonManager) {
    try {
      projectJsonManager = (await import('../../../../scripts/project-json-manager.js')) as unknown as ProjectJsonManagerModule;
    } catch (error) {
      console.error('Failed to load project-json-manager:', error);
      throw new Error('Project JSON manager not available');
    }
  }
  return projectJsonManager as NonNullable<ProjectJsonManagerModule>;
}

export async function updateGitHubConfig(projectPath: string, config: Partial<GitHubConfig>): Promise<void> {
  const manager = await getProjectJsonManager();
  return manager.updateGitHubConfig(projectPath, config);
}

export async function readProjectJson(projectPath: string): Promise<ProjectData> {
  const manager = await getProjectJsonManager();
  return manager.readProjectJson(projectPath) as unknown as ProjectData;
}

export async function writeProjectJson(projectPath: string, data: ProjectData): Promise<void> {
  const manager = await getProjectJsonManager();
  return manager.writeProjectJson(projectPath, data);
}

export async function ensureKibitzDirectory(projectPath: string): Promise<void> {
  const manager = await getProjectJsonManager();
  return manager.ensureKibitzDirectory(projectPath);
}

export async function validateProjectJson(data: unknown): Promise<boolean> {
  const manager = await getProjectJsonManager();
  if (typeof manager.validateProjectJson === 'function') {
    return manager.validateProjectJson(data);
  }
  // If not implemented in JS module, default to true
  return true;
}
