# openEXPERT RegTech Compliance Pack
## Enterprise Procurement Document Bundle

**Version:** 1.0
**Date:** 2026-03-08
**Prepared by:** Futurechain AB (trading as openEXPERT / ANTON)

---

## OVERVIEW

This RegTech Compliance Pack consolidates the documents required by enterprise procurement and legal teams when evaluating and onboarding openEXPERT / ANTON. It covers:

1. Data Processing Agreement (DPA)
2. Vendor Security Profile
3. Incident Response Plan (IR Plan)
4. Service Level Agreement (SLA)
5. AI Ethics & Governance Statement

---

## 1. DATA PROCESSING AGREEMENT (DPA)

See `docs/GDPR_DPA_TEMPLATE.md` for the full DPA template.

**Key DPA facts:**
| Item | Detail |
|---|---|
| Data protection law | EU GDPR (2016/679) + UK GDPR |
| Processor location | Sweden (EU jurisdiction) |
| Sub-processor: Claude AI | Anthropic PBC (USA) — governed by EU SCCs |
| Data retention (default) | 90 days from last access; configurable |
| Breach notification | Within 48 hours of discovery |
| Audit rights | Yes — 14 days notice required |
| DPO contact | [INSERT DPO EMAIL] |

---

## 2. VENDOR SECURITY PROFILE

### 2.1 Application Security

| Control | Status | Notes |
|---|---|---|
| OWASP Top 10 mitigations | Implemented | See `docs/OWASP_COMPLIANCE.md` |
| Content Security Policy | Implemented | `script-src 'self'` — no unsafe-inline |
| HTTPS enforced (production) | Yes | HTTP Strict Transport Security header |
| Input validation | Yes | Zod schemas on all API endpoints |
| SQL injection prevention | Yes | Parameterised queries throughout |
| Path traversal prevention | Yes | `path.resolve()` + boundary checks |
| File type validation | Yes | Magic byte checking via `file-type` |
| ZIP bomb protection | Yes | 100× expansion ratio limit |
| Rate limiting | Yes | Per-endpoint via `express-rate-limit` |
| Authentication | JWT (httpOnly cookie) + TOTP MFA available |
| Session management | Server-side session store; automatic expiry |

### 2.2 Infrastructure Security

| Item | Detail |
|---|---|
| Deployment model | Local (on-premise) by default — data never leaves client infrastructure |
| Cloud option | Customer-managed hosting on any EU/UK cloud provider |
| Network exposure | Local port (default: 3001) — not internet-exposed by default |
| API key storage | Server-side only — never exposed to browser |
| Database | SQLite (solo) or PostgreSQL (team) — customer-managed |
| Encryption at rest | Filesystem-level encryption required at customer's discretion |
| Encryption in transit | TLS 1.2+ for all API calls; customer responsible for HTTPS termination |

### 2.3 AI/LLM Security

| Item | Detail |
|---|---|
| Model provider | Anthropic PBC (Claude API) |
| Prompt injection defence | Pattern-based sanitisation + document context isolation |
| Data sent to Anthropic | Prompts only — no data stored by Anthropic for training (API tier) |
| Web search | Optional; disabled by default; user-controlled |
| Output hallucination | Mitigated by `strict` creativity mode; all outputs marked as AI-generated |
| Citation verification | Optional citation confidence scoring available |

### 2.4 Certifications (Roadmap)

| Certification | Status | Target |
|---|---|---|
| ISO 27001 | Planned | 2027 Q1 |
| SOC 2 Type II | Planned | 2027 Q1 |
| Cyber Essentials Plus (UK) | In progress | 2026 Q4 |
| BSI IT-Grundschutz | Under evaluation | 2027 |

---

## 3. INCIDENT RESPONSE PLAN

### 3.1 Scope

This IR Plan covers security incidents affecting openEXPERT deployments, including:
- Personal data breaches
- Unauthorised access to client data
- Compromise of the Claude API key
- Malware or ransomware affecting the local installation

### 3.2 Incident Classification

| Severity | Description | Response Time | Escalation |
|---|---|---|---|
| P1 Critical | Personal data breach; system compromise; data exfiltration | Within 1 hour | CISO + DPO + Legal immediately |
| P2 High | Suspected breach; significant service disruption; API key exposure | Within 4 hours | CISO + DPO |
| P3 Medium | Failed breach attempt; performance degradation; policy violation | Within 24 hours | Security team |
| P4 Low | Suspicious activity; configuration error; user reporting | Within 5 business days | Security team |

### 3.3 Response Phases

**Phase 1 — Detection & Identification**
- Automated alerts from application logs, rate-limit monitors, audit log anomalies
- User report via security contact: [INSERT SECURITY EMAIL]
- Initial classification and severity assignment

