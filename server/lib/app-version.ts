/**
 * The running ANTON version, read once from the app's own package.json.
 *
 * `/api/health` and `/api/config` used to hardcode '0.2.0' while the package
 * was 0.7.5. Walks up from this file so it works from `server/lib` under tsx
 * and from the compiled tree under dist.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_PACKAGE_NAME = 'openexpert';
let cached: string | undefined;

export function appVersion(): string {
  if (cached) return cached;
  cached = 'unknown';
  try {
    let dir = path.dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 6; i++) {
      const candidate = path.join(dir, 'package.json');
      if (fs.existsSync(candidate)) {
        const pkg = JSON.parse(fs.readFileSync(candidate, 'utf8')) as { name?: unknown; version?: unknown };
        if (pkg.name === APP_PACKAGE_NAME && typeof pkg.version === 'string') { cached = pkg.version; break; }
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    cached = 'unknown';
  }
  return cached;
}
