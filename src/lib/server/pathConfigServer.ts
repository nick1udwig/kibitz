/**
 * Server-only projects base directory resolver.
 * Prefers UI-persisted override, then runtime env, then NEXT_PUBLIC hint, then default.
 */

export function getServerProjectsBaseDir(): string {
  const DEFAULT_PROJECTS_DIR = '/Users/test/gitrepo/projects';

  const normalize = (v?: string) => {
    if (!v) return undefined;
    let s = String(v).trim();
    // Remove accidentally masked bullets: "••••••••shim"
    s = s.replace(/[•\u2022]+/g, '');
    if (!s.startsWith('/') && /^Users\//.test(s)) s = '/' + s;
    return s.replace(/\/+$/, '');
  };

  // Runtime env (highest precedence on server)
  const fromRuntime = normalize(process.env.PROJECT_WORKSPACE_PATH || process.env.USER_PROJECTS_PATH);

  // Persisted override from encrypted server config
  let fromPersisted: string | undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const vault = require('./configVault') as typeof import('./configVault');
    const cfg = vault.loadPersistedServerConfig?.();
    if (cfg && typeof cfg.projectsBaseDir === 'string' && cfg.projectsBaseDir.trim()) {
      fromPersisted = normalize(cfg.projectsBaseDir.trim());
    }
  } catch {}

  // In-memory UI override (if persistence secret is not configured)
  let fromMemory: string | undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const keysModule = require('../../app/api/keys/route');
    const apiKeysStorage = (keysModule && (keysModule.apiKeysStorage as Record<string, string>)) || undefined;
    const mem = apiKeysStorage?.projectsBaseDir;
    if (typeof mem === 'string' && mem.trim()) {
      fromMemory = normalize(mem.trim());
    }
  } catch {}

  // Client hint
  const fromClient = normalize(process.env.NEXT_PUBLIC_PROJECTS_DIR);

  const resolved = fromRuntime || fromMemory || fromPersisted || fromClient || DEFAULT_PROJECTS_DIR;
  return normalize(resolved) || DEFAULT_PROJECTS_DIR;
}


