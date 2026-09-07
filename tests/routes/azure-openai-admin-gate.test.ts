/**
 * azure-openai-admin-gate.test.ts — the org's Azure credential is admin-only, and the
 * stored key only ever goes to the endpoint it was configured for.
 *
 * Two separate defects, one file, because the second is what makes the first urgent:
 *
 *   1. Every sibling settings surface (settings.ts, connections.ts,
 *      custom-model-endpoints.ts, compliance-policy.ts) carries requireAdminOrSolo.
 *      This router carried nothing, so in team mode a 'viewer' could rewrite the
 *      instance-wide Azure configuration.
 *   2. POST /azure-openai/test took the endpoint from the request body and, when no
 *      apiKey was supplied, decrypted the STORED key and sent it there in the api-key
 *      header. One request to an attacker-chosen host and the org's Azure key is gone
 *      — and it is a general SSRF besides.
 *
 * The gate alone would not close (2): an admin can be phished into a test, and solo
 * mode has no admin boundary at all. So both are fixed and both are tested, including
 * the workflow that must keep working — "test the connection I already saved", where
 * no key is typed because the stored one is the point.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import http from 'http';
import { createAzureOpenAIRoutes } from '../../server/routes/azure-openai.js';
import type { DatabaseAdapter } from '../../server/db/database.js';

/**
 * decrypt() returns its input unchanged when the value is not in iv:tag:ciphertext
 * form, so a plain sentinel stands in for the encrypted key and this test does not
 * depend on the installation's vault key.
 */
const SENTINEL_KEY = 'SENTINEL-AZURE-KEY';

let storedEndpoint = 'http://127.0.0.1:1';   // mutated per case

const db = {
  get: async (sql: string) => {
    if (sql.includes('azure_openai_config')) {
      return { id: 'default', endpoint: storedEndpoint, api_key_encrypted: SENTINEL_KEY, api_version: '2024-10-21', is_active: true };
    }
    return undefined;
  },
  all: async () => [],
  run: async () => ({ changes: 1, lastInsertRowid: 0 }),
  exec: async () => {},
} as unknown as DatabaseAdapter;

let api: http.Server;
let apiBase = '';
let originalMode: string | undefined;
let current: { id: string; username: string; role: string };

/** Stands in for the Azure host: records every request it is sent. */
let azure: http.Server;
let azureBase = '';
let received: Array<{ url: string; apiKey: string | undefined }> = [];

beforeAll(async () => {
  originalMode = process.env.DEPLOYMENT_MODE;

  azure = http.createServer((req, res) => {
    received.push({ url: req.url ?? '', apiKey: req.headers['api-key'] as string | undefined });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ object: 'list', data: [{ id: 'gpt-4o', owned_by: 'azure' }] }));
  });
  await new Promise<void>((resolve) => { azure.listen(0, '127.0.0.1', () => resolve()); });
  const azureAddr = azure.address();
  if (azureAddr === null || typeof azureAddr === 'string') throw new Error('no azure address');
  azureBase = `http://127.0.0.1:${azureAddr.port}`;

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as unknown as { user: typeof current }).user = current; next(); });
  app.use('/api', await createAzureOpenAIRoutes(db));
  await new Promise<void>((resolve) => { api = app.listen(0, '127.0.0.1', () => resolve()); });
  const addr = api.address();
  if (addr === null || typeof addr === 'string') throw new Error('no api address');
  apiBase = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  if (originalMode === undefined) delete process.env.DEPLOYMENT_MODE;
  else process.env.DEPLOYMENT_MODE = originalMode;
  await new Promise<void>((resolve) => { api?.close(() => resolve()); });
  await new Promise<void>((resolve) => { azure?.close(() => resolve()); });
});

beforeEach(() => {
  received = [];
  storedEndpoint = 'http://127.0.0.1:1';
  current = { id: 'u-1', username: 'viewer', role: 'viewer' };
});

