import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
import { getAllProjectsWithGitHub } from '@/lib/server/githubSync/project-json-manager.js';
import { resolveServerAuthFromAnySource } from '../../../../lib/server/configVault';

export async function GET() {
  try {
    console.log('📊 GitHub Sync Status Check');
    
    // Get all projects with GitHub config
    const projects = await getAllProjectsWithGitHub();
    
    const enabledProjects = projects.filter(p => (p as { github?: { enabled?: boolean } }).github?.enabled);
    const totalProjects = projects.length;
    
    console.log(`Found ${totalProjects} total projects, ${enabledProjects.length} with GitHub enabled`);
    
    const auth = resolveServerAuthFromAnySource();
    const health = {
      enabled: enabledProjects.length > 0,
      authenticated: Boolean(auth.githubToken && (auth.source === 'env' || auth.source === 'vault' || auth.source === 'persisted')),
      source: auth.source,
    };

    return NextResponse.json({
      success: true,
      status: 'GitHub Sync API is working',
      projects: {
        total: totalProjects,
        withGitHub: enabledProjects.length,
        enabled: enabledProjects.length
      },
      health,
      enabledProjects: enabledProjects.map(p => ({
        projectId: (p as { projectId?: string }).projectId,
        projectName: (p as { projectName?: string }).projectName,
        syncStatus: (p as { github?: { syncStatus?: string } }).github?.syncStatus || 'unknown',
        lastSync: (p as { github?: { lastSync?: unknown } }).github?.lastSync || null
      })),
      timestamp: new Date().toISOString(),
      automated: true
    });

  } catch (error) {
    console.error('❌ GitHub Sync Status Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to get GitHub sync status',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 