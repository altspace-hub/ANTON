# UK ECCTA Test Corpus

Curated test corpus for the **UK ECCTA Reasonable Procedures Mapping** playbook (`uk-eccta-reasonable-procedures`).

The playbook scores documents against the six Home Office reasonable-procedures principles for ECCTA s.199 (Failure to Prevent Fraud, in force 1 September 2025) plus one reporting/whistleblower cell — 12 scoring columns total.

## Files

| File | Purpose |
|---|---|
| `sources.json` | Structured inventory of 14 documents with URLs, sectors, expected scoring profiles, provenance |
| `golden-answers.json` | Per-(document × column) annotation template + expected-scoring baselines for human reviewers to refine |
| `docs/` | Downloaded text-extracted documents (gitignored) |
| `scripts/fetch-government-docs.cjs` | Downloader for the 4 Open Government Licence documents |

## Corpus composition

| # | Category | Count | Examples |
|---|---|---:|---|
| A | Government / Crown Copyright | 4 | Home Office statutory guidance (the positive ceiling); GovS 013; NAO report; SFO Evaluating a Compliance Programme |
| B | SFO Deferred Prosecution Agreement materials | 3 | Standard Bank (UK's first BA s.7 conviction); Rolls-Royce (post-DPA gold standard); Amec Foster Wheeler / Wood (inherited-liability) |
| C | UK public company published programs | 5 | HSBC; Barclays Modern Slavery (adjacency trap); BAE Systems; GSK ABAC (bribery-vs-fraud trap); Diageo Code (document-boundary trap); BT (post-incident learning loop) |
| D | Industry / negative-example anchors | 2 | UK Finance Annual Fraud Report (N/A discipline trap); Patisserie Valerie forensic analyses (concrete control-failure on Sched 13 territory) |

Six categories of document deliberately exercise different playbook failure modes — see `sources.json` for the per-document `calibration_role`.

## Calibration roles in this corpus

- **`positive_ceiling`** — every column must score Covered (item #01 Home Office guidance)
- **`adjacency_trap`** — strong on adjacent regulation, should NOT score covered on this regulation (item #09 Barclays Modern Slavery)
- **`bribery_vs_fraud_trap`** — strong on bribery, should not silently translate into fraud coverage (item #11 GSK ABAC)
- **`document_boundary_trap`** — Code of Conduct strong on its own surface but principles 2 and 6 live in OTHER documents (item #12 Diageo Code)
- **`na_discipline_trap`** — fraud-themed industry report, principles 1-5 should be N/A not Missing (item #14 UK Finance Annual Fraud Report)
- **`negative_anchor`** — documented control failure, principles 2/3/6 should score Missing (item #15 Patisserie Valerie)
- **`remediation_gold_standard`** — visibly strong post-failure program (item #06 Rolls-Royce post-DPA)
- **`prosecutor_yardstick`** — what the SFO actually looks for (item #04 SFO Evaluating a Compliance Programme)

## Quick-start

```bash
# Fetch the 4 Open Government Licence documents
node data/test-corpus/uk-eccta/scripts/fetch-government-docs.cjs

# (The 10 corporate / court-record documents must be downloaded manually
# from the URLs in sources.json — they're public but not OGL.)

# Once all 14 are in docs/, drop them into the Tabular Review workspace,
# pick the "UK ECCTA — Reasonable Procedures Mapping" playbook, run.
# Generate a share link from the run header.
# Send it to your reviewer panel.
# Compare AI verdicts to golden-answers.json + your panel's verdicts.
```

## Calibration sequencing (recommended)

1. **First — positive control.** Run on the Home Office guidance alone. Every column must score Covered. If not, fix prompts.
2. **Second — discrimination test.** Run items 9, 11, 14. The playbook should respectively flag adjacent-regulation framing (Barclays), bribery-not-fraud framing (GSK), and N/A discipline (UK Finance).
3. **Third — strong vs weak.** Run items 6 + 5 paired. Visible scoring difference required.
4. **Fourth — full corpus.** All 14 documents. Generate share link. Distribute to reviewer panel.
5. **Fifth — compute kappa per column.** Lock columns at κ > 0.8; rewrite columns at κ < 0.6.

## Provenance summary

- **OGL / Crown Copyright** (items 1, 2, 3, 4): full reuse including local storage + AI analysis permitted
- **Court records** (items 5, 6, 7): public domain per UK sentencing convention
- **Corporate publications** (items 8, 9, 10, 11, 12, 13, 14): fair-dealing-for-research permits local storage + AI analysis; redistribution restricted

The `docs/` directory is gitignored to keep the repo clean and avoid republishing third-party material.

## What's NOT in this corpus (and why)

- Synthetic LLM-generated policies — the whole point is real-language testing
- Documents behind paywalls (Practical Law / Lexis precedent files) — provenance opaque
- Live client documents — confidentiality
- Documents older than 2015 — pre-Bribery-Act-uptake material doesn't reflect current standard

Next jurisdictions to corpus: Switzerland (AMLA/LETA), Ireland (SEAR), EU (AMLR). The same shape ports.
