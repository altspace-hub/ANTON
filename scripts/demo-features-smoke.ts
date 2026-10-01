/**
 * demo-features-smoke.ts — a live check of the answer tools a demo visitor can
 * use beside a module run: the Trust Score, Explain-for, the Citations check,
 * the Review chip and "Rerun with..." (the second opinion), Find the right
 * module, the Transform panel and Build Module; and that the admin-only
 * features still answer 404.
 *
 * Run on the demo server, in the app directory:
 *
 *   pnpm exec tsx scripts/demo-features-smoke.ts [--base https://host]
 *
 * It signs up through the public sign-up with DEMO_SIGNUP_CODE (as a group
 * link does), uses the account, and deletes it with everything it wrote
 * (deleteDemoAccountNow). Real model calls: a few cents. Prints statuses,
 * lengths, models and costs, never a password or a token.
 */
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { PostgresAdapter } from '../server/db/adapters/postgresql-adapter.js';
import { deleteDemoAccountNow } from '../server/services/demo-retention.js';
import { DEMO_TERMS_VERSION, demoOfferedModels, isDemoMode } from '../server/middleware/demo-mode.js';

const args = process.argv.slice(2);
const argValue = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const BASE = (argValue('--base') ?? `http://127.0.0.1:${process.env.PORT || 3001}`).replace(/\/+$/, '');

let failures = 0;
function check(ok: boolean, label: string, detail = ''): void {
  console.log(`[features] ${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? `: ${detail}` : ''}`);
  if (!ok) failures++;
}

/** Reads an SSE body: the text deltas, error frames and frame types. */
async function readSse(res: Response): Promise<{ text: string; errors: string[]; types: Set<string> }> {
  const out = { text: '', errors: [] as string[], types: new Set<string>() };
  if (!res.body) return out;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      try {
        const ev = JSON.parse(data) as Record<string, unknown>;
        const type = String(ev.type ?? 'unknown');
        out.types.add(type);
        if (type === 'text_delta' || type === 'delta' || type === 'text') out.text += String(ev.content ?? ev.text ?? '');
        if (type === 'error') out.errors.push(String(ev.message ?? ev.error ?? ''));
      } catch { /* not JSON */ }
    }
  }
  return out;
}

