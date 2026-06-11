#!/usr/bin/env node
/**
 * eval-bop-packs.mjs — retrieval eval for the three BoP knowledge packs
 * (Wave 5 item 5.3 of docs/CORE_EXPERIENCE_REVIEW_2026-06.md).
 *
 * WHAT THIS MEASURES (honestly):
 *   The default mode is a ZERO-SPEND retrieval check. It mirrors the
 *   keyword-fallback scoring used by the existing search path
 *   (`keywordSearch` in server/services/semantic-search.ts: same stop-word
 *   list, matched-term density) applied to the exact text the knowledge-pack
 *   importer embeds and the prompt-builder pack layer injects:
 *   `canonical_name — description` (see knowledge-pack-service.ts
 *   embedAndStore + prompt-builder.ts retrievePackEntityContent).
 *
 *   It does NOT exercise the vector leg of hybridSearch (that requires an
 *   embedding key + a populated DB), so treat scores as a floor for the
 *   keyword path, not a statement about semantic retrieval quality.
 *
 *   For each of 20 fixture questions per pack we check whether the expected
 *   grounding entities rank in the top 3 / 5 / 10 of the pack's entities.
 *   The pack layer injects up to 60 entities within a ~3,500-token budget
 *   (~15-25 entities in practice), so hit@10 is a fair proxy for "would the
 *   right grounding text reach the prompt".
 *
 * USAGE:
 *   node scripts/eval-bop-packs.mjs                 # zero-spend retrieval eval
 *   node scripts/eval-bop-packs.mjs --verbose       # per-question detail
 *   node scripts/eval-bop-packs.mjs --with-llm <model>
 *       Optional, for the operator: also asks an Ollama model each question
 *       twice — without and with the top-10 retrieved grounding lines — and
 *       prints both answers side by side for HUMAN comparison. No automated
 *       answer grading is performed (grading answers with another LLM would
 *       itself be an unvalidated judgment). Uses OLLAMA_BASE_URL
 *       (default http://localhost:11434). Never runs unless the flag is given.
 *
 * CONTENT CAVEAT: the packs under eval are AI-drafted and NOT validated by a
 * local expert (manifest: content_confirmed=false). A good retrieval score
 * means the right entity text reaches the prompt — it does not certify that
 * the entity text is correct.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACKS_DIR = join(ROOT, 'data', 'knowledge-packs');

const VERBOSE = process.argv.includes('--verbose');
const llmFlagIdx = process.argv.indexOf('--with-llm');
const LLM_MODEL = llmFlagIdx !== -1 ? process.argv[llmFlagIdx + 1] : null;
if (llmFlagIdx !== -1 && !LLM_MODEL) {
  console.error('Usage: --with-llm <ollama-model-name>');
  process.exit(1);
}

// ── Stop words: copied from server/services/semantic-search.ts so the eval
//    mirrors the production keyword fallback exactly. ──────────────────────
const STOP_WORDS = new Set([
  'the','and','for','are','but','not','with','this','that','from','have',
  'will','what','when','how','does','into','your','they','their','should',
  'about','need','also','which','been','its','use','can','may','more',
  'our','all','one','has','had','was','were','would','could','shall',
  'any','some','each','such','than','then','now','only','just','like',
  'who','him','her','his','she','him','you','did','get','got','let',
]);

function queryTerms(query) {
  return [...new Set(
    query.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
  )];
}

/** Same scoring shape as keywordSearch: matched terms / total terms. */
function scoreEntities(entities, query) {
  const terms = queryTerms(query);
  if (terms.length === 0) return [];
  return entities
    .map((e) => {
      const lower = e.content_text.toLowerCase();
      const matchCount = terms.filter((t) => lower.includes(t)).length;
      return { ref_id: e.ref_id, score: matchCount / terms.length, matchCount };
    })
    .filter((r) => r.matchCount > 0)
    .sort((a, b) => b.score - a.score || a.ref_id.localeCompare(b.ref_id));
}

// ── Fixtures: 20 questions per pack, phrased like real Life-module user
//    questions. `expect` = ref_ids whose text should ground the answer
//    (ANY of them ranking counts as a hit). ─────────────────────────────────
const FIXTURES = {
  'bop-kenya-financial-services': [
    { q: 'I sent money to the wrong M-Pesa number, how do I get it back?', expect: ['PROC-MPESA-REVERSAL'] },
    { q: 'Safaricom is not resolving my M-Pesa complaint, who can I escalate to?', expect: ['PROC-CBK-ESCALATION', 'PROC-MPESA-COMPLAINT'] },
    { q: 'What is the maximum amount I can keep in my M-Pesa wallet?', expect: ['NORM-MPESA-LIMITS'] },
    { q: 'Is depositing cash at an M-Pesa agent free or should the agent charge me?', expect: ['PROC-AGENT-CASHINOUT', 'NORM-MPESA-CHARGES'] },
    { q: 'Someone called saying I won a Safaricom promotion and must pay a release fee', expect: ['RISK-FAKE-PROMO'] },
    { q: 'I got an SMS saying money was sent to me by mistake and I should send it back', expect: ['RISK-REVERSAL-SCAM'] },
    { q: 'Where do I report fraud SMS and scam calls in Kenya?', expect: ['PROC-FRAUD-REPORT-333'] },
    { q: 'My phone suddenly has no network — could my SIM be swapped and what do I do?', expect: ['PROC-SIM-SWAP-RESPONSE', 'RISK-SIM-SWAP'] },
    { q: 'Who regulates SACCOs in Kenya and how do I check a SACCO is licensed?', expect: ['INST-SASRA'] },
    { q: 'What is the difference between FOSA and BOSA in a SACCO?', expect: ['TERM-FOSA-BOSA'] },
    { q: 'How much loan can I get from my SACCO based on my deposits and guarantors?', expect: ['PROC-SACCO-MEMBERSHIP'] },
    { q: 'How should our chama keep records and handle the money safely?', expect: ['PROC-CHAMA-GOVERNANCE', 'TERM-CHAMA'] },
    { q: 'What is table banking and what interest do groups usually charge?', expect: ['TERM-TABLE-BANKING'] },
    { q: 'Is my money safe if my microfinance bank collapses?', expect: ['INST-KDIC', 'TERM-MFB'] },
    { q: 'Are mobile loan apps in Kenya regulated and how do I check one is licensed?', expect: ['REG-DCP-2022'] },
    { q: 'A loan app is calling my family members to shame me about my debt', expect: ['REG-DCP-2022', 'INST-ODPC', 'RISK-FAKE-LOAN-APPS'] },
    { q: 'How do I check my CRB status and get a clearance certificate?', expect: ['PROC-CRB-CLEARANCE'] },
    { q: 'What is Fuliza and how much does it really cost?', expect: ['TERM-FULIZA'] },
    { q: 'What facility fee do M-Shwari and KCB M-Pesa charge for a 30 day loan?', expect: ['TERM-MSHWARI'] },
    { q: 'An investment group promises 10% returns every week — is it genuine?', expect: ['RISK-PYRAMID'] },
  ],
  'bop-nigeria-financial-services': [
    { q: 'My bank has not resolved my complaint for two weeks, what next?', expect: ['PROC-BANK-COMPLAINT', 'PROC-CBN-ESCALATION'] },
    { q: 'How do I escalate a complaint to the Central Bank of Nigeria?', expect: ['PROC-CBN-ESCALATION'] },
    { q: 'Is my money insured if my microfinance bank fails in Nigeria?', expect: ['INST-NDIC', 'PROC-NDIC-CLAIM'] },
    { q: 'How do I claim my deposits after NDIC closed my bank?', expect: ['PROC-NDIC-CLAIM'] },
    { q: 'What are the categories of microfinance banks in Nigeria?', expect: ['REG-MFB-2020'] },
    { q: 'Can I open a bank account without a utility bill or full documents?', expect: ['REG-TIERED-KYC'] },
    { q: 'What is the difference between BVN and NIN?', expect: ['TERM-BVN-NIN'] },
    { q: 'Someone called saying my BVN will be blocked today unless I verify', expect: ['RISK-BVN-SCAM'] },
    { q: 'Can a lender take money from my other bank accounts if I default?', expect: ['REG-GSI-2020'] },
    { q: 'A loan app is sending messages to my contacts calling me a criminal debtor', expect: ['RISK-LOANAPP-HARASS', 'PROC-FCCPC-LOANAPP'] },
    { q: 'How do I check if a loan app is approved before borrowing?', expect: ['REG-DIGITAL-LENDING-2022', 'PROC-VERIFY-LICENSE'] },
    { q: 'How does esusu contribution work and what are the rules?', expect: ['TERM-ESUSU', 'PROC-ESUSU-OPERATION'] },
    { q: 'What fee does an ajo collector take from my daily savings?', expect: ['TERM-AJO-COLLECTOR'] },
    { q: 'What fees do POS agents charge for cash withdrawal?', expect: ['PROC-POS-AGENT', 'TERM-POS-AGENT'] },
    { q: 'A customer showed me a transfer alert but the money never entered my account', expect: ['RISK-FAKE-ALERT'] },
    { q: 'I was debited but the transfer failed — how do I get a reversal?', expect: ['PROC-NIP-DISPUTE'] },
    { q: 'Where do I report a Ponzi scheme like MMM?', expect: ['RISK-PONZI', 'PROC-EFCC-REPORT'] },
    { q: 'A lender wants a processing fee before releasing my loan — is that normal?', expect: ['RISK-UPFRONT-FEE'] },
    { q: 'What can Payment Service Banks like MoMo PSB do for someone unbanked?', expect: ['REG-PSB'] },
    { q: 'Are mobile money wallets in Nigeria regulated and is the money insured?', expect: ['REG-MMO-2021', 'INST-NDIC'] },
  ],
  'bop-microfinance-universal': [
    { q: 'How does group lending with joint liability work?', expect: ['PROC-JLG'] },
    { q: 'Why do microfinance loans start small and grow with each cycle?', expect: ['PROC-GRADUATED-LENDING'] },
    { q: 'What is the difference between flat rate and reducing balance interest?', expect: ['TERM-FLAT-RATE', 'TERM-DECLINING-BALANCE'] },
    { q: 'The loan is 2% per month flat — what does that really cost per year?', expect: ['TERM-FLAT-RATE'] },
    { q: 'How do I compare the true cost of two loans with different fees?', expect: ['TERM-EIR-APR', 'TERM-TOTAL-COST'] },
    { q: 'What hidden fees increase the real cost of a microloan?', expect: ['TERM-TOTAL-COST'] },
    { q: 'What are the warning signs that a household is over-indebted?', expect: ['NORM-OVERINDEBT-SIGNS'] },
    { q: 'How much of my income can I safely commit to loan repayments?', expect: ['NORM-REPAYMENT-CAPACITY'] },
    { q: 'What are the Client Protection Principles in microfinance?', expect: ['NORM-CPP'] },
    { q: 'Which debt collection practices are unacceptable?', expect: ['NORM-CPP-TREATMENT'] },
    { q: 'What must a lender disclose to me before I sign a loan?', expect: ['NORM-CPP-TRANSPARENCY'] },
    { q: 'Is 30% per year interest exploitative for microcredit?', expect: ['NORM-CPP-PRICING'] },
    { q: 'How does a merry-go-round rotating savings group work?', expect: ['PROC-ROSCA'] },
    { q: 'How does a VSLA work with shares, the social fund, and the cash box?', expect: ['PROC-VSLA'] },
    { q: 'How should we design a complaints mechanism for our clients?', expect: ['PROC-GRIEVANCE', 'NORM-CPP-COMPLAINTS'] },
    { q: 'What should I check before guaranteeing someone else’s loan?', expect: ['TERM-GUARANTOR'] },
    { q: 'What is credit life insurance and what should a client ask about it?', expect: ['TERM-CREDIT-LIFE'] },
    { q: 'I cannot pay my instalment this month — what are my options?', expect: ['PROC-DELINQUENCY'] },
    { q: 'What are the red flags of a predatory lender?', expect: ['NORM-PREDATORY-SIGNS'] },
    { q: 'How do we run the end of cycle share-out in our savings group?', expect: ['PROC-SHARE-OUT'] },
  ],
};

// ── Optional LLM leg (Ollama only, operator-invoked) ───────────────────────
async function askOllama(model, prompt) {
  const base = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const res = await fetch(`${base}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, stream: false }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.response || '').trim();
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('BoP knowledge-pack retrieval eval (zero-spend keyword path)');
  console.log('Scores measure RETRIEVAL of AI-drafted, NOT-YET-VALIDATED content.');
  console.log('');

  const summary = [];

  for (const [slug, fixtures] of Object.entries(FIXTURES)) {
    let entitiesRaw;
    try {
      entitiesRaw = JSON.parse(readFileSync(join(PACKS_DIR, slug, 'entities.json'), 'utf8'));
    } catch (e) {
      console.error(`SKIP ${slug}: cannot read entities.json (${e.message})`);
      continue;
    }
    // Exactly the text embedAndStore embeds and the pack layer injects.
    const entities = entitiesRaw.map((e) => ({
      ref_id: e.ref_id,
      content_text: [e.canonical_name, e.description].filter(Boolean).join(' — '),
    }));

    let hit3 = 0, hit5 = 0, hit10 = 0, mrrSum = 0;
    const misses = [];

    for (const { q, expect } of fixtures) {
      const ranked = scoreEntities(entities, q);
      const ranks = expect
        .map((ref) => ranked.findIndex((r) => r.ref_id === ref))
        .filter((i) => i !== -1)
        .map((i) => i + 1);
      const best = ranks.length > 0 ? Math.min(...ranks) : Infinity;
      if (best <= 3) hit3++;
      if (best <= 5) hit5++;
      if (best <= 10) hit10++;
      mrrSum += best === Infinity ? 0 : 1 / best;
      if (best > 10) misses.push({ q, expect, best: best === Infinity ? 'not retrieved' : `rank ${best}`, top: ranked.slice(0, 3).map((r) => r.ref_id) });
      if (VERBOSE) {
        const status = best <= 10 ? 'ok ' : 'MISS';
        console.log(`  [${status}] best=${best === Infinity ? '-' : best}  ${q}`);
      }

      if (LLM_MODEL) {
        const grounding = ranked.slice(0, 10)
          .map((r) => entities.find((e) => e.ref_id === r.ref_id).content_text)
          .join('\n- ');
        const bare = await askOllama(LLM_MODEL, `Answer briefly and concretely for a low-income user:\n${q}`);
        const grounded = await askOllama(LLM_MODEL,
          `Reference notes (AI-drafted, verify locally):\n- ${grounding}\n\nUsing the notes where relevant, answer briefly and concretely for a low-income user:\n${q}`);
        console.log(`\n──── ${q}\n[WITHOUT pack] ${bare}\n\n[WITH pack]    ${grounded}\n`);
      }
    }

    const n = fixtures.length;
    const pct = (x) => `${((x / n) * 100).toFixed(0)}%`;
    summary.push({ slug, n, hit3, hit5, hit10, mrr: mrrSum / n, misses });
    console.log(`${slug}: hit@3 ${pct(hit3)} (${hit3}/${n}) | hit@5 ${pct(hit5)} (${hit5}/${n}) | hit@10 ${pct(hit10)} (${hit10}/${n}) | MRR ${(mrrSum / n).toFixed(2)}`);
    for (const m of misses) {
      console.log(`   MISS: "${m.q}"`);
      console.log(`         expected ${m.expect.join(' or ')} (${m.best}); top-3 were: ${m.top.join(', ') || '(none matched)'}`);
    }
  }

  console.log('\nHonest reading: hit@10 approximates "right grounding reaches the prompt"');
  console.log('via the keyword fallback only. The vector path may do better or worse.');
  console.log('Run with --with-llm <model> for a manual answer-quality comparison.');

  const worst = Math.min(...summary.map((s) => s.hit10 / s.n));
  process.exitCode = worst >= 0.5 ? 0 : 1; // fail loudly if keyword retrieval is broken
}

main().catch((e) => { console.error(e); process.exit(1); });
