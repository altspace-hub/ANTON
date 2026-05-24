/**
 * storage.ts — pluggable storage backend for the wallet module.
 *
 * Why an abstraction:
 *   - Tests use InMemoryStorageBackend (no fs, no leftover state).
 *   - Production main.ts uses FileStorageBackend (one file per key under
 *     ~/.anton-agent-pay/store/, mode 0600).
 *   - Phase 2c can drop in a KeytarStorageBackend that delegates to the
 *     OS keystore (macOS Keychain / Windows DPAPI / Linux libsecret)
 *     for an outer Keystore-bound wrap on top of the passphrase
 *     envelope — same double-wrap shape as ANTON Pay's secure-store.
 *
 * Key namespace: callers prefix with `wallet.` so future modules
 * (e.g. settings) can use the same backend without colliding.
 *
 * Spec: docs/ANTON_AGENT_PAY_SPEC.md §5.1 (storage tiers) + §10
 *       (code layout: src/main/wallet/).
 */
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

export interface StorageBackend {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  /** Test-only: enumerate all keys currently set. Production backends
   *  may throw if they can't cheaply list (file backend can; future
   *  keytar can't). Callers in wallet.ts MUST NOT use this for
   *  production logic. */
  listKeys?(): Promise<string[]>;
}

// ── In-memory backend (tests + dev) ──────────────────────────────

export class InMemoryStorageBackend implements StorageBackend {
  private map = new Map<string, string>();
  async get(key: string): Promise<string | null> {
    return this.map.get(key) ?? null;
  }
  async set(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }
  async remove(key: string): Promise<void> {
    this.map.delete(key);
  }
  async listKeys(): Promise<string[]> {
    return Array.from(this.map.keys());
  }
}

// ── File backend (production MVP) ────────────────────────────────
//
// One file per key, JSON-wrapped to allow versioning later. Files are
// created mode 0600 (read+write by the owning user only). Filename is
// the SHA-256 hex of the key so we don't have to escape arbitrary key
// strings into legal filenames; the .keys index file maintains the
// reverse mapping for listKeys.

import { createHash } from 'node:crypto';

export class FileStorageBackend implements StorageBackend {
  /** Directory under which per-key files live. Created lazily on
   *  first write; mode 0700 so other local users can't read it. */
  private readonly dir: string;

  constructor(dir: string) { this.dir = dir; }

  private fileFor(key: string): string {
    const hashed = createHash('sha256').update(key).digest('hex');
    return path.join(this.dir, hashed + '.json');
  }
  private indexFile(): string {
    return path.join(this.dir, '.keys');
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true, mode: 0o700 });
  }

  async get(key: string): Promise<string | null> {
    try {
      const raw = await fs.readFile(this.fileFor(key), 'utf8');
      const parsed = JSON.parse(raw) as { v: 1; value: string };
      if (parsed.v !== 1 || typeof parsed.value !== 'string') return null;
      return parsed.value;
    } catch (e) {
      if (isErrno(e, 'ENOENT')) return null;
      throw e;
    }
  }

  async set(key: string, value: string): Promise<void> {
    await this.ensureDir();
    const payload = JSON.stringify({ v: 1, value });
    // Write-then-rename for atomicity. If the process is killed between
    // truncate + write, the original file is still intact.
    const tmp = this.fileFor(key) + '.tmp';
    await fs.writeFile(tmp, payload, { mode: 0o600 });
    await fs.rename(tmp, this.fileFor(key));
    await this.appendToIndex(key);
  }

  async remove(key: string): Promise<void> {
    try {
      await fs.unlink(this.fileFor(key));
    } catch (e) {
      if (!isErrno(e, 'ENOENT')) throw e;
    }
    await this.removeFromIndex(key);
  }

  async listKeys(): Promise<string[]> {
    try {
      const raw = await fs.readFile(this.indexFile(), 'utf8');
      return raw.split('\n').filter(Boolean);
    } catch (e) {
      if (isErrno(e, 'ENOENT')) return [];
      throw e;
    }
  }

  private async appendToIndex(key: string): Promise<void> {
    const existing = await this.listKeys();
    if (existing.includes(key)) return;
    existing.push(key);
    await fs.writeFile(this.indexFile(),
      existing.join('\n') + '\n', { mode: 0o600 });
  }

  private async removeFromIndex(key: string): Promise<void> {
    const existing = await this.listKeys();
    const next = existing.filter(k => k !== key);
    if (next.length === existing.length) return;
    await fs.writeFile(this.indexFile(),
      next.length === 0 ? '' : next.join('\n') + '\n', { mode: 0o600 });
  }
}

function isErrno(e: unknown, code: string): boolean {
  return typeof e === 'object' && e !== null
    && 'code' in e && (e as { code?: string }).code === code;
}