**Phase 2 — Containment**
- P1/P2: Isolate affected system; revoke active sessions; rotate API keys
- Preserve evidence: logs, database snapshots, network captures
- Notify internal stakeholders per escalation matrix

**Phase 3 — Notification**
- Personal data breaches: notify Controller (customer) within 48 hours
- Controller's responsibility: notify supervisory authority within 72 hours of becoming aware (Art. 33 GDPR)
- Data Subject notification: per Controller's legal assessment

**Phase 4 — Eradication & Recovery**
- Root cause analysis
- Patch/fix deployment
- System restoration from clean backup
- API key rotation

**Phase 5 — Post-Incident Review**
- Written post-mortem within 5 business days
- Lessons learned documented
- Control improvements implemented

### 3.4 Security Contacts

| Role | Contact |
|---|---|
| Security incidents | [INSERT SECURITY EMAIL] |
| Data Protection Officer | [INSERT DPO EMAIL] |
| Out-of-hours escalation | [INSERT PHONE] |

---

## 4. SERVICE LEVEL AGREEMENT

### 4.1 Service Description

openEXPERT / ANTON is a **local-first application** running on customer infrastructure. Futurechain's SLA obligations relate to:
- Software updates and security patches
- API compatibility (Claude API integration)
- Support response times
- Bug fixes

Futurechain is NOT responsible for:
- Uptime of customer-managed infrastructure
- Claude API availability (governed by Anthropic's terms)
- Network connectivity at customer sites

### 4.2 Support Tiers

| Tier | Included In | Response Time (P1) | Response Time (P2) | Response Time (P3) |
|---|---|---|---|---|
| Standard | All licenses | 8 business hours | 2 business days | 5 business days |
| Professional | Pro+ licenses | 4 business hours | 1 business day | 3 business days |
| Enterprise | Enterprise contracts | 2 business hours | 4 business hours | 1 business day |

Business hours: Monday–Friday 08:00–18:00 CET (excluding Swedish public holidays).

### 4.3 Security Patch SLA

| Severity | Patch Release Target |
|---|---|
| Critical (CVSS 9.0+) | Within 24 hours of confirmed discovery |
| High (CVSS 7.0–8.9) | Within 7 days |
| Medium (CVSS 4.0–6.9) | Within 30 days |
| Low (CVSS < 4.0) | Next scheduled release |

### 4.4 Software Updates

- Major versions: twice yearly (Q1 and Q3)
- Minor versions / feature releases: monthly
- Security patches: as required per above SLA
- LTS (Long-Term Support) versions: 24 months security patch support for designated releases

### 4.5 Exclusions

The SLA does not cover:
- Downtime caused by customer infrastructure failures
- Issues arising from customer modifications to the software
- Force majeure events
- Scheduled maintenance (7 days notice given)

---

## 5. AI ETHICS & GOVERNANCE STATEMENT

### 5.1 Our Principles

**Transparency:** Every output from ANTON is clearly labelled as AI-generated. Token usage, model version, and reasoning effort are displayed to users.

**Human oversight:** ANTON never makes final compliance decisions. It provides analysis, drafts, and structured frameworks. The responsible professional always makes the final determination.

**Accuracy over creativity:** Compliance modules default to `strict` mode — factual, cited, conservatively worded. No hallucinations are presented as facts.

**No unauthorised data use:** Customer data is not used to train AI models. API calls to Anthropic are governed by enterprise API terms that prohibit training data use.

**Explainability:** The "How ANTON Thought" feature exposes the reasoning process. Users can always see what sources were used and how conclusions were reached.

### 5.2 Intended Use

openEXPERT / ANTON is designed for use by qualified financial crime compliance professionals, lawyers, and regulatory advisors. It is not designed for:
- Consumer-facing decision-making
- Automated credit or lending decisions
- Autonomous enforcement actions
- Replacing qualified legal advice

### 5.3 Bias & Fairness

- System prompts are reviewed for domain accuracy by FCP domain experts
- Regulatory content is updated to reflect current guidance
- No demographic or personal characteristics of individuals are used in compliance analysis
- Users are encouraged to apply professional judgement when reviewing AI outputs

### 5.4 Governance

| Responsibility | Owner |
|---|---|
| AI ethics oversight | Futurechain Ethics & Safety Committee |
| Prompt quality review | FCP Domain Expert Panel |
| Security oversight | CISO (Futurechain) |
| Data protection | Data Protection Officer (Futurechain) |
| Model risk | Updated with each major Claude model upgrade |

---

## DOCUMENT CONTROL

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 2026-03-08 | Futurechain Legal & Security | Initial release |

**Distribution:** Enterprise customers — procurement and legal teams only.
**Classification:** Confidential — not for public distribution.

*For questions about this document, contact: [INSERT LEGAL EMAIL]*
