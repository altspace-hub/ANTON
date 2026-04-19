# ANTON Portals — Capability Descriptor Schema Reference

**Document:** Capability Descriptor Schema Reference
**Version:** 1.0.0-draft
**Target implementation version:** v0.7.x
**Status:** Draft for implementation — investigation-first
**Owner:** Daniel Bardun / FutureChain AB
**Depends on:** Registry Protocol Reference (signing scheme, canonicalisation)
**Companion to:** ANTON_Portals_Spec.md, ANTON_Portals_Strategic_Ground.md

---

## 0. Read this first

The capability descriptor is the **machine-readable half of a portal**. It is the JSON document that tells other ANTONs what a portal can do, how to interact with it, and under what policies. This is what makes portals more than websites — the descriptor lets agents transact with portals without scraping or bespoke API integration.

The descriptor vocabulary defined here becomes permanent infrastructure. Pathfinder searches over it. The Beehive orchestrates over it. The Marketplace sells over it. A bad taxonomy is a permanent ceiling.

**For Claude Code:**

1. Do not implement anything until the Investigation Protocol (§2) is complete.
2. The 12-verb capability taxonomy (§4) is load-bearing. It extends to `custom` as an escape hatch, but the core vocabulary must be treated as fixed.
3. Signing reuses the Registry Protocol Reference's signing scheme (Ed25519 over RFC 8785 canonical JSON). Do not invent a parallel scheme.
4. Policy fields (§7) are how agents enforce user preferences on behalf of their user. These are not decoration — they are functional.
5. Extend existing ANTON systems. Do not duplicate identity, signing, or canonicalisation logic.
6. All code must follow existing project conventions.

---

## 1. Scope and non-scope

### 1.1 In scope (v1.0.0)

- JSON schema for capability descriptors.
- The canonical capability verb taxonomy (12 verbs plus `custom`).
- Standard input/output schemas per verb.
- Payment method vocabulary (placeholder, pending FutureChain spec).
- Policy declaration structure (terms, privacy, data minimisation, data retention).
- Availability and scheduling semantics.
- Attestation structure (self-declared only in v1.0.0).
- Canonicalisation and signing rules.
- Cache TTL conventions.
- Schema evolution rules.

### 1.2 Out of scope (deferred)

- Third-party issuer attestation (v1.1+).
- Rich calendar semantics (RRULE, multi-capacity booking) — v1.1+.
- Cross-portal capability composition (Beehive orchestration) — separate spec.
- Formal JSON Schema (the `$schema` for JSON Schema) publication — treated as a v1.0.0 deliverable but defined in its own file alongside this doc.
- FutureChain payment rail specifics — this doc defines the integration points; FutureChain defines the values.

### 1.3 Relationship to the Registry Protocol

- A portal's registration in the registry contains a **capability summary** (flattened metadata used for Pathfinder indexing).
- The full descriptor is served by the portal's AAP endpoint at `/capabilities`.
- The descriptor's hash (`descriptorHash` in the registry entry) binds the registry entry to a specific descriptor version. When the portal publishes a new descriptor, it updates the hash via `update_capability_summary`.
- The descriptor is signed by the same Ed25519 key that signs registry operations for this portal.

---

## 2. Investigation Protocol (MANDATORY)

Before writing any code, complete this investigation. Record findings in `investigation/capability-descriptor-investigation.md`.

### 2.1 Files to read

```bash
# Existing JSON Schema validation in the codebase
grep -rn "ajv\|json-schema\|JSONSchema" --include="*.ts" | head -20
grep -rn "\"\\\$schema\"" --include="*.json" | head -10

# Existing module input/output schemas — the pattern to follow
find . -type f -name "*module*.ts" -not -path "*/node_modules/*" | head -20
grep -rn "inputSchema\|outputSchema" --include="*.ts" | head -30

# AAP endpoint definitions — descriptor endpoints are AAP endpoints
find . -type f -name "aap-*.ts" -not -path "*/node_modules/*"
grep -rn "aapEndpoint\|AAP endpoint" --include="*.ts" | head -20

# Existing capability/permission/role definitions — check for collisions
grep -rn "capability\|Capability" --include="*.ts" server/ | head -30

# Signing scheme — reuse Registry Protocol Reference primitives
find . -type f -name "canonical-json.ts" -not -path "*/node_modules/*"
find . -type f -name "signatures.ts" -not -path "*/node_modules/*"

# Existing policy/ToS/privacy structures
grep -rn "privacy\|retention\|dataController" --include="*.ts" | head -20
```

### 2.2 Questions to answer

1. What JSON Schema validation library is ANTON already using? Reuse it.
2. Is there already a module/workflow input-schema pattern? The capability input/output schemas should match it.
3. How are AAP endpoints registered today? The capability descriptor references endpoint names — the mechanism must align.
4. Is there an existing policy or compliance rule structure that the descriptor's policy section should reference or reuse?
5. What localisation infrastructure exists? Descriptor fields need to support multiple languages.

### 2.3 Do not proceed past §2 until the investigation is documented.

---

## 3. Descriptor document structure

### 3.1 Top-level schema

```json
{
  "schemaVersion": "capability-1.0.0",
  "descriptorId": "<UUID>",
  "issuedAt": "<ISO 8601 UTC>",
  "validFrom": "<ISO 8601 UTC>",
  "validUntil": "<ISO 8601 UTC>",
  "portal": { /* §3.2 */ },
  "identity": { /* §3.3 */ },
  "capabilities": [ /* array of §4 capability objects */ ],
  "payment": { /* §6 */ },
  "policies": { /* §7 */ },
  "availability": { /* §8 */ },
  "attestations": [ /* array of §9 attestations */ ],
  "discoveryMetadata": { /* §10 */ },
  "localizations": { /* §11 */ },
  "extensions": { /* §12 */ }
}
```

### 3.2 `portal` section

Identifies the portal this descriptor describes:

