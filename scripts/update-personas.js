#!/usr/bin/env node
// scripts/update-personas.js
// Updates `recommendedPersonas` in every server/areas/*/modules/*/module.json

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AREAS_DIR = path.resolve(__dirname, '..', 'server', 'areas');

// ─── Mapping ────────────────────────────────────────────────────────────────
const AREA_PERSONAS = {
  'academic':             ['general-assistant'],
  'accounting':           ['finance-expert', 'auditor'],
  'artisan-craft':        ['small-business-mentor', 'cooperative-development-officer'],
  'audit':                ['auditor'],
  'banking':              ['fcp-expert', 'cco'],
  'branding':             ['digital-marketing-manager', 'strategy-expert'],
  'coding':               ['tech-expert'],
  'comms-pr':             ['strategy-expert'],
  'community-health':     ['community-health-worker', 'nutrition-health-educator'],
  'consulting':           ['strategy-expert'],
  'consumer-legal':       ['paralegal-aid', 'consumer-rights-advocate'],
  'consumer-protection':  ['consumer-rights-advocate'],
  'creative-production':  ['creative-director'],
  'credit-navigator':     ['microfinance-field-officer'],
  'cyber':                ['cyber-expert'],
  'data-analytics':       ['data-scientist'],
  'data-privacy':         ['dpo'],
  'design':               ['creative-director', 'strategy-expert'],
  'education':            ['education-expert'],
  'education-literacy':   ['education-expert'],
  'esg':                  ['strategy-expert'],
  'fcp':                  ['fcp-expert'],                          // overridden per-module below
  'food-business':        ['food-safety-inspector', 'small-business-mentor'],
  'government':           ['policy-analyst'],
  'government-services':  ['policy-analyst'],
  'healthcare':           ['clinical-professional'],
  'hr':                   ['hr-expert'],
  'insurance':            ['finance-expert', 'risk-specialist'],
  'investment':           ['pe-vc-expert', 'finance-expert'],
  'islamic-finance':      ['sharia-board-member', 'islamic-finance-structurer'],
  'journalism':           ['general-assistant'],
  'land-rights':          ['land-rights-paralegal'],
  'legal':                ['legal-expert'],
  'livestock-poultry':    ['agricultural-extension-worker', 'veteran-farmer'],
  'manufacturing':        ['strategy-expert', 'tech-expert'],
  'marketing':            ['digital-marketing-manager', 'strategy-expert'],
  'micro-business':       ['small-business-mentor'],
  'microfinance':         ['microfinance-field-officer', 'microenterprise-credit-advisor'],
  'mobile-money':         ['mobile-money-agent-trainer', 'mobile-money-compliance'],
  'pe-vc':                ['pe-vc-expert'],
  'personal-dev':         ['strategy-expert', 'hr-expert'],
  'personal-finance':     ['finance-expert'],
  'personal-finance-bop': ['microfinance-field-officer'],
  'product-management':   ['strategy-expert', 'tech-expert'],
  'project-mgmt':         ['strategy-expert'],
  'public-sector':        ['policy-analyst'],
  'real-estate':          ['finance-expert'],
  'risk':                 ['risk-specialist'],
  'sales':                ['strategy-expert', 'startup-advisor'],
  'smallholder-farming':  ['agricultural-extension-worker', 'veteran-farmer'],
  'software-eng':         ['tech-expert'],
  'startups':             ['startup-advisor'],
  'strategy':             ['strategy-expert'],
  'tax-transfer-pricing': ['tax-director', 'transfer-pricing-specialist'],
  'trades':               ['trades-expert'],
  'workers-rights':       ['consumer-rights-advocate', 'paralegal-aid'],
};

// ─── FCP per-module persona override ────────────────────────────────────────
function getFcpPersonas(moduleId) {
  if (moduleId.includes('data-management') || moduleId.includes('risk-assessment')) {
    return ['fcp-expert', 'data-scientist'];
  }
  if (moduleId.includes('gap-analysis') || moduleId.includes('document-creation')) {
    return ['fcp-expert', 'legal-expert'];
  }
  return ['fcp-expert'];
}

// ─── Walk all module.json files ──────────────────────────────────────────────
function findModuleJsonFiles(baseDir) {
  const results = [];
  const areas = fs.readdirSync(baseDir, { withFileTypes: true });
  for (const area of areas) {
    if (!area.isDirectory()) continue;
    const modulesDir = path.join(baseDir, area.name, 'modules');
    if (!fs.existsSync(modulesDir)) continue;
    const modules = fs.readdirSync(modulesDir, { withFileTypes: true });
    for (const mod of modules) {
      if (!mod.isDirectory()) continue;
      const jsonPath = path.join(modulesDir, mod.name, 'module.json');
      if (fs.existsSync(jsonPath)) {
        results.push({ areaId: area.name, moduleId: mod.name, filePath: jsonPath });
      }
    }
  }
  return results;
}

// ─── Main ────────────────────────────────────────────────────────────────────
function main() {
  const files = findModuleJsonFiles(AREAS_DIR);
  console.log(`Found ${files.length} module.json files.\n`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const { areaId, moduleId, filePath } of files) {
    // Determine personas
    let personas;
    if (areaId === 'fcp') {
      personas = getFcpPersonas(moduleId);
    } else if (AREA_PERSONAS[areaId]) {
      personas = AREA_PERSONAS[areaId];
    } else {
      console.warn(`  [SKIP] No mapping for area "${areaId}" — ${filePath}`);
      skipped++;
      continue;
    }

    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(raw);
      const before = JSON.stringify(data.recommendedPersonas ?? null);
      data.recommendedPersonas = personas;
      const after = JSON.stringify(personas);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
      console.log(`  [OK] ${areaId}/${moduleId}  ${before} → ${after}`);
      updated++;
    } catch (err) {
      console.error(`  [ERROR] ${filePath}: ${err.message}`);
      errors++;
    }
  }

  console.log('\n─────────────────────────────────────────');
  console.log(`Total files found   : ${files.length}`);
  console.log(`Updated             : ${updated}`);
  console.log(`Skipped (no mapping): ${skipped}`);
  console.log(`Errors              : ${errors}`);
}

main();
