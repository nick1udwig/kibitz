import { NextRequest, NextResponse } from 'next/server';
export const runtime = 'nodejs';
/**
 * GitHub Sync Trigger Route (Server-first Push Orchestrator)
 *
 * Purpose
 * - Single entry point to provision/repair the remote and push branches safely.
 * - Coalesces concurrent requests using a per-project in-flight lock.
 * - Deduplicates jobs by {projectId, branchName, commitHash} with a short TTL cache.
 * - Handles non-fast-forward errors by retrying once with --force-with-lease.
 * - Persists status in project.json → github.syncStatus, github.lastSync, github.lastPush.
 *
 * Request (POST)
 *   {
 *     projectId: string,               // required
 *     immediate?: boolean,             // optional
 *     force?: boolean,                 // optional: bypass disabled-sync gate
 *     branchName?: string,             // optional: commit context for dedupe/logs
 *     commitHash?: string              // optional: commit context for dedupe/logs
 *   }
 *
 * Response
 *   200 OK  { success: true,  status: 'completed', jobId, projectId, branchName?, commitHash?, remoteUrl?, message }
 *   202 Accepted { success: true,  status: 'in_flight' | 'accepted', jobId, message }
 *   400 BadRequest if missing projectId or sync disabled without force
 *   500 Error { success: false, status: 'failed', jobId, error }
 *
 * Notes
 * - Remote provisioning is server-only here; clients should not add/modify remotes when this orchestrator is enabled.
 * - To poll a long-running job, reuse the returned jobId in your UI and call this route again; identical keys coalesce
 *   and will return the in-flight state.
 */
import { readProjectJson } from '../../../../../project-json-manager.js';
import path from 'path';
import fs from 'fs';
import { projectsBaseDir, findProjectPath as findExistingProjectPath } from '../../../../lib/server/projectPaths';
import { resolveServerAuthFromAnySource } from '../../../../lib/server/configVault';

const BASE_PROJECTS_DIR = projectsBaseDir();
// Never hardcode; rely strictly on env. If missing, we will return a clear error when needed.
// Runtime-sourced credentials (fallback to env). The route will fetch secrets
// from the in-memory keys API to avoid hard env dependency.
let GITHUB_USERNAME = process.env.GITHUB_USERNAME || '';
let GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

/**
 * Find project directory by scanning for {projectId}_* pattern
 */
