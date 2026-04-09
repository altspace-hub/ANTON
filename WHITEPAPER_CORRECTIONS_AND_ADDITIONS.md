# Whitepaper Corrections & Additions — April 2026 Audit

This document contains all corrections, number updates, and new content that needs to be added to ANTON Whitepaper Part 2 (v0.6.5) and Part 3 (v0.7.5). Use this as a reference when updating the whitepapers.

---

## Part 2 Corrections

### 1. Database — PostgreSQL Is Fully Implemented

**Current text says:** "a SQLite file on your hard drive" and lists PostgreSQL as a future roadmap item for team deployments.

**Correction:** ANTON now has full dual-database support. PostgreSQL is the primary database for production use. SQLite remains as a lightweight option for single-user development.

- PostgreSQL adapter at `server/db/adapters/postgresql-adapter.ts`
- Full PostgreSQL schema with 183 CREATE TABLE statements
- 64 PostgreSQL-specific migrations in `server/db/migrations-pg/`
- Auto-detection: if `DATABASE_URL` starts with `postgresql://`, uses PostgreSQL; otherwise SQLite
- PostgreSQL 16+ required for production deployments
- All parameterized queries use `?` placeholders, auto-converted to `$1,$2,...` by the adapter

### 2. Updated Numbers

| Metric | Whitepaper Says | Actual (April 2026) |
|--------|----------------|---------------------|
| System prompts | 39 | **84** |
| Frontend pages | 90+ | **197** |
| Database tables | 127 | **183** |
| Knowledge packs | 26 | **29+** |
| LLM providers | 5 (Anthropic, OpenAI, Google, Mistral, Ollama) | **6** (added Azure OpenAI) |
| Modules | ~150 | **492 across 57 areas** |
| Python computation templates | — | **40** |

### 3. Contact Hash Format

**Current text says:** `CH-ABCD-EF01-2345` format with Blake3 hashing.

**Correction:** Format is `ANTON-XXXX-XXXX-XXXX-XXXX` (4 groups of 4 hex chars). Uses SHA-256, not Blake3. The `ANTON-` prefix makes hashes immediately recognizable as ANTON identities.

### 4. Azure OpenAI Provider

Add Azure OpenAI as a 6th supported LLM provider:

- Adapter at `server/services/adapters/azureOpenaiAdapter.ts`
- Supports GPT-5.4 with reasoning models
- Uses `max_completion_tokens` instead of `max_tokens`
- Native `fetch` for UTF-8 compatibility
- Bing Web Search grounding via `server/services/bing-search.ts`
- Configuration stored in `azure_openai_config` and `azure_openai_deployments` tables (migration 090)

### 5. New Pillars (Brief Mention)

Add references to four new business pillars added since Part 2:

- **Markets Pillar** — Self-learning market intelligence with predictions, theses, consul council (covered in Part 3)
- **Procure Pillar** — 5-phase procurement pipeline (Prepare → Source → Select → Contract → Manage)
- **Civic Pillar** — Government and public institution engagement management
- **Grow Pillar** — CRM and business development intelligence

---

## Part 3 Corrections

### 1. mDNS Discovery — Actually Built

**Current text says:** "Designed in Detail, Not Yet Deployed"

**Correction:** mDNS/Bonjour discovery is fully implemented and operational.

- `server/services/mdns-advertiser.ts` — service type `_anton-gateway._tcp`
- Enabled via `APP_GATEWAY_MDNS=true` in `.env`
- Advertises: service name, LAN IP, port, API paths
- Companion apps discover ANTON on local network automatically

### 2. Default Indexes Count

**Current text says:** 5 default indexes (US 100, Nordic 30, Value 20, ESG Leaders 20, NextGen 10)

**Correction:** Only 2 are currently seeded in the database (ANTON US 100, ANTON Nordic 30). The infrastructure supports all 5 but Value 20, ESG Leaders 20, and NextGen 10 are not yet created by default.

### 3. Python Template Count

**Current text says:** 65 Python computation templates

**Correction:** There are 40 Python templates in `server/computation-templates/markets/`. The count should be corrected to 40.

### 4. Transport Relay Fallback — Now Implemented

**Current text implies:** Relay is designed but transport orchestration incomplete.

**Correction:** The full delivery chain is now operational:

1. Try direct HTTP to peer ANTON
2. If fails after retries → store on public relay (if `PUBLIC_RELAY_URL` configured)
3. If no public relay → store on local relay
4. Recipient polls peer relays every 2 minutes
5. Recipient polls public relay every 2 minutes

