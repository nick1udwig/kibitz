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
    const { projectId } = await context.params;
    
    if (!projectId) {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 }
      );
    }

    const fs = require('fs');
    const path = require('path');
    
    // Calculate project path
    const baseDir = '/Users/test/gitrepo/projects';
    const projectPath = path.join(baseDir, `${projectId}_new-project`);
    const branchesJsonPath = path.join(projectPath, '.kibitz', 'api', 'branches.json');
    
    console.log(`🌲 API: Checking branches for project ${projectId}...`);
    
    // Check if project directory exists
    if (!fs.existsSync(projectPath)) {
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
      
      const projectJsonPath = path.join(projectPath, '.kibitz', 'api', 'project.json');
      
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
      return NextResponse.json({
        ...branchesData,
        lastUpdated: Date.now(),
        source: 'branches-json'
      });
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