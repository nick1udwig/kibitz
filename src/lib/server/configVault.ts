/*
 * Node-only encrypted persistence for minimal server configuration (GitHub creds).
 * - AES-256-GCM with scrypt-derived key from KIBITZ_CONFIG_SECRET
 * - File lives under kibitz/data/server-config.json.enc by default
 * - Stores only what is needed for server restart resilience: githubToken, githubUsername
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';

export type PersistedServerConfig = {
  githubToken?: string;
  githubUsername?: string;
  // Optional server-wide override for projects base directory
  projectsBaseDir?: string;
  updatedAt?: string;
};

type EncryptedBlobV1 = {
  v: 1;
  s: string; // base64 salt
  n: string; // base64 nonce
  t: string; // base64 auth tag
  c: string; // base64 ciphertext
};

interface ProcessWithVersions {
  versions?: {
    node?: string;
  };
}

const isNode = typeof process !== 'undefined' && !!(process as ProcessWithVersions).versions?.node;

function getDataDir(): string {
  const cwd = process.cwd();
  const custom = process.env.KIBITZ_DATA_DIR;
  const base = custom && custom.trim() ? custom.trim() : fs.existsSync(path.join(cwd, 'data'))
    ? path.join(cwd, 'data')
    : cwd; // fallback to CWD if data/ not present
  return base;
}

function getConfigPath(): string {
  const custom = process.env.KIBITZ_SERVER_CONFIG_PATH;
  if (custom && custom.trim()) return custom.trim();
  return path.join(getDataDir(), 'server-config.json.enc');
}

function getSecret(): string | null {
  const secret = process.env.KIBITZ_CONFIG_SECRET;
  if (secret && secret.trim()) return secret.trim();
  return null;
}

function deriveKey(secret: string, salt: Buffer): Buffer {
  // scrypt: interactive params by default; Node scryptSync uses N=16384, r=8, p=1 under the hood
  return crypto.scryptSync(secret, salt, 32);
}

function encryptJson(obj: object, secret: string): EncryptedBlobV1 {
  const salt = crypto.randomBytes(16);
  const key = deriveKey(secret, salt);
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  const plaintext = Buffer.from(JSON.stringify(obj), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    s: salt.toString('base64'),
    n: nonce.toString('base64'),
    t: tag.toString('base64'),
    c: encrypted.toString('base64'),
  };
}

function decryptJson(blob: EncryptedBlobV1, secret: string): object {
  const salt = Buffer.from(blob.s, 'base64');
  const nonce = Buffer.from(blob.n, 'base64');
  const tag = Buffer.from(blob.t, 'base64');
  const ciphertext = Buffer.from(blob.c, 'base64');
  const key = deriveKey(secret, salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}

function atomicWriteFileSync(targetPath: string, contents: string) {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmpPath = `${targetPath}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  fs.writeFileSync(tmpPath, contents, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmpPath, targetPath);
  try {
    fs.chmodSync(targetPath, 0o600);
  } catch {}
}

// Load persisted config (sync, best-effort). Returns empty object if not available.
export function loadPersistedServerConfig(): PersistedServerConfig {
  if (!isNode) return {};
  const secret = getSecret();
  if (!secret) {
    // No secret configured; skip persistence for safety
    return {};
  }
  try {
    const cfgPath = getConfigPath();
    if (!fs.existsSync(cfgPath)) return {};
    const text = fs.readFileSync(cfgPath, 'utf8');
    const blob = JSON.parse(text) as EncryptedBlobV1;
    if (!blob || blob.v !== 1) return {};
    const decrypted = decryptJson(blob, secret);
    if (typeof decrypted !== 'object' || decrypted === null) return {};
    const out: PersistedServerConfig = {};
    const decryptedObj = decrypted as Record<string, unknown>;
    if (typeof decryptedObj.githubToken === 'string') out.githubToken = decryptedObj.githubToken;
    if (typeof decryptedObj.githubUsername === 'string') out.githubUsername = decryptedObj.githubUsername;
    if (typeof decryptedObj.projectsBaseDir === 'string') out.projectsBaseDir = decryptedObj.projectsBaseDir;
    if (typeof decryptedObj.updatedAt === 'string') out.updatedAt = decryptedObj.updatedAt;
    return out;
  } catch (e) {
    console.warn('configVault: failed to load persisted server config:', e);
    return {};
  }
}

// Persist selected keys (sync). No-op if secret missing.
export function persistServerConfig(updates: PersistedServerConfig): boolean {
  if (!isNode) return false;
  const secret = getSecret();
  if (!secret) {
    console.warn('configVault: KIBITZ_CONFIG_SECRET is not set; skipping encrypted persistence');
    return false;
  }
  try {
    const current = loadPersistedServerConfig();
    const merged: PersistedServerConfig = {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    const blob = encryptJson(merged, secret);
    const payload = JSON.stringify(blob);
    const path = getConfigPath();
    atomicWriteFileSync(path, payload);
    return true;
  } catch (e) {
    console.warn('configVault: failed to persist server config:', e);
    return false;
  }
}

export function hasPersistedAuth(): boolean {
  const cfg = loadPersistedServerConfig();
  return Boolean(cfg.githubToken && cfg.githubUsername);
}

export function resolveServerAuthFromAnySource(): { githubToken: string; githubUsername: string; source: 'env' | 'vault' | 'persisted' | 'none' } {
  // env first
  let token = (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '').trim();
  let username = (process.env.GITHUB_USERNAME || '').trim();
  if (token && username) return { githubToken: token, githubUsername: username, source: 'env' };
  // try in-memory keys route (if already loaded in this process)
  try {
    // Dynamic require for runtime access to in-memory keys
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const keysModule = require('../../app/api/keys/route');
    const vault: Record<string, string> | undefined = keysModule?.apiKeysStorage;
    if (vault) {
      token = (vault.githubToken || token || '').trim();
      username = (vault.githubUsername || username || '').trim();
      if (token && username) return { githubToken: token, githubUsername: username, source: 'vault' };
    }
  } catch {}
  // persisted file last
  const persisted = loadPersistedServerConfig();
  token = (persisted.githubToken || token || '').trim();
  username = (persisted.githubUsername || username || '').trim();
  if (token && username) return { githubToken: token, githubUsername: username, source: 'persisted' };
  return { githubToken: '', githubUsername: '', source: 'none' };
}


