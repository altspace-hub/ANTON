/**
 * moonshot-seed.ts — auto-register Moonshot AI (Kimi) as an OpenAI-compatible
 * endpoint from env.
 *
 * Kimi's platform speaks the OpenAI wire format, so it needs no bespoke adapter and
 * no new entry in the ModelProvider union — it slots into the generic `compat:` path
 * (openaiCompatibleAdapter.ts + custom_model_endpoints, migration 215), exactly like
 * ApeAPI. Mirrors apeapi-seed.ts deliberately: one more provider should be one more
 * seed file, not a new code path.
 *
 *   MOONSHOT_API_KEY   (required to seed — from platform.moonshot.ai)
 *   MOONSHOT_BASE_URL  (optional — the OpenAI-compatible base, ".../v1")
 *
 * After seeding, run a health check in Settings → Model endpoints to discover the
 * available models; they become addressable as `compat:kimi:<model>` and can be used
 * both as a main chat model and as the double-check verifier.
 *
 * Current catalogue (July 2026), for reference when picking a model id:
 *   kimi-k3                    — 1M context, current flagship
 *   kimi-k2.7-code             — 256k, coding/agentic specialist
 *   kimi-k2.7-code-highspeed   — 256k, ~180 tok/s variant
 *   kimi-k2.6                  — 256k, multimodal
 * The kimi-k2 / k2.5 series were discontinued in May 2026 (full platform sunset
 * 31 Aug 2026) — do not seed those.
 *
 * It NEVER overwrites an endpoint already configured via the UI (same slug), and a
 * failure here must never block boot.
 */

import type { DatabaseAdapter } from '../db/database.js';
import { encrypt } from './credential-vault.js';
import { invalidateCustomEndpointCache } from '../routes/custom-model-endpoints.js';

export const MOONSHOT_SLUG = 'kimi';

/** Moonshot's international OpenAI-compatible base. Overridable via env so a
 *  region change (or the .cn endpoint) needs no code change. */
const DEFAULT_MOONSHOT_BASE_URL = 'https://api.moonshot.ai/v1';

export async function seedMoonshotEndpoint(db: DatabaseAdapter): Promise<void> {
  const apiKey = (process.env.MOONSHOT_API_KEY || '').trim();
  if (!apiKey) return; // no key → nothing to seed

  const baseUrl = (process.env.MOONSHOT_BASE_URL || DEFAULT_MOONSHOT_BASE_URL).trim();
  if (!/^https?:\/\//i.test(baseUrl)) {
    console.warn(`[moonshot] MOONSHOT_BASE_URL is not a valid http(s) URL — skipping seed`);
    return;
  }

  try {
    const existing = await db.get('SELECT id FROM custom_model_endpoints WHERE slug = ?', MOONSHOT_SLUG);
    if (existing) return; // configured via UI already — never clobber the operator's row

    await db.run(
      `INSERT INTO custom_model_endpoints (slug, display_name, base_url, api_key_encrypted, notes)
       VALUES (?, ?, ?, ?, ?)`,
      MOONSHOT_SLUG,
      'Moonshot AI (Kimi)',
      baseUrl,
      encrypt(apiKey),
      'Auto-seeded from MOONSHOT_API_KEY. OpenAI-compatible. Run a health check to discover models (compat:kimi:<model>). Latest: kimi-k3 (1M context), kimi-k2.7-code, kimi-k2.6.',
    );
    invalidateCustomEndpointCache();
    console.log(`[moonshot] seeded Kimi compat endpoint (${baseUrl}) from MOONSHOT_API_KEY`);
  } catch (err) {
    console.warn(`[moonshot] could not seed endpoint: ${err instanceof Error ? err.message : 'db error'}`);
  }
}
