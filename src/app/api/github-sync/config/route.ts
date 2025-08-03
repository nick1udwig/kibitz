import { NextRequest, NextResponse } from 'next/server';
import { updateGitHubConfig, readProjectJson } from '../../../../../project-json-manager.js';
import path from 'path';
import fs from 'fs';

const BASE_PROJECTS_DIR = '/Users/test/gitrepo/projects';

/**
 * Find project directory by scanning for {projectId}_* pattern
 */
async function findProjectPath(projectId: string): Promise<string | null> {
  try {
    const entries = fs.readdirSync(BASE_PROJECTS_DIR);
    
    for (const entry of entries) {
      if (entry.startsWith(`${projectId}_`) && entry.includes('project')) {
        const fullPath = path.join(BASE_PROJECTS_DIR, entry);
        const stats = fs.statSync(fullPath);
        
        if (stats.isDirectory()) {
          console.log(`📁 Found project directory: ${fullPath}`);
          return fullPath;
        }
      }
    }
    return null;
  } catch (error) {
    console.error('❌ Error finding project path:', error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, enabled, remoteUrl, syncBranches, authentication } = body;

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: 'Project ID is required' },
        { status: 400 }
      );
    }

    // Find project path correctly
    const projectPath = await findProjectPath(projectId);
    
    if (!projectPath) {
      console.error(`❌ Project directory not found for: ${projectId}`);
      return NextResponse.json(
        { success: false, error: `Project ${projectId} not found` },
        { status: 404 }
      );
    }
    
    console.log(`🔄 Updating GitHub config for project ${projectId}:`, {
      enabled,
      remoteUrl,
      projectPath
    });

    // Update GitHub configuration
    await updateGitHubConfig(projectPath, {
      enabled,
      remoteUrl,
      syncBranches: syncBranches || ['main', 'auto/*'],
      syncStatus: enabled ? 'idle' : 'disabled',
      authentication: authentication || {
        type: 'token',
        configured: enabled
      }
    });

    console.log(`✅ GitHub sync ${enabled ? 'enabled' : 'disabled'} for project ${projectId}`);

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