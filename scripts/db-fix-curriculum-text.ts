/**
 * One-shot fix for the curriculum seed rows where "real" was substituted to
 * "DOUBLE PRECISION" by the translator bug (now fixed in postgresql-adapter.ts).
 */
import 'dotenv/config';
import pkg from 'pg';
const { Client } = pkg;

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const r = await c.query(`
    UPDATE curriculum_registry
    SET learning_objective_text = REPLACE(learning_objective_text, 'DOUBLE PRECISION', 'real')
    WHERE learning_objective_text LIKE '%DOUBLE PRECISION%'
    RETURNING id, learning_objective_text`);
  console.log(`Patched ${r.rowCount} row(s):`);
  r.rows.forEach((row: { id: string; learning_objective_text: string }) => {
    console.log(`  ${row.id}: ${row.learning_objective_text}`);
  });
  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
