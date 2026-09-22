/**
 * header-engine-status.test.ts — the header's status dot tells the truth.
 *
 * 2026-09-22 Work QA: every page other than the Dashboard and Settings showed a
 * red "API Not Configured" (health was never fetched there), a failed health
 * call was recorded as "configured", and a subscription-only instance — the
 * one this project runs — was reported as having no AI at all.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { headerEngineStatus } from '../../src/lib/engine-status';
import type { HealthStatus } from '../../src/lib/types';

const base: HealthStatus = { status: 'ok', apiKeyConfigured: false, database: true, version: '0.7.5' };
const engines = (over: Partial<NonNullable<HealthStatus['engines']>>) => ({
  anthropicApi: false, sdk: false, codex: false, otherProviders: false, ready: false, ...over,
});

describe('headerEngineStatus', () => {
  it('not fetched yet → checking, never a red "not configured"', () => {
    expect(headerEngineStatus(null).tone).toBe('pending');
  });

  it('health call failed → server not responding', () => {
    expect(headerEngineStatus({ ...base, status: 'error' }).tone).toBe('unreachable');
  });

  it('subscription engine only (no API key) → ok, named as the subscription engine', () => {
    const v = headerEngineStatus({ ...base, engines: engines({ sdk: true, ready: true }) });
    expect(v.tone).toBe('ok');
    expect(v.fallback).toBe('Subscription engine');
  });

  it('subscription and an API key → names both', () => {
    const v = headerEngineStatus({ ...base, apiKeyConfigured: true, engines: engines({ sdk: true, anthropicApi: true, ready: true }) });
    expect(v.tone).toBe('ok');
    expect(v.fallback).toBe('Subscription + API key');
  });

  it('API key → ok', () => {
    expect(headerEngineStatus({ ...base, apiKeyConfigured: true, engines: engines({ anthropicApi: true, ready: true }) }).tone).toBe('ok');
  });

  it('no engine at all → not configured', () => {
    expect(headerEngineStatus({ ...base, engines: engines({}) }).tone).toBe('none');
  });

  it('an older server without `engines` still reads apiKeyConfigured', () => {
    expect(headerEngineStatus({ ...base, apiKeyConfigured: true }).tone).toBe('ok');
  });
});

describe('wiring', () => {
  it('the header fetches health itself (it is on every page)', () => {
    const header = readFileSync('src/components/layout/Header.tsx', 'utf8');
    expect(header).toMatch(/useEffect\(\(\) => \{\s*void checkHealth\(\);/);
    expect(header).toMatch(/headerEngineStatus\(health\)/);
  });

  it('a failed health fetch is not recorded as "configured"', () => {
    const store = readFileSync('src/stores/useSettingsStore.ts', 'utf8');
    expect(store).not.toMatch(/status: 'error', apiKeyConfigured: true/);
  });
});

describe('server engineStatus()', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    for (const k of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY', 'MISTRAL_API_KEY', 'AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_API_KEY', 'SDK_ENGINE_ENABLED', 'CODEX_ENGINE_ENABLED']) delete process.env[k];
  });
  afterEach(() => { process.env = { ...saved }; });

  it('counts the subscription engine as ready without an API key', async () => {
    process.env.SDK_ENGINE_ENABLED = 'true';
    const { engineStatus } = await import('../../server/routes/health.js');
    const s = engineStatus();
    expect(s.anthropicApi).toBe(false);
    expect(s.sdk).toBe(true);
    expect(s.ready).toBe(true);
  });

  it('nothing configured → not ready', async () => {
    const { engineStatus } = await import('../../server/routes/health.js');
    expect(engineStatus().ready).toBe(false);
  });
});

describe('appVersion()', () => {
  it('is the package version, not a hardcoded one', async () => {
    const { appVersion } = await import('../../server/lib/app-version.js');
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
    expect(appVersion()).toBe(pkg.version);
  });
});
