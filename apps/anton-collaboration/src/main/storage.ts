/**
 * storage.ts — pluggable storage backend for Anton Collaboration.
 *
 * A verbatim copy of the agent-pay wallet StorageBackend (per the per-app-copy
 * pattern — collaboration is a separate process + package and must not import
 * from agent-pay). Tests use InMemoryStorageBackend; production uses
 * FileStorageBackend (one file per key under ~/.anton-collaboration/store/,
 * mode 0600), holding the agent's signing identity + the agreement store.
 *
 * Key namespace: callers prefix (`agreement.` / `identity.`) so modules sharing
 * the backend never collide.
 */
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';

export interface StorageBackend {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  /** Test/diagnostic: enumerate set keys. File backend can; future keystore-
   *  backed ones may throw. Not for production hot-path logic. */
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

// ── File backend (production) ────────────────────────────────────
//
// One file per key, JSON-wrapped for later versioning. Files are mode 0600;
// the filename is the SHA-256 hex of the key (so arbitrary key strings don't
// have to be escaped), with a .keys index for the reverse mapping.

export class FileStorageBackend implements StorageBackend {
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
    // Write-then-rename for atomicity.
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
    await fs.writeFile(this.indexFile(), existing.join('\n') + '\n', { mode: 0o600 });
  }

  private async removeFromIndex(key: string): Promise<void> {
    const existing = await this.listKeys();
    const next = existing.filter((k) => k !== key);
    if (next.length === existing.length) return;
    await fs.writeFile(this.indexFile(), next.length === 0 ? '' : next.join('\n') + '\n', { mode: 0o600 });
  }
}

function isErrno(e: unknown, code: string): boolean {
  return typeof e === 'object' && e !== null
    && 'code' in e && (e as { code?: string }).code === code;
}