```json
"portal": {
  "name": "local-catering.futurechain.portal",
  "namespace": "futurechain",
  "displayTitle": "Local Catering Co.",
  "category": "commerce",
  "contactHash": "ANTON-7K9P-M2XN-4Q3V-HB5W",
  "publicKey": "<Ed25519 public key, base64url unpadded>"
}
```

Must exactly match the registry registration. A descriptor served under a portal whose registry `contactHash` differs from the descriptor's `contactHash` is rejected by visitor clients.

### 3.3 `identity` section

Declares how humans and agents can identify and reach the portal:

```json
"identity": {
  "humanContact": {
    "available": true,
    "primaryAddress": "owner@local-catering.futurechain.portal",
    "displayName": "Anna Lindberg",
    "role": "Owner",
    "languages": ["sv", "en"],
    "responseTimeHours": 24
  },
  "agentContact": {
    "available": true,
    "preferredProtocolVersion": "aap-1.0",
    "supportedMessageTypes": ["portal_fetch", "capability_invoke", "capability_inquire"]
  },
  "organisationDetails": {
    "legalName": "Local Catering AB",
    "registrationNumber": "559123-4567",
    "jurisdiction": "SE"
  }
}
```

`organisationDetails` is optional. For personal portals it's typically omitted. Self-declared; not verified unless an attestation (§9) asserts it.

---

## 4. Capability verb taxonomy

**This is the most important section in this document.** The 12 verbs below are the canonical core vocabulary. Every portal's capabilities use these verbs or the `custom` escape hatch. Pathfinder searches over these verbs. The Beehive orchestrates over these verbs.

### 4.1 The 12 verbs

| Verb | Purpose | Payment default | Trust level | Typical use |
|------|---------|-----------------|-------------|-------------|
| `contact` | Send a free-form message to a human or agent. | Free | Low | "Message me about consulting." |
| `inquire` | Ask a structured question and expect a structured response. | Free | Low | "Are you available 15 March?" |
| `request` | Request a structured service without a commercial commitment. | Usually free | Medium | "Request a gap analysis proposal." |
| `order` | Place a commercial order for goods or services. | Paid | Medium-high | "Order catering for 50 people." |
| `pay` | Send money without ordering something — donation, invoice settlement, transfer. | Paid | Medium | "Pay the outstanding invoice." |
| `book` | Reserve time or capacity. | Free or paid | Medium | "Book Court 3 Saturday 18:00–20:00." |
| `subscribe` | Opt into receiving updates. | Free | Low | "Notify me when this team posts results." |
| `join` | Request membership in a group or community. | Free or paid | Medium | "Apply to join the running club." |
| `query` | Ask a structured question whose answer the portal publishes. | Free | Low | "What's the next match time?" |
| `publish` | Declare that the portal publishes discoverable content. | Free | Low | "List recent posts." |
| `delegate` | Accept delegated tasks from another ANTON. | Varies | High | "Schedule this meeting on my behalf." |
| `authenticate` | Verify an identity or membership claim. | Usually free | High | "Confirm this person is a registered member." |

Plus the escape hatch:

| Verb | Purpose |
|------|---------|
| `custom` | User-defined capability with custom input/output schema. Less discoverable; full-text search only. |

### 4.2 Capability object schema

Every entry in the descriptor's `capabilities` array has this shape:

```json
{
  "id": "<portal-local identifier, slug>",
  "verb": "<one of the 12 verbs or 'custom'>",
  "title": "<human-readable title>",
  "description": "<free text, 1-3 sentences>",
  "aapEndpoint": "<AAP endpoint name on this portal>",
  "inputSchema": { /* JSON Schema Draft 2020-12 */ },
  "outputSchema": { /* JSON Schema Draft 2020-12 */ },
  "paymentCoupling": { /* §4.3 */ },
  "slaHints": { /* §4.4 */ },
  "availability": { /* §4.5, optional override of portal-level */ },
  "trustRequirements": { /* §4.6 */ },
  "tags": ["<string>", "<string>"],
  "examples": [ /* §4.7 */ ]
}
```

### 4.3 `paymentCoupling`

Declares whether and how this capability involves payment:

```json
"paymentCoupling": {
  "required": true,
  "methods": ["futurechain:stablecoin", "futurechain:invoice"],
  "priceModel": "quote",
  "priceHint": {
    "currency": "EUR",
    "minimumExpected": 500,
    "maximumExpected": 3000
  },
  "settlementTimingHours": 0
}
```

`priceModel` values:
- `fixed` — price determined by input alone, returned in output.
- `quote` — portal responds with a quote; user confirms separately.
- `negotiable` — requires human or agent negotiation.
- `free` — no payment.

Full payment vocabulary defined in §6.

### 4.4 `slaHints`

Non-binding hints about expected response times:

```json
"slaHints": {
  "acknowledgmentTimeMinutes": 60,
  "resolutionTimeHours": 24,
  "asynchronous": true
}
```

`asynchronous: true` signals that the response may not come on the same AAP connection — the portal will message back later. Visitor's ANTON keeps the capability invocation open in a pending state.

### 4.5 Per-capability `availability` override

Capabilities can override the portal's default availability:

```json
"availability": {
  "hoursOfOperation": { /* see §8 */ },
  "leadTimeHours": 48,
  "bookingHorizonDays": 90,
  "blackoutPeriods": [
    {"start": "2026-12-23", "end": "2026-12-27", "reason": "Holiday closure"}
  ]
}
```

### 4.6 `trustRequirements`

Declares what the portal requires from a visitor before accepting this capability invocation:

```json
"trustRequirements": {
  "visitorIdentityRequired": true,
  "minimumReputation": null,
  "requiresAttestation": ["business_registration"],
  "termsAcceptanceRequired": true
}
```

