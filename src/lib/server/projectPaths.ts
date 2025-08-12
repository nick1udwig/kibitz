/**
 * Server-only project path helpers
 *
 * Single source of truth for finding or constructing per-project workspace directories.
 */

import fs from 'fs';
import path from 'path';
import { getProjectsBaseDir } from '../pathConfig';

/** Returns the absolute base directory for projects. */
export function projectsBaseDir(): string {
  return getProjectsBaseDir();
}

/**
 * Find an existing project directory that matches `${projectId}_*`.
 * Returns the absolute path or null if none exists.
 */
export function findProjectPath(projectId: string): string | null {
  const baseDir = projectsBaseDir();
  try {
    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith(`${projectId}_`)) {
        return path.join(baseDir, entry.name);
      }
    }
    return null;
  } catch (error) {
    // Swallow errors and return null – callers can decide how to respond
    return null;
  }
}

/** Sanitize a free-form project name to a safe directory suffix. */
export function sanitizeProjectName(name: string): string {
  return (name || 'project')
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9\-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Build the canonical project path even if it doesn't exist yet. */
export function buildProjectPath(projectId: string, projectName?: string): string {
  const baseDir = projectsBaseDir();
  const safe = sanitizeProjectName(projectName || 'project');
  return path.join(baseDir, `${projectId}_${safe}`);
}

/**
 * Resolve an existing project path or create a new directory if not found.
 * Returns the absolute path and a flag indicating whether it was created.
 */
export function resolveOrCreateProjectPath(projectId: string, projectName?: string): { path: string; created: boolean } {
  const existing = findProjectPath(projectId);
  if (existing) return { path: existing, created: false };

  const target = buildProjectPath(projectId, projectName);
  fs.mkdirSync(target, { recursive: true });
  return { path: target, created: true };
}


