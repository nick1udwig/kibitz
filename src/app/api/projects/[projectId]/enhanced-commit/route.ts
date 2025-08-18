import { NextRequest, NextResponse } from 'next/server';
// Use dynamic import to avoid TS path resolution issues for JS file
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import * as Pjm from '@/lib/server/githubSync/project-json-manager.js';
import { findProjectPath as findExistingProjectPath } from '../../../../../lib/server/projectPaths';

function findProjectPath(projectId: string): string | null {
  return findExistingProjectPath(projectId);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await context.params;
    const body = await request.json();
    const { branchName, commitInfo } = body || {};

    if (!projectId || !commitInfo) {
      return NextResponse.json({ success: false, error: 'Missing projectId or commitInfo' }, { status: 400 });
    }

    const projectPath = findProjectPath(projectId);
    if (!projectPath) {
      return NextResponse.json({ success: false, error: `Project ${projectId} not found` }, { status: 404 });
    }

    // Read project.json (single-writer via project-json-manager)
    let projectData: unknown;
    try {
      projectData = await Pjm.readProjectJson(projectPath);
    } catch (e: unknown) {
      return NextResponse.json({ success: false, error: (e as Error)?.message || 'Failed to read project.json' }, { status: 500 });
    }

    // Ensure branches array exists
    if (!Array.isArray((projectData as { branches?: unknown[] }).branches)) (projectData as { branches: unknown[] }).branches = [];

    // Find target branch by name or by commit hash
    let idx = -1;
    if (branchName) idx = (projectData as { branches: unknown[] }).branches.findIndex((b: unknown) => (b as { branchName?: string }).branchName === branchName);
    if (idx < 0 && commitInfo?.hash) idx = (projectData as { branches: unknown[] }).branches.findIndex((b: unknown) => (b as { commitHash?: string }).commitHash === commitInfo.hash);

    if (idx < 0) {
      // Create new branch entry
      (projectData as { branches: unknown[] }).branches.push({
        branchName: branchName || 'main',
        commitHash: commitInfo.hash,
        commitMessage: commitInfo.llmGeneratedMessage || commitInfo.message,
        timestamp: new Date(commitInfo.timestamp).getTime(),
        author: commitInfo.author,
        filesChanged: commitInfo.filesChanged || [],
        linesAdded: commitInfo.linesAdded || 0,
        linesRemoved: commitInfo.linesRemoved || 0,
        isMainBranch: branchName ? branchName === 'main' : false,
        tags: [],
        sync: { lastPushed: null, pushedHash: null, needsSync: false, syncError: null },
        commits: [commitInfo],
        diffData: {
          gitDiff: commitInfo.diff,
          llmProvider: commitInfo.llmProvider,
          llmModel: commitInfo.llmModel,
          llmGeneratedMessage: commitInfo.llmGeneratedMessage,
          llmError: commitInfo.llmError
        }
      });
    } else {
      const branch = (projectData as { branches: unknown[] }).branches[idx] as {
        commitMessage?: string;
        commits?: unknown[];
        diffData?: unknown;
        filesChanged?: unknown;
        linesAdded?: number;
        linesRemoved?: number;
        timestamp?: number;
      };
      if (commitInfo.llmGeneratedMessage) branch.commitMessage = commitInfo.llmGeneratedMessage;
      if (!Array.isArray(branch.commits)) branch.commits = [];
      const existing = branch.commits.findIndex((c: unknown) => (c as { hash?: string }).hash === commitInfo.hash);
      if (existing >= 0) branch.commits[existing] = commitInfo; else branch.commits.push(commitInfo);
      branch.diffData = {
        gitDiff: commitInfo.diff,
        llmProvider: commitInfo.llmProvider,
        llmModel: commitInfo.llmModel,
        llmGeneratedMessage: commitInfo.llmGeneratedMessage,
        llmError: commitInfo.llmError
      };
      branch.filesChanged = commitInfo.filesChanged || branch.filesChanged;
      branch.linesAdded = commitInfo.linesAdded ?? branch.linesAdded;
      branch.linesRemoved = commitInfo.linesRemoved ?? branch.linesRemoved;
      branch.timestamp = new Date(commitInfo.timestamp).getTime();
    }

    try {
      await Pjm.writeProjectJson(projectPath, projectData);
      return NextResponse.json({ success: true });
    } catch (e: unknown) {
      return NextResponse.json({ success: false, error: (e as Error)?.message || 'Failed to write project.json' }, { status: 500 });
    }
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: (error as Error)?.message || 'Unhandled error' }, { status: 500 });
  }
}


