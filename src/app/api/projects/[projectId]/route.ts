/**
 * Project Data API Routes
 * 
 * Serves structured project data (like GitHub API)
 * GET /api/projects/[projectId] - Get project overview
 * GET /api/projects/[projectId]/branches - Get branches
 * GET /api/projects/[projectId]/commits - Get commits  
 * GET /api/projects/[projectId]/activity - Get recent activity
 */

import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { getProjectsBaseDir } from '../../../../lib/pathConfig';

const BASE_PROJECTS_DIR = getProjectsBaseDir();

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
): Promise<NextResponse> {
  try {
    const __t0 = Date.now();
    const { projectId } = await context.params;
    
    if (!projectId) {
      console.error('❌ API: Project ID is missing from request');
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 }
      );
    }

    console.log(`📋 API: Fetching project data for projectId: ${projectId}`);
    
    // Find project directory
    const projectPath = await findProjectPath(projectId);
    if (!projectPath) {
      console.error(`❌ API: Project directory not found for projectId: ${projectId}`);
      return NextResponse.json(
        { error: `Project ${projectId} not found` },
        { status: 404 }
      );
    }

    console.log(`📋 API: Found project directory at: ${projectPath}`);
    
    // Check for existing JSON files
    const jsonFilePath = path.join(projectPath, '.kibitz', 'api', 'project.json');
    console.log(`📋 API: Looking for JSON file at: ${jsonFilePath}`);
    
    // 🚫 REMOVED: No more hardcoded JSON creation!
    // If JSON files don't exist, return error to force real git data extraction
    if (!fs.existsSync(jsonFilePath)) {
      console.warn(`⚠️ API: JSON file missing for ${projectId} - project needs initialization`);
      console.warn(`⚠️ API: Expected location: ${jsonFilePath}`);
      
      return NextResponse.json(
        { 
          error: `Project ${projectId} data not initialized`,
          projectId,
          projectPath,
          expectedJsonPath: jsonFilePath,
          needsInitialization: true,
          message: 'Run git operations to generate project data'
        },
        { status: 404 }
      );
    }
    
    // Read existing JSON files
    try {
      console.log(`📋 API: Reading JSON file for project ${projectId}`);
      const jsonData = fs.readFileSync(jsonFilePath, 'utf8');
      const projectData = JSON.parse(jsonData);
      
      console.log(`✅ API: Successfully loaded project data for ${projectId}:`, {
        commit_hash: projectData.commit_hash?.substring(0, 12) + '...',
        branch: projectData.branch,
        author: projectData.author,
        fileSize: jsonData.length + ' bytes'
      });
      console.log(`⏱️ Project GET total time: ${Date.now() - __t0}ms for ${projectId}`);
      
      return NextResponse.json(projectData);
    } catch (readError) {
      console.error(`❌ API: Error reading JSON file for ${projectId}:`, readError);
      console.error(`❌ API: File path: ${jsonFilePath}`);
      return NextResponse.json(
        { 
          error: `Failed to read project data for ${projectId}`,
          details: readError instanceof Error ? readError.message : 'Unknown error',
          filePath: jsonFilePath
        },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('❌ API: Unexpected error in project route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Find project directory by scanning for {projectId}_new-project pattern
 */
async function findProjectPath(projectId: string): Promise<string | null> {
  try {
    const entries = fs.readdirSync(BASE_PROJECTS_DIR);
    
    for (const entry of entries) {
      if (entry.startsWith(`${projectId}_`) && entry.includes('project')) {
        const fullPath = path.join(BASE_PROJECTS_DIR, entry);
        const stats = fs.statSync(fullPath);
        
        if (stats.isDirectory()) {
          return fullPath;
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error finding project path:', error);
    return null;
  }
} 