// PROFESSIONAL
var profAreas = ["marketing","tax-transfer-pricing","design","journalism","data-privacy","product-management"];
var profNames = {"marketing":"MARKETING_MODULES","tax-transfer-pricing":"TAX_TP_MODULES","design":"DESIGN_MODULES","journalism":"JOURNALISM_MODULES","data-privacy":"DATA_PRIVACY_MODULES","product-management":"PRODUCT_MGMT_MODULES"};
var profComments = {"marketing":"Marketing & Digital Marketing","tax-transfer-pricing":"Tax & Transfer Pricing","design":"Design & UX","journalism":"Journalism & Media","data-privacy":"Data Privacy & GDPR","product-management":"Product Management"};
var profHeader = ["// Patch for Phase 4 Professional areas","// Areas: marketing, tax-transfer-pricing, design, journalism, data-privacy, product-management","// Generated: 2026-02-23","","import type { ModuleDefinition } from "../types";","",""].join("
");
var profOut = buildPatch(profAreas, profNames, profComments, profHeader, "PHASE4_PROFESSIONAL_MODULES");
fs.writeFileSync("C:/FCP_Workbench/src/lib/area-patches/phase4-professional-patch.ts", profOut);
console.log("professional: " + profOut.length + " chars");

// GLOBAL SOUTH
var gsAreas = ["islamic-finance","mobile-money","microfinance","government"];
var gsNames = {"islamic-finance":"ISLAMIC_FINANCE_MODULES","mobile-money":"MOBILE_MONEY_MODULES","microfinance":"MICROFINANCE_MODULES","government":"GOVERNMENT_MODULES"};
var gsComments = {"islamic-finance":"Islamic Finance & Banking","mobile-money":"Mobile Money & Digital Finance","microfinance":"Microfinance","government":"Government & Public Sector"};
var gsHeader = ["// Patch for Phase 4 Global South areas","// Areas: islamic-finance, mobile-money, microfinance, government","// Generated: 2026-02-23","","import type { ModuleDefinition } from "../types";","",""].join("
");
var gsOut = buildPatch(gsAreas, gsNames, gsComments, gsHeader, "PHASE4_GLOBAL_SOUTH_MODULES");
fs.writeFileSync("C:/FCP_Workbench/src/lib/area-patches/phase4-global-south-patch.ts", gsOut);
console.log("global-south: " + gsOut.length + " chars");

// BOP
var bopAreas = ["government-services","smallholder-farming","micro-business","workers-rights","personal-finance-bop","credit-navigator","land-rights","consumer-protection","community-health","education-literacy","food-business","artisan-craft","livestock-poultry"];
var bopNames = {"government-services":"GOVERNMENT_SERVICES_MODULES","smallholder-farming":"SMALLHOLDER_FARMING_MODULES","micro-business":"MICRO_BUSINESS_MODULES","workers-rights":"WORKERS_RIGHTS_MODULES","personal-finance-bop":"PERSONAL_FINANCE_BOP_MODULES","credit-navigator":"CREDIT_NAVIGATOR_MODULES","land-rights":"LAND_RIGHTS_MODULES","consumer-protection":"CONSUMER_PROTECTION_MODULES","community-health":"COMMUNITY_HEALTH_MODULES","education-literacy":"EDUCATION_LITERACY_MODULES","food-business":"FOOD_BUSINESS_MODULES","artisan-craft":"ARTISAN_CRAFT_MODULES","livestock-poultry":"LIVESTOCK_POULTRY_MODULES"};
var bopComments = {"government-services":"Government Services Navigator","smallholder-farming":"Smallholder Farming","micro-business":"Micro-Business","workers-rights":"Workers Rights","personal-finance-bop":"Personal Finance (BOP)","credit-navigator":"Credit Navigator","land-rights":"Land Rights","consumer-protection":"Consumer Protection","community-health":"Community Health","education-literacy":"Education & Literacy","food-business":"Food Business","artisan-craft":"Artisan & Craft","livestock-poultry":"Livestock & Poultry"};
var bopHeader = ["// Patch for Phase 4 BOP (Base-of-Pyramid) areas","// Areas: government-services, smallholder-farming, micro-business, workers-rights,","//        personal-finance-bop, credit-navigator, land-rights, consumer-protection,","//        community-health, education-literacy, food-business, artisan-craft, livestock-poultry","// Generated: 2026-02-23","","import type { ModuleDefinition } from "../types";","",""].join("
");
var bopOut = buildPatch(bopAreas, bopNames, bopComments, bopHeader, "PHASE4_BOP_MODULES");
fs.writeFileSync("C:/FCP_Workbench/src/lib/area-patches/phase4-bop-patch.ts", bopOut);
console.log("bop: " + bopOut.length + " chars");

console.log("All done.");