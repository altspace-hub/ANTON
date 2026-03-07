/**
 * patch-obligation-types.mjs
 * DATA-06: Adds obligation_type ("shall" | "may") to AMLR obligation entities.
 * DATA-07: Adds cross_references array to key entities.
 * Run: node data/knowledge-packs/amlr-2024/patch-obligation-types.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const entitiesPath = join(__dirname, 'entities.json');
const entities = JSON.parse(readFileSync(entitiesPath, 'utf-8'));

// DATA-06: obligation_type patches — based on AMLR text ("shall" = mandatory, "may" = discretionary)
const OBLIGATION_TYPES = {
  'OBL-CDD':     { obligation_type: 'shall', note: 'Art. 20: "obliged entities shall apply CDD measures"' },
  'OBL-EDD':     { obligation_type: 'shall', note: 'Art. 34: mandatory for listed triggers (HRTCs, PEPs, unusual transactions)' },
  'OBL-SDD':     { obligation_type: 'may',   note: 'Art. 31: "obliged entities may apply simplified due diligence" in lower-risk situations' },
  'OBL-UBO':     { obligation_type: 'shall', note: 'Art. 22: "obliged entities shall identify and take reasonable measures to verify the identity of the beneficial owner"' },
  'OBL-PEP':     { obligation_type: 'shall', note: 'Art. 44: mandatory enhanced scrutiny — no discretion once PEP status confirmed' },
  'OBL-SAR':     { obligation_type: 'shall', note: 'Art. 69: "obliged entities shall promptly report" — absolute obligation' },
  'OBL-RBA':     { obligation_type: 'shall', note: 'Art. 8: "obliged entities shall take appropriate steps to identify, assess and understand the risks"' },
  'OBL-BWRA':    { obligation_type: 'shall', note: 'Art. 10: written BWRA is mandatory' },
  'OBL-TRAIN':   { obligation_type: 'shall', note: 'Art. 18: "obliged entities shall take measures to ensure that their employees are aware of the provisions"' },
  'OBL-MLRO':    { obligation_type: 'shall', note: 'Art. 11: appointment of compliance officer and MLRO is mandatory' },
  'OBL-DATA':    { obligation_type: 'shall', note: 'Art. 77: "obliged entities shall retain" CDD and transaction records' },
  'OBL-WIRE':    { obligation_type: 'shall', note: 'Art. 83: mandatory — payment service providers shall ensure information accompanies transfers' },
  'OBL-TPREL':   { obligation_type: 'may',   note: 'Art. 28: reliance on third parties is permitted but not required — discretionary' },
  'OBL-GROUP':   { obligation_type: 'shall', note: 'Art. 15: parent undertakings shall implement group-wide policies' },
  'OBL-CORR':    { obligation_type: 'shall', note: 'Art. 38: enhanced CDD on correspondent relationships is mandatory' },
  'OBL-MONITOR': { obligation_type: 'shall', note: 'Art. 25: "obliged entities shall monitor the business relationship on an ongoing basis"' },
  'OBL-CUST':    { obligation_type: 'shall', note: 'Art. 21: identification and verification is mandatory' },
  'OBL-ANON':    { obligation_type: 'shall', note: 'Art. 79: prohibition — no discretion' },
  'OBL-SANC':    { obligation_type: 'shall', note: 'Art. 17: written internal controls programme is mandatory' },
  'AMLR-A3':     { obligation_type: 'shall', note: 'Designates who is subject to AMLR — non-discretionary' },
  'AMLR-A4':     { obligation_type: 'may',   note: 'Art. 4: Member States MAY exempt limited-activity persons' },
  'AMLR-A12':    { obligation_type: 'shall', note: 'Art. 12: management body SHALL bear responsibility' },
};

// DATA-07: cross-reference patches — articles that reference each other
const CROSS_REFERENCES = {
  'OBL-CDD':     ['AMLR-Art-21', 'AMLR-Art-22', 'AMLR-Art-25', 'AMLR-Art-28', 'AMLR-Art-31', 'AMLR-Art-34'],
  'OBL-EDD':     ['AMLR-Art-20', 'AMLR-Art-44', 'AMLR-Art-38', 'DEF-HRTC'],
  'OBL-SDD':     ['AMLR-Art-20', 'OBL-EDD'],
  'OBL-UBO':     ['DEF-BO', 'DEF-Trust', 'AMLR-Art-20'],
  'OBL-PEP':     ['DEF-PEP', 'DEF-PEPFAM', 'OBL-EDD'],
  'OBL-SAR':     ['DEF-FIU', 'AMLR-Art-25'],
  'OBL-BWRA':    ['OBL-RBA', 'DEF-SNRA', 'DEF-NRA', 'AMLR-Art-12'],
  'OBL-RBA':     ['OBL-BWRA', 'DEF-SNRA', 'DEF-NRA'],
  'OBL-TRAIN':   ['OBL-MLRO', 'AMLR-Art-12'],
  'OBL-MLRO':    ['OBL-TRAIN', 'AMLR-Art-12', 'OBL-SANC'],
  'OBL-TPREL':   ['OBL-CDD', 'OBL-UBO'],
  'OBL-GROUP':   ['AMLR-Art-12', 'OBL-SANC'],
  'OBL-CORR':    ['OBL-EDD', 'DEF-SHELL'],
  'OBL-MONITOR': ['OBL-CDD', 'OBL-SAR'],
  'OBL-WIRE':    ['THLD-WIRE', 'DEF-CASP'],
  'DEF-BO':      ['OBL-UBO', 'DEF-Trust'],
  'DEF-PEP':     ['OBL-PEP', 'DEF-PEPFAM', 'OBL-EDD'],
};

let patched = 0;
for (const entity of entities) {
  const oblPatch = OBLIGATION_TYPES[entity.ref_id];
  const xrefPatch = CROSS_REFERENCES[entity.ref_id];

  if (oblPatch || xrefPatch) {
    entity.metadata = entity.metadata ?? {};
    if (oblPatch) {
      entity.metadata.obligation_type = oblPatch.obligation_type;
      entity.metadata.obligation_type_note = oblPatch.note;
    }
    if (xrefPatch) {
      entity.metadata.cross_references = xrefPatch;
    }
    patched++;
  }
}

writeFileSync(entitiesPath, JSON.stringify(entities, null, 2));
console.log(`Patched ${patched} entities with obligation_type / cross_references.`);
console.log('Run: node data/knowledge-packs/build-pack.mjs amlr-2024  to rebuild the bundle');