- `visitorIdentityRequired` — is the visitor's contact_hash required in the request?
- `minimumReputation` — reserved for future reputation system; `null` in v1.
- `requiresAttestation` — visitor must present specific attestation types.
- `termsAcceptanceRequired` — visitor must acknowledge portal terms before invocation.

### 4.7 `examples`

Illustrative input/output pairs for human readers and for LLM-based capability invocation:

```json
"examples": [
  {
    "description": "Basic order for a medium-size event",
    "input": {
      "event_date": "2026-10-15",
      "guest_count": 50,
      "menu_preferences": "Mediterranean",
      "contact": "user@caller.futurechain.portal"
    },
    "output": {
      "order_id": "ORD-2026-1234",
      "quote_total": 1875.00,
      "currency": "EUR",
      "payment_instructions": { /* ... */ }
    }
  }
]
```

Examples are normative for the schema (they must validate) but non-binding as operational contracts.

### 4.8 Per-verb input/output schema baselines

For each core verb, this document defines a **baseline schema** that all portals SHOULD extend. Portals are free to add fields but MUST include baseline fields with correct types.

#### `contact` baseline

```json
"inputSchema": {
  "type": "object",
  "properties": {
    "message": {"type": "string", "minLength": 1, "maxLength": 5000},
    "subject": {"type": "string", "maxLength": 200},
    "replyTo": {"type": "string", "description": "ANTON address for reply"}
  },
  "required": ["message"]
},
"outputSchema": {
  "type": "object",
  "properties": {
    "messageId": {"type": "string"},
    "acceptedAt": {"type": "string", "format": "date-time"},
    "expectedResponseTimeHours": {"type": "number"}
  },
  "required": ["messageId", "acceptedAt"]
}
```

#### `inquire` baseline

```json
"inputSchema": {
  "type": "object",
  "properties": {
    "question": {"type": "string"},
    "context": {"type": "object", "description": "Portal-specific context fields"}
  },
  "required": ["question"]
},
"outputSchema": {
  "type": "object",
  "properties": {
    "inquiryId": {"type": "string"},
    "answer": {"type": "string"},
    "structuredAnswer": {"type": "object"},
    "confidence": {"type": "string", "enum": ["high", "medium", "low", "requires_human"]}
  }
}
```

#### `order` baseline

```json
"inputSchema": {
  "type": "object",
  "properties": {
    "items": {"type": "array", "items": {"$ref": "#/definitions/orderItem"}},
    "deliveryMethod": {"type": "string"},
    "deliveryAddress": {"type": "object"},
    "deliveryDate": {"type": "string", "format": "date"},
    "contact": {"type": "string"},
    "notes": {"type": "string"}
  },
  "required": ["items", "contact"]
},
"outputSchema": {
  "type": "object",
  "properties": {
    "orderId": {"type": "string"},
    "status": {"type": "string", "enum": ["quoted", "confirmed", "pending_payment", "rejected"]},
    "totalPrice": {"type": "number"},
    "currency": {"type": "string"},
    "paymentInstructions": {"type": "object"},
    "expectedDelivery": {"type": "string", "format": "date"}
  }
}
```

#### `pay` baseline

```json
"inputSchema": {
  "type": "object",
  "properties": {
    "purpose": {"type": "string", "enum": ["invoice", "donation", "transfer", "deposit", "settlement", "other"]},
    "reference": {"type": "string"},
    "amount": {"type": "number", "exclusiveMinimum": 0},
    "currency": {"type": "string"},
    "method": {"type": "string"},
    "note": {"type": "string"}
  },
  "required": ["purpose", "amount", "currency", "method"]
},
"outputSchema": {
  "type": "object",
  "properties": {
    "paymentId": {"type": "string"},
    "status": {"type": "string", "enum": ["pending", "confirmed", "settled", "rejected"]},
    "receipt": {"type": "object"},
    "settlementTime": {"type": "string", "format": "date-time"}
  }
}
```

#### `book` baseline

```json
"inputSchema": {
  "type": "object",
  "properties": {
    "resource": {"type": "string", "description": "What is being booked"},
    "startTime": {"type": "string", "format": "date-time"},
    "endTime": {"type": "string", "format": "date-time"},
    "attendees": {"type": "integer", "minimum": 1},
    "contact": {"type": "string"},
    "notes": {"type": "string"}
  },
  "required": ["resource", "startTime", "endTime", "contact"]
},
"outputSchema": {
  "type": "object",
  "properties": {
    "bookingId": {"type": "string"},
    "status": {"type": "string", "enum": ["confirmed", "pending", "waitlist", "rejected"]},
    "price": {"type": "number"},
    "currency": {"type": "string"}
  }
}
```

#### `subscribe` baseline

```json
"inputSchema": {
  "type": "object",
  "properties": {
    "topic": {"type": "string"},
    "deliveryChannel": {"type": "string", "enum": ["aap", "webhook"]},
    "deliveryAddress": {"type": "string"},
    "frequency": {"type": "string", "enum": ["realtime", "daily_digest", "weekly_digest"]}
  },
  "required": ["topic", "deliveryChannel", "deliveryAddress"]
},
"outputSchema": {
  "type": "object",
  "properties": {
    "subscriptionId": {"type": "string"},
    "unsubscribeToken": {"type": "string"}
  }
}
```

#### `join` baseline

```json
"inputSchema": {
  "type": "object",
  "properties": {
    "applicantContact": {"type": "string"},
    "applicantName": {"type": "string"},
    "motivation": {"type": "string"},
    "supportingInfo": {"type": "object"}
  },
  "required": ["applicantContact", "applicantName"]
},
"outputSchema": {
  "type": "object",
  "properties": {
    "applicationId": {"type": "string"},
    "status": {"type": "string", "enum": ["pending", "approved", "rejected", "waitlist"]},
    "nextStep": {"type": "string"}
  }
}
```

#### `query` baseline

