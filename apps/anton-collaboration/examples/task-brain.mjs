#!/usr/bin/env node
/*
 * task-brain.mjs — a minimal, real "agent brain" for the ANTON Collaboration
 * standalone (2026-07-17, W3).
 *
 * The collaboration standalone gives your agent a durable TASK INBOX: the owner
 * posts tasks from the ANTON Agent phone app ("find running shoes under 1500 kr",
 * "book a table Friday"), and something has to pick them up, do the work, and
 * reply so the owner sees an agent bubble in their app. That "something" is YOUR
 * brain — the collaboration app deliberately ships only the rails, not the brain.
 * This is the smallest honest brain: it polls the inbox and answers each task
 * with an LLM (Anthropic by default, Mistral if you set MISTRAL_API_KEY).
 *
 * It is an EXAMPLE, not the product: a real brain would also run the commerce
 * loop (searchSellers -> negotiate -> proposeAgreement -> settle via the payment
 * gateway) for tasks that need a purchase. This one just demonstrates the inbox
 * round-trip end-to-end, which is what makes the phone app usable today.
 *
 * Run (Node 18+, no dependencies):
 *   COLLAB_PAIR_CODE=283069 ANTHROPIC_API_KEY=sk-ant-... \
 *     node apps/anton-collaboration/examples/task-brain.mjs
 *
 * Env:
 *   COLLAB_URL         default http://127.0.0.1:49260  (the standalone's /rpc host)
 *   COLLAB_PAIR_CODE   the 6-digit code printed to the standalone's stderr on boot
 *   COLLAB_BEARER      an sk_... token from a previous /pair (skips pairing)
 *   ANTHROPIC_API_KEY  or MISTRAL_API_KEY — the LLM that writes the replies
 *   POLL_MS            default 4000
 *   AGENT_NAME         label for this brain in /pair (default "task-brain")
 */

const COLLAB_URL = (process.env.COLLAB_URL || 'http://127.0.0.1:49260').replace(/\/$/, '');
const POLL_MS = Number(process.env.POLL_MS || 4000);
const AGENT_NAME = process.env.AGENT_NAME || 'task-brain';

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const MISTRAL_KEY = process.env.MISTRAL_API_KEY;

function die(msg) { console.error(`[task-brain] ${msg}`); process.exit(1); }

// ── Pairing + RPC ────────────────────────────────────────────────────────

async function pair() {
  if (process.env.COLLAB_BEARER) return process.env.COLLAB_BEARER;
  const code = process.env.COLLAB_PAIR_CODE;
  if (!code) die('set COLLAB_PAIR_CODE (the 6-digit code the standalone prints on boot) or COLLAB_BEARER');
  const res = await fetch(`${COLLAB_URL}/pair`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: AGENT_NAME, code, ttlMs: 30 * 24 * 60 * 60 * 1000 }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.sessionToken) die(`pairing failed (${res.status}): ${JSON.stringify(body)}`);
  console.error(`[task-brain] paired as "${AGENT_NAME}" — store COLLAB_BEARER=${body.sessionToken} to skip pairing next time`);
  return body.sessionToken;
}

let BEARER;
async function rpc(method, params = {}) {
  const res = await fetch(`${COLLAB_URL}/rpc`, {
    method: 'POST',
    headers: { authorization: `Bearer ${BEARER}`, 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const body = await res.json().catch(() => ({}));
  if (body.error) throw new Error(`${method}: ${body.error.message} (${body.error.code})`);
  return body.result;
}

// ── LLM ──────────────────────────────────────────────────────────────────

const SYSTEM = [
  'You are the owner\'s personal agent, answering a task they sent from their phone.',
  'Be concise, warm, and concrete. If the task needs a purchase or an external action you cannot',
  'actually perform here, say clearly what you WOULD do and what you need from them, rather than',
  'pretending it is done. Reply in the language of the task. Keep it to a few sentences.',
].join(' ');

async function llmReply(title, messages) {
  const convo = messages.map((m) => `${m.role === 'human' ? 'Owner' : 'You'}: ${m.text}`).join('\n');
  const prompt = `Task: ${title}\n\nConversation so far:\n${convo || '(no messages yet)'}\n\nWrite your reply.`;
  if (ANTHROPIC_KEY) return anthropic(prompt);
  if (MISTRAL_KEY) return mistral(prompt);
  die('set ANTHROPIC_API_KEY or MISTRAL_API_KEY');
}

async function anthropic(prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
      max_tokens: 600, system: SYSTEM, messages: [{ role: 'user', content: prompt }],
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  return (body.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
}

async function mistral(prompt) {
  const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${MISTRAL_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.MISTRAL_MODEL || 'mistral-large-latest', max_tokens: 600,
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }],
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`mistral ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  return body.choices?.[0]?.message?.content?.trim() || '';
}

// ── Loop ─────────────────────────────────────────────────────────────────

const answered = new Set();

async function handleTask(t) {
  if (answered.has(t.id)) return;
  answered.add(t.id);
  console.error(`[task-brain] task ${t.id}: "${t.title}"`);
  try {
    const thread = await rpc('listMessages', { taskId: t.id });
    const reply = await llmReply(thread.title || t.title, thread.messages || []);
    await rpc('postMessage', { taskId: t.id, text: reply || 'On it — I\'ll follow up shortly.' });
    await rpc('setTaskStatus', { taskId: t.id, status: 'done' });
    console.error(`[task-brain] answered + closed task ${t.id}`);
  } catch (e) {
    answered.delete(t.id); // let a transient failure retry next poll
    console.error(`[task-brain] task ${t.id} failed: ${e.message}`);
  }
}

async function main() {
  BEARER = await pair();
  const status = await rpc('getStatus').catch(() => null);
  console.error(`[task-brain] connected to ${COLLAB_URL} — polling the inbox every ${POLL_MS}ms`
    + (status ? ` (agent: ${status.agentName ?? 'this instance'})` : ''));
  for (;;) {
    try {
      const { tasks = [] } = await rpc('listTasks', { status: 'open' });
      for (const t of tasks) await handleTask(t);
    } catch (e) {
      console.error(`[task-brain] poll error: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main().catch((e) => die(e.message));
