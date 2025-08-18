/**
 * Project JSON Generation API Route
 * POST /api/projects/[projectId]/generate - Generate JSON files with real git data
 */

import { NextRequest, NextResponse } from 'next/server';
export const runtime = 'nodejs';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { findProjectPath as findExistingProjectPath } from '../../../../../lib/server/projectPaths';

export async function POST(
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

    console.log(`📋 Generate API: Creating JSON for project ${projectId}`);
    
    // Find project directory
    const projectPath = findExistingProjectPath(projectId);
    if (!projectPath) {
      return NextResponse.json(
        { error: `Project ${projectId} not found` },
        { status: 404 }
      );
    }

    console.log(`📋 Generate API: Found project at ${projectPath}`);
    
    // 🔧 READ EXISTING PROJECT SETTINGS TO GET GITHUB TOGGLE STATE
    let gitHubEnabled = false; // Default to disabled
    try {
      // Try to read existing project.json if it exists
      const existingJsonPath = path.join(projectPath, '.kibitz', 'api', 'project.json');
      if (fs.existsSync(existingJsonPath)) {
        const existingData = JSON.parse(fs.readFileSync(existingJsonPath, 'utf8'));
        gitHubEnabled = existingData.github?.enabled || false;
        console.log(`📋 Generate API: Existing GitHub enabled state: ${gitHubEnabled}`);
      }
    } catch {
      console.log(`📋 Generate API: No existing project.json, using default GitHub disabled`);
    }
    
    // Extract ALL real git data - NO HARDCODING
    let repositoryData: Record<string, unknown> = {};
    const branchesData: unknown[] = [];
    
    try {
      console.log(`📋 Generate API: Extracting ALL real git data from ${projectPath}`);
      
      // Get local heads only (avoid remote refs like origin/main which cause UI duplicates)
      // Using for-each-ref over refs/heads/ to ensure only local branches are returned
      const allBranchesCommand = 'git for-each-ref --sort=-committerdate --format="%(refname:short)|%(objectname)|%(committerdate:iso8601)|%(authorname)|%(subject)" refs/heads/';
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
       const languageStats: Record<string, number> = {};
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
       } catch {
         console.warn('Could not get language stats, using empty');
       }
      
      // Parse branches
      if (allBranchesOutput) {
        const branchLines = allBranchesOutput.split('\n').filter(line => line.trim());

        // Use a map to deduplicate by normalized branch name
        const seenBranches = new Map<string, boolean>();

        for (const line of branchLines) {
          const [rawBranchName, commitHash, commitDate, authorName, commitMessage] = line.split('|');

          // Normalize the branch name: remove any accidental 'origin/' or 'remotes/' prefixes
          const branchName = (rawBranchName || '')
            .replace(/^remotes\//, '')
            .replace(/^origin\//, '')
            .trim();

          if (branchName && branchName.trim()) {
            // Skip duplicates (e.g., if both 'main' and 'origin/main' slipped through)
            if (seenBranches.has(branchName)) {
              continue;
            }
            seenBranches.set(branchName, true);
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
            } catch {
              console.warn(`Could not get diff stats for branch ${branchName}`);
            }
            
            // Check if this is a conversation branch to add conversation metadata
            let conversationMetadata = null;
            let commits: unknown[] = [];
            let diffData = null;
            
            if (branchName.startsWith('conv-')) {
              const conversationMatch = branchName.match(/conv-([^-]+)-step-(\d+)/);
              if (conversationMatch) {
                conversationMetadata = {
                  conversationId: conversationMatch[1],
                  interactionCount: parseInt(conversationMatch[2]),
                  baseBranch: 'main'
                };
                
                // Try to read any existing enhanced commit data for this branch
                // This will be populated by the enhanced commit system
                commits = []; // Will be populated by enhanced commit processing
                diffData = null; // Will be populated by enhanced commit processing
              }
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
              },
              // Enhanced fields for conversation branches
              ...(conversationMetadata && {
                conversation: conversationMetadata,
                commits,
                diffData
              })
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
    const mainBranch = branchesData.find((b: unknown) => (b as { isMainBranch?: boolean }).isMainBranch) || branchesData[0];
    
    const projectData = {
      // Simple fields that API reads directly
      commit_hash: (mainBranch as { commitHash?: string })?.commitHash || 'unknown',
      branch: repositoryData.defaultBranch || 'main', 
      author: (mainBranch as { author?: string })?.author || 'Unknown',
      date: (mainBranch as { timestamp?: number })?.timestamp ? new Date((mainBranch as { timestamp?: number }).timestamp!).toISOString() : new Date().toISOString(),
      message: (mainBranch as { commitMessage?: string })?.commitMessage || 'No commit message',
      remote_url: null,
      is_dirty: false,
      
      // Extended project metadata
      projectId,
      projectName: path.basename(projectPath).replace(/^[^_]*_/, ''),
      projectPath,
      gitInitialized: true,
      lastActivity: Date.now(),
      repository: repositoryData,
      branches: branchesData,
      conversations: await extractConversationData(projectPath, branchesData),
      
      // GitHub sync configuration (v2 schema)
      github: {
        enabled: gitHubEnabled, // Use the read GitHub enabled state
        remoteUrl: null,
        syncInterval: 300000, // 5 minutes
         // Only main and conversation step branches
         syncBranches: ['main', 'conv-*'],
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
    console.log(`⏱️ Generate API total time: ${Date.now() - __t0}ms for project ${projectId}`);
    
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
    // Still log timing when failing
    try {
      const { projectId } = await context.params;
      console.log(`⏱️ Generate API total time (error): ${Date.now()}ms start-unknown for project ${projectId}`);
    } catch {}
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
 * Extract conversation data from conversation branches
 */
async function extractConversationData(projectPath: string, branchesData: unknown[]): Promise<unknown[]> {
  try {
    console.log('🔍 Extracting conversation data from branches...');
    const conversations: { [conversationId: string]: unknown } = {};
    
    // Process conversation branches
    branchesData.forEach((branch: unknown) => {
      const branchData = branch as { branchName?: string; timestamp?: number; commitHash?: string; commits?: unknown[] };
      if (branchData.branchName?.startsWith('conv-')) {
        const conversationMatch = branchData.branchName.match(/conv-([^-]+)-step-(\d+)/);
        if (conversationMatch) {
          const conversationId = conversationMatch[1];
          const stepNumber = parseInt(conversationMatch[2]);
          
          console.log(`🔍 Found conversation branch: ${branchData.branchName} (${conversationId}, step ${stepNumber})`);
          
          if (!conversations[conversationId]) {
            conversations[conversationId] = {
              conversationId,
              createdAt: branchData.timestamp || Date.now(),
              branches: [],
              currentBranch: null
            };
          }
          
          // Determine correct base branch for incremental workflow
          let baseBranch = 'main'; // Default for step 1
          if (stepNumber > 1) {
            // For step N, base should be step N-1
            baseBranch = `conv-${conversationId}-step-${stepNumber - 1}`;
          }

          // Add branch to conversation
          (conversations[conversationId] as { branches: unknown[] }).branches.push({
            branchName: branchData.branchName,
            baseBranch: baseBranch, // ← Now correctly calculated!
            startingHash: branchData.commitHash,
            interactionIndex: stepNumber,
            createdAt: branchData.timestamp || Date.now(),
            commitHash: branchData.commitHash,
            commits: branchData.commits || [], // Enhanced commit data
            lastLLMMessage: branchData.commits && Array.isArray(branchData.commits) && branchData.commits.length > 0 
              ? (branchData.commits[branchData.commits.length - 1] as { llmGeneratedMessage?: string })?.llmGeneratedMessage 
              : undefined
          });

          console.log(`🔍 Set baseBranch for ${branchData.branchName}: ${baseBranch}`);
          
          // Set as current branch (latest step)
          const currentStep = (conversations[conversationId] as { currentBranch?: string })?.currentBranch 
            ? parseInt((conversations[conversationId] as { currentBranch?: string }).currentBranch?.match(/step-(\d+)$/)?.[1] || '0')
            : 0;
          
          if (stepNumber > currentStep) {
            (conversations[conversationId] as { currentBranch?: string }).currentBranch = branchData.branchName;
          }
        }
      }
    });
    
    const conversationArray = Object.values(conversations);
    console.log(`🔍 Extracted ${conversationArray.length} conversations from branches`);
    
    return conversationArray;
    
  } catch (error) {
    console.error('❌ Error extracting conversation data:', error);
    return [];
  }
} 