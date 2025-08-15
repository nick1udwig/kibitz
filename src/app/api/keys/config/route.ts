import { NextRequest, NextResponse } from 'next/server';
export const runtime = 'nodejs';
import { loadPersistedServerConfig, persistServerConfig } from '../../../../lib/server/configVault';

export async function GET() {
  try {
    const cfg = loadPersistedServerConfig();
    return NextResponse.json({
      success: true,
      config: {
        githubToken: cfg.githubToken ? '••••••••' + cfg.githubToken.slice(-4) : '',
        githubUsername: cfg.githubUsername || '',
        projectsBaseDir: cfg.projectsBaseDir || '',
        updatedAt: cfg.updatedAt || ''
      }
    });
  } catch {
    return NextResponse.json({ success: false, error: 'failed-to-read-config' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const sanitize = (input: string): string => {
      let s = String(input || '').trim();
      s = s
        .replace(/[•\u2022]+/g, '')
        .replace(/[\u200B\u200C\u200D\u2060\uFEFF\u00A0\u202F]+/g, '')
        .replace(/[\u0000-\u001F\u007F]+/g, '')
        .replace(/\/+$/, '');
      if (!s.startsWith('/') && /^Users\//.test(s)) s = '/' + s;
      return s;
    };
    const projectsBaseDir = typeof body?.projectsBaseDir === 'string' ? sanitize(body.projectsBaseDir) : '';
    if (!projectsBaseDir) {
      return NextResponse.json({ success: false, error: 'projectsBaseDir-required' }, { status: 400 });
    }
    // 1) Persist (best-effort; requires KIBITZ_CONFIG_SECRET)
    try { persistServerConfig({ projectsBaseDir }); } catch {}
    // 2) Also update in-memory apiKeysStorage so server immediately honors it
    try {
      const keysModule = await import('../../keys/route');
      if (keysModule && (keysModule as { apiKeysStorage?: { projectsBaseDir?: string } }).apiKeysStorage) {
        (keysModule as { apiKeysStorage: { projectsBaseDir?: string } }).apiKeysStorage.projectsBaseDir = projectsBaseDir;
      }
    } catch {}
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: 'failed-to-save-config' }, { status: 500 });
  }
}


