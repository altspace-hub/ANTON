/**
 * coding-workspace-studio-only.test.ts — a team non-admin's Code Studio
 * workspace is their project's own coding-studio/<slug>/ and nothing else
 * (round-2 gap "verify2:files-2", "Team non-admins can overwrite files in shared
 * whitelisted folders"), plus the overlap test the bind routes use to keep two
 * owners off one folder.
 *
 * The exploit: with ALLOWED_FOLDER_PATHS=D:\Shared and Alice's project bound to
 * D:\Shared\alice-app, Bob bound his own project to the same folder (or to
 * D:\Shared), then got her .env back as the apply preview's "old" side and
 * overwrote it on approve. validateWorkspacePath now takes scope.studioOnly for
 * such a caller and refuses every folder but the project's own Studio folder.
 *
 * Negative controls: the same caller's own folder still validates; an admin
 * (studioOnly false) keeps the shared folder; solo mode ignores the flag.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  validateWorkspacePath,
  workspacesOverlap,
  STUDIO_ONLY_REFUSAL,
  STUDIO_SIBLING_REFUSAL,
} from '../../server/services/coding-workspace.js';

const SLUG_BOB = 'b0b0b0b0b0b0b0b0b0b0b0b0';
const SLUG_ALICE = 'a11ce0a11ce0a11ce0a11ce0';

let sandbox = '';
let shared = '';
let studio = '';

function env(mode: 'team' | 'solo'): NodeJS.ProcessEnv {
  return {
    ...(mode === 'team' ? { DEPLOYMENT_MODE: 'team' } : {}),
    ALLOWED_FOLDER_PATHS: shared,
    UPLOAD_DIR: path.join(sandbox, 'store', 'uploads'),
    OUTPUT_DIR: path.join(sandbox, 'store', 'outputs'),
    WORKSPACES_DIR: path.join(sandbox, 'store', 'workspaces'),
    CODING_STUDIO_ROOT: studio,
  };
}

function tryLinkDir(target: string, link: string): boolean {
  try {
    fs.symlinkSync(target, link, 'junction');
    return true;
  } catch {
    return false;
  }
}

function unlinkOnly(link: string): void {
  try { fs.unlinkSync(link); } catch { try { fs.rmdirSync(link); } catch { /* sandbox cleanup */ } }
}

beforeAll(() => {
  sandbox = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'anton-studio-only-')));
  shared = path.join(sandbox, 'Shared');
  studio = path.join(sandbox, 'coding-studio');
  for (const d of [path.join(shared, 'alice-app'), path.join(studio, SLUG_BOB, 'src'), path.join(studio, SLUG_ALICE)]) {
    fs.mkdirSync(d, { recursive: true });
  }
});

afterAll(() => {
  fs.rmSync(sandbox, { recursive: true, force: true });
});

const BOB = { studioSlug: SLUG_BOB, studioOnly: true };
const ADMIN_ON_BOBS = { studioSlug: SLUG_BOB, studioOnly: false };

describe('validateWorkspacePath — team non-admin (studioOnly)', () => {
  it("refuses a colleague's folder in a shared whitelisted base (the exploit)", async () => {
    const v = await validateWorkspacePath(path.join(shared, 'alice-app'), env('team'), BOB);
    expect(v.ok).toBe(false);
    expect(v.error).toBe(STUDIO_ONLY_REFUSAL);
  });

  it('refuses the shared base itself', async () => {
    const v = await validateWorkspacePath(shared, env('team'), BOB);
    expect(v.error).toBe(STUDIO_ONLY_REFUSAL);
  });

  it('refuses a link in the own Studio folder that leads out to the shared folder', async () => {
    const link = path.join(studio, SLUG_BOB, 'shared-link');
    if (!tryLinkDir(path.join(shared, 'alice-app'), link)) return;
    try {
      const v = await validateWorkspacePath(link, env('team'), BOB);
      expect(v.ok).toBe(false);
      expect(v.error).toBe(STUDIO_ONLY_REFUSAL);
    } finally {
      unlinkOnly(link);
    }
  });

  it("still refuses a sibling project's Studio folder (the round-2 rule)", async () => {
    const v = await validateWorkspacePath(path.join(studio, SLUG_ALICE), env('team'), BOB);
    expect(v.error).toBe(STUDIO_SIBLING_REFUSAL);
  });

  it('a project with no slug has no folder of its own — every folder is refused', async () => {
    const v = await validateWorkspacePath(path.join(studio, SLUG_BOB), env('team'), { studioSlug: null, studioOnly: true });
    expect(v.ok).toBe(false);
  });

  it("negative control — the project's own Studio folder, and a folder inside it, still validate", async () => {
    expect((await validateWorkspacePath(path.join(studio, SLUG_BOB), env('team'), BOB)).ok).toBe(true);
    expect((await validateWorkspacePath(path.join(studio, SLUG_BOB, 'src'), env('team'), BOB)).ok).toBe(true);
  });
});

describe('negative controls — who is NOT limited to the Studio folder', () => {
  it('team admin (studioOnly false): the shared folder still validates', async () => {
    const v = await validateWorkspacePath(path.join(shared, 'alice-app'), env('team'), ADMIN_ON_BOBS);
    expect(v.ok).toBe(true);
  });

  it('solo mode: the flag changes nothing (team rules never run in solo)', async () => {
    expect((await validateWorkspacePath(path.join(shared, 'alice-app'), env('solo'), BOB)).ok).toBe(true);
    expect((await validateWorkspacePath(shared, env('solo'), BOB)).ok).toBe(true);
  });
});

describe('workspacesOverlap', () => {
  it('the same folder, a folder inside, and a folder around all overlap', () => {
    const app = path.join(shared, 'alice-app');
    expect(workspacesOverlap(app, app)).toBe(true);
    expect(workspacesOverlap(shared, app)).toBe(true);
    expect(workspacesOverlap(path.join(app, 'src'), app)).toBe(true);
  });

  it('a link to the folder overlaps it', () => {
    const link = path.join(sandbox, 'alias-of-alice-app');
    if (!tryLinkDir(path.join(shared, 'alice-app'), link)) return;
    try {
      expect(workspacesOverlap(link, path.join(shared, 'alice-app'))).toBe(true);
    } finally {
      unlinkOnly(link);
    }
  });

  it('negative control — siblings, and a name that merely shares a prefix, do not overlap', () => {
    expect(workspacesOverlap(path.join(studio, SLUG_BOB), path.join(studio, SLUG_ALICE))).toBe(false);
    expect(workspacesOverlap(path.join(shared, 'alice-app'), path.join(shared, 'alice-app-2'))).toBe(false);
  });
});
