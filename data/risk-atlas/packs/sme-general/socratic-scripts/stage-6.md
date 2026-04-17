# Stage 6 — Residual Risk (auto-calculated)

There's nothing to fill in here. The residual score for each path is
**automatically calculated** from the inherent score (Stage 4) and the
control rollup (Stage 5):

```
residual = inherent − reduction
where reduction = 2 (strong) | 1 (adequate) | 0 (weak | absent)
clamped to [1, 5]
```

What you see in this stage:

- Each threat path with its inherent → reduction → residual numbers
- The **rationale** in plain English: "Inherent 5 (max of 5/4/4). Controls:
  adequate coverage → −1. Residual 4 → outside appetite."
- The **appetite position** the residual maps to:
  - 1–2 = within
  - 3 = boundary
  - 4 = outside
  - 5 = unacceptable

If a residual surprises you, the right move is to revisit Stage 4 (re-check
the sub-scores) or Stage 5 (re-evaluate a control's strength with evidence).
The number can't be changed by hand. That's the point — it has to be
audit-defensible.

---

What to look at on this screen:

- **Any path at residual 5** is unacceptable — you cannot end Stage 7 in
  that state. Either upgrade controls until residual drops, or formally
  document board acceptance with a fixed end-state and timeline.
- **Paths at residual 4** are outside appetite — Stage 7 will require a
  remediation plan with an owner, target date, and budget.
- **Paths at residual 3** are at the boundary — monitor closely, fix when
  cost-effective.
- **Paths at residual 1–2** are within appetite — keep doing what you're
  doing.
