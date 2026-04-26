# Extending Coding

> How to add a new tier, a new persona to the panel, a new code-review rule, or a new bundle template.

---

## Add a new persona to the architecture review panel

The current 4 personas (Security / Compliance / PM / Solutions Architect) live as system prompts under `server/areas/coding/personas/`. To add (e.g.) "Accessibility Specialist":

1. Author `server/areas/coding/personas/accessibility-specialist.md` with the persona's voice, lens, decision rules.
2. Register in the architecture-review service's persona array.
3. The `CodingLargeArchitecturePage` automatically picks up new personas.

The bar for adding is "would a real architecture review include this lens?" — keep the panel tight; ~6 personas max before the review starts feeling diluted.

---

## Add a new code-review rule

Tier 1 reviews are governed by a configurable review profile. To add a new rule:

1. Define the rule (id, severity, what to flag, why) in a `coding-review-profile` bundle (#7).
2. Users opt into the profile per-review.
3. Default ANTON profiles live as built-in templates.

---

## Add a new tier

Adding Tier 6 (or a sub-tier) is a deliberate architectural decision. Tiers should reflect a meaningfully different working surface, not just a new template. Today's tiers cover: review (1), single-script (2), multi-file (3), full programme (4), hardware (5). What's left?

Plausible Tier 6 candidates: distributed-systems design (microservices + infra), data-pipeline design, LLM-pipeline design. Each would need its own persona panel + its own bundle types.

---

## Add a new Instruction Builder format

The Instruction Builder produces `.anton instruction-builder-project` bundles. To add support for a new AI assistant target (beyond Claude Code):

1. Add a target id (`cursor`, `aider`, etc.).
2. Implement the per-chunk prompt-formatter for that target.
3. Bundle output gets a `target_assistant` field in the manifest.

---

## Anti-patterns

- **Don't skip the persona-panel review** for production-bound work. The friction is the point.
- **Don't auto-approve alignment review.** It's the gate that prevents scope drift.
- **Don't bypass `instruction-builder-project` bundling** for shareable Tier 4 output. The bundle format is what makes the work reusable.

---

*Maintained alongside `server/services/coding-*.ts`. Refresh when a new tier or persona ships.*
