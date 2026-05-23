# ANTON Tabular Review — Test Corpus

This directory holds the curated test corpora used to calibrate Tabular Review playbooks against publicly-available real compliance documents.

Each subdirectory is one jurisdiction's corpus, anchored on a specific playbook:

| Directory | Playbook | Documents |
|---|---|---|
| [`uk-eccta/`](uk-eccta/) | `uk-eccta-reasonable-procedures` | 14 publicly-available UK fraud-prevention / counter-fraud / anti-bribery / financial-crime program documents |
| _(future: `swiss-amla-leta/`, `ireland-sear/`, `nydfs-part-500/`, etc.)_ | | |

## Methodology

Each corpus follows the same shape:

| File | Purpose |
|---|---|
| `README.md` | Corpus methodology + usage protocol |
| `sources.json` | Structured inventory of documents (URL + publisher + sector + expected scoring profile + provenance notes) |
| `golden-answers.json` | Annotation template — expected status per (document × column), to be refined by human reviewers |
| `docs/` | Downloaded documents (text-extracted). **Gitignored** to keep the repo clean and to sidestep IP questions on corporate publications |
| `scripts/fetch-government-docs.cjs` | One-shot script that downloads documents with unambiguous reuse licences (Crown Copyright / Open Government Licence). Other documents must be downloaded manually by the user |

## Corpus design rules (apply to every jurisdiction)

1. **Source-type spread, not topic spread.** A corpus that's all annual reports won't exercise prosecutor-evaluation framing or industry-template framing. Aim for: statutory guidance, government policies, enforcement records, corporate published programs, industry templates, and at least one documented control-failure case.

2. **Sector spread within the corporate slice.** Banking documents frame risk differently from defence-industry documents from FMCG-codes-of-conduct from telco-fraud-disclosure. The playbook must score consistently across them.

3. **Deliberate calibration anchors.** Include one document where every column should score Covered (positive ceiling — typically the statutory guidance itself) and at least one where columns should score Missing (negative anchor — typically a documented control-failure case).

4. **Verdict-trap inclusions.** Include documents that are *adjacent* to the playbook's regulation (e.g. a Modern Slavery Statement under an ECCTA corpus) to test that the playbook doesn't silently translate strong-on-adjacent-regulation into strong-on-target-regulation.

## Calibration protocol

A typical calibration cycle:

1. **Positive-control run.** Run the playbook against the corpus's positive-ceiling document alone. Every column must score Covered. If not, fix column prompts before going further.

2. **Full-corpus run.** Run the playbook against every document in the corpus. Generate a share link to a single review session covering all documents.

3. **Single-reviewer self-baseline.** As corpus owner, annotate `golden-answers.json` — your own honest read of every cell. This is the baseline; calibrate against it first.

4. **External-reviewer panel.** Send the share link to 2-3 named external reviewers (one MLRO/CCO, one ex-regulator lawyer, one Big-4 forensic partner if available). They drill cell-by-cell and submit verdicts via the public reviewer interface. They don't see AI verdicts unless they ask.

5. **Compare + iterate.** Compute Cohen's kappa per column between AI verdicts and the reviewer-consensus golden answer. Columns with κ < 0.6 get prompt-rewritten. Columns with κ > 0.8 are locked.

6. **Lock-and-document.** Annotate prompt changes in `server/services/tabular-review-playbooks.ts` with the calibration evidence. Re-run; track κ improvement.

## Adding a new jurisdiction corpus

1. Create `data/test-corpus/<jurisdiction>/`
2. Run the research agent prompt at `data/test-corpus/_research-prompt.md` (TODO — to be added) substituting the new playbook ID
3. Build `sources.json` from the research output
4. Build `golden-answers.json` from the expected-scoring profiles in `sources.json` as a baseline
5. Manually download non-OGL documents into `docs/`
6. Run `scripts/fetch-government-docs.cjs` for OGL documents
7. Run the calibration protocol above
