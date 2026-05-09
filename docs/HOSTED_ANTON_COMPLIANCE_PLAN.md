# Hosted ANTON — Compliance and Legal Plan

**Status:** Draft — pending EU data-protection counsel review
**Owner:** FutureChain (or dedicated subsidiary, TBD)
**Date:** 9 May 2026
**Related:** `hosted-anton-default-connection-brief.md` (architecture brief) · `docs/DATA-AND-LEGAL.md` (existing local-first posture) · `docs/GDPR_DPA_TEMPLATE.md` · `docs/REGTECH_COMPLIANCE_PACK.md`

> This document is not legal advice. It is a working plan built on the architecture brief and CJEU precedent. Every section marked **Counsel** must be reviewed and signed off by an EU data-protection lawyer before the hosted instance reaches production users.

---

## 1. Why this document exists

The Companion App is gaining a hosted default connection (`connect.anton.network`) operated by FutureChain. Mesh transport routes through `relay.futurechain.eu`, also operated by FutureChain. Both transports handle EU users' personal data in the form of connection metadata — IPs, peer identifiers, timing, message-size patterns — even though end-to-end message content is opaque to the operator.

This is a material change from the platform's prior posture. `docs/DATA-AND-LEGAL.md` states "no openEXPERT cloud service, no central server operated by FutureChains" — that statement remains accurate for users running heavy ANTON locally and will continue to be accurate for them. It is no longer accurate for users on the hosted default. The privacy notice surface needs to fork, not be edited in place.

**This plan covers what FutureChain must do to operate the hosted services lawfully under GDPR (and, when payments wire, jointly under AMLR).** The architecture brief's Phase 0.5 is the build-side summary; this is the working document.

---

## 2. Legal status determination

### 2.1 Controller, processor, joint controller — by asset

| Data asset | Where stored | Status | Reasoning |
|---|---|---|---|
| Connection metadata (IP, timestamp, peer identifier, traffic patterns) on `connect.anton.network` | FutureChain servers (Bahnhof, Sweden) | **Controller** | Operator determines means (servers, routing logic). IPs are personal data per CJEU *Breyer* C-582/14. |
| Connection metadata on `relay.futurechain.eu` | FutureChain servers | **Controller** | Same analysis. Mesh's "decentralised" framing has no GDPR effect — what matters is whose infrastructure handles the data. |
| Identity registry (`ANTON-XXXX-XXXX-XXXX-XXXX` ↔ pubkey) | Hosted instance database | **Controller** | Registry exists because operator chose to provide it; means and purpose are operator-determined. |
| Encrypted media blobs | Hosted instance blob store | **Controller** | Operator stores them; cannot read content; controller status applies because the blob itself + its association with sender/recipient is personal data even when opaque. |
| E2E message plaintext | Sender + recipient devices only | **Not a controller** | Operator cannot decrypt. Keys never leave the device. |
| Local ANTON content for users running their own instance | User's own machine | **Not a controller** | Position unchanged from `DATA-AND-LEGAL.md`. |
| Hosted-routed traffic for users running a self-hosted ANTON paired through hosted | FutureChain servers | **Joint controller with the user under Article 26** | User decides what to send to whom; operator decides how to route. Article 26 arrangement required. |

### 2.2 Why "mere conduit" does not apply

The e-Commerce Directive (2000/31/EC) Article 14 grants liability shielding for transparent conduits. **It does not shield against GDPR obligations.** CJEU *Tele2 Sverige* (C-203/15) and *La Quadrature du Net* (C-511/18) confirm that even passive operators carrying traffic remain controllers for traffic metadata under data-protection law. Telecoms-style routing is the closest analogue and telecoms are full data-protection controllers for traffic metadata.

**Counsel:** Confirm this analysis applies to FutureChain's specific fact pattern. Verify whether ePrivacy Directive (2002/58/EC) confidentiality-of-communications obligations also apply, and how they interact with Article 6(1) lawful-basis selection.

---

## 3. Lawful bases per processing operation

GDPR Article 6 requires a lawful basis for every processing operation. One basis per operation, documented in the Article 30 records.