Relay security (when `RELAY_PUBLIC=true`):
- API key authentication (`RELAY_API_KEYS`)
- IP allowlist (`RELAY_ALLOWED_IPS`)
- HMAC request signing (`RELAY_HMAC_SECRET`)
- 1MB payload size limit
- TTL-based expiry (default 30 days, max 90)

### 5. E2E Encryption — Enhanced Beyond What's Described

The whitepaper correctly describes X25519 DH + AES-256-GCM + HKDF. Add these enhancements:

- **AAD (Additional Authenticated Data):** Sender and recipient contact hashes are bound to the ciphertext via GCM's AAD mechanism. Tampering with metadata (e.g., changing the sender hash) breaks the authentication tag and decryption fails.
- **Replay Protection:** Dedicated `p2p_message_nonces` table (migration 110). Each encrypted message includes a nonce (UUID) and timestamp. The receiver rejects duplicate nonces and messages older than 10 minutes.
- **No Plaintext Fallback:** If encryption fails, the message is NOT sent. This prevents silent downgrade attacks.
- **Rate Limiting:** P2P receive endpoint rate-limited to 60 requests/minute/IP.
- **SSRF Protection:** Peer endpoint URLs validated before HTTP delivery — blocks private networks (unless `ALLOW_PRIVATE_P2P=true` for LAN).

### 6. Entity Federation — Now Implemented

**Current text implies:** Schema only, no sync logic.

**Correction:** Entity federation is now operational:

- `shareEntities(contactHash, entityIds)` — packages entities + relationships as P2P mail payload
- `receiveEntities(fromHash, payload)` — imports with `is_federated=1`, local entities take precedence
- `listFederatedEntities(peerHash?)` — query federated entities by source peer
- P2P receive handler routes `entity_sync` messages to the federation service

---

## New Content for Part 3 (or Part 4)

### Section A: Talent Discovery & Recruitment Module

**What it is:** A complete hiring pipeline built into ANTON, designed as a Discovery-driven process with EU AI Act and Pay Transparency Directive compliance built in.

**Architecture:**
- 13 database tables (migrations 107-109): campaigns, candidates, assessments, scoring dimensions, follow-up questions, communications, interview plans, shortlists, audit trail, human decisions, team CVs, aspiration profiles, internal mobility
- 7-phase pipeline: Discovery → Ad Live → Screening → Shortlist → Interview → Offer → Closed
- Dual-model assessment: Primary assessor + Bias auditor
- Wild card detection: candidates who don't score well on paper but match Discovery findings
- EU AI Act compliance: Art. 9 (risk management), Art. 12 (record-keeping), Art. 13 (transparency), Art. 14 (human oversight)
- EU Pay Transparency Directive: Salary range mandatory before ad publication, salary history ban enforced
- Multi-LLM support via provider-router (works with any configured model)

**Internal Mobility Addendum:**
- Default-ON aspiration profiles (opt-out available)
- Privacy-by-design RBAC: manager NEVER sees profile content
- Matching engine: cross-references Discovery needs with employee aspirations
- HR aggregate analytics with minimum group size of 5 (prevents individual identification)

**Key files:** `server/services/talent-service.ts`, `server/services/talent-ai-service.ts`, `server/routes/talent.ts`, 4 system prompts in `server/prompts/talent-*.md`

### Section B: Specialized Agents System

**What it is:** Pre-configured AI personas that handle specific business functions autonomously. Each agent has its own identity, knowledge base, routing rules, connectors, and escalation policy. Agents can be queried locally, by connected peers, or via a public storefront.

**Agent Profile includes:**
- Identity: name, slug, role description, avatar, greeting message
- Brain: system prompt, model config, thinking level, temperature
- Knowledge: linked RAG collections, knowledge packs, knowledge atom scopes
- Routing: keywords, patterns, priority, fallback agent
- Escalation: policy (notify/redirect/human_only/queue), max conversation turns, conditions
- Connectors: REST APIs, databases, webhooks (credentials encrypted at rest)
- Availability: timezone-aware schedule, offline message

**8 Built-in Templates:**
1. Support Agent — FAQ/docs, escalation after failed attempts
2. Sales Agent — product catalog, pricing, quotes
3. Travel Agent — booking flights, trains, hotels, taxis
4. HR Agent — policies, benefits, leave requests
5. Procurement Agent — inventory, orders, vendor management
6. Meeting/Booking Agent — room scheduling, calendar management
7. Legal Assistant — document review, compliance (human escalation)
8. Finance Assistant — invoices, expenses, budgets, forecasting

**AI Builder:** Natural language agent creation. "I need a customer support agent for our compliance software" → AI generates complete agent config (name, system prompt, routing keywords, escalation rules).

