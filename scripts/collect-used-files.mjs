#!/usr/bin/env node

// Collects executed files from Node V8 coverage JSON and compares against
// project source files under `src/`, writing a list of unused files.
//
// Usage:
//   node scripts/collect-used-files.mjs [workspaceDir]
// Defaults to process.cwd(). Assumes coverage JSON in `.v8-coverage`.

import fs from 'fs';
import path from 'path';
import url from 'url';

function resolveWorkspaceDir() {
  const arg = process.argv[2];
  if (arg) return path.resolve(arg);
  return process.cwd();
}

const workspaceDir = resolveWorkspaceDir();
const coverageDir = path.join(workspaceDir, '.v8-coverage');
const reportDir = path.join(workspaceDir, '.coverage');
const srcDir = path.join(workspaceDir, 'src');

function listAllSourceFiles(rootDir) {
  const files = [];
  const exts = new Set(['.ts', '.tsx', '.js', '.jsx']);
  function walk(dir) {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip build and test artifact directories inside src if any
        if (entry.name === '.next' || entry.name === 'node_modules') continue;
        walk(full);
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (exts.has(ext)) files.push(full);
      }
    }
  }
  walk(rootDir);
  return files;
}

function normalizePath(p) {
  return p.split(path.sep).join(path.posix.sep);
}

function fromFileUrl(fileUrl) {
  try {
    return url.fileURLToPath(fileUrl);
  } catch {
    return null;
  }
}

function candidateSourcePathsFromUrl(rawUrl) {
  const candidates = [];
  if (!rawUrl || typeof rawUrl !== 'string') return candidates;

  // 1) file:// URLs
  if (rawUrl.startsWith('file://')) {
    const p = fromFileUrl(rawUrl);
    if (p) candidates.push(p);
  }

  // 2) webpack:// URLs that still embed /src/
  if (rawUrl.includes('/src/')) {
    const idx = rawUrl.indexOf('/src/');
    const rel = rawUrl.slice(idx); // e.g. /src/lib/x.ts
    candidates.push(path.join(workspaceDir, rel));
  }

  // 3) Next.js server build paths -> try to map to /src/app/
  // Example: /.../.next/server/app/api/foo/route.js -> /src/app/api/foo/route.ts(x)?
  if (rawUrl.includes('/.next/server/app/')) {
    const idx = rawUrl.indexOf('/.next/server/app/');
    const rel = rawUrl.slice(idx + '/.next/server/app/'.length); // api/foo/route.js
    const srcAppJs = path.join(srcDir, 'app', rel); // route.js
    const maybeTs = srcAppJs.replace(/\.js$/, '.ts');
    const maybeTsx = srcAppJs.replace(/\.js$/, '.tsx');
    if (fs.existsSync(maybeTs)) candidates.push(maybeTs);
    if (fs.existsSync(maybeTsx)) candidates.push(maybeTsx);
    if (fs.existsSync(srcAppJs)) candidates.push(srcAppJs);
  }

  return candidates;
}

function hasExecutableRanges(coverageEntry) {
  // Any function that has a range with count > 0 is considered executed
  const functions = coverageEntry.functions || [];
  for (const fn of functions) {
    const ranges = fn.ranges || [];
    for (const r of ranges) {
      if (typeof r.count === 'number' && r.count > 0) return true;
    }
  }
  return false;
}

function loadExecutedFilesFromV8(dir) {
  const used = new Set();
  let files = [];
  try {
    files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  } catch {
    console.error(`No coverage directory found at: ${dir}`);
    return used;
  }

  for (const file of files) {
    const full = path.join(dir, file);
    let json;
    try {
      const text = fs.readFileSync(full, 'utf8');
      json = JSON.parse(text);
    } catch {
      continue; // skip bad files
    }
    const results = json.result || [];
    for (const entry of results) {
      if (!hasExecutableRanges(entry)) continue;
      const rawUrl = entry.url;
      const candidates = candidateSourcePathsFromUrl(rawUrl);
      for (const c of candidates) {
        const abs = path.resolve(c);
        if (!abs.startsWith(workspaceDir)) continue;
        if (!fs.existsSync(abs)) continue;
        // Normalize to posix for consistent sets
        used.add(normalizePath(abs));
      }
    }
  }
  return used;
}

function main() {
  if (!fs.existsSync(srcDir)) {
    console.error(`src directory not found: ${srcDir}`);
    process.exit(1);
  }
  fs.mkdirSync(reportDir, { recursive: true });

  const allFiles = listAllSourceFiles(srcDir).map(normalizePath);
  const usedFiles = loadExecutedFilesFromV8(coverageDir);

  const usedInSrc = new Set([...usedFiles].filter(p => p.startsWith(normalizePath(srcDir))));
  const unused = allFiles.filter(p => !usedInSrc.has(p));

  const outFile = path.join(reportDir, 'unused-files.txt');
  fs.writeFileSync(outFile, unused.sort().join('\n') + '\n', 'utf8');

  console.log('Total src files:', allFiles.length);
  console.log('Executed src files (server):', usedInSrc.size);
  console.log('Unused src files (by this run):', unused.length);
  console.log(`Written list to: ${outFile}`);
}

main();


