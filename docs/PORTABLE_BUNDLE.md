# ANTON portable bundle

A way to give ANTON Local to a non-technical person as **one zip + one
double-click** — no Node, no PostgreSQL, no pnpm, no command line.

The friend unzips the folder, double-clicks `Start ANTON (portable).bat`,
pastes an Anthropic API key once, and ANTON opens in their browser.

This document is for **maintainers** — how the bundle is built and the
non-obvious decisions behind it. The friend-facing instructions live in
`ANTON - Read Me First.html` at the repo root (it ships inside the zip).

---

## What the bundle contains

The bundle is the repo itself plus three downloaded runtimes dropped in at
the root. Nothing about the repo layout is changed.

| Folder | What | How it gets there |
|---|---|---|
| `node/`   | Portable Node.js (win-x64)        | downloaded by `fetch-runtimes.ps1` |
| `pgsql/`  | Portable PostgreSQL 16 binaries   | downloaded by `fetch-runtimes.ps1` |
| `ollama/` | Portable Ollama + embedding model | downloaded by `fetch-runtimes.ps1` |
| `node_modules/` | App dependencies, **hoisted layout** | `pnpm install` during the build |
| `dist/client/`  | Pre-built web UI               | `pnpm run build` during the build |
| `pgdata/` | The database cluster              | created on the friend's machine, first run |

`node/`, `pgsql/`, `ollama/`, `pgdata/` and the output zip are all
git-ignored — they exist only to be swept into the zip.

---

## The scripts (`scripts/portable/`)

| Script | Runs on | Purpose |
|---|---|---|
| `fetch-runtimes.ps1` | build machine | Download Node, PostgreSQL, Ollama into the repo root. Slims Ollama to CPU-only and pulls the `nomic-embed-text` model. |
| `build-portable.ps1` | build machine | Fetch (if needed) → install deps (hoisted) → build the UI → zip the whole folder into `dist-installer/ANTON-portable-<ver>.zip`. |
| `test-bundle.ps1`   | build machine | Verify the finished zip — required content present, excluded content absent, no symlinks. |
| `run-anton.ps1`     | friend's machine | The actual launcher: first-run setup, start PostgreSQL + Ollama + server, open the browser. |
| `stop-anton.ps1`    | friend's machine | Stop everything cleanly. |

`Start ANTON (portable).bat` / `Stop ANTON (portable).bat` at the repo root
are thin double-clickable wrappers around the two runtime scripts.

---

## Building a bundle

From the repo root, on a Windows x64 machine:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\portable\build-portable.ps1
```

That does everything. Useful flags: `-SkipFetch`, `-SkipInstall`,
`-SkipBuild`, `-SkipZip`. To verify the result:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\portable\test-bundle.ps1
```

The result is `dist-installer/ANTON-portable-<version>.zip` (~1.5 GB).

---

## Non-obvious decisions

**Why a zip + script, not Electron.** An earlier Electron attempt broke the
logos and design (its bundled Chromium wrapper). The portable bundle runs
ANTON in the user's *own* browser, so it renders exactly as designed.

**`node_modules` is installed `--node-linker=hoisted`.** pnpm's default
`isolated` layout is a farm of symlinks/junctions. Junctions store absolute
paths, so an isolated `node_modules` does not survive being zipped and moved
to another machine — and a dangling link even makes `tar` abort. Hoisted
mode produces a flat, real-file `node_modules` (npm-style) that relocates
cleanly. The build wipes `node_modules` first so no stale `.pnpm` survives.

> Side effect: building the bundle leaves the dev repo's `node_modules` in
> hoisted layout. It still works for `pnpm run dev`. Run a plain
> `pnpm install` to restore the strict isolated layout.

**`@futurechain/sdk` is embedded as real files.** It is a `workspace:*`
dependency — normally linked. The build replaces the link with a real copy
so the bundle is self-contained.

**Ollama is slimmed to CPU-only.** Modern Ollama ships ~3.3 GB of CUDA GPU
libraries. ANTON only uses Ollama for the small `nomic-embed-text` embedding
model, which runs fine on CPU, so `fetch-runtimes.ps1` deletes the
`cuda_v12` / `cuda_v13` folders (pass `-KeepGpu` to keep them).

**The bundle forces `DEPLOYMENT_MODE=solo`.** ANTON auto-selects "team" mode
(with a login wall) whenever `DATABASE_URL` points at PostgreSQL. `run-anton.ps1`
sets `solo` explicitly so the friend lands straight on the dashboard.

**PostgreSQL runs on port 54329**, not 5432, so it never collides with any
PostgreSQL already installed on the friend's machine. The web server uses
3001, or the next free port if 3001 is taken (the chosen port is written to
`.portable-run/webport.txt`).

**Excluded from the zip:** `.git` (history), `.env` (the dev's API key must
never ship), `pgdata` (first-run state), and the nested `node_modules` of
the workspace sub-projects (`relay`, `anton-business/packages/*`) — those
keep pnpm symlink farms and ANTON Local does not need them.

---

## Updating the bundle for a new ANTON version

1. Pull the latest code.
2. Re-run `build-portable.ps1` (the runtimes are cached; it skips re-downloading).
3. `test-bundle.ps1` to verify.
4. Ship the new zip.

The friend's database survives upgrades — `run-anton.ps1` re-applies any new
migrations on launch.
