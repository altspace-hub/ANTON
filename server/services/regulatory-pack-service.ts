/**
 * regulatory-pack-service.ts — Tier 2 / Tier 3 regulatory artefact generators
 * + sign-off + pack completeness (Phase 7).
 *
 * Eight artefact kinds map to specific tier + flag conditions. Each kind has
 * a deterministic generator that produces a structured markdown skeleton
 * populated from the project + HKP + posture. ANTON does NOT certify any
 * artefact — these are templates the user signs as the responsible economic
 * operator under the relevant law (CRA / RED / MDR / GDPR / equivalent).
 *
 * Generator outputs are intentionally honest skeletons, NOT completed compliance
 * documents. They include explicit placeholders the operator must complete and
 * inline notes flagging where lawyer review is mandatory before sign-off.
 */

import { createHash } from 'crypto';
import type { DatabaseAdapter } from '../db/database.js';

// ── Vocabulary ────────────────────────────────────────────────────────────────

export type ArtefactKind =
  | 'cra-tech-file'
  | 'doc'
  | 'vdp'
  | 'hazard-analysis'
  | 'red-declaration'
  | 'mdr-classification'
  | 'dpa'
  | 'workplace-safety';

export type ArtefactStatus = 'draft' | 'generated' | 'user-reviewed' | 'signed-off' | 'withdrawn';
export type RequiredWhen = 'always' | 'medical-adjacent' | 'safety-critical' | 'rf-transmitter';

export interface ArtefactRequirement {
  kind: ArtefactKind;
  title: string;
  required_for_tier: 1 | 2 | 3;
  required_when: RequiredWhen;
  why: string;        // one-line plain language reason
}

