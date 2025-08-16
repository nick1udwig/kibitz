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
import { findProjectPath as findExistingProjectPath } from '../../../../lib/server/projectPaths';

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
    const projectPath = findExistingProjectPath(projectId);
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
      console.warn(`⚠️ API: JSON file missing for ${projectId} - attempting on-demand generation`);
      try {
        // Attempt on-demand generation of project JSON
        const res = await fetch(`${request.nextUrl.origin}/api/projects/${projectId}/generate`, { method: 'POST' });
        if (res.ok && fs.existsSync(jsonFilePath)) {
          console.log(`✅ API: Generated JSON on demand for ${projectId}`);
        } else {
          console.warn(`⚠️ API: On-demand generation failed or file still missing`);
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
      } catch (e) {
        console.warn(`⚠️ API: On-demand generation threw, returning 404`, e);
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