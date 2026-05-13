/**
 * search.ts — GET /v1/portals/search handler.
 *
 * Full-text search over the `portals` table. Backed by the GIN
 * tsvector index from migration 001 — covers name + displayTitle +
 * description. Filters narrow the candidate set, ranking orders within
 * it. Revoked portals are excluded by the partial index.
 *
 * Query params (all optional):
 *   text        free-text query, 256 char max
 *   verbs       comma-separated capability verbs ('book,order')
 *   categories  comma-separated portal categories
 *   namespace   restrict to a specific namespace
 *   limit       default 20, max 100
 *   offset      default 0
 *
 * Response: { results: [{ portalAddress, displayTitle, ... }], total }
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Logger } from 'pino';
import type { RegistryDb } from '../db.js';
import { json } from '../routes.js';
import { validateSearchQuery } from '../validate.js';

interface PortalRow {
  name: string;
  namespace: string;
  contact_hash: string;
  signing_pubkey_hex: string;
  descriptor_json: Record<string, unknown>;
  capability_summary: { verbs?: string[]; tags?: string[]; categories?: string[]; serviceAreas?: string[]; languages?: string[] };
  tier: string;
  approved_at: string;
  rank: number;
  total_count: string;
}

export async function handleSearch(
  req: IncomingMessage,
  res: ServerResponse,
  db: RegistryDb,
  log: Logger,
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://relay');
  const v = validateSearchQuery(url.searchParams);
  if (!v.ok) {
    json(res, 400, { error: 'invalid_query', message: v.error, field: v.field });
    return;
  }

  const params: unknown[] = [];
  const where: string[] = ['portals.revoked_at IS NULL'];
  let rank = '0::real';

  if (v.value.text) {
    params.push(v.value.text);
    where.push(
      `to_tsvector('simple',
         coalesce(portals.name,'') || ' ' ||
         coalesce(portals.descriptor_json->>'displayTitle','') || ' ' ||
         coalesce(portals.descriptor_json->>'description','')
       ) @@ plainto_tsquery('simple', $${params.length})`,
    );
    rank = `ts_rank(
      to_tsvector('simple',
        coalesce(portals.name,'') || ' ' ||
        coalesce(portals.descriptor_json->>'displayTitle','') || ' ' ||
        coalesce(portals.descriptor_json->>'description','')
      ),
      plainto_tsquery('simple', $${params.length})
    )`;
  }

  if (v.value.verbs.length > 0) {
    params.push(v.value.verbs);
    where.push(`portals.capability_summary -> 'verbs' ?| $${params.length}::text[]`);
  }
  if (v.value.categories.length > 0) {
    params.push(v.value.categories);
    where.push(`portals.capability_summary -> 'categories' ?| $${params.length}::text[]`);
  }
  if (v.value.namespace) {
    params.push(v.value.namespace);
    where.push(`portals.namespace = $${params.length}`);
  }

  // Sort: relevance when text is provided, else most-recently-approved.
  const orderBy = v.value.text ? 'rank DESC, portals.approved_at DESC' : 'portals.approved_at DESC';

  // Use a window function for total count so we don't issue a second
  // query. cheaper than COUNT(*) OVER () would be at scale, but for
  // ≤100K rows this is fine.
  const sql = `
    SELECT
      portals.name,
      portals.namespace,
      portals.contact_hash,
      portals.signing_pubkey_hex,
      portals.descriptor_json,
      portals.capability_summary,
      portals.tier,
      portals.approved_at,
      ${rank} AS rank,
      COUNT(*) OVER() AS total_count
    FROM portals
    WHERE ${where.join(' AND ')}
    ORDER BY ${orderBy}
    LIMIT ${v.value.limit}
    OFFSET ${v.value.offset}
  `;

  try {
    const result = await db.query<PortalRow>(sql, params);
    const firstRow = result.rows[0];
    const total = firstRow ? parseInt(firstRow.total_count, 10) : 0;
    const results = result.rows.map((row) => {
      const desc = row.descriptor_json as Record<string, unknown>;
      const summary = row.capability_summary || {};
      return {
        portalAddress: `${row.name}.${row.namespace}`,
        displayTitle: (desc.displayTitle as string) ?? row.name,
        description: (desc.description as string) ?? null,
        category: (desc.category as string) ?? null,
        contactHash: row.contact_hash,
        signingPubkeyHex: row.signing_pubkey_hex,
        capabilityVerbs: summary.verbs ?? [],
        tags: summary.tags ?? [],
        serviceAreas: summary.serviceAreas ?? [],
        languages: summary.languages ?? [],
        tier: row.tier,
        approvedAt: row.approved_at,
        relevanceScore: v.value.text ? row.rank : null,
      };
    });
    json(res, 200, { results, total });
  } catch (err) {
    log.error({ err: (err as Error).message }, 'search query failed');
    json(res, 500, { error: 'internal_error' });
  }
}