```json
"inputSchema": {
  "type": "object",
  "properties": {
    "queryType": {"type": "string"},
    "parameters": {"type": "object"}
  },
  "required": ["queryType"]
},
"outputSchema": {
  "type": "object",
  "properties": {
    "queryType": {"type": "string"},
    "results": {"type": "array"},
    "asOf": {"type": "string", "format": "date-time"}
  }
}
```

Each portal declares the specific `queryType` values it supports in its own extended schema.

#### `publish` baseline

```json
"inputSchema": {
  "type": "object",
  "properties": {
    "feed": {"type": "string"},
    "since": {"type": "string", "format": "date-time"},
    "limit": {"type": "integer", "maximum": 100}
  },
  "required": ["feed"]
},
"outputSchema": {
  "type": "object",
  "properties": {
    "feed": {"type": "string"},
    "items": {"type": "array"},
    "hasMore": {"type": "boolean"}
  }
}
```

#### `delegate` baseline

```json
"inputSchema": {
  "type": "object",
  "properties": {
    "taskDescription": {"type": "string"},
    "constraints": {"type": "object"},
    "deadline": {"type": "string", "format": "date-time"},
    "delegatorSignature": {"type": "string", "description": "Ed25519 signature by delegator"}
  },
  "required": ["taskDescription", "delegatorSignature"]
},
"outputSchema": {
  "type": "object",
  "properties": {
    "delegationId": {"type": "string"},
    "accepted": {"type": "boolean"},
    "expectedCompletionTime": {"type": "string", "format": "date-time"}
  }
}
```

Note the signature requirement — `delegate` is a high-trust verb and requires explicit cryptographic authorisation from the delegator.

#### `authenticate` baseline

**Narrow scope:** confirms an identity or membership claim. Does NOT handle password authentication, session management, or credential issuance. Those are out of scope.

```json
"inputSchema": {
  "type": "object",
  "properties": {
    "claimType": {"type": "string", "enum": ["membership", "employment", "certification", "other"]},
    "claimSubject": {"type": "string", "description": "ANTON address of the subject"},
    "claimDetails": {"type": "object"}
  },
  "required": ["claimType", "claimSubject"]
},
"outputSchema": {
  "type": "object",
  "properties": {
    "verified": {"type": "boolean"},
    "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
    "attestation": {"type": "object", "description": "Optional signed attestation"},
    "validUntil": {"type": "string", "format": "date-time"}
  }
}
```

### 4.9 `custom` escape hatch

For capabilities not fitting the core verbs:

```json
{
  "id": "specialty-quote-calculator",
  "verb": "custom",
  "customVerbName": "calculate_specialty_quote",
  "title": "Calculate a specialty quote",
  "description": "Custom estimation logic specific to this portal.",
  "aapEndpoint": "custom/quote",
  "inputSchema": { /* fully custom */ },
  "outputSchema": { /* fully custom */ },
  "paymentCoupling": {"required": false}
}
```

Custom capabilities are indexed by title/description/tags only. Pathfinder cannot semantically match them by verb.

### 4.10 Rules for adding new core verbs (post-v1.0.0)

A new core verb requires:

1. Documented demand from at least three unrelated use cases.
2. Clear demarcation from existing verbs (not a duplicate).
3. Baseline input/output schema.
4. Addition in a minor version bump (1.0.0 → 1.1.0).
5. Backward compatibility: v1.0.0 clients treat it as `custom`.

Candidate verbs for post-v1 consideration (not committed):
- `disclose` — structured information disclosure with audit trail (regulatory filings, corporate disclosures).
- `vote` — participate in a structured decision.
- `attest` — assert a signed claim about another party or event.

---

## 5. Where this leaves Pathfinder integration

Pathfinder's `anton-portal` engine uses the capability verbs as structured search filters:

- "Find catering portals in Stockholm" → `verb=order AND tags=[catering] AND serviceArea=SE-AB`.
- "Find paying donation opportunities for humanitarian causes" → `verb=pay AND purpose=donation AND tags=[humanitarian]`.
- "Find available tennis courts Saturday evening" → `verb=book AND tags=[tennis] AND availability includes 2026-SS-DDTEE:00:00`.

Custom verbs are surfaced only in free-text search. This is by design — it rewards portals that use the standard vocabulary.

---

## 6. Payment section

**v1.0.0 status:** Schema is stable; specific `type` values are placeholders pending FutureChain's payment spec. Additions to the `type` enum come in minor versions.

### 6.1 Structure

```json
"payment": {
  "supportedMethods": [
    {
      "id": "futurechain-stablecoin-eurc",
      "rail": "futurechain",
      "type": "stablecoin",
      "currency": "EURC",
      "settlement": "instant",
      "minimumAmount": 1.00,
      "maximumAmount": 50000.00,
      "feeStructure": {
        "payerPaysFee": false,
        "estimatedFeeBps": 25
      }
    },
    {
      "id": "futurechain-invoice-eur",
      "rail": "futurechain",
      "type": "invoice",
      "currency": "EUR",
      "settlement": "net-30",
      "creditCheckRequired": true
    },
    {
      "id": "external-bank-transfer",
      "rail": "external",
      "type": "offline",
      "currency": "EUR",
      "note": "Bank transfer after phone confirmation.",
      "instructionsUrl": "pages/payment-instructions.html"
    }
  ],
  "preferredMethod": "futurechain-stablecoin-eurc"
}
```

### 6.2 Vocabulary

**`rail`:**
- `futurechain` — routed through FutureChain payment rails.
- `external` — handled outside ANTON (bank transfer, invoice, cash).

**`type`** (v1.0.0 placeholder values; confirm with FutureChain):
- `stablecoin` — stablecoin on-chain transfer.
- `native` — native blockchain token.
- `invoice` — deferred settlement with credit.
- `escrow` — held in escrow until release.
- `offline` — human-mediated out-of-band.

**`settlement`:**
- `instant` — confirmed at time of transaction.
- `net-30`, `net-60`, `net-90` — deferred.
- `escrow-release` — upon explicit release.
- `offline` — determined by out-of-band process.

