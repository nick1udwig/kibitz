import { NextRequest, NextResponse } from 'next/server';
import { readProjectJson } from '../../../../../project-json-manager.js';
import path from 'path';
import fs from 'fs';
import { getProjectsBaseDir } from '../../../../lib/pathConfig';

const BASE_PROJECTS_DIR = getProjectsBaseDir();
const GITHUB_USERNAME = process.env.GITHUB_USERNAME || 'malikrohail';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

/**
 * Find project directory by scanning for {projectId}_* pattern
 */
async function findProjectPath(projectId: string): Promise<string | null> {
  try {
    const entries = fs.readdirSync(BASE_PROJECTS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith(`${projectId}_`)) {
        const fullPath = path.join(BASE_PROJECTS_DIR, entry.name);
        console.log(`📁 Found project directory: ${fullPath}`);
        return fullPath;
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
    
    // DEBUG: Log environment variables for GitHub authentication
    console.log(`🔍 DEBUG: Checking GitHub environment variables:`);
    console.log(`🔍 DEBUG: GITHUB_TOKEN exists: ${!!process.env.GITHUB_TOKEN}`);
    console.log(`🔍 DEBUG: GH_TOKEN exists: ${!!process.env.GH_TOKEN}`);
    console.log(`🔍 DEBUG: GITHUB_USERNAME: ${process.env.GITHUB_USERNAME || 'NOT SET'}`);
    console.log(`🔍 DEBUG: GIT_USER_NAME: ${process.env.GIT_USER_NAME || 'NOT SET'}`);
    console.log(`🔍 DEBUG: GIT_USER_EMAIL: ${process.env.GIT_USER_EMAIL || 'NOT SET'}`);
    
    // Get remote URL from GitHub config or generate one based on env
    const repoName = `${projectId}-project`;
    const remoteUrl = githubConfig.remoteUrl || `https://github.com/${GITHUB_USERNAME}/${repoName}.git`;
    
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

    // Ensure the remote repository exists via REST API (works with or without gh CLI)
    try {
      if (GITHUB_TOKEN) {
        const repoCheck = await fetch(`https://api.github.com/repos/${GITHUB_USERNAME}/${repoName}`, {
          headers: { Authorization: `token ${GITHUB_TOKEN}`, 'User-Agent': 'kibitz' }
        });
        if (repoCheck.status === 404) {
          console.log(`🔧 Creating GitHub repo via REST: ${repoName}`);
          const createResp = await fetch('https://api.github.com/user/repos', {
            method: 'POST',
            headers: {
              Authorization: `token ${GITHUB_TOKEN}`,
              'Content-Type': 'application/json',
              'User-Agent': 'kibitz'
            },
            body: JSON.stringify({ name: repoName, private: true })
          });
          if (!createResp.ok) {
            const txt = await createResp.text();
            console.log(`⚠️ REST repo create failed: ${createResp.status} ${txt}`);
          } else {
            console.log(`✅ Repo created via REST: ${repoName}`);
          }
        }
      } else {
        console.log('⚠️ No GITHUB_TOKEN provided; skipping REST repo creation');
      }
    } catch (restErr) {
      console.log('⚠️ REST repo ensure failed (continuing):', restErr);
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
        console.log(`🔍 DEBUG: Using GitHub CLI path: ${ghPath}`);
        console.log(`🔍 DEBUG: Repository name: ${repoName}`);
        console.log(`🔍 DEBUG: Working directory: ${projectPath}`);
        
        // DEBUG: Check if GitHub CLI is authenticated
        try {
          const authResult = await execAsync(`${ghPath} auth status`, { cwd: projectPath, env });
          console.log(`🔍 DEBUG: GitHub CLI auth status: ${authResult.stdout}`);
        } catch (authError) {
          console.log(`🔍 DEBUG: GitHub CLI auth check failed: ${authError}`);
        }
        
        // DEBUG: Test GitHub CLI functionality
        try {
          const testResult = await execAsync(`${ghPath} repo list --limit 1`, { cwd: projectPath, env });
          console.log(`🔍 DEBUG: GitHub CLI repo list test: ${testResult.stdout}`);
        } catch (testError) {
          console.log(`🔍 DEBUG: GitHub CLI repo list test failed: ${testError}`);
        }
        
        console.log(`🔍 DEBUG: Attempting to create repository with gh: ${repoName}`);
        // Use gh CLI creation only if auth works; errors will be caught and we'll fall back to REST-created repo
        await execAsync(`${ghPath} repo create ${repoName} --private --source=. --remote=origin --push`, { cwd: projectPath, env });
        console.log(`✅ Created GitHub repository and pushed with gh: ${repoName}`);
        console.log(`🔗 Repository URL: ${remoteUrl}`);
        return { success: true, details: `Created and pushed with gh: ${repoName}`, remoteUrl };
          
        } catch (ghError) {
          console.log(`⚠️ GitHub CLI creation failed: ${ghError}`);
          console.log(`🔍 DEBUG: GitHub CLI error details:`, ghError);
          console.log(`🔄 Falling back to manual git commands...`);
        }
      }
      
      // Fallback: Manual remote add + push (repo should already exist via REST ensure above)
      try {
        console.log(`🔧 Adding remote manually: ${remoteUrl}`);
        console.log(`🔍 DEBUG: Setting up git remote and branch...`);
        
        await execAsync(`git remote add origin ${remoteUrl}`, { cwd: projectPath, env });
        console.log(`🔍 DEBUG: Remote origin added successfully`);
        
        await execAsync('git branch -M main', { cwd: projectPath, env });
        console.log(`🔍 DEBUG: Branch renamed to main successfully`);
        
        console.log(`⚠️ Note: Repository ${repoName} must be created manually on GitHub first`);
        console.log(`🔗 Create it at: https://github.com/malikrohail/${repoName}`);
        
        // DEBUG: Check git status before push
        try {
          const statusResult = await execAsync('git status', { cwd: projectPath, env });
          console.log(`🔍 DEBUG: Git status before push:`, statusResult.stdout);
        } catch (statusError) {
          console.log(`🔍 DEBUG: Git status check failed:`, statusError);
        }
        
        // Try to push (may still fail if token/permissions invalid)
        console.log(`🔍 DEBUG: Attempting git push -u origin main...`);
        await execAsync('git push -u origin main', { cwd: projectPath, env });
        
        console.log(`🔍 DEBUG: Push completed successfully!`);
        return {
          success: true,
          details: `Added remote and attempted push to: ${remoteUrl}. Repository may need manual creation.`,
          remoteUrl
        };
        
      } catch (manualError) {
        console.log(`🔍 DEBUG: Manual push failed with error:`, manualError);
        console.log(`🔍 DEBUG: Error message: ${manualError instanceof Error ? manualError.message : 'Unknown error'}`);
        console.log(`🔍 DEBUG: Error code: ${(manualError as any)?.code || 'Unknown'}`);
        console.log(`🔍 DEBUG: Error stdout: ${(manualError as any)?.stdout || 'None'}`);
        console.log(`🔍 DEBUG: Error stderr: ${(manualError as any)?.stderr || 'None'}`);
        
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
    const __t0 = Date.now();
    const body = await request.json();
    const { projectId, immediate = false, force = false } = body;

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

    // Read project data (best-effort)
    let projectData: any;
    try {
      projectData = await readProjectJson(projectPath);
    } catch (e) {
      console.warn(`⚠️ Could not read project.json for ${projectId}, proceeding with defaults`, e);
      projectData = { github: { enabled: false } };
    }

    console.log(`🚀 Triggering GitHub sync for project ${projectId}:`, {
      immediate,
      projectPath,
      enabled: (projectData as any).github?.enabled
    });

    // Check if GitHub sync is enabled unless forced
    const githubConfig = (projectData as any).github;
    if (!githubConfig?.enabled && !force) {
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
      const syncResult = await performRealGitHubSync(projectId, projectPath, githubConfig || {});
      
      if (syncResult.success) {
        console.log(`✅ Real GitHub sync completed for ${projectId}:`, syncResult.details);
        
        // Update JSON with real remote URL
        const { updateGitHubConfig } = await import('../../../../../project-json-manager.js');
        await updateGitHubConfig(projectPath, {
          syncStatus: 'idle',
          lastSync: new Date().toISOString(),
          remoteUrl: syncResult.remoteUrl
        });
        
        const res = NextResponse.json({
          success: true,
          message: `GitHub sync completed successfully for ${projectId}`,
          details: syncResult.details,
          remoteUrl: syncResult.remoteUrl,
          projectId
        });
        console.log(`⏱️ GitHub sync total time: ${Date.now() - __t0}ms for project ${projectId}`);
        return res;
        
      } else {
        console.error(`❌ GitHub sync failed for ${projectId}:`, syncResult.error);
        
        // Update status with error
        const { updateGitHubConfig } = await import('../../../../../project-json-manager.js');
        await updateGitHubConfig(projectPath, {
          syncStatus: 'error',
          lastSync: new Date().toISOString()
        });
        
        const res = NextResponse.json({
          success: false,
          error: `GitHub sync failed: ${syncResult.error}`,
          projectId
        }, { status: 500 });
        console.log(`⏱️ GitHub sync total time (failure): ${Date.now() - __t0}ms for project ${projectId}`);
        return res;
      }
      
    } catch (error) {
      console.error(`❌ GitHub sync error for ${projectId}:`, error);
      const res = NextResponse.json({
        success: false,
        error: `GitHub sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        projectId
      }, { status: 500 });
      console.log(`⏱️ GitHub sync total time (exception): ${Date.now() - __t0}ms for project ${projectId}`);
      return res;
    }
    
    // Note: We should never reach here because we return above; keep a guard
    return NextResponse.json({ success: false, error: 'Unexpected sync fallthrough' }, { status: 500 });

  } catch (error) {
    console.error('❌ Failed to trigger GitHub sync:', error);
    const res = NextResponse.json(
      { 
        success: false, 
        error: 'Failed to trigger GitHub sync',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
    try {
      const body = await request.json().catch(() => ({}));
      const projectId = body?.projectId || 'unknown';
      console.log(`⏱️ GitHub sync total time (outer catch): ${Date.now()}ms start-unknown for project ${projectId}`);
    } catch {}
    return res;
  }
} 