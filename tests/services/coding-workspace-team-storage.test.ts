/**
 * coding-workspace-team-storage.test.ts — Code Studio's workspace allowlist
 * follows the team-storage rule (round-2 gap "verify:files", Code Studio
 * workspace allowlist).
 *
 * getAllowedBases() read ALLOWED_FOLDER_PATHS on its own, so with the shipped
 * `./uploads,./outputs` whitelist a team user could bind every user's uploads as
 * their Studio workspace and read them through git status and the apply preview
 * — after folder-guard had stopped allowing exactly that. It now drops the same
 * bases folder-guard drops, and validateWorkspacePath also refuses (in team mode)
 * the storage itself, a link into it, the Studio root, and another project's
 * coding-studio/<slug>/ folder.
 *
 * Every refusal has a negative control: a shared folder and the project's own
 * Studio folder still validate in team mode, and solo mode is unchanged.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  getAllowedBases,
  applyFilesToWorkspace,
  isWriteWithinWorkspaceReal,
  validateWorkspacePath,
  STUDIO_ROOT_REFUSAL,
  STUDIO_SIBLING_REFUSAL,
} from '../../server/services/coding-workspace.js';
import { checkFolderPath, overlapsTeamStorage, TEAM_STORAGE_REFUSAL } from '../../server/lib/folder-guard.js';

const ENV_KEYS = [
  'DEPLOYMENT_MODE', 'ALLOWED_FOLDER_PATHS', 'UPLOAD_DIR', 'OUTPUT_DIR', 'WORKSPACES_DIR', 'CODING_STUDIO_ROOT',
] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

const SLUG_A = 'aaaaaaaa1111';
const SLUG_B = 'bbbbbbbb2222';

let sandbox = '';
let uploads = '';
let outputs = '';
let shared = '';
let studio = '';

function env(mode: 'team' | 'solo', allowed: string[] = [uploads, outputs, shared]): NodeJS.ProcessEnv {
  return {
    ...(mode === 'team' ? { DEPLOYMENT_MODE: 'team' } : {}),
    ALLOWED_FOLDER_PATHS: allowed.join(','),
    UPLOAD_DIR: uploads,
    OUTPUT_DIR: outputs,
    WORKSPACES_DIR: path.join(sandbox, 'store', 'workspaces'),
    CODING_STUDIO_ROOT: studio,
  };
}

/** Creates a directory link (junction on Windows, no privilege needed); false when the host cannot. */
function tryLinkDir(target: string, link: string): boolean {
  try {
    fs.symlinkSync(target, link, 'junction');
    return true;
  } catch {
    return false;
  }
}

/** Remove a LINK only — never recurse through it (that would empty the target). */
function unlinkOnly(link: string): void {
  try { fs.unlinkSync(link); } catch { try { fs.rmdirSync(link); } catch { /* sandbox cleanup */ } }
}

beforeAll(() => {
  sandbox = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'anton-studio-storage-')));
  uploads = path.join(sandbox, 'store', 'uploads');
  outputs = path.join(sandbox, 'store', 'outputs');
  shared = path.join(sandbox, 'shared');
  studio = path.join(sandbox, 'studio');
  for (const d of [uploads, outputs, path.join(shared, 'proj'), path.join(studio, SLUG_A, 'src'), path.join(studio, SLUG_B)]) {
    fs.mkdirSync(d, { recursive: true });
  }
  fs.writeFileSync(path.join(uploads, 'alice-contract.md'), 'ALICE-UPLOAD\n', 'utf8');
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

afterAll(() => {
  fs.rmSync(sandbox, { recursive: true, force: true });
});

describe('getAllowedBases — built with the team-storage rule', () => {
  it('drops the uploads/outputs entries of the shipped whitelist in team mode, keeping a shared folder and the Studio root', () => {
    expect(getAllowedBases(env('team'))).toEqual([shared, studio]);
  });

  it('drops a base that CONTAINS the storage (reading it recursively reaches every upload)', () => {
    expect(getAllowedBases(env('team', [path.join(sandbox, 'store'), shared]))).toEqual([shared, studio]);
  });

  it('negative control — solo mode keeps every entry, as before', () => {
    expect(getAllowedBases(env('solo'))).toEqual([uploads, outputs, shared, studio]);
  });

  it('negative control — an unset whitelist still gives only the Studio root (no uploads/outputs fallback)', () => {
    const e = env('solo');
    delete e.ALLOWED_FOLDER_PATHS;
    expect(getAllowedBases(e)).toEqual([studio]);
  });
});

describe('validateWorkspacePath — team mode', () => {
  it('refuses the upload store as a workspace (the exploit from the gap report)', async () => {
    const v = await validateWorkspacePath(uploads, env('team'));
    expect(v.ok).toBe(false);
  });

  it('refuses a link inside a shared folder that points into the upload store', async () => {
    const link = path.join(shared, 'looks-harmless');
    if (!tryLinkDir(uploads, link)) return; // host cannot link — lexical cases still apply
    try {
      const v = await validateWorkspacePath(link, env('team'));
      expect(v.ok).toBe(false);
      expect(v.error).toBe(TEAM_STORAGE_REFUSAL);
      // Same link, solo mode: allowed exactly as before (the owner's own disk).
      expect((await validateWorkspacePath(link, env('solo'))).ok).toBe(true);
    } finally {
      unlinkOnly(link);
    }
  });

  it('refuses the Studio root itself — it holds every project\'s workspace', async () => {
    const v = await validateWorkspacePath(studio, env('team'));
    expect(v.ok).toBe(false);
    expect(v.error).toBe(STUDIO_ROOT_REFUSAL);
  });

  it("refuses another project's Studio folder when the project is named", async () => {
    const v = await validateWorkspacePath(path.join(studio, SLUG_B), env('team'), { studioSlug: SLUG_A });
    expect(v.ok).toBe(false);
    expect(v.error).toBe(STUDIO_SIBLING_REFUSAL);
  });

  it('refuses every Studio folder for a project whose id yields no slug', async () => {
    const v = await validateWorkspacePath(path.join(studio, SLUG_A), env('team'), { studioSlug: null });
    expect(v.error).toBe(STUDIO_SIBLING_REFUSAL);
  });

  it("refuses a link in a shared folder that points at another project's Studio folder", async () => {
    const link = path.join(shared, 'borrowed-studio');
    if (!tryLinkDir(path.join(studio, SLUG_B), link)) return;
    try {
      const v = await validateWorkspacePath(link, env('team'), { studioSlug: SLUG_A });
      expect(v.ok).toBe(false);
      expect(v.error).toBe(STUDIO_SIBLING_REFUSAL);
    } finally {
      unlinkOnly(link);
    }
  });

  it("negative control — the project's own Studio folder (and below it) still validates", async () => {
    expect((await validateWorkspacePath(path.join(studio, SLUG_A), env('team'), { studioSlug: SLUG_A })).ok).toBe(true);
    expect((await validateWorkspacePath(path.join(studio, SLUG_A, 'src'), env('team'), { studioSlug: SLUG_A })).ok).toBe(true);
  });

  it('negative control — a genuinely shared folder still validates', async () => {
    const v = await validateWorkspacePath(path.join(shared, 'proj'), env('team'));
    expect(v.ok).toBe(true);
    expect(v.resolved).toBe(path.join(shared, 'proj'));
  });
});

describe('validateWorkspacePath — solo mode is unchanged', () => {
  it('still accepts the upload store, the Studio root and a sibling Studio folder', async () => {
    expect((await validateWorkspacePath(uploads, env('solo'))).ok).toBe(true);
    expect((await validateWorkspacePath(studio, env('solo'))).ok).toBe(true);
    expect((await validateWorkspacePath(path.join(studio, SLUG_B), env('solo'), { studioSlug: SLUG_A })).ok).toBe(true);
  });
});

