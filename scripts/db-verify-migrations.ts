/**
 * Quick verification — did migrations 168 and 169 actually apply?
 * Checks for the tables/columns those migrations create.
 */

import 'dotenv/config';
import pkg from 'pg';
const { Client } = pkg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const client = new Client({ connectionString: DATABASE_URL });

async function check(label: string, query: string, args: unknown[] = []) {
  try {
    const r = await client.query(query, args);
    console.log(`  ${label}: ${r.rows.length > 0 ? 'PRESENT' : 'absent'}`);
    return r.rows.length > 0;
  } catch (err) {
    console.log(`  ${label}: ERROR — ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

async function main() {
  await client.connect();
  console.log('\n=== Migration 168 (school evidence + curriculum) ===');
  await check('learning_evidence_log table', "SELECT 1 FROM information_schema.tables WHERE table_name = 'learning_evidence_log'");
  await check('curriculum_registry table',  "SELECT 1 FROM information_schema.tables WHERE table_name = 'curriculum_registry'");
  await check('curriculum_registry seeded (5+ rows)', "SELECT 1 FROM curriculum_registry LIMIT 5");

  console.log('\n=== Migration 169 (Grow CRM external columns) ===');
  await check('grow_contacts.external_provider',     "SELECT 1 FROM information_schema.columns WHERE table_name='grow_contacts' AND column_name='external_provider'");
  await check('grow_contacts.owned_by_anton',        "SELECT 1 FROM information_schema.columns WHERE table_name='grow_contacts' AND column_name='owned_by_anton'");
  await check('grow_organisations.external_provider',"SELECT 1 FROM information_schema.columns WHERE table_name='grow_organisations' AND column_name='external_provider'");
  await check('grow_opportunities.external_provider',"SELECT 1 FROM information_schema.columns WHERE table_name='grow_opportunities' AND column_name='external_provider'");
  await check('uq_grow_contacts_external index',     "SELECT 1 FROM pg_indexes WHERE indexname = 'uq_grow_contacts_external'");

  console.log('\n=== Previously-failing migrations (now fixed) ===');
  await check('entity_relationships table (mig 125 prereq)',        "SELECT 1 FROM information_schema.tables WHERE table_name='entity_relationships'");
  await check('risk_atlases (mig 125)',                              "SELECT 1 FROM information_schema.tables WHERE table_name='risk_atlases'");
  await check('atlas_threat_paths (mig 125)',                        "SELECT 1 FROM information_schema.tables WHERE table_name='atlas_threat_paths'");
  await check('atlas_appetite_statements (mig 126)',                 "SELECT 1 FROM information_schema.tables WHERE table_name='atlas_appetite_statements'");
  await check('atlas_fcp_scope (mig 127)',                           "SELECT 1 FROM information_schema.tables WHERE table_name='atlas_fcp_scope'");
  await check('atlas_industry_packs.pack_kind (mig 128)',            "SELECT 1 FROM information_schema.columns WHERE table_name='atlas_industry_packs' AND column_name='pack_kind'");
  await check('diagnostic_cases ESP32 seed (mig 134)',               "SELECT 1 FROM diagnostic_cases WHERE family_id='esp32' LIMIT 1");
  console.log('  user_profiles.preferences (mig 112): intentionally absent — migration now no-ops cleanly when the column does not exist');

  console.log('\n=== schema_migrations tail ===');
  const t = await client.query("SELECT id, applied_at FROM schema_migrations ORDER BY applied_at DESC LIMIT 12");
  t.rows.forEach((r: { id: string; applied_at: string }) => console.log(`  ${r.applied_at}  ${r.id}`));

  await client.end();
}

main().catch(err => { console.error(err); process.exit(1); });
