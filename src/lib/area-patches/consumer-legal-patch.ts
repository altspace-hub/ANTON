// Patch for the Consumer Legal area — hand-written, not generated.
//
// The five original consumer-legal modules live directly in the MODULES array in
// src/lib/constants.ts, and the only other one (global-south-consumer-protection)
// sits in tier-b-patch.ts, which is an AUTO-GENERATED closed set of the ten Wave-2
// Tier-B modules and is rewritten wholesale by scripts/integrate-modules.cjs. So
// neither was a safe or honest home for a later hand-written addition, and this
// file exists to give the area one.
//
// Server configs (prompts + guided inputs) live in server/areas/consumer-legal/modules/<id>/.
// Keep `defaults` here byte-identical to the module.json on disk: for a module the
// client catalogue knows, ModulePage takes thinking / creativity / outputFormats /
// knowledgeSources from HERE and the disk copy is inert. The parity guard in
// tests/lib/module-area-integrity.test.ts fails the build if the two disagree.

import type { ModuleDefinition } from '../types';

export const CONSUMER_LEGAL_MODULES: ModuleDefinition[] = [
  {
    // Wave 5 track A. Directive (EU) 2024/1799 (repair of goods): transposition
    // deadline AND date of application were both 31 July 2026, but transposition
    // is materially incomplete, so the module is written to be jurisdiction-status
    // aware rather than to assert a uniform live regime. 'balanced' matches the
    // area convention — the audience is often a non-lawyer consumer and the prompt
    // promises plain language. Web search is on because the fact that decides the
    // answer (has THIS Member State transposed, and has Annex II grown by delegated
    // act?) changes month to month.
    id: 'right-to-repair-claim',
    label: 'Right to Repair Claim',
    shortLabel: 'Repair Claim',
    icon: 'PackageCheck',
    description: 'Work out what a consumer with a faulty product is actually entitled to: repair versus replacement under the legal guarantee of conformity, the separate manufacturer repair duty under Directive (EU) 2024/1799 for listed product categories, the European Repair Information Form, and the dispute route. Jurisdiction-status aware — the EU limb depends on national transposition, and the UK and US run on different law entirely.',
    color: 'adv-red',
    defaults: {
      thinking: 'investigate',
      creativity: 'balanced',
      outputFormats: ['detailed-findings', 'step-by-step-guide'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: 'EU repair and sale-of-goods regime: Directive (EU) 2024/1799, Directive (EU) 2019/771 as amended, national transposing measures and their status; UK Consumer Rights Act 2015; US state repair statutes and the Magnuson-Moss Warranty Act' },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
];
