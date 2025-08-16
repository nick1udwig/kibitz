/**
 * Server-only projects base directory resolver.
 * Prefers UI-persisted override, then runtime env, then NEXT_PUBLIC hint, then default.
 */

export function getServerProjectsBaseDir(): string {
  const DEFAULT_PROJECTS_DIR = '/Users/test/gitrepo/projects';

  const normalize = (v?: string) => {
    if (!v) return undefined;
    let s = String(v).trim();
    // Remove accidentally masked bullets and invisible/zero-width characters that can corrupt paths
    // - Bullets used by UI masking: \u2022
    // - Common zero-width/invisible chars: \u200B, \u200C, \u200D, \u2060, \uFEFF
    // - Non-breaking/narrow spaces that sneak in from copy/paste: \u00A0, \u202F
    s = s
      .replace(/[•\u2022]+/g, '')
      .replace(/[\u200B\u200C\u200D\u2060\uFEFF\u00A0\u202F]+/g, '')
      .replace(/[\u0000-\u001F\u007F]+/g, ''); // control chars incl. newlines
    if (!s.startsWith('/') && /^Users\//.test(s)) s = '/' + s;
    return s.replace(/\/+$/, '');
  };

  // Runtime env (highest precedence on server)
  const fromRuntime = normalize(process.env.PROJECT_WORKSPACE_PATH || process.env.USER_PROJECTS_PATH);

  // Persisted override from encrypted server config (disabled in sync function context)
  // If needed later, refactor this resolver to be async and plumb through callers.
  const fromPersisted: string | undefined = undefined;

  // In-memory UI override (disabled in sync function context)
  const fromMemory: string | undefined = undefined;

  // Client hint
  const fromClient = normalize(process.env.NEXT_PUBLIC_PROJECTS_DIR);

  const resolved = fromRuntime || fromMemory || fromPersisted || fromClient || DEFAULT_PROJECTS_DIR;
  return normalize(resolved) || DEFAULT_PROJECTS_DIR;
}


