# Civic Eligibility Rules

> Declarative rule semantics for `civic-eligibility.ts`. Every rule is a (`condition_kind`, `condition_value`) pair evaluated against an applicant context.

---

## The rule shape

A row in `civic_eligibility_rules` (mig 170):

```ts
{
  id: string,
  process_id?: string,           // bound to a specific civic_processes row
  pack_id?: string,              // OR bound to a process pack (rule applies to any process in the pack)
  rule_code: string,             // e.g. 'SE-TAX-RESIDENCY'
  rule_label: string,            // e.g. 'Swedish tax residency (≥183 days)'
  condition_kind: ConditionKind, // see below
  condition_value: object,       // JSON, kind-specific
  severity: 'mandatory' | 'recommended' | 'informational',
  source_url?: string,           // canonical source for the rule
  is_active: boolean,
}
```

A rule must bind to either `process_id` (specific process) or `pack_id` (process pack — rule applies broadly within the pack).

---

## Condition kinds

| Kind | Value shape | Outcome semantics |
|---|---|---|
| `age_min` | `{ value: number }` or `{ min: number }` | `eligible` if age ≥ min; `ineligible` if below; `requires_evidence` if no age in context |
| `age_max` | `{ value: number }` or `{ max: number }` | Symmetric |
| `residency_months` | `{ min: number, jurisdiction?: string }` | `eligible` if residencyMonths ≥ min and (no jurisdiction OR matches); `ineligible` if jurisdiction mismatch; `requires_evidence` if no data |
| `income_max` | `{ value: number }` (numeric) or `{ value: string, household_size_aware?: bool }` (named threshold like `200_pct_fpl`) | Numeric: direct compare; named: `indeterminate` (downstream service must resolve to a number) |
| `income_min` | `{ value: number }` | `eligible` if income ≥ value |
| `jurisdiction_in` | `{ values: string[] }` | `eligible` if jurisdiction in list |
| `document_present` | `{ doc_type: string }` | `eligible` if `documents` array contains the doc; `requires_evidence` otherwise |
| `status_equals` | `{ field: string, value: any }` | Compares applicantContext.extras[field] to value |
| `custom_predicate` | (any) | `indeterminate` — flagged for external evaluation |

---

## Outcomes

Four possible outcomes per rule:

| Outcome | Meaning |
|---|---|
| `eligible` | Rule satisfied with current context |
| `ineligible` | Rule fails with current context |
| `indeterminate` | Rule cannot be evaluated deterministically — needs a downstream service (e.g. FPL resolution) |
| `requires_evidence` | Rule needs more applicant data before it can be evaluated |

---

## Verdict rollup

When evaluating multiple rules for a process / pack:

- **Mandatory ineligibility blocks** — any mandatory rule with `ineligible` outcome → overall `ineligible`
- **Else `requires_evidence`** if any rule has that outcome
- **Else `indeterminate`** if any rule has that outcome
- **Else `eligible`**

Recommended / informational ineligibilities don't block but are surfaced for context.

---

## Adding a new condition kind

1. **Add** the kind to the `condition_kind` CHECK constraint in mig 170 (or a follow-up migration).
2. **Implement** the case in `civic-eligibility.ts` `evaluateRule()`.
3. **Document** the kind in this file's table above.
4. **Test** with at least one rule per outcome (eligible / ineligible / requires_evidence).

The bar for adding kinds is "can this kind be evaluated deterministically over JSON?" — if it needs LLM reasoning, prefer `custom_predicate` and route the evaluation externally.

---

## Where to look

- **Code:** `server/services/civic-eligibility.ts`
- **Schema:** `server/db/migrations-pg/170_civic_eligibility_packs.sql`
- **Examples:** the 3 seeded rules in mig 170 cover `residency_months`, `age_min`, `income_max`
