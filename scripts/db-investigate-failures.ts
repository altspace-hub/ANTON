/**
 * Diagnose the 7 pre-existing migration failures.
 * Read-only — pure investigation.
 */
import 'dotenv/config';
import pkg from 'pg';
const { Client } = pkg;

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  console.log('\n=== 112: user_profiles columns ===');
  const cols = await c.query(`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'user_profiles' ORDER BY ordinal_position`);
  console.log(cols.rows.map(r => `  ${r.column_name} (${r.data_type})`).join('\n'));

  console.log('\n=== 125: existing entity_relationships.relationship_type values ===');
  const types = await c.query(`
    SELECT relationship_type, COUNT(*) AS n FROM entity_relationships
    GROUP BY relationship_type ORDER BY n DESC`);
  console.log(types.rows.length === 0 ? '  (table is empty)' :
    types.rows.map(r => `  ${r.relationship_type}: ${r.n} rows`).join('\n'));

  console.log('\n=== 125: current CHECK constraint on entity_relationships ===');
  const ck = await c.query(`
    SELECT conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint WHERE conrelid = 'entity_relationships'::regclass AND contype = 'c'`);
  console.log(ck.rows.map(r => `  ${r.conname}: ${r.def}`).join('\n') || '  (none)');

  console.log('\n=== 134: existing diagnostic_cases counts ===');
  const dc = await c.query(`
    SELECT COUNT(*) AS n,
           COUNT(*) FILTER (WHERE family_id = 'esp32') AS esp32_n,
           COUNT(*) FILTER (WHERE authoritative = true) AS auth_n
    FROM diagnostic_cases`);
  console.log(`  total: ${dc.rows[0].n} · esp32: ${dc.rows[0].esp32_n} · authoritative: ${dc.rows[0].auth_n}`);

  console.log('\n=== migration tracker ===');
  // Try common tracker table names.
  for (const tbl of ['pg_migrations', 'schema_migrations', 'migrations']) {
    try {
      const r = await c.query(`SELECT * FROM ${tbl} ORDER BY 1 DESC LIMIT 5`);
      console.log(`  ${tbl}: ${r.rows.length} recent rows`);
      r.rows.forEach((row: Record<string, unknown>) => console.log(`    ${JSON.stringify(row)}`));
      break;
    } catch { /* try next */ }
  }

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
