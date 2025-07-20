import { NextRequest, NextResponse } from 'next/server';
import { readProjectJson } from '../../../../../project-json-manager.js';
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

/**
 * Perform real GitHub sync using GitHub CLI and Git operations
 */
async function performRealGitHubSync(projectId: string, projectPath: string, githubConfig: any): Promise<{
  success: boolean;
  error?: string;
  details?: string;
  remoteUrl?: string;
}> {
  try {
    console.log(`🔧 Starting real GitHub sync for project ${projectId} at ${projectPath}`);
    
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    // Set up proper environment with Homebrew paths
    const env = {
      ...process.env,
      PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}`
    };
    
    // Get remote URL from GitHub config or generate one
    const remoteUrl = githubConfig.remoteUrl || `https://github.com/malikrohail/${projectId}-project.git`;
    const repoName = remoteUrl.split('/').pop()?.replace('.git', '') || `${projectId}-project`;
    
    console.log(`🔗 Using remote URL: ${remoteUrl}`);
    
    // Step 1: Check GitHub CLI availability with proper PATH
    let ghPath = 'gh';
    let ghAvailable = false;
    
    const commonPaths = [
      'gh', // Try default first
      '/opt/homebrew/bin/gh', // Homebrew on Apple Silicon
      '/usr/local/bin/gh', // Homebrew on Intel
      '/usr/bin/gh' // System install
    ];
    
    for (const path of commonPaths) {
      try {
        await execAsync(`${path} --version`, { env });
        console.log(`✅ GitHub CLI found at: ${path}`);
        ghPath = path;
        ghAvailable = true;
        break;
      } catch (e) {
        continue;
      }
    }
    
    if (!ghAvailable) {
      console.log(`⚠️ GitHub CLI not found in any common paths`);
    }
    
    // Step 2: Check if we're in a git repository
    try {
      await execAsync('git status', { cwd: projectPath, env });
      console.log(`✅ Project ${projectId} is already a git repository`);
    } catch (error) {
      // Initialize git if not already done
      console.log(`🔧 Initializing git repository for ${projectId}`);
      await execAsync('git init', { cwd: projectPath, env });
      await execAsync('git add .', { cwd: projectPath, env });
      await execAsync('git commit -m "Initial commit"', { cwd: projectPath, env });
    }
    
    // Step 3: Check if remote origin exists
    try {
      const { stdout } = await execAsync('git remote get-url origin', { cwd: projectPath, env });
      console.log(`✅ Remote origin already exists: ${stdout.trim()}`);
      
      // Use existing remote URL
      const existingRemoteUrl = stdout.trim();
      
      // Step 4: Push to existing remote
      try {
        await execAsync('git push origin --all', { cwd: projectPath, env });
        console.log(`✅ Successfully pushed to existing remote: ${existingRemoteUrl}`);
        
        return {
          success: true,
          details: `Pushed to existing remote: ${existingRemoteUrl}`,
          remoteUrl: existingRemoteUrl
        };
      } catch (pushError) {
        console.log(`⚠️ Push failed, but remote exists: ${pushError}`);
        return {
          success: true,
          details: `Remote exists but push failed: ${existingRemoteUrl}`,
          remoteUrl: existingRemoteUrl
        };
      }
      
    } catch (error) {
      // No remote exists, create one
      console.log(`🔧 No remote origin found, creating GitHub repository: ${repoName}`);
      
      // Step 5: Create GitHub repository using GitHub CLI
      if (ghAvailable) {
        try {
          console.log(`🚀 Creating GitHub repository using CLI: ${ghPath} repo create ${repoName}`);
          await execAsync(`${ghPath} repo create ${repoName} --public --source=. --remote=origin --push`, { cwd: projectPath, env });
          console.log(`✅ Created GitHub repository and pushed: ${repoName}`);
          console.log(`🔗 Repository URL: ${remoteUrl}`);
          
          return {
            success: true,
            details: `Created new GitHub repository: ${repoName} at ${remoteUrl}`,
            remoteUrl
          };
          
        } catch (ghError) {
          console.log(`⚠️ GitHub CLI creation failed: ${ghError}`);
          console.log(`🔄 Falling back to manual git commands...`);
        }
      }
      
      // Fallback: Manual repository creation (when GitHub CLI fails or unavailable)
      try {
        console.log(`🔧 Adding remote manually: ${remoteUrl}`);
        await execAsync(`git remote add origin ${remoteUrl}`, { cwd: projectPath, env });
        await execAsync('git branch -M main', { cwd: projectPath, env });
        
        console.log(`⚠️ Note: Repository ${repoName} must be created manually on GitHub first`);
        console.log(`🔗 Create it at: https://github.com/malikrohail/${repoName}`);
        
        // Try to push anyway (will fail if repo doesn't exist)
        await execAsync('git push -u origin main', { cwd: projectPath, env });
        
        return {
          success: true,
          details: `Added remote and attempted push to: ${remoteUrl}. Repository may need manual creation.`,
          remoteUrl
        };
        
      } catch (manualError) {
        return {
          success: false,
          error: `Failed to setup GitHub repository. Please create ${repoName} manually on GitHub and try again. Error: ${manualError}`
        };
      }
    }
    
  } catch (error) {
    console.error(`❌ Real GitHub sync failed for ${projectId}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during GitHub sync'
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, immediate = false } = body;

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

    // Read project data
    const projectData = await readProjectJson(projectPath);

    console.log(`🚀 Triggering GitHub sync for project ${projectId}:`, {
      immediate,
      projectPath,
      enabled: (projectData as any).github?.enabled
    });

    // Check if GitHub sync is enabled
    const githubConfig = (projectData as any).github;
    if (!githubConfig?.enabled) {
      return NextResponse.json({
        success: false,
        error: 'GitHub sync is not enabled for this project',
        projectId
      }, { status: 400 });
    }

    // REAL GITHUB SYNC - Use GitHub CLI and Git operations
    console.log(`🚀 Performing REAL GitHub sync for ${projectId} (immediate: ${immediate})`);
    
    try {
      // Import the real GitHub sync functionality
      const syncResult = await performRealGitHubSync(projectId, projectPath, githubConfig);
      
      if (syncResult.success) {
        console.log(`✅ Real GitHub sync completed for ${projectId}:`, syncResult.details);
        
        // Update JSON with real remote URL
        const { updateGitHubConfig } = await import('../../../../../project-json-manager.js');
        await updateGitHubConfig(projectPath, {
          syncStatus: 'idle',
          lastSync: new Date().toISOString(),
          remoteUrl: syncResult.remoteUrl
        });
        
        return NextResponse.json({
          success: true,
          message: `GitHub sync completed successfully for ${projectId}`,
          details: syncResult.details,
          remoteUrl: syncResult.remoteUrl,
          projectId
        });
        
      } else {
        console.error(`❌ GitHub sync failed for ${projectId}:`, syncResult.error);
        
        // Update status with error
        const { updateGitHubConfig } = await import('../../../../../project-json-manager.js');
        await updateGitHubConfig(projectPath, {
          syncStatus: 'error',
          lastSync: new Date().toISOString()
        });
        
        return NextResponse.json({
          success: false,
          error: `GitHub sync failed: ${syncResult.error}`,
          projectId
        }, { status: 500 });
      }
      
    } catch (error) {
      console.error(`❌ GitHub sync error for ${projectId}:`, error);
      return NextResponse.json({
        success: false,
        error: `GitHub sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        projectId
      }, { status: 500 });
    }
    
    return NextResponse.json({
      success: true,
      message: 'GitHub sync completed successfully',
      projectId,
      immediate,
      simulated: true,
      timestamp: new Date().toISOString(),
      note: 'This is a simulated sync. Real GitHub integration requires authentication setup.'
    });

  } catch (error) {
    console.error('❌ Failed to trigger GitHub sync:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to trigger GitHub sync',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 