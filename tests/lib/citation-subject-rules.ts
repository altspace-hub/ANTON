/**
 * Which articles can honestly carry a given obligation.
 *
 * Extracted from `regulatory-citation-integrity.test.ts` in Wave 7 so the
 * knowledge-pack guard can stand on the same table: the packs make the same
 * claims as the prompts, and two copies of this map would drift. A rule is a
 * statement about the regulation, checked against the framework files at test
 * time, so it cannot come to name an article that does not exist.
 */
export type FrameworkKey = 'AMLR' | 'MiCA';

export interface SubjectRule {
  framework: FrameworkKey;
  subject: RegExp;
  /** Every article that can honestly carry this obligation. */
  allowed: number[];
  why: string;
}

const seq = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

export const SUBJECT_RULES: readonly SubjectRule[] = [
  // --- AMLR, Chapter II: internal policies, procedures and controls ---------
  { framework: 'AMLR', subject: /business[- ]wide risk assessment|\bBWRA\b/i, allowed: [9, 10], why: 'Art. 10 is the business-wide risk assessment (Art. 9(2)(a)(i) requires the policy for it); Art. 16 is group-wide requirements' },
  { framework: 'AMLR', subject: /compliance (?:functions?|officer|manager)/i, allowed: [11], why: 'Art. 11 Compliance functions' },
  { framework: 'AMLR', subject: /\btraining\b|awareness of requirements/i, allowed: [11, 12], why: 'Art. 12 Awareness of requirements carries the training duty; Art. 18 is outsourcing' },
  { framework: 'AMLR', subject: /group[- ]wide/i, allowed: [16, 17], why: 'Arts. 16-17 are the group provisions' },
  { framework: 'AMLR', subject: /\boutsourc/i, allowed: [18], why: 'Art. 18 Outsourcing' },
  // --- AMLR, Chapter III: customer due diligence ---------------------------
  // Art. 36 is allowed alongside Art. 26 because a correspondent-banking prompt
  // naming "transaction monitoring of correspondent flows" is pointing at the
  // correspondent article, not mis-citing the general duty. The defects this
  // rule exists for cited Art. 50 (guidelines on reliance) and Art. 59
  // (identification of a class of beneficiaries), which stay out.
  { framework: 'AMLR', subject: /transaction monitoring|ongoing monitoring of (?:the )?(?:business relationship|customer)/i, allowed: [26, 36], why: 'Art. 26 Ongoing monitoring of the business relationship and of transactions' },
  { framework: 'AMLR', subject: /simplified due diligence|\bSDD\b/i, allowed: [33], why: 'Art. 33 Simplified due diligence measures' },
  { framework: 'AMLR', subject: /enhanced due diligence|\bEDD\b/i, allowed: seq(34, 46), why: 'enhanced due diligence is Chapter III Section 4, Arts. 34-46' },
  { framework: 'AMLR', subject: /correspondent/i, allowed: [36, 37, 38, 39], why: 'Arts. 36-39 are the correspondent block' },
  { framework: 'AMLR', subject: /shell (?:institution|bank)/i, allowed: [39], why: 'Art. 39 Prohibition of correspondent relationships with shell institutions' },
  // The PEP band is wide on purpose: Art. 2 defines the term, Art. 26(2)(a) sets
  // the one-year review cap for EDD customers, Art. 34 is the EDD trigger, and
  // Arts. 42-46 are the regime itself. Citing Art. 45 (persons who have CEASED
  // to be PEPs) for the live regime is a real defect this set cannot see — the
  // ARTICLE_CONTEXT_RULES below carry that one.
  { framework: 'AMLR', subject: /politically exposed|\bPEPs?\b/i, allowed: [2, 26, 34, ...seq(42, 46)], why: 'Arts. 42-46 are the PEP regime, Art. 2 the definition, Arts. 26/34 the review and EDD triggers' },
  { framework: 'AMLR', subject: /reliance on (?:other )?obliged entit|reliance on third part/i, allowed: [48, 49, 50], why: 'Arts. 48-50 Reliance on CDD performed by other obliged entities' },
  { framework: 'AMLR', subject: /high[- ]risk third countr/i, allowed: [29, 30, 31, 35], why: 'Arts. 29-31 identify them, Art. 35 sets the countermeasures' },
  // --- AMLR, Chapter IV: beneficial ownership ------------------------------
  { framework: 'AMLR', subject: /beneficial owner|\bUBOs?\b/i, allowed: [2, 20, 22, 24, ...seq(51, 68)], why: 'defined in Art. 2, verified under Arts. 20/22/24, identified in Chapter IV (Arts. 51-68)' },
  // --- AMLR, Chapter V: reporting ------------------------------------------
  { framework: 'AMLR', subject: /tipping[- ]off|prohibition of disclosure/i, allowed: [73], why: 'Art. 73 Prohibition of disclosure; Art. 72 is disclosure TO the FIU' },
  { framework: 'AMLR', subject: /suspicious (?:activity|transaction) report|\bSARs?\b|\bSTRs?\b|reporting of suspicions/i, allowed: seq(69, 74), why: 'Chapter V, Arts. 69-74' },
  // --- AMLR, Chapter VII: record retention ---------------------------------
  { framework: 'AMLR', subject: /record[- ](?:keeping|retention)|retention (?:obligation|period|mechanism)|\d[- ]year retention/i, allowed: [76, 77, 78], why: 'Chapter VII: Art. 77 Record retention, Art. 78 provision of records' },

  // --- MiCA -----------------------------------------------------------------
  { framework: 'MiCA', subject: /market abuse/i, allowed: seq(86, 92), why: 'Title VI, Arts. 86-92' },
  { framework: 'MiCA', subject: /custody and administration/i, allowed: [70, 75], why: 'Art. 75 is the service; Art. 70 is safekeeping of client assets' },
  { framework: 'MiCA', subject: /business continuity|continuity and regularity/i, allowed: [68, 74], why: 'Art. 68(7) continuity; Art. 74 is the orderly wind-down' },
  { framework: 'MiCA', subject: /significant asset-referenced|significant ARTs?\b/i, allowed: seq(43, 45), why: 'Title III Chapter 5, Arts. 43-45' },
  { framework: 'MiCA', subject: /significant e-money|significant EMTs?\b/i, allowed: [43, ...seq(56, 58)], why: 'Title IV Chapter 2, Arts. 56-58 — Art. 56 classifies EMTs by applying the Art. 43(1) criteria' },
  { framework: 'MiCA', subject: /\bICT\b|security polic/i, allowed: [68], why: 'Art. 68(8) carries the ICT duty by applying Regulation (EU) 2022/2554; Art. 75 is the custody service' },
  { framework: 'MiCA', subject: /record[- ]keeping|records? (?:to be )?kept|\d[- ]year retention/i, allowed: [68], why: 'Art. 68(9) is the CASP record-keeping duty; Art. 76 is the operation of a trading platform' },
];