async function main(): Promise<void> {
  if (!isDemoMode()) throw new Error('DEMO_MODE is not true here: this is meant for the demo server.');
  const db = new PostgresAdapter({ connectionString: process.env.DATABASE_URL!, maxConnections: 2 });
  const offered = demoOfferedModels();
  const defaultModel = process.env.DEFAULT_MODEL ?? offered[0];
  const other = offered.find((m) => m !== defaultModel && /kimi/.test(m)) ?? offered.find((m) => m !== defaultModel) ?? defaultModel;
  const email = `features-${randomBytes(4).toString('hex')}@example.invalid`;
  const password = randomBytes(18).toString('base64url');

  const signup = await fetch(`${BASE}/api/auth/demo-signup`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: BASE },
    body: JSON.stringify({ email, username: `f_${randomBytes(4).toString('hex')}`, password, code: process.env.DEMO_SIGNUP_CODE ?? '', over18: true, acceptTerms: true, termsVersion: DEMO_TERMS_VERSION }),
  });
  const su = await signup.json().catch(() => ({})) as { user?: { id: string }; token?: string; error?: string };
  if (signup.status !== 201 || !su.user || !su.token) throw new Error(`sign-up failed: HTTP ${signup.status} ${su.error ?? ''}`);
  const userId = su.user.id;
  const token = su.token;
  const h = (json = true): Record<string, string> => ({ authorization: `Bearer ${token}`, origin: BASE, ...(json ? { 'content-type': 'application/json' } : {}) });
  console.log(`[features] visitor ${userId} via ${BASE}; default ${defaultModel}; second opinion ${other}`);

  try {
    // A module run on the default model, in a session (the Trust Score needs one).
    const s = await fetch(`${BASE}/api/sessions`, { method: 'POST', headers: h(), body: JSON.stringify({ moduleId: 'cross-border-transfer-assessment', title: 'features smoke', config: { model: defaultModel } }) });
    const sessionId = ((await s.json()) as { id: string }).id;
    const run = await fetch(`${BASE}/api/claude/message`, {
      method: 'POST', headers: h(),
      body: JSON.stringify({ model: defaultModel, thinking: 'quick', moduleId: 'cross-border-transfer-assessment', areaId: 'data-privacy', sessionId, history: [], outputFormats: ['executive-summary'], knowledgeSources: { modes: { claudeKnowledge: { enabled: true, webSearchEnabled: false } } }, userMessage: 'A 40-person Swedish SaaS firm wants a US-hosted CRM for customer contacts. What must it do under the GDPR first, citing the articles? One page.' }),
    });
    const answer = await readSse(run);
    check(answer.text.length > 300 && answer.errors.length === 0, 'module run (default model)', `${answer.text.length} chars${answer.errors.length ? `, errors: ${answer.errors.join(' | ').slice(0, 200)}` : ''}`);

    // The Trust Score arrives after the answer.
    let score: { overall?: number; modelUsed?: string } | null = null;
    for (let i = 0; i < 12 && !score?.overall; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const q = await fetch(`${BASE}/api/quality/by-session/${sessionId}`, { headers: h(false) });
      if (q.ok) {
        const body = await q.json() as Record<string, unknown> | Array<Record<string, unknown>> | null;
        const row = Array.isArray(body) ? body[0] : body;
        if (row && typeof row === 'object') score = { overall: Number((row as { overall?: unknown; overall_score?: unknown }).overall ?? (row as { overall_score?: unknown }).overall_score), modelUsed: String((row as { modelUsed?: unknown; model_used?: unknown }).modelUsed ?? (row as { model_used?: unknown }).model_used ?? '') };
      }
    }
    check(!!score?.overall && Number.isFinite(score.overall), 'Trust Score', score ? `overall ${score.overall}, scored by ${score.modelUsed}` : 'none after 60 s');
    check(!!score?.modelUsed && score.modelUsed === (process.env.QUALITY_SCORER_MODEL ?? score.modelUsed), 'Trust Score by the configured scorer', String(score?.modelUsed));

    // Explain-for.
    const ex = await fetch(`${BASE}/api/claude/explain-for`, { method: 'POST', headers: h(), body: JSON.stringify({ content: answer.text.slice(0, 3000), audience: 'board' }) });
    const exOut = await readSse(ex);
    check(ex.ok && exOut.text.length > 100 && exOut.errors.length === 0, 'Explain-for', `HTTP ${ex.status}, ${exOut.text.length} chars${exOut.errors.length ? `, errors: ${exOut.errors.join(' | ').slice(0, 200)}` : ''}`);

    // Citations.
    const ci = await fetch(`${BASE}/api/claude/verify-citations`, { method: 'POST', headers: h(), body: JSON.stringify({ text: answer.text.slice(0, 8000), sessionId, sourceManifest: [] }) });
    const ciBody = await ci.json().catch(() => ({})) as Record<string, unknown>;
    check(ci.ok, 'Citations check', `HTTP ${ci.status}, ${JSON.stringify(ciBody).slice(0, 160)}`);

    // Review chip on the second-opinion model.
    const modes = await (await fetch(`${BASE}/api/reviews/modes`, { headers: h(false) })).json() as Array<{ id: string }>;
    const rv = await fetch(`${BASE}/api/reviews`, { method: 'POST', headers: h(), body: JSON.stringify({ modeId: modes[0]?.id, content: answer.text.slice(0, 6000), model: other, sessionId }) });
    const rvOut = await readSse(rv);
    check(rv.ok && rvOut.text.length > 100 && rvOut.errors.length === 0, `Review chip (${modes[0]?.id} on ${other})`, `HTTP ${rv.status}, ${rvOut.text.length} chars${rvOut.errors.length ? `, errors: ${rvOut.errors.join(' | ').slice(0, 200)}` : ''}`);

    // Rerun with the second-opinion model.
    const rr = await fetch(`${BASE}/api/rerun`, { method: 'POST', headers: h(), body: JSON.stringify({ sessionId, mode: 'recompose', newModelId: other }) });
    const rrCt = rr.headers.get('content-type') ?? '';
    let rrDetail = `HTTP ${rr.status}`;
    if (rrCt.includes('event-stream')) { const o = await readSse(rr); rrDetail += `, ${o.text.length} chars${o.errors.length ? `, errors: ${o.errors.join(' | ').slice(0, 200)}` : ''}`; check(rr.ok && o.text.length > 100 && o.errors.length === 0, `Rerun with ${other}`, rrDetail); }
    else { const b = await rr.json().catch(() => ({})) as Record<string, unknown>; check(rr.ok, `Rerun with ${other}`, `${rrDetail} ${JSON.stringify(b).slice(0, 200)}`); }

    // Find the right module.
    const sm = await fetch(`${BASE}/api/modules/smart-search`, { method: 'POST', headers: h(), body: JSON.stringify({ query: 'I need to assess our money-laundering risk across the business' }) });
    const smBody = await sm.json().catch(() => []) as Array<{ moduleId?: string }>;
    check(sm.ok && Array.isArray(smBody) && smBody.length > 0, 'Find the right module', `HTTP ${sm.status}, ${Array.isArray(smBody) ? smBody.map((m) => m.moduleId).join(', ') : JSON.stringify(smBody).slice(0, 120)}`);

    // Transform panel: a renderer that needs no structured extraction if one applies.
    const ap = await fetch(`${BASE}/api/renderers/applicable?session_id=${encodeURIComponent(sessionId)}`, { headers: h(false) });
    const apBody = await ap.json().catch(() => ({})) as { renderers?: Array<{ id: string }> } | Array<{ id: string }>;
    const renderers = Array.isArray(apBody) ? apBody : apBody.renderers ?? [];
    check(ap.ok && renderers.length > 0, 'Transform panel lists renderers', `HTTP ${ap.status}, ${renderers.map((r) => r.id).slice(0, 8).join(', ')}`);
    const pick = renderers.find((r) => /plain|one-pager|devil|html/i.test(r.id)) ?? renderers[0];
    if (pick) {
      const rn = await fetch(`${BASE}/api/renderers/run`, { method: 'POST', headers: h(), body: JSON.stringify({ session_id: sessionId, renderer_id: pick.id }) });
      const rnBody = await rn.json().catch(() => ({})) as Record<string, unknown>;
      check(rn.ok, `Transform: ${pick.id}`, `HTTP ${rn.status} ${JSON.stringify(rnBody).slice(0, 160)}`);
    }

    // Build Module: guide, test run, save and delete.
    const gm = await fetch(`${BASE}/api/custom-modules/guide-message`, { method: 'POST', headers: h(), body: JSON.stringify({ messages: [], userMessage: 'I want a module that reviews supplier contracts for GDPR Article 28 terms.' }) });
    const gmBody = await gm.json().catch(() => ({})) as { response?: string; error?: string };
    check(gm.ok && (gmBody.response ?? '').length > 30, 'Build Module: Guide me', `HTTP ${gm.status}, ${(gmBody.response ?? gmBody.error ?? '').length} chars`);
    const tr = await fetch(`${BASE}/api/custom-modules/test-run`, { method: 'POST', headers: h(), body: JSON.stringify({ systemPrompt: 'You review supplier contracts for GDPR Article 28 processor terms. Be brief.', testQuery: 'Which clauses must a processor contract contain?' }) });
    const trBody = await tr.json().catch(() => ({})) as { response?: string; model?: string; error?: string };
    check(tr.ok && (trBody.response ?? '').length > 50, 'Build Module: Test run', `HTTP ${tr.status}, ${(trBody.response ?? '').length} chars on ${trBody.model ?? '?'}${trBody.error ? `, ${trBody.error}` : ''}`);
    const cm = await fetch(`${BASE}/api/custom-modules`, { method: 'POST', headers: h(), body: JSON.stringify({ name: 'Smoke contract reviewer', system_prompt: 'You review supplier contracts.', area: 'data-privacy' }) });
    const cmBody = await cm.json().catch(() => ({})) as { id?: string };
    check(cm.status === 201 && !!cmBody.id, 'Build Module: save', `HTTP ${cm.status}`);
    const big = await fetch(`${BASE}/api/custom-modules`, { method: 'POST', headers: h(), body: JSON.stringify({ name: 'too big', system_prompt: 'x'.repeat(150_000) }) });
    check(big.status === 413, 'Build Module: an oversized module is refused', `HTTP ${big.status}`);
    if (cmBody.id) {
      const del = await fetch(`${BASE}/api/custom-modules/${cmBody.id}`, { method: 'DELETE', headers: h(false) });
      check(del.ok, 'Build Module: delete', `HTTP ${del.status}`);
    }

    // Still admin-only for a visitor.
    for (const [method, route] of [['GET', '/api/projects'], ['GET', '/api/engagements'], ['GET', '/api/task-agent/tasks'], ['POST', '/api/claude/deliberate'], ['GET', '/api/knowledge/atoms'], ['POST', '/api/modules/community'], ['GET', '/api/radar/items']] as const) {
      const r = await fetch(`${BASE}${route}`, { method, headers: h(method !== 'GET'), ...(method !== 'GET' ? { body: '{}' } : {}) });
      check(r.status === 404, `visitor kept from ${method} ${route}`, `HTTP ${r.status}`);
    }

    const ledger = await db.all<{ purpose: string | null; model: string; n: string | number; usd: number }>(
      `SELECT purpose, model, COUNT(*) AS n, SUM(cost_usd) AS usd FROM llm_spend_ledger WHERE user_id = ? GROUP BY purpose, model ORDER BY model, purpose`, [userId],
    );
    let total = 0;
    for (const l of ledger) { total += Number(l.usd); console.log(`[features] ledger ${l.model} ${l.purpose ?? '-'}: ${l.n} calls, $${Number(l.usd).toFixed(5)}`); }
    console.log(`[features] total $${total.toFixed(4)}`);
    console.log(`[features] ${failures === 0 ? 'ALL PASSED' : `${failures} FAILURE(S)`}`);
  } finally {
    const r = await deleteDemoAccountNow(db, userId);
    console.log(`[features] test account deleted: deleted=${r.deleted} failed=${r.failed}`);
    await db.close();
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('[features] error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
