/**
 * demo-smoke.ts — a live check of the demo's Work path on every offered model.
 *
 * Run on the demo server, in the app directory, against the running service:
 *
 *   pnpm exec tsx scripts/demo-smoke.ts [--models a,b] [--quick] [--base https://host] [--via-signup]
 *
 * It makes a throwaway account the way an invitation does (an analyst on the
 * demo's rules) — or, with --via-signup, through the public sign-up with
 * DEMO_SIGNUP_CODE, as a group sign-up link does — signs in over HTTP (the
 * app's own port, or --base: the public address, through nginx and TLS), and for each model in DEMO_OFFERED_MODELS
 * runs a module at the quick and the think_hard level, asks for a session
 * title, then uploads a text file and runs on it once, exports an answer to
 * .docx, waits for the after-answer calls and reads what the spend ledger
 * recorded. Then it deletes the account with everything it wrote
 * (deleteDemoAccountNow). Real model calls: this spends a few cents.
 *
 * Prints counts, lengths, timings and costs — never the account's password,
 * a token or an answer's text beyond its first 160 characters.
 */
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { PostgresAdapter } from '../server/db/adapters/postgresql-adapter.js';
import { createInvitedAccount, acceptInvitation } from '../server/services/account-invitations.js';
import { deleteDemoAccountNow } from '../server/services/demo-retention.js';
import { DEMO_TERMS_VERSION, demoOfferedModels, isDemoMode } from '../server/middleware/demo-mode.js';

const args = process.argv.slice(2);
const argValue = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const BASE = (argValue('--base') ?? `http://127.0.0.1:${process.env.PORT || 3001}`).replace(/\/+$/, '');
const QUICK_ONLY = args.includes('--quick');
const VIA_SIGNUP = args.includes('--via-signup');

const MODULES = [
  { moduleId: 'cross-border-transfer-assessment', areaId: 'data-privacy', message: 'We are a Swedish SaaS company of 40 people. We want to use a US-hosted CRM for customer contact data. What do we need to do under the GDPR before we start? Keep it to one page.' },
  { moduleId: 'change-management', areaId: 'consulting', message: 'A mid-size bank is moving 300 back-office staff to a new case-management system in six months. Give a short change plan with the three biggest risks.' },
];

interface RunResult {
  ok: boolean;
  ms: number;
  events: Record<string, number>;
  text: string;
  thinkingChars: number;
  errors: string[];
  notices: string[];
  usage?: { inputTokens: number; outputTokens: number; thinkingTokens: number; modelServed?: string };
}

