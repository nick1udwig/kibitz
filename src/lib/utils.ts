// Simple project-scoped audit logger used by git flows
// NOTE: This must be safe in the browser bundle. Do NOT import 'fs' at top-level.
export async function appendProjectLog(projectPath: string, lines: string[]): Promise<void> {
  try {
    // If running in the browser, delegate to API (server writes to disk)
    if (typeof window !== 'undefined') {
      await fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath, lines })
      });
      return;
    }

    // Node path (direct write)
    const fs = await import('fs');
    const path = await import('path');
    const logsDir = path.join(projectPath, '.kibitz', 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    const file = path.join(logsDir, 'git-sync.log');
    const ts = new Date().toISOString();
    const payload = lines.map(l => `[${ts}] ${l}`).join('\n') + '\n';
    fs.appendFileSync(file, payload, 'utf8');
  } catch {
    // best-effort; ignore failures
  }
}
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
