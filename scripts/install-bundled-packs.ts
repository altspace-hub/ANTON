/**
 * install-bundled-packs.ts — install every knowledge pack that ships in
 * data/knowledge-packs/ (its built .anton bundle) into this instance's
 * database, and activate them, so a fresh server has the same grounding as a
 * development machine. The same path as the Knowledge page's "Install"
 * (createKnowledgePackService().installBundledPack), so every governance
 * check of an import applies.
 *
 *   pnpm exec tsx scripts/install-bundled-packs.ts [--dry-run] [--user <id>]
 *     [--no-activate] [--skip-activate <slug prefix>]...
 *
 * - A pack already installed (same name and version) is left as it is.
 * - Activation: every installed pack, except slugs starting with a
 *   --skip-activate prefix. The default prefix is "bop-": the BoP packs are
 *   AI-drafted Life-pillar grounding marked NOT validated (README), and an
 *   active pack can reach any run through relevance retrieval.
 * - --user names the account recorded as the importer; the default is the
 *   earliest admin.
 *
 * Prints one line per pack; never prints secrets.
 */
import 'dotenv/config';
import { PostgresAdapter } from '../server/db/adapters/postgresql-adapter.js';
import { createKnowledgePackService } from '../server/services/knowledge-pack-service.js';

const args = process.argv.slice(2);
const valueOf = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const DRY_RUN = args.includes('--dry-run');
const ACTIVATE = !args.includes('--no-activate');
const skipPrefixes = args.flatMap((a, i) => (a === '--skip-activate' && args[i + 1] ? [args[i + 1]] : []));
const SKIP_ACTIVATE = skipPrefixes.length > 0 ? skipPrefixes : ['bop-'];

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
      const activate = ACTIVATE && status !== 'active' && !SKIP_ACTIVATE.some((p) => pack.slug.startsWith(p));
      if (activate && !DRY_RUN) {
        await svc.activatePack(id);
        status = 'active';
        activated++;
      }
      console.log(`[packs] ${pack.slug}: ${status}${activate && DRY_RUN ? ' (would activate)' : ''}`);
    }
    console.log(`[packs] ${bundled.length} bundled; installed ${installed}, activated ${activated}, failed ${failed}${DRY_RUN ? ' (dry run)' : ''}`);
    if (failed > 0) process.exitCode = 1;
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error('[packs] error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
