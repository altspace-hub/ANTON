/**
 * test-module.cjs — end-to-end smoke test for an ANTON module against a RUNNING
 * dev server (the same checks used to verify the 2026-06-14 audit-plan modules).
 *
 * Verifies, in order:
 *   1. runtime load        — GET /api/modules/<id> returns config + a non-empty system prompt
 *   2. area listing        — GET /api/areas/<areaId> includes the module
 *   3. prompt assembly     — POST /api/claude/preview-prompt composes the full 7-layer prompt
 *                            (no LLM spend) and it contains the module's own prompt content
 *   4. (optional) live run — POST /api/claude/message streams a real generation through the
 *                            module (use --run). Defaults to a Mistral model so it works even
 *                            when the Anthropic balance is depleted.
 *
 * Usage:
 *   node scripts/test-module.cjs <moduleId> [areaId] [--run] [--model=mistral-small-latest] [--q="..."]
 *
 * Env: ANTON_BASE (default http://localhost:3001)
 *
 * Exit code 0 = all run checks passed, 1 = a check failed / server unreachable.
 */
const BASE = process.env.ANTON_BASE || 'http://localhost:3001';

function arg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}
const hasFlag = (name) => process.argv.includes(`--${name}`);

async function getCsrf() {
  const r = await fetch(`${BASE}/api/csrf-token`);
  if (!r.ok) throw new Error(`csrf-token ${r.status}`);
  const setCookies = typeof r.headers.getSetCookie === 'function'
    ? r.headers.getSetCookie()
    : [r.headers.get('set-cookie')].filter(Boolean);
  const cookie = setCookies.map((c) => String(c).split(';')[0]).join('; ');
  const { csrfToken } = await r.json();
  return { token: csrfToken, cookie };
}

function post(path, body, csrf) {
  return fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': csrf.token,
      ...(csrf.cookie ? { cookie: csrf.cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? ' PASS' : ' FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!ok) failures++;
}

async function main() {
  const moduleId = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : undefined;
  if (!moduleId) {
    console.error('usage: node scripts/test-module.cjs <moduleId> [areaId] [--run] [--model=...] [--q="..."]');
    process.exit(1);
  }
  let areaId = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : undefined;
  const doRun = hasFlag('run');
  const model = arg('model') || 'mistral-small-latest';
  const question = arg('q')
    || 'In 2-3 short sentences, summarise the single most important issue this module addresses and cite the governing framework(s) by name. Be brief.';

  console.log(`\n▶ testing module "${moduleId}" against ${BASE}\n`);
  const csrf = await getCsrf();

  // 1. runtime load
  const modRes = await fetch(`${BASE}/api/modules/${moduleId}`);
  const mod = modRes.ok ? await modRes.json() : null;
  check('1. runtime load (/api/modules/:id)',
    !!mod && mod.id === moduleId && typeof mod.systemPrompt === 'string' && mod.systemPrompt.length > 0,
    mod ? `area=${mod.areaId} promptChars=${(mod.systemPrompt || '').length}` : `HTTP ${modRes.status}`);
  if (mod && !areaId) areaId = mod.areaId;

  // 2. area listing
  if (areaId) {
    const arRes = await fetch(`${BASE}/api/areas/${areaId}`);
    const ar = arRes.ok ? await arRes.json() : null;
    const ids = ar ? (ar.modules || []).map((m) => m.id) : [];
    check('2. area listing (/api/areas/:areaId)', ids.includes(moduleId),
      `area ${areaId} has ${ids.length} modules`);
  } else {
    check('2. area listing', false, 'no areaId resolved');
  }

  // 3. prompt assembly (no LLM)
  const ppRes = await post('/api/claude/preview-prompt',
    { moduleId, areaId, thinking: 'think_hard', creativity: 'strict', transparencyLevel: 1 }, csrf);
  const pp = ppRes.ok ? await ppRes.json() : null;
  const composed = pp && pp.prompt ? pp.prompt : '';
  // the assembled prompt should contain a recognisable slice of the module's own prompt
  const modHead = mod ? (mod.systemPrompt || '').replace(/^#.*$/m, '').trim().slice(0, 60) : '';
  check('3. prompt assembly (preview-prompt)',
    composed.length > 0 && (!modHead || composed.includes(modHead)),
    pp && pp.error ? JSON.stringify(pp.error).slice(0, 120) : `composed=${composed.length} chars, ~${pp ? pp.estimatedTokens : '?'} tokens`);

  // 4. optional live generation
  if (doRun) {
    process.stdout.write(`\n▶ live run via ${model} …\n\n`);
    const runRes = await post('/api/claude/message',
      { model, moduleId, areaId, thinking: 'quick', creativity: 'strict', userMessage: question }, csrf);
    if (!runRes.ok || !runRes.body) {
      check('4. live generation', false, `HTTP ${runRes.status}`);
    } else {
      let text = '';
      let usage = null;
      let errMsg = null;
      const decoder = new TextDecoder();
      let buf = '';
      for await (const chunk of runRes.body) {
        buf += decoder.decode(chunk, { stream: true });
        const lines = buf.split(/\r?\n/);
        buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const p = line.slice(5).trim();
          if (!p) continue;
          try {
            const j = JSON.parse(p);
            if (j.type === 'text_delta' && typeof j.content === 'string') text += j.content;
            else if (j.type === 'usage') usage = j;
            else if (j.type === 'error' || j.error) errMsg = JSON.stringify(j.error || j).slice(0, 200);
          } catch { /* non-JSON keepalive */ }
        }
      }
      console.log(text.trim() || `(no text) ${errMsg || ''}`);
      check('\n4. live generation', text.trim().length > 0 && !errMsg,
        usage ? `in=${usage.inputTokens} out=${usage.outputTokens}` : (errMsg || ''));
    }
  }

  console.log(`\n${failures === 0 ? '✓ all checks passed' : '✗ ' + failures + ' check(s) failed'}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('test-module error:', e.message); process.exit(1); });
