# G.9 — Sensitive Data Flow Audit (real)

**Generated:** 2026-04-26 UTC
**Commit:** `0fabf7f`
**Pattern:** G.9
**Scanned:** 529 TS files (server/services/, server/routes/)
**Findings:** 10

> Static-taxonomy scan for PII / credential / regulated identifiers reaching:
> - Logs (console.* / logger.*)
> - HTTP response bodies (res.json / res.send)
> - LLM prompts (messages.push / callChat / streamChat)
>
> **Severity weighting:** credential / regulated leak = HIGH; PII = MEDIUM; unknown = LOW.
>
> Each finding is a CANDIDATE — the audit doesn't trace data-flow across function
> boundaries. False positives expected. Human triage required.

**Sensitive identifier taxonomy:**

- **19 credential fields:** api_key, apikey, api_secret, secret_key, access_token, refresh_token, session_token, auth_token, …
- **22 PII fields:** email, phone, phone_number, mobile, address, street_address, date_of_birth, dob, …
- **18 regulated fields:** beneficial_owner, beneficial_owner_data, ubo, sar_data, str_data, cdd_data, edd_data, kyc_data, …

## Severity rollup

| Severity | Count |
|---|---|
| HIGH | 3 |
| MEDIUM | 7 |
| LOW | 0 |

## By pattern

| Pattern | Count |
|---|---|
| Sensitive value in log (pii) | 5 |
| Sensitive value in HTTP response (credential) | 3 |
| Sensitive value in HTTP response (pii) | 1 |
| Sensitive value in LLM call (pii) | 1 |

## HIGH — credential / regulated data candidates

Investigate first. Each is a candidate for credential leak / regulated-data exposure.

| File | Line | Pattern | Detail |
|---|---|---|---|
| `server/routes/azure-openai.ts` | 87 | Sensitive value in HTTP response (credential) | `res.json` body references `apiKey` — verify field is intended public |
| `server/routes/azure-openai.ts` | 161 | Sensitive value in HTTP response (credential) | `res.json` body references `apiKey` — verify field is intended public |
| `server/routes/fc-gateway.ts` | 27 | Sensitive value in HTTP response (credential) | `res.json` body references `apiKey` — verify field is intended public |

## MEDIUM — PII candidates

| File | Line | Pattern | Detail |
|---|---|---|---|
| `server/routes/auth.ts` | 685 | Sensitive value in log (pii) | `console.log` arg references `email` — verify redaction |
| `server/routes/project-collaboration.ts` | 133 | Sensitive value in HTTP response (pii) | `res.json` body references `email` — verify field is intended public |
| `server/routes/school.ts` | 1875 | Sensitive value in log (pii) | `console.log` arg references `email` — verify redaction |
| `server/routes/travel.ts` | 186 | Sensitive value in LLM call (pii) | `streamChat` interpolates `passport` into prompt — verify redaction |
| `server/services/portals/portal-handler.ts` | 156 | Sensitive value in log (pii) | `log.warn` arg references `address` — verify redaction |
| `server/services/portals/portal-handler.ts` | 180 | Sensitive value in log (pii) | `log.warn` arg references `address` — verify redaction |
| `server/services/portals/portal-handler.ts` | 204 | Sensitive value in log (pii) | `log.warn` arg references `address` — verify redaction |

---

**Cadence (per addendum §G.9):** pre-release mandatory; quarterly; on every new pillar.

**Acceptance:**
- HIGH: triage every credential / regulated finding before pre-release.
- MEDIUM: triage PII findings before any GDPR / EU AI Act review.
- Each verified finding gets a fix (redaction / hashing / removal) OR a documented exception.