### 6.3 Integration with capabilities

A capability references payment methods by `id`:

```json
"paymentCoupling": {
  "required": true,
  "methods": ["futurechain-stablecoin-eurc", "external-bank-transfer"]
}
```

The visitor's ANTON cross-references against `payment.supportedMethods` to display options and execute via the appropriate rail.

### 6.4 Fee transparency

If `feeStructure.payerPaysFee` is `true`, the visitor's ANTON MUST display the estimated fee before confirming payment. If `false`, the portal absorbs the fee. This is a material disclosure — clients that fail to surface it are broken.

### 6.5 Out of scope for v1.0.0

- Multi-currency automatic conversion.
- Refund protocol.
- Chargeback handling.
- Tax calculation (each portal handles its own tax via extended schema).
- Recurring payments (planned v1.1+).

---

## 7. Policies section

**This is how agents enforce user preferences on behalf of their user.** Policy fields are functional, not decorative.

### 7.1 Structure

```json
"policies": {
  "terms": {
    "url": "pages/terms.html",
    "version": "2026-01-15",
    "structured": {
      "jurisdiction": "SE",
      "governingLaw": "Swedish Contract Law (1915:218)",
      "disputeResolution": "Swedish district courts",
      "limitationOfLiability": "capped_at_transaction_value",
      "warrantyProvided": false
    }
  },
  "privacy": {
    "url": "pages/privacy.html",
    "version": "2026-01-15",
    "structured": {
      "controller": {
        "legalName": "Local Catering AB",
        "registrationNumber": "559123-4567",
        "contactEmail": "privacy@local-catering.futurechain.portal"
      },
      "lawfulBasis": ["contract", "legitimate_interest"],
      "retentionPolicies": [
        {"dataType": "order", "retentionDays": 2555, "reason": "tax_compliance"},
        {"dataType": "inquiry", "retentionDays": 365, "reason": "operational"},
        {"dataType": "marketing_consent", "retentionDays": 0, "reason": "not_collected"}
      ],
      "transfersOutsideEEA": false,
      "automatedDecisionMaking": false,
      "dsrAddress": "privacy@local-catering.futurechain.portal"
    }
  },
  "dataMinimisation": {
    "inputsCollectedByDefault": ["name", "contact", "order_details"],
    "inputsOptional": ["dietary_requirements", "marketing_opt_in"],
    "inputsNeverCollected": ["date_of_birth", "government_id", "payment_card_direct"]
  },
  "cookies": {
    "applicable": false
  },
  "ageRequirement": {
    "minimumAge": 18,
    "reason": "alcohol_sales"
  }
}
```

### 7.2 Policy enforcement by visitor's ANTON

The visitor's ANTON cross-references portal policies against the user's preferences:

- User policy "don't share data with portals retaining beyond 5 years" — flag before invoking `order` on this portal (retention is 7 years).
- User policy "EU-only data processing" — flag any portal with `transfersOutsideEEA: true`.
- User policy "no automated decision-making" — flag portals with `automatedDecisionMaking: true`.
- User is 16 — block portals with `ageRequirement.minimumAge > 16`.

This is not aspirational. The descriptor enables it; the visitor ANTON implements it.

### 7.3 Legal authority

Policy fields declare the portal's claims. They do not create legal bindings beyond what the underlying jurisdiction provides. The structured fields exist so agents can act on them; the `url` fields remain authoritative for human interpretation.

---

## 8. Availability section

### 8.1 Structure (v1.0.0 simple form)

```json
"availability": {
  "timezone": "Europe/Stockholm",
  "hoursOfOperation": {
    "mon": [{"open": "09:00", "close": "17:00"}],
    "tue": [{"open": "09:00", "close": "17:00"}],
    "wed": [{"open": "09:00", "close": "17:00"}],
    "thu": [{"open": "09:00", "close": "17:00"}],
    "fri": [{"open": "09:00", "close": "15:00"}],
    "sat": [],
    "sun": []
  },
  "leadTimeDays": 7,
  "bookingHorizonDays": 180,
  "unavailableDates": ["2026-12-24", "2026-12-25", "2026-12-26"]
}
```

### 8.2 Multiple open windows per day

Arrays allow split hours:

```json
"mon": [
  {"open": "09:00", "close": "12:00"},
  {"open": "13:00", "close": "17:00"}
]
```

### 8.3 Out of scope for v1.0.0

- RRULE-style complex recurrence.
- Per-resource capacity (a sports club with multiple courts needs custom input schemas in `book`).
- Timezone overrides per capability.
- Event-based availability (only available during ongoing events).

These are planned for v1.1+ calendar/scheduling enrichment.

---

## 9. Attestations section

### 9.1 Purpose

Portals can declare claims about themselves. In v1.0.0, these are **self-declared only** — no cryptographic verification by third parties. v1.1+ will add signed attestations from trusted issuers.

### 9.2 Structure

```json
"attestations": [
  {
    "type": "business_registration",
    "issuer": "self",
    "claim": {
      "jurisdiction": "SE",
      "registrationNumber": "559123-4567",
      "registeredName": "Local Catering AB"
    },
    "claimedAt": "2026-04-01T00:00:00.000Z",
    "verificationMethod": "user_declared",
    "verificationNote": "Self-declared. Confirm via Bolagsverket before high-value engagements."
  },
  {
    "type": "domain_experience",
    "issuer": "self",
    "claim": {
      "description": "15 years in corporate catering, 5000+ events.",
      "references": "Available on request."
    },
    "claimedAt": "2026-04-01T00:00:00.000Z",
    "verificationMethod": "user_declared"
  }
]
```

### 9.3 Attestation types (v1.0.0)

- `business_registration` — company registration data.
- `identity_verification` — individual identity verification (self-declared in v1).
- `domain_experience` — free-form experience claim.
- `compliance_certification` — held certification (ISO, SOC, etc.).
- `membership` — membership in a professional body.
- `license` — professional license.
- `other` — catch-all with free-form `claim`.

