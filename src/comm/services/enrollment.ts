/**
 * enrollment.ts — Comm App: per-install bearer for Bahnhof's public RPC.
 *
 * Mirrors `src/pay/services/enrollment.ts`. Each ANTON app on a given
 * phone is a separate Capacitor bundle (com.futurechain.anton.comm vs
 * .pay vs .business) and gets its own `install_id` + `install_token`.
 * The DB name on the secure-store side differs per app, so storage
 * is naturally namespaced.
 *
 * See pay/services/enrollment.ts for the full rationale + wire
 * protocol. The only differences vs pay are:
 *   - imports the Comm app's `secure-store`
 *   - env-override key is `VITE_FC_INSTALL_TOKEN` / `FC_COMM_INSTALL_TOKEN`
 *     (per-app override so a single dev machine can run all three
 *     apps with different tokens against the same hub)
 */
import { Capacitor } from '@capacitor/core';
import { getSecure, setSecure } from './secure-store';

const INSTALL_ID_KEY = 'fc.install.id';
const INSTALL_TOKEN_KEY = 'fc.install.token';

let cachedToken: string | null = null;

export async function getInstallToken(endpoint: string): Promise<string> {
  if (cachedToken) return cachedToken;
  const override = readEnvOverride();
  if (override) {
    cachedToken = override;
    return override;
  }
  const stored = await getSecure(INSTALL_TOKEN_KEY);
  if (stored) {
    cachedToken = stored;
    return stored;
  }
  const installId = await getOrCreateInstallId();
  const token = await enroll(endpoint, installId);
  await setSecure(INSTALL_TOKEN_KEY, token);
  cachedToken = token;
  return token;
}

export async function clearInstallToken(): Promise<void> {
  cachedToken = null;
  await setSecure(INSTALL_TOKEN_KEY, '');
}

export async function getOrCreateInstallId(): Promise<string> {
  const existing = await getSecure(INSTALL_ID_KEY);
  if (existing && /^[0-9a-fA-F-]{32,40}$/.test(existing)) return existing.toLowerCase();
  const fresh = generateUuid();
  await setSecure(INSTALL_ID_KEY, fresh);
  return fresh;
}

async function enroll(endpoint: string, installId: string): Promise<string> {
  const body = {
    install_id: installId,
    app_version: appVersion(),
    platform: detectPlatform(),
  };
  const res = await fetch(`${endpoint.replace(/\/$/, '')}/enroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`enroll failed: HTTP ${res.status} ${detail.slice(0, 200)}`);
  }
  const parsed = (await res.json()) as { install_token?: string };
  if (!parsed.install_token || typeof parsed.install_token !== 'string') {
    throw new Error('enroll response missing install_token');
  }
  return parsed.install_token;
}

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

function detectPlatform(): 'ios' | 'android' | 'web' | 'test' {
  try {
    const p = Capacitor.getPlatform();
    if (p === 'ios' || p === 'android') return p;
    if (p === 'web') return 'web';
  } catch { /* fall through */ }
  return 'test';
}

function appVersion(): string {
  try {
    // @ts-expect-error — injected by Vite define
    const v: unknown = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : undefined;
    if (typeof v === 'string' && /^[0-9a-zA-Z.+-]{1,32}$/.test(v)) return v;
  } catch { /* not running under Vite */ }
  return '0.0.0';
}

function readEnvOverride(): string | null {
  try {
    const v: unknown = import.meta.env?.VITE_FC_INSTALL_TOKEN;
    if (typeof v === 'string' && v.length === 64) return v;
  } catch { /* not under Vite */ }
  if (typeof process !== 'undefined' && process.env) {
    const v = process.env['FC_COMM_INSTALL_TOKEN'];
    if (typeof v === 'string' && v.length === 64) return v;
  }
  return null;
}
