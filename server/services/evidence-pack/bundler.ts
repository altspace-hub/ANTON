/**
 * bundler.ts — produce the `.anton` ZIP for a finalised evidence pack.
 *
 * Layout (per spec §5.4):
 *   manifest.json                    — signed manifest (PackManifest from assembler)
 *   signature.txt                    — Ed25519 signature placeholder (Phase 2)
 *   verifier.html                    — standalone signature verifier (Phase 2)
 *   items/<type>_<id>.json           — canonical body of every collected item
 *   compliance/eu_ai_act_annex_iv.md — Annex IV mapping (Phase 3 produces; Phase 1 stubs)
 *   compliance/amlr_auditability.md  — AMLR mapping (Phase 3 produces; Phase 1 stubs)
 *   README.md                        — orientation for the regulator
 *
 * Phase 1 ships everything except: Ed25519 signing (Phase 2), the standalone
 * verifier HTML (Phase 2), and the populated compliance mapping documents
 * (Phase 3). The directory structure is the final shape; Phase 2/3 just fills
 * in content.
 */

import AdmZip from 'adm-zip';
import { createHash } from 'node:crypto';

import type { DatabaseAdapter } from '../../db/database.js';
import { childLogger } from '../../lib/logger.js';
import type { AssembledPack } from './assembler.js';
import { canonicalise } from './collector.js';

const log = childLogger('evidence-pack-bundler');

export async function bundleEvidencePackToAnton(
  _db: DatabaseAdapter,
  assembled: AssembledPack,
): Promise<Buffer> {
  const zip = new AdmZip();

  // 1. Per-item canonical JSON bodies — the actual evidence content.
  for (const item of assembled.collectedItems) {
    const filename = manifestRefFor(item.itemType, item.itemId);
    zip.addFile(filename, Buffer.from(item.canonicalJson, 'utf-8'));
  }

  // 2. Manifest.
  const manifestBytes = Buffer.from(JSON.stringify(assembled.manifest, null, 2), 'utf-8');
  zip.addFile('manifest.json', manifestBytes);

  // 3. Compliance mapping placeholders — Phase 3 fills these in. We always
  //    write the files so the bundle layout is stable across phases and
  //    regulators see the structure even on a Phase 1 export.
  zip.addFile('compliance/eu_ai_act_annex_iv.md', Buffer.from(annexIvStub(assembled), 'utf-8'));
  zip.addFile('compliance/amlr_auditability.md', Buffer.from(amlrAuditabilityStub(assembled), 'utf-8'));

  // 4. Signature + verifier placeholders. Phase 2 fills these in. Writing
  //    empty-but-present files now means a Phase 1 bundle is structurally
  //    identical to a Phase 2 one — only the content of two files differs.
  zip.addFile('signature.txt', Buffer.from('# Phase 2: Ed25519 signature over manifestHash will appear here\n', 'utf-8'));
  zip.addFile('verifier.html', Buffer.from(verifierStub(), 'utf-8'));

  // 5. README — orienting prose for whoever opens this in a file browser.
  zip.addFile('README.md', Buffer.from(readme(assembled), 'utf-8'));

  // 6. Bundle integrity sidecar — sha256 of every entry so a regulator can
  //    spot-check tamper without a full signature verifier. Computed last so
  //    it covers everything else.
  const entries = zip.getEntries()
    .filter((e: { entryName: string; getData: () => Buffer }) => e.entryName !== 'integrity.txt')
    .map((e: { entryName: string; getData: () => Buffer }) => {
      const sha = createHash('sha256').update(e.getData()).digest('hex');
      return `${sha}  ${e.entryName}`;
    })
    .sort();
  zip.addFile('integrity.txt', Buffer.from(entries.join('\n') + '\n', 'utf-8'));

  const buf = zip.toBuffer();
  log.info({
    packId: assembled.pack.id,
    itemCount: assembled.collectedItems.length,
    sizeBytes: buf.length,
  }, 'pack_bundled');
  return buf;
}

// ── Manifest filename helper (kept in sync with assembler.contentRef) ──────

function manifestRefFor(itemType: string, itemId: string): string {
  return `items/${itemType}_${itemId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)}.json`;
}

// ── Phase 1 placeholders ───────────────────────────────────────────────────

function annexIvStub(a: AssembledPack): string {
  return `# EU AI Act — Annex IV Technical Documentation Mapping

**Pack:** ${a.pack.title}
**Pack ID:** ${a.pack.id}
**Items in scope:** ${a.collectedItems.length}

> Phase 3 produces the populated nine-point Annex IV checklist with per-point
> evidence references. This Phase 1 bundle only ships the raw evidence; use
> the items/ directory to verify each artefact, and the manifest hash on the
> cover to verify integrity.

## Annex IV Structure (to be filled by Phase 3 mapper)

1. General description of the AI system
2. Detailed description of system elements + development
3. Monitoring, functioning, and control
4. Risk management system
5. Changes through lifecycle
6. Standards applied
7. EU declaration of conformity
8. Post-market monitoring plan
9. List of harmonised standards applied
`;
}

function amlrAuditabilityStub(a: AssembledPack): string {
  return `# AMLR — Auditability Mapping

**Pack:** ${a.pack.title}
**Pack ID:** ${a.pack.id}

> Phase 3 produces the populated five-dimension AML data quality mapping +
> AMLR Article 21 record-keeping checklist. This Phase 1 bundle ships the
> raw audit_log entries for every AI call; use those + the per-item review
> status to verify auditability.

## AMLR Auditability Dimensions (to be filled by Phase 3 mapper)

- Completeness
- Accuracy
- Timeliness
- Consistency
- **Auditability** — when data was captured, changed, by whom (Article 21)
`;
}

function verifierStub(): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Evidence Pack Verifier</title></head>
<body style="font-family:system-ui;max-width:600px;margin:2rem auto;padding:1rem">
<h1>Evidence Pack Verifier</h1>
<p>Phase 2 will ship a fully offline Ed25519 signature verifier here.
For now, verify integrity by recomputing the per-file SHA-256s against
<code>integrity.txt</code>.</p>
</body></html>`;
}

function readme(a: AssembledPack): string {
  const breakdown = Object.entries(a.manifest.itemsByType)
    .sort((x, y) => y[1] - x[1])
    .map(([t, n]) => `- ${n} × ${t}`)
    .join('\n');
  return `# Evidence Pack — ${a.pack.title}

**Pack ID:** ${a.pack.id}
**Created by:** ${a.pack.created_by}
**Created at:** ${a.pack.created_at}
**Status:** ${a.pack.status}
**Item count:** ${a.collectedItems.length}
**Manifest hash:** \`${a.manifest.manifestHash}\`

## Scope

${a.manifest.scope.label}

## What's in this bundle

${breakdown}

## Layout

- \`manifest.json\` — signed pack manifest. Verify against \`signature.txt\` (Phase 2).
- \`items/<type>_<id>.json\` — canonical body of every collected artefact.
- \`compliance/*.md\` — regulatory mapping documents (Phase 3).
- \`integrity.txt\` — SHA-256 per file inside this bundle.
- \`verifier.html\` — open in a browser to verify signatures (Phase 2).

## Important

This pack proves the platform's internal record was in this exact form at
finalisation, signed by the named user. It does **not** prove the underlying
professional work reflects reality outside ANTON — that requires independent
assessment. (Per EVIDENCE_PACK_SPEC.md §9.4.)

> Phase 1 bundle. Ed25519 signing (Phase 2) and populated compliance mapping
> (Phase 3) ship in later iterations of this module.
`;
}

export { canonicalise };