### 9.4 Reserved for v1.1+: third-party issuers

The schema reserves:

```json
{
  "type": "business_registration",
  "issuer": "bolagsverket.se",
  "issuerPublicKey": "<Ed25519 public key>",
  "claim": { /* ... */ },
  "signature": "<Ed25519 signature by issuer>",
  "validFrom": "<ISO 8601>",
  "validUntil": "<ISO 8601>"
}
```

In v1.0.0 this format is not accepted as verified — clients display it as self-declared. v1.1+ will add an issuer trust registry.

Reserved issuer identifiers (v1.1+):
- `openEXPERT-marketplace` — ANTON Marketplace certification.
- `futurechain-gateway` — Companion App Gateway identity verification.
- `futurechain-kyc` — (planned) KYC attestation for commerce portals.

### 9.5 Display rules

Clients MUST clearly indicate self-declared vs verified status. An unverified attestation displayed as verified is a UX failure equivalent to a security vulnerability.

---

## 10. Discovery metadata

Used by Pathfinder and the registry's `capability_summary` for indexing.

```json
"discoveryMetadata": {
  "publicIndex": true,
  "primaryCategory": "commerce",
  "secondaryCategories": ["food", "events"],
  "tags": ["catering", "events", "stockholm", "mediterranean"],
  "serviceAreas": ["SE-AB", "SE-C", "SE-D"],
  "languages": ["sv", "en"],
  "serviceRadius": {
    "centerLatitude": 59.3293,
    "centerLongitude": 18.0686,
    "radiusKm": 50
  },
  "keywords": ["corporate catering", "wedding catering", "vegan options"]
}
```

### 10.1 Category enum (v1.0.0)

- `personal`
- `business`
- `community`
- `commerce`
- `team`
- `creator`
- `bulletin`
- `classroom`
- `teacher`
- `organisation`
- `other`

(Expandable in minor versions.)

### 10.2 Service areas

`serviceAreas` uses ISO 3166-1 alpha-2 for countries and ISO 3166-2 for subdivisions.

### 10.3 Privacy

When `publicIndex: false`, this entire section is omitted from the registry's capability summary. The portal is only reachable by direct name resolution, not search.

---

## 11. Localisations

All user-facing string fields support localisation:

```json
"localizations": {
  "sv": {
    "portal.displayTitle": "Lokal Catering",
    "capabilities.catering-order.title": "Beställ catering",
    "capabilities.catering-order.description": "Beställ catering för evenemang på 20-200 personer.",
    "policies.terms.url": "pages/sv/terms.html"
  }
}
```

Keys use dot-path notation matching the descriptor structure.

### 11.1 Resolution

Visitor's ANTON selects the best available localisation based on user preference. Fallback order:

1. User's preferred language.
2. Portal's declared primary language (first in `identity.humanContact.languages`).
3. English.
4. First available localisation.

### 11.2 Descriptor root is authoritative

Non-localisable fields (schemas, IDs, timestamps, keys) are NOT in localisations. Only human-readable text is.

---

## 12. Extensions section

For forward compatibility and experimentation:

```json
"extensions": {
  "x-futurechain-payment-rail-v2": { /* future payment details */ },
  "x-myorg-internal-id": "custom tracking field"
}
```

Extension keys MUST be prefixed with `x-` to prevent collision with future standard fields. Clients ignore unknown extensions.

---

## 13. Canonicalisation and signing

### 13.1 Signing scheme

Same scheme as registry operations (see Registry Protocol Reference §6):

- Canonical JSON per RFC 8785.
- Ed25519 signature, base64url unpadded.
- Signature is over the entire descriptor document.

### 13.2 Signed envelope

Descriptors are served inside a signed envelope at the portal's AAP `/capabilities` endpoint:

```json
{
  "descriptor": { /* the descriptor document */ },
  "signature": "<Ed25519 signature by portal's key>",
  "signatureAlgorithm": "Ed25519",
  "signingKeyFingerprint": "<SHA-256 of portal's public key>"
}
```

### 13.3 Verification

Visitor's ANTON verifies:

1. Portal's public key (from registry) matches `signingKeyFingerprint`.
2. Signature is valid against canonical JSON of `descriptor`.
3. `descriptor.portal.contactHash` matches registry entry.
4. `descriptor.portal.publicKey` matches registry entry.
5. `validFrom` is not in the future (with 5 minute tolerance).
6. `validUntil` is not in the past.

Any failure produces a visible warning and MAY block capability invocation (configurable).

### 13.4 Descriptor hash for registry binding

The registry entry records a SHA-256 hash of the canonical descriptor. This hash is computed over the canonical JSON of the descriptor (NOT the envelope). When a portal updates its descriptor, it:

1. Produces new descriptor with incremented `descriptorId`.
2. Signs and publishes via AAP.
3. Submits `update_capability_summary` to the registry with the new hash.

The hash is the integrity binding between registry and served descriptor.

---

## 14. Caching and TTL

### 14.1 Descriptor cache TTL

Default: 24 hours. Override via HTTP-style header on AAP response or explicit `cacheTtlSeconds` field in descriptor.

### 14.2 Invalidation

Clients invalidate cached descriptors when:

- Registry `capability_summary` for that portal changes (specifically the `descriptorHash`).
- Cached descriptor's `validUntil` passes.
- Explicit refresh requested by user.
- Signature or verification failure occurs.

### 14.3 Offline serving

If a visitor cannot reach the portal but has a cached descriptor, they MAY display it with a clear "offline, descriptor may be stale" indication. They MUST NOT invoke capabilities against a stale descriptor without reconnecting.

---

## 15. Schema evolution

### 15.1 Versioning

`schemaVersion: "capability-MAJOR.MINOR.PATCH"`:

