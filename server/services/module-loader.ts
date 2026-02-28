/**
 * module-loader.ts
 * Scans server/areas/ at startup, loads and validates all area + module configs,
 * caches them in memory, and exposes query functions.
 *
 * Directory structure expected:
 *   server/areas/[area-id]/
 *     ├── area.json
 *     ├── area-context.md
 *     └── modules/
 *         └── [module-id]/
 *             ├── module.json
 *             └── system-prompt.md
 */

import path from 'path';
import fs from 'fs-extra';
import { watch as fsWatch } from 'node:fs';
import { fileURLToPath } from 'url';
import type { AreaConfig, ModuleConfig, LoadedArea } from '../types/area-config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AREAS_DIR = path.join(__dirname, '..', 'areas');

// ── In-memory cache ──────────────────────────────────────────

let _areas: LoadedArea[] | null = null;
let _moduleIndex: Map<string, ModuleConfig> | null = null; // moduleId → module

// ── Dev-mode file watcher ─────────────────────────────────────
// Invalidates cache whenever any area JSON/MD file changes so
// edits to module.json / system-prompt.md are picked up on the
// next request without a server restart.

if (process.env.NODE_ENV !== 'production') {
  try {
    fsWatch(AREAS_DIR, { recursive: true }, () => {
      _areas = null;
      _moduleIndex = null;
    });
  } catch {
    // Recursive watch not supported on all platforms — silently ignore
  }
}

// ── Loader ───────────────────────────────────────────────────

async function loadModule(modulePath: string, areaId: string): Promise<ModuleConfig | null> {
  const configPath = path.join(modulePath, 'module.json');
  const promptPath = path.join(modulePath, 'system-prompt.md');

  if (!await fs.pathExists(configPath)) return null;

  try {
    const config: ModuleConfig = await fs.readJson(configPath);
    config.areaId = areaId;

    if (await fs.pathExists(promptPath)) {
      config.systemPrompt = (await fs.readFile(promptPath, 'utf-8')).trim();
    }

    return config;
  } catch (err) {
    console.error(`[module-loader] Failed to load module at ${modulePath}:`, err);
    return null;
  }
}

async function loadArea(areaPath: string): Promise<LoadedArea | null> {
  const configPath = path.join(areaPath, 'area.json');
  const contextPath = path.join(areaPath, 'area-context.md');
  const modulesDir = path.join(areaPath, 'modules');

  if (!await fs.pathExists(configPath)) return null;

  try {
    const config: AreaConfig = await fs.readJson(configPath);

    const areaContext = await fs.pathExists(contextPath)
      ? (await fs.readFile(contextPath, 'utf-8')).trim()
      : '';

    const modules: ModuleConfig[] = [];

    if (await fs.pathExists(modulesDir)) {
      const entries = await fs.readdir(modulesDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const mod = await loadModule(path.join(modulesDir, entry.name), config.id);
        if (mod) modules.push(mod);
      }
    }

    // Sort modules alphabetically by label for consistent ordering
    modules.sort((a, b) => a.label.localeCompare(b.label));

    return { ...config, modules, areaContext };
  } catch (err) {
    console.error(`[module-loader] Failed to load area at ${areaPath}:`, err);
    return null;
  }
}

async function loadAll(): Promise<void> {
  if (!await fs.pathExists(AREAS_DIR)) {
    console.warn(`[module-loader] Areas directory not found: ${AREAS_DIR}`);
    _areas = [];
    _moduleIndex = new Map();
    return;
  }

  const entries = await fs.readdir(AREAS_DIR, { withFileTypes: true });
  const areas: LoadedArea[] = [];
  const index = new Map<string, ModuleConfig>();

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const area = await loadArea(path.join(AREAS_DIR, entry.name));
    if (!area) continue;
    areas.push(area);
    for (const mod of area.modules) {
      index.set(mod.id, mod);
    }
  }

  _areas = areas;
  _moduleIndex = index;

  const totalModules = areas.reduce((n, a) => n + a.modules.length, 0);
  console.log(`[module-loader] Loaded ${areas.length} area(s), ${totalModules} module(s)`);
}

// ── Public API ────────────────────────────────────────────────

export async function getAreas(): Promise<LoadedArea[]> {
  if (!_areas) await loadAll();
  return _areas!;
}

export async function getArea(areaId: string): Promise<LoadedArea | undefined> {
  const areas = await getAreas();
  return areas.find((a) => a.id === areaId);
}

export async function getModule(moduleId: string): Promise<ModuleConfig | undefined> {
  if (!_moduleIndex) await loadAll();
  return _moduleIndex!.get(moduleId);
}

export async function getAllModules(): Promise<ModuleConfig[]> {
  const areas = await getAreas();
  return areas.flatMap((a) => a.modules);
}

/**
 * Get the system prompt for a module (from the loaded cache).
 * Falls back to the old server/prompts/ directory for backward compatibility.
 */
export async function getModuleSystemPrompt(moduleId: string): Promise<string | null> {
  const mod = await getModule(moduleId);
  if (mod?.systemPrompt) return mod.systemPrompt;

  // Backward compatibility: old flat prompts directory
  const legacyPath = path.join(__dirname, '..', 'prompts', `${moduleId}.md`);
  if (await fs.pathExists(legacyPath)) {
    return (await fs.readFile(legacyPath, 'utf-8')).trim();
  }

  return null;
}

/**
 * Get the area context prompt for a given area ID.
 * Returns empty string if not found.
 */
export async function getAreaContext(areaId: string): Promise<string> {
  const area = await getArea(areaId);
  return area?.areaContext ?? '';
}

/**
 * Invalidate the cache so the next call reloads from disk.
 * Useful for development hot-reload.
 */
export function invalidateCache(): void {
  _areas = null;
  _moduleIndex = null;
}