**Connector Executor:** Agents can call external systems as tools during conversations:
- REST API: HTTP calls with auth (Bearer, API key, custom headers)
- Database: Read-only SQL queries against external PostgreSQL databases
- Webhook: HMAC-signed payload delivery to external systems

The AI sees available tools in its system prompt, returns structured `tool_call` blocks, the executor runs them, and the AI incorporates results into its response.

**Key files:** Migration 111, `server/services/agent-service.ts`, `server/services/agent-processor.ts`, `server/services/agent-builder.ts`, `server/services/agent-connector-executor.ts`, `server/routes/agents.ts`

### Section C: Public Agent Storefront

**What it is:** An endpoint where an ANTON instance exposes its active agents to the world. Any ANTON (even without a mutual contact relationship) can discover and query agents via the storefront.

**Endpoints:**
- `GET /api/agents/public/directory` — list all active, auto-response agents (name, role, keywords)
- `POST /api/agents/public/query` — query an agent by slug (returns AI response)
- `POST /api/agents/public/route` — "who can help with X?" (returns best-match agent)

**Remote Agent Client:** An ANTON can scan all connected peers for available agents and route queries automatically:
- `discoverRemoteAgents()` — queries all peers' `/agents/public/directory`
- `findRemoteAgent(query)` — keyword matching across all discovered agents
- `smartQuery(query)` — discover + route + query in one call

**Example flow (Sports Store):**
1. Customer's ANTON: "I need running shoes size 42"
2. Customer's ANTON discovers "Sales Agent" on Sports Store ANTON
3. Queries it: "Do you have running shoes size 42? Price? Store?"
4. Sales Agent checks inventory API (via connector), responds with stock, price, location
5. Customer sees the response in their ANTON

**Security:** CSRF exempted for `/agents/public/*` (external ANTON calls). Agents must be `active` and `auto_response_enabled` to be publicly queryable. All P2P delivery is E2E encrypted.

**Key files:** `server/routes/agents.ts` (public endpoints), `server/services/remote-agent-client.ts`

### Section D: Cross-Instance Knowledge Queries

**What it is:** When processing a delegated task, an ANTON queries connected peers for relevant knowledge before generating a response. This means the processing ANTON combines its own knowledge with intelligence from the entire network.

**How it works:**
1. ANTON B receives a task from ANTON A
2. ANTON B searches its LOCAL knowledge atoms and market atoms
3. ANTON B queries OTHER connected peers via `POST /api/p2p/knowledge-query`
4. Peers search their local knowledge and return matching atoms
5. All knowledge (local + peer) is included in the AI prompt
6. AI generates a response informed by the entire network's intelligence

**Endpoint:** `POST /api/p2p/knowledge-query`
- Validates sender is a known, accepted contact
- Searches `knowledge_atoms` and `market_atoms` for relevant content
- Returns atoms with content, type, confidence, sentiment
- Max 3 peer queries per task (latency limit)
- 8-second timeout per peer query

**Also available from UI:** `POST /api/community/knowledge-query` — user queries all peers, aggregates results.

**Key files:** `server/routes/p2p.ts` (knowledge-query endpoint), `server/services/task-auto-processor.ts` (peer knowledge gathering)

### Section E: Markets Intelligence — Cost Optimization & Learning Acceleration

**Recent improvements (April 2026):**

- **Dedup guard:** Max 1 daily intelligence run per calendar day (prevents cost spikes from redundant cron triggers + manual triggers)
- **Shorter prediction horizons:** Default changed from 30-90 days to 7-14 days for faster validation cycles
- **Fewer predictions:** Weekly pulse reduced from 10-15 to 5-8 with higher conviction
- **Mid-flight checkpoints:** Daily price comparison against active predictions (no LLM cost — just database). Logs "on track" or "off track" observations as prediction feedback.
- **Thesis confidence feedback loop:** Correct predictions → 1.1x confidence boost, wrong → 0.8x reduction, below 0.15 → auto-invalidate thesis
- **Prediction grading curve:** Partial credit instead of binary (direction correct + strong move = 1.0, direction correct + flat = 0.7, wrong but flat = 0.3, wrong = 0.0)

---

## Version Update

Both whitepapers should update the ANTON version number to **v0.7.5** and reference date to **April 2026**.

Key metrics for v0.7.5:
- 492 modules across 57 areas
- 183 database tables (PostgreSQL)
- 84 system prompts
- 197 frontend pages
- 40 Python computation templates
- 6 LLM providers (Anthropic, OpenAI, Azure OpenAI, Google Gemini, Mistral, Ollama)
- 29+ knowledge packs
- 8 specialized agent templates
- E2E encrypted P2P messaging with HKDF forward secrecy
