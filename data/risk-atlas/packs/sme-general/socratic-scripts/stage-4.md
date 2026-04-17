# Stage 4 — Inherent Risk (Socratic script)

Now we score each threat path **before** taking credit for any controls. This
is the picture of "what would the situation be if we had no defences at all".

For each path, I'll ask three short questions:

**Exposure (1–5).** How much of the business is exposed to this path?
- 1 = a small corner; 5 = the whole business

**Threat credibility (1–5).** How plausible is the threat actually happening?
- 1 = rare in our context; 5 = almost certain in our sector

**Vulnerability (1–5).** How weak are the underlying defences right now?
- 1 = robust; 5 = wide open

The **inherent score** is automatically calculated as the **maximum** of the
three (chain is as weak as its weakest link — this is non-negotiable in the
methodology).

You can override individual sub-scores; you cannot override the maximum
rule. If you think the inherent score is wrong, the right move is to revise
one of the three sub-scores with a stated reason — that becomes part of
the audit trail.

---

Common calibration anchors in the SME General pack:

- A path with E=5 + T=4 + V=4 is inherent 5 — anything affecting the whole
  business with credible threats and weak defences is a 5
- A path with E=2 + T=2 + V=2 is inherent 2 — small corner, low likelihood,
  reasonable defence
- The middle is where most paths land — inherent 3 means "this could really
  bite if a control fails"
