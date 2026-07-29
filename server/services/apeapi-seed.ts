/**
 * apeapi-seed.ts — auto-register ApeAPI as an OpenAI-compatible endpoint from env.
 *
 * ApeAPI is a cheap multi-model bundle (OpenAI-compatible aggregator, like
 * OpenRouter). It needs no bespoke adapter — it slots into the generic
 * `compat:` path (openaiCompatibleAdapter.ts + custom_model_endpoints, migration
 * 215). To make onboarding one step, this seeds the endpoint row from:
 *
 *   APEAPI_API_KEY   (required to seed — the vendor key from Lily @ ApeAPI)
 *   APEAPI_BASE_URL  (optional — the OpenAI-compatible base, ".../v1")
 *
 * After seeding, run a health check in Settings → Model endpoints to discover the
 * available models; they become addressable as `compat:apeapi:<model>` and can be
 * used both as a main chat model and as the double-check verifier.
 *
 * It NEVER overwrites an endpoint already configured via the UI (same slug), and a
 * failure here must never block boot.
 */

import type { DatabaseAdapter } from '../db/database.js';
import { encrypt } from './credential-vault.js';
import { invalidateCustomEndpointCache } from './custom-endpoint-resolver.js';

export const APEAPI_SLUG = 'apeapi';

// Placeholder default — confirm the real OpenAI-compatible base URL with the vendor
// and set APEAPI_BASE_URL. Kept overridable so no code change is needed to correct it.
const DEFAULT_APEAPI_BASE_URL = 'https://api.apeapi.ai/v1';

export async function seedApeApiEndpoint(db: DatabaseAdapter): Promise<void> {
  const apiKey = (process.env.APEAPI_API_KEY || '').trim();
  if (!apiKey) return; // no key → nothing to seed

  const baseUrl = (process.env.APEAPI_BASE_URL || DEFAULT_APEAPI_BASE_URL).trim();
  if (!/^https?:\/\//i.test(baseUrl)) {
    console.warn(`[apeapi] APEAPI_BASE_URL is not a valid http(s) URL — skipping seed`);
    return;
  }

  try {
    const existing = await db.get('SELECT id FROM custom_model_endpoints WHERE slug = ?', APEAPI_SLUG);
    if (existing) return; // configured via UI already — never clobber the operator's row

    await db.run(
      `INSERT INTO custom_model_endpoints (slug, display_name, base_url, api_key_encrypted, notes)
       VALUES (?, ?, ?, ?, ?)`,
      APEAPI_SLUG,
      'ApeAPI',
      baseUrl,
      encrypt(apiKey),
      'Auto-seeded from APEAPI_API_KEY. OpenAI-compatible multi-model bundle. Run a health check to discover models (compat:apeapi:<model>).',
    );
    invalidateCustomEndpointCache();
    console.log(`[apeapi] seeded ApeAPI compat endpoint (${baseUrl}) from APEAPI_API_KEY`);
  } catch (err) {
    console.warn(`[apeapi] could not seed endpoint: ${err instanceof Error ? err.message : 'db error'}`);
  }
}
