/**
 * html-exporter.ts — single self-contained HTML file for offline browsing.
 *
 * Phase 4 of EVIDENCE_PACK_SPEC.md (§5.4): "for archival, browsable offline.
 * Single .html file with embedded CSS and JS, searchable locally, no network
 * calls."
 *
 * The output mirrors the regulator-facing UI but lives entirely in one file
 * — every item body, the manifest, the compliance mapping, and a search box
 * are all embedded. Useful for: regulators who keep evidence binders on a
 * USB stick, archives that outlive ANTON, anyone wanting a portable receipt.
 *
 * Redacted items show only their metadata + reason, never the body. The
 * "What this proves / does not prove" disclaimer appears verbatim per §9.4.
 */

import type { AssembledPack } from './assembler.js';
import { mapCompliance, renderFrameworkMarkdown } from './compliance-mapper.js';

export function generateEvidencePackHtml(assembled: AssembledPack): string {
  const compliance = mapCompliance(
    assembled,
    assembled.pack.compliance_frameworks,
    assembled.pack.compliance_gaps,
  );

  // Build a JSON payload the embedded JS can index.
  const payload = {
    pack: {
      id: assembled.pack.id,
      title: assembled.pack.title,
      purpose: assembled.pack.purpose,
      scope_label: assembled.pack.scope_label,
      status: assembled.pack.status,
      hash_manifest: assembled.pack.hash_manifest,
      signature: assembled.pack.signature,
      signer_public_key: assembled.pack.signer_public_key,
      finalised_at: assembled.pack.finalised_at,
      created_by: assembled.pack.created_by,
      created_at: assembled.pack.created_at,
      compliance_frameworks: assembled.pack.compliance_frameworks,
    },
    items: assembled.collectedItems.map((item) => {
      const redaction = assembled.redactions[`${item.itemType}:${item.itemId}`];
      const isRedacted = redaction && redaction.status !== 'none';
      return {
        type: item.itemType,
        id: item.itemId,
        hash: item.itemHash,
        summary: item.itemSummary,
        regulatory_relevance: item.regulatoryRelevance,
        body: isRedacted ? null : safeJsonParse(item.canonicalJson),
        redaction: isRedacted ? { status: redaction.status, reason: redaction.reason } : null,
      };
    }),
    compliance: compliance.frameworks.map((fr) => ({
      id: fr.id, label: fr.label, citation: fr.citation,
      evidencedCount: fr.evidencedCount, gapCount: fr.gapCount,
      acceptedGapCount: fr.acceptedGapCount, notApplicableCount: fr.notApplicableCount,
      points: fr.points.map((p) => ({
        id: p.id, label: p.label, status: p.status, notes: p.notes,
        evidence_count: p.evidence.length,
        acceptance: p.acceptance,
      })),
      markdown: renderFrameworkMarkdown(assembled, fr.id, compliance),
    })),
  };
  const payloadJson = JSON.stringify(payload).replace(/</g, '\\u003c');
  const escapedTitle = escapeHtml(assembled.pack.title);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Evidence Pack — ${escapedTitle}</title>
<style>
  :root { color-scheme: light; }
  html, body { margin: 0; padding: 0; background: #f6f7f9; color: #0F1B2D;
               font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
  body { display: grid; grid-template-rows: auto 1fr; min-height: 100vh; }
  header { background: #fff; border-bottom: 1px solid #e1e5ea; padding: 1.5rem 2rem; }
  header h1 { margin: 0; font-size: 1.4rem; color: #0D7D6C; display: flex; align-items: center; gap: 0.6rem; }
  header .meta { color: #5A6A7E; font-size: 0.85rem; margin-top: 0.4rem; }
  main { display: grid; grid-template-columns: 280px 1fr; max-width: 1280px; width: 100%; margin: 0 auto; padding: 1.5rem; gap: 1.5rem; }
  nav { background: #fff; border: 1px solid #e1e5ea; border-radius: 12px; padding: 0.5rem 0; height: fit-content; position: sticky; top: 1rem; }
  nav button { display: block; width: 100%; text-align: left; padding: 0.6rem 1rem; border: 0;
               background: transparent; cursor: pointer; font-size: 0.9rem; color: #0F1B2D; border-left: 3px solid transparent; }
  nav button.active { background: #f0f7f5; color: #0D7D6C; border-left-color: #0D7D6C; }
  nav button:hover { background: #f5f7fa; }
  section { background: #fff; border: 1px solid #e1e5ea; border-radius: 12px; padding: 1.5rem; }
  h2 { margin-top: 0; font-size: 1.2rem; }
  .search { width: 100%; padding: 0.5rem 0.75rem; border: 1px solid #c5cdd6; border-radius: 8px; font-size: 0.95rem; margin-bottom: 1rem; }
  .item { border-top: 1px solid #e1e5ea; padding: 0.8rem 0; }
  .item:first-child { border-top: 0; }
  .item-head { display: flex; gap: 0.5rem; align-items: baseline; flex-wrap: wrap; }
  .badge { padding: 0.1rem 0.5rem; border-radius: 4px; font-size: 0.75rem; }
  .badge-type { background: #d1fae5; color: #065f46; }
  .badge-redacted { background: #fef3c7; color: #92400e; font-weight: 600; }
  .item-summary { font-size: 0.95rem; }
  .item-id { font-family: ui-monospace, monospace; font-size: 0.75rem; color: #5A6A7E; }
  details summary { cursor: pointer; color: #5A6A7E; font-size: 0.85rem; margin-top: 0.5rem; }
  pre { background: #f0f1f4; padding: 0.75rem; border-radius: 6px; font-size: 0.8rem; overflow-x: auto; }
  .compliance-fr { border-top: 1px solid #e1e5ea; padding: 1rem 0; }
  .compliance-fr:first-child { border-top: 0; padding-top: 0; }
  .compliance-pt { padding: 0.4rem 0; font-size: 0.9rem; }
  .ok { color: #065f46; }
  .gap { color: #991b1b; }
  .accepted { color: #92400e; }
  .na { color: #5A6A7E; }
  footer { padding: 1.5rem 2rem; color: #5A6A7E; font-size: 0.8rem; text-align: center; }
  code.hash { font-family: ui-monospace, monospace; font-size: 0.8rem; word-break: break-all; }
  .disclaimer { background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; padding: 0.75rem; font-size: 0.85rem; color: #78350f; margin-top: 1rem; }
</style>
</head>
<body>
<header>
  <h1>${escapedTitle}</h1>
  <div class="meta">
    Pack <code>${assembled.pack.id}</code> — ${assembled.collectedItems.length} items
    · ${assembled.pack.signature ? 'signed' : 'unsigned'}
    · ${assembled.pack.finalised_at ? 'finalised ' + assembled.pack.finalised_at : 'draft'}
  </div>
</header>
<main>
  <nav id="nav">
    <button data-tab="overview" class="active">Overview</button>
    <button data-tab="items">Items (${assembled.collectedItems.length})</button>
    <button data-tab="compliance">Compliance</button>
    <button data-tab="raw">Raw manifest</button>
  </nav>
  <section id="content"></section>
</main>
<footer>
  Self-contained Evidence Pack — works fully offline. No network calls.
</footer>
<script>
const PAYLOAD = ${payloadJson};
const tabs = document.querySelectorAll('nav button');
const content = document.getElementById('content');
let activeTab = 'overview';
let searchQuery = '';

function escapeHtml(s) { return String(s).replace(/[<>"&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', '&': '&amp;' }[c])); }

function render() {
  if (activeTab === 'overview') renderOverview();
  else if (activeTab === 'items') renderItems();
  else if (activeTab === 'compliance') renderCompliance();
  else if (activeTab === 'raw') renderRaw();
}

function renderOverview() {
  const p = PAYLOAD.pack;
  const fr = PAYLOAD.compliance;
  const totalGaps = fr.reduce((s, f) => s + (f.gapCount - f.acceptedGapCount), 0);
  content.innerHTML = \`
    <h2>Overview</h2>
    <div><strong>Title:</strong> \${escapeHtml(p.title)}</div>
    \${p.purpose ? '<div style="margin-top:0.5rem"><strong>Purpose:</strong> ' + escapeHtml(p.purpose) + '</div>' : ''}
    <div style="margin-top:0.5rem"><strong>Scope:</strong> \${escapeHtml(p.scope_label || '(unscoped)')}</div>
    <div style="margin-top:0.5rem"><strong>Created by:</strong> \${escapeHtml(p.created_by)} at \${p.created_at}</div>
    <div style="margin-top:0.5rem"><strong>Manifest hash:</strong> <code class="hash">\${p.hash_manifest || '—'}</code></div>
    <div style="margin-top:0.5rem"><strong>Signed by:</strong> <code class="hash">\${p.signer_public_key || '(unsigned)'}</code></div>
    <div style="margin-top:1rem"><strong>Compliance:</strong>
      \${fr.map(f => '<div style="margin-top:0.3rem">' + escapeHtml(f.label) + ' — <span class="ok">' + f.evidencedCount + ' ✓</span> · <span class="' + (f.gapCount - f.acceptedGapCount > 0 ? 'gap' : 'na') + '">' + (f.gapCount - f.acceptedGapCount) + ' open gaps</span> · ' + f.acceptedGapCount + ' accepted</div>').join('')}
    </div>
    <div class="disclaimer">
      <strong>What signing does and does not prove:</strong> Does prove this pack's contents existed in this exact form at finalisation, and were finalised by this authenticated user. Does NOT prove the contents reflect reality outside ANTON. The pack proves the platform's internal record; the underlying professional work being documented must be independently assessed.
    </div>
  \`;
}

function renderItems() {
  const q = searchQuery.toLowerCase();
  const filtered = q
    ? PAYLOAD.items.filter(i => (i.summary + ' ' + i.id + ' ' + i.hash).toLowerCase().includes(q))
    : PAYLOAD.items;
  content.innerHTML = \`
    <h2>Items (\${filtered.length} of \${PAYLOAD.items.length})</h2>
    <input class="search" id="search" type="search" placeholder="Search summaries, ids, hashes…" value="\${escapeHtml(searchQuery)}">
    <div>\${filtered.map(itemHtml).join('')}</div>
  \`;
  document.getElementById('search').addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderItems();
    setTimeout(() => document.getElementById('search').focus(), 0);
  });
}

function itemHtml(item) {
  const redactedBadge = item.redaction ? '<span class="badge badge-redacted">REDACTED</span>' : '';
  const body = item.redaction
    ? '<div class="disclaimer">Redacted (' + escapeHtml(item.redaction.status) + '): ' + escapeHtml(item.redaction.reason || '') + '</div>'
    : '<details><summary>Body</summary><pre>' + escapeHtml(JSON.stringify(item.body, null, 2)) + '</pre></details>';
  return \`
    <div class="item">
      <div class="item-head">
        <span class="badge badge-type">\${escapeHtml(item.type)}</span>
        \${redactedBadge}
        <span class="item-summary">\${escapeHtml(item.summary)}</span>
      </div>
      <div class="item-id">\${escapeHtml(item.id)} · <code class="hash">\${escapeHtml(item.hash)}</code></div>
      \${body}
    </div>
  \`;
}

function renderCompliance() {
  content.innerHTML = '<h2>Compliance</h2>' + PAYLOAD.compliance.map(fr => \`
    <div class="compliance-fr">
      <h3 style="margin:0">\${escapeHtml(fr.label)}</h3>
      <div style="color:#5A6A7E;font-size:0.85rem">\${escapeHtml(fr.citation)}</div>
      <div style="margin-top:0.4rem"><span class="ok">\${fr.evidencedCount} evidenced</span> · <span class="\${fr.gapCount - fr.acceptedGapCount > 0 ? 'gap' : 'na'}">\${fr.gapCount - fr.acceptedGapCount} open</span> · \${fr.acceptedGapCount} accepted · \${fr.notApplicableCount} N/A</div>
      \${fr.points.map(p => {
        const cls = p.status === 'evidenced' ? 'ok' : p.status === 'not_applicable' ? 'na' : p.acceptance ? 'accepted' : 'gap';
        const icon = p.status === 'evidenced' ? '✓' : p.status === 'not_applicable' ? '·' : p.acceptance ? '!' : '✗';
        return '<div class="compliance-pt"><strong class="' + cls + '">' + icon + '</strong> ' + escapeHtml(p.label)
          + (p.notes ? '<div style="color:#5A6A7E;font-size:0.8rem;margin-left:1.2rem">' + escapeHtml(p.notes) + '</div>' : '')
          + (p.acceptance ? '<div style="color:#92400e;font-size:0.8rem;margin-left:1.2rem;font-style:italic">"' + escapeHtml(p.acceptance.rationale) + '" — accepted by ' + escapeHtml(p.acceptance.acceptedBy) + '</div>' : '')
          + '</div>';
      }).join('')}
    </div>
  \`).join('');
}

function renderRaw() {
  content.innerHTML = '<h2>Raw manifest</h2><pre>' + escapeHtml(JSON.stringify(PAYLOAD.pack, null, 2)) + '</pre>';
}

tabs.forEach((b) => b.addEventListener('click', () => {
  tabs.forEach((x) => x.classList.remove('active'));
  b.classList.add('active');
  activeTab = b.dataset.tab;
  searchQuery = '';
  render();
}));
render();
</script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[<>"&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', '&': '&amp;' }[c] ?? c));
}

function safeJsonParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return s; }
}
