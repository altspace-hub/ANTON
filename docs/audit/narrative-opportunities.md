# Narrative Opportunities

**Generated:** 2026-04-26 UTC
**Commit:** `0fabf7f`
**Pattern:** G.4 (built but under-narrated)

## 1. Recent migrations without a spec doc

Migrations where the feature name doesn't appear in any docs/ markdown — possibly under-documented features.

```
169 — grow crm external columns (no spec doc references the slug "grow-crm-external-columns")
168 — school evidence curriculum (no spec doc references the slug "school-evidence-curriculum")
167 — portal surface mode (no spec doc references the slug "portal-surface-mode")
166 — video layer (no spec doc references the slug "video-layer")
165 — friend messaging (no spec doc references the slug "friend-messaging")
164 — friends layer (no spec doc references the slug "friends-layer")
163 — marketplace visitor (no spec doc references the slug "marketplace-visitor")
162 — jobs candidate side (no spec doc references the slug "jobs-candidate-side")
161 — pathfinder visitor (no spec doc references the slug "pathfinder-visitor")
160 — portal category associations (no spec doc references the slug "portal-category-associations")
159 — user starter packs (no spec doc references the slug "user-starter-packs")
157 — markets symbol weight overrides (no spec doc references the slug "markets-symbol-weight-overrides")
156 — markets prediction verification tracking (no spec doc references the slug "markets-prediction-verification-tracking")
155 — markets thesis lifecycle (no spec doc references the slug "markets-thesis-lifecycle")
154 — markets pattern feedback (no spec doc references the slug "markets-pattern-feedback")
153 — evidence pack compliance gaps (no spec doc references the slug "evidence-pack-compliance-gaps")
152 — evidence packs (no spec doc references the slug "evidence-packs")
150 — portal walkthrough llm (no spec doc references the slug "portal-walkthrough-llm")
149 — portal performance indexes (no spec doc references the slug "portal-performance-indexes")
148 — portal walkthrough sessions (no spec doc references the slug "portal-walkthrough-sessions")
```

## 2. Bundle types without an example payload

From the 45-type `BundleType` union in anton-bundler.ts; those without any example file under data/ or examples/.

```
module
skill
persona
workflow
skill-pack
coding-blueprint
coding-review-profile
script-lite-template
script-medium-template
instruction-builder-project
compliance-ruleset
radar-config
quality-baseline
brand-template
output-chain
review-panel
project-template
audience-profile
lesson-plan
study-pack
assessment-bank
regulatory-knowledge-pack
market-index
market-thesis
market-intelligence-model
market-investigation
market-data-source-config
market-atom-collection
market-strategy-pack
contact-bundle
```

## 3. Pillars: page count vs marketing-doc coverage

Pillars with many pages but few/no docs/marketing files.

```
work         pages:0   marketing:0  ok
school       pages:34  marketing:0  🔴 under-narrated
life         pages:0   marketing:0  ok
pathfinder   pages:1   marketing:0  🟡 no marketing
markets      pages:24  marketing:0  🔴 under-narrated
community    pages:20  marketing:0  🔴 under-narrated
payments     pages:0   marketing:0  ok
portals      pages:8   marketing:1  ok
missions     pages:6   marketing:1  ok
procure      pages:2   marketing:0  🟡 no marketing
civic        pages:2   marketing:0  🟡 no marketing
grow         pages:5   marketing:0  🔴 under-narrated
```

## How to use this

Each row is a candidate marketing one-pager or example payload. Prioritise by strategic weight (FCP, hardware, school = high; everything else = standard).

## Cadence

Monthly, before any major content push.