const ARTEFACT_REGISTRY: ArtefactRequirement[] = [
  { kind: 'dpa',                 title: 'Data Protection Assessment',                required_for_tier: 2, required_when: 'always',           why: 'Tier 2 internal use commonly handles personal or pseudo-anonymised data — GDPR / equivalent baseline.' },
  { kind: 'workplace-safety',    title: 'Workplace Safety Checklist',                required_for_tier: 2, required_when: 'always',           why: 'Tier 2 deployment introduces device into a workplace — local OHS regulations apply.' },
  { kind: 'cra-tech-file',       title: 'CRA Technical File Outline',                required_for_tier: 3, required_when: 'always',           why: 'EU Cyber Resilience Act requires a technical file documenting risk + mitigations for products with digital elements.' },
  { kind: 'doc',                 title: 'Declaration of Conformity',                 required_for_tier: 3, required_when: 'always',           why: 'CE marking requires a signed Declaration of Conformity referencing applicable directives / regulations.' },
  { kind: 'vdp',                 title: 'Vulnerability Disclosure Policy',           required_for_tier: 3, required_when: 'always',           why: 'CRA Annex I §2 + ENISA guidance require a documented vulnerability disclosure path.' },
  { kind: 'hazard-analysis',     title: 'Hazard Analysis',                           required_for_tier: 3, required_when: 'safety-critical',  why: 'Safety-critical / energy-storing / actuating products require ISO/IEC-style hazard analysis.' },
  { kind: 'red-declaration',     title: 'RED Compliance Declaration',                required_for_tier: 3, required_when: 'rf-transmitter',   why: 'EU Radio Equipment Directive 2014/53/EU applies to any device with intentional radio transmission (Wi-Fi, BT, BLE).' },
  { kind: 'mdr-classification',  title: 'MDR Classification Advisory',               required_for_tier: 3, required_when: 'medical-adjacent', why: 'Devices touching a patient or generating clinical data may fall under MDR — classification advisory required before further conformity work.' },
];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RegulatoryArtefact {
  id: string;
  project_id: string;
  kind: ArtefactKind;
  title: string;
  required_for_tier: 1 | 2 | 3;
  required_when: RequiredWhen;
  status: ArtefactStatus;
  content_markdown: string | null;
  content_schema_version: string;
  generator_version: string | null;
  generator_inputs: Record<string, unknown> | null;
  signed_off_by: string | null;
  signed_off_at: string | null;
  signoff_attestation: string | null;
  withdrawn_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RequiredArtefactStatus {
  requirement: ArtefactRequirement;
  /** Present only if a row exists. */
  artefact: RegulatoryArtefact | null;
}

export interface PackCompletenessSummary {
  required_total: number;
  signed_off: number;
  user_reviewed: number;
  generated: number;
  missing: number;
  blockers: string[];           // human-readable reason per missing / unsigned artefact
  ready_to_ship: boolean;       // true iff every required artefact is signed-off
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value as T;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

function rowToArtefact(r: Record<string, unknown>): RegulatoryArtefact {
  return {
    id: r.id as string,
    project_id: r.project_id as string,
    kind: r.kind as ArtefactKind,
    title: r.title as string,
    required_for_tier: Number(r.required_for_tier) as 1 | 2 | 3,
    required_when: r.required_when as RequiredWhen,
    status: r.status as ArtefactStatus,
    content_markdown: (r.content_markdown as string | null) ?? null,
    content_schema_version: r.content_schema_version as string,
    generator_version: (r.generator_version as string | null) ?? null,
    generator_inputs: parseJson(r.generator_inputs, null),
    signed_off_by: (r.signed_off_by as string | null) ?? null,
    signed_off_at: (r.signed_off_at as string | null) ?? null,
    signoff_attestation: (r.signoff_attestation as string | null) ?? null,
    withdrawn_at: (r.withdrawn_at as string | null) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}

// ── Required-by logic ────────────────────────────────────────────────────────

interface ProjectFlags {
  family_id: string;
  tier: 1 | 2 | 3;
  safety_critical: boolean;
  medical_adjacent: boolean;
}

function isRfTransmitter(family_id: string): boolean {
  // Conservative default: any embedded family with on-board radios needs RED.
  // ESP32 has Wi-Fi + BT; nRF52 has BT; STM32 / RP2040 / Arduino UNO do not by default.
  return ['esp32', 'nrf52'].includes(family_id);
}

function isRequirementApplicable(req: ArtefactRequirement, flags: ProjectFlags): boolean {
  if (flags.tier < req.required_for_tier) return false;
  switch (req.required_when) {
    case 'always': return true;
    case 'medical-adjacent': return flags.medical_adjacent;
    case 'safety-critical': return flags.safety_critical;
    case 'rf-transmitter':  return isRfTransmitter(flags.family_id);
  }
}

export function listRequirementsFor(flags: ProjectFlags): ArtefactRequirement[] {
  return ARTEFACT_REGISTRY.filter(r => isRequirementApplicable(r, flags));
}

// ── Generators ────────────────────────────────────────────────────────────────

interface GeneratorContext {
  project: {
    id: string; title: string; description: string | null;
    family_id: string; tier: 1 | 2 | 3;
    region: string | null; working_language: string;
    safety_critical: boolean; medical_adjacent: boolean;
    metadata: Record<string, unknown>;
  };
  hkp: {
    id: string;
    manufacturer: string;
    part_number: string;
    revision: string | null;
  } | null;
  posture: Record<string, unknown>;
  generated_at: string;
}

const GENERATOR_VERSION = '1.0.0';

function header(ctx: GeneratorContext, kind: string): string {
  return `# ${kind} — ${ctx.project.title}

> **Skeleton generated by ANTON ${GENERATOR_VERSION} on ${ctx.generated_at.slice(0, 10)}.**
> ANTON does **not** certify this artefact. The user is the responsible economic operator
> under the applicable law and must review, complete every \`[…]\` placeholder, obtain
> independent legal review where required, and sign off explicitly before the device may
> be placed on the market or distributed.

## Project context (from Phase 0 classification)

| Field | Value |
|---|---|
| Project | ${ctx.project.title} |
| Hardware family | ${ctx.project.family_id} |
| Hardware reference | ${ctx.hkp ? `${ctx.hkp.manufacturer} ${ctx.hkp.part_number}${ctx.hkp.revision ? ` rev ${ctx.hkp.revision}` : ''}` : '(no HKP attached)'} |
| Tier | ${ctx.project.tier} |
| Region of deployment | ${ctx.project.region ?? '[…]'} |
| Working language | ${ctx.project.working_language} |
| Safety-critical | ${ctx.project.safety_critical ? 'YES' : 'no'} |
| Medical-adjacent | ${ctx.project.medical_adjacent ? 'YES' : 'no'} |
`;
}

function generateCraTechFile(ctx: GeneratorContext): string {
  return `${header(ctx, 'CRA Technical File Outline')}

## 1. Product description

[Describe the product, its intended use, intended users, and intended environment.]

- **Product name:** ${ctx.project.title}
- **Hardware:** ${ctx.hkp ? `${ctx.hkp.manufacturer} ${ctx.hkp.part_number}` : '[…]'}
- **Software stack:** ESP-IDF / Arduino-ESP32 [version], application firmware [version]
- **Cybersecurity functions present:** [secure boot v2, flash encryption, signed OTA, …]

## 2. Scope under the CRA (Regulation (EU) 2024/2847)

[Confirm the product is a "product with digital elements" within scope. Identify any class
exemptions and document the rationale.]

- Default critical-importance class: **Class I** unless flagged otherwise (Annex III).
- Class II / III requires conformity assessment by a notified body.

## 3. Risk assessment

Reference: \`hw-develop-architecture\` and project FMEA artefact.

| Risk ID | Threat | Likelihood | Impact | Mitigation present | Residual |
|---|---|---|---|---|---|
| R-1 | [Threat description, e.g. "remote code execution via OTA"] | […] | […] | [Signed OTA + verified boot, see § 6] | […] |
| R-2 | […] | […] | […] | […] | […] |

## 4. Essential cybersecurity requirements (Annex I §1)

For each requirement, document the implemented measure + evidence.

- **§1(1) Designed without known exploitable vulnerabilities** — evidence: SBOM + CVE scan results from quality pipeline run [run id].
- **§1(2) Secure-by-default configuration** — evidence: [factory config, no default passwords, …].
- **§1(3) Protection from unauthorised access** — evidence: [access controls, key management, …].
- **§1(4) Confidentiality of stored / transmitted data** — evidence: [TLS, flash encryption, …].
- **§1(5) Integrity of stored / transmitted data** — evidence: [signed updates, message authentication, …].
- **§1(6) Process only data that is adequate and relevant** — evidence: [data minimisation analysis, link to DPA artefact].
- **§1(7) Resilience to attacks affecting availability** — evidence: [watchdog, brownout, fail-safe modes].
- **§1(8) Minimise attack surface** — evidence: [unused services disabled, network surfaces documented].
- **§1(9) Mitigate impact of incident** — evidence: [recovery procedure, log retention, see VDP artefact].

## 5. Vulnerability handling (Annex I §2)

See linked **Vulnerability Disclosure Policy** artefact. Process must include:
- 24h coordinated disclosure decision after a vulnerability is reported
- Without-undue-delay distribution of security updates
- Public list of advisories with severity + remediation

## 6. Secure update chain

| Property | Configured | Evidence |
|---|---|---|
| Signed images | [YES/NO] | sdkconfig CONFIG_SECURE_BOOT_V2_ENABLED |
| Verified boot | [YES/NO] | sdkconfig CONFIG_SECURE_BOOT |
| Anti-rollback | [YES/NO] | sdkconfig CONFIG_BOOTLOADER_APP_ANTI_ROLLBACK |
| Flash encryption | [YES/NO] | sdkconfig CONFIG_SECURE_FLASH_ENC_ENABLED |

## 7. Conformity assessment route

- Self-assessment (Class I, Annex VIII §1) — applicable here unless promoted to Class II/III.
- [If Class II/III: notified body details, audit reference numbers]

## 8. Post-market surveillance

- CVE feed monitoring: ANTON Hardware Build lifecycle layer (NVD + GHSA + Espressif advisories).
- Field-failure capture: diagnostic_cases contributions.
- User reporting channel: [contact + URL — must match the VDP artefact].

## 9. Linked artefacts

- Declaration of Conformity (DoC) — \`/hardware/projects/${ctx.project.id}/regulatory/doc\`
- Vulnerability Disclosure Policy — \`/hardware/projects/${ctx.project.id}/regulatory/vdp\`
- Hazard analysis (if applicable) — \`/hardware/projects/${ctx.project.id}/regulatory/hazard-analysis\`
- RED declaration (if RF) — \`/hardware/projects/${ctx.project.id}/regulatory/red-declaration\`

---

**Lawyer review required before sign-off.**
`;
}

function generateDoc(ctx: GeneratorContext): string {
  return `${header(ctx, 'Declaration of Conformity')}

## EU Declaration of Conformity

**Manufacturer / responsible economic operator:** [Legal name]
**Address:** [Street, postcode, country]
**Authorised representative (if non-EU):** [Name + EU address]

This declaration of conformity is issued under the sole responsibility of the manufacturer.

### Object of the declaration

| | |
|---|---|
| Product | ${ctx.project.title} |
| Trade name / model | [Model designation] |
| Type / batch / serial number | [Series identifier] |
| Hardware reference | ${ctx.hkp ? `${ctx.hkp.manufacturer} ${ctx.hkp.part_number}${ctx.hkp.revision ? ` rev ${ctx.hkp.revision}` : ''}` : '[…]'} |

### Applicable Union legislation

[Tick those that apply. ANTON has pre-flagged based on project context — verify each one.]

- [ ] **Regulation (EU) 2024/2847 — Cyber Resilience Act** ${ctx.project.tier >= 3 ? '✓ flagged applicable for Tier 3' : ''}
- [ ] **Directive 2014/53/EU — Radio Equipment Directive (RED)** ${isRfTransmitter(ctx.project.family_id) ? '✓ flagged applicable for RF-transmitting hardware family' : ''}
- [ ] **Directive 2014/30/EU — EMC Directive**
- [ ] **Directive 2014/35/EU — LVD** (only if mains-powered)
- [ ] **Directive 2011/65/EU — RoHS recast**
- [ ] **Regulation (EC) 1907/2006 — REACH**
- [ ] **Regulation (EU) 2017/745 — MDR** ${ctx.project.medical_adjacent ? '✓ flagged applicable — medical-adjacent project' : ''}

### Harmonised standards applied

[List the harmonised standards used to demonstrate conformity. Common candidates:]

- EN 18031-1:2024 (cybersecurity, essential requirements)
- EN 301 489-1 / -17 (EMC for radio equipment)
- EN 300 328 (Wi-Fi / BT 2.4 GHz)
- EN 62311 (RF exposure)
- EN 62368-1 (electrical safety, ICT)
- IEC 60601-1 (only if medical electrical)
- ISO 14971 (only if medical risk management)

### Notified Body (if applicable)

[Notified Body name + identification number, certificate reference. Self-assessment routes leave blank.]

### Signature

| Place | Date | Signed by |
|---|---|---|
| [City] | [YYYY-MM-DD] | [Full name + role] |

---

**Independent legal / notified body review strongly advised before signing.**
`;
}

function generateVdp(ctx: GeneratorContext): string {
  return `${header(ctx, 'Vulnerability Disclosure Policy')}

## 1. Scope

This policy covers vulnerabilities in **${ctx.project.title}** including the firmware,
on-device configuration, supplied companion applications, and any cloud services
operated by [Operator name] in support of the device.

## 2. Reporting channel

- **Email:** security@[your-domain] (PGP key: [fingerprint])
- **Web form:** [URL]
- **Coordinated disclosure platform:** [HackerOne / Bugcrowd / direct, choose one]

We commit to acknowledging receipt **within 72 hours** and providing a substantive
status update **within 14 days**.

## 3. Safe harbour

Researchers acting in good faith under this policy are not subject to legal action
under [applicable national law — the Computer Misuse Act / equivalent in your
jurisdiction]. This safe harbour applies to:

- Testing on devices the researcher owns or for which they have explicit owner consent.
- Testing that does not affect availability or integrity of services for other users.
- Disclosure to us **before** public disclosure (90-day default).

## 4. What we ask of researchers

- Provide a clear technical description, reproduction steps, and affected versions.
- Avoid accessing or modifying user data beyond what is necessary to demonstrate the issue.
- Allow us 90 days from acknowledgement before public disclosure (longer if remediation
  is not yet shipped to affected fleets).

## 5. What we commit to

- Assess every report and assign a **CVSS v3.1** score within 30 days.
- Issue a security update or formal mitigation guidance for any confirmed vulnerability
  with CVSS ≥ 7.0 within **90 days** (CRA Annex I §2).
- Publish a security advisory in [public location — GitHub repo, vendor security page]
  with severity, affected versions, mitigation, and credit to the reporter (with consent).
- Notify ENISA and any national authority where required (for example, NIS2 Article 23
  for incidents with significant impact).

## 6. Coordinated disclosure timeline

| Day | Action |
|---|---|
| 0 | Report received |
| 3 | Acknowledgement sent |
| 30 | CVSS score + initial assessment |
| 90 | Security update released OR formal mitigation published |
| 90+ | Public advisory (with reporter credit if consented) |

## 7. Out of scope

- Denial of service that requires more than three concurrent malicious clients on a single
  device.
- Issues affecting end-of-life device versions older than [date].
- Social-engineering attacks against our staff.

---

**This policy must be linked from the device documentation, the company website, and the
DoC artefact. Lawyer review recommended before publication.**
`;
}

function generateHazardAnalysis(ctx: GeneratorContext): string {
  return `${header(ctx, 'Hazard Analysis')}

## 1. Methodology

This analysis uses the IEC 61508 / ISO 14971 hybrid approach (industrial + medical risk),
selected because the project is${ctx.project.safety_critical ? ' safety-critical' : ''}${ctx.project.medical_adjacent ? ' and medical-adjacent' : ''}.

| Severity | Definition |
|---|---|
| Catastrophic | Death or permanent disabling injury |
| Critical | Severe injury or major property damage |
| Marginal | Minor injury or significant data loss |
| Negligible | Inconvenience, recoverable data loss, no physical harm |

| Probability | Definition (per device per year) |
|---|---|
| Frequent | > 1 |
| Probable | 0.1 – 1 |
| Occasional | 0.01 – 0.1 |
| Remote | 0.001 – 0.01 |
| Improbable | 0.0001 – 0.001 |
| Incredible | < 0.0001 |

## 2. Hazard register

For each hazard, document the cause(s), effects, severity, probability, mitigations
present, residual risk, and verification method.

| ID | Hazard | Cause | Effect | Sev | Prob | Mitigations | Residual |
|---|---|---|---|---|---|---|---|
| H-1 | [e.g. "Sensor reports incorrect value to clinician"] | [Cause] | [Effect] | [Sev] | [Prob] | [Mitigations] | [Residual sev/prob] |
| H-2 | […] | […] | […] | […] | […] | […] | […] |

## 3. Standards applied

- **IEC 61508-1:2010** — Functional safety of E/E/PE safety-related systems, general
- ${ctx.project.medical_adjacent ? '**ISO 14971:2019** — Medical device risk management' : '[ISO 14971 not selected — confirm if medical applicability changes]'}
- **EN ISO 13849-1:2023** — Safety of machinery (only if machinery context)
- **IEC 62304:2006+A1:2015** — Medical software lifecycle (if SaMD)

## 4. Verification & validation

[For each hazard, the verification method must be documented. Examples:]

- Code review for safety-critical paths (paths identified in firmware design doc).
- Static analysis (Clang-tidy + MISRA-C subset) — see quality pipeline run [id].
- Hardware-in-the-loop test for sensor accuracy across operating envelope.
- FMEA on supply / actuator chain.

## 5. Safe-state behaviour

The device shall enter the **safe state** when any of the following is detected:

- Watchdog timeout
- Brownout assertion
- Sensor self-test failure
- Loss of communication with [redundancy / supervisor] for > [N] seconds

Safe-state definition: [Document the safe state for THIS product. Examples: outputs at
zero, audible alarm, fail-locked, fail-open. Be specific.]

## 6. Residual risk acceptance

Each hazard with residual risk above [chosen threshold] requires explicit operator
acceptance, signed by [Quality / Safety officer name].

---

**Independent safety review (and clinical review if medical-adjacent) required before sign-off.**
`;
}

function generateRedDeclaration(ctx: GeneratorContext): string {
  return `${header(ctx, 'RED Compliance Declaration')}

## Radio Equipment Directive 2014/53/EU — declaration

This declaration covers the device's compliance with the essential requirements of
Directive 2014/53/EU.

### Identification

- Product: ${ctx.project.title}
- Hardware: ${ctx.hkp ? `${ctx.hkp.manufacturer} ${ctx.hkp.part_number}${ctx.hkp.revision ? ` rev ${ctx.hkp.revision}` : ''}` : '[…]'}
- Module FCC ID: ${(ctx.hkp && (ctx.hkp as { fcc_id?: string }).fcc_id) ?? '[from HKP metadata.fcc_id]'}

### Article 3.1(a) — Health and safety

[Reference EN 62311 (RF exposure) test report.]

- **Conducted RF exposure assessment:** [test lab name + report ref]
- **Operating distance from human body:** [mm or m]

### Article 3.1(b) — Electromagnetic compatibility

[Reference EN 301 489-1 + -17 test reports.]

- EMC test lab: [name + accreditation]
- Test report reference: […]

### Article 3.2 — Effective use of the radio spectrum

[Reference EN 300 328 (Wi-Fi / BT 2.4 GHz) and / or EN 300 893 (BT high-rate) etc.]

- Frequency band(s): [2400-2483.5 MHz for Wi-Fi/BT]
- Maximum EIRP: [from module datasheet — see HKP claim \`wifi.max_tx_power_dbm\`]
- Modulation(s): [OFDM, GFSK, etc.]

### Article 3.3 — Additional essential requirements (delegated acts)

[CRA cyber resilience requirements now apply as delegated acts under Article 3(3)(d-f).
Reference the CRA Technical File artefact.]

### Module integrator note

If using a pre-certified Espressif module, the module's existing FCC / RED certification
applies under the conditions stated in Espressif's integration guide. Verify:

- Antenna does not deviate from the certified design.
- The host product does not introduce additional radio emissions.
- The module ID is visible on the product or in product documentation.

---

**Notified body engagement may be required if any of the conditions above are not met.
Lawyer + EMC / RF lab review required before sign-off.**
`;
}

function generateMdrClassification(ctx: GeneratorContext): string {
  return `${header(ctx, 'MDR Classification Advisory')}

## EU MDR (Regulation (EU) 2017/745) classification advisory

**This is an advisory document, not a final classification decision.** The economic
operator (manufacturer) is responsible for the final classification under MDR Annex VIII
and must obtain notified body confirmation for Class IIa+ devices.

### Step 1 — Is this a medical device under MDR Article 2(1)?

A medical device is any "instrument, apparatus … intended by the manufacturer to be
used … for human beings for one or more of the following specific medical purposes":

- diagnosis, prevention, monitoring, prediction, prognosis, treatment, alleviation of disease
- diagnosis, monitoring, alleviation, compensation for an injury or disability
- investigation, replacement or modification of anatomy / physiological process / pathological state
- providing information by examination of specimens

[Document the project's intended use against this list. If none apply, the device is NOT
a medical device under MDR — but see SaMD / wellness boundary in Step 2.]

### Step 2 — Is this software a Software as a Medical Device (SaMD)?

If the firmware processes information to inform a clinical decision (even indirectly),
it is likely SaMD per the IMDRF / MDR §11. Apply the IMDRF SaMD risk framework:

| Significance of information | Healthcare situation severity |
|---|---|
| Treat / diagnose | High → Class IIa or higher |
| Drive clinical management | Mid → Class IIa |
| Inform clinical management | Low |
| ... | ... |

### Step 3 — Apply MDR Annex VIII classification rules

The 22 classification rules in Annex VIII determine the final class.

**Project-specific candidate rules:**

- **Rule 11** (software intended to provide information used for diagnostic or therapeutic
  purposes): Class IIa if information could lead to inappropriate decisions causing
  serious deterioration. Class III if death / irreversible harm.
- **Rule 9** (active therapeutic devices intended to administer or exchange energy):
  Class IIa, escalating to IIb / III based on energy mode.
- **Rule 10** (active devices intended for diagnosis or monitoring of vital physiological
  processes): Class IIa, IIb if continuous monitoring with critical decision implications.

[For each candidate rule, document the project's relationship to the rule.]

### Recommended next steps

1. Confirm intended use with clinical / medical-affairs lead.
2. If MDR applies, engage a Notified Body BEFORE design freeze (the conformity assessment
   route depends on class).
3. Build the **Clinical Evaluation Plan** per MDR Article 61.
4. Build the **Quality Management System** per ISO 13485 (a notified body requirement
   for Class IIa+).
5. Build the **Post-Market Surveillance Plan** per MDR Article 83.

---

**MDR mis-classification carries severe regulatory + product-liability consequences.
Independent regulatory review by an MDR-experienced expert is mandatory before sign-off.**
`;
}

function generateDpa(ctx: GeneratorContext): string {
  return `${header(ctx, 'Data Protection Assessment')}

## GDPR / equivalent — data protection assessment

Mandatory for Tier 2 + Tier 3 deployments that process personal data, even if pseudo-anonymised.

### 1. Processing activities

| Activity | Personal data category | Source | Storage location | Retention |
|---|---|---|---|---|
| [e.g. "Telemetry from device"] | [None / pseudo / personal] | [Sensor / user input] | [On-device / cloud / both] | [N days] |
| [e.g. "Diagnostic case contributions"] | [Pseudo (contributor id)] | [User submission] | [ANTON DB] | [Indefinite or N days] |

### 2. Article 6 GDPR — legal basis

[For each personal data processing activity, document the legal basis. Pick ONE per
activity from: consent (a), contract (b), legal obligation (c), vital interest (d),
public interest (e), legitimate interest (f).]

| Activity | Legal basis | Justification |
|---|---|---|
| […] | […] | […] |

If legal basis is **consent**, document how consent is captured, what users are told,
how consent is withdrawn, and how withdrawal is honoured.

If legal basis is **legitimate interest**, document the legitimate interest assessment
(LIA) — purpose, necessity, balancing test.

### 3. Article 5 GDPR — data minimisation + storage limitation

For each data category, document:
- Why the device needs this data (necessity test)
- The minimum granularity required
- The minimum retention period
- The deletion mechanism

### 4. Cross-border transfers

If any personal data leaves the EEA, document:
- Recipient country
- Transfer mechanism (adequacy decision, SCCs, BCRs)
- Supplementary measures post-Schrems II

### 5. Data subject rights

The device + supporting services must enable the following rights:

| Right | How implemented | Maximum response time |
|---|---|---|
| Access (Art 15) | […] | 1 month |
| Rectification (Art 16) | […] | 1 month |
| Erasure (Art 17) | […] | 1 month |
| Portability (Art 20) | […] | 1 month |
| Objection (Art 21) | […] | 1 month |

### 6. DPO consultation

| | |
|---|---|
| DPO name | [Name + contact] |
| DPO consulted on this assessment | [YES/NO + date] |
| DPO recommendations | [Summary or "no recommendations"] |

### 7. DPIA trigger assessment

Is a Data Protection Impact Assessment (Article 35) required?

- [ ] Systematic and extensive evaluation including profiling
- [ ] Large-scale processing of special categories (Art 9) or criminal data (Art 10)
- [ ] Systematic monitoring of publicly accessible area on a large scale
- [ ] National DPA list for mandatory DPIA (verify per Member State)

If any box is ticked, a full DPIA must be completed (separate artefact). Link below:

- DPIA reference: [N/A or link]

---

**DPO + lawyer review required before sign-off if any cross-border transfer or special
category data is involved.**
`;
}

function generateWorkplaceSafety(ctx: GeneratorContext): string {
  return `${header(ctx, 'Workplace Safety Checklist')}

## Tier 2 internal-use — workplace safety baseline

This checklist covers the minimum workplace safety considerations for deploying
**${ctx.project.title}** inside an organisation. Local Occupational Health & Safety
regulations may add further requirements.

### 1. Electrical safety

- [ ] All mains-powered components are CE / UL marked.
- [ ] Cabling is rated for the installation environment (indoor / outdoor / wet).
- [ ] Fuses / circuit breakers sized appropriately upstream.
- [ ] No exposed mains conductors after enclosure closure.
- [ ] Earthing / bonding verified per local code.

### 2. Mechanical safety

- [ ] No exposed sharp edges or pinch points.
- [ ] Mounting hardware rated for the device weight × safety factor (≥ 4× recommended).
- [ ] Drop / impact testing per IEC 60068-2-31 (if mobile).

### 3. Thermal safety

- [ ] Surface temperatures stay within EN 563 limits for foreseeable contact duration.
- [ ] Hot-surface labelling applied where temperature exceeds 65 °C.
- [ ] Vent slots not blocked by typical workplace deployment scenarios.

### 4. Battery / energy storage (if applicable)

- [ ] Battery selected from a UN 38.3 / IEC 62133 certified supplier.
- [ ] Battery management system implements over-current, over-temperature, and over-voltage protection.
- [ ] Battery is end-user replaceable OR a take-back path is documented.

### 5. RF exposure (RF transmitter present: ${isRfTransmitter(ctx.project.family_id) ? 'YES' : 'no'})

${isRfTransmitter(ctx.project.family_id)
  ? `- [ ] EN 62311 RF exposure assessment completed.\n- [ ] Minimum operating distance documented in user manual.\n- [ ] RF compliance label applied to product.`
  : '- This project does not transmit RF — section not applicable.'}

### 6. Operator training

- [ ] Operator training material exists in the working language (${ctx.project.working_language}).
- [ ] Lockout / tagout procedure documented for installation + maintenance.
- [ ] Emergency stop / safe-state behaviour documented and trained.

### 7. Incident reporting

- [ ] Local incident reporting channel identified.
- [ ] Internal escalation contact: [Name + role + email].
- [ ] Customer-facing incident path: [URL or phone — must match VDP if cyber-related].

### 8. Personal protective equipment

- [ ] Required PPE for installation: [list]
- [ ] Required PPE for maintenance: [list]

---

**Local OHS officer review required for any workplace deployment.**
`;
}

function generateForKind(ctx: GeneratorContext, kind: ArtefactKind): string {
  switch (kind) {
    case 'cra-tech-file':       return generateCraTechFile(ctx);
    case 'doc':                 return generateDoc(ctx);
    case 'vdp':                 return generateVdp(ctx);
    case 'hazard-analysis':     return generateHazardAnalysis(ctx);
    case 'red-declaration':     return generateRedDeclaration(ctx);
    case 'mdr-classification':  return generateMdrClassification(ctx);
    case 'dpa':                 return generateDpa(ctx);
    case 'workplace-safety':    return generateWorkplaceSafety(ctx);
  }
}

// ── Service ───────────────────────────────────────────────────────────────────

export interface AssessPackInput { project_id: string; }

export function createRegulatoryPackService(db: DatabaseAdapter) {

  async function loadProjectAndHkp(projectId: string): Promise<GeneratorContext> {
    const proj = await db.get(
      `SELECT id, title, description, family_id, tier, region, working_language,
              safety_critical, medical_adjacent, hkp_id, metadata
       FROM hardware_projects WHERE id = ?`,
      projectId,
    ) as Record<string, unknown> | undefined;
    if (!proj) throw new Error('Project not found');

    const metadata = parseJson(proj.metadata, {} as Record<string, unknown>);
    const posture = (metadata.posture as Record<string, unknown> | undefined) ?? {};

    let hkp: GeneratorContext['hkp'] = null;
    if (proj.hkp_id) {
      const r = await db.get(
        `SELECT id, manufacturer, part_number, revision, metadata FROM hardware_knowledge_packs WHERE id = ?`,
        proj.hkp_id as string,
      ) as Record<string, unknown> | undefined;
      if (r) {
        const meta = parseJson(r.metadata, {} as Record<string, unknown>);
        hkp = {
          id: r.id as string,
          manufacturer: r.manufacturer as string,
          part_number: r.part_number as string,
          revision: (r.revision as string | null) ?? null,
          ...meta,
        };
      }
    }

    return {
      project: {
        id: proj.id as string,
        title: proj.title as string,
        description: (proj.description as string | null) ?? null,
        family_id: proj.family_id as string,
        tier: Number(proj.tier) as 1 | 2 | 3,
        region: (proj.region as string | null) ?? null,
        working_language: proj.working_language as string,
        safety_critical: Boolean(proj.safety_critical),
        medical_adjacent: Boolean(proj.medical_adjacent),
        metadata,
      },
      hkp,
      posture,
      generated_at: new Date().toISOString(),
    };
  }

  async function listForProject(projectId: string): Promise<RequiredArtefactStatus[]> {
    const ctx = await loadProjectAndHkp(projectId);
    const reqs = listRequirementsFor({
      family_id: ctx.project.family_id,
      tier: ctx.project.tier,
      safety_critical: ctx.project.safety_critical,
      medical_adjacent: ctx.project.medical_adjacent,
    });

    const rows = await db.all(
      `SELECT * FROM hw_regulatory_artefacts WHERE project_id = ?`,
      projectId,
    ) as Array<Record<string, unknown>>;
    const byKind = new Map(rows.map(r => [r.kind as ArtefactKind, rowToArtefact(r)]));

    return reqs.map(req => ({
      requirement: req,
      artefact: byKind.get(req.kind) ?? null,
    }));
  }

  async function getArtefact(id: string): Promise<RegulatoryArtefact | null> {
    const r = await db.get('SELECT * FROM hw_regulatory_artefacts WHERE id = ?', id);
    return r ? rowToArtefact(r) : null;
  }

  async function generateOrRegenerate(input: { project_id: string; kind: ArtefactKind; actor_id: string }): Promise<RegulatoryArtefact> {
    const ctx = await loadProjectAndHkp(input.project_id);
    const reqs = listRequirementsFor({
      family_id: ctx.project.family_id,
      tier: ctx.project.tier,
      safety_critical: ctx.project.safety_critical,
      medical_adjacent: ctx.project.medical_adjacent,
    });
    const requirement = reqs.find(r => r.kind === input.kind);
    if (!requirement) {
      throw new Error(`Artefact kind '${input.kind}' is not required for this project's posture (tier=${ctx.project.tier}, family=${ctx.project.family_id}, safety_critical=${ctx.project.safety_critical}, medical_adjacent=${ctx.project.medical_adjacent})`);
    }

    const content = generateForKind(ctx, input.kind);
    const inputsSnapshot = {
      family_id: ctx.project.family_id,
      tier: ctx.project.tier,
      region: ctx.project.region,
      working_language: ctx.project.working_language,
      safety_critical: ctx.project.safety_critical,
      medical_adjacent: ctx.project.medical_adjacent,
      hkp_id: ctx.hkp?.id ?? null,
      generated_at: ctx.generated_at,
    };

    const existing = await db.get(
      `SELECT id, status FROM hw_regulatory_artefacts WHERE project_id = ? AND kind = ?`,
      input.project_id, input.kind,
    ) as { id: string; status: string } | undefined;

    let row: Record<string, unknown> | undefined;
    if (existing) {
      // Regenerate keeps the row but resets status to 'generated' (NOT signed-off);
      // an existing sign-off is preserved in audit trail and a 'regenerated' entry
      // is added so reviewers can see this artefact's content changed after sign-off.
      row = await db.get(
        `UPDATE hw_regulatory_artefacts
         SET content_markdown = ?, generator_version = ?, generator_inputs = ?,
             status = CASE WHEN status = 'signed-off' THEN 'generated' ELSE 'generated' END,
             signed_off_by = NULL, signed_off_at = NULL, signoff_attestation = NULL,
             updated_at = NOW()
         WHERE id = ? RETURNING *`,
        content, GENERATOR_VERSION, JSON.stringify(inputsSnapshot), existing.id,
      ) as Record<string, unknown> | undefined;
      await db.run(
        `INSERT INTO hw_regulatory_signoffs (artefact_id, action, actor_id, content_hash)
         VALUES (?, 'regenerated', ?, ?)`,
        existing.id, input.actor_id, sha256(content),
      );
    } else {
      row = await db.get(
        `INSERT INTO hw_regulatory_artefacts
          (project_id, kind, title, required_for_tier, required_when,
           status, content_markdown, generator_version, generator_inputs)
         VALUES (?, ?, ?, ?, ?, 'generated', ?, ?, ?) RETURNING *`,
        input.project_id, requirement.kind, requirement.title,
        requirement.required_for_tier, requirement.required_when,
        content, GENERATOR_VERSION, JSON.stringify(inputsSnapshot),
      ) as Record<string, unknown> | undefined;
    }

    if (!row) throw new Error('Failed to write regulatory artefact');
    return rowToArtefact(row);
  }

  async function updateContent(input: { artefact_id: string; actor_id: string; content_markdown: string }): Promise<RegulatoryArtefact | null> {
    const r = await db.get(
      `UPDATE hw_regulatory_artefacts
       SET content_markdown = ?,
           status = CASE WHEN status = 'signed-off' THEN 'user-reviewed' ELSE 'user-reviewed' END,
           signed_off_by = NULL, signed_off_at = NULL, signoff_attestation = NULL,
           updated_at = NOW()
       WHERE id = ? RETURNING *`,
      input.content_markdown, input.artefact_id,
    ) as Record<string, unknown> | undefined;
    if (!r) return null;
    await db.run(
      `INSERT INTO hw_regulatory_signoffs (artefact_id, action, actor_id, content_hash)
       VALUES (?, 'edited', ?, ?)`,
      input.artefact_id, input.actor_id, sha256(input.content_markdown),
    );
    return rowToArtefact(r);
  }

  async function signOff(input: { artefact_id: string; actor_id: string; attestation: string }): Promise<RegulatoryArtefact> {
    const existing = await db.get('SELECT content_markdown FROM hw_regulatory_artefacts WHERE id = ?', input.artefact_id) as { content_markdown: string | null } | undefined;
    if (!existing) throw new Error('Artefact not found');
    if (!existing.content_markdown || existing.content_markdown.trim().length < 50) {
      throw new Error('Cannot sign off an empty or trivial artefact — generate or write content first');
    }
    if (input.attestation.trim().length < 30) {
      throw new Error('Sign-off attestation text is too short — operator must affirm responsibility explicitly');
    }
    const r = await db.get(
      `UPDATE hw_regulatory_artefacts
       SET status = 'signed-off',
           signed_off_by = ?, signed_off_at = NOW(),
           signoff_attestation = ?, withdrawn_at = NULL,
           updated_at = NOW()
       WHERE id = ? RETURNING *`,
      input.actor_id, input.attestation.trim(), input.artefact_id,
    ) as Record<string, unknown> | undefined;
    if (!r) throw new Error('Failed to sign off');
    await db.run(
      `INSERT INTO hw_regulatory_signoffs (artefact_id, action, actor_id, attestation, content_hash)
       VALUES (?, 'signed-off', ?, ?, ?)`,
      input.artefact_id, input.actor_id, input.attestation.trim(), sha256(existing.content_markdown),
    );
    return rowToArtefact(r);
  }

  async function withdraw(input: { artefact_id: string; actor_id: string; reason?: string }): Promise<RegulatoryArtefact> {
    const r = await db.get(
      `UPDATE hw_regulatory_artefacts
       SET status = 'withdrawn', withdrawn_at = NOW(), updated_at = NOW()
       WHERE id = ? RETURNING *`,
      input.artefact_id,
    ) as Record<string, unknown> | undefined;
    if (!r) throw new Error('Failed to withdraw');
    await db.run(
      `INSERT INTO hw_regulatory_signoffs (artefact_id, action, actor_id, reason)
       VALUES (?, 'withdrawn', ?, ?)`,
      input.artefact_id, input.actor_id, input.reason ?? null,
    );
    return rowToArtefact(r);
  }

  async function listSignoffs(artefactId: string): Promise<Array<{ id: string; action: string; actor_id: string; attestation: string | null; reason: string | null; content_hash: string | null; occurred_at: string }>> {
    const rows = await db.all(
      `SELECT id, action, actor_id, attestation, reason, content_hash, occurred_at
       FROM hw_regulatory_signoffs WHERE artefact_id = ? ORDER BY occurred_at DESC`,
      artefactId,
    );
    return rows as Array<{ id: string; action: string; actor_id: string; attestation: string | null; reason: string | null; content_hash: string | null; occurred_at: string }>;
  }

  async function assessCompleteness(input: AssessPackInput): Promise<PackCompletenessSummary> {
    const list = await listForProject(input.project_id);
    let signed = 0, reviewed = 0, generated = 0, missing = 0;
    const blockers: string[] = [];
    for (const item of list) {
      if (!item.artefact) {
        missing++;
        blockers.push(`Missing: ${item.requirement.title} (${item.requirement.why})`);
        continue;
      }
      switch (item.artefact.status) {
        case 'signed-off': signed++; break;
        case 'user-reviewed':
          reviewed++;
          blockers.push(`${item.requirement.title} reviewed but not signed off — operator attestation required.`);
          break;
        case 'generated':
          generated++;
          blockers.push(`${item.requirement.title} generated but not opened by operator.`);
          break;
        case 'withdrawn':
          missing++;
          blockers.push(`${item.requirement.title} sign-off was withdrawn — re-generate or re-sign.`);
          break;
        case 'draft':
          generated++;
          blockers.push(`${item.requirement.title} is in draft state — generate or write content first.`);
          break;
      }
    }
    return {
      required_total: list.length,
      signed_off: signed,
      user_reviewed: reviewed,
      generated,
      missing,
      blockers,
      ready_to_ship: blockers.length === 0,
    };
  }

  return {
    listRequirementsFor,
    listForProject,
    getArtefact,
    generateOrRegenerate,
    updateContent,
    signOff,
    withdraw,
    listSignoffs,
    assessCompleteness,
    GENERATOR_VERSION,
  };
}

export type RegulatoryPackService = ReturnType<typeof createRegulatoryPackService>;
