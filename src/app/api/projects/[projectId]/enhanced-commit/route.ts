import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
// Use dynamic import to avoid TS path resolution issues for JS file
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import * as Pjm from '../../../../../../project-json-manager.js';
import { getProjectsBaseDir } from '../../../../../lib/pathConfig';

const BASE_DIR = getProjectsBaseDir();

function findProjectPath(projectId: string): string | null {
  try {
    const entries = fs.readdirSync(BASE_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith(`${projectId}_`)) {
        return path.join(BASE_DIR, entry.name);
      }
    }
  } catch {}
  return null;
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
    let projectData: any;
    try {
      projectData = await Pjm.readProjectJson(projectPath);
    } catch (e: any) {
      return NextResponse.json({ success: false, error: e?.message || 'Failed to read project.json' }, { status: 500 });
    }

    // Ensure branches array exists
    if (!Array.isArray(projectData.branches)) projectData.branches = [];

    // Find target branch by name or by commit hash
    let idx = -1;
    if (branchName) idx = projectData.branches.findIndex((b: any) => b.branchName === branchName);
    if (idx < 0 && commitInfo?.hash) idx = projectData.branches.findIndex((b: any) => b.commitHash === commitInfo.hash);

    if (idx < 0) {
      // Create new branch entry
      projectData.branches.push({
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
      const branch = projectData.branches[idx];
      if (commitInfo.llmGeneratedMessage) branch.commitMessage = commitInfo.llmGeneratedMessage;
      if (!Array.isArray(branch.commits)) branch.commits = [];
      const existing = branch.commits.findIndex((c: any) => c.hash === commitInfo.hash);
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
    } catch (e: any) {
      return NextResponse.json({ success: false, error: e?.message || 'Failed to write project.json' }, { status: 500 });
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Unhandled error' }, { status: 500 });
  }
}


