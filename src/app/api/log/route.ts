import { NextRequest, NextResponse } from 'next/server';
import { getProjectsBaseDir } from '../../../lib/pathConfig';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { projectPath, lines } = await request.json();
    if (!projectPath || !Array.isArray(lines)) {
      return NextResponse.json({ success: false, error: 'Invalid payload' }, { status: 400 });
    }

    // Safety: only allow writes inside the configured projects directory
    const baseDir = getProjectsBaseDir();
    if (typeof projectPath !== 'string' || !projectPath.startsWith(`${baseDir}/`)) {
      return NextResponse.json({ success: false, error: 'Path not allowed' }, { status: 400 });
    }

    const fs = await import('fs');
    const path = await import('path');

    const logsDir = path.join(projectPath, '.kibitz', 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    const file = path.join(logsDir, 'git-sync.log');
    const ts = new Date().toISOString();
    const payload = (lines as string[]).map(l => `[${ts}] ${String(l)}`).join('\n') + '\n';
    fs.appendFileSync(file, payload, 'utf8');

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message || 'Unknown error' }, { status: 500 });
  }
}