async function findProjectPath(projectId: string): Promise<string | null> {
  return findExistingProjectPath(projectId);
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
    
    // Attempt to resolve credentials from env, in-memory vault, or persisted file
    try {
      const resolved = resolveServerAuthFromAnySource();
      if (resolved.githubToken) GITHUB_TOKEN = resolved.githubToken;
      if (resolved.githubUsername) GITHUB_USERNAME = resolved.githubUsername;
      console.log(`🔐 Auth source: ${resolved.source}`);
    } catch {}

    // DEBUG: Log environment variables for GitHub authentication (no values)
    console.log(`🔍 DEBUG: Checking GitHub environment variables:`);
    console.log(`🔍 DEBUG: GITHUB_TOKEN exists: ${Boolean(process.env.GITHUB_TOKEN)}`);
    console.log(`🔍 DEBUG: GH_TOKEN exists: ${Boolean(process.env.GH_TOKEN)}`);
    console.log(`🔍 DEBUG: GITHUB_USERNAME set: ${Boolean(process.env.GITHUB_USERNAME)}`);
    console.log(`🔍 DEBUG: GIT_USER_NAME set: ${Boolean(process.env.GIT_USER_NAME)}`);
    console.log(`🔍 DEBUG: GIT_USER_EMAIL set: ${Boolean(process.env.GIT_USER_EMAIL)}`);
    
    // Pull runtime secrets from in-memory keys store if available (server-only import)
    try {
      const keysModule: any = await import('../../keys/route');
      const vault = (keysModule as any).apiKeysStorage as Record<string, string>;
      if (vault) {
        GITHUB_TOKEN = vault.githubToken || GITHUB_TOKEN;
        GITHUB_USERNAME = vault.githubUsername || GITHUB_USERNAME;
      }
    } catch {}

    // Helper to strip any masked bullets or invisible characters
    const sanitize = (s: string) => (s || '')
      .replace(/[\u2022•]/g, '') // remove bullet masks
      .replace(/\s+/g, '') // remove spaces
      .trim();

    // Sanitize any values read from env or vault to avoid masked strings
    GITHUB_TOKEN = sanitize(GITHUB_TOKEN);
    GITHUB_USERNAME = sanitize(GITHUB_USERNAME);

    // Get remote URL from GitHub config or generate one based on sanitized env
    const repoName = `${projectId}-project`;
    const remoteUrl = githubConfig.remoteUrl || (GITHUB_USERNAME ? `https://github.com/${GITHUB_USERNAME}/${repoName}.git` : '');
    
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

    // Step 1: Ensure this is a git repository, but do NOT create commits/branches implicitly
    try {
      await execAsync('git status', { cwd: projectPath, env });
      console.log(`✅ Project ${projectId} is already a git repository`);
    } catch (error) {
      console.log(`🔧 Initializing git repository for ${projectId}`);
      await execAsync('git init', { cwd: projectPath, env });
    }

    // Determine if the repository has any commits; if not, DO NOT create or push remote yet
    let hasCommits = true;
    try {
      await execAsync('git rev-parse --verify HEAD', { cwd: projectPath, env });
    } catch {
      hasCommits = false;
      console.log('ℹ️ Repository has no commits yet; skipping remote creation and push.');
      return {
        success: true,
        details: 'No commits yet; deferred remote creation and push until first commit.'
      };
    }

  // Enforce UI-configured minimum changed files before any push attempt
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    const status = await execAsync('git status --porcelain', { cwd: projectPath, env });
    const changed = (status.stdout || '').toString().trim().split('\n').filter((l: string) => l.trim()).length;
    // Try to read min from project.json under settings or github section
    try {
      const { readProjectJson } = await import('../../../../../project-json-manager.js');
      const pData: any = await readProjectJson(projectPath).catch(() => ({}));
      const minFiles = Number(pData?.settings?.minFilesForAutoCommitPush || pData?.github?.minFilesForAutoCommitPush || 0);
      if (minFiles > 0 && changed < minFiles) {
        console.log(`ℹ️ Orchestrator: Below minFilesForAutoCommitPush=${minFiles}. Changed=${changed}. Skipping push.`);
        return {
          success: true,
          details: `Below min files threshold (${changed} < ${minFiles}); push skipped.`
        } as any;
      }
    } catch {}
  } catch {}

    // Step 2: Check if remote origin exists (only after we have commits)
    try {
      const { stdout } = await execAsync('git remote get-url origin', { cwd: projectPath, env });
      console.log(`✅ Remote origin already exists: ${stdout.trim()}`);
      
      // Use existing remote URL
      const existingRemoteUrl = stdout.trim();
      
      // Step 4: Push to existing remote only if there are commits and a current branch
      if (!hasCommits) {
        return {
          success: true,
          details: `Remote exists: ${existingRemoteUrl}. No commits found; skipping push.`,
          remoteUrl: existingRemoteUrl
        };
      }

      try {
        const { stdout: brOut } = await execAsync('git branch --show-current', { cwd: projectPath, env });
        const currentBranch = (brOut || '').toString().trim();
        if (!currentBranch) {
          console.log('ℹ️ No current branch detected; skipping push.');
          return {
            success: true,
            details: `Remote exists: ${existingRemoteUrl}. No current branch; skipping push.`,
            remoteUrl: existingRemoteUrl
          };
        }

        // Prefer header-based push to avoid interactive auth prompts
        let pushCmd = `git push origin ${currentBranch}`;
        let leaseCmd = `git push --force-with-lease origin ${currentBranch}:${currentBranch}`;
        if (GITHUB_TOKEN) {
          const basic = (globalThis as any).Buffer
            ? (globalThis as any).Buffer.from(`x-access-token:${GITHUB_TOKEN}`).toString('base64')
            : '';
          if (basic) {
            const header = `AUTHORIZATION: basic ${basic}`;
            pushCmd = `git -c http.extraHeader="${header}" push ${existingRemoteUrl} ${currentBranch}:${currentBranch}`;
            leaseCmd = `git -c http.extraHeader="${header}" push ${existingRemoteUrl} ${currentBranch}:${currentBranch} --force-with-lease`;
          }
        }
        await execAsync(pushCmd, { cwd: projectPath, env });
        console.log(`✅ Successfully pushed branch '${currentBranch}' to existing remote: ${existingRemoteUrl}`);
        
        return {
          success: true,
          details: `Pushed ${currentBranch} to existing remote: ${existingRemoteUrl}`,
          remoteUrl: existingRemoteUrl
        };
      } catch (pushError: any) {
          const stderr = (pushError && pushError.stderr) ? String(pushError.stderr) : '';
          const stdout = (pushError && pushError.stdout) ? String(pushError.stdout) : '';
          const text = `${stdout}\n${stderr}`;
          const nonFF = /non-fast-forward|rejected/i.test(text);
          if (nonFF) {
            try {
              // Recompute branch and header to construct lease push command safely in this scope
              const { stdout: br2 } = await execAsync('git branch --show-current', { cwd: projectPath, env });
              const currentBranch2 = (br2 || '').toString().trim();
              if (!currentBranch2) throw new Error('No current branch for lease push');
              let leaseCmdLocal = `git push --force-with-lease origin ${currentBranch2}:${currentBranch2}`;
              if (GITHUB_TOKEN) {
                const basic2 = (globalThis as any).Buffer
                  ? (globalThis as any).Buffer.from(`x-access-token:${GITHUB_TOKEN}`).toString('base64')
                  : '';
                if (basic2) {
                  const header2 = `AUTHORIZATION: basic ${basic2}`;
                  leaseCmdLocal = `git -c http.extraHeader="${header2}" push ${existingRemoteUrl} ${currentBranch2}:${currentBranch2} --force-with-lease`;
                }
              }
              console.log('🔁 Non-fast-forward detected. Retrying with --force-with-lease...');
              await execAsync(leaseCmdLocal, { cwd: projectPath, env });
              return {
                success: true,
                details: `Pushed with --force-with-lease to existing remote: ${existingRemoteUrl}`,
                remoteUrl: existingRemoteUrl
              };
            } catch (leaseErr) {
              console.log('❌ Lease push failed:', leaseErr);
              return {
                success: false,
                error: 'Push rejected (non-fast-forward); lease push failed',
                remoteUrl: existingRemoteUrl
              };
            }
          }
          console.log(`⚠️ Push to existing remote failed: ${pushError}`);
          return {
            success: false,
            error: 'Push failed',
            remoteUrl: existingRemoteUrl
          };
        }
      
    } catch (error) {
      // No remote exists → create the repo and connect (now that we have commits)
      console.log(`🔧 No remote origin found, creating/pushing GitHub repository (automated): ${repoName}`);

      // Only proceed with remote setup if required env vars are present
      // Try to refresh credentials from in-process vault by importing the module directly
      if (!GITHUB_TOKEN || !GITHUB_USERNAME) {
        try {
          const keysModule: any = await import('../../keys/route');
          // Access in-memory store indirectly. This stays server-only.
          const vault = (keysModule as any).apiKeysStorage || (keysModule as any).default?.apiKeysStorage;
          if (vault) {
            GITHUB_TOKEN = vault.githubToken || GITHUB_TOKEN;
            GITHUB_USERNAME = vault.githubUsername || GITHUB_USERNAME;
          }
        } catch {}
      }

      if (!GITHUB_TOKEN || !GITHUB_USERNAME) {
        return {
          success: false,
          error: 'Missing GITHUB_TOKEN/GH_TOKEN or GITHUB_USERNAME for automated push and gh CLI unavailable'
        };
      }

      try {
        // Ensure repo exists via REST (create now if missing)
        try {
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
        } catch (restErr) {
          console.log('⚠️ REST repo ensure failed (continuing):', restErr);
        }

        // Add origin remote if missing
        try {
          await execAsync('git remote get-url origin', { cwd: projectPath, env });
        } catch {
          await execAsync(`git remote add origin ${remoteUrl}`, { cwd: projectPath, env });
          console.log(`✅ Added origin remote: ${remoteUrl}`);
        }

        // If no commits, do NOT push; simply return success with remote set
        if (!hasCommits) {
          return {
            success: true,
            details: `Connected origin remote: ${remoteUrl}. No commits yet; push will occur after first commit.`,
            remoteUrl
          };
        }

        // Determine current branch; if none, skip push
        const { stdout: brOut } = await execAsync('git branch --show-current', { cwd: projectPath, env });
        const currentBranch = (brOut || '').toString().trim();
        if (!currentBranch) {
          return {
            success: true,
            details: `Origin set to ${remoteUrl}. No current branch; skipping push until a branch exists.`,
            remoteUrl
          };
        }

        // Push current branch using Basic auth header (GitHub over HTTPS)
        const basic = (globalThis as any).Buffer
          ? (globalThis as any).Buffer.from(`x-access-token:${GITHUB_TOKEN}`).toString('base64')
          : '';
        const header = `AUTHORIZATION: basic ${basic}`;
        console.log(`🔗 Token push to ${remoteUrl} (branch: ${currentBranch})`);
        try {
          await execAsync(`git -c http.extraHeader="${header}" push ${remoteUrl} ${currentBranch}:${currentBranch} -u`, { cwd: projectPath, env });
          console.log(`✅ Token-based push completed successfully`);
          return {
            success: true,
            details: `Pushed ${currentBranch} to ${remoteUrl} using token auth`,
            remoteUrl
          };
        } catch (firstPushErr: any) {
          const stderr = (firstPushErr && firstPushErr.stderr) ? String(firstPushErr.stderr) : '';
          const stdout = (firstPushErr && firstPushErr.stdout) ? String(firstPushErr.stdout) : '';
          const text = `${stdout}\n${stderr}`;
          const nonFF = /non-fast-forward|rejected/i.test(text);
          if (nonFF) {
            try {
              console.log('🔁 Non-fast-forward after remote add. Retrying with --force-with-lease...');
              await execAsync(`git -c http.extraHeader="${header}" push ${remoteUrl} ${currentBranch}:${currentBranch} --force-with-lease`, { cwd: projectPath, env });
              return {
                success: true,
                details: `Pushed with --force-with-lease to ${remoteUrl}`,
                remoteUrl
              };
            } catch (leaseErr) {
              console.log('❌ Lease push failed:', leaseErr);
              return { success: false, error: 'Push rejected (non-fast-forward); lease push failed' };
            }
          }
          throw firstPushErr;
        }
      } catch (tokenPushErr) {
        console.log(`❌ Token-based push failed:`, tokenPushErr);
        return {
          success: false,
          error: tokenPushErr instanceof Error ? tokenPushErr.message : 'Unknown error during token push'
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

// In-memory, per-process job orchestration (best-effort). Survives within server process lifetime.
type OrchestratorJobStatus = 'accepted' | 'in_flight' | 'completed' | 'failed';
type OrchestratorResult = {
  status: OrchestratorJobStatus;
  projectId: string;
  branchName?: string;
  commitHash?: string;
  message?: string;
  remoteUrl?: string | null;
  error?: string;
  jobId: string;
  startedAt: number;
  finishedAt?: number;
};

const inflightByProject: Map<string, { jobKey: string; jobId: string; promise: Promise<OrchestratorResult>; startedAt: number }> = new Map();
const recentResultsByKey: Map<string, { result: OrchestratorResult; expiresAt: number }> = new Map();
const DEFAULT_TTL_MS = 45_000; // Cache recent identical job result for short time

function makeJobKey(projectId: string, branchName?: string | null, commitHash?: string | null) {
  return `${projectId}|${branchName || 'current'}|${commitHash || 'head'}`;
}

function makeJobId(projectId: string) {
  return `${projectId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function POST(request: NextRequest) {
  try {
    const __t0 = Date.now();
    const body = await request.json();
    const { projectId, immediate = false, force = false, branchName: requestedBranch, commitHash: requestedCommitHash } = body || {};

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

    // Orchestrator: dedupe/coalesce by job key
    const jobKey = makeJobKey(projectId, requestedBranch || null, requestedCommitHash || null);
    const now = Date.now();

    // Fast path: identical recent result
    const cached = recentResultsByKey.get(jobKey);
    if (cached && cached.expiresAt > now) {
      const r = cached.result;
      return NextResponse.json({
        success: r.status === 'completed',
        status: r.status,
        projectId: r.projectId,
        branchName: r.branchName,
        commitHash: r.commitHash,
        message: r.message,
        remoteUrl: r.remoteUrl,
        jobId: r.jobId
      }, { status: 200 });
    }

    const existing = inflightByProject.get(projectId);
    if (existing) {
      // Coalesce if same job key
      if (existing.jobKey === jobKey) {
        return NextResponse.json({
          success: true,
          status: 'in_flight',
          projectId,
          branchName: requestedBranch,
          commitHash: requestedCommitHash,
          jobId: existing.jobId,
          message: 'Coalesced with in-flight job'
        });
      }
      // Different job for same project: report busy
      return NextResponse.json({
        success: false,
        status: 'in_flight',
        projectId,
        jobId: existing.jobId,
        message: 'Another sync/push is in progress for this project'
      }, { status: 202 });
    }

    console.log(`🚀 Orchestrator: Starting sync/push for ${projectId} (branch=${requestedBranch || 'current'}, head=${requestedCommitHash || 'head'})`);

    const jobId = makeJobId(projectId);
    const jobPromise: Promise<OrchestratorResult> = (async (): Promise<OrchestratorResult> => {
      try {
        // Mark syncing at start
        try {
          const { updateGitHubConfig } = await import('../../../../../project-json-manager.js');
          await updateGitHubConfig(projectPath, { syncStatus: 'syncing', lastSync: new Date().toISOString() });
        } catch {}
        // Optionally validate HEAD/branch if provided
        let branchName = requestedBranch || '';
        let headCommit = requestedCommitHash || '';
        try {
          const { exec } = await import('child_process');
          const { promisify } = await import('util');
          const execAsync = promisify(exec);
          const env = { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}` };
          if (!branchName) {
            const { stdout } = await execAsync('git branch --show-current', { cwd: projectPath, env });
            branchName = (stdout || '').toString().trim() || '';
          }
          if (!headCommit) {
            const { stdout } = await execAsync('git rev-parse HEAD', { cwd: projectPath, env });
            headCommit = (stdout || '').toString().trim() || '';
          }
        } catch {}

        // Perform real GitHub sync/push (ensures remote, pushes current branch)
        const syncResult = await performRealGitHubSync(projectId, projectPath, githubConfig || {});

        const { updateGitHubConfig } = await import('../../../../../project-json-manager.js');
        if (syncResult.success) {
          await updateGitHubConfig(projectPath, {
            syncStatus: 'idle',
            lastSync: new Date().toISOString(),
            remoteUrl: syncResult.remoteUrl,
            lastPush: {
              branch: branchName || null,
              head: headCommit || null,
              time: new Date().toISOString(),
              result: 'success'
            }
          });
          console.log(`✅ Orchestrator: Completed sync/push for ${projectId} (branch=${branchName || 'n/a'})`);
          return {
            status: 'completed',
            projectId,
            branchName: branchName || undefined,
            commitHash: headCommit || undefined,
            message: syncResult.details || 'Sync completed',
            remoteUrl: syncResult.remoteUrl || null,
            jobId,
            startedAt: __t0,
            finishedAt: Date.now()
          };
        } else {
          await updateGitHubConfig(projectPath, {
            syncStatus: 'error',
            lastSync: new Date().toISOString(),
            lastPush: {
              branch: branchName || null,
              head: headCommit || null,
              time: new Date().toISOString(),
              result: 'error',
              error: syncResult.error || 'unknown'
            }
          });
          return {
            status: 'failed',
            projectId,
            branchName: branchName || undefined,
            commitHash: headCommit || undefined,
            message: 'GitHub sync failed',
            error: syncResult.error || 'Unknown',
            remoteUrl: syncResult.remoteUrl || null,
            jobId,
            startedAt: __t0,
            finishedAt: Date.now()
          };
        }
      } finally {
        // Clear inflight and cache short-lived result
        inflightByProject.delete(projectId);
      }
    })();

    inflightByProject.set(projectId, { jobKey, jobId, promise: jobPromise, startedAt: now });

    // Await completion within soft deadline; otherwise report accepted/in-flight
    let result: OrchestratorResult | null = null;
    try {
      result = await Promise.race([
        jobPromise,
        new Promise<OrchestratorResult>((resolve) => setTimeout(() => resolve({
          status: 'accepted', projectId, branchName: requestedBranch, commitHash: requestedCommitHash, message: 'Job accepted', remoteUrl: null, jobId, startedAt: __t0
        }), 30_000))
      ]);
    } catch {}

    if (result && (result.status === 'completed' || result.status === 'failed')) {
      recentResultsByKey.set(jobKey, { result, expiresAt: Date.now() + DEFAULT_TTL_MS });
      const ok = result.status === 'completed';
      const res = NextResponse.json({
        success: ok,
        status: result.status,
        projectId: result.projectId,
        branchName: result.branchName,
        commitHash: result.commitHash,
        message: result.message,
        remoteUrl: result.remoteUrl,
        jobId: result.jobId
      }, { status: ok ? 200 : 500 });
      console.log(`⏱️ Orchestrator total time: ${Date.now() - __t0}ms for project ${projectId}`);
      return res;
    }

    // Accepted/in-flight response
    const res = NextResponse.json({
      success: true,
      status: 'in_flight',
      projectId,
      branchName: requestedBranch,
      commitHash: requestedCommitHash,
      jobId,
      message: 'Job accepted and running'
    }, { status: 202 });
    console.log(`⏱️ Orchestrator accepted (non-blocking): ${Date.now() - __t0}ms for project ${projectId}`);
    return res;
    
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