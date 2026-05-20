/**
 * enrollment-e2e-smoke.mts — end-to-end smoke for the per-install
 * enrollment flow on the Bahnhof public RPC hub (Phase F1+F2,
 * May 20 2026).
 *
 * Exercises:
 *   1. POST /enroll with a fresh UUID install_id → receive an
 *      install_token.
 *   2. POST /submit_signed_transaction with that token → accepted by
 *      Caddy + forwarded to the FC light-hub (400 from FC on the
 *      empty body is the expected pass-through).
 *   3. POST /enroll again with the SAME install_id → idempotent,
 *      returns the same token.
 *   4. Admin revokes the install_id via the loopback /revoke (this
 *      step requires SSH to Bahnhof + the admin token).
 *   5. POST /submit_signed_transaction with the revoked token →
 *      401 from Caddy (forward_auth rejects).
 *   6. Rate-limit guard: POST /enroll 7 times in quick succession →
 *      the first 5 succeed (200), the rest are throttled (429).
 *
 * Required env:
 *   FC_RPC_URL          public hub URL  (default: https://rpc.futurechain.eu)
 *
 * Optional (for steps 4 + 5):
 *   ENROLL_ADMIN_BEARER  matches /etc/bahnhof-enroll/admin.env on
 *                        Bahnhof — without it, steps 4 + 5 are
 *                        skipped (the rest of the smoke still runs).
 *   BAHNHOF_SSH          if set, executes the revoke via SSH instead
 *                        of expecting the admin endpoint to be
 *                        public (it's loopback-only by design).
 *                        Format: `user@host -i /path/to/key`
 */
const PUBLIC = process.env.FC_RPC_URL ?? 'https://rpc.futurechain.eu';
const ADMIN_BEARER = process.env.ENROLL_ADMIN_BEARER;
const BAHNHOF_SSH = process.env.BAHNHOF_SSH;

function uuid(): string {
  return crypto.randomUUID();
}

function step(n: number | string, label: string): void {
  console.log(`\n[${n}] ${label}`);
}

async function enroll(installId: string): Promise<{ install_token: string; install_id: string }> {
  const res = await fetch(`${PUBLIC}/enroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      install_id: installId,
      app_version: '0.0.0-smoke',
      platform: 'test',
    }),
  });
  if (!res.ok) throw new Error(`/enroll returned ${res.status}: ${await res.text()}`);
  return res.json() as Promise<{ install_token: string; install_id: string }>;
}

async function submit(token: string): Promise<number> {
  const res = await fetch(`${PUBLIC}/submit_signed_transaction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': token },
    body: '{}',
  });
  // We drain to release the connection but ignore the body — we only
  // care about the status code.
  await res.text().catch(() => '');
  return res.status;
}

async function main(): Promise<void> {
  console.log(`enrollment-e2e-smoke against ${PUBLIC}`);
  let failures = 0;

  step(1, 'enroll a fresh install_id');
  const id = uuid();
  console.log(`    install_id: ${id}`);
  const first = await enroll(id);
  console.log(`    token: ${first.install_token.slice(0, 12)}…`);
  if (first.install_token.length !== 64) {
    console.error('    ✗ token wrong length');
    failures++;
  } else {
    console.log('    ✓ token shape OK');
  }

  step(2, 'submit with the new token → 400 (FC body validation = auth OK)');
  const s2 = await submit(first.install_token);
  console.log(`    status: ${s2}`);
  if (s2 !== 400) {
    console.error(`    ✗ expected 400, got ${s2}`);
    failures++;
  } else {
    console.log('    ✓');
  }

  step(3, 'enroll same install_id again → idempotent, same token');
  const second = await enroll(id);
  if (second.install_token !== first.install_token) {
    console.error('    ✗ idempotency broken — got a different token');
    failures++;
  } else {
    console.log('    ✓ same token returned');
  }

  if (ADMIN_BEARER && BAHNHOF_SSH) {
    step(4, 'admin revoke via SSH');
    const { execSync } = await import('node:child_process');
    const cmd = `ssh ${BAHNHOF_SSH} "curl -s -X POST http://127.0.0.1:8546/revoke -H 'Content-Type: application/json' -H 'Authorization: Bearer ${ADMIN_BEARER}' -d '{\\"install_id\\":\\"${id}\\"}'"`;
    const out = execSync(cmd, { encoding: 'utf8' });
    console.log(`    revoke response: ${out.trim()}`);

    step(5, 'submit with revoked token → 401');
    const s5 = await submit(first.install_token);
    console.log(`    status: ${s5}`);
    if (s5 !== 401) {
      console.error(`    ✗ expected 401, got ${s5}`);
      failures++;
    } else {
      console.log('    ✓');
    }
  } else {
    step('4-5', 'admin revoke + post-revoke submit — SKIPPED (ENROLL_ADMIN_BEARER + BAHNHOF_SSH not set)');
  }

  step(6, 'rate-limit guard: 7 enrolls in quick succession');
  const codes: number[] = [];
  for (let i = 0; i < 7; i++) {
    const res = await fetch(`${PUBLIC}/enroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        install_id: uuid(),
        app_version: '0.0.0-smoke',
        platform: 'test',
      }),
    });
    codes.push(res.status);
    await res.text().catch(() => '');
  }
  console.log(`    status codes: ${codes.join(' ')}`);
  if (!codes.includes(429)) {
    console.error('    ✗ expected at least one 429 (rate-limit). Window may have been empty before this run.');
    failures++;
  } else {
    console.log('    ✓ rate-limit fires');
  }

  console.log(`\n${failures === 0 ? '✓ ALL PASS' : `✗ ${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('smoke errored:', e);
  process.exit(2);
});
