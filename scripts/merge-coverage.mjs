#!/usr/bin/env node

// Merge Node V8 coverage (server) with Chrome DevTools coverage (client)
// and write a unified list of unused files under `.coverage/`.
//
// Usage:
//   node scripts/merge-coverage.mjs [workspaceDir] [chromeCoverageJson]
// - workspaceDir defaults to process.cwd()
// - chromeCoverageJson is optional; path to DevTools "Save coverage data" JSON

import fs from 'fs';
import path from 'path';
import url from 'url';

function resolveArgs() {
  const cwd = process.cwd();
  const args = process.argv.slice(2);
  let workspaceDir = args[0] ? path.resolve(args[0]) : cwd;
  let chromeJson = args[1] ? path.resolve(args[1]) : null;
  return { workspaceDir, chromeJson };
}

function normalizePath(p) {
  return p.split(path.sep).join(path.posix.sep);
}

function fromFileUrl(fileUrl) {
  try { return url.fileURLToPath(fileUrl); } catch { return null; }
}

function listAllSourceFiles(srcRoot) {
  const files = [];
  const exts = new Set(['.ts', '.tsx', '.js', '.jsx']);
  function walk(dir) {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === '.next') continue;
        walk(full);
      } else {
        const ext = path.extname(e.name).toLowerCase();
        if (exts.has(ext)) files.push(full);
      }
    }
  }
  walk(srcRoot);
  return files.map(normalizePath);
}

function candidateSourcePathsFromUrl(workspaceDir, rawUrl) {
  const candidates = [];
  if (!rawUrl || typeof rawUrl !== 'string') return candidates;

  // file:// URLs
  if (rawUrl.startsWith('file://')) {
    const p = fromFileUrl(rawUrl);
    if (p) candidates.push(p);
  }

  // Map anything containing /src/ to workspace /src/
  const srcIdx = rawUrl.indexOf('/src/');
  if (srcIdx !== -1) {
    const rel = rawUrl.slice(srcIdx); // /src/...
    candidates.push(path.join(workspaceDir, rel));
  }

  // Map .next server app routes to src/app
  const nextServerIdx = rawUrl.indexOf('/.next/server/app/');
  if (nextServerIdx !== -1) {
    const rel = rawUrl.slice(nextServerIdx + '/.next/server/app/'.length);
    const srcAppJs = path.join(workspaceDir, 'src', 'app', rel);
    candidates.push(srcAppJs);
    candidates.push(srcAppJs.replace(/\.js$/, '.ts'));
    candidates.push(srcAppJs.replace(/\.js$/, '.tsx'));
  }

  return candidates.map(p => path.resolve(p));
}

function hasExecutableRanges(entry) {
  // V8 JSON: result[n].functions[].ranges[].count > 0 => executed
  const fns = entry.functions || [];
  for (const fn of fns) {
    const rs = fn.ranges || [];
    for (const r of rs) {
      if (typeof r.count === 'number' && r.count > 0) return true;
    }
  }
  return false;
}

function loadNodeExecuted(workspaceDir, v8Dir) {
  const used = new Set();
  let files = [];
  try { files = fs.readdirSync(v8Dir).filter(f => f.endsWith('.json')); } catch { return used; }
  for (const f of files) {
    const full = path.join(v8Dir, f);
    let json;
    try { json = JSON.parse(fs.readFileSync(full, 'utf8')); } catch { continue; }
    const results = json.result || [];
    for (const entry of results) {
      if (!hasExecutableRanges(entry)) continue;
      const urlStr = entry.url;
      const candidates = candidateSourcePathsFromUrl(workspaceDir, urlStr);
      for (const c of candidates) {
        if (!c.startsWith(workspaceDir)) continue;
        if (!fs.existsSync(c)) continue;
        used.add(normalizePath(c));
      }
    }
  }
  return used;
}

function loadChromeExecuted(workspaceDir, chromeJsonPath) {
  const used = new Set();
  if (!chromeJsonPath) return used;
  if (!fs.existsSync(chromeJsonPath)) return used;
  let entries;
  try {
    const txt = fs.readFileSync(chromeJsonPath, 'utf8');
    entries = JSON.parse(txt);
  } catch {
    return used;
  }
  // DevTools export is an array of { url, ranges: [{start,end}], text? }
  for (const e of entries) {
    if (!e || !e.url) continue;
    const ranges = Array.isArray(e.ranges) ? e.ranges : [];
    if (ranges.length === 0) continue; // not executed
    const candidates = candidateSourcePathsFromUrl(workspaceDir, String(e.url));
    for (const c of candidates) {
      if (!c.startsWith(workspaceDir)) continue;
      if (!fs.existsSync(c)) continue;
      used.add(normalizePath(c));
    }
  }
  return used;
}

function main() {
  const { workspaceDir, chromeJson } = resolveArgs();
  const srcDir = path.join(workspaceDir, 'src');
  const v8Dir = path.join(workspaceDir, '.v8-coverage');
  const reportDir = path.join(workspaceDir, '.coverage');
  fs.mkdirSync(reportDir, { recursive: true });

  const all = listAllSourceFiles(srcDir);
  const nodeUsed = loadNodeExecuted(workspaceDir, v8Dir);
  const chromeUsed = loadChromeExecuted(workspaceDir, chromeJson);
  const union = new Set([...nodeUsed, ...chromeUsed]);

  const unusedUnion = all.filter(p => !union.has(p));
  const unusedServerOnly = all.filter(p => !nodeUsed.has(p));
  const unusedClientOnly = all.filter(p => !chromeUsed.has(p));

  const write = (name, list) => {
    fs.writeFileSync(path.join(reportDir, name), list.sort().join('\n') + '\n', 'utf8');
  };

  write('used-files.node.txt', [...nodeUsed]);
  write('used-files.chrome.txt', [...chromeUsed]);
  write('unused-files.union.txt', unusedUnion);
  write('unused-files.server-only.txt', unusedServerOnly);
  write('unused-files.client-only.txt', unusedClientOnly);

  console.log('Workspace:', workspaceDir);
  console.log('Chrome coverage JSON:', chromeJson || '(none)');
  console.log('Total src files:', all.length);
  console.log('Executed by Node (server):', nodeUsed.size);
  console.log('Executed by Chrome (client):', chromeUsed.size);
  console.log('Unused by union (server ∪ client):', unusedUnion.length);
  console.log('Wrote reports under .coverage/');
}

main();


