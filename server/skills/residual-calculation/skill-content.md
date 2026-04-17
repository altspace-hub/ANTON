# Residual Risk Calculation — deterministic rule

## The number is computed; the LLM never decides it

The residual score for any threat path is calculated by `atlas-residual-calculator.ts`. The same Atlas state always produces the same residual scores. The LLM's job is to produce the **rationale** around the number, not the number itself.

This is non-negotiable for audit defensibility. A regulator must be able to read the Atlas, see the inherent score, see the controls and their strengths, and compute the residual themselves and get the same answer. If the residual is LLM-judgement, two readings can produce different numbers and the institution cannot defend the calculation.

## The rule

```
residual_score = inherent_score − reduction(rollup)
clamped to [1, 5]

reduction =
  2  if rollup is 'strong'
  1  if rollup is 'adequate'
  0  if rollup is 'weak'
  0  if rollup is 'absent'  (no controls linked)
```

## The rollup rule

The rollup for a path is the **worst** strength across all controls linked to **any** vulnerability of the path.

Worst-of, not best-of, because:
- A path covered by one strong control + one weak control is, in practice, weak — the gap is exploitable
- Mirrors the inherent-max rule: chain is as weak as its weakest link
- Audit-readable: a regulator inspecting the matrix sees the weakest link first

Empty list of strengths → 'absent'.

## Worked examples

### Inherent 5, Strong rollup
- Reduction = 2
- Residual = 5 − 2 = 3
- Appetite position: boundary
- Rationale: "Inherent 5 (max of E/T/V). Controls: strong coverage → −2. Residual 3 → boundary appetite position."

### Inherent 5, Adequate rollup
- Reduction = 1
- Residual = 5 − 1 = 4
- Appetite position: outside
- Rationale: "Inherent 5. Controls: adequate coverage → −1. Residual 4 → outside appetite. A remediation programme is required at Stage 7."

### Inherent 4, Weak rollup
- Reduction = 0
- Residual = 4 − 0 = 4
- Appetite position: outside
- Rationale: "Inherent 4. Controls: weak coverage → no reduction. Residual 4 → outside appetite. The controls in place do not buy any risk reduction; the right move is to upgrade the weakest control or add a stronger one."

### Inherent 1, Strong rollup
- Reduction = 2
- Raw = 1 − 2 = −1
- **Clamped to 1**
- Appetite position: within
- Rationale: "Inherent 1. Controls: strong coverage → −2. Residual clamped to floor of 1 → within appetite."

### Inherent 5, multiple controls — one weak, three strong
- Rollup = weak (worst-of wins)
- Reduction = 0
- Residual = 5 − 0 = 5
- Appetite position: unacceptable
- Rationale: "Inherent 5. Three Strong controls and one Weak control attached to the path's vulnerabilities. Rollup is Weak (worst-of) → no reduction. Residual 5 → unacceptable. The Weak control needs upgrading or removing; without that, the Strong controls cannot reduce residual."

## Appetite bucket

| Residual | Appetite position | Action |
|---|---|---|
| 1 | within     | Monitor; no immediate action |
| 2 | within     | Monitor; no immediate action |
| 3 | boundary   | Act when cost-effective; watch flag |
| 4 | outside    | Act now; named owner + target date + budget |
| 5 | unacceptable | Stop trading on this path OR formally accept as tolerated non-compliance with named owner, end-state, timeline |

## When the user disagrees with the residual

The right move is NOT to adjust the residual. The right move is to:

1. Re-check the inherent sub-scores (Stage 4) — are exposure / threat / vulnerability scored correctly? If not, change one with a documented reason.
2. Re-check the control strengths (Stage 5) — is a control mis-classified? If so, change its strength with evidence.

The residual will recalculate automatically. If it still surprises, the Atlas is telling the user something they need to hear.

## What the LLM's rationale should contain

When producing the rationale around a calculated residual:

- The inherent score and its source (max of which sub-scores)
- The rollup and which controls drove it (especially if a single weak control sank an otherwise-strong rollup)
- The reduction applied
- The residual
- The appetite position and what it implies for action

Example rationale (Building Firm TP-6 from Addendum A1.6.1):
> Inherent 4 (max of E=4, T=4, V=4). Three controls attached to the path's vulnerabilities (cash-payment policy: weak; F-skatt verification: weak; written subcontractor contract: adequate). Rollup is weak (worst-of). Reduction 0. Residual 4 → outside appetite. The two weak controls should be upgraded before any reduction is claimed; a 90-day onboarding-checklist programme would lift them to adequate and bring residual to 3.

The LLM never says "I think residual is 3". The LLM says "the calculator returns 4 because the rollup is weak; here's what would change that."
