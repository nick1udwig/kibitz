import { NextRequest, NextResponse } from 'next/server';
import { resolveServerAuthFromAnySource } from '../../../../lib/server/configVault';

export async function GET(_request: NextRequest) {
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
  } catch (error) {
    return NextResponse.json({ success: false, error: 'health-check-failed' }, { status: 500 });
  }
}


