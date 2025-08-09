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

    // Get project path and execute git command to get current branch
    const { getProjectPath } = await import('../../../../../../lib/projectPathService');
    const { executeGitCommand } = await import('../../../../../../lib/gitService');
    
    // Get the actual project path from the real project structure
    const fs = require('fs');
    const path = require('path');
    
    // Try to find the actual project directory
    const { getProjectsBaseDir } = await import('../../../../../../lib/pathConfig');
    const baseProjectsPath = getProjectsBaseDir();
    const possiblePaths = [
      path.join(baseProjectsPath, `${projectId}_new-project`),
      path.join(baseProjectsPath, `${projectId}_new-project`),
      path.join(baseProjectsPath, projectId),
    ];
    
    let projectPath = '';
    for (const testPath of possiblePaths) {
      if (fs.existsSync(testPath)) {
        projectPath = testPath;
        break;
      }
    }
    
    if (!projectPath) {
      projectPath = getProjectPath(projectId, 'new-project'); // Fallback
    }
    
    console.log(`🔍 Using project path: ${projectPath}`);
    
    // Direct git command execution for more reliable results
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    let currentBranch = 'main'; // Default fallback
    
    try {
      // Try git branch --show-current first
      const { stdout } = await execAsync('git branch --show-current', { cwd: projectPath });
      const branchFromGit = stdout.trim();
      
      if (branchFromGit) {
        currentBranch = branchFromGit;
        console.log(`✅ Got current branch from git command: ${currentBranch}`);
      } else {
        throw new Error('Empty output from git command');
      }
    } catch (gitError) {
      console.warn('Git command failed, trying direct .git/HEAD read:', gitError);
      
      // Fallback: read .git/HEAD directly
      try {
        const gitHeadPath = path.join(projectPath, '.git', 'HEAD');
        
        if (fs.existsSync(gitHeadPath)) {
          const headContent = fs.readFileSync(gitHeadPath, 'utf8').trim();
          console.log(`🔍 .git/HEAD content: ${headContent}`);
          
          if (headContent.startsWith('ref: refs/heads/')) {
            currentBranch = headContent.replace('ref: refs/heads/', '');
            console.log(`✅ Got current branch from .git/HEAD: ${currentBranch}`);
          } else {
            // Detached HEAD state - try to get branch from reflog or recent commits
            console.log('⚠️ Detached HEAD state, trying alternative methods');
            
            try {
              const { stdout: reflogOutput } = await execAsync('git log --oneline -1 --decorate', { cwd: projectPath });
              const branchMatch = reflogOutput.match(/origin\/([^,\)]+)/);
              if (branchMatch) {
                currentBranch = branchMatch[1];
                console.log(`✅ Got current branch from reflog: ${currentBranch}`);
              }
            } catch (reflogError) {
              console.warn('Reflog method failed:', reflogError);
            }
          }
        }
      } catch (readError) {
        console.warn('Could not read .git/HEAD:', readError);
      }
         }
    
    console.log(`🔍 Current branch for project ${projectId}: ${currentBranch}`);
    
    return NextResponse.json({
      projectId,
      currentBranch,
      timestamp: Date.now()
    });
    
  } catch (error) {
    console.error('Error getting current branch:', error);
    return NextResponse.json(
      { error: 'Failed to get current branch', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 