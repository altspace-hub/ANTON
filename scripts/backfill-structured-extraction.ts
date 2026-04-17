/**
 * Backfill structured extraction for existing sessions.
 *
 * For each session that has no structured payload yet (structured_status
 * is null or 'pending'), loads the latest assistant message, looks up the
 * module's contentType, and runs the extractor.
 *
 * Defaults:
 *   - N = 100 most recent sessions per user (spec §12 step 10)
 *   - Skips sessions with no assistant message
 *   - Silent on extraction failure — row is marked structured_status='failed'
 *
 * Usage:
 *   pnpm tsx scripts/backfill-structured-extraction.ts [--limit 100] [--user USER_ID] [--dry]
 */

import { createDatabase } from '../server/db/database.js';
import { createStructuredExtractor } from '../server/services/structured-extractor.js';
import { getModule } from '../server/services/module-loader.js';

interface SessionRow {
  id: string;
  user_id: string | null;
  module_id: string;
  structured_status: string | null;
  created_at: string;
}

interface MessageRow {
  content: string;
  model_id: string | null;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const limit = Number(argVal(args, '--limit') ?? '100');
  const onlyUser = argVal(args, '--user');
  const dry = args.includes('--dry');

  const db = await createDatabase();
  const extractor = createStructuredExtractor(db);

  const where: string[] = [`(structured_status IS NULL OR structured_status IN ('pending', 'failed'))`];
  const params: unknown[] = [];
  if (onlyUser) { where.push('user_id = ?'); params.push(onlyUser); }

  // Pull N most recent sessions per user (simple approach: grab recent
  // sessions overall and group client-side — good enough for backfill).
  const sessions = await db.all<SessionRow>(
    `SELECT id, user_id, module_id, structured_status, created_at
     FROM sessions WHERE ${where.join(' AND ')}
     ORDER BY created_at DESC LIMIT ?`,
    ...params, Math.max(limit, 1) * 50, // grab extra so per-user trimming has enough
  );

  const perUserCount = new Map<string, number>();
  const picked: SessionRow[] = [];
  for (const s of sessions) {
    const key = s.user_id ?? '_no_user';
    const c = perUserCount.get(key) ?? 0;
    if (c >= limit) continue;
    perUserCount.set(key, c + 1);
    picked.push(s);
  }

  console.log(`Backfilling ${picked.length} sessions (limit ${limit}/user, ${onlyUser ? `user=${onlyUser}` : 'all users'})…`);

  let extracted = 0; let failed = 0; let skipped = 0;
  for (const sess of picked) {
    const msg = await db.get<MessageRow>(
      `SELECT content, model_id FROM messages
       WHERE session_id = ? AND role = 'assistant'
       ORDER BY created_at DESC LIMIT 1`,
      sess.id,
    );
    if (!msg?.content || msg.content.length < 100) { skipped++; continue; }

    const mod = await getModule(sess.module_id).catch(() => null);
    const contentType = (mod?.contentType as
      'gap_analysis' | 'risk_register' | 'process_map' | 'policy_document'
      | 'analytic_report' | 'plan_document' | 'entity_register' | 'scorecard'
      | undefined) ?? 'analytic_report';

    if (dry) {
      console.log(`  [dry] ${sess.id}  module=${sess.module_id}  contentType=${contentType}  len=${msg.content.length}`);
      continue;
    }

    try {
      const result = await extractor.extractAndStore(sess.id, {
        markdown: msg.content,
        contentType,
        moduleId: sess.module_id,
        areaId: mod?.areaId ?? '',
        generationModel: msg.model_id ?? 'unknown',
      });
      if (result.status === 'extracted') {
        extracted++;
        console.log(`  ✓ ${sess.id}  [${contentType}] ${result.cached ? '(cached)' : ''}`);
      } else {
        failed++;
        console.log(`  ✗ ${sess.id}  [${contentType}] ${result.error ?? 'unknown'}`);
      }
    } catch (err) {
      failed++;
      console.error(`  ! ${sess.id}  threw: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\nDone: extracted=${extracted}, failed=${failed}, skipped=${skipped}`);
}

function argVal(args: string[], key: string): string | undefined {
  const i = args.indexOf(key);
  return i >= 0 ? args[i + 1] : undefined;
}

main().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
