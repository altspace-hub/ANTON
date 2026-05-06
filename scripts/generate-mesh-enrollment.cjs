/**
 * scripts/generate-mesh-enrollment.cjs
 *
 * Generates a one-time enrollment package for the Companion App with
 * `transport: 'mesh'`. Bypasses the admin HTTP auth by hitting the DB
 * directly through createAppEnrollmentService — useful for dev / testing
 * before the desktop UI grows a "pair via mesh" button.
 *
 * Usage:
 *   node scripts/generate-mesh-enrollment.cjs [--server <url>] [--org <orgId>]
 *
 * Output:
 *   - anton://enroll?server=...&token=... pairing URL (paste into JoinPage)
 *   - 6-digit confirmation code (if intended_user_id was set)
 *   - The full package payload as JSON for inspection.
 *
 * Reads env from .env (DATABASE_URL, ANTON_MESH_RELAYS, etc).
 */

require('dotenv/config');

async function main() {
  const args = process.argv.slice(2);
  const serverArg = pickArg(args, '--server');
  const orgArg = pickArg(args, '--org');
  const serverBase = serverArg ?? `http://localhost:${process.env.PORT || '3001'}`;

  // Import via tsx so we can use the .ts source.
  // (Run with: pnpm tsx scripts/generate-mesh-enrollment.cjs)
  const { PostgresAdapter } = await import('../server/db/adapters/postgresql-adapter.ts');
  const { createAppEnrollmentService } = await import('../server/services/app-enrollment-service.ts');

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not set in .env');
    process.exit(1);
  }
  const db = new PostgresAdapter({ connectionString: process.env.DATABASE_URL });
  const svc = createAppEnrollmentService(db);

  // Build endpoints — wan = the public-facing URL the phone would use IF
  // it ever needed public_https as a fallback. Mesh transport supersedes
  // this for paired phones, but the field is still required by the
  // EnrollmentEndpoints type.
  const endpoints = serverBase.startsWith('https://')
    ? { wan: serverBase }
    : { lan: serverBase };

  const pkg = await svc.startEnrollment({
    issued_by_user_id: 'cli-mesh-enrollment',
    endpoints,
    org_id: orgArg ?? null,
    intended_role: 'member',
    transport: 'mesh',
    require_confirmation_code: false,
  });

  const url = `anton://enroll?server=${encodeURIComponent(serverBase)}&token=${encodeURIComponent(pkg.token)}`;

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  ANTON Mesh enrollment package');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('  Pairing URL (paste into JoinPage on phone):');
  console.log(`  ${url}`);
  console.log('');
  console.log(`  Token:           ${pkg.token}`);
  console.log(`  Server URL:      ${serverBase}`);
  console.log(`  Transport:       ${pkg.transport}`);
  console.log(`  Relay endpoints: ${(pkg.relay_endpoints ?? []).join(', ')}`);
  console.log(`  Expires at:      ${pkg.expires_at}`);
  if (pkg.confirmation_code) {
    console.log(`  Confirmation:    ${pkg.confirmation_code}  (read aloud to phone user)`);
  }
  console.log('');
  console.log('  Mesh identity (binds the phone\'s pinned trust):');
  console.log(`    instance_ed_pk:  ${pkg.instance_ed_pk?.slice(0, 32)}…`);
  console.log(`    instance_x_pk:   ${pkg.instance_x_pk?.slice(0, 32)}…`);
  console.log(`    binding_sig:     ${pkg.binding_sig?.slice(0, 32)}…`);
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  await db.close?.();
  process.exit(0);
}

function pickArg(argv, flag) {
  const i = argv.indexOf(flag);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
}

main().catch((err) => {
  console.error('Failed to generate enrollment:', err);
  process.exit(2);
});
