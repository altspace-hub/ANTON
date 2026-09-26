/**
 * vite-demo-build.test.ts — the public demo is built without a service worker.
 *
 * vite.config.ts sets VitePWA's `disable` from ANTON_DEMO_BUILD. Built with
 * ANTON_DEMO_BUILD=true, the demo generates and registers no service worker, so
 * no copy of its pages is kept in a visitor's browser (privacy memo D15; a
 * cache that is not strictly necessary would need consent, LEK 9 kap. 28 §).
 * The negative control: an ordinary build keeps the service worker.
 *
 * The config file is resolved as `vite build` would resolve it, and the PWA
 * plugin is asked whether it is disabled.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { resolveConfig } from 'vite';
import { join } from 'path';

interface PwaApi { disabled?: boolean }

async function pwaDisabled(demoBuild: string | undefined): Promise<boolean | undefined> {
  if (demoBuild === undefined) delete process.env.ANTON_DEMO_BUILD;
  else process.env.ANTON_DEMO_BUILD = demoBuild;
  const config = await resolveConfig(
    { configFile: join(process.cwd(), 'vite.config.ts'), logLevel: 'silent' },
    'build',
    'production',
  );
  const plugin = config.plugins.find((p) => p.name === 'vite-plugin-pwa');
  expect(plugin, 'vite-plugin-pwa not found in vite.config.ts').toBeDefined();
  return (plugin?.api as PwaApi | undefined)?.disabled;
}

const saved = process.env.ANTON_DEMO_BUILD;
afterEach(() => {
  if (saved === undefined) delete process.env.ANTON_DEMO_BUILD;
  else process.env.ANTON_DEMO_BUILD = saved;
});

describe('service worker in the build', () => {
  it('is off in the demo build', async () => {
    expect(await pwaDisabled('true')).toBe(true);
  });

  it('stays on in an ordinary build', async () => {
    expect(await pwaDisabled(undefined)).toBe(false);
    expect(await pwaDisabled('false')).toBe(false);
  });
});
