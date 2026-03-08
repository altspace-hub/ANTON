# ROADMAP

> openEXPERT / FCP Workbench — planned work across phases.
> Items marked **done** are shipped. Others are prioritised by phase.

---

## Released (v0.2.x)

- 8 core FCP modules (Gap Analysis, Document Creation, Sanctions Advisory, Regulatory Monitor, Training, Data Management, Risk Assessment, Investigation Support)
- Claude Opus 4.6 with adaptive thinking + effort parameter
- 4-mode Knowledge Source System (Claude / Web / Local Folders / Combined)
- 22 output format chips (executive summary, gap matrix, action plan, policy doc, etc.)
- Export to .md / .docx / .xlsx / .pdf with ANTON branding
- Session management, conversation history, auto-summary
- Trust Score (Claude Haiku quality assessment)
- Citation Verifier with source grounding
- Change log injection on re-export
- PDF Table of Contents
- Orchestrator (observer → approver → executor stages, demo mode, pattern engine)
- Task Agent with SSE streaming and approach confirmation
- Data Partnerships (Roaring + Dow Jones mock connectors)
- Knowledge packs (AMLR 2024 included)
- Counsel's Desk + Gap Assessment Hub
- Multi-Model Deliberation Protocol
- Blockchain / MiCA area (7 modules)
- PE/VC area (12 modules)
- Healthcare modules (14 modules)
- NGO hub (9 areas)
- Creative production area (8 modules)
- Version History (per-entity diff viewer, semantic change summaries)
- i18n (30 locales)
- WCAG AA colour contrast
- Global focus-visible ring (keyboard navigation)

---

## Phase 6 — Module Quality & Domain Accuracy

- [x] FCP system prompt upgrades (all 8 modules — AMLR thematic frameworks)
- [x] Foundation prompts (healthcare, NGO, creative, school safety)
- [x] Version History side-panel and diff viewer in OutputToolbar
- [ ] FATF Recommendations cross-reference (AMLR knowledge pack)
- [ ] Nordic supervisory guidance knowledge pack
- [ ] UK FCA AML coverage
- [ ] DORA modules (ICT risk, incident reporting, third-party risk)
- [ ] MiCA/crypto coverage in blockchain area
- [ ] PSD2/payment institution module
- [ ] Solvency II / IDD insurance modules

---

## Phase 7 — Scalability & Architecture

- [ ] Auto-detect deployment mode (solo SQLite / team PostgreSQL)
- [ ] Multi-model cost calculator
- [ ] TOTP/MFA authentication
- [ ] Docker image + docker-compose.yml
- [ ] OpenAPI 3.0 specification at `/api/openapi.json`

_PostgreSQL migration, Redis, LDAP/SAML: deferred to team-deployment milestone._

---

## Phase 8 — Strategic Capabilities

- [ ] Vision capabilities (image upload for compliance document review)
- [ ] MCP interface (module definitions as MCP resources)
- [ ] GDPR DPA template
- [ ] RegTech Compliance Pack (vendor profile, IR plan, SLA)
- [ ] Compliance posture heatmap
- [ ] Risk appetite status dashboard

_Enterprise integrations (GoAML, Temenos, Graph, Slack, JIRA): deferred pending API partnerships._
_SOC 2 / ISO 27001: deferred pending audit engagement._

---

## Standalone / Ongoing

- [ ] Electron code signing (Windows SmartScreen)
- [ ] Electron auto-update
- [ ] Regulatory Feed subscription
- [ ] Soft-delete standardisation (`is_archived`)
- [ ] Performance: virtualise ConversationThread (react-virtual)

---

## Ideas Under Consideration

- Regulatory Comparison module (side-by-side current vs. new requirements)
- Client Proposal Generator
- Compliance Calendar
- Peer Review workflow
- Whistleblower Framework module
- Outsourcing Risk Assessment module
- Model router (Haiku → Sonnet → Opus based on task complexity)

---

*See `IMPROVEMENT_PLAN.md` for the full expert-review backlog with effort estimates.*
*See `DEFERRED_TASKS.md` for items blocked on external dependencies.*