| Operation | Proposed basis | Risk / note |
|---|---|---|
| Identity registration on first launch | Article 6(1)(b) — necessary for performance of contract | User explicitly initiates; clean. |
| Routing user's outbound messages | Article 6(1)(b) — performance of contract | Clean. |
| Routing inbound messages to user from non-hosted peers | Article 6(1)(f) — legitimate interest, with balancing test | The third-party recipient never agreed to FutureChain processing. Balancing test must be documented. |
| Storing encrypted media blobs | Article 6(1)(b) — performance of contract | Clean for the user who uploaded. |
| Connection-metadata logging (transient, for routing) | Article 6(1)(f) — legitimate interest | Time-bounded. Balancing test documented. |
| Abuse / anti-spam analysis | Article 6(1)(f) — legitimate interest | Balancing test must address risk to legitimate users. |
| Security-incident investigation | Article 6(1)(f) — legitimate interest | Standard. |
| Statutory retention if AMLR applies (Phase 6) | Article 6(1)(c) — legal obligation | Activates only when payments wire. Until then, no AMLR retention. |

**Counsel:** Validate each basis. Confirm whether Article 6(1)(b) genuinely covers metadata routing (some authorities prefer 6(1)(f) for the metadata layer even when 6(1)(b) covers the underlying service).

---

## 4. Privacy notice — Article 13 disclosures

Published at `connect.anton.network/privacy` and surfaced in the Companion App on first launch before identity is registered.

### 4.1 Required content

- Identity and contact details of the controller (registered legal entity, address, email)
- DPO contact details (Article 13(1)(b))
- Each processing operation: purpose, lawful basis, retention period
- Categories of recipients (Bahnhof as sub-processor, etc.)
- Whether data is transferred outside the EU/EEA (Bahnhof = Sweden, so transfers default to nil)
- Data subject rights (access, rectification, erasure, portability, object, restrict, complain to a supervisory authority)
- **Honest disclosure that access requests for E2E content cannot be fulfilled** because the operator cannot decrypt it — this is unusual and must be stated plainly

### 4.2 First-launch consent surface

The Companion App must show a plain-language summary of the privacy posture before a hosted identity is generated. Minimum:

- "FutureChain operates this service. We see when you connect and who you message. We do not see your messages — they are encrypted on your device."
- "Your messages, photos and videos are end-to-end encrypted. We cannot read them. Neither can anyone else."
- "If you lose your device, we cannot recover your messages." (or different wording per Decision 4 outcome)
- Link to full privacy notice + ToS

**This is a UX design item, not a legal one. Phase 2 acceptance must include this surface.**

---

## 5. DPIA (Article 35)

Article 35 requires a DPIA for processing "likely to result in a high risk to the rights and freedoms of natural persons." Large-scale messaging routing meets the threshold (Article 35(3)(b) — "systematic and extensive" processing of personal data; Working Party 29 guidelines list communications metadata at scale as high-risk).

### 5.1 What the DPIA must cover

- Description of the processing — flows, data categories, recipients, retention
- Necessity and proportionality — why the processing is needed for the purpose, why less data couldn't achieve it
- Risks to data subjects — confidentiality, identification, profiling, unauthorised access, regulatory access requests
- Mitigations — encryption, retention limits, logging discipline, access controls, incident response
- Residual risk — if any risk remains "high" after mitigation, Article 36 requires consultation with the supervisory authority before processing begins

### 5.2 Sequencing

DPIA drafting can begin from this plan as input. Sign-off by the DPO (or external counsel acting in that role until the DPO is appointed) is a **gate before Phase 2 ships to production users.** Staging-internal Phase 2 work can proceed without it.

**Counsel:** Decide if Article 36 prior consultation will be needed. The signal: any residual risk classified "high" after mitigations are applied.

---

## 6. Records of processing — Article 30

Internal but mandatory. One record per processing activity.

### 6.1 Records to maintain

- Identity registration
- Message routing (mesh path)
- Message routing (HTTPS path)
- Media blob storage
- Connection metadata logging
- Abuse / anti-spam analysis
- Security-incident investigation
- Account deletion / erasure handling

### 6.2 Per-record content

Per Article 30(1):

- Name and contact details of the controller and DPO
- Purposes of the processing
- Categories of data subjects and personal data
- Categories of recipients
- Transfers outside the EU/EEA
- Time limits for erasure
- Description of technical and organisational security measures (Article 32)

Maintained in a structured format (spreadsheet, internal wiki, or `docs/compliance/article-30-records.md`). Reviewed and updated on every processing change, at minimum quarterly.

---

