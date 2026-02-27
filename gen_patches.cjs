const fs = require("fs");

function genKS(ks) {
  const parts = [];
  if (ks.claudeKnowledge) {
    const ck = ks.claudeKnowledge;
    parts.push("        claudeKnowledge: { enabled: " + ck.enabled + ", webSearchEnabled: " + ck.webSearchEnabled + ", description: " + JSON.stringify(ck.description || "") + " },");
  }
  if (ks.localFolder) {
    const lf = ks.localFolder;
    parts.push("        localFolder: { enabled: " + lf.enabled + ", folderPaths: [], recursive: " + lf.recursive + " },");
  }
  return parts.join("\n");
}

function genModule(m) {
  const ks = m.defaults.knowledgeSources || {};
  const ksContent = genKS(ks);
  const ofStr = JSON.stringify(m.defaults.outputFormats || []);
  const li = [
    "  {",
    "    id: " + JSON.stringify(m.id) + ",",
    "    label: " + JSON.stringify(m.label) + ",",
    "    shortLabel: " + JSON.stringify(m.shortLabel) + ",",
    "    icon: " + JSON.stringify(m.icon) + ",",
    "    description: " + JSON.stringify(m.description) + ",",
    "    color: " + JSON.stringify(m.color) + ",",
    "    defaults: {",
    "      thinking: " + JSON.stringify(m.defaults.thinking) + ",",
    "      creativity: " + JSON.stringify(m.defaults.creativity) + ",",
    "      outputFormats: " + ofStr + ",",
    "      knowledgeSources: {",
    ksContent,
    "      },",
    "    },",
    "  },"
  ];
  return li.join("\n");
}

function loadAreas(areas) {
  const result = {};
  for (const area of areas) {
    const ap = "C:/FCP_Workbench/server/areas/" + area;
    const areaJson = JSON.parse(fs.readFileSync(ap + "/area.json", "utf8"));
    const mods = fs.readdirSync(ap + "/modules").sort();
    result[area] = { area: areaJson, modules: [] };
    for (const mod of mods) {
      const d = JSON.parse(fs.readFileSync(ap + "/modules/" + mod + "/module.json", "utf8"));
      result[area].modules.push({
        id: d.id, label: d.label,
        shortLabel: d.shortLabel || d.label,
        icon: d.icon, description: d.description, color: d.color,
        defaults: {
          thinking: d.defaults && d.defaults.thinking,
          creativity: d.defaults && d.defaults.creativity,
          outputFormats: (d.defaults && d.defaults.outputFormats) || [],
          knowledgeSources: (d.defaults && d.defaults.knowledgeSources) || {}
        }
      });
    }
  }
  return result;
}

