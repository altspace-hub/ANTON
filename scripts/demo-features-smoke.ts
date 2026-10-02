/**
 * demo-features-smoke.ts — a live check of the answer tools a demo visitor can
 * use beside a module run: the Trust Score, Explain-for, the Citations check,
 * the Review chip and "Rerun with..." (the second opinion), Find the right
 * module, the Transform panel and Build Module; the workspace features
 * (Engagement Tasks, Projects, the Knowledge Base, the Task Agent, Discover,
 * the read-only views and the Exchange download; --workspace-only checks just
 * these); and that the admin-only features still answer 404.
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
/** Skips the answer tools and checks only the workspace features (fewer model calls). */
const WORKSPACE_ONLY = args.includes('--workspace-only');

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

type Headers = (json?: boolean) => Record<string, string>;

/**
 * The workspace features opened to visitors on 2026-10-02: Engagement Tasks,
 * Projects, the Knowledge Base (as a run source too), the Task Agent, Discover,
 * the read-only Orchestration, Intelligence and Radar views, and the Exchange
 * download. Everything it makes is deleted with the account.
 */
async function workspaceFeatures(h: Headers, defaultModel: string): Promise<void> {
  const json = async <T>(r: Response): Promise<T> => (await r.json().catch(() => ({}))) as T;

  // Engagement Tasks: create, one intake turn on the model, read back.
  const en = await fetch(`${BASE}/api/engagements`, { method: 'POST', headers: h(), body: JSON.stringify({ title: 'Smoke engagement', client_name: 'Example Bank (fictional)', domain_areas: ['aml'] }) });
  const enBody = await json<{ id?: string; error?: string }>(en);
  check(en.ok && !!enBody.id, 'Engagement Tasks: create', `HTTP ${en.status}${enBody.error ? `, ${enBody.error}` : ''}`);
  if (enBody.id) {
    const turn = await fetch(`${BASE}/api/engagements/${enBody.id}/intake/turn`, { method: 'POST', headers: h(), body: JSON.stringify({ message: "We are reviewing a fictional mid-size bank's sanctions screening before a 2026 inspection. Scope: screening calibration and alert handling." }) });
    const t = await readSse(turn);
    check(turn.ok && t.text.length > 50 && t.errors.length === 0, 'Engagement Tasks: intake turn', `HTTP ${turn.status}, ${t.text.length} chars, frames ${[...t.types].join('/')}${t.errors.length ? `, errors: ${t.errors.join(' | ').slice(0, 200)}` : ''}`);
    const back = await fetch(`${BASE}/api/engagements/${enBody.id}`, { headers: h(false) });
    check(back.ok, 'Engagement Tasks: read back', `HTTP ${back.status}`);
    const cl = await fetch(`${BASE}/api/engagements/${enBody.id}/changelog`, { headers: h(false) });
    check(cl.ok, 'Engagement Tasks: changelog', `HTTP ${cl.status}`);
  }

  // Projects: create, list, delete.
  const pr = await fetch(`${BASE}/api/projects`, { method: 'POST', headers: h(), body: JSON.stringify({ name: 'Smoke project', description: 'made by the features smoke' }) });
  const prBody = await json<{ id?: string; project?: { id?: string } }>(pr);
  const projectId = prBody.id ?? prBody.project?.id;
  check(pr.ok && !!projectId, 'Projects: create', `HTTP ${pr.status}`);
  const pl = await fetch(`${BASE}/api/projects`, { headers: h(false) });
  check(pl.ok, 'Projects: list', `HTTP ${pl.status}`);
  if (projectId) {
    const pd = await fetch(`${BASE}/api/projects/${projectId}`, { method: 'DELETE', headers: h(false) });
    check(pd.ok, 'Projects: delete', `HTTP ${pd.status}`);
  }

  // Knowledge Base: a collection, one document, and a run that uses it (keyword search).
  const co = await fetch(`${BASE}/api/collections`, { method: 'POST', headers: h(), body: JSON.stringify({ name: `smoke-${randomBytes(3).toString('hex')}`, displayName: 'Smoke policies' }) });
  const coBody = await json<{ id?: string; collectionId?: string; collection?: { id?: string }; error?: string }>(co);
  const collectionId = coBody.collectionId ?? coBody.id ?? coBody.collection?.id;
  check(co.ok && !!collectionId, 'Knowledge Base: create collection', `HTTP ${co.status}${coBody.error ? `, ${coBody.error}` : ''}`);
  if (collectionId) {
    const form = new FormData();
    form.append('collectionId', collectionId);
    form.append('file', new Blob(['Quokkaflux retention policy (fictional).\n\nUnder the Quokkaflux policy, customer due diligence records are kept for 47 days after the relationship ends, then deleted.\n'], { type: 'text/plain' }), 'quokkaflux-policy.txt');
    const up = await fetch(`${BASE}/api/documents/upload`, { method: 'POST', headers: { authorization: h(false).authorization, origin: BASE }, body: form });
    const upBody = await json<{ error?: string }>(up);
    check(up.ok, 'Knowledge Base: upload a document', `HTTP ${up.status}${upBody.error ? `, ${upBody.error}` : ''}`);
    let indexed = false;
    let lastStatus = '';
    for (let i = 0; i < 10 && !indexed; i++) {
      const docs = await json<Array<{ index_status?: string }> | { documents?: Array<{ index_status?: string }> }>(await fetch(`${BASE}/api/documents/collection/${collectionId}`, { headers: h(false) }));
      const list = Array.isArray(docs) ? docs : docs.documents ?? [];
      lastStatus = list.map((d) => String(d.index_status ?? '?')).join(',');
      indexed = list.some((d) => d.index_status === 'indexed');
      if (!indexed) await new Promise((r) => setTimeout(r, 2000));
    }
    check(indexed, 'Knowledge Base: the document is indexed', lastStatus);
    const run = await fetch(`${BASE}/api/claude/message`, {
      method: 'POST', headers: h(),
      body: JSON.stringify({ model: defaultModel, thinking: 'quick', history: [], userMessage: 'How long are customer due diligence records kept under the Quokkaflux policy? Answer in one sentence.', knowledgeSources: { modes: { claudeKnowledge: { enabled: false, webSearchEnabled: false } }, ragSearch: { enabled: true, collections: [collectionId] } } }),
    });
    const a = await readSse(run);
    const cites = /47/.test(a.text);
    check(run.ok && cites && a.errors.length === 0, "Knowledge Base: a run answers from the visitor's collection", `HTTP ${run.status}, ${a.text.length} chars, ${cites ? 'cites 47 days' : `no "47": ${a.text.slice(0, 160)}`}${a.errors.length ? `, errors: ${a.errors.join(' | ').slice(0, 200)}` : ''}`);
    const cd = await fetch(`${BASE}/api/collections/${collectionId}`, { method: 'DELETE', headers: h(false) });
    check(cd.ok, 'Knowledge Base: delete collection', `HTTP ${cd.status}`);
  }

  // Task Agent: a task and one conversational turn.
  const ta = await fetch(`${BASE}/api/task-agent/tasks`, { method: 'POST', headers: h(), body: JSON.stringify({ title: 'Smoke task', description: 'Draft a one-page checklist for onboarding a new payment processor under the GDPR.' }) });
  const taBody = await json<{ id?: string; task?: { id?: string }; error?: string }>(ta);
  const taskId = taBody.id ?? taBody.task?.id;
  check(ta.ok && !!taskId, 'Task Agent: create task', `HTTP ${ta.status}${taBody.error ? `, ${taBody.error}` : ''}`);
  if (taskId) {
    const msg = await fetch(`${BASE}/api/task-agent/tasks/${taskId}/message`, { method: 'POST', headers: h(), body: JSON.stringify({ content: 'It is for a 30-person Swedish fintech. Keep it short.' }) });
    const m = await readSse(msg);
    check(msg.ok && m.text.length > 50 && m.errors.length === 0, 'Task Agent: a turn on the model', `HTTP ${msg.status}, ${m.text.length} chars, frames ${[...m.types].join('/')}${m.errors.length ? `, errors: ${m.errors.join(' | ').slice(0, 200)}` : ''}`);
    const mission = await fetch(`${BASE}/api/task-agent/tasks/${taskId}/execute-as-mission`, { method: 'POST', headers: h(), body: '{}' });
    check(mission.status === 404, 'Task Agent: execute-as-mission stays closed', `HTTP ${mission.status}`);
  }

  // Discover: a lite interview, its opening and one answer.
  const ds = await fetch(`${BASE}/api/discovery/sessions`, { method: 'POST', headers: h(), body: JSON.stringify({ tier: 'lite' }) });
  const dsBody = await json<{ id?: string; error?: string }>(ds);
  check(ds.ok && !!dsBody.id, 'Discover: create interview', `HTTP ${ds.status}${dsBody.error ? `, ${dsBody.error}` : ''}`);
  if (dsBody.id) {
    const st = await fetch(`${BASE}/api/discovery/sessions/${dsBody.id}/start`, { headers: h(false) });
    const stBody = await json<{ response?: string; error?: string }>(st);
    check(st.ok && (stBody.response ?? '').length > 30, 'Discover: opening question', `HTTP ${st.status}, ${(stBody.response ?? stBody.error ?? '').length} chars`);
    const rs = await fetch(`${BASE}/api/discovery/sessions/${dsBody.id}/respond`, { method: 'POST', headers: h(), body: JSON.stringify({ message: 'I am a compliance analyst at a fictional payments firm. Most of my day goes on reviewing alerts by hand.' }) });
    const rsBody = await json<{ response?: string; state?: { userProfile?: { role?: string } }; error?: string }>(rs);
    const reply = rsBody.response ?? '';
    check(rs.ok && reply.length > 30 && !/STATE_UPDATE|```json/.test(reply), 'Discover: an answer, with no raw state JSON shown', `HTTP ${rs.status}, ${reply.length} chars, role recorded: ${rsBody.state?.userProfile?.role || '(none)'}`);
    const dd = await fetch(`${BASE}/api/discovery/sessions/${dsBody.id}`, { method: 'DELETE', headers: h(false) });
    check(dd.ok, 'Discover: delete', `HTTP ${dd.status}`);
  }

  // Read-only views.
  for (const route of ['/api/org-context', '/api/insights', '/api/intelligence/summary', '/api/radar/items', '/api/radar/summary', '/api/continuity/profiles']) {
    const r = await fetch(`${BASE}${route}`, { headers: h(false) });
    check(r.ok, `read: GET ${route}`, `HTTP ${r.status}`);
  }

  // Exchange: the visitor's own module, downloaded unsigned.
  const cm = await fetch(`${BASE}/api/custom-modules`, { method: 'POST', headers: h(), body: JSON.stringify({ name: 'Smoke exchange module', system_prompt: 'You review supplier contracts.', area: 'data-privacy' }) });
  const cmBody = await json<{ id?: string }>(cm);
  if (cmBody.id) {
    const ex = await fetch(`${BASE}/api/exchange/export/${cmBody.id}?type=custom`, { method: 'POST', headers: h(), body: '{}' });
    const bytes = ex.ok ? (await ex.arrayBuffer()).byteLength : 0;
    check(ex.ok && bytes > 100, 'Exchange: download own module', `HTTP ${ex.status}, ${bytes} bytes`);
    await fetch(`${BASE}/api/custom-modules/${cmBody.id}`, { method: 'DELETE', headers: h(false) });
  } else {
    check(false, 'Exchange: a module to download', `HTTP ${cm.status}`);
  }
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
    if (!WORKSPACE_ONLY) {
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

    }

    await workspaceFeatures(h, defaultModel);

    // Still admin-only for a visitor.
    for (const [method, route] of [
      ['POST', '/api/claude/deliberate'], ['GET', '/api/knowledge/atoms'], ['POST', '/api/modules/community'],
      ['GET', '/api/coding/projects'], ['POST', '/api/radar/scan'], ['POST', '/api/exchange/import'],
      ['POST', '/api/task-agent/backfill-atoms'], ['POST', '/api/projects/x/members'], ['PUT', '/api/org-context'],
    ] as const) {
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
