import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
import { resolveServerAuthFromAnySource } from '../../../../lib/server/configVault';

export async function GET() {
  try {
    const auth = resolveServerAuthFromAnySource();
    const payload = {
      success: true,
      health: {
        authenticated: Boolean(auth.githubToken),
        source: auth.source,
      },
      timestamp: new Date().toISOString(),
    };
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json({ success: false, error: 'health-check-failed' }, { status: 500 });
  }
}