describe('folder-guard — the Studio root is per-user storage too', () => {
  it('team mode: refuses the Studio root as a readable folder and drops a base around it', () => {
    const e = env('team', [sandbox]);
    expect(checkFolderPath(path.join(studio, SLUG_A), e).reason).toBe('team_storage');
    expect(overlapsTeamStorage(studio, e)).toBe(true);
  });

  it('overlapsTeamStorage honours `exclude` (Code Studio polices its own root) but still sees the other stores', () => {
    const e = env('team');
    expect(overlapsTeamStorage(path.join(studio, SLUG_A), e, [studio])).toBe(false);
    expect(overlapsTeamStorage(uploads, e, [studio])).toBe(true);
  });

  it('negative control — solo mode: nothing overlaps, the Studio root is readable when whitelisted', () => {
    const e = env('solo', [sandbox]);
    expect(overlapsTeamStorage(studio, e)).toBe(false);
    expect(checkFolderPath(path.join(studio, SLUG_A), e).ok).toBe(true);
  });
});

describe('isWriteWithinWorkspaceReal — team mode: a link may not carry a write out of the workspace', () => {
  // Round 3: this rule is TEAM-ONLY. Round 2 refused every symlinked target in
  // solo mode too, which broke a repo's own in-workspace link (README.md ->
  // docs/README.md) on a single-user machine. Solo is now exactly the old
  // ancestor walk again; each case below states both modes.
  const ws = () => path.join(studio, SLUG_A);

  it("refuses a file symlink inside the workspace that points at someone else's upload (solo: unchanged)", async () => {
    const link = path.join(ws(), 'notes.md');
    try {
      fs.symlinkSync(path.join(uploads, 'alice-contract.md'), link, 'file');
    } catch {
      return; // file symlinks need a privilege on Windows — the junction cases below still run
    }
    try {
      expect(await isWriteWithinWorkspaceReal(ws(), link, env('team'))).toBe(false);
      expect(await isWriteWithinWorkspaceReal(ws(), link, env('solo'))).toBe(true);
    } finally {
      unlinkOnly(link);
    }
  });

  it('refuses a target that is itself a directory link out of the workspace — runs where file symlinks cannot', async () => {
    // The ancestor walk starts at the target's PARENT (the workspace itself
    // here), so only the team rule sees that the target leaves it.
    const link = path.join(ws(), 'vendor');
    if (!tryLinkDir(uploads, link)) return;
    try {
      expect(await isWriteWithinWorkspaceReal(ws(), link, env('team'))).toBe(false);
      expect(await isWriteWithinWorkspaceReal(ws(), link, env('solo'))).toBe(true);
    } finally {
      unlinkOnly(link);
    }
  });

  it('refuses a dangling link in team mode — writeFile would create the file wherever it points', async () => {
    const link = path.join(ws(), 'later');
    if (!tryLinkDir(path.join(sandbox, 'not-created-yet'), link)) return;
    try {
      expect(await isWriteWithinWorkspaceReal(ws(), link, env('team'))).toBe(false);
      expect(await isWriteWithinWorkspaceReal(ws(), link, env('solo'))).toBe(true);
    } finally {
      unlinkOnly(link);
    }
  });

  it("negative control — a link that stays inside the workspace is followed in BOTH modes (the solo regression)", async () => {
    // The directory form of README.md -> docs/README.md: a junction needs no
    // privilege, so this runs on every host.
    const link = path.join(ws(), 'docs-link');
    if (!tryLinkDir(path.join(ws(), 'src'), link)) return;
    try {
      expect(await isWriteWithinWorkspaceReal(ws(), link, env('team'))).toBe(true);
      expect(await isWriteWithinWorkspaceReal(ws(), link, env('solo'))).toBe(true);
      expect(await isWriteWithinWorkspaceReal(ws(), path.join(link, 'README.md'), env('team'))).toBe(true);
    } finally {
      unlinkOnly(link);
    }
  });

  it("negative control — the file form: README.md -> docs/README.md is followed in both modes", async () => {
    fs.mkdirSync(path.join(ws(), 'docs'), { recursive: true });
    fs.writeFileSync(path.join(ws(), 'docs', 'README.md'), '# docs\n', 'utf8');
    const link = path.join(ws(), 'README.md');
    try {
      fs.symlinkSync(path.join(ws(), 'docs', 'README.md'), link, 'file');
    } catch {
      return; // needs a privilege on Windows — the junction form above covers the rule
    }
    try {
      expect(await isWriteWithinWorkspaceReal(ws(), link, env('team'))).toBe(true);
      expect(await isWriteWithinWorkspaceReal(ws(), link, env('solo'))).toBe(true);
    } finally {
      unlinkOnly(link);
    }
  });

  it('team mode: refuses a write that really lands in .git/ through a link or an 8.3 alias', async () => {
    const gitDir = path.join(ws(), '.git');
    fs.mkdirSync(gitDir, { recursive: true });
    fs.writeFileSync(path.join(gitDir, 'config'), '[core]\n', 'utf8');
    try {
      // Through a link: ws/cfg -> ws/.git, target cfg/config.
      const link = path.join(ws(), 'cfg');
      if (tryLinkDir(gitDir, link)) {
        try {
          expect(await isWriteWithinWorkspaceReal(ws(), path.join(link, 'config'), env('team'))).toBe(false);
        } finally {
          unlinkOnly(link);
        }
      }
      // Through an NTFS short name, where the volume makes them (GIT~1 -> .git).
      const alias = path.join(ws(), 'GIT~1');
      let aliasResolves = false;
      try { aliasResolves = fs.realpathSync.native(alias) === gitDir; } catch { /* no 8.3 names here */ }
      if (aliasResolves) {
        expect(await isWriteWithinWorkspaceReal(ws(), path.join(alias, 'config'), env('team'))).toBe(false);
      }
      // Negative control: a sibling file that merely starts with ".git" is fine.
      expect(await isWriteWithinWorkspaceReal(ws(), path.join(ws(), '.gitignore'), env('team'))).toBe(true);
    } finally {
      fs.rmSync(gitDir, { recursive: true, force: true });
    }
  });

  it('applyFilesToWorkspace: in team mode the real write may not land in .git through a link; an inside link is followed', async () => {
    const gitDir = path.join(ws(), '.git');
    fs.mkdirSync(gitDir, { recursive: true });
    fs.writeFileSync(path.join(gitDir, 'config'), '[core]\n', 'utf8');
    const cfgLink = path.join(ws(), 'cfg');
    const inLink = path.join(ws(), 'lib');
    const linked = tryLinkDir(gitDir, cfgLink) && tryLinkDir(path.join(ws(), 'src'), inLink);
    process.env.DEPLOYMENT_MODE = 'team';
    try {
      if (!linked) return;
      // validateRelativePath passes 'cfg/config' (no literal .git); only the
      // real destination shows it is .git/config — core.fsmonitor for the next git.
      await expect(applyFilesToWorkspace({
        workspaceAbs: ws(), applicationId: 'app-git',
        files: [{ path: 'cfg/config', content: '[core]\n\tfsmonitor = planted\n' }],
      })).rejects.toThrow(/refusing to write cfg\/config/);
      expect(fs.readFileSync(path.join(gitDir, 'config'), 'utf8')).toBe('[core]\n');

      const ok = await applyFilesToWorkspace({
        workspaceAbs: ws(), applicationId: 'app-in',
        files: [{ path: 'lib/linked.ts', content: 'export const x = 1;\n' }],
      });
      expect(ok.written).toBe(1);
      expect(fs.readFileSync(path.join(ws(), 'src', 'linked.ts'), 'utf8')).toBe('export const x = 1;\n');
    } finally {
      unlinkOnly(cfgLink);
      unlinkOnly(inLink);
      fs.rmSync(gitDir, { recursive: true, force: true });
    }
  });

  it('negative control — a regular file and a new file in the workspace are allowed in both modes', async () => {
    const regular = path.join(ws(), 'src', 'index.ts');
    fs.writeFileSync(regular, 'export {};\n', 'utf8');
    for (const mode of ['team', 'solo'] as const) {
      expect(await isWriteWithinWorkspaceReal(ws(), regular, env(mode))).toBe(true);
      expect(await isWriteWithinWorkspaceReal(ws(), path.join(ws(), 'src', 'new-file.ts'), env(mode))).toBe(true);
    }
  });
});
