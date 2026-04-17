# Threat-Path Methodology — the seven-stage causal chain

A risk picture is a causal story, not a matrix. The story has seven stages, in order. Each stage answers exactly one question. Every stage's output feeds the next.

## Stage 1 — Business Context & Exposure Map

**Question:** What in the business creates exposure?

**Output:** A list of exposure points — surfaces where harm could land. Each has a name, a description, and a category (service / customer_segment / channel / partner / geography / product / process / system). No scoring at this layer.

**Why first:** You cannot score risks against a business you haven't mapped. A bakery's exposures are different from a bank's; the rest of the chain depends on knowing them.

## Stage 2 — Threat Path Catalogue

**Question:** Which harm scenarios are credible?

**Output:** Named threat paths. Each is a short story: "fraudulent supplier sends an invoice and we pay it" or "ransomware encrypts our customer database". Each path links to one or more exposures from Stage 1.

**Why this format:** Categories ("operational risk", "cyber risk") tell management nothing. Paths ("a sanctioned PEP uses a nominee to acquire EU property through us") tell management exactly what to act on.

## Stage 3 — Vulnerability Register

**Question:** Which weaknesses make threats plausible?

**Output:** A list of specific weaknesses, each scored 1-5 on severity. Each vulnerability is linked to one or more threat paths it enables. Vulnerabilities are concrete ("no MFA on banking accounts"), not abstract ("weak access control").

## Stage 4 — Inherent Risk

**Question:** How severe is exposure before controls?

**Rule:** Per path, inherent = max(exposure_score, threat_credibility_score, vulnerability_score). All three on a 1-5 scale.

**Why max, not average or product:** The chain is as weak as its weakest link. Averaging hides the weak link; product overweights extremes. Max is conservative, defensible, and matches the way regulators and auditors read risk.

**Override discipline:** A user can revise a sub-score with a recorded reason. They cannot override the max rule. This becomes the audit trail.

## Stage 5 — Control–Vulnerability Matrix

**Question:** Which controls prevent, detect, or respond to which vulnerabilities, how strong are they, what evidence backs the strength claim?

**Output:** A matrix linking controls (prevent / detect / respond) to vulnerabilities. Each control has:
- A type (prevent / detect / respond) — one control can play multiple roles for different vulnerabilities
- A strength (Strong / Adequate / Weak)
- Evidence — required for "Strong"; UI refuses to mark Strong without evidence
- An owner role — controls without owners are not controls

**The three roles:**
- **Prevent**: stops the bad thing happening (locks, MFA, dual control, segregation of duties)
- **Detect**: tells you when it has happened (transaction monitoring, login alerts, restore tests, log review)
- **Respond**: helps you recover when it does (incident playbooks, backup restores, press protocols, insurance)

## Stage 6 — Residual Risk

**Question:** What's left after controls?

**Rule (deterministic):** residual = inherent − reduction(rollup), clamped to [1, 5].
- reduction = 2 if rollup is Strong
- reduction = 1 if rollup is Adequate
- reduction = 0 if rollup is Weak or Absent

**Rollup rule:** The rollup for a path is the WORST strength across all controls touching any of the path's vulnerabilities. One Weak control sinks the rollup. This mirrors the inherent-max rule.

**Why deterministic:** Audit defensibility. If the residual score depends on LLM judgement, two runs can produce different numbers and the regulator has no answer. The rationale around the score can be LLM-generated; the number cannot.

## Stage 7 — Risk Appetite & Escalation

**Question:** Is what's left acceptable, and what action follows?

**Bands:**
- 1-2 = within appetite (monitor, no immediate action)
- 3 = at boundary (act when cost-effective)
- 4 = outside appetite (act now; named owner, target date, budget)
- 5 = unacceptable (stop trading or formally accept as tolerated non-compliance with named owner, end-state, timeline)

**Sign-off requirement:** Stage 7 closes with a board-approvable statement (or owner self-attestation for SMEs). The Atlas cannot move from `draft` to `active` without this.

**Escalation triggers:** Standing rules that fire automatically — "any path reaches residual 5 → board notification within 5 business days", "regulator inspection finding → 5-day board brief", "control failure evidence → 10-day rescore".

## Universal mapping to other frameworks

The seven stages map cleanly onto:
- ISO 31000 + Bowtie (threats → top event → consequences, with preventive and recovery barriers)
- NIST CSF (Identify → Protect → Detect → Respond → Recover)
- FMEA / HAZOP (failure modes → causes → effects → controls)
- COSO ERM at board level (risk identification → assessment → response → appetite)
- HACCP in food safety (hazards → critical control points)

A pack can re-frame Stage 2 in terms of STRIDE or attack trees if the user invokes a cybersecurity framework. The underlying chain is the same.

## When in doubt

- Score conservatively. A regulator can defend "we knew this was a 4 and acted on it"; they cannot defend "we scored it 2 and got blindsided".
- Cite the rule. "The residual is 3 because the inherent is 5 and our controls roll up to Adequate" is the explanation. Not "I think 3 feels right."
- Document overrides. Anywhere the user departs from the calculator's recommendation, capture the reason. The trail is the defensibility.
- Evidence is the test. A Strong control claim without evidence is fiction. The Atlas exists to surface fictions and turn them into real controls or honest downgrades.
