/**
 * two-instance.integration.test.ts — the A2A verification ladder
 * (docs/ANTON_LOCAL_UPDATE_PLAN_2026-06.md Wave 3.5).
 *
 * Two in-process ANTON "instances" (alpha + bravo), each with its OWN
 * isolated PostgreSQL database and its own Express app mounting the real
 * community / p2p / agents / mission-delegation route factories on an
 * ephemeral 127.0.0.1 port. Every cross-instance hop in this file travels
 * over real HTTP between the two apps — exactly the path two desktop
 * installs on a LAN use (docs/A2A_DEMO.md is the human version).
 *
 * The ladder (climbed strictly in order — later rungs depend on earlier):
 *   Rung 1  Pairing      — identities + contact cards both ways + the
 *                          production connection tester passes
 *   Rung 2  E2E mail     — encrypted send → decrypt match; replay REJECTED;
 *                          tampered ciphertext REJECTED
 *   Rung 3  Agent query  — bravo's specialized agent answered alpha
 *                          cross-instance with attribution (LLM mocked at
 *                          the callChat seam — this proves transport + auth
 *                          + routing, not model quality)
 *   Rung 4  Delegation   — signed brief → accept notice → signed result →
 *                          approval, with state transitions on BOTH sides
 *                          and a forged result rejected
 *   Rung 5  Beehive      — Queen on alpha, participant bravo: invite, join,
 *                          round 1, contribution — all over the wire
 *   Rung 6  Mesh leg     — rung-2 mail routed over the REAL relay + dialer
 *                          framing path into bravo's real /api/p2p/receive
 *                          (full mesh transport coverage lives in
 *                          tests/services/peer-transport-mesh.test.ts)
 *
 * Found-by-this-ladder production fixes (migration 220): the delegation-log
 * event CHECK, the queue delivery_method CHECK, and the beehive_message_log
 * FK — each made its leg impossible against real PostgreSQL.
 *
 * No LLM calls, no network beyond loopback, never touches the dev DB.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { generateKeyPairSync, sign as edSign, createHash } from 'node:crypto';
import { Writable } from 'node:stream';
import {
  provisionA2ADatabases,
  dropA2ADatabases,
  startInstance,
  pairInstances,
  buildWireBody,
  type A2AProvision,
  type A2AInstance,
} from './two-instance-harness.js';

// ── LLM seam mock ────────────────────────────────────────────────────────────
// agent-processor (and beehive-deliberation) call callChat() from
// provider-router. The mock echoes any A2A-MARKER-* token found in the
// system prompt, proving the queried agent's OWN system prompt reached the
// model seam on the REMOTE instance. Everything else in provider-router
// stays real.
vi.mock('../../server/services/provider-router.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/services/provider-router.js')>();
  return {
    ...actual,
    callChat: vi.fn(async (config: { system: string; messages: Array<{ role: string; content: string }> }) => {
      const marker = config.system.match(/A2A-MARKER-[A-Z0-9]+/)?.[0] ?? 'NO-MARKER-FOUND';
      const lastUser = [...config.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
      return {
        text: `[mocked-llm] ${marker} :: answering: ${lastUser.slice(0, 120)}`,
        thinking: '',
        inputTokens: 11,
        outputTokens: 13,
      };
    }),
  };
});

// Provision at module load so describe.skipIf can gate collection (same
// pattern as tests/services/markets-loop.integration.test.ts).
const provision: A2AProvision = await provisionA2ADatabases(['alpha', 'bravo'], 'ladder');
if (!provision.ok) {
  console.warn(`[a2a two-instance] suite skipped: ${provision.reason}`);
}

// ── Shared helpers ───────────────────────────────────────────────────────────

/** Deep-sorted canonical JSON — must match mission-delegation.ts canonical(). */
function canonical(value: unknown): string {
  return JSON.stringify(deepSort(value));
}
function deepSort(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(deepSort);
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[k] = deepSort((value as Record<string, unknown>)[k]);
  }
  return sorted;
}

describe.skipIf(!provision.ok)('A2A two-instance verification ladder', () => {
  let alpha: A2AInstance;
  let bravo: A2AInstance;
  let connAlphaToBravo = '';
  let connBravoToAlpha = '';

  beforeAll(async () => {
    if (!provision.ok || !provision.urls) throw new Error('provisioning failed');
    alpha = await startInstance('alpha', provision.urls.alpha);
    bravo = await startInstance('bravo', provision.urls.bravo);
  }, 60_000);

  afterAll(async () => {
    await alpha?.close().catch(() => {});
    await bravo?.close().catch(() => {});
    await dropA2ADatabases(provision).catch(() => {});
  }, 30_000);

  // ════ Rung 1 — Pairing ════════════════════════════════════════════════════

  it('rung 1.1 — both instances activate identities with Ed25519 + X25519 keys', () => {
    for (const inst of [alpha, bravo]) {
      expect(inst.identity.contactHash).toMatch(/^ANTON-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
      // Server-side generated, hex-DER encoded. The placeholder we POSTed
      // must have been replaced by the real signing key.
      expect(inst.identity.publicKey).toMatch(/^[0-9a-f]{20,}$/);
      expect(inst.identity.publicKey).not.toBe('pending-server-generated');
      expect(inst.identity.x25519PublicKey).toMatch(/^[0-9a-f]{20,}$/);
    }
    expect(alpha.identity.contactHash).not.toBe(bravo.identity.contactHash);
  });

  it('rung 1.2 — contact cards exchanged both ways (pubkeys + endpoints)', async () => {
    const ids = await pairInstances(alpha, bravo);
    connAlphaToBravo = ids.aToB;
    connBravoToAlpha = ids.bToA;

    const onAlpha = await alpha.api('GET', '/api/community/connections');
    expect(onAlpha.status).toBe(200);
    const card = (onAlpha.body as Array<Record<string, unknown>>).find(
      (c) => c.contact_hash === bravo.identity.contactHash,
    );
    expect(card).toBeTruthy();
    expect(card!.status).toBe('active');
    expect(card!.public_key).toBe(bravo.identity.publicKey);
    expect(card!.x25519_public_key).toBe(bravo.identity.x25519PublicKey);
    expect(card!.endpoint).toBe(bravo.baseUrl);
  });

  it('rung 1.3 — the production connection tester passes in both directions', async () => {
    // POST /community/connections/:id/test runs the real 4-check ladder:
    // endpoint configured → live ping → mutual-trust delivery → E2E keys.
    const aTest = await alpha.api('POST', `/api/community/connections/${connAlphaToBravo}/test`);
    expect(aTest.status).toBe(200);
    expect(aTest.body.ok, JSON.stringify(aTest.body.results)).toBe(true);

    const bTest = await bravo.api('POST', `/api/community/connections/${connBravoToAlpha}/test`);
    expect(bTest.status).toBe(200);
    expect(bTest.body.ok, JSON.stringify(bTest.body.results)).toBe(true);
  });

  // ════ Rung 2 — E2E mail ═══════════════════════════════════════════════════

  const MAIL_SUBJECT = 'Quarterly remediation plan (ladder rung 2)';
  const MAIL_BODY = `Confidential body ${Date.now()} — if you can read this, X25519+HKDF+AES-GCM round-tripped.`;
  let rung2MailId = '';
  let rung2WireBody = '';

  it('rung 2.1 — alpha sends encrypted mail; bravo receives and decrypts the exact plaintext', async () => {
    const send = await alpha.api('POST', '/api/community/mail', {
      toHashes: [bravo.identity.contactHash],
      subject: MAIL_SUBJECT,
      body: MAIL_BODY,
    });
    expect(send.status).toBe(200);
    rung2MailId = String(send.body.id);

    // The queue row must carry ciphertext — the no-plaintext-fallback rule.
    const qRow = await alpha.db.get<{ payload_encrypted: string | null; status: string }>(
      'SELECT payload_encrypted, status FROM community_message_queue WHERE mail_id = ?',
      rung2MailId,
    );
    expect(qRow?.payload_encrypted).toBeTruthy();

    // Capture the exact wire body BEFORE delivery for the replay rung.
    rung2WireBody = await buildWireBody(alpha.db, rung2MailId);
    const wire = JSON.parse(rung2WireBody) as Record<string, unknown>;
    expect(wire.subject).toBe('[encrypted]');   // plaintext never on the wire
    expect(wire.body).toBe('[encrypted]');
    expect(String(wire.encryptedPayload)).not.toContain(MAIL_BODY.slice(0, 24));

    // Deliver over real HTTP via the production queue worker.
    const pump = await alpha.pumpQueue();
    expect(pump.sent).toBe(1);
    expect(pump.failed).toBe(0);

    // Sender-side bookkeeping (this UPDATE is what the pre-migration-220
    // delivery_method CHECK crashed on).
    const sentRow = await alpha.db.get<{ status: string; delivery_method: string; last_http_status: number }>(
      'SELECT status, delivery_method, last_http_status FROM community_message_queue WHERE mail_id = ?',
      rung2MailId,
    );
    expect(sentRow?.status).toBe('sent');
    expect(sentRow?.delivery_method).toBe('https');
    expect(sentRow?.last_http_status).toBe(200);

    // Recipient-side: read through bravo's API like the UI does.
    const inbox = await bravo.api('GET', '/api/community/mail?folder=inbox&limit=50');
    expect(inbox.status).toBe(200);
    const received = (inbox.body as Array<Record<string, unknown>>).filter(
      (m) => m.subject === MAIL_SUBJECT,
    );
    expect(received).toHaveLength(1);
    expect(received[0].body).toBe(MAIL_BODY);
    expect(received[0].from_hash).toBe(alpha.identity.contactHash);
  });

  it('rung 2.2 — replaying the identical envelope is rejected (duplicate nonce)', async () => {
    const replay = await fetch(`${bravo.baseUrl}/api/p2p/receive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: rung2WireBody,
    });
    expect(replay.status).toBe(409);
    const body = await replay.json() as { error: string };
    expect(body.error).toMatch(/replay/i);

    // Nothing duplicated on bravo.
    const count = await bravo.db.get<{ n: string | number }>(
      'SELECT COUNT(*) AS n FROM community_mail WHERE subject = ?', MAIL_SUBJECT,
    );
    expect(Number(count?.n)).toBe(1);
  });

  it('rung 2.3 — tampered ciphertext fails authentication and is rejected', async () => {
    const wire = JSON.parse(rung2WireBody) as { encryptedPayload: string; mailId: string };
    const env = JSON.parse(wire.encryptedPayload) as { ciphertext: string };
    // Flip the leading ciphertext bytes — GCM auth tag must catch it.
    env.ciphertext = (env.ciphertext.startsWith('AAAA') ? 'BBBB' : 'AAAA') + env.ciphertext.slice(4);
    const tampered = { ...wire, mailId: `${wire.mailId}_tampered`, encryptedPayload: JSON.stringify(env) };

    const res = await fetch(`${bravo.baseUrl}/api/p2p/receive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tampered),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/decryption failed/i);

    const count = await bravo.db.get<{ n: string | number }>(
      'SELECT COUNT(*) AS n FROM community_mail WHERE subject = ?', MAIL_SUBJECT,
    );
    expect(Number(count?.n)).toBe(1);
  });

  // ════ Rung 3 — Cross-instance agent query ═════════════════════════════════

  const AGENT_MARKER = 'A2A-MARKER-BRAVO77';
  const AGENT_SLUG = 'quantum-bagel-concierge';

  it('rung 3.1 — bravo publishes a specialized agent; alpha discovers it via the contact endpoint', async () => {
    const created = await bravo.api('POST', '/api/agents', {
      name: 'Quantum Bagel Concierge',
      roleDescription: 'Answers everything about quantum bagels',
      systemPrompt: `You are the bravo instance's bagel expert. Distinctive token: ${AGENT_MARKER}. Always be precise.`,
      slug: AGENT_SLUG,
      routingKeywords: ['quantum', 'bagel', 'sourdough'],
    });
    expect(created.status).toBe(201);
    const agentId = String(created.body.id);
    const activated = await bravo.api('POST', `/api/agents/${agentId}/activate`);
    expect(activated.status).toBe(200);

    // alpha discovers across ALL its contacts' public directories.
    const discover = await alpha.api('GET', '/api/agents/remote/discover');
    expect(discover.status).toBe(200);
    const found = (discover.body.agents as Array<Record<string, unknown>>).find((a) => a.slug === AGENT_SLUG);
    expect(found).toBeTruthy();
    expect(found!.peerHash).toBe(bravo.identity.contactHash);
    expect(found!.endpoint).toBe(bravo.baseUrl);
  });

  it('rung 3.2 — alpha queries the remote agent; the answer round-trips with correct attribution', async () => {
    // PRODUCTION FIX REQUIRED BY THIS RUNG (server/routes/agents.ts): the
    // generic POST /agents/:id/query was declared BEFORE the specific
    // /agents/remote/query and /agents/public/query routes, so ':id'
    // swallowed 'remote'/'public' and both cross-instance query endpoints —
    // including the one remote-agent-client actually calls on the peer —
    // were unreachable (always 400 "message required"). The generic route
    // now registers after the specific ones.
    const query = await alpha.api('POST', '/api/agents/remote/query', {
      query: 'What is the shelf life of a quantum bagel?',
      endpoint: bravo.baseUrl,
      agentSlug: AGENT_SLUG,
    });
    expect(query.status).toBe(200);
    const result = query.body.result as { response: string; agentName: string; conversationId: string } | null;
    expect(result).toBeTruthy();
    // The marker only exists in BRAVO's agent system prompt — its presence
    // proves the remote agent's persona reached the LLM seam over there.
    expect(result!.response).toContain(AGENT_MARKER);
    expect(result!.response).toContain('shelf life of a quantum bagel');
    expect(result!.agentName).toBe('Quantum Bagel Concierge');

    // Attribution persisted on the REMOTE side: a p2p conversation bound to
    // alpha's contact hash, with both turns recorded.
    const conv = await bravo.db.get<{ id: string; source: string; requester_hash: string; message_count: number }>(
      "SELECT id, source, requester_hash, message_count FROM agent_conversations WHERE source = 'p2p' ORDER BY created_at DESC LIMIT 1",
    );
    expect(conv?.requester_hash).toBe(alpha.identity.contactHash);
    expect(conv?.id).toBe(result!.conversationId);
    const msgs = await bravo.db.all<{ role: string; content: string }>(
      'SELECT role, content FROM agent_messages WHERE conversation_id = ? ORDER BY created_at ASC', conv!.id,
    );
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant']);
  });

  it('rung 3.3 — smart routing finds the right remote agent from keywords alone', async () => {
    const query = await alpha.api('POST', '/api/agents/remote/query', {
      query: 'I urgently need a sourdough quantum bagel consultation',
    });
    expect(query.status).toBe(200);
    const result = query.body.result as { response: string; agentName: string; peerName: string } | null;
    expect(result).toBeTruthy();
    expect(result!.agentName).toBe('Quantum Bagel Concierge');
    expect(result!.peerName).toBe(bravo.identity.displayName);
    expect(result!.response).toContain(AGENT_MARKER);
  });

  it('rung 3.4 — the p2p agent_query wire path (routes/p2p.ts) answers a contact directly', async () => {
    // The structured-message path task delegation uses: an accepted contact
    // POSTs messageType 'agent_query' to /api/p2p/receive and gets the
    // agent's answer inline.
    const res = await fetch(`${bravo.baseUrl}/api/p2p/receive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mailId: `aq_${Date.now()}`,
        fromHash: alpha.identity.contactHash,
        toHashes: JSON.stringify([bravo.identity.contactHash]),
        subject: '[Agent query]',
        body: 'agent query',
        messageType: 'agent_query',
        payload: { agentSlug: AGENT_SLUG, message: 'Wholesale price for 12 quantum bagels?' },
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; type: string; response: string };
    expect(body.ok).toBe(true);
    expect(body.type).toBe('agent_query');
    expect(body.response).toContain(AGENT_MARKER);
    expect(body.response).toContain('Wholesale price for 12 quantum bagels?');
  });

  // ════ Rung 4 — Mission delegation round-trip ══════════════════════════════

  const MISSION_ID = 'mis_a2a_ladder_1';
  const TASK_ID = 'tsk_a2a_ladder_1';
  let delegationId = '';

  it('rung 4.1 — alpha delegates a signed brief; bravo receives it with a VERIFIED signature', async () => {
    // Seed the originating mission + task on alpha (fixture seeds the
    // 'default' user both sides).
    await alpha.db.run(
      `INSERT INTO missions.missions (id, title, objective, success_criteria, status, autonomy_level, created_by)
       VALUES (?, ?, ?, ?, 'active', 'check_in', 'default')`,
      MISSION_ID, 'A2A ladder mission', 'Prove two ANTONs can collaborate', 'Delegation round-trip completes',
    );
    await alpha.db.run(
      `INSERT INTO missions.mission_tasks (id, mission_id, title, task_type, status)
       VALUES (?, ?, 'Delegated market analysis', 'llm', 'queued')`,
      TASK_ID, MISSION_ID,
    );

    const created = await alpha.api('POST', `/api/missions/${MISSION_ID}/tasks/${TASK_ID}/delegate`, {
      peer_contact_hash: bravo.identity.contactHash,
      brief: {
        title: 'Market analysis for the ladder',
        objective: 'Summarise the three biggest risks in the test market.',
        expectedOutput: 'A short signed summary',
      },
    });
    expect(created.status).toBe(201);
    delegationId = String((created.body.delegation as { id: string }).id);
    expect((created.body.delegation as { status: string }).status).toBe('draft');

    const sent = await alpha.api('POST', `/api/missions/delegations/${delegationId}/send`);
    expect(sent.status).toBe(200);
    expect((sent.body.delegation as { status: string }).status).toBe('sent');

    const pump = await alpha.pumpQueue();
    expect(pump.sent).toBe(1);

    // bravo's inbound inbox — exactly what MissionInboxPage renders.
    const inbound = await bravo.api('GET', '/api/missions/delegations/inbound');
    expect(inbound.status).toBe(200);
    const row = (inbound.body.delegations as Array<Record<string, unknown>>).find((d) => d.id === delegationId);
    expect(row).toBeTruthy();
    expect(row!.status).toBe('received');
    expect(row!.signature_verified).toBe(true);
    expect(row!.peer_contact_hash).toBe(alpha.identity.contactHash);
    expect(row!.brief_title).toBe('Market analysis for the ladder');
  });

  it('rung 4.2 — bravo accepts: sub-mission created on bravo, alpha notified sent → in_progress', async () => {
    const accept = await bravo.api('POST', `/api/missions/delegations/${delegationId}/accept`, {});
    expect(accept.status).toBe(200);
    expect((accept.body.delegation as { status: string }).status).toBe('accepted');

    const subMission = await bravo.db.get<{ id: string; title: string; origin_delegation_id: string }>(
      'SELECT id, title, origin_delegation_id FROM missions.missions WHERE origin_delegation_id = ?',
      delegationId,
    );
    expect(subMission).toBeTruthy();
    expect(subMission!.title).toContain('[delegated]');

    // The signed accept-notice travels back over the wire.
    const pump = await bravo.pumpQueue();
    expect(pump.sent).toBeGreaterThanOrEqual(1);

    const onAlpha = await alpha.api('GET', `/api/missions/delegations/${delegationId}`);
    expect(onAlpha.status).toBe(200);
    expect((onAlpha.body.delegation as { status: string }).status).toBe('in_progress');
  });

  it('rung 4.3 — bravo submits a signed result; alpha verifies, approves, and ingests it', async () => {
    const RESULT_SUMMARY = 'Three risks identified: liquidity, latency, llama stampedes.';
    const submitted = await bravo.api('POST', `/api/missions/delegations/${delegationId}/submit-result`, {
      payload: { summary: RESULT_SUMMARY, confidence: 0.9 },
    });
    expect(submitted.status).toBe(200);
    expect((submitted.body.delegation as { status: string }).status).toBe('completed');

    const pump = await bravo.pumpQueue();
    expect(pump.sent).toBeGreaterThanOrEqual(1);

    // alpha verified the Ed25519 signature against bravo's stored card.
    const onAlpha = await alpha.api('GET', `/api/missions/delegations/${delegationId}`);
    const del = onAlpha.body.delegation as { status: string; result_signature_verified: boolean };
    expect(del.status).toBe('completed');
    expect(del.result_signature_verified).toBe(true);

    const approved = await alpha.api('POST', `/api/missions/delegations/${delegationId}/approve`);
    expect(approved.status).toBe(200);
    expect((approved.body.delegation as { status: string }).status).toBe('approved');

    // Phase B3 ingestion — the delegated task is completed with the result.
    // NOTE (found by this ladder): on the wire the recipient's result is the
    // signed wrapper { delegationId, payload: {...}, files }, so
    // ingestDelegationResult's `result.summary` lookup misses the nested
    // `payload.summary` and falls back to the generic line — the full result
    // still lands verbatim in output_full. Candidate one-liner for Wave 3:
    // read `result.payload?.summary` too.
    const task = await alpha.db.get<{ status: string; output_summary: string; output_full: string }>(
      'SELECT status, output_summary, output_full FROM missions.mission_tasks WHERE id = ?', TASK_ID,
    );
    expect(task?.status).toBe('completed');
    expect(task?.output_summary).toBeTruthy();
    expect(task?.output_full).toContain(RESULT_SUMMARY);

    // Audit trails on BOTH sides (mission_delegation_log insert is what the
    // pre-migration-220 event CHECK crashed on).
    const alphaEvents = (await alpha.db.all<{ event: string }>(
      'SELECT event FROM missions.mission_delegation_log WHERE delegation_id = ? ORDER BY created_at', delegationId,
    )).map((r) => r.event);
    expect(alphaEvents).toEqual(expect.arrayContaining(['created', 'sent', 'peer_accepted', 'completed', 'approved']));
    const bravoEvents = (await bravo.db.all<{ event: string }>(
      'SELECT event FROM missions.mission_delegation_log WHERE delegation_id = ? ORDER BY created_at', delegationId,
    )).map((r) => r.event);
    expect(bravoEvents).toEqual(expect.arrayContaining(['received', 'accepted', 'accept_notified', 'completed']));
  });

  it('rung 4.4 — a forged result (wrong signing key) is rejected and cannot be approved', async () => {
    // Second delegation alpha → bravo.
    const created = await alpha.api('POST', `/api/missions/${MISSION_ID}/delegate-graph`, {
      peer_contact_hash: bravo.identity.contactHash,
      brief: {
        title: 'Forgery target',
        objective: 'This delegation will receive a forged result.',
        tasks: [{ title: 'single task' }],
      },
    });
    expect(created.status).toBe(201);
    const d2 = String((created.body.delegation as { id: string }).id);
    await alpha.api('POST', `/api/missions/delegations/${d2}/send`);
    await alpha.pumpQueue();

    // Attacker key — NOT the key on bravo's contact card.
    const attacker = generateKeyPairSync('ed25519');
    const attackerPubHex = attacker.publicKey.export({ type: 'spki', format: 'der' }).toString('hex');
    const payloadJson = canonical({ delegationId: d2, payload: { summary: 'FORGED' }, files: [] });
    const forgedSig = edSign(null, Buffer.from(payloadJson, 'utf8'), attacker.privateKey).toString('hex');

    // Delivered through alpha's REAL p2p receive path, claiming to be bravo.
    const res = await fetch(`${alpha.baseUrl}/api/p2p/receive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mailId: `forged_${Date.now()}`,
        fromHash: bravo.identity.contactHash,
        toHashes: JSON.stringify([alpha.identity.contactHash]),
        subject: '[Delegation Result] Forgery target',
        body: 'see payload',
        messageType: 'mission_delegation_result',
        payload: {
          payload_json: payloadJson,
          signature_b64: forgedSig,
          signer_public_key: attackerPubHex,
          signer_contact_hash: bravo.identity.contactHash,
          files: [],
        },
      }),
    });
    expect(res.status).toBe(200); // transport accepts; trust layer rejects
    const body = await res.json() as { type?: string; status?: string };
    expect(body.type).toBe('mission_delegation_result');
    expect(body.status).toBe('failed');

    const onAlpha = await alpha.api('GET', `/api/missions/delegations/${d2}`);
    const del = onAlpha.body.delegation as { status: string; result_signature_verified: boolean | null };
    expect(del.status).toBe('failed');
    expect(del.result_signature_verified).toBe(false);

    const approve = await alpha.api('POST', `/api/missions/delegations/${d2}/approve`);
    expect(approve.status).toBe(400);
  });

  // ════ Rung 5 — Beehive deliberation (Queen on alpha, participant bravo) ═══

  let hiveId = '';

  it('rung 5.1 — Queen on alpha forms a hive and invites bravo over the wire', async () => {
    const { createBeehiveManager } = await import('../../server/services/beehive/beehive-manager.js');
    const { createBeehiveProtocol } = await import('../../server/services/beehive/beehive-protocol.js');

    const managerA = createBeehiveManager(alpha.db);
    const protocolA = await createBeehiveProtocol(alpha.db);

    const hive = await managerA.createHive(
      { name: 'Ladder hive', question: 'Can two ANTON instances deliberate together?', type: 'deliberation' },
      alpha.identity.contactHash,
      alpha.identity.displayName,
    );
    hiveId = hive.id;

    await managerA.inviteParticipant(hiveId, alpha.identity.contactHash, {
      anton_contact_hash: bravo.identity.contactHash,
      display_name: bravo.identity.displayName,
      role: 'worker',
    });

    // Wire delivery: 1:1 invite + a Queen state snapshot so bravo learns the
    // full roster (the broadcast path only reaches JOINED participants).
    const hiveState = await managerA.getHiveState(hiveId);
    expect(hiveState).toBeTruthy();
    await protocolA.sendToTarget(hiveId, 'hive:invite', {
      hive: hiveState!.hive,
      invitee_hash: bravo.identity.contactHash,
      invitee_display_name: bravo.identity.displayName,
      role: 'worker',
    }, bravo.identity.contactHash);
    await protocolA.sendStateSync(hiveId, bravo.identity.contactHash);

    const pump = await alpha.pumpQueue();
    expect(pump.sent).toBe(2);
    expect(pump.failed).toBe(0);

    // bravo now knows the hive, itself (invited) and the Queen (joined).
    const hiveOnBravo = await bravo.db.get<{ id: string; created_by: string; status: string }>(
      'SELECT id, created_by, status FROM beehive_sessions WHERE id = ?', hiveId,
    );
    expect(hiveOnBravo?.created_by).toBe(alpha.identity.contactHash);
    const partsOnBravo = await bravo.db.all<{ anton_contact_hash: string; invitation_status: string; role: string }>(
      'SELECT anton_contact_hash, invitation_status, role FROM beehive_participants WHERE hive_id = ?', hiveId,
    );
    const queenRow = partsOnBravo.find((p) => p.anton_contact_hash === alpha.identity.contactHash);
    const selfRow = partsOnBravo.find((p) => p.anton_contact_hash === bravo.identity.contactHash);
    expect(queenRow?.invitation_status).toBe('joined');
    expect(queenRow?.role).toBe('queen');
    expect(selfRow?.invitation_status).toBe('invited');
  });

  it('rung 5.2 — bravo joins; the Queen sees bravo as a joined participant', async () => {
    const { createBeehiveManager } = await import('../../server/services/beehive/beehive-manager.js');
    const { createBeehiveProtocol } = await import('../../server/services/beehive/beehive-protocol.js');

    const managerB = createBeehiveManager(bravo.db);
    const protocolB = await createBeehiveProtocol(bravo.db);

    await managerB.joinHive(hiveId, {
      anton_contact_hash: bravo.identity.contactHash,
      display_name: bravo.identity.displayName,
    });
    await protocolB.broadcast(hiveId, 'hive:join', { display_name: bravo.identity.displayName });
    const pump = await bravo.pumpQueue();
    expect(pump.sent).toBeGreaterThanOrEqual(1);

    const onAlpha = await alpha.db.get<{ invitation_status: string; status: string }>(
      'SELECT invitation_status, status FROM beehive_participants WHERE hive_id = ? AND anton_contact_hash = ?',
      hiveId, bravo.identity.contactHash,
    );
    expect(onAlpha?.invitation_status).toBe('joined');
    expect(onAlpha?.status).toBe('active');
  });

  it('rung 5.3 — round 1 opens on both sides and bravo\'s contribution reaches the Queen', async () => {
    const { createBeehiveProtocol } = await import('../../server/services/beehive/beehive-protocol.js');
    const { createBeehiveDeliberation } = await import('../../server/services/beehive/beehive-deliberation.js');

    const protocolA = await createBeehiveProtocol(alpha.db);
    const delibA = await createBeehiveDeliberation(alpha.db);
    const protocolB = await createBeehiveProtocol(bravo.db);
    const delibB = await createBeehiveDeliberation(bravo.db);

    // Queen opens round 1 and broadcasts it (no LLM — round 1 has no
    // previous round to summarise).
    const round = await delibA.startNextRound(hiveId, alpha.identity.contactHash);
    expect(round.round_number).toBe(1);
    await protocolA.broadcast(hiveId, 'hive:round_advance', {
      round_number: round.round_number,
      phase: round.phase,
      started_at: round.started_at,
    });
    const pumpA = await alpha.pumpQueue();
    expect(pumpA.sent).toBeGreaterThanOrEqual(1);

    const roundOnBravo = await bravo.db.get<{ round_number: number; phase: string }>(
      'SELECT round_number, phase FROM beehive_rounds WHERE hive_id = ? AND round_number = 1', hiveId,
    );
    expect(roundOnBravo).toBeTruthy();

    // bravo contributes (signed locally) and sends it to the Queen.
    const CONTENT = 'BRAVO-POSITION: deliberation across instances verified by direct observation.';
    const contribution = await delibB.submitContribution(hiveId, {
      contributorHash: bravo.identity.contactHash,
      type: 'position',
      content: CONTENT,
      confidence: 0.8,
    });
    await protocolB.broadcast(hiveId, 'hive:contribution', contribution);
    const pumpB = await bravo.pumpQueue();
    expect(pumpB.sent).toBeGreaterThanOrEqual(1);

    const onAlpha = await alpha.db.get<{ contributor_hash: string; content: string; round: number; signature: string }>(
      'SELECT contributor_hash, content, round, signature FROM beehive_contributions WHERE hive_id = ? AND contributor_hash = ?',
      hiveId, bravo.identity.contactHash,
    );
    expect(onAlpha?.content).toBe(CONTENT);
    expect(onAlpha?.round).toBe(1);
    expect(onAlpha?.signature).toMatch(/^[0-9a-f]+$/); // really signed, not 'unsigned:…'

    const counter = await alpha.db.get<{ contribution_count: number }>(
      'SELECT contribution_count FROM beehive_participants WHERE hive_id = ? AND anton_contact_hash = ?',
      hiveId, bravo.identity.contactHash,
    );
    expect(Number(counter?.contribution_count)).toBe(1);
  });

  // ════ Rung 6 — the same mail leg over the ANTON Mesh ═════════════════════

  it('rung 6 — encrypted mail rides the real relay + dialer mesh path into bravo\'s /api/p2p/receive', async () => {
    // Full mesh-transport behaviour (5xx propagation, hang → 504, ghost
    // peers) is covered by tests/services/peer-transport-mesh.test.ts; this
    // rung proves the LADDER payload — a real E2E-encrypted community mail —
    // survives the mesh framing into the receiving instance's real app.
    const { RelayServer } = await import('../../relay/src/server.js');
    const { createAuditLogger } = await import('../../relay/src/audit.js');
    const { MeshDialer } = await import('../../server/services/mesh/dialer.js');
    const { buildBridgeHooks } = await import('../../server/services/mesh/bridge.js');
    const { sendMeshRpcRequest } = await import('../../server/services/peer-transport-service.js');
    const { ed25519, edwardsToMontgomeryPriv, edwardsToMontgomeryPub } = await import('@noble/curves/ed25519');

    const sink = new Writable({ write(_c, _e, cb) { cb(); } });

    // Relay on an ephemeral port (two-step bind, mirroring the mesh test).
    let tempPort: number;
    {
      const t = new RelayServer({ ownUrl: 'ws://127.0.0.1:1', port: 0, host: '127.0.0.1', insecure: true, audit: createAuditLogger(sink) });
      await t.start();
      tempPort = t.actualPort();
      await t.stop();
    }
    const relayUrl = `ws://127.0.0.1:${tempPort}`;
    const relay = new RelayServer({
      ownUrl: relayUrl, port: tempPort, host: '127.0.0.1', insecure: true,
      helloGraceSec: 30, reaperIntervalMs: 100,
      helloRateLimit: { capacity: 1000, refillPerSec: 1000 },
      envelopeRateLimit: { capacity: 1000, refillPerSec: 1000 },
      audit: createAuditLogger(sink),
    });
    await relay.start();

    const BINDING_DOMAIN = new TextEncoder().encode('ANTON-MESH-IDENTITY/v1\n');
    function makeMeshIdentity() {
      const ed_priv = ed25519.utils.randomPrivateKey();
      const ed_pk = ed25519.getPublicKey(ed_priv);
      const x_pk = edwardsToMontgomeryPub(ed_pk);
      const x_priv = edwardsToMontgomeryPriv(ed_priv);
      const instanceId = createHash('sha256').update(x_pk).digest().subarray(0, 16);
      const msg = new Uint8Array(BINDING_DOMAIN.length + 64);
      msg.set(BINDING_DOMAIN, 0); msg.set(ed_pk, BINDING_DOMAIN.length); msg.set(x_pk, BINDING_DOMAIN.length + 32);
      return { ed_priv, ed_pk, x_priv, x_pk, instanceId, bindingSig: ed25519.sign(msg, ed_priv) };
    }
    const toHex = (b: Uint8Array) => Buffer.from(b).toString('hex');
    const waitFor = async (cond: () => boolean, ms: number) => {
      const start = Date.now();
      while (!cond()) {
        if (Date.now() - start > ms) throw new Error('waitFor timed out');
        await new Promise((r) => setTimeout(r, 10));
      }
    };

    // Responder = bravo's REAL express app behind the production bridge.
    const responder = makeMeshIdentity();
    const hooks = buildBridgeHooks({ expressHandler: bravo.expressHandler, requestTimeoutMs: 5_000 });
    const responderDialer = new MeshDialer({
      relayUrls: [relayUrl],
      ed25519: { publicKey: responder.ed_pk, privateKey: responder.ed_priv },
      x25519: { publicKey: responder.x_pk, privateKey: responder.x_priv },
      instanceId: responder.instanceId,
      bindingSig: responder.bindingSig,
      onSessionOpen: hooks.onSessionOpen,
      onSessionData: hooks.onSessionData,
      onSessionClose: hooks.onSessionClose,
    });
    const initiator = makeMeshIdentity();
    const initiatorDialer = new MeshDialer({
      relayUrls: [relayUrl],
      ed25519: { publicKey: initiator.ed_pk, privateKey: initiator.ed_priv },
      x25519: { publicKey: initiator.x_pk, privateKey: initiator.x_priv },
      instanceId: initiator.instanceId,
      bindingSig: initiator.bindingSig,
    });
    responderDialer.start();
    initiatorDialer.start();

    try {
      await waitFor(() => responderDialer.legCount() === 1, 3_000);
      await waitFor(() => initiatorDialer.legCount() === 1, 3_000);

      // Fresh encrypted mail on alpha (fresh nonce — replay-safe).
      const MESH_SUBJECT = 'Mesh-borne mail (ladder rung 6)';
      const MESH_BODY = `Routed via relay ${relayUrl} at ${new Date().toISOString()}`;
      const send = await alpha.api('POST', '/api/community/mail', {
        toHashes: [bravo.identity.contactHash], subject: MESH_SUBJECT, body: MESH_BODY,
      });
      expect(send.status).toBe(200);
      const wireBody = await buildWireBody(alpha.db, String(send.body.id));

      // The EXACT framing path tryMesh uses in production.
      const outcome = await sendMeshRpcRequest(
        initiatorDialer, toHex(responder.ed_pk), '/api/p2p/receive', wireBody, 8_000,
      );
      expect(outcome.ok).toBe(true);
      expect(outcome.transport).toBe('mesh');
      expect(outcome.httpStatus).toBe(200);
      const reply = JSON.parse(outcome.responseText ?? '{}') as { ok: boolean; encrypted: boolean };
      expect(reply.ok).toBe(true);
      expect(reply.encrypted).toBe(true);

      const received = await bravo.db.get<{ body: string; from_hash: string }>(
        'SELECT body, from_hash FROM community_mail WHERE subject = ? AND folder = ?', MESH_SUBJECT, 'inbox',
      );
      expect(received?.body).toBe(MESH_BODY);
      expect(received?.from_hash).toBe(alpha.identity.contactHash);

      // Tidy the sender queue so the suite leaves no pending retries.
      await alpha.db.run(
        "UPDATE community_message_queue SET status = 'sent', delivery_method = 'mesh', updated_at = NOW() WHERE mail_id = ?",
        String(send.body.id),
      );
    } finally {
      initiatorDialer.stop();
      responderDialer.stop();
      await relay.stop();
    }
  }, 30_000);
});
