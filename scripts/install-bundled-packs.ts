/**
 * install-bundled-packs.ts — install every knowledge pack that ships in
 * data/knowledge-packs/ (its built .anton bundle) into this instance's
 * database, and activate them, so a fresh server has the same grounding as a
 * development machine. The same path as the Knowledge page's "Install"
 * (createKnowledgePackService().installBundledPack), so every governance
 * check of an import applies.
 *
 *   pnpm exec tsx scripts/install-bundled-packs.ts [--dry-run] [--user <id>]
 *     [--activate fcp|all|none] [--skip-activate <slug prefix>]...
 *
 * - A pack already installed (same name and version) is left as it is, and
 *   an active pack is never deactivated.
 * - --activate fcp (the default): the FCP/AML packs (FCP_AML_PACK_SLUGS) —
 *   compliance and FCP people test with these on.
 * - --activate all: every pack except slugs starting with a --skip-activate
 *   prefix (default "bop-": the BoP packs are AI-drafted Life-pillar
 *   grounding marked NOT validated, and an active pack can reach any run
 *   through relevance retrieval). --activate none (or --no-activate) installs only.
 * - --user names the account recorded as the importer; the default is the
 *   earliest admin.
 *
 * Prints one line per pack; never prints secrets.
 */
import 'dotenv/config';
import { PostgresAdapter } from '../server/db/adapters/postgresql-adapter.js';
import { createKnowledgePackService, FCP_AML_PACK_SLUGS } from '../server/services/knowledge-pack-service.js';

const args = process.argv.slice(2);
const valueOf = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const DRY_RUN = args.includes('--dry-run');
const MODE = args.includes('--no-activate') ? 'none' : (valueOf('--activate') ?? 'fcp');
if (!['fcp', 'all', 'none'].includes(MODE)) throw new Error('--activate takes fcp, all or none');
const skipPrefixes = args.flatMap((a, i) => (a === '--skip-activate' && args[i + 1] ? [args[i + 1]] : []));
const SKIP_ACTIVATE = skipPrefixes.length > 0 ? skipPrefixes : ['bop-'];
/** Whether this run activates the pack. */
function shouldActivate(slug: string): boolean {
  if (MODE === 'fcp') return FCP_AML_PACK_SLUGS.includes(slug);
  if (MODE === 'all') return !SKIP_ACTIVATE.some((p) => slug.startsWith(p));
  return false;
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set.');
  const db = new PostgresAdapter({ connectionString: url, maxConnections: 2 });
  try {
    const userId = valueOf('--user')
      ?? (await db.get<{ id: string }>("SELECT id FROM users WHERE role = 'admin' AND disabled_at IS NULL ORDER BY created_at ASC LIMIT 1"))?.id
      ?? 'solo';
    const svc = await createKnowledgePackService(db);
    const bundled = await svc.listBundledPacks();
    let installed = 0; let activated = 0; let failed = 0;
    for (const pack of bundled) {
      let id = pack.installed_pack_id;
      let status: string = pack.status;
      if (!id) {
        if (DRY_RUN) {
          console.log(`[packs] would install ${pack.slug} (${pack.entity_count} entities)`);
          continue;
        }
        try {
          const row = await svc.installBundledPack(pack.slug, userId);
          id = row.id;
          status = row.status;
          installed++;
        } catch (err) {
          failed++;
          console.log(`[packs] FAILED ${pack.slug}: ${err instanceof Error ? err.message : 'error'}`);
          continue;
        }
      }
      const activate = status !== 'active' && shouldActivate(pack.slug);
      if (activate && !DRY_RUN) {
        await svc.activatePack(id);
        status = 'active';
        activated++;
      }
      console.log(`[packs] ${pack.slug}: ${status}${activate && DRY_RUN ? ' (would activate)' : ''}`);
    }
    console.log(`[packs] ${bundled.length} bundled; installed ${installed}, activated ${activated} (mode ${MODE}), failed ${failed}${DRY_RUN ? ' (dry run)' : ''}`);
    if (failed > 0) process.exitCode = 1;
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error('[packs] error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
