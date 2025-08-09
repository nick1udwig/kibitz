/**
 * Workspace/Projects path configuration
 *
 * Single source of truth for determining the absolute base directory
 * where Kibitz creates and manages project workspaces.
 *
 * Priority order:
 * 1) PROJECT_WORKSPACE_PATH (runtime, server/container)
 * 2) USER_PROJECTS_PATH (runtime, server/container)
 * 3) NEXT_PUBLIC_PROJECTS_DIR (compile-time, exposed to client)
 * 4) Default hardcoded fallback (local dev)
 */

const DEFAULT_PROJECTS_DIR = '/Users/test/gitrepo/projects';

function normalizePathNoTrailingSlash(pathValue: string | undefined): string | undefined {
  if (!pathValue) return undefined;
  return pathValue.replace(/\/+$/, '');
}

export function getProjectsBaseDir(): string {
  // Server/runtime env (Node)
  const fromRuntime = normalizePathNoTrailingSlash(
    process.env.PROJECT_WORKSPACE_PATH || process.env.USER_PROJECTS_PATH
  );

  // Client-side/compile-time env (Next.js exposes NEXT_PUBLIC_* to browser)
  const fromClient = normalizePathNoTrailingSlash(process.env.NEXT_PUBLIC_PROJECTS_DIR);

  const resolved = fromRuntime || fromClient || DEFAULT_PROJECTS_DIR;
  return normalizePathNoTrailingSlash(resolved) || DEFAULT_PROJECTS_DIR;
}

export function buildProjectsSubpath(...parts: string[]): string {
  const base = getProjectsBaseDir();
  const suffix = parts
    .filter(Boolean)
    .map(p => String(p).replace(/^\/+|\/+$/g, ''))
    .join('/');
  return suffix ? `${base}/${suffix}` : base;
}

export function isInsideProjectsDir(targetPath: string): boolean {
  const base = getProjectsBaseDir();
  const normalizedTarget = normalizePathNoTrailingSlash(targetPath) || '';
  return normalizedTarget === base || normalizedTarget.startsWith(`${base}/`);
}

export const DEFAULTS = {
  PROJECTS_DIR: DEFAULT_PROJECTS_DIR,
};


