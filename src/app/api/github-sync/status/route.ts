import { NextRequest, NextResponse } from 'next/server';
export const runtime = 'nodejs';
import { getAllProjectsWithGitHub } from '../../../../../project-json-manager.js';
import { hasPersistedAuth, resolveServerAuthFromAnySource } from '../../../../lib/server/configVault';

export async function GET(request: NextRequest) {
  try {
    console.log('📊 GitHub Sync Status Check');
    
    // Get all projects with GitHub config
    const projects = await getAllProjectsWithGitHub();
    
    const enabledProjects = projects.filter(p => (p as any).github?.enabled);
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
        projectId: (p as any).projectId,
        projectName: (p as any).projectName,
        syncStatus: (p as any).github?.syncStatus || 'unknown',
        lastSync: (p as any).github?.lastSync || null
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