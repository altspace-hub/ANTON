# Stage 5 — Controls (Socratic script)

A **control** is something you actually do that reduces a threat. We use a
three-way taxonomy:

- **Prevent** — stops the bad thing happening (locks, MFA, dual control)
- **Detect** — tells you when something has happened (alerts, restore tests, log review)
- **Respond** — helps you recover when it does (incident playbook, backups, insurance)

For each vulnerability you flagged in Stage 3, I'll propose suitable controls
from the SME General pack. For each control I'll ask:

1. **Is it in place?** (yes / partly / no)
2. **What's the evidence?** (a written policy, a screenshot, a log)
3. **Who owns it?** (named role, not "the team")
4. **How strong is it?** (Strong / Adequate / Weak — see below)

**Strong** controls have demonstrable evidence and work as designed.
**Adequate** controls work in principle but have known gaps.
**Weak** controls are documented but not actually used, or missing key elements.

The UI will refuse to let you mark a control "Strong" without filling in
the evidence field. That's deliberate — Strong without evidence is fiction.

---

The residual risk is automatically calculated:

- Strong controls reduce inherent by 2
- Adequate by 1
- Weak by 0 (no reduction — it might as well not be there)
- Empty (no controls) by 0

The **rollup** is the **worst** strength across all controls touching the
vulnerabilities of a path. One weak control sinks the rollup, even if other
controls are strong. This mirrors the inherent-max rule.

---

The point of this stage isn't to invent new controls — it's to be honest
about what's in place and what's working. If a control is missing, that's
a finding, not a problem to hide.
