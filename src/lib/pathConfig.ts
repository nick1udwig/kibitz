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
  let v = String(pathValue).trim();
  // Strip UI masking bullets and invisible/zero-width or control characters
  v = v
    .replace(/[•\u2022]+/g, '')
    .replace(/[\u200B\u200C\u200D\u2060\uFEFF\u00A0\u202F]+/g, '')
    .replace(/[\u0000-\u001F\u007F]+/g, '');
  // If it looks like a macOS path missing leading slash, add it
  if (!v.startsWith('/') && /^Users\//.test(v)) v = '/' + v;
  return v.replace(/\/+$/, '');
}

export function getProjectsBaseDir(): string {
  // Server/runtime env (Node)
  const fromRuntime = normalizePathNoTrailingSlash(
    process.env.PROJECT_WORKSPACE_PATH || process.env.USER_PROJECTS_PATH
  );

  // Client: prefer persisted localStorage value (available immediately on load)
  let fromStorage: string | undefined;
  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage?.getItem('kibitz_projects_base_dir') || undefined;
      fromStorage = normalizePathNoTrailingSlash(stored || undefined);
    } catch {}
  }

  // Client runtime hint set by Admin save

  const fromWindow = (typeof window !== 'undefined' && (window as Record<string, unknown>).__KIBITZ_PROJECTS_BASE_DIR__)
    ? normalizePathNoTrailingSlash((window as Record<string, unknown>).__KIBITZ_PROJECTS_BASE_DIR__ as string)
    : undefined;

  // Client-side/compile-time env (Next.js exposes NEXT_PUBLIC_* to browser)
  const fromClient = normalizePathNoTrailingSlash(process.env.NEXT_PUBLIC_PROJECTS_DIR);

  const resolved = fromRuntime || fromStorage || fromWindow || fromClient || DEFAULT_PROJECTS_DIR;
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