const get = (path: string) => fetch(`${apiBase}/api${path}`);
const post = (path: string, body: unknown) => fetch(`${apiBase}/api${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const put = (path: string, body: unknown) => fetch(`${apiBase}/api${path}`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

describe('team mode: only an admin touches instance-wide provider config', () => {
  beforeEach(() => { process.env.DEPLOYMENT_MODE = 'team'; });

  it('403s a viewer on every write and on both credential-spending routes', async () => {
    const responses = await Promise.all([
      put('/azure-openai/config', { endpoint: 'https://evil.example', apiVersion: '2024-10-21' }),
      post('/azure-openai/deployments', { deploymentName: 'd', modelName: 'm' }),
      post('/azure-openai/test', { endpoint: 'https://evil.example', apiVersion: '2024-10-21' }),
      post('/azure-openai/diagnose', { deploymentName: 'd' }),
    ]);
    for (const res of responses) expect(res.status).toBe(403);
    expect(received).toHaveLength(0);
  });

  it('still SERVES the deployment list to a viewer — the model picker depends on it', async () => {
    // ModelSelector.tsx reads this on every page. Gating it would leave every
    // non-admin on an Azure-based install unable to choose a model: a bigger outage
    // than the hole being closed, and the reason this guard is per-route rather than
    // a router.use over the whole prefix.
    const res = await get('/azure-openai/deployments');
    expect(res.status).toBe(200);
  });

  it('the config read a viewer gets carries no usable key', async () => {
    const res = await get('/azure-openai/config');
    expect(res.status).toBe(200);
    expect(JSON.stringify(await res.json())).not.toContain(SENTINEL_KEY);
  });

  it('lets an admin through — the guard must not lock out the person who configures it', async () => {
    current = { id: 'a-1', username: 'admin', role: 'admin' };
    const res = await put('/azure-openai/config', { endpoint: 'https://legit.openai.azure.com', apiKey: 'k', apiVersion: '2024-10-21' });
    expect(res.status).toBe(200);
  });
});

describe('solo mode: the single operator is not gated', () => {
  it('lets the laptop owner write the config whatever role they carry', async () => {
    delete process.env.DEPLOYMENT_MODE;
    current = { id: 'solo', username: 'solo', role: 'viewer' };  // deliberately not admin
    const res = await put('/azure-openai/config', { endpoint: 'https://legit.openai.azure.com', apiKey: 'k', apiVersion: '2024-10-21' });
    expect(res.status).toBe(200);
  });
});

describe('POST /azure-openai/test keeps the stored key on its own endpoint', () => {
  beforeEach(() => {
    delete process.env.DEPLOYMENT_MODE;                 // solo — the gate is not what is under test
    current = { id: 'solo', username: 'solo', role: 'admin' };
  });

  it('refuses to send the stored key to a DIFFERENT endpoint, and sends nothing at all', async () => {
    storedEndpoint = 'https://legit.openai.azure.com';
    const res = await post('/azure-openai/test', { endpoint: azureBase, apiVersion: '2024-10-21' });
    expect(res.status).toBe(400);
    expect(received).toHaveLength(0);                    // no request left the server
    const body = await res.json() as { error?: string };
    expect(body.error).toMatch(/apiKey/);                // says how to test another host
    expect(JSON.stringify(body)).not.toContain(SENTINEL_KEY);
  });

  it('still tests the SAVED configuration with the saved key — the normal workflow', async () => {
    storedEndpoint = azureBase;
    await post('/azure-openai/test', { endpoint: azureBase, apiVersion: '2024-10-21' });
    expect(received).toHaveLength(1);
    expect(received[0].apiKey).toBe(SENTINEL_KEY);       // key went to its own endpoint
  });

  it('lets a caller test any endpoint they bring their own key for', async () => {
    storedEndpoint = 'https://legit.openai.azure.com';
    await post('/azure-openai/test', { endpoint: azureBase, apiKey: 'my-own-key', apiVersion: '2024-10-21' });
    expect(received).toHaveLength(1);
    expect(received[0].apiKey).toBe('my-own-key');
    expect(received[0].apiKey).not.toBe(SENTINEL_KEY);
  });

  it('treats a trailing slash as the same endpoint, not a different one', async () => {
    // Origin comparison, so the saved "https://x/" and a typed "https://x" match — a
    // stricter string compare would break the saved-config test for half the users.
    storedEndpoint = `${azureBase}/`;
    await post('/azure-openai/test', { endpoint: azureBase, apiVersion: '2024-10-21' });
    expect(received).toHaveLength(1);
    expect(received[0].apiKey).toBe(SENTINEL_KEY);
  });
});