## 7. DPO (Article 37)

### 7.1 Trigger

Article 37(1)(b) requires a DPO when "core activities consist of processing operations which require regular and systematic monitoring of data subjects on a large scale." Communications routing at user scale meets this. Appointment is mandatory once the service has more than a trivial user count, and prudent from day one.

### 7.2 Role

- Independent reporting line to the highest level of management
- Cannot be dismissed or penalised for performing DPO duties
- Tasks per Article 39: monitor compliance, train staff, advise on DPIA, cooperate with the supervisory authority, act as contact point for data subjects

### 7.3 Options

| Option | Pros | Cons |
|---|---|---|
| Internal DPO | Embedded in operations, cheap | Requires conflict-of-interest separation; small team makes this hard |
| External DPO (firm) | Independence built in, lower personnel risk | Less embedded, slower for technical questions |
| Counsel acting as DPO ad interim | Fast path to coverage | Long-term cost; shouldn't be permanent |

**Recommendation:** External DPO firm from the start. Cheaper than the conflict-of-interest plumbing for an internal one when the team is small.

**Counsel:** Confirm the DPO appointment process under the relevant supervisory authority (Datainspektionen / IMY in Sweden, given Bahnhof hosting; or another EU member-state authority if FutureChain's establishment is elsewhere).

---

## 8. Article 26 joint-controller arrangements

### 8.1 When this triggers

Any user running a self-hosted ANTON who pairs their instance through `relay.futurechain.eu` (or `connect.anton.network` for identity resolution) creates a joint-controller relationship with FutureChain. The user determines what they send and to whom; FutureChain determines the routing infrastructure.

### 8.2 Required content

Per Article 26(1):

- Determination of respective responsibilities for compliance, especially:
  - Which party handles data subject rights requests (likely: requests reach whichever party the data subject contacts; that party routes to the other)
  - Article 13/14 information provision (likely: each party handles for the data subjects they directly interact with)
  - Breach notification (likely: each party notifies for breaches of their part of the chain; coordinate on cross-cutting breaches)
- The essence of the arrangement must be made available to data subjects

### 8.3 Format

A standard template at `docs/compliance/joint-controller-template.md`, presented to self-hosted operators on first connection through the hosted relay. Acceptance recorded server-side. Template reviewed by counsel.

---

## 9. Sub-processors and Article 28 DPAs

### 9.1 Identified sub-processors

| Sub-processor | Service | DPA status |
|---|---|---|
| Bahnhof AB | Hosting (Stockholm) | Required |
| (TBD) Email transactional | Privacy notice / DPO contact emails | Required |
| (TBD) DDoS / WAF | Edge protection if used | Required |
| (TBD) Monitoring / observability | Logs, metrics — must enforce no-PII contract | Required |
| (TBD) Backup storage | Identity registry backups | Required |

### 9.2 Article 28 requirements

Each DPA must include:

- Subject matter and duration of processing
- Nature and purpose
- Type of personal data and categories of data subjects
- Obligations and rights of the controller
- Sub-processor's obligations: process only on documented instructions, confidentiality, Article 32 security, assist with data-subject rights, notify breaches, delete or return data on termination, allow audits

`docs/GDPR_DPA_TEMPLATE.md` exists in the repo — review and adapt for hosted-ANTON sub-processors. Whether that template covers controller-to-processor adequately is an item for **Counsel**.

---

## 10. International transfers

Default position: data stays within EU/EEA (Bahnhof = Sweden).

**Risks to monitor:**

- Sub-processors with US-based parent companies (DDoS/WAF candidates, monitoring tools). May trigger Schrems II analysis even if the data centre is in the EU.
- DNS provider for `connect.anton.network` — typically not a transfer of personal data unless logging is active
- Push notification dispatch (APNs / FCM) — Apple and Google process push tokens, which are personal data. APNs/FCM data flows go to the US. This needs SCCs or adequacy reliance, and the privacy notice must disclose.

**Counsel:** Confirm SCCs are needed for APNs/FCM; confirm the post-Schrems II adequacy posture for any US sub-processor.

---

## 11. Data subject rights

Articles 15–22. The honest difficulty: most user-generated content is encrypted and unreadable to the operator.

| Right | How handled |
|---|---|
| Access (Art. 15) | Provide the data we have: identity registration record, connection metadata still within retention window, encrypted blob list. **Disclose plainly that we cannot decrypt content.** Provide what we can; refuse what we cannot with the encryption explanation. |
| Rectification (Art. 16) | Identity record is self-managed via the Companion App; operator-side rectification limited to operational data. |
| Erasure (Art. 17) | Delete identity record, encrypted blobs, sub-processor-held data. Connection metadata is on a short retention so usually nil. |
| Restriction (Art. 18) | Suspend account; preserve data without further processing. |
| Portability (Art. 20) | Identity record exportable in a structured format. Encrypted blobs exportable as-is (the user has the keys; operator cannot). |
| Object (Art. 21) | Particularly for processing under Article 6(1)(f); review balancing-test outcome. |
| Automated decision-making (Art. 22) | Not applicable in v1 — no automated decisions are made. Document this in Article 30 records. |

**Operational requirement:** A data-subject-rights inbox (`dsr@futurechain.eu` or equivalent), monitored, with one-month response SLA per Article 12(3). This must be staffed before Phase 2 production.

---

## 12. Breach notification — Articles 33 and 34

### 12.1 Internal process

- Detection — security monitoring, user reports, sub-processor notifications must reach a single on-call queue
- Triage — within 24 hours, determine if personal data breach, severity, affected subjects
- Notification clock starts at **awareness**, not detection — Article 33(1) requires 72 hours to the supervisory authority "where feasible"
- Documentation — every breach (notified or not) recorded in an internal breach register

### 12.2 Materials prepared in advance

- Notification templates for the supervisory authority
- Notification templates for affected data subjects (Article 34)
- Decision tree for "high risk to rights and freedoms" (the trigger for Article 34 user notification)
- Pre-assigned roles: who decides notification, who drafts, who reviews

---

## 13. Article 32 security measures

Documented technical and organisational measures (TOMs). Headline items:

- E2E encryption for message content (architecturally enforced — never decryptable by the operator)
- TLS 1.3 for all transport
- At-rest encryption for the identity registry, blob store, logs
- Key management — HSM or equivalent for any operator-held keys (signing keys for the relay, etc.)
- Access controls — least privilege, MFA, audit logging
- Network segmentation between public-facing surfaces and identity registry
- Patch management — defined SLA per severity
- Pen testing — annual minimum, plus on major architecture changes
- Incident response runbook
- Disaster recovery and backup integrity testing
- Vendor security review process

Maintained in `docs/compliance/article-32-toms.md`. Reviewed annually.

---

## 14. Retention and minimisation — designed in code

This section is the most architecture-coupled and the most often skipped in compliance plans. It is enforced **in code, not in policy.**

### 14.1 Connection metadata (relay + hosted)

- **Retention:** minutes to hours. Long enough to route a message and handle retries. **Not** days, weeks, or months.
- **Implementation:** TTL-based eviction on whatever store holds in-flight routing state. Aggregate logs (counts, not individuals) acceptable; per-peer logs not retained.
- **Test:** automated test verifying that connection metadata for a routed message is unreadable from the system within the defined window (e.g. 24 hours hard ceiling).

### 14.2 Logs

- **No IPs** in error logs after routing completes
- **No peer identifiers** (`ANTON-XXXX-...`) in error logs except where strictly necessary; hashed or truncated when required
- **Encrypted at rest**
- **Retention:** 30 days for error logs (operations need them for investigation); 24 hours for access logs (ephemeral)
- **No content scanning** under any pretext — once you scan E2E content, you have changed the controller relationship for content. The codebase must contain no path that could decrypt for the operator.

### 14.3 Identity registry

- Stored: `ANTON-XXXX-XXXX-XXXX-XXXX`, public key, registration timestamp
- **Not stored:** display name, phone number, email, avatar, biographical data
- Retention: indefinite while the account is active; deleted on erasure request

### 14.4 Encrypted media blobs

- Stored: ciphertext, content hash, sender's public key, upload timestamp
- Retention: 30 days from upload, OR until referenced by no current message — whichever is longer (TBD, requires UX decision: do users expect old chat photos to remain accessible?)
- Deleted on erasure request even if referenced by other users' chats

### 14.5 Code-enforcement test plan

Each retention rule has a corresponding automated test that fails if a future code change extends the retention boundary. Tests live in the same pull request as the policy.

---

## 15. AMLR / GDPR retention conflict — resolved on paper before Phase 6

When payments wire (Phase 6), AMLR will require retention of certain transaction data for five years (Directive 2015/849, Article 40 — and AMLR will preserve this with adjustments). This conflicts with GDPR's data-minimisation principle.

### 15.1 Resolution principle

- **GDPR-only data** (chat metadata, identity registration, media blobs): minimised retention as defined above
- **AMLR-scope data** (payment counterparty, amount, timestamp, KYC inputs, sanctions-screening results): five-year retention, separately stored, separately access-controlled
- **The schemas separate at write time.** AMLR-scope rows are not in the same table as GDPR-only routing data. Phase 6's schema must therefore be designed in Phase 1, even if no code writes to those tables until Phase 6.

### 15.2 Consequence for Phase 1

Phase 1's database migration must include reserved tables (or schemas) for AMLR-scope data, even if empty. This is the only way to avoid migrating live identity rows in Phase 6.

**Counsel:** Confirm that this two-table separation satisfies both GDPR minimisation and AMLR retention duties. Verify that the lawful basis for the AMLR table will be Article 6(1)(c) (legal obligation) and that this requires no consent.

---

## 16. Acceptance gates — what must exist before Phase 2 production

The brief states Phase 0.5 blocks Phase 2 production rollout. The specific gates:

| Gate | Owner | Evidence |
|---|---|---|
| Legal entity registered, address published | Daniel | Companies-house registration |
| DPO appointed and contact published | Daniel + DPO | Appointment letter, contact published |
| Privacy notice live at `connect.anton.network/privacy` | Daniel + counsel | URL serves the notice |
| ToS live and links to privacy notice | Daniel + counsel | URL serves the ToS |
| First-launch privacy summary in Companion App | Engineering | Screenshot, code reference |
| DPIA signed off | DPO / counsel | Document with sign-off |
| Article 30 records exist for all v1 processing operations | DPO | `docs/compliance/article-30-records.md` populated |
| Article 26 joint-controller template ready | Counsel | `docs/compliance/joint-controller-template.md` reviewed |
| Sub-processor DPAs signed (Bahnhof minimum) | Daniel | Signed DPAs on file |
| Article 32 TOMs documented | Engineering + DPO | `docs/compliance/article-32-toms.md` populated |
| Retention enforcement tests passing in CI | Engineering | Test suite green |
| DSR inbox staffed with response SLA | Operations | Inbox + runbook |
| Breach response runbook | Operations + DPO | Runbook + tabletop exercise complete |
| Counsel sign-off on the entire plan | Counsel | Letter of opinion |

Phase 2 production deployment cannot proceed until every gate is closed.

---

## 17. Standing items — post-launch

- Privacy notice review: annually, or on every material change
- Article 30 records review: quarterly
- DPIA review: on every material change to processing
- Sub-processor list audit: annually, or on every change
- Penetration test: annually
- DPO report to management: quarterly
- Tabletop breach exercise: annually

---

## 18. Open questions for counsel

These are the questions where this plan defers to expertise. They map to the **Counsel** flags scattered above.

1. Confirm controller-status analysis for both transports under EU and Swedish law.
2. Validate lawful-basis selection per processing operation. In particular: should metadata routing rest on 6(1)(b) or 6(1)(f)?
3. Confirm the Article 35 DPIA approach and whether Article 36 prior consultation will be required.
4. Confirm DPO appointment process under the relevant supervisory authority.
5. Confirm Article 26 joint-controller approach and review the template.
6. Confirm SCCs / adequacy approach for any US sub-processors (especially APNs / FCM).
7. Confirm that `docs/GDPR_DPA_TEMPLATE.md` is fit for purpose for hosted-ANTON sub-processors, or specify amendments.
8. Confirm the GDPR/AMLR retention separation principle works under both regimes.
9. Confirm interaction with the ePrivacy Directive (2002/58/EC) — does confidentiality of communications add obligations beyond GDPR?
10. Confirm whether a UK representative is required (post-Brexit, if UK users join).

---

## 19. Document status

This plan is the authoritative compliance roadmap for hosted ANTON. Updates require version bump. Sign-off from counsel converts status from Draft to Active. Phase 2 production cannot ship while status is Draft.

| Version | Date | Status | Notes |
|---|---|---|---|
| 0.1 | 2026-05-09 | Draft | Initial extraction from brief Phase 0.5 |
