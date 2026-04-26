# Dow Jones Integration — Layer 2d

> **What it is:** Live Dow Jones sanctions/PEP/adverse-media screening baked into ANTON's prompt at Layer 2d. Counterparty hits surface in the system prompt automatically — the model never has to be told "by the way, this person is on a sanctions list."
> **Why it matters:** Sanctions screening is non-negotiable in financial-crime workflows. ANTON makes it part of the *prompt*, not a separate workflow step the analyst has to remember.

---

## Where it sits

The seven-layer prompt builder (see `/docs/architecture/11-seven-layer-prompt-builder.md`) splits Layer 2 into sub-layers. **Layer 2d — Dow Jones screening** is one of them.

When an FCP module runs against a counterparty, the prompt builder:

1. Composes Layer 1 (foundation) and Layer 2 (area context).
2. Calls into `dowjones-connector.ts` to screen the counterparty.
3. Injects the screening result as Layer 2d of the system prompt.
4. Layer 3 (module expertise) and beyond run with the screening already in context.

The user asks a question. The model already knows whether the counterparty is sanctioned, a PEP, or has adverse-media flags.

---

## What gets injected

| Hit type | Source |
|---|---|
| Sanctions match | DJ sanctions list (OFAC, EU consolidated, UN, UK, etc.) |
| PEP designation | DJ PEP database (current + former + close associates) |
| Adverse media | DJ adverse-media feed |
| Confidence score per match | DJ matching engine |
| Match rationale (name, DOB, jurisdiction overlap) | DJ matching engine |

All structured as Layer-2d markdown blocks with explicit "no hits" where clean, so the model isn't left to infer absence of evidence.

---

## Why this is a quiet differentiator

The standard pattern is "screening as a separate gate" — a transaction-monitoring engine flags, an analyst opens the case, the analyst remembers to ask the AI tool. Things get missed in the gap.

ANTON's approach is "screening as a prompt layer" — the analyst's question never reaches the model without the screening result. The model can't accidentally produce a permissive recommendation for a sanctioned counterparty because the sanction is in the prompt, captioned, and a refusal-to-acknowledge would be visible in the reasoning trail.

For a regulator, the question "did your AI know this person was sanctioned when it wrote this report?" has a one-word answer: yes (it was Layer 2d).

---

## Compliance-anchored

- **Source manifest** captures the DJ query timestamp + version of the screening list, so the audit trail can demonstrate which list was checked.
- **Reasoning trail** records the screening result alongside the model's response.
- **Evidence pack** export bundles the screening result with the analytical output — defensible by construction.

---

## Activation

Dow Jones is a paid partner data feed. Activation:

1. Configure DJ credentials in `connection-manager.ts` settings.
2. Enable the Dow Jones connector for the FCP area in `module_configs`.
3. From that point on, every FCP module run that targets a person/entity screens automatically.

---

## Where to look

- **Service:** `server/services/dowjones-connector.ts`.
- **Layer-2d marker:** `server/services/prompt-builder.ts:558`.
- **Prompt-builder header comment:** top of `prompt-builder.ts` (after D.4 cleanup).
- **Architecture diagram:** `/docs/architecture/11-seven-layer-prompt-builder.md`.

---

*Document maintained alongside `dowjones-connector.ts`. Refresh when DJ adds a new feed type (e.g. crypto-specific lists) or when the screening contract changes.*