function buildPatch(areas, exportNames, comments, fileHeader, combinedExport) {
  const data = loadAreas(areas);
  let out = fileHeader;
  for (const areaId of areas) {
    const areaData = data[areaId];
    const exportName = exportNames[areaId];
    out += "// ─── " + comments[areaId] + " ───────────────────────────────────────────

";
    out += "export const " + exportName + ": ModuleDefinition[] = [
";
    for (const m of areaData.modules) { out += genModule(m) + "\n"; }
    out += "];

";
  }
  out += "// Combined export for constants.ts
export const " + combinedExport + ": ModuleDefinition[] = [
";
  for (const areaId of areas) { out += "  ..." + exportNames[areaId] + ",
"; }
  out += "];
";
  return out;
}

// PROFESSIONAL
var profAreas = ["marketing","tax-transfer-pricing","design","journalism","data-privacy","product-management"];
var profNames = {"marketing":"MARKETING_MODULES","tax-transfer-pricing":"TAX_TP_MODULES","design":"DESIGN_MODULES","journalism":"JOURNALISM_MODULES","data-privacy":"DATA_PRIVACY_MODULES","product-management":"PRODUCT_MGMT_MODULES"};
var profComments = {"marketing":"Marketing & Digital Marketing","tax-transfer-pricing":"Tax & Transfer Pricing","design":"Design & UX","journalism":"Journalism & Media","data-privacy":"Data Privacy & GDPR","product-management":"Product Management"};
var profHeader = ["// Patch for Phase 4 Professional areas","// Areas: marketing, tax-transfer-pricing, design, journalism, data-privacy, product-management","// Generated: 2026-02-23","","import type { ModuleDefinition } from "../types";","",""].join("\n");
var profOut = buildPatch(profAreas, profNames, profComments, profHeader, "PHASE4_PROFESSIONAL_MODULES");
fs.writeFileSync("C:/FCP_Workbench/src/lib/area-patches/phase4-professional-patch.ts", profOut);
console.log("professional: " + profOut.length + " chars");

// GLOBAL SOUTH
var gsAreas = ["islamic-finance","mobile-money","microfinance","government"];
var gsNames = {"islamic-finance":"ISLAMIC_FINANCE_MODULES","mobile-money":"MOBILE_MONEY_MODULES","microfinance":"MICROFINANCE_MODULES","government":"GOVERNMENT_MODULES"};
var gsComments = {"islamic-finance":"Islamic Finance & Banking","mobile-money":"Mobile Money & Digital Finance","microfinance":"Microfinance","government":"Government & Public Sector"};
var gsHeader = ["// Patch for Phase 4 Global South areas","// Areas: islamic-finance, mobile-money, microfinance, government","// Generated: 2026-02-23","","import type { ModuleDefinition } from "../types";","",""].join("\n");
var gsOut = buildPatch(gsAreas, gsNames, gsComments, gsHeader, "PHASE4_GLOBAL_SOUTH_MODULES");
fs.writeFileSync("C:/FCP_Workbench/src/lib/area-patches/phase4-global-south-patch.ts", gsOut);
console.log("global-south: " + gsOut.length + " chars");

// BOP
var bopAreas = ["government-services","smallholder-farming","micro-business","workers-rights","personal-finance-bop","credit-navigator","land-rights","consumer-protection","community-health","education-literacy","food-business","artisan-craft","livestock-poultry"];
var bopNames = {"government-services":"GOVERNMENT_SERVICES_MODULES","smallholder-farming":"SMALLHOLDER_FARMING_MODULES","micro-business":"MICRO_BUSINESS_MODULES","workers-rights":"WORKERS_RIGHTS_MODULES","personal-finance-bop":"PERSONAL_FINANCE_BOP_MODULES","credit-navigator":"CREDIT_NAVIGATOR_MODULES","land-rights":"LAND_RIGHTS_MODULES","consumer-protection":"CONSUMER_PROTECTION_MODULES","community-health":"COMMUNITY_HEALTH_MODULES","education-literacy":"EDUCATION_LITERACY_MODULES","food-business":"FOOD_BUSINESS_MODULES","artisan-craft":"ARTISAN_CRAFT_MODULES","livestock-poultry":"LIVESTOCK_POULTRY_MODULES"};
var bopComments = {"government-services":"Government Services Navigator","smallholder-farming":"Smallholder Farming","micro-business":"Micro-Business","workers-rights":"Workers Rights","personal-finance-bop":"Personal Finance (BOP)","credit-navigator":"Credit Navigator","land-rights":"Land Rights","consumer-protection":"Consumer Protection","community-health":"Community Health","education-literacy":"Education & Literacy","food-business":"Food Business","artisan-craft":"Artisan & Craft","livestock-poultry":"Livestock & Poultry"};
var bopHeader = ["// Patch for Phase 4 BOP (Base-of-Pyramid) areas","// Areas: government-services, smallholder-farming, micro-business, workers-rights,","//        personal-finance-bop, credit-navigator, land-rights, consumer-protection,","//        community-health, education-literacy, food-business, artisan-craft, livestock-poultry","// Generated: 2026-02-23","","import type { ModuleDefinition } from "../types";","",""].join("\n");
var bopOut = buildPatch(bopAreas, bopNames, bopComments, bopHeader, "PHASE4_BOP_MODULES");
fs.writeFileSync("C:/FCP_Workbench/src/lib/area-patches/phase4-bop-patch.ts", bopOut);
console.log("bop: " + bopOut.length + " chars");

console.log("All done.");