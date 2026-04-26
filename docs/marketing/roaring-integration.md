# Roaring Integration — Layer 2c

> **What it is:** Live Nordic entity-data integration baked into ANTON's prompt at Layer 2c. Every relevant FCP module call silently gets up-to-date entity data (UBO chains, registry filings, sanctions cross-references) injected into the system prompt without the user lifting a finger.
> **Why it matters:** Most "AI for compliance" tools require the analyst to copy-paste entity data into the chat. ANTON wires the partner-data feed into the prompt-build pipeline itself.

---

## Where it sits

The seven-layer prompt builder (see `/docs/architecture/11-seven-layer-prompt-builder.md`) has explicit sub-layers. **Layer 2c — Roaring entity data** is one of them.

When a user runs an FCP module against a counterparty, the prompt builder:

1. Composes Layer 1 (system foundation) and Layer 2 (area context).
2. Calls into `roaring-connector.ts` to fetch the counterparty's current registry data.
3. Injects the structured entity payload as Layer 2c of the system prompt.
4. Continues with Layer 3 (module expertise) and on through to Layer 7 (transparency).

The user just types their question. The model gets the entity data without them asking.

---

## What gets injected

| Field | Source |
|---|---|
| Legal entity name + registry ID | Roaring registry feed |
| Registered office + jurisdiction | Roaring registry feed |
| UBO chain (where available) | Roaring beneficial-ownership feed |
| Active officers / directors | Roaring filings |
| Annual filings — last 3 years | Roaring filings |
| Status flags (struck-off, in liquidation, etc.) | Roaring registry feed |

All injected as canonical JSON inside a Layer-2c markdown block, with the source attribution preserved so the model can cite it accurately.

---

## Why this is a quiet differentiator

A regulator reviewing a compliance decision can ask: **"What information was in front of the analyst when this call was made?"** With most tools, the answer is "whatever they happened to copy-paste." With ANTON, the answer is "the live Roaring registry data at timestamp X" — captured in the source manifest of the message and reproducible from the audit trail.

This is invisible to the user — which is exactly the point. Compliance work shouldn't depend on the analyst remembering to fetch fresh data.

---

## Activation

Roaring is a partner integration — ships disabled by default. Activation:

1. Configure Roaring credentials in `connection-manager.ts` settings.
2. Enable the Roaring connector for the FCP area in `module_configs`.
3. From that point on, every FCP module run for a counterparty pulls live data.

---

## Where to look

- **Service:** `server/services/roaring-connector.ts`.
- **Layer-2c marker:** `server/services/prompt-builder.ts:554`.
- **Prompt-builder header comment:** top of `prompt-builder.ts` (after C.4 + D.4 cleanup).
- **Architecture diagram:** `/docs/architecture/11-seven-layer-prompt-builder.md`.

---

*Document maintained alongside `roaring-connector.ts`. Refresh when partner-data fields change or when a non-Nordic registry partner is added.*
