/**
 * Project Branches API Route
 * 
 * GET /api/projects/[projectId]/branches
 * Returns all branches for a project with detailed commit information
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
): Promise<NextResponse> {
  try {
    const __t0 = Date.now();
    const { projectId } = await context.params;
    
    if (!projectId) {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 }
      );
    }

    const fs = await import('fs');
    const path = await import('path');
  const { projectsBaseDir, findProjectPath } = await import('../../../../../lib/server/projectPaths');
    
  // Calculate project path (no hardcoded name suffix)
  const baseDir = projectsBaseDir();
    const existing = findProjectPath(projectId);
    const resolvedProjectPath = existing || path.join(baseDir, `${projectId}_`);
    const branchesJsonPath = path.join(resolvedProjectPath, '.kibitz', 'api', 'branches.json');
    
    console.log(`🌲 API: Checking branches for project ${projectId}...`);
    
    // Check if project directory exists
    if (!fs.existsSync(resolvedProjectPath)) {
      return NextResponse.json(
        { 
          projectId, 
          totalBranches: 0, 
          branches: [],
          lastUpdated: Date.now(),
          source: 'fallback',
          error: 'Project not found'
        },
        { status: 404 }
      );
    }
    
    // If branches.json doesn't exist, try to read from project.json or create fallback
    if (!fs.existsSync(branchesJsonPath)) {
      console.log(`🌲 API: branches.json missing, checking project.json...`);
      
      const projectJsonPath = path.join(resolvedProjectPath, '.kibitz', 'api', 'project.json');
      
      if (fs.existsSync(projectJsonPath)) {
        try {
          const projectData = JSON.parse(fs.readFileSync(projectJsonPath, 'utf8'));
          const branchesData = {
            projectId,
            totalBranches: projectData.branches?.length || 0,
            branches: projectData.branches || [],
            lastUpdated: Date.now(),
            source: 'project-json'
          };
          return NextResponse.json(branchesData);
        } catch (error) {
          console.error('❌ Failed to read project.json:', error);
        }
      }
      
      // Return fallback data
      return NextResponse.json({
        projectId,
        totalBranches: 0,
        branches: [],
        lastUpdated: Date.now(),
        source: 'fallback',
        error: 'No branch data available. Project needs to be initialized.'
      });
    }
    
    // Read existing branches.json
    try {
      const branchesData = JSON.parse(fs.readFileSync(branchesJsonPath, 'utf8'));
      const response = {
        ...branchesData,
        lastUpdated: Date.now(),
        source: 'branches-json'
      };
      console.log(`⏱️ Branches GET total time: ${Date.now() - __t0}ms for ${projectId}`);
      return NextResponse.json(response);
    } catch (error) {
      console.error('❌ Failed to read branches.json:', error);
      return NextResponse.json(
        { 
          error: `Failed to read branch data for project ${projectId}`,
          details: error instanceof Error ? error.message : 'Unknown error'
        },
        { status: 500 }
      );
    }
    
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 