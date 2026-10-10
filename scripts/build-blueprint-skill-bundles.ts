/**
 * build-blueprint-skill-bundles.ts — write the installable .anton bundles of
 * the FCP blueprint skills, plus a README, to a folder.
 *
 *   pnpm exec tsx scripts/build-blueprint-skill-bundles.ts --out <folder>
 *
 * One bundle per skill (fcp-blueprint-<slug>.anton), one for the house
 * standards and one for all of them (fcp-blueprints-all.anton). The bundles
 * are built by server/services/blueprint-skill-bundles.ts from the skills in
 * server/skills/fcp-bp-*; tests/services/blueprint-skill-bundles.test.ts
 * imports every one through ANTON's own importer. Regenerate the skills first
 * (scripts/build-blueprint-skills.ts) when the library changes.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  buildAllBlueprintsBundle,
  buildBlueprintSkillBundle,
  listBlueprintSkillIds,
  readBlueprintMeta,
  HOUSE_STANDARDS_SKILL_ID,
} from '../server/services/blueprint-skill-bundles.js';
import { getSkillByIdAsync } from '../server/services/skills-manager.js';
import { OUTPUT_FORMATS } from '../src/lib/output-format-definitions.js';

async function main(): Promise<void> {
  const i = process.argv.indexOf('--out');
  const out = i > 0 ? process.argv[i + 1] : '';
  if (!out) {
    console.error('Usage: tsx scripts/build-blueprint-skill-bundles.ts --out <folder>');
    process.exit(1);
  }
  fs.mkdirSync(out, { recursive: true });

  const rows: string[] = [];
  const written: Array<{ file: string; bytes: number; sha: string }> = [];
  const write = (fileName: string, buffer: Buffer) => {
    fs.writeFileSync(path.join(out, fileName), buffer);
    written.push({ file: fileName, bytes: buffer.length, sha: crypto.createHash('sha256').update(buffer).digest('hex') });
  };

  for (const id of listBlueprintSkillIds()) {
    const bundle = await buildBlueprintSkillBundle(id);
    write(bundle.fileName, bundle.buffer);
    const skill = await getSkillByIdAsync(id);
    const meta = readBlueprintMeta(id);
    const fmt = meta.pairedOutputFormat ? OUTPUT_FORMATS.find((f) => f.id === meta.pairedOutputFormat)?.label ?? meta.pairedOutputFormat : '—';
    const recommended = meta.recommendedFor.length > 0 ? meta.recommendedFor.join(', ') : '—';
    if (id !== HOUSE_STANDARDS_SKILL_ID) {
      rows.push(`| ${skill?.name.replace(/^FCP blueprint(?: \[DRAFT\])?:\s*/, '')} | \`${bundle.fileName}\` | \`${id}\` | ${meta.status === 'draft' ? '**draft – needs team input**' : 'stable'} | ${fmt} | ${recommended} |`);
    }
  }
  const all = await buildAllBlueprintsBundle();
  write(all.fileName, all.buffer);

  const readme = `# FCP blueprint skills for ANTON

Installable ANTON bundles (\`.anton\`) of the FCP blueprint library. Each bundle installs one or more **skills** (the blueprint's method, deliverable template and quality bar) and a small **module** that runs them. Built from the library with ANTON's \`scripts/build-blueprint-skills.ts\` and \`scripts/build-blueprint-skill-bundles.ts\`; every bundle is imported through ANTON's own importer in its test suite.

## How to install

1. In ANTON, open **Marketplace → Upload** (\`/marketplace/upload\`, "Import .anton Package"), or the **Exchange** page.
2. Choose the \`.anton\` file and import it. The import shows the bundle's fingerprint and the skills it embeds.
3. The skills then appear in every module's **skill picker**; the module appears under your custom modules.

\`fcp-blueprints-all.anton\` installs all fourteen skills at once. Its module is a guide that names the right blueprint for a deliverable; it attaches only the house standards, so nothing large is added to a run unless you choose it.

On an ANTON that already ships these skills (the \`feat/blueprint-skills\` branch onwards), importing a bundle reuses the built-in skill when the text is identical; a different version is installed beside it under \`bundle:<module>:<skill>\`, so nothing local is overwritten.

## How to use a blueprint

- Attach the blueprint skill (and **FCP blueprint: house standards**) in the skill picker of the module that produces the deliverable. Modules where it fits suggest it ("Suggested for this module … Apply?"); nothing is attached until you choose it.
- Where a blueprint has its own output format, selecting that format gives the blueprint's section order and attaches the two skills by itself. With another output format, the format sets the layout and the blueprint supplies the method, the evidence asked for and the wording.
- **Scores are never changed by a blueprint.** A rating that ANTON computes (for example in the Risk Atlas), that the module defines or that you supply is used as given.
- The reference catalogues behind each blueprint are in the knowledge pack **FCP blueprint reference catalogues** (\`fcp-blueprint-references\`, shipped with ANTON under \`data/knowledge-packs\`). Install and activate it under Knowledge when you want them retrieved into runs; it is not active by default.

## Which skill fits which deliverable

| Deliverable | Bundle | Skill | Status | Output format (layout) | Suggested in modules |
|---|---|---|---|---|---|
${rows.join('\n')}
| House standards (writing rules, glossary EN/SV, gap markers) | \`fcp-blueprint-house-standards.anton\` | \`${HOUSE_STANDARDS_SKILL_ID}\` | stable | — | attached with every blueprint format |
| All of the above | \`fcp-blueprints-all.anton\` | all fourteen | — | — | — |

**Drafts.** Four blueprints are marked **draft – needs team input** (sanctions, ABC and fraud risk assessments, and the compliance review report). They rest partly on analogy or general best practice; their names start with "FCP blueprint [DRAFT]" and each tells the user so. Validate them before client use.

## Files

| File | Bytes | SHA-256 |
|---|---|---|
${written.map((w) => `| \`${w.file}\` | ${w.bytes} | \`${w.sha}\` |`).join('\n')}
`;
  fs.writeFileSync(path.join(out, 'README.md'), readme, 'utf8');
  for (const w of written) console.log(`${w.file.padEnd(52)} ${String(w.bytes).padStart(8)}  ${w.sha.slice(0, 16)}`);
  console.log(`README.md written to ${out}`);
}

// Exit explicitly: the bundler pulls in module-loader, whose dev-mode file
// watcher on server/areas would otherwise keep the process alive.
main().then(() => process.exit(0), (err: unknown) => {
  console.error(err);
  process.exit(1);
});