- **Patch** — editorial only.
- **Minor** — additive. New fields, new verbs, new enum values.
- **Major** — breaking. Requires coordinated client upgrade.

### 15.2 Forward compatibility rules

v1.0.0 clients MUST:

- Accept descriptors with unknown fields (ignore them).
- Treat unknown verbs as `custom` and surface them in UI with a "new capability type" marker.
- Accept unknown enum values in non-critical fields; reject or warn on unknown enum values in critical fields (payment type, jurisdiction).

### 15.3 Deprecation

When a field is deprecated in a minor version:

- It remains functional.
- Tools surface a soft warning.
- It is removed only in a subsequent major version.

---

## 16. Affected files

### 16.1 New files expected

- `server/services/capability-descriptor/schema.ts` — JSON Schema definitions for the descriptor.
- `server/services/capability-descriptor/validator.ts` — descriptor validation using existing JSON Schema library.
- `server/services/capability-descriptor/signer.ts` — sign/verify using shared Registry Protocol signing primitives.
- `server/services/capability-descriptor/builder.ts` — constructs descriptors from walkthrough output.
- `server/services/capability-descriptor/hash.ts` — computes descriptor hash for registry binding.
- `server/services/capability-descriptor/verbs/*.ts` — one file per core verb with baseline schemas.
- `server/services/portal-handler/capabilities-endpoint.ts` — serves the signed descriptor envelope at `/capabilities` AAP endpoint.
- `src/components/portal/CapabilityInvocationPanel.tsx` — UI for invoking capabilities in the Portal Viewer.
- `src/components/portal/PolicyWarningBanner.tsx` — surfaces policy mismatches with user preferences.

### 16.2 Existing files to extend

- Portal walkthrough conversation — generates capability entries from user answers.
- `anton-bundler.ts` — the portal bundle includes the descriptor.
- Pathfinder engine — consumes `capability_summary` for indexing.
- User preferences UI — adds policy preference fields (retention limit, jurisdiction, EEA-only, etc.) for visitor-side enforcement.

---

## 17. Acceptance criteria

### 17.1 Functional

- [ ] All 12 core verbs implemented with baseline schemas.
- [ ] `custom` verb escape hatch functional.
- [ ] Descriptor validation catches schema violations before publish.
- [ ] Descriptor signing reuses Registry Protocol Reference signing primitives.
- [ ] Descriptor hash computes deterministically.
- [ ] Registry `update_capability_summary` operation submits correct hash.
- [ ] Visitor's ANTON fetches, verifies, and caches descriptors per §13-§14.
- [ ] Policy mismatch between portal and user preferences produces visible UI warning.
- [ ] Age-gating, jurisdiction-gating, and retention-gating all functional.
- [ ] Pathfinder searches return verb-filtered portal results.
- [ ] Custom verbs appear in free-text search but not verb-filtered search.
- [ ] Localisation fallback order respected.
- [ ] Payment method cross-reference between capability and portal `payment` section validates.
- [ ] Fee transparency rule (§6.4) enforced in UI.

### 17.2 Non-functional

- [ ] Descriptor validation completes under 50ms for a typical descriptor.
- [ ] Canonical JSON produces byte-identical output cross-platform for the same descriptor.
- [ ] All declared JSON Schema fragments validate against JSON Schema Draft 2020-12.
- [ ] Descriptor hash computation is deterministic across implementations.
- [ ] No hand-rolled cryptography.
- [ ] No hand-rolled canonicalisation.
- [ ] No duplication of signing logic from Registry Protocol Reference.

### 17.3 Forward-compatibility

- [ ] v1.0.0 client ignores unknown fields.
- [ ] v1.0.0 client treats unknown verbs as `custom`.
- [ ] Extension keys (`x-*`) do not break validation.
- [ ] Post-v1 verb additions do not invalidate v1 descriptors.

### 17.4 Security

- [ ] Unsigned descriptors are rejected.
- [ ] Signature verification failure blocks capability invocation (unless user explicitly overrides with warning).
- [ ] Self-declared attestations clearly labelled as such in UI.
- [ ] Mismatched `contactHash` or `publicKey` between descriptor and registry rejects the descriptor.
- [ ] Expired descriptors (`validUntil` in past) produce explicit warning.

---

## 18. Open questions (non-blocking, resolve before freeze)

1. **Confirm FutureChain payment vocabulary** before v1.0.0 freeze. Current values in §6.2 are placeholders.
2. **JSON Schema version.** Draft 2020-12 assumed; confirm against ANTON's existing JSON Schema usage in investigation.
3. **Localisation key convention.** Dot-path keys assumed; alternative is nested object structure. Choose based on existing i18n infrastructure.
4. **Age-gating legal basis.** Some jurisdictions require age verification with attestation; others accept self-declaration. v1.0.0 accepts self-declaration; document the limitation.
5. **Reserved attestation issuer list.** Current list (openEXPERT-marketplace, futurechain-gateway, futurechain-kyc) is a best-guess; confirm with FutureChain.
6. **Descriptor size limit.** Practical cap to prevent DoS. Suggest 512KB canonical JSON; verify during implementation.
7. **Capability count limit per descriptor.** Suggest 50; confirm against real-world needs.

---

## 19. Glossary

| Term | Meaning |
|------|---------|
| **Descriptor** | The machine-readable JSON document describing a portal's capabilities. |
| **Verb** | A standardised capability type (contact, order, pay, etc.). |
| **Capability object** | A single capability declaration inside a descriptor. |
| **Payment coupling** | The relationship between a capability and payment methods. |
| **Policy** | Portal's declared terms, privacy, retention, and data-minimisation claims. |
| **Attestation** | Self-declared or (v1.1+) issuer-signed claim about the portal. |
| **Discovery metadata** | Fields used by Pathfinder for search indexing. |
| **Baseline schema** | The minimum input/output schema every portal SHOULD extend for a given verb. |
| **Descriptor hash** | SHA-256 of canonical descriptor JSON, bound to registry entry. |

---

## 20. Appendix: Complete example

A full descriptor for a small catering business:

```json
{
  "schemaVersion": "capability-1.0.0",
  "descriptorId": "desc-2026-09-01-v3",
  "issuedAt": "2026-09-01T10:00:00.000Z",
  "validFrom": "2026-09-01T10:00:00.000Z",
  "validUntil": "2027-09-01T10:00:00.000Z",
  "portal": {
    "name": "local-catering.futurechain.portal",
    "namespace": "futurechain",
    "displayTitle": "Local Catering Co.",
    "category": "commerce",
    "contactHash": "ANTON-7K9P-M2XN-4Q3V-HB5W",
    "publicKey": "p7XKz3fG6h9_D2eR4sT8uV0wXyZbC1dE3fH5iJ7kL9m"
  },
  "identity": {
    "humanContact": {
      "available": true,
      "primaryAddress": "anna@local-catering.futurechain.portal",
      "displayName": "Anna Lindberg",
      "role": "Owner",
      "languages": ["sv", "en"],
      "responseTimeHours": 24
    },
    "agentContact": {
      "available": true,
      "preferredProtocolVersion": "aap-1.0",
      "supportedMessageTypes": ["portal_fetch", "capability_invoke", "capability_inquire"]
    },
    "organisationDetails": {
      "legalName": "Local Catering AB",
      "registrationNumber": "559123-4567",
      "jurisdiction": "SE"
    }
  },
  "capabilities": [
    {
      "id": "catering-order",
      "verb": "order",
      "title": "Place a catering order",
      "description": "Order catering for events of 20-200 people. 7-14 day lead time.",
      "aapEndpoint": "orders",
      "inputSchema": { /* extended order baseline with catering-specific fields */ },
      "outputSchema": { /* extended order baseline */ },
      "paymentCoupling": {
        "required": true,
        "methods": ["futurechain-stablecoin-eurc", "external-bank-transfer"],
        "priceModel": "quote"
      },
      "slaHints": {
        "acknowledgmentTimeMinutes": 60,
        "resolutionTimeHours": 24
      },
      "tags": ["catering", "corporate", "events"]
    },
    {
      "id": "catering-inquiry",
      "verb": "inquire",
      "title": "Ask about availability",
      "description": "Check if a date is available before placing an order.",
      "aapEndpoint": "inquiries",
      "inputSchema": { /* inquire baseline */ },
      "outputSchema": { /* inquire baseline */ }
    }
  ],
  "payment": {
    "supportedMethods": [
      {
        "id": "futurechain-stablecoin-eurc",
        "rail": "futurechain",
        "type": "stablecoin",
        "currency": "EURC",
        "settlement": "instant",
        "minimumAmount": 1.00,
        "maximumAmount": 50000.00
      },
      {
        "id": "external-bank-transfer",
        "rail": "external",
        "type": "offline",
        "currency": "EUR",
        "note": "Bank transfer after phone confirmation."
      }
    ],
    "preferredMethod": "futurechain-stablecoin-eurc"
  },
  "policies": {
    "terms": {
      "url": "pages/terms.html",
      "version": "2026-01-15",
      "structured": {
        "jurisdiction": "SE",
        "governingLaw": "Swedish Contract Law (1915:218)",
        "limitationOfLiability": "capped_at_transaction_value"
      }
    },
    "privacy": {
      "url": "pages/privacy.html",
      "version": "2026-01-15",
      "structured": {
        "controller": {
          "legalName": "Local Catering AB",
          "registrationNumber": "559123-4567",
          "contactEmail": "privacy@local-catering.futurechain.portal"
        },
        "retentionPolicies": [
          {"dataType": "order", "retentionDays": 2555, "reason": "tax_compliance"},
          {"dataType": "inquiry", "retentionDays": 365, "reason": "operational"}
        ],
        "transfersOutsideEEA": false,
        "automatedDecisionMaking": false,
        "dsrAddress": "privacy@local-catering.futurechain.portal"
      }
    }
  },
  "availability": {
    "timezone": "Europe/Stockholm",
    "hoursOfOperation": {
      "mon": [{"open": "09:00", "close": "17:00"}],
      "tue": [{"open": "09:00", "close": "17:00"}],
      "wed": [{"open": "09:00", "close": "17:00"}],
      "thu": [{"open": "09:00", "close": "17:00"}],
      "fri": [{"open": "09:00", "close": "15:00"}],
      "sat": [],
      "sun": []
    },
    "leadTimeDays": 7,
    "bookingHorizonDays": 180,
    "unavailableDates": ["2026-12-24", "2026-12-25", "2026-12-26"]
  },
  "attestations": [
    {
      "type": "business_registration",
      "issuer": "self",
      "claim": {
        "jurisdiction": "SE",
        "registrationNumber": "559123-4567",
        "registeredName": "Local Catering AB"
      },
      "claimedAt": "2026-04-01T00:00:00.000Z",
      "verificationMethod": "user_declared"
    }
  ],
  "discoveryMetadata": {
    "publicIndex": true,
    "primaryCategory": "commerce",
    "secondaryCategories": ["food", "events"],
    "tags": ["catering", "events", "stockholm", "mediterranean"],
    "serviceAreas": ["SE-AB"],
    "languages": ["sv", "en"]
  },
  "localizations": {
    "sv": {
      "capabilities.catering-order.title": "Beställ catering",
      "capabilities.catering-order.description": "Beställ catering för evenemang på 20-200 personer. 7-14 dagars leveranstid.",
      "capabilities.catering-inquiry.title": "Fråga om tillgänglighet"
    }
  }
}
```

---

**End of Capability Descriptor Schema Reference v1.0.0-draft.**

*Extend via numbered addenda (1.0.0-A1, etc.) for clarifications. Additive changes produce 1.1.0. Breaking changes produce 2.0.0 with mandatory parallel-serve period.*