async function main(): Promise<void> {
  if (!isDemoMode()) throw new Error('DEMO_MODE is not true here: this is meant for the demo server.');
  const db = new PostgresAdapter({ connectionString: process.env.DATABASE_URL!, maxConnections: 2 });
  const models = argValue('--models')?.split(',').map((m) => m.trim()).filter(Boolean) ?? demoOfferedModels();
  const email = `smoke-${randomBytes(4).toString('hex')}@example.invalid`;
  const password = randomBytes(18).toString('base64url');

  let userId: string;
  if (VIA_SIGNUP) {
    // As a co-worker with the group link: the public sign-up, with the invite code.
    const res = await fetch(`${BASE}/api/auth/demo-signup`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: BASE },
      body: JSON.stringify({
        email, username: `smoke_${randomBytes(4).toString('hex')}`, password, code: process.env.DEMO_SIGNUP_CODE ?? '',
        over18: true, acceptTerms: true, termsVersion: DEMO_TERMS_VERSION,
      }),
    });
    const body = await res.json().catch(() => ({})) as { user?: { id: string }; error?: string };
    if (res.status !== 201 || !body.user) throw new Error(`sign-up failed: HTTP ${res.status} ${body.error ?? ''}`);
    userId = body.user.id;
    console.log(`[smoke] OK   sign-up as a visitor via ${BASE}: account ${userId}`);
  } else {
    const issued = await createInvitedAccount(db, { email, displayName: 'Smoke test', createdBy: null });
    await acceptInvitation(db, { token: issued.token, password, over18: true, acceptTerms: true, termsVersion: DEMO_TERMS_VERSION });
    userId = issued.userId;
  }
  console.log(`[smoke] test account ${userId} made; base ${BASE}; models: ${models.join(', ')}`);

  const headers = (token: string, json = true): Record<string, string> => ({
    authorization: `Bearer ${token}`,
    origin: BASE,
    ...(json ? { 'content-type': 'application/json' } : {}),
  });

  try {
    const login = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: BASE },
      // An address typed in another case signs in too.
      body: JSON.stringify({ username: email.toUpperCase(), password }),
    });
    const { token } = await login.json() as { token: string };
    if (!login.ok || !token) throw new Error(`sign-in failed: HTTP ${login.status}`);

    const newSession = async (moduleId: string, model: string): Promise<string> => {
      const res = await fetch(`${BASE}/api/sessions`, {
        method: 'POST', headers: headers(token),
        body: JSON.stringify({ moduleId, title: `smoke ${model}`, config: { model } }),
      });
      const body = await res.json() as { id?: string; error?: string };
      if (!res.ok || !body.id) throw new Error(`session create failed: HTTP ${res.status} ${body.error ?? ''}`);
      return body.id;
    };

    const run = async (cfg: Record<string, unknown>): Promise<RunResult> => {
      const started = Date.now();
      const out: RunResult = { ok: false, ms: 0, events: {}, text: '', thinkingChars: 0, errors: [], notices: [] };
      const res = await fetch(`${BASE}/api/claude/message`, {
        method: 'POST', headers: headers(token), body: JSON.stringify(cfg), signal: AbortSignal.timeout(300_000),
      });
      if (!res.ok || !res.body) {
        out.errors.push(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
        out.ms = Date.now() - started;
        return out;
      }
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
          let ev: Record<string, unknown>;
          try { ev = JSON.parse(data) as Record<string, unknown>; } catch { continue; }
          const type = String(ev.type ?? 'unknown');
          out.events[type] = (out.events[type] ?? 0) + 1;
          if (type === 'text_delta') out.text += String(ev.content ?? '');
          if (type === 'thinking_delta') out.thinkingChars += String(ev.content ?? '').length;
          if (type === 'error') out.errors.push(String(ev.message ?? ''));
          if (type === 'notice') out.notices.push(`${String(ev.code)}: ${String(ev.message ?? '')}`);
          if (type === 'usage') out.usage = ev as unknown as RunResult['usage'];
        }
      }
      out.ms = Date.now() - started;
      out.ok = out.errors.length === 0 && out.text.trim().length > 200 && (out.events.stream_end ?? 0) > 0;
      return out;
    };

    const report = (label: string, r: RunResult): void => {
      const u = r.usage ? ` in=${r.usage.inputTokens} out=${r.usage.outputTokens} think=${r.usage.thinkingTokens}${r.usage.modelServed ? ` served=${r.usage.modelServed}` : ''}` : ' (no usage frame)';
      console.log(`[smoke] ${r.ok ? 'OK  ' : 'FAIL'} ${label}: ${(r.ms / 1000).toFixed(1)}s, ${r.text.length} chars, thinking ${r.thinkingChars} chars,${u}`);
      if (r.errors.length) console.log(`         errors: ${r.errors.join(' | ').slice(0, 400)}`);
      if (r.notices.length) console.log(`         notices: ${r.notices.join(' | ').slice(0, 400)}`);
      console.log(`         starts: ${JSON.stringify(r.text.slice(0, 160))}`);
    };

    const sessions: string[] = [];
    let lastAnswer = '';
    let failures = 0;
    for (const model of models) {
      for (const [i, thinking] of (QUICK_ONLY ? ['quick'] : ['quick', 'think_hard']).entries()) {
        const mod = MODULES[i % MODULES.length];
        const sessionId = await newSession(mod.moduleId, model);
        sessions.push(sessionId);
        const r = await run({
          model, thinking, moduleId: mod.moduleId, areaId: mod.areaId, userMessage: mod.message,
          sessionId, history: [], outputFormats: ['executive-summary'], uploadedFileIds: [],
        });
        report(`${model} ${thinking} ${mod.moduleId}`, r);
        if (!r.ok) failures++;
        if (r.ok) lastAnswer = r.text;
        if (r.ok && i === 0) {
          const t = await fetch(`${BASE}/api/sessions/${sessionId}/title/generate`, {
            method: 'POST', headers: headers(token),
            body: JSON.stringify({ userMessage: mod.message, responsePreview: r.text.slice(0, 600) }),
          });
          const tb = await t.json().catch(() => ({})) as { title?: string | null; error?: string };
          console.log(`[smoke] ${t.ok && tb.title ? 'OK  ' : 'FAIL'} title (${model}): ${JSON.stringify(tb.title ?? tb.error ?? null)}`);
          if (!(t.ok && tb.title)) failures++;
        }
      }
    }

    // An uploaded file as a source, on the default model.
    const form = new FormData();
    form.append('file', new Blob([
      'Supplier register (fictional)\nAcme Cloud Ltd - hosting - UK - contract ends 2027-03-31\n'
      + 'Nordic Payroll AB - payroll - SE - contract ends 2026-12-31\nDataPipe Inc - analytics - US - no DPA on file\n',
    ], { type: 'text/plain' }), 'supplier-register.txt');
    const up = await fetch(`${BASE}/api/files/upload`, { method: 'POST', headers: headers(token, false), body: form });
    const upBody = await up.json().catch(() => ({})) as { id?: string; fileId?: string; error?: string };
    const fileId = upBody.id ?? upBody.fileId;
    console.log(`[smoke] ${up.ok && fileId ? 'OK  ' : 'FAIL'} upload: HTTP ${up.status}${upBody.error ? ` ${upBody.error}` : ''}`);
    if (up.ok && fileId) {
      const sessionId = await newSession('cross-border-transfer-assessment', models[0]);
      sessions.push(sessionId);
      const r = await run({
        model: models[0], thinking: 'quick', moduleId: 'cross-border-transfer-assessment', areaId: 'data-privacy',
        userMessage: 'Which of the suppliers in the uploaded register need a transfer assessment, and why?',
        sessionId, history: [], outputFormats: [], uploadedFileIds: [fileId],
      });
      report(`${models[0]} quick with an uploaded file`, r);
      if (!r.ok) failures++;
      if (r.ok && !/DataPipe/i.test(r.text)) console.log('         note: the answer does not name DataPipe — the file may not have reached the model');
    } else failures++;

    // Export the last answer.
    if (lastAnswer) {
      const ex = await fetch(`${BASE}/api/export`, {
        method: 'POST', headers: headers(token),
        body: JSON.stringify({ format: 'docx', content: lastAnswer, metadata: { title: 'Smoke test' } }),
      });
      const size = (await ex.arrayBuffer()).byteLength;
      console.log(`[smoke] ${ex.ok && size > 2000 ? 'OK  ' : 'FAIL'} export docx: HTTP ${ex.status}, ${size} bytes, ${ex.headers.get('content-type')}`);
      if (!(ex.ok && size > 2000)) failures++;
    }

    // The after-answer calls (session conclusion) run in the background.
    await new Promise((r) => setTimeout(r, 20_000));
    const snaps = await db.get<{ n: string | number }>(
      `SELECT COUNT(*) AS n FROM session_snapshots WHERE session_id IN (${sessions.map(() => '?').join(',')})`, ...sessions,
    );
    console.log(`[smoke] session conclusions written: ${snaps?.n ?? 0} for ${sessions.length} sessions`);
    const ledger = await db.all<{ purpose: string | null; model: string; cost_source: string; n: string | number; usd: number; tin: string | number; tout: string | number }>(
      `SELECT purpose, model, cost_source, COUNT(*) AS n, SUM(cost_usd) AS usd, SUM(input_tokens) AS tin, SUM(output_tokens) AS tout
         FROM llm_spend_ledger WHERE user_id = ? GROUP BY purpose, model, cost_source ORDER BY model, purpose`,
      userId,
    );
    let total = 0;
    for (const l of ledger) {
      total += Number(l.usd);
      console.log(`[smoke] ledger ${l.model} ${l.purpose ?? '-'} ${l.cost_source}: ${l.n} calls, $${Number(l.usd).toFixed(5)}, in ${l.tin} out ${l.tout}`);
    }
    const stuck = ledger.filter((l) => l.cost_source === 'reserved');
    console.log(`[smoke] total $${total.toFixed(4)}; ${stuck.length ? `${stuck.length} reservation rows NOT settled` : 'every call settled'}`);
    console.log(`[smoke] ${failures === 0 ? 'ALL PASSED' : `${failures} FAILURE(S)`}`);
  } finally {
    const r = await deleteDemoAccountNow(db, userId);
    console.log(`[smoke] test account deleted: ${JSON.stringify(r).slice(0, 200)}`);
    await db.close();
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('[smoke] error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
