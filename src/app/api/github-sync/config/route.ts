import { NextRequest, NextResponse } from 'next/server';
export const runtime = 'nodejs';
import { updateGitHubConfig, readProjectJson } from '@/lib/server/githubSync/project-json-manager.js';
import path from 'path';
import fs from 'fs';
import { projectsBaseDir, findProjectPath as findExistingProjectPath, resolveOrCreateProjectPath, sanitizeProjectName } from '../../../../lib/server/projectPaths';
import { resolveServerAuthFromAnySource } from '../../../../lib/server/configVault';

const BASE_PROJECTS_DIR = projectsBaseDir();

/**
 * Find project directory by scanning for {projectId}_* pattern
 */
async function findProjectPath(projectId: string): Promise<string | null> {
  return findExistingProjectPath(projectId);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, projectName, enabled, remoteUrl, syncBranches, authentication } = body;

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: 'Project ID is required' },
        { status: 400 }
      );
    }

    // Find project path correctly
    let projectPath = await findProjectPath(projectId);
    
    if (!projectPath) {
      // If the project directory hasn't been created yet, try to create it using provided projectName
      try {
        const { path: createdPath } = resolveOrCreateProjectPath(projectId, sanitizeProjectName(projectName || 'project'));
        projectPath = createdPath;
        console.log(`📁 Prepared project directory for config at: ${projectPath}`);
      } catch (mkdirErr) {
        console.error(`❌ Failed to create project directory for ${projectId}:`, mkdirErr);
        return NextResponse.json(
          { success: false, error: `Failed to prepare project directory for ${projectId}` },
          { status: 500 }
        );
      }
    }
    
    // Compute effective remoteUrl using provided value or derived from resolved username
    let effectiveRemoteUrl = remoteUrl;
    try {
      const resolved = resolveServerAuthFromAnySource();
      if (!effectiveRemoteUrl && resolved.githubUsername) {
        const repoName = `${projectId}-project`;
        effectiveRemoteUrl = `https://github.com/${resolved.githubUsername}/${repoName}.git`;
      }
    } catch {}

    console.log(`🔄 Updating GitHub config for project ${projectId}:`, {
      enabled,
      remoteUrl: effectiveRemoteUrl,
      projectPath
    });

    // Update GitHub configuration (fast, I/O only)
    await updateGitHubConfig(projectPath, {
      enabled,
      remoteUrl: effectiveRemoteUrl,
      // Only main and conversation step branches
      syncBranches: syncBranches || ['main', 'conv-*'],
      syncStatus: enabled ? 'idle' : 'disabled',
      authentication: authentication || {
        type: 'token',
        configured: enabled
      }
    });

    console.log(`✅ GitHub sync ${enabled ? 'enabled' : 'disabled'} for project ${projectId}`);

    // Fire-and-forget: pre-provision the remote by calling the trigger endpoint in background
    // This avoids blocking the config route; errors are logged only.
    try {
      // Derive a base URL for self-calling
      const host = request.headers.get('host') || 'localhost:3000';
      const proto = request.headers.get('x-forwarded-proto') || 'http';
      const baseUrl = `${proto}://${host}`;
      setTimeout(() => {
        fetch(`${baseUrl}/api/github-sync/trigger`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, immediate: true, force: true })
        }).catch((err) => console.warn('⚠️ Background provisioning failed:', err));
      }, 0);
      console.log('🚀 Background GitHub provisioning scheduled');
    } catch (bgErr) {
      console.warn('⚠️ Could not schedule background provisioning:', bgErr);
    }

    return NextResponse.json({
      success: true,
      message: `GitHub sync ${enabled ? 'enabled' : 'disabled'}`,
      projectId,
      enabled
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

    // Find project path and read configuration
    const projectPath = await findProjectPath(projectId);
    
    if (!projectPath) {
      return NextResponse.json(
        { success: false, error: `Project ${projectId} not found` },
        { status: 404 }
      );
    }
    
    const projectData = await readProjectJson(projectPath);

    return NextResponse.json({
      success: true,
      projectId,
      github: (projectData as any).github || {
        enabled: false,
        remoteUrl: null,
        syncStatus: 'disabled'
      }
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