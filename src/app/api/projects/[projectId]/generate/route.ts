/**
 * Project JSON Generation API Route
 * POST /api/projects/[projectId]/generate - Generate JSON files with real git data
 */

import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

const BASE_PROJECTS_DIR = '/Users/test/gitrepo/projects';

export async function POST(
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

    console.log(`📋 Generate API: Creating JSON for project ${projectId}`);
    
    // Find project directory
    const projectPath = await findProjectPath(projectId);
    if (!projectPath) {
      return NextResponse.json(
        { error: `Project ${projectId} not found` },
        { status: 404 }
      );
    }

    console.log(`📋 Generate API: Found project at ${projectPath}`);
    
    // Extract ALL real git data - NO HARDCODING
    let repositoryData: any = {};
    let branchesData: any[] = [];
    
    try {
      console.log(`📋 Generate API: Extracting ALL real git data from ${projectPath}`);
      
      // Get ALL branches
      const allBranchesCommand = 'git branch -a --format="%(refname:short)|%(objectname)|%(committerdate:iso8601)|%(authorname)|%(subject)"';
      const allBranchesOutput = execSync(allBranchesCommand, { 
        cwd: projectPath, 
        encoding: 'utf8',
        timeout: 10000 
      }).trim();
      
      // Get current branch
      const currentBranchCommand = 'git branch --show-current';
      const currentBranch = execSync(currentBranchCommand, { 
        cwd: projectPath, 
        encoding: 'utf8',
        timeout: 5000 
      }).trim();
      
      // Get total commit count
      const totalCommitsCommand = 'git rev-list --all --count';
      const totalCommits = parseInt(execSync(totalCommitsCommand, { 
        cwd: projectPath, 
        encoding: 'utf8',
        timeout: 5000 
      }).trim()) || 0;
      
      // Get repository size (approximation)
      const repoSizeCommand = 'du -sk .git';
      const repoSizeOutput = execSync(repoSizeCommand, { 
        cwd: projectPath, 
        encoding: 'utf8',
        timeout: 5000 
      }).trim();
      const repoSize = parseInt(repoSizeOutput.split('\t')[0]) * 1024 || 1024;
      
             // Get language stats from actual files
       const findFilesCommand = 'find . -type f -name "*.py" -o -name "*.js" -o -name "*.ts" -o -name "*.jsx" -o -name "*.tsx" -o -name "*.java" -o -name "*.cpp" -o -name "*.c" -o -name "*.go" -o -name "*.rs" | grep -v node_modules | grep -v .git';
       let languageStats: Record<string, number> = {};
       try {
         const filesOutput = execSync(findFilesCommand, { 
           cwd: projectPath, 
           encoding: 'utf8',
           timeout: 5000 
         }).trim();
         
         if (filesOutput) {
           const files = filesOutput.split('\n');
           files.forEach(file => {
             const ext = file.split('.').pop()?.toLowerCase();
             if (ext) {
               languageStats[ext] = (languageStats[ext] || 0) + 1;
             }
           });
         }
       } catch (e) {
         console.warn('Could not get language stats, using empty');
       }
      
      // Parse branches
      if (allBranchesOutput) {
        const branchLines = allBranchesOutput.split('\n').filter(line => line.trim());
        
        for (const line of branchLines) {
          const [branchName, commitHash, commitDate, authorName, commitMessage] = line.split('|');
          
                     if (branchName && !branchName.includes('remotes/') && branchName.trim()) {
             // Get file changes for this branch's latest commit
             let filesChanged: string[] = [];
             let linesAdded = 0;
             let linesRemoved = 0;
            
            try {
              const diffCommand = `git diff-tree --no-commit-id --name-only -r ${commitHash}`;
              const diffOutput = execSync(diffCommand, { 
                cwd: projectPath, 
                encoding: 'utf8',
                timeout: 5000 
              }).trim();
              
              if (diffOutput) {
                filesChanged = diffOutput.split('\n').filter(f => f.trim());
              }
              
              const statsCommand = `git diff-tree --no-commit-id --numstat -r ${commitHash}`;
              const statsOutput = execSync(statsCommand, { 
                cwd: projectPath, 
                encoding: 'utf8',
                timeout: 5000 
              }).trim();
              
              if (statsOutput) {
                statsOutput.split('\n').forEach(statLine => {
                  const [added, removed] = statLine.split('\t');
                  linesAdded += parseInt(added) || 0;
                  linesRemoved += parseInt(removed) || 0;
                });
              }
            } catch (e) {
              console.warn(`Could not get diff stats for branch ${branchName}`);
            }
            
            branchesData.push({
              branchName: branchName.trim(),
              commitHash: commitHash?.trim() || 'unknown',
              commitMessage: commitMessage?.trim() || 'No commit message',
              timestamp: commitDate ? new Date(commitDate).getTime() : Date.now(),
              author: authorName?.trim() || 'Unknown',
              filesChanged,
              linesAdded,
              linesRemoved,
              isMainBranch: branchName.trim() === currentBranch,
              tags: branchName.trim() === currentBranch ? ['main'] : [],
              sync: {
                lastPushed: null,
                pushedHash: null,
                needsSync: false,
                syncError: null
              }
            });
          }
        }
      }
      
      repositoryData = {
        defaultBranch: currentBranch || 'main',
        totalBranches: branchesData.length,
        totalCommits,
        lastActivity: Date.now(),
        size: repoSize,
        languages: languageStats
      };
      
      console.log(`📋 Generate API: Extracted REAL git data:`, {
        branches: branchesData.length,
        totalCommits,
        currentBranch,
        languages: Object.keys(languageStats),
        repoSize: `${Math.round(repoSize/1024)}KB`
      });
      
    } catch (gitError) {
      console.error(`❌ Generate API: Failed to extract real git data:`, gitError);
      throw new Error(`Failed to extract git data: ${gitError instanceof Error ? gitError.message : 'Unknown error'}`);
    }
    
    // Create project data with the structure the API expects
    const mainBranch = branchesData.find(b => b.isMainBranch) || branchesData[0];
    
    const projectData = {
      // Simple fields that API reads directly
      commit_hash: mainBranch?.commitHash || 'unknown',
      branch: repositoryData.defaultBranch || 'main', 
      author: mainBranch?.author || 'Unknown',
      date: mainBranch?.timestamp ? new Date(mainBranch.timestamp).toISOString() : new Date().toISOString(),
      message: mainBranch?.commitMessage || 'No commit message',
      remote_url: `https://github.com/malikrohail/${projectId}-project.git`, // Set GitHub remote URL
      is_dirty: false,
      
      // Extended project metadata
      projectId,
      projectName: path.basename(projectPath).replace(/^[^_]*_/, ''),
      projectPath,
      gitInitialized: true,
      lastActivity: Date.now(),
      repository: repositoryData,
      branches: branchesData,
      conversations: [],
      
      // GitHub sync configuration (v2 schema)
      github: {
        enabled: true, // Default to enabled as requested
        remoteUrl: `https://github.com/malikrohail/${projectId}-project.git`,
        syncInterval: 300000, // 5 minutes
        syncBranches: ['main', 'auto/*'],
        lastSync: null,
        syncStatus: 'idle',
        authentication: {
          type: 'token',
          configured: true,
          lastValidated: null
        }
      },
      
      // Global sync state (v2 schema)
      sync: {
        lastAttempt: null,
        nextScheduled: null,
        consecutiveFailures: 0,
        pendingChanges: []
      },
      
      metadata: {
        generated: Date.now(),
        version: '2.0',
        source: 'api-server'
      }
    };
    
    // Create .kibitz/api directory
    const kibitzDir = path.join(projectPath, '.kibitz', 'api');
    const jsonFilePath = path.join(kibitzDir, 'project.json');
    
    // Ensure directory exists
    fs.mkdirSync(kibitzDir, { recursive: true });
    
    // Write JSON file
    fs.writeFileSync(jsonFilePath, JSON.stringify(projectData, null, 2), 'utf8');
    
    // Verify file was created
    if (!fs.existsSync(jsonFilePath)) {
      throw new Error('File was not created successfully');
    }
    
    const fileStats = fs.statSync(jsonFilePath);
    
    console.log(`✅ Generate API: JSON file created successfully:`, {
      path: jsonFilePath,
      size: fileStats.size + ' bytes'
    });
    
    return NextResponse.json({
      success: true,
      projectId,
      projectPath,
      jsonFilePath,
      fileSize: fileStats.size,
      data: projectData
    });
    
  } catch (error) {
    console.error('❌ Generate API: Error creating JSON:', error);
    return NextResponse.json(
      { 
        error: 'Failed to generate project JSON',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * Find project directory by ID
 */
async function findProjectPath(projectId: string): Promise<string | null> {
  try {
    const entries = fs.readdirSync(BASE_PROJECTS_DIR, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith(`${projectId}_`)) {
        return path.join(BASE_PROJECTS_DIR, entry.name);
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error finding project path:', error);
    return null;
  }
} 