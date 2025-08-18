import { NextRequest, NextResponse } from 'next/server';
export const runtime = 'nodejs';
import { findProjectPath as findExistingProjectPath } from '@/lib/server/projectPaths';
import { updateGitHubConfig, readProjectJson, ensureKibitzDirectory } from '@/lib/server/githubSync/project-json-manager';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, enabled, syncBranches, authentication } = body || {};

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: 'Project ID is required' },
        { status: 400 }
      );
    }

    const projectPath = findExistingProjectPath(projectId);
    if (!projectPath) {
      return NextResponse.json(
        { success: false, error: `Project ${projectId} not found` },
        { status: 404 }
      );
    }

    await ensureKibitzDirectory(projectPath);

    await updateGitHubConfig(projectPath, {
      enabled: Boolean(enabled),
      syncBranches: Array.isArray(syncBranches) ? syncBranches : undefined,
      authentication: authentication ? { ...authentication } : undefined,
      syncStatus: Boolean(enabled) ? 'idle' : 'disabled'
    });

    return NextResponse.json({
      success: true,
      message: `GitHub sync ${enabled ? 'enabled' : 'disabled'}`,
      projectId
    });

  } catch (error) {
    console.error('❌ Failed to update GitHub config:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to update GitHub configuration',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: 'Project ID is required' },
        { status: 400 }
      );
    }

    const projectPath = findExistingProjectPath(projectId);
    if (!projectPath) {
      return NextResponse.json(
        { success: false, error: `Project ${projectId} not found` },
        { status: 404 }
      );
    }

    const data = await readProjectJson(projectPath).catch(() => null);
    return NextResponse.json({
      success: true,
      projectId,
      github: data?.github || { enabled: false, remoteUrl: null, syncStatus: 'disabled' }
    });

  } catch (error) {
    console.error('❌ Failed to get GitHub config:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to get GitHub configuration',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}