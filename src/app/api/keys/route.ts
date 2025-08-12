import { NextRequest, NextResponse } from 'next/server';
import { loadPersistedServerConfig, persistServerConfig } from '../../../lib/server/configVault';

// Simple in-memory storage for demo purposes
// In production, you'd want to use a proper database or encrypted storage
// In-memory vault for runtime only. For persistence, a secure store should be used.
export let apiKeysStorage: Record<string, string> = {};

// Module-load hydration: prefer env, then persisted file, to prefill minimal GitHub creds
try {
  const envToken = (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '').trim();
  const envUser = (process.env.GITHUB_USERNAME || '').trim();
  const persisted = loadPersistedServerConfig();
  if (!apiKeysStorage.githubToken) {
    apiKeysStorage.githubToken = envToken || persisted.githubToken || '';
  }
  if (!apiKeysStorage.githubUsername) {
    apiKeysStorage.githubUsername = envUser || persisted.githubUsername || '';
  }
} catch {}

export async function GET(request: NextRequest) {
  try {
    // Never return raw secrets. Return shape with masked indicators only.
    const masked: Record<string, string> = {};
    for (const [k, v] of Object.entries(apiKeysStorage)) {
      if (!v) { masked[k] = ''; continue; }
      const tail = v.slice(-4);
      masked[k] = `••••••••${tail}`;
    }
    return NextResponse.json({ keys: masked, source: 'memory' });
  } catch (error) {
    console.error('Error retrieving API keys:', error);
    return NextResponse.json({ error: 'Failed to retrieve API keys' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { keys } = body;
    
    if (!keys || typeof keys !== 'object') {
      return NextResponse.json({ error: 'Invalid keys format' }, { status: 400 });
    }
    
    // Update the storage (overwrite per key). Accept the following fields:
    // - githubToken, githubUsername, githubEmail (for GitHub integration)
    // - anthropicApiKey, openaiApiKey, openRouterApiKey, groqApiKey (existing)
    apiKeysStorage = { ...apiKeysStorage, ...keys };
    // Persist minimal server auth, if provided
    try {
      const token = typeof apiKeysStorage.githubToken === 'string' ? apiKeysStorage.githubToken : '';
      const username = typeof apiKeysStorage.githubUsername === 'string' ? apiKeysStorage.githubUsername : '';
      // Persist even if empty to allow clearing; encryption requires KIBITZ_CONFIG_SECRET
      persistServerConfig({ githubToken: token, githubUsername: username });
    } catch {}
    
    return NextResponse.json({ success: true, persisted: true });
  } catch (error) {
    console.error('Error saving API keys:', error);
    return NextResponse.json({ error: 'Failed to save API keys' }, { status: 500 });
  }
} 