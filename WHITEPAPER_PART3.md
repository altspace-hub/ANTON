# ANTON by openEXPERT --- Whitepaper Part 3

## The Network: When ANTONs Connect

**Version 0.7.5 | April 2026**
**Daniel Bardun | FutureChain AB**

---

> *Part 1 described what ANTON is --- the architecture, the modules, the prompt layer.*
> *Part 2 described what APCI is --- why context compounds, how knowledge atoms and feedback loops create genuine professional value over time.*
> *Part 3 describes what happens when ANTONs connect --- how professional intelligence stops being individual and becomes collaborative, how markets become the proving ground for temporal reasoning, and why the network is worth more than any single node.*

---

## Contents

**Preface**

**Part 1: Why Connection Matters**

> 1. The Isolation Problem
> 2. From Individual Intelligence to Network Intelligence
> 3. The Six-Layer Vision --- Layers 3 and 4

**Part 2: The ANTON Agent Protocol (AAP)**

> 4. Identity --- Who You Are on the Network
> 5. Connection --- How ANTONs Find Each Other
> 6. Communication --- Three Transport Patterns
> 7. The Companion App Gateway
> 8. Trust --- What You Share and What You Don't
> 9. The Community Tab --- Where Humans Meet
> 10. Security Architecture --- Threat Model and Mitigations

**Part 3: Markets Intelligence --- APCI Under Pressure**

> 11. Why Markets?
> 12. The Intelligence Engine
> 13. The Consul Council --- Five Perspectives, One Synthesis
> 14. Prediction Tracking --- The Honesty Machine
> 15. ANTON Indexes --- The Public Scorecard
> 16. Temporal Reasoning as a Generalizable Framework
> 17. Database Architecture
> 18. Legal and Compliance Boundaries

**Part 4: Knowledge Across the Boundary**

> 19. The Hard Problem --- Trust in External Knowledge
> 20. Knowledge Atom Provenance
> 21. The Boost Boundary --- Local vs Remote Atoms
> 22. Entity Graph Federation
> 23. Pattern Sharing and Cross-Instance Detection

**Part 5: The Marketplace --- Knowledge as a Network Good**

> 24. From File Format to Ecosystem
> 25. Discovery, Ratings, and Community Curation
> 26. The .anton Economy
> 27. Quality Standards for Community Content

**Closing**

> 28. The Network Effect

---

## Who This Document Is For

This whitepaper addresses the same multiple audiences as its predecessors. Technical evaluators will find SQL schemas, cryptographic protocol choices, and system architecture described with enough detail to assess the engineering. Business decision-makers will find the strategic argument for professional AI networks that are sovereign, encrypted, and non-extractive. Regulators will find the privacy architecture, the threat model, and the reasons why a decentralised identity layer makes compliance simpler rather than harder. Educators will find the Companion App pattern that turns a school's ANTON into a gateway for hundreds of students. Market professionals will find a transparent intelligence engine that puts its predictions on record and grades its own accuracy.

We have not simplified it for any single audience. We trust that professionals can navigate to the sections that matter to them.

---

---

# Preface

Part 2 of this whitepaper ended with a claim about compounding. The claim was specific: after two years of use, an ANTON instance's accumulated APCI --- knowledge atoms, entity relationships, feedback ratings, quality baselines, earned autonomy progression --- represents a genuine strategic asset. Not because the AI got smarter, but because the context layer got deeper. We stand by that claim. The architecture works, the feedback loops produce measurable improvement, and the compound effect is real.

But Part 2 left a question unasked.

Remember the law firm associate from Part 2's opening --- the one whose AI forgot everything between Monday and Wednesday? We solved her problem. Her ANTON now remembers that AMLR Article 15 applies differently in Finnish versus Swedish jurisdictions. It remembers the firm's decision to interpret risk assessment requirements conservatively. It remembers the regulatory gap that appeared in three separate client engagements. Her compound context is real and growing.

Now consider her colleague in Helsinki. That colleague's ANTON has also accumulated two years of context --- but focused on Finnish regulatory implementation, Finnish banking practices, Finnish supervisory expectations. Two rich knowledge bases. Two deep professional memories. Two islands.

The Stockholm ANTON doesn't know what the Helsinki ANTON knows. The Helsinki ANTON doesn't benefit from the Stockholm ANTON's Swedish jurisdiction expertise. When the Helsinki colleague runs a gap analysis involving a Swedish banking subsidiary, she starts from zero on Swedish regulatory interpretation --- even though her Stockholm colleague's ANTON has comprehensive Swedish AMLR knowledge sitting three hundred kilometres away.

Part 3 is about connecting the islands.

It covers three major topics. First, the ANTON Agent Protocol --- how ANTON instances identify each other, establish trust, and communicate securely without any central server or cloud dependency. Second, Markets Intelligence --- how ANTON puts APCI under maximum pressure by making predictions with measurable outcomes, tracking accuracy transparently, and learning from failures systematically. Third, Knowledge Across the Boundary --- how atoms, entities, and patterns flow between trusted instances while preserving provenance, privacy, and user sovereignty.

Some of what follows is built and running in v0.7.5. The identity layer, the community infrastructure, the relay server, the marketplace schema, the markets intelligence engine with its prediction verifier and consul council --- these exist as working code. Some is designed in detail but not yet deployed: the full P2P transport, the graduated knowledge sharing, the cross-instance pattern detection. Some is directional: the marketplace economy, the FutureChain payment integration, the fully federated entity graph. We maintain the same transparency commitment as Part 2, Section 38: where the line falls between built, designed, and directional, we will say so explicitly.

The foreword theme of Part 2 was compounding. The foreword theme of Part 3 is honesty under pressure. Markets are the proving ground because they force honesty that other AI systems avoid. When you predict that a Nordic banking ETF will rise 3% in the next fourteen days, reality delivers an unambiguous verdict. No human evaluator needs to assess whether the output was "helpful." No benchmark committee debates the scoring rubric. The market moves or it doesn't. The prediction was right or it wasn't. If APCI can compound value here --- where the feedback loop has teeth --- it can compound value anywhere.

---

---

# Part 1: Why Connection Matters

## 1. The Isolation Problem

Consider three scenarios that illustrate the same structural problem.

**The consulting firm.** A twenty-person compliance advisory firm specialising in Nordic financial regulation. Five senior consultants each run their own ANTON instance. Each consultant has accumulated approximately two thousand knowledge atoms over twelve months of active use --- gap analysis findings, risk assessment interpretations, regulatory monitoring observations, engagement-specific decisions. Collectively, the firm has ten thousand atoms of hard-won professional knowledge.

Consultant A runs a gap analysis for Nordea against AMLR Article 15 and discovers that Nordea's risk assessment methodology covers inherent and residual risk but lacks formal control effectiveness scoring. Three weeks later, Consultant B starts a gap analysis for SEB against the same article. The same structural gap exists at SEB --- it is a systemic weakness across Nordic banks, not a Nordea-specific problem. But Consultant B doesn't know about Consultant A's finding. The atom exists in Consultant A's ANTON. It sits in the database, properly extracted, properly embedded, properly tagged. But it is invisible to Consultant B's instance. The knowledge exists but doesn't flow.

The firm's institutional intelligence is the union of five separate pools, not a connected lake. Each pool compounds on its own --- Part 2 proved that individual compounding works. But the cross-pool patterns are invisible. When three different consultants independently discover the same regulatory gap across three different banking clients, that convergence is enormously valuable information. It suggests a systemic industry weakness, a potential regulatory focus area, a consulting opportunity. But no one sees the convergence because no mechanism exists to surface it.

The firm has paid for five ANTON licences (free --- it's open source), five sets of API costs, and five consultant-years of knowledge accumulation. They are getting five times the value of one instance, when they should be getting fifty times the value. The gap is not in the product. The gap is in the network.

**The regulator.** A Nordic financial supervisory authority employs twelve supervisory teams, each responsible for a subset of supervised entities. Each team uses ANTON for supervisory assessments --- gap analyses, risk evaluations, regulatory compliance reviews, and inspection preparation.

Team 1, supervising three large commercial banks, notices a pattern in their Customer Due Diligence (CDD) processes: all three banks have implemented risk-based CDD but none have formal procedures for ongoing monitoring frequency reviews. Team 1 records this as a knowledge atom with high confidence, tags it with the relevant regulatory articles, and continues their work. The atom compounds within Team 1's instance, enriching their future assessments.

Team 3, supervising four medium-sized banks, encounters the same pattern eight weeks later. Their banks also lack formal ongoing monitoring frequency review procedures. Team 3 records their own atom, independently discovers the same gap, and continues their work.

Neither team knows about the other's finding. The pattern is systemic --- it affects at least seven banks across two supervisory teams, potentially spanning the entire sector. But because the knowledge bases are isolated, neither team recognises the systemic nature of the issue. A sector-wide finding that should trigger a thematic review or a supervisory circular instead remains two unconnected observations in two separate databases.

This is not a technology failure. Both instances work correctly. The atoms are extracted, embedded, and retrievable within their respective instances. The failure is architectural: there is no mechanism for pattern detection across instances. The regulator has invested in APCI, and APCI is compounding --- but it is compounding in silos.

**The teacher network.** A mathematics teacher in Gothenburg has spent six months refining an ANTON module for teaching algebra to fifteen-year-olds. She has created custom personas (a patient, step-by-step explainer and a Socratic questioner), calibrated the quality baselines to match the Swedish curriculum, developed age-appropriate output formats, and accumulated three hundred knowledge atoms about which algebraic concepts students typically struggle with, which explanation strategies produce the best comprehension, and which common misconceptions need explicit correction.

The module works beautifully. Her students' algebra performance has improved measurably. The quality trajectory shows a clear upward trend over two semesters. She has exported it as a .anton bundle --- the format described in Part 2, Section 27 --- and it sits on her laptop.

There are approximately four hundred other mathematics teachers in Swedish gymnasiums who teach the same algebra curriculum to the same age group. Many of them use ANTON. None of them know that this module exists. There is no directory, no catalogue, no discovery mechanism. The teacher network has four hundred potential beneficiaries of one teacher's six months of professional refinement, and no way to connect them.

**The Core Argument.**

These three scenarios illustrate the same structural problem from different angles. Part 2 proved that APCI creates compound value within a single instance. Part 3 asks: what if that compound value could flow between instances --- with appropriate trust, privacy, and consent?

The answer is not "put everything in the cloud." That violates the local-first promise established in Part 2, Section 30. If ANTON's privacy architecture depends on data staying local, the solution to isolation cannot be centralisation. The answer is also not "share everything by default." That violates professional confidentiality, client privilege, and basic data sovereignty. A compliance consultant's gap analysis findings for one client cannot flow unrestricted to another consultant who might serve a competitor.

The answer is selective, consented, encrypted sharing between trusted peers. The value of the network grows with the number of connected nodes, but each node retains sovereignty over its knowledge. No central authority decides what flows where. No cloud service stores the plaintext. No administrator can override an individual user's sharing decisions.

This is the architectural challenge of Part 3: connecting the islands without drowning anyone.

---

## 2. From Individual Intelligence to Network Intelligence

Part 2 described individual APCI: one instance accumulating knowledge atoms, building entity relationships, training its feedback loop through professional ratings, detecting patterns across sessions, and compounding value over time. Everything that makes a single ANTON instance more valuable in its twelfth month than in its first.

Part 3 introduces network APCI: multiple instances selectively sharing knowledge, with provenance tracking, trust levels, and privacy controls. The transition from individual to network changes the compounding dynamics fundamentally.

Individual compounding is deep. It grows along a single axis --- more atoms, better feedback, richer patterns, all within one professional context. A compliance consultant's ANTON gets better at compliance consulting. A teacher's ANTON gets better at teaching. The compound rate depends on usage frequency, feedback quality, and domain consistency. After twelve months, a heavily used instance might have five thousand atoms with mature feedback ratings and a well-calibrated retrieval system.

Network compounding is wide. It adds a second axis: knowledge flowing across instances, enriching each node with perspectives, findings, and patterns from connected peers. Ten consultants sharing quality-rated atoms produce collectively better outcomes than ten consultants working in isolation, for the same reason that ten experienced colleagues in a meeting room produce better decisions than ten experienced colleagues in separate rooms.

But the analogy to a meeting room has limits. In a meeting room, everyone hears everything --- sharing is binary. In a professional network, sharing must be graduated. Not every atom should flow to every connection. Client-specific findings are confidential. Draft analyses are premature. Speculative observations need validation before dissemination. The insight that drives the ANTON Agent Protocol is this: the same graduated trust model that governs the Orchestrator's autonomy progression (Part 2, Sections 14--15) governs inter-ANTON knowledge sharing. Trust is earned, not configured. Sharing is selective, not binary.

This is fundamentally different from centralised AI platforms. ChatGPT Teams shares conversations within a workspace --- all or nothing, controlled by the workspace administrator. Microsoft Copilot federates access through existing Microsoft 365 permissions --- flexible, but tied to a vendor's identity infrastructure and sharing model. Google's Gemini Enterprise operates within Google Workspace boundaries, with Google as the data processor.

ANTON shares nothing by default. Every connection, every shared atom, every synchronisation filter is explicitly opted into by the user. The user --- not an administrator, not a platform operator, not a vendor --- decides what crosses the boundary. This is sovereignty, not isolation. The distinction matters because it defines the trust architecture for everything that follows.

The value multiplier of network APCI depends on two factors: the number of connected nodes and the quality of what flows between them. A network of fifty consultants sharing thousands of low-quality atoms is noise. A network of five consultants sharing a hundred carefully curated, professionally rated, provenance-tracked atoms is signal. The architecture must reward quality over quantity, depth over breadth, relevance over volume. Sections 19--23 describe how.

---

## 3. The Six-Layer Vision --- Layers 3 and 4

Parts 1 and 2 of this whitepaper described the first two layers of ANTON's vision. Part 3 advances into layers 3 and 4 and lays the groundwork for layer 5.

| Layer | Name | Scope | Coverage |
|-------|------|-------|----------|
| 1 | Individual ANTON | A professional tool | Part 1 --- modules, prompts, knowledge sources, output formats |
| 2 | Intelligent ANTON | A professional partner | Part 2 --- APCI, Orchestrator, earned autonomy, feedback loops |
| 3 | The Network | Connected professionals | Part 3 --- AAP, identity, communication, community |
| 4 | Collaborative Intelligence | Shared knowledge | Part 3 --- cross-instance atoms, federated entities, pattern sharing |
| 5 | The Marketplace | Knowledge economy | Part 3 (foundations) --- .anton bundles, discovery, ratings |
| 6 | The Economy | Value exchange | Part 4 --- FutureChain payments, creator monetisation |

Layer 3 is infrastructure. It answers the mechanical questions: how do ANTON instances identify each other (Section 4), find each other (Section 5), communicate securely (Section 6), and establish trust (Section 8)? The ANTON Agent Protocol provides these answers without requiring any central server, any vendor account, or any cloud dependency.

Layer 4 is intelligence. It answers the epistemological questions: when knowledge flows between instances, how does the receiving instance assess its reliability (Section 19)? How does provenance affect retrieval ranking (Section 21)? How do entity graphs federate without merging (Section 22)? How can patterns be detected across instances without exposing raw data (Section 23)?

The distinction between infrastructure and intelligence matters because you can build Layer 3 without Layer 4, but not the reverse. Two ANTONs that can exchange messages (Layer 3) but cannot meaningfully integrate each other's knowledge (Layer 4) are just a chat system. Two ANTONs that can integrate knowledge but cannot find or authenticate each other have no foundation. The layered architecture ensures that each capability builds on a solid lower layer.

Layer 5 --- the marketplace --- appears in Part 3 only in its foundations. Sections 24--27 describe how .anton bundles are discovered, rated, and curated by the community. Part 4, which completes the whitepaper series, will describe Layer 5's economics and introduce Layer 6: the FutureChain payment infrastructure that turns professional knowledge into a genuine economy.

Markets Intelligence --- the subject of Sections 11--18 --- sits at the intersection of layers 2 and 4. It uses APCI's knowledge atoms and feedback loops (Layer 2) but pushes them into a domain where outcomes are objectively measurable (the beginning of Layer 4's cross-instance verification capability). Markets is not a layer --- it is the proving ground where APCI's claims are tested under maximum pressure.

---

---

# Part 2: The ANTON Agent Protocol (AAP)

## 4. Identity --- Who You Are on the Network

Every network requires identity. The question is: who controls it?

On traditional platforms, identity is granted by a central authority. Google issues Google accounts. Microsoft issues Microsoft accounts. Slack issues workspace memberships. Apple issues Apple IDs. In every case, the identity provider controls access, can revoke credentials, and maintains a database of every user --- a database that can be breached, subpoenaed, sold, or misused. The user's digital existence depends on the continued benevolence and competence of the identity provider.

ANTON's identity layer inverts this model. There is no central authority. No account creation. No email verification. No username/password database to breach. Identity is generated locally, controlled locally, and verified cryptographically.

**Key Generation**

When an ANTON instance first activates the Community feature, it generates an Ed25519 keypair using Node.js's native `crypto` module. The Ed25519 algorithm was chosen for specific technical properties: compact key size (32 bytes for both public and private keys), fast signature verification (approximately 70,000 verifications per second on commodity hardware), resistance to side-channel timing attacks, no patent encumbrance, and extensive independent security audit history. It is the same algorithm used by SSH, Signal, and age encryption.

The keypair generation is deterministic from random bytes --- `crypto.generateKeyPairSync('ed25519')` produces a fresh keypair from the operating system's cryptographic random number generator. No seed phrase. No mnemonic backup. No recovery mechanism. The private key is encrypted at rest using a key derived from a user-provided passphrase, with the salt and IV stored alongside.

The table that stores this identity is straightforward:

```sql
CREATE TABLE IF NOT EXISTS community_identity (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default',
  contact_hash TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  public_key TEXT NOT NULL,
  private_key_encrypted TEXT,
  x25519_public_key TEXT,
  x25519_private_key_encrypted TEXT,
  key_encryption_salt TEXT,
  key_encryption_iv TEXT,
  payment_address TEXT,
  agent_wallet_address TEXT,
  auto_accept_connections INTEGER NOT NULL DEFAULT 0,
  profile_visibility TEXT NOT NULL DEFAULT 'private',
  activated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id)
);
```

The `x25519_public_key` and `x25519_private_key_encrypted` columns store the X25519 Diffie-Hellman keys used for end-to-end encryption (Section 6). These are derived from or generated alongside the Ed25519 identity keys, providing key agreement capability without requiring a separate keypair exchange.

**The Contact Hash**

The public key is hashed to produce a contact hash: `ANTON-XXXX-XXXX-XXXX-XXXX`, where each X group represents four characters from a base-32 encoding of the SHA-256 hash of the public key. This hash is your identity on the ANTON network.

The contact hash serves the same role as a Bitcoin address or a Signal safety number: it is a human-verifiable identifier derived from a cryptographic key. If two parties verify that their contact hashes match (in person, over the phone, or through any trusted side channel), they can be confident that no man-in-the-middle has substituted a different key.

For groups and organisations, a parallel format exists: `ANTON-GRP-XXXX-XXXX-XXXX`. Group hashes identify group nodes rather than individual instances, enabling group-level messaging, announcements, and knowledge sharing.

**The .anton Contact Bundle**

Sharing your identity means sharing a small file: a .anton contact bundle (using the same bundle format described in Part 2, Section 27) that contains your public key, display name, optional bio, and any capability metadata you choose to include. This bundle is how you introduce yourself on the ANTON network.

The contact bundle is a ZIP archive containing a `manifest.json` with your identity data and a `README.md` with a human-readable summary. No executable code. No scripts. No hidden payloads. The same safety guarantees that apply to all .anton bundles apply to contact bundles.

**Mutual Consent**

Both parties must exchange contact bundles before any communication can occur. There are no cold messages, no unsolicited connections, no spam. If Alice wants to communicate with Bob, Alice sends her contact bundle to Bob (via email, USB drive, AirDrop, or any other means), and Bob sends his contact bundle to Alice. Both parties import the received bundle into their respective ANTON instances. Only after this mutual exchange does the connection become active.

This mutual consent model is deliberately restrictive. It means that an ANTON instance can never receive a message from an unknown party. It means that building a network requires establishing relationships through existing channels. It means that the social graph grows organically through professional relationships rather than through viral invitation mechanics.

**The Connection Table**

```sql
CREATE TABLE IF NOT EXISTS community_connections (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL DEFAULT 'default',
  contact_hash TEXT NOT NULL,
  display_name TEXT,
  public_key TEXT NOT NULL,
  x25519_public_key TEXT,
  status TEXT DEFAULT 'pending',
  endpoint TEXT,
  import_policy TEXT NOT NULL DEFAULT 'ask_first',
  auto_accept_types JSONB DEFAULT '[]',
  delegation_trust_level TEXT NOT NULL DEFAULT 'manual',
  delegation_policy JSONB DEFAULT '{}',
  tasks_delegated INTEGER DEFAULT 0,
  tasks_completed INTEGER DEFAULT 0,
  avg_task_quality DOUBLE PRECISION,
  payment_address TEXT,
  agent_wallet_address TEXT,
  connected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(owner_user_id, contact_hash)
);
```

Each connection stores the peer's public key, endpoint address (for direct P2P communication), import policy (how incoming bundles are handled), delegation policy (for task agent workflows), and payment information (for future marketplace transactions). The `status` field tracks the connection lifecycle: pending, active, blocked, or revoked.

**The Critical Design Decision**

Identity is LOCAL. The private key never leaves the device. There is no "forgot password" recovery --- if you lose your key, you generate a new identity and re-establish your connections. This is a privacy feature, not a limitation.

Consider what this means in practice. There is no central user database to breach --- because there is no central user database. GDPR's right to erasure is trivially satisfied --- delete the keypair, and the identity ceases to exist. No data controller needs to search their records, no processor needs to purge their caches. The identity simply stops existing.

The identity works offline, works air-gapped, and works in jurisdictions where cloud identity services are blocked or untrusted. A field office in a restricted network environment can operate ANTON with full identity and communication capability without any internet connection. A school in a rural area with unreliable connectivity can establish classroom groups over local WiFi without depending on Google or Microsoft authentication services.

No dependency on any identity provider. No corporate account requirement. No single point of failure. The identity is the keypair, and the keypair is on your machine.

---

## 5. Connection --- How ANTONs Find Each Other

The identity layer (Section 4) establishes who you are. The connection layer establishes how you find each other. ANTON provides three discovery patterns, each optimised for different deployment scenarios.

**Pattern 1: Manual Exchange**

The most private, most universal method. Share your .anton contact bundle via any existing channel: email attachment, USB drive, AirDrop, Signal message, printed QR code, or physical media. The recipient imports the bundle into their ANTON instance. Both parties now have each other's public keys and contact hashes. Connection established.

Manual exchange works everywhere. It works across air gaps. It works across jurisdictions. It works when one or both parties are offline at the time of exchange. It requires no shared infrastructure, no common network, no third-party service. The security properties are determined entirely by the security of the exchange channel --- if you hand someone a USB drive in person, no network attacker can intercept it.

This is the recommended method for high-trust, high-sensitivity connections: connecting a law firm's offices across jurisdictions, linking a regulator's supervisory teams, or establishing a researcher collaboration where confidentiality matters.

**Pattern 2: QR Code**

For in-person connection establishment. Your ANTON displays your contact hash and public key as a QR code. The other party scans it with their ANTON instance (via the Companion App on mobile, or a webcam on desktop). The scanned data is verified against the cryptographic identity, and the connection is established with both parties physically present.

QR code exchange is optimised for classrooms, conferences, workshops, and co-located teams. A teacher displays a group QR code on the classroom projector; thirty students scan it with their phones. A conference workshop facilitator shares their contact QR at the start of a session; participants connect before the first exercise. A new team member scans the team lead's QR code during onboarding.

The in-person nature of QR exchange provides an implicit trust signal: you have seen the other person. This doesn't replace cryptographic verification, but it augments it with physical-world authentication.

**Pattern 3: Local Network Discovery (mDNS)**

For environments where multiple ANTON instances operate on the same local network. ANTON advertises itself as `_anton._tcp` on the local network using mDNS (multicast DNS, also known as Bonjour on Apple platforms and Avahi on Linux). Other ANTONs on the same LAN discover it automatically.

Local discovery is optimised for corporate LANs, school WiFi networks, field offices, and co-working spaces. No internet connection is required. No DNS configuration is needed. The discovery is automatic and instantaneous within the broadcast domain.

When an ANTON instance discovers another instance on the local network, it presents the discovered instance's contact hash and display name to the user. The user decides whether to send a connection request. No automatic connection is established --- discovery is not consent.

**What Is Deliberately Missing**

There is no central directory. No public registry. No search-by-name. No social media-style "people you may know" suggestions. You find each other through existing relationships and physical proximity.

This is intentional. A central directory creates a single point of failure, a surveillance target, and a spam vector. If every ANTON instance's contact hash were listed in a searchable directory, an adversary could enumerate the entire network's social graph, identify high-value targets, and attempt impersonation or phishing at scale. By making discovery require existing relationships or physical proximity, the architecture prevents mass surveillance of the social graph and ensures that connections are meaningful rather than opportunistic.

The contrast with traditional platforms is stark. Slack requires an organisation administrator to create a workspace, invite members, and manage access. Discord requires sharing a server link that anyone can use. Microsoft Teams requires an Azure AD tenant and licence assignments. ANTON requires only that two people exchange a small file. The barrier to connection is human relationship, not administrative overhead.

---

## 6. Communication --- Three Transport Patterns

Once two ANTON instances have established a connection (Section 5), they need to exchange messages. The architecture supports three transport patterns, each with different latency, privacy, and availability characteristics.

**Pattern 1: Direct Peer-to-Peer (LAN/VPN)**

When both ANTON instances are reachable on the same network --- a corporate LAN, a school WiFi network, a VPN-connected set of offices --- they communicate directly via HTTP.

Each connection record includes an `endpoint` field:

```sql
ALTER TABLE community_connections
  ADD COLUMN IF NOT EXISTS endpoint TEXT;
```

This endpoint URL (for example, `http://192.168.1.100:3001` on a LAN, or `https://vpn.firm.example/anton` over a VPN) allows the sending ANTON to deliver messages directly to the receiving ANTON's Express server. The message queue tracks the delivery method used:

```sql
ALTER TABLE community_message_queue
  ADD COLUMN IF NOT EXISTS delivery_method TEXT DEFAULT 'local'
    CHECK (delivery_method IN ('local', 'http', 'relay'));
ALTER TABLE community_message_queue
  ADD COLUMN IF NOT EXISTS last_http_status INTEGER;
```

Direct P2P is the lowest-latency, highest-privacy transport. No intermediate server sees the traffic. The connection is point-to-point. For organisations that operate on managed networks with predictable addressing (static IPs, DNS entries, or VPN tunnels), this is the preferred pattern.

The delivery pipeline handles transient failures gracefully. If the receiving ANTON is temporarily offline (laptop closed, service restarting), the message enters the queue with retry logic:

```sql
CREATE TABLE IF NOT EXISTS community_message_queue (
  id TEXT PRIMARY KEY,
  mail_id TEXT NOT NULL,
  recipient_hash TEXT NOT NULL,
  payload_encrypted TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 5,
  next_retry_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

Messages are retried with exponential backoff up to five times. If all retries fail, the message remains in the queue for manual review or automatic relay fallback (Pattern 3).

**Pattern 2: Relay Server (End-to-End Encrypted)**

When both ANTON instances are on the internet but cannot reach each other directly --- different networks, NAT traversal issues, dynamic IP addresses, restrictive firewalls --- messages pass through a relay server.

The relay server is deliberately minimal. It is a store-and-forward service that holds encrypted messages until the recipient collects them. The relay sees only: encrypted blobs, sender contact hashes, recipient contact hashes, and timestamps. It cannot read message content because all payloads are end-to-end encrypted before reaching the relay.

```sql
CREATE TABLE IF NOT EXISTS relay_messages (
  id TEXT PRIMARY KEY,
  recipient_hash TEXT NOT NULL,
  sender_hash TEXT NOT NULL,
  encrypted_payload TEXT NOT NULL,
  message_type TEXT DEFAULT 'mail',
  ttl_days INTEGER NOT NULL DEFAULT 30,
  stored_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  collected_at TIMESTAMPTZ,
  collected_by TEXT
);
```

The schema reveals the design constraints:

- `encrypted_payload` is the only content field. It contains ciphertext. The relay has no decryption key and cannot read the message.
- `ttl_days` defaults to 30. Messages expire automatically after thirty days if uncollected. This prevents the relay from becoming an indefinite storage service and limits the exposure window if the relay server is compromised.
- `collected_at` tracks when the recipient retrieved the message. Once collected, the relay can purge the record (an indexed partial index on `collected_at IS NULL` ensures efficient lookups for uncollected messages).
- `collected_by` records the contact hash of the collector, enabling audit trails without revealing content.

The relay server is self-hostable. FutureChain operates a default relay for convenience, but any organisation can deploy their own relay on their own infrastructure. The relay software is part of the ANTON open-source distribution. A law firm with strict data sovereignty requirements runs their own relay. A school district deploys a relay on their existing server infrastructure. A government agency operates a relay within their security perimeter. The relay sees ciphertext in all cases, but self-hosting eliminates even the metadata exposure to a third party.

**End-to-End Encryption Protocol**

All relay-transported messages (and optionally, direct P2P messages for additional security) are encrypted using a protocol built on Node.js's native `crypto` module. No external cryptographic dependencies are introduced.

The protocol works as follows:

1. **Key Agreement.** Each ANTON instance has an X25519 keypair alongside its Ed25519 identity keypair. The X25519 keys are used for Diffie-Hellman key agreement. When Alice wants to send a message to Bob, Alice uses her X25519 private key and Bob's X25519 public key to compute a shared secret. Bob can compute the same shared secret using his X25519 private key and Alice's X25519 public key. No key is transmitted --- both parties derive the same secret independently.

2. **Symmetric Encryption.** The shared secret is used to derive an AES-256-GCM encryption key via HKDF (HMAC-based Key Derivation Function). AES-256-GCM provides authenticated encryption: the ciphertext cannot be modified without detection, and a 12-byte nonce ensures that identical plaintexts produce different ciphertexts.

3. **Message Authentication.** The sender signs the encrypted payload with their Ed25519 private key. The recipient verifies the signature against the sender's Ed25519 public key before decryption. This provides non-repudiation --- the recipient can verify that the message was sent by the claimed sender, not by a relay operator who substituted a different message.

4. **Forward Secrecy (Optional).** For high-sensitivity deployments, ephemeral X25519 keypairs can be generated per message or per session. Each message uses a fresh Diffie-Hellman exchange, meaning that compromise of long-term keys does not reveal past messages. This is configurable because ephemeral key exchange requires additional round-trips, increasing latency.

The X25519 key columns exist in both the identity and connection tables:

```sql
ALTER TABLE community_identity
  ADD COLUMN IF NOT EXISTS x25519_public_key TEXT,
  ADD COLUMN IF NOT EXISTS x25519_private_key_encrypted TEXT;

ALTER TABLE community_connections
  ADD COLUMN IF NOT EXISTS x25519_public_key TEXT;
```

**Pattern 3: Hybrid**

The practical default for most deployments. Direct when possible, relay when needed. The sending ANTON first attempts direct HTTP delivery to the recipient's endpoint. If the endpoint is unreachable (timeout, connection refused, DNS failure), the message is automatically re-encrypted for relay delivery and submitted to the configured relay server.

This automatic fallback means that two consultants on the same corporate LAN communicate directly with minimal latency. When one of them travels and connects from a hotel WiFi, messages seamlessly route through the relay. No configuration change is needed. The transport is transparent to the user.

**What Flows Through the Channel**

The communication channel carries several types of content:

- Text messages (direct messages within the Community tab)
- .anton bundles (module sharing, knowledge pack distribution)
- Knowledge atom packages (with explicit consent, see Section 8)
- Forum posts and replies (within shared groups)
- Group announcements
- Calendar events and RSVP responses
- Connection metadata (online status, last seen --- opt-in)
- Task delegation requests and results (Orchestrator integration)

**What Never Flows**

Certain categories of data are architecturally excluded from the communication channel:

- Private keys (Ed25519 or X25519)
- Unencrypted knowledge atoms
- Session transcripts (unless explicitly shared as a curated export)
- LLM API keys or credentials
- Raw database contents
- File system paths or local configuration

These exclusions are enforced at the message serialisation layer, not by policy. The structured message types (introduced in migration 077) define a closed set of payload types, and the serialiser rejects any payload that does not match a registered type.

---

## 7. The Companion App Gateway

Sections 4--6 describe symmetric connections: ANTON-to-ANTON, peer-to-peer, equal participants. The Companion App Gateway introduces an asymmetric pattern: lightweight client connecting to a full ANTON server. This asymmetry is not a limitation --- it is a design choice that enables an entirely different class of use cases.

**The Asymmetric Pattern**

Consider a school. The school runs one ANTON instance on a server in the IT room (or a cloud VM). Three hundred students need to interact with it. They don't need their own ANTON installations. They don't need database storage. They don't need module configuration or knowledge atom management. They need to ask questions, receive answers, and access resources curated by their teachers.

The Companion App is a lightweight client --- a Progressive Web App (PWA) or a native Android application --- that connects to the school's ANTON instance through a gateway API. The student authenticates using the same Ed25519/contact hash identity system as full P2P connections, but the interaction is scoped: the student can query modules that the school has made available, in languages the school supports, up to quotas the school has set.

The gateway infrastructure is built:

```sql
CREATE TABLE IF NOT EXISTS org_profiles (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  name TEXT NOT NULL,
  org_type TEXT NOT NULL CHECK (org_type IN (
    'school', 'ngo', 'sports_club', 'consulting',
    'consulting_firm', 'company', 'community',
    'government', 'healthcare', 'other'
  )),
  description TEXT,
  welcome_message TEXT,
  logo_path TEXT,
  primary_color TEXT DEFAULT '#2A6459',
  branding JSONB DEFAULT '{}',
  default_model TEXT DEFAULT 'claude-sonnet-4-5-20250929',
  default_thinking TEXT DEFAULT 'think',
  max_thinking_level TEXT DEFAULT 'think_hard',
  allow_reasoning_view BOOLEAN DEFAULT FALSE,
  allow_file_upload BOOLEAN DEFAULT FALSE,
  max_tokens_per_query INTEGER DEFAULT 4096,
  max_queries_per_day INTEGER DEFAULT 100,
  default_output_language TEXT DEFAULT 'en',
  supported_languages JSONB DEFAULT '["en"]',
  force_output_language BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

The `org_profiles` table reveals the configuration depth. Each organisation defines:

- **Model constraints.** The default model and maximum thinking level. A school might restrict students to Sonnet for cost control; a consulting firm might allow Opus for senior consultants.
- **Capability scoping.** Whether app users can upload files, view the AI's reasoning chain, or use voice input.
- **Usage quotas.** Maximum tokens per query and maximum queries per day. A school with three hundred students on a shared API budget needs rate limiting. A consulting firm with five employees does not.
- **Language control.** Default output language, supported languages, and whether language is forced (useful for educational contexts where the pedagogical goal requires output in the target language).
- **Branding.** Organisation name, logo, colour scheme, and welcome message. The Companion App displays the organisation's branding, not ANTON's.

**Use Cases**

The Companion App Gateway pattern serves four primary deployment scenarios:

A school student connects to the school's ANTON via their phone. They access modules that teachers have curated for their grade level and subject area. The AI operates within guardrails set by the teacher: maximum thinking level, allowed areas, system prompt addons that enforce pedagogical context. The student's queries and the AI's responses are visible to teachers through the analytics dashboard. The student gets AI assistance; the school retains oversight.

An NGO field worker in a rural clinic connects to the regional office's ANTON. They can ask questions about treatment protocols, medication interactions, and patient intake procedures in their local language. The ANTON instance holds the NGO's operational knowledge, curated by medical professionals at headquarters. The field worker doesn't need a laptop, doesn't need reliable broadband, doesn't need training on the full ANTON interface. They need a phone, a mobile connection, and a question.

A sports club member checks training schedules, accesses coaching resources, and reviews team strategies. The club's ANTON instance has been configured with sports-specific modules and the coach's accumulated knowledge about training methodologies and player development.

A small business employee uses the company's ANTON for HR policy questions, operational procedures, and customer service scripts. The business owner has configured the instance with company-specific knowledge, restricted the available modules to operational ones, and set usage quotas appropriate for the team size.

**The Intent Routing System**

To manage the scope of what app users can access, the gateway includes an intent routing system:

```sql
CREATE TABLE IF NOT EXISTS org_intent_categories (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  org_id TEXT NOT NULL REFERENCES org_profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  allowed_areas JSONB DEFAULT '[]',
  allowed_modules JSONB DEFAULT '[]',
  default_module_id TEXT,
  system_prompt_addon TEXT,
  persona_id TEXT,
  knowledge_scope JSONB DEFAULT '{}',
  icon TEXT DEFAULT 'MessageSquare',
  max_thinking_level TEXT,
  required_output_language TEXT,
  priority INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

Intent categories allow the organisation to define how app users' queries are routed. A school might define intent categories for "Mathematics," "Science," "Language Arts," and "General Questions," each with different allowed modules, system prompt addons (curriculum context), and personas. The app user selects a category (or the system classifies their query automatically), and the gateway routes it to the appropriate module configuration.

**The Identity Bridge**

The Companion App uses the same contact hash identity system as full P2P connections. An app user generates their own Ed25519 keypair locally on their device. Their contact hash (`ANTON-XXXX-XXXX-XXXX-XXXX`) is the same format as a full ANTON instance's hash.

This means that if a student later upgrades to a full ANTON installation (perhaps when they graduate and enter professional work), their identity carries over. Their contact hash, their public key, their connection history --- all of it transfers. The Companion App identity becomes the full ANTON identity without re-registration, without account migration, without losing any connection history.

The contact hash thus becomes ANTON's universal identity layer: one identity, every interaction pattern. Student, professional, organisation member, marketplace participant --- the same cryptographic identity, the same trust chain, the same privacy guarantees.

**Authentication Flow**

The gateway uses a challenge-response authentication protocol:

```sql
CREATE TABLE IF NOT EXISTS app_auth_nonces (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  nonce TEXT NOT NULL UNIQUE,
  contact_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

The app requests a nonce from the gateway, signs it with its Ed25519 private key, and returns the signature. The gateway verifies the signature against the app user's public key. If valid, the gateway issues a session token:

```sql
CREATE TABLE IF NOT EXISTS app_session_tokens (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  token TEXT NOT NULL UNIQUE,
  connected_user_id TEXT NOT NULL
    REFERENCES connected_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

No passwords. No OAuth. No third-party identity provider. Pure cryptographic authentication.

**Session and Analytics Infrastructure**

Every app user interaction is tracked for organisational visibility:

```sql
CREATE TABLE IF NOT EXISTS app_sessions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  connected_user_id TEXT NOT NULL
    REFERENCES connected_users(id) ON DELETE CASCADE,
  org_id TEXT NOT NULL
    REFERENCES org_profiles(id) ON DELETE CASCADE,
  intent_category_id TEXT
    REFERENCES org_intent_categories(id) ON DELETE SET NULL,
  resolved_area_id TEXT,
  resolved_module_id TEXT,
  title TEXT,
  status TEXT DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'archived')),
  total_input_tokens INTEGER DEFAULT 0,
  total_output_tokens INTEGER DEFAULT 0,
  total_thinking_tokens INTEGER DEFAULT 0,
  message_count INTEGER DEFAULT 0,
  output_language TEXT DEFAULT 'en',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

Token usage is tracked per session, per user, per organisation. This enables the organisation to monitor API costs, identify heavy users, detect unusual usage patterns, and enforce quotas. The analytics aggregate daily:

```sql
CREATE TABLE IF NOT EXISTS app_analytics (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  org_id TEXT NOT NULL
    REFERENCES org_profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  total_queries INTEGER DEFAULT 0,
  unique_users INTEGER DEFAULT 0,
  total_input_tokens INTEGER DEFAULT 0,
  total_output_tokens INTEGER DEFAULT 0,
  intent_breakdown JSONB DEFAULT '{}',
  topic_clusters JSONB DEFAULT '{}',
  avg_response_time_ms INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (org_id, date)
);
```

The `intent_breakdown` field shows how queries distribute across intent categories --- which subjects are students asking about most? The `topic_clusters` field uses AI-generated topic labels to identify emerging question patterns --- are students suddenly asking about a concept that wasn't previously popular? These analytics provide the organisation with operational intelligence about how their ANTON deployment is being used, without exposing individual query content.

**Announcements**

Organisations can post announcements visible to all their app users:

```sql
CREATE TABLE IF NOT EXISTS org_announcements (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  org_id TEXT NOT NULL
    REFERENCES org_profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  priority TEXT DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  is_pinned BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

A school can announce exam schedule changes. An NGO can share updated treatment protocols. A sports club can post training schedule modifications. Announcements are push communications from the organisation to its connected users --- the complement to queries, which are pull communications from users to the organisation.

**The Gateway API Surface**

The Companion App Gateway exposes approximately 10 focused endpoints, compared to the 200+ endpoints in the full ANTON platform. This constraint is deliberate: app users need a curated subset of ANTON's capabilities, not the full professional toolset.

The core endpoints handle:
- Authentication (nonce request, signature verification, token issuance)
- Query submission (text input, optional file attachments, intent category selection)
- Response streaming (Server-Sent Events for real-time AI output)
- Conversation history (list sessions, read messages, continue conversations)
- Organisation metadata (profile, available intent categories, announcements)
- User profile management (display name, preferred language)

The reduced API surface reduces the attack surface proportionally. Fewer endpoints means fewer opportunities for exploitation, fewer authorisation checks to implement, and fewer ways for the gateway to behave unexpectedly.

---

## 8. Trust --- What You Share and What You Don't

This is the most important section in the AAP chapter. Identity, connection, and communication are infrastructure. Trust is the policy layer that determines whether the infrastructure creates value or creates risk.

**The Graduated Sharing Model**

Every connection between two ANTON instances operates at one of five trust levels. Each level defines what types of data can flow through the connection. The levels are cumulative --- higher levels include everything from lower levels.

**Level 0: Connection Only.** You know each other exists. Contact hashes, display names, and public keys have been exchanged. No knowledge flows. No messages beyond connection management (accept, block, remove). This is the default state for every new connection.

This level exists because establishing a connection should not imply consent to share anything. Two conference attendees who exchange QR codes should not automatically start receiving each other's knowledge atoms. The connection is the handshake. What follows the handshake is a separate decision.

**Level 1: Module Sharing.** You can send and receive .anton bundles --- modules, skill configurations, persona definitions, output format templates. No knowledge atoms. No entity data. No session information.

This is the level for professional content exchange. The Gothenburg maths teacher shares her algebra module with colleagues. A compliance consultant shares a gap analysis template with a peer at another firm. A trainer shares a custom persona optimised for workshop facilitation. The bundles contain configuration, not knowledge --- they define how ANTON behaves, not what ANTON knows.

Level 1 is safe for broad sharing. A module template contains no client data, no engagement-specific findings, no confidential information. It is intellectual property in the traditional sense: professional expertise encoded as configuration.

**Level 2: Curated Knowledge Sharing.** You can share specific, hand-picked knowledge atoms with this connection. Atom-by-atom consent. The user selects individual atoms from their knowledge base and explicitly sends them to the peer. The peer receives them as external atoms with full provenance metadata (Section 20).

This is the level for deliberate professional knowledge exchange. A senior consultant selects ten atoms about AMLR Article 15 interpretation and shares them with a junior colleague. A teacher selects atoms about common student misconceptions in quadratic equations and shares them with a colleague teaching the same course. Each shared atom is a conscious decision.

Level 2 does not enable any automatic synchronisation. Every atom that crosses the boundary is individually selected by the sender and individually accepted or rejected by the receiver.

**Level 3: Filtered Knowledge Sync.** Knowledge atoms matching specific criteria --- area, module, entity, time range, confidence threshold --- automatically synchronise with this connection. The user defines the filter. The filter is revocable at any time.

This is the level for ongoing professional collaboration within a defined scope. Two compliance consultants working on the same regulatory area set up a Level 3 sync with the filter: area = FCP, module = gap-analysis, confidence > 0.7, created within the last 90 days. From that point forward, high-confidence gap analysis findings are automatically shared between them. Neither has to manually select and send atoms --- the flow is continuous within the defined boundaries.

The filter is the key constraint. A consultant can establish Level 3 sharing for their regulatory monitoring area without exposing their client engagement findings. The scope is precise, the boundaries are explicit, and the user retains full control over what the filter includes and excludes.

**Level 4: Full Collaboration.** Shared workspace with merged knowledge context. Both parties see each other's relevant atoms in module execution. The highest trust level, producing the highest value.

This is the level for close working partners --- co-counsel on a case, co-investigators on a regulatory examination, co-authors on a research paper. When one party runs a module session, the retrieval system searches both local and peer atoms, applying the provenance trust factor (Section 21) to rank results appropriately. The result is as if both professionals' accumulated knowledge were available in a single instance.

Level 4 requires extreme trust. It means your peer's atoms influence your AI's output. The provenance system ensures you can always see which atoms came from where, but the influence is real and immediate. This level is recommended only for relationships where you would trust the other person's professional judgement in a face-to-face collaboration.

**The Provenance Chain**

Every shared atom carries its provenance: which ANTON instance created it, when, which module, which area, what feedback rating it had at the time of sharing, and explicit consent metadata recording that the owner approved sharing this specific atom. The receiving ANTON can inspect the full provenance before accepting an atom. Accepted external atoms are tagged with trust metadata that flows into the boost ranking system (Section 21).

**The Revocation Model**

Knowledge sharing is revocable. Reduce the trust level at any time. Revocation does not delete atoms already accepted by the peer --- you cannot un-share knowledge that someone has already seen and integrated. But revocation stops new sharing immediately and flags all existing atoms from the revoked connection as "from revoked connection." The user decides whether to keep or purge those flagged atoms.

This mirrors professional reality. When a consulting firm ends a partnership with another firm, the knowledge exchanged during the partnership doesn't evaporate from anyone's memory. But the ongoing flow stops, and both parties understand that the source relationship has changed. ANTON's revocation model is honest about this: you can't unsee what you've seen, but you can stop seeing more.

**Contrast with Cloud Platforms**

Google Workspace: an administrator controls sharing settings, users have limited sovereignty over what is shared within the organisation, and Google is the data processor for everything.

Notion: team spaces are all-or-nothing within a workspace, with page-level permissions but no graduated trust model for knowledge atoms.

Microsoft Teams: sharing is governed by Azure AD and Compliance Center policies, with administrative controls that override individual user preferences.

ANTON: every connection, every atom, every sync filter is individually controlled by the user. No administrator can force a user to share knowledge they want to keep private. No platform operator has access to the content. No vendor's data processing agreement governs the flow. The user is the controller, the user decides, and the user can revoke at any time.

---

## 9. The Community Tab --- Where Humans Meet

The ANTON Agent Protocol (Sections 4--8) provides the infrastructure. The Community tab provides the human experience built on top of it.

AAP is a protocol --- identities, keys, messages, trust levels. The Community tab is a product --- a user interface where professionals communicate, collaborate, form groups, share resources, and build professional communities. The distinction matters because protocols are designed for machines and products are designed for people. The Community tab translates AAP's cryptographic infrastructure into interactions that feel natural to a compliance consultant, a teacher, or an NGO field worker.

**Direct Messaging**

End-to-end encrypted messaging between connected ANTON instances. Messages are stored locally on both sender and receiver instances. The relay (Section 6, Pattern 2) handles offline delivery. Messages support structured content types:

```sql
ALTER TABLE community_mail ADD COLUMN IF NOT EXISTS message_type TEXT NOT NULL DEFAULT 'text';
ALTER TABLE community_mail ADD COLUMN IF NOT EXISTS payload JSONB DEFAULT NULL;
ALTER TABLE community_mail ADD COLUMN IF NOT EXISTS payload_metadata JSONB DEFAULT NULL;
```

The `message_type` field enables rich content beyond plain text. A consultant can send a knowledge atom summary, a module recommendation, a bundle offer, or a structured request for feedback. Each message type has a defined schema, and the structured message handler validates payloads against their expected format before delivery.

The mail system is full-featured, not a minimal chat interface:

```sql
CREATE TABLE IF NOT EXISTS community_mail (
  id TEXT PRIMARY KEY,
  group_id TEXT,
  from_hash TEXT NOT NULL,
  to_hashes TEXT NOT NULL DEFAULT '[]',
  cc_hashes TEXT NOT NULL DEFAULT '[]',
  subject TEXT NOT NULL DEFAULT '(no subject)',
  body TEXT NOT NULL DEFAULT '',
  thread_id TEXT,
  parent_id TEXT,
  folder TEXT NOT NULL DEFAULT 'inbox'
    CHECK(folder IN ('inbox','sent','drafts','starred','archive','trash')),
  starred INTEGER NOT NULL DEFAULT 0,
  draft INTEGER NOT NULL DEFAULT 0,
  read_by TEXT NOT NULL DEFAULT '[]',
  message_type TEXT NOT NULL DEFAULT 'text',
  payload JSONB DEFAULT NULL,
  delivery_status TEXT NOT NULL DEFAULT 'local',
  delivery_attempts INTEGER DEFAULT 0,
  delivered_at TIMESTAMPTZ DEFAULT NULL,
  read_at TIMESTAMPTZ DEFAULT NULL,
  sent_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Threading, carbon copies, folders (inbox, sent, drafts, starred, archive, trash), read tracking, delivery status, draft support --- this is a professional communication system, not a chat widget. The design reflects the reality that professional communication is structured: messages need subjects, need threading, need filing, need the ability to draft and revise before sending.

**Groups**

Groups are the organisational unit for communities. Three group types serve different collaboration needs:

- **Open groups.** Anyone with the group hash can join. Suitable for public professional communities, open-source project discussions, or conference groups.
- **Closed groups.** Membership requires admin approval. The group is discoverable by its hash, but joining requires an administrator to accept the request. Suitable for professional associations, study groups, or regulated communities.
- **Private groups.** Invitation only, not discoverable. Only existing members can invite new members. Suitable for internal teams, confidential project groups, or sensitive collaboration contexts.

```sql
CREATE TABLE IF NOT EXISTS community_group_nodes (
  id TEXT PRIMARY KEY,
  group_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  avatar_color TEXT NOT NULL DEFAULT '#2DD4A8',
  join_code TEXT NOT NULL,
  group_key_b64 TEXT,
  node_url TEXT NOT NULL DEFAULT 'local',
  role TEXT NOT NULL DEFAULT 'admin'
    CHECK(role IN ('admin','member')),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Each group has a group hash (ANTON-GRP-XXXX-XXXX-XXXX), a join code for member onboarding, and an optional group encryption key for end-to-end encrypted group communication. Members are tracked separately:

```sql
CREATE TABLE IF NOT EXISTS community_group_members (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  contact_hash TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT 'Member',
  public_key TEXT,
  role TEXT NOT NULL DEFAULT 'member'
    CHECK(role IN ('admin','member')),
  muted_until TIMESTAMPTZ,
  mute_reason TEXT,
  joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(group_id, contact_hash)
);
```

The `muted_until` and `mute_reason` columns enable moderation --- administrators can temporarily mute disruptive members with a documented reason.

**Discussion Forums**

Within each group, threaded discussion forums enable structured conversation:

```sql
CREATE TABLE IF NOT EXISTS community_group_topics (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  author_hash TEXT NOT NULL,
  author_name TEXT NOT NULL DEFAULT 'Anonymous',
  pinned INTEGER DEFAULT 0,
  locked INTEGER DEFAULT 0,
  post_count INTEGER DEFAULT 0,
  last_post_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS community_group_posts (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL REFERENCES community_group_topics(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL,
  parent_id TEXT,
  author_hash TEXT NOT NULL,
  author_name TEXT NOT NULL DEFAULT 'Anonymous',
  content TEXT NOT NULL,
  upvotes INTEGER DEFAULT 0,
  flagged INTEGER DEFAULT 0,
  posted_at TIMESTAMPTZ DEFAULT NOW()
);
```

Topics can be pinned (important announcements stay at the top) or locked (no new replies, for concluded discussions). Posts support threading via `parent_id` and community voting via `upvotes`. The `flagged` field connects to the moderation system (Section 10).

**Cross-Pillar Integration**

The Community tab is not isolated from ANTON's professional functionality. Groups integrate with the platform's knowledge infrastructure:

- Shared news stories from the Intelligence Dashboard can be discussed in group forums.
- Finance watchlists from the Markets pillar can be shared within investment study groups.
- Module outputs can be shared for peer review within professional communities.
- In School mode, homework is assigned and submitted through class groups, with teacher visibility into student interactions.
- Calendar events (meetings, deadlines, training sessions) are managed through the group calendar.

**The Enabling Choice**

Community is disabled by default. Users actively choose to enable it. This design choice respects organisations that don't want peer-to-peer communication on their network. An organisation running ANTON in a regulated environment can deploy the full professional toolset without exposing community functionality. When the organisation later decides to enable community features --- perhaps for internal team collaboration, perhaps for client-facing groups --- the feature activates without migration, without reinstallation, without data loss.

When enabled, the Community tab is full-featured. It is not a watered-down afterthought bolted onto a professional tool. It is a complete communication and collaboration platform built on the same identity and encryption infrastructure as the rest of AAP.

---

## 10. Security Architecture --- Threat Model and Mitigations

Any networked system introduces attack surface. The ANTON Agent Protocol is designed with specific threats in mind, and specific mitigations for each.

**Threat Model**

| Threat | Attack Vector | Mitigation |
|--------|---------------|------------|
| Mass surveillance | Network traffic analysis to map all ANTON users | End-to-end encryption; relay stores only ciphertext; no central directory of users |
| Social graph analysis | Enumerating connections to map professional networks | No central database of connections; each ANTON stores only its own connections locally |
| Impersonation | Creating a fake ANTON identity to deceive a peer | Cryptographic identity; mutual key exchange with out-of-band verification via contact hashes |
| Spam and abuse | Unsolicited messages or connection requests | Mutual consent model; no cold messages possible; group moderation tools |
| Data breach at relay | Attacker compromises the relay server | Relay stores no plaintext; TTL-based expiry limits exposure; self-hosting eliminates third-party risk |
| Device theft | Physical access to an ANTON instance's device | Private keys encrypted at rest with passphrase-derived key; database encryption available |
| Rogue group administrator | Admin abuses moderation powers | Members can leave any group; per-user data deletion; admin actions are logged |
| Man-in-the-middle | Intercepting P2P or relay communication | X25519 key agreement; AES-256-GCM authentication; Ed25519 signatures on messages |
| Replay attacks | Re-sending captured messages | Nonce-based encryption (GCM); timestamp validation; message ID deduplication |
| Key compromise | Long-term private key exposed | Optional forward secrecy with ephemeral keys; key rotation capability; revocation notification to peers |

**Content Moderation**

For group forums and community posts, a moderation infrastructure enables reporting and review:

```sql
CREATE TABLE IF NOT EXISTS community_content_flags (
  id TEXT PRIMARY KEY,
  content_type TEXT NOT NULL
    CHECK(content_type IN ('forum_post', 'group_post', 'mail', 'topic')),
  content_id TEXT NOT NULL,
  group_id TEXT,
  reporter_hash TEXT NOT NULL,
  reason TEXT NOT NULL
    CHECK(reason IN ('spam', 'harassment', 'off_topic', 'inappropriate', 'other')),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending', 'reviewed', 'actioned', 'dismissed')),
  reviewed_by TEXT,
  action_taken TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);
```

The moderation system supports five flag reasons (spam, harassment, off-topic, inappropriate, other), four resolution states (pending, reviewed, actioned, dismissed), and a full audit trail of who flagged, who reviewed, and what action was taken. Group administrators review flags for their groups. There is no central moderation authority --- each group governs itself.

**The Self-Hosting Principle**

The security architecture rests on a principle: any component that handles sensitive data should be self-hostable. The relay server is self-hostable. The ANTON instance itself is self-hosted by design. The Companion App gateway runs on the organisation's infrastructure. No component requires trusting FutureChain with plaintext data.

This is not a convenience feature. It is a security architecture. When a regulated financial institution deploys ANTON, they run every component within their security perimeter. No data leaves their network except encrypted LLM API calls (a trade-off documented in Part 2, Section 32). When they enable AAP for inter-office communication, the relay runs on their servers. When they deploy the Companion App for client-facing use, the gateway runs on their infrastructure. FutureChain's involvement is limited to publishing the software. The institution controls the data.

**GDPR Analysis**

Under the ANTON Agent Protocol, the data controller is the user (or, in organisational deployments, the organisation). FutureChain is not a processor --- FutureChain does not process any personal data in the AAP architecture. If the default relay is used, FutureChain processes only encrypted blobs --- ciphertext that cannot be linked to individuals without the decryption keys, which FutureChain does not possess.

Right to erasure: delete the keypair, and the identity ceases to exist. Right to data portability: the .anton contact bundle is a portable, standard-format representation of the user's identity and connection data. Right to access: all data is stored locally and directly accessible.

**No Metadata Logging Beyond Delivery**

The relay server logs only what is necessary for message delivery: sender hash, recipient hash, timestamp, message size, and TTL. No content logging. No connection graph analysis. No usage analytics. Logs are rotated on a configurable schedule (default: 7 days). Self-hosted relays can disable logging entirely.

This commitment to metadata minimisation is a deliberate trade-off. It means that debugging delivery failures is harder --- there is less data to investigate. But it also means that a compromised relay yields minimal intelligence about the network's communication patterns. The trade-off favours privacy over operational convenience, which is the correct priority for a system designed to serve regulated professionals.

---

---

# Part 3: Markets Intelligence --- APCI Under Pressure

## 11. Why Markets?

Financial markets are the hardest test of any intelligence system. This is not a claim about the complexity of finance. It is a claim about the honesty of feedback.

In most professional domains, the quality of AI output is assessed subjectively. A compliance officer reads a gap analysis and judges whether it is useful. A lawyer evaluates a legal brief and decides whether it meets professional standards. A teacher reviews generated homework and determines whether it is pedagogically appropriate. These assessments are valuable --- they drive the feedback loop described in Part 2, Section 7 --- but they are opinions. Informed, expert, professional opinions, but opinions nonetheless.

Markets do not deal in opinions. A prediction that "the iShares STOXX Europe 600 Banks ETF will increase by at least 2% over the next 14 days" resolves to a fact. The price at day 14 is public, precise, and unambiguous. No evaluator needs to assess quality. No rubric needs to be applied. No committee needs to debate scoring methodology. The market moved or it didn't. The prediction was right or it wasn't.

This is why we chose markets as the proving ground for APCI. Not because we believe ANTON should be a trading system --- it explicitly is not, and it explicitly will not be (Section 18). Not because we believe AI can reliably predict market movements --- the efficient market hypothesis makes this structurally difficult, and we are not claiming to have disproven it. We chose markets because they provide the most unforgiving feedback loop available.

If APCI's compound value thesis is true --- if knowledge atoms that receive positive feedback actually improve future output, if the retrieval system gets better at finding relevant knowledge over time, if pattern detection surfaces real patterns rather than pareidolia --- then markets will prove it. Not quickly, not dramatically, but gradually and measurably. A system that compounds genuine intelligence will, over hundreds of predictions, demonstrate a calibration that is slightly better than chance. A system that does not compound genuine intelligence will demonstrate calibration that converges on noise.

Part 2, Section 7 described the feedback loop: users rate injected atoms as relevant or irrelevant, and those ratings improve future retrieval. In markets, the feedback comes from reality itself. A prediction's supporting atoms were either genuinely informative (the prediction was correct) or they were noise (the prediction was wrong). No human rater needs to decide --- the market decided. This means that the signal-to-noise ratio of the feedback loop is maximised. The learning signal is unambiguous.

Markets also demonstrate temporal reasoning --- the ability to reason across time horizons with values constraints. This capability generalises far beyond finance. A compliance team reasoning about regulatory deadlines, a project manager reasoning about delivery cascades, a career planner reasoning about certification timelines --- all face the same structural challenge: events at time T1 create constraints on decisions at time T2, which affect outcomes at time T3. Markets make this temporal reasoning visible and measurable. Section 16 describes how the temporal framework generalises.

**The Honest Framing**

ANTON does not claim to be a trading system. ANTON Indexes are paper-traded --- no real money, no brokerage integration, no financial advice. The value of the Markets pillar is not in generating trading profits. The value is in proving, publicly and continuously, that structured knowledge plus feedback loops plus temporal reasoning equals compound intelligence.

If the intelligence is real, the indexes demonstrate it. If it is not real, the indexes demonstrate that too. This is the honesty machine.

---

## 12. The Intelligence Engine

The Markets intelligence engine reuses the APCI infrastructure described in Part 2 but extends it with domain-specific structures: market atoms, theses, signals, predictions, and a learning loop that connects predictions to outcomes to calibration.

**Market Atoms**

Market atoms are structurally similar to knowledge atoms but stored separately to avoid cross-contamination between professional knowledge and market intelligence:

```sql
CREATE TABLE IF NOT EXISTS market_atoms (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  atom_type TEXT NOT NULL,    -- fact, signal, insight, event, prediction, outcome
  confidence REAL NOT NULL DEFAULT 0.5,
  category TEXT NOT NULL DEFAULT 'general',
    -- equity, macro, sector, commodity, fx, crypto, general
  subcategory TEXT,
  sentiment TEXT,             -- bullish, bearish, neutral, mixed
  temporal_type TEXT DEFAULT 'point',
    -- point, range, ongoing, recurring
  entities TEXT DEFAULT '[]',
  valid_from TIMESTAMPTZ DEFAULT NOW(),
  valid_until TEXT,
  decay_rate REAL NOT NULL DEFAULT 0.05,
  is_active INTEGER NOT NULL DEFAULT 1,
  superseded_by TEXT,
  source_instance_id TEXT,
  source_peer_hash TEXT,
  trust_level TEXT DEFAULT 'local',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

The separation from knowledge atoms is deliberate. Market atoms have a `decay_rate` field (default 0.05 per day) that does not exist on knowledge atoms --- because market intelligence degrades faster than regulatory knowledge. A finding that "AMLR Article 15 requires risk-based methodology" is valid for years. A finding that "Nordic bank stocks are showing momentum divergence" may be obsolete in days. The decay rate reflects this temporal difference.

The atom types are also market-specific: fact, signal, insight, event, prediction, and outcome. These six types map to the intelligence lifecycle --- raw information becomes a signal, signals are synthesised into insights, insights generate predictions, and predictions are verified against outcomes. The lifecycle is explicit, not implicit: every atom knows what stage of the intelligence process it represents.

**Data Sources**

Market intelligence requires data. ANTON's market data infrastructure supports multiple provider types:

```sql
CREATE TABLE IF NOT EXISTS market_data_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'api',
    -- api, rss, manual, webhook
  provider TEXT NOT NULL,
    -- alpha_vantage, finnhub, marketaux, custom
  config TEXT NOT NULL DEFAULT '{}',
  fetch_interval_hours INTEGER NOT NULL DEFAULT 6,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_fetch_at TEXT,
  last_fetch_status TEXT,     -- success, error, rate_limited
  items_fetched_total INTEGER NOT NULL DEFAULT 0,
  quality_score REAL DEFAULT 1.0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

Each data source has a quality score (0.0 to 1.0) that reflects its historical reliability. Sources that consistently provide accurate, timely data earn higher quality scores. Sources with frequent errors, stale data, or API rate-limiting issues see their scores decay. This quality score feeds into the confidence of atoms extracted from each source --- a high-quality source produces higher-confidence atoms.

Raw data is ingested and stored before processing:

```sql
CREATE TABLE IF NOT EXISTS market_data_raw (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  data_type TEXT NOT NULL,    -- price, news, event, fundamental, sentiment
  symbol TEXT,
  title TEXT,
  content TEXT,
  published_at TEXT,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  metadata TEXT DEFAULT '{}',
  is_processed INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (source_id) REFERENCES market_data_sources(id) ON DELETE CASCADE
);
```

The `is_processed` flag enables batch processing: raw data is ingested continuously, and atom extraction runs as a background process against unprocessed records. Every extracted atom links back to its source data through a provenance chain:

```sql
CREATE TABLE IF NOT EXISTS market_atom_sources (
  id SERIAL PRIMARY KEY,
  atom_id TEXT NOT NULL,
  raw_data_id TEXT NOT NULL,
  extraction_method TEXT NOT NULL DEFAULT 'ai',
    -- ai, manual, computation, rule
  extraction_model TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (atom_id) REFERENCES market_atoms(id) ON DELETE CASCADE,
  FOREIGN KEY (raw_data_id) REFERENCES market_data_raw(id) ON DELETE CASCADE
);
```

This provenance chain means that any market atom can be traced back to the raw data source it was extracted from, the extraction method used (AI-based, manual, computational, or rule-based), and the specific AI model that performed the extraction. Full auditability from conclusion to source.

**Theses**

Theses are structured investment arguments that aggregate atoms into coherent positions:

```sql
CREATE TABLE IF NOT EXISTS market_theses (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  thesis_type TEXT NOT NULL DEFAULT 'investment',
    -- investment, macro, sector, event, contrarian
  status TEXT NOT NULL DEFAULT 'draft',
    -- draft, active, monitoring, validated, invalidated, archived
  confidence REAL NOT NULL DEFAULT 0.5,
  time_horizon TEXT NOT NULL DEFAULT 'medium',
    -- short (< 1 month), medium (1-6 months), long (6+ months)
  success_criteria TEXT DEFAULT '[]',
  key_assumptions TEXT DEFAULT '[]',
  risk_factors TEXT DEFAULT '[]',
  target_entities TEXT DEFAULT '[]',
  ai_score REAL,
  ai_analysis TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

A thesis is not a prediction. It is the reasoning that leads to predictions. "Nordic bank regulation tightening will benefit CDD technology vendors" is a thesis. "XYZ FinTech's stock will rise 5% in the next 30 days" is a prediction derived from that thesis. The separation is important because theses persist across multiple predictions and can be validated or invalidated independently of any single prediction.

Theses are linked to their supporting evidence through the thesis-atom junction table:

```sql
CREATE TABLE IF NOT EXISTS market_thesis_atoms (
  id SERIAL PRIMARY KEY,
  thesis_id TEXT NOT NULL,
  atom_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'supports',
    -- supports, contradicts, context, assumption
  weight REAL NOT NULL DEFAULT 1.0,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (thesis_id) REFERENCES market_theses(id) ON DELETE CASCADE,
  FOREIGN KEY (atom_id) REFERENCES market_atoms(id) ON DELETE CASCADE
);
```

Each atom's role relative to the thesis is explicit: does it support the thesis, contradict it, provide context, or underpin an assumption? The weight field allows differential importance --- a primary supporting atom might have weight 2.0 while a peripheral context atom has weight 0.5. This structure makes the evidence chain auditable: for any thesis, you can see exactly which atoms support it, which contradict it, and how heavily each weighs.

**Narratives**

Above individual theses, the intelligence engine tracks market narratives --- the broader stories that shape market behaviour:

```sql
CREATE TABLE IF NOT EXISTS market_narratives (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  narrative_type TEXT NOT NULL DEFAULT 'thematic',
    -- thematic, sector, macro, geopolitical, sentiment
  strength REAL NOT NULL DEFAULT 0.5,
  momentum TEXT NOT NULL DEFAULT 'stable',
    -- emerging, strengthening, stable, weakening, broken
  lifecycle TEXT NOT NULL DEFAULT 'emerging',
    -- emerging, active, mature, declining, exhausted, broken
  beneficiary_entities TEXT DEFAULT '[]',
  counter_narrative TEXT,
  supporting_atoms TEXT DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

A narrative like "European regulatory tightening benefits compliance technology vendors" has a lifecycle: it emerges from initial regulatory signals, strengthens as concrete regulations are published, matures as the market fully prices in the thesis, and eventually exhausts as the regulatory cycle stabilises. The `lifecycle` and `momentum` fields track where each narrative sits in this arc.

The `counter_narrative` field links to the opposing thesis --- because every narrative has a counter-narrative. "Regulatory tightening benefits RegTech" is countered by "regulatory compliance costs compress bank margins, reducing technology budgets." Tracking both narratives and their counter-narratives prevents the intelligence engine from developing tunnel vision around a single story.

Narratives connect to theses (a narrative may support multiple theses) and to market regimes (a narrative may be regime-dependent --- valid in a low-volatility bull market but invalid in a crisis). The regime history table tracks market regime transitions:

```sql
CREATE TABLE IF NOT EXISTS market_regime_history (
  id TEXT PRIMARY KEY,
  regime_type TEXT NOT NULL,
    -- low_vol_bull, high_vol_bull, range_bound,
    -- correction, crisis, recovery
  confidence REAL NOT NULL DEFAULT 0.5,
  evidence TEXT DEFAULT '[]',
  impact_description TEXT,
  signal_weight_adjustments TEXT DEFAULT '{}',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

When the market regime changes --- from low-volatility bull to correction, for example --- the `signal_weight_adjustments` field specifies how signal weights should adapt. Momentum signals that are predictive in trending markets become noise in range-bound markets. Mean-reversion signals that fail in strong trends become valuable in corrections. Regime awareness prevents the intelligence engine from applying the wrong analytical framework to the current environment.

**Signal Weights**

The intelligence engine learns which types of signals are historically predictive:

```sql
CREATE TABLE IF NOT EXISTS market_signal_weights (
  id SERIAL PRIMARY KEY,
  signal_type TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  weight REAL NOT NULL DEFAULT 1.0,
  sample_size INTEGER NOT NULL DEFAULT 0,
  accuracy REAL,
  last_calibrated_at TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

When predictions are verified against actual outcomes (Section 14), the atoms that supported correct predictions see their signal type's weight increase, and the atoms that supported incorrect predictions see their signal type's weight decrease. Over time, the system learns that certain categories of signal (for example, earnings revision momentum in the Nordic banking sector) are more predictive than others (for example, general macroeconomic commentary). This learning is automatic, Bayesian, and continuous.

**The Learning Loop**

The Markets intelligence engine operates as a continuous learning cycle:

1. **Signal Detection.** Raw market data is ingested from configured sources. AI extraction identifies signals --- events or data points that may have predictive relevance. "Nordic bank CDD fines up 40% year-over-year" is a signal.

2. **Signal Classification.** Each signal is classified by type (regulatory, earnings, macro, technical, sentiment) and severity (low, medium, high, critical). Classification informs which consul persona (Section 13) is best suited to analyse it.

3. **Thesis Retrieval and Update.** The signal is matched against existing theses in the knowledge base. If a relevant thesis exists, it is updated with the new evidence. If no relevant thesis exists, the system proposes a new thesis for review.

4. **Consul Council Deliberation.** For significant signals (medium severity and above), the five consul personas independently assess the signal's implications (Section 13). Their assessments are synthesised into a unified view that preserves disagreements.

5. **Prediction Generation.** If the evidence and consul assessments support a specific, measurable, time-bound claim, a prediction is recorded with explicit confidence, time horizon, and supporting evidence.

6. **Weekly Pulse.** Each week, the system generates 10--15 short-term predictions on liquid ETFs with 7--14 day horizons. These are the "at-bats" --- frequent, measurable opportunities for the system to demonstrate (or fail to demonstrate) compound intelligence.

7. **Daily Verification.** At 12:00 CET daily, the prediction verifier (Section 14) checks expired predictions against actual market data. Verified predictions feed back into signal weight calibration.

8. **Why-Chain Analysis.** Failed predictions trigger root cause analysis (Section 14), generating new atoms that explain why the prediction failed and what the system should learn from the failure.

9. **Signal Weight Calibration.** Based on the accuracy of predictions supported by each signal type, signal weights are adjusted. Predictive signal types gain weight. Non-predictive signal types lose weight.

This nine-step loop runs continuously. Every cycle through the loop makes the next cycle marginally better. This is APCI applied to markets: not a single insight engine, but a compound learning system.

---

## 13. The Consul Council --- Five Perspectives, One Synthesis

Complex decisions benefit from multiple perspectives. This is not a platitude --- it is a structural observation about the nature of analytical error. A single analytical perspective tends to systematically overweight certain factors and underweight others. Multiple perspectives, each with different systematic biases, produce a more balanced assessment through their disagreements as much as through their agreements.

The Consul Council is a multi-persona reasoning architecture that applies this principle to market intelligence. Five personas independently assess each significant signal, thesis, or prediction decision. Their assessments are synthesised into a unified view that preserves --- not resolves --- areas of disagreement.

**The Five Consuls**

**1. The Macro Strategist** analyses top-down factors: interest rate trajectories, inflation dynamics, GDP trends, central bank policy, fiscal policy, currency movements, and geopolitical risk. The Macro Strategist's bias is toward systemic factors that affect entire asset classes. Their weakness is occasionally missing company-specific catalysts that move individual positions.

**2. The Sector Analyst** focuses on industry dynamics: competitive positioning, supply chain dependencies, regulatory headwinds and tailwinds, technology disruption, margin trends, and capital expenditure cycles. The Sector Analyst's bias is toward fundamental business analysis. Their weakness is occasionally underweighting macro factors that override sector dynamics (a strong sector in a weak economy still declines).

**3. The Contrarian** challenges consensus. When the other consuls agree, the Contrarian asks: what if they're wrong? What if the consensus trade is already priced in? What narrative is everyone telling themselves, and what evidence contradicts it? The Contrarian's bias is toward disagreement. Their weakness is that contrarianism for its own sake is noise, not signal --- being right when everyone else is wrong is valuable, but being wrong when everyone else is right is just wrong.

**4. The Risk Assessor** evaluates downside scenarios: tail risks, correlation risks, liquidity risks, concentration risks, and scenario analysis. When a prediction looks promising, the Risk Assessor asks: what happens if this goes wrong? How bad is the worst case? Is the risk/reward asymmetric? The Risk Assessor's bias is toward caution. Their weakness is occasionally paralyzing decision-making by finding risks in everything.

**5. The Synthesis** integrates the four perspectives. The Synthesis consul does not have its own analytical framework --- its role is to synthesise the others, noting where they agree (consensus signals), where they disagree (unresolved tensions), and how to weight each perspective given their historical accuracy in the current context type. The Synthesis consul produces the final assessment that informs predictions.

**How the Council Works**

For major decisions --- index rebalancing, thesis creation, high-confidence predictions --- all five consuls are consulted in a structured process:

1. Each consul receives the same input: the signal, the relevant atoms, the current theses, and the recent market context.
2. Each consul produces an independent assessment in a structured format: position (bullish/bearish/neutral), confidence (0.0--1.0), time horizon, key supporting arguments, key risks, and recommended action.
3. The Synthesis consul receives all four assessments and produces a unified view that explicitly notes agreements, disagreements, and the reasoning for its final position.
4. Disagreements are preserved in the record, not hidden. If the Macro Strategist is bullish and the Risk Assessor is bearish on the same opportunity, both perspectives are visible in the thesis documentation and in any resulting prediction.

This process maps to the Iterative Reasoning Engine described in Part 2, Section 24 --- the "council of experts" pattern applied to a domain where the experts can be individually calibrated against outcomes.

**A Worked Example**

Consider a signal detected on a Tuesday morning: "Swedish FSA announces enhanced supervisory expectations for CDD technology validation, effective Q3 2026."

The Macro Strategist assesses: "This aligns with the broader European regulatory tightening cycle. Impact is sector-specific but follows the macro pattern of post-AMLR implementation enforcement. Moderately bullish for CDD technology vendors, neutral for banks (compliance cost increase is marginal relative to total cost base). Confidence: 0.65. Time horizon: medium (3-6 months)."

The Sector Analyst assesses: "Three Nordic CDD technology vendors are publicly listed. Their combined market share in the Nordic banking sector is approximately 40%. Enhanced supervisory expectations for validation implies that banks must invest more in their CDD technology stack, benefiting vendors with established regulatory compliance certifications. Bullish for the sector. Confidence: 0.72. Time horizon: medium."

The Contrarian assesses: "The market has already priced in general regulatory tightening. This specific announcement adds incremental information but may not move prices meaningfully. The consensus view --- that regulation benefits compliance technology vendors --- has been the dominant narrative for 18 months. Check whether the trade is crowded. Neutral. Confidence: 0.55."

The Risk Assessor assesses: "Risk scenario: enhanced supervisory expectations could lead to a wave of vendor switching, creating short-term revenue disruption for incumbent vendors as banks renegotiate contracts. Tail risk: if the FSA finds systemic deficiencies during its enhanced supervision, it could mandate specific technology changes that disadvantage current market leaders. Risk-adjusted view: moderately bullish but with position size constraints. Confidence: 0.60."

The Synthesis consul integrates: "Three of four consuls are moderately bullish. The Contrarian raises a valid concern about narrative exhaustion --- the 'regulation benefits RegTech' trade has been running for 18 months. However, this is a specific supervisory action, not a general narrative, which adds incremental information. The Risk Assessor's tail risk scenario (vendor switching) is plausible but low-probability. Synthesised position: moderately bullish, confidence 0.63, with the caveat that position sizing should be conservative given the Contrarian's crowded-trade concern."

This synthesised view informs a prediction: "Nordic CDD technology vendors (equal-weight basket) will outperform the OMX Nordic 40 by 2% over the next 90 days." The prediction is recorded with confidence 0.63, the supporting thesis, all five consul assessments, and the specific atoms that informed each assessment.

Ninety days later, the prediction is verified. If correct, the Macro Strategist and Sector Analyst gain accuracy credit for this context type. If incorrect, the why-chain analysis investigates whether the Contrarian was right about narrative exhaustion.

**Calibration**

The most important feature of the Consul Council is per-consul accuracy tracking:

```sql
CREATE TABLE IF NOT EXISTS market_consul_performance (
  id SERIAL PRIMARY KEY,
  consul_name TEXT NOT NULL,
    -- macro_strategist, sector_analyst, contrarian, risk_assessor, synthesis
  context_type TEXT NOT NULL DEFAULT 'general',
    -- general, earnings, macro, geopolitical, sector
  time_horizon TEXT NOT NULL DEFAULT 'medium',
    -- short, medium, long
  total_predictions INTEGER NOT NULL DEFAULT 0,
  correct_predictions INTEGER NOT NULL DEFAULT 0,
  accuracy REAL,
  avg_confidence REAL,
  calibration_error REAL,
  last_evaluated_at TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

Every consul's accuracy is tracked across context types and time horizons. The Macro Strategist might have 72% accuracy on macro-driven predictions with medium time horizons, but only 45% accuracy on sector-specific predictions with short time horizons. The Sector Analyst might show the inverse pattern. This per-context, per-horizon calibration means that the Synthesis consul can weight perspectives appropriately: in a macro-driven environment, weight the Macro Strategist's view higher; in a sector rotation context, weight the Sector Analyst higher.

Calibration error measures the gap between stated confidence and actual accuracy. A consul that consistently states 80% confidence but achieves only 55% accuracy is overconfident --- their calibration error is high. A consul that states 60% confidence and achieves 58% accuracy is well-calibrated. Over time, the system adjusts each consul's effective weight based on calibration quality, rewarding well-calibrated perspectives and downweighting overconfident ones.

This is the Bayesian feedback loop applied to persona effectiveness. It is the same principle as Part 2's feedback-driven retrieval ranking, but applied to analytical perspectives rather than knowledge atoms. The system learns which perspectives to trust in which contexts, not through configuration, but through observed performance.

---

## 14. Prediction Tracking --- The Honesty Machine

The prediction tracking system is the heart of Markets Intelligence. Everything else --- atoms, theses, consuls, signals --- exists to generate predictions. The tracking system exists to grade them.

**Prediction Structure**

Every prediction is recorded with explicit, measurable parameters:

```sql
CREATE TABLE IF NOT EXISTS market_predictions (
  id TEXT PRIMARY KEY,
  thesis_id TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  prediction_type TEXT NOT NULL DEFAULT 'directional',
    -- directional, price_target, timing, relative, binary
  target_entity TEXT,
  target_symbol TEXT,
  predicted_outcome TEXT NOT NULL,
  predicted_value REAL,
  predicted_direction TEXT,   -- up, down, flat
  confidence REAL NOT NULL DEFAULT 0.5,
  time_horizon_days INTEGER,
  deadline TEXT,
  status TEXT NOT NULL DEFAULT 'active',
    -- active, expired, validated, invalidated
  actual_outcome TEXT,
  actual_value REAL,
  was_correct INTEGER,        -- 1 = correct, 0 = wrong, NULL = pending
  brier_score REAL,
  key_assumptions TEXT DEFAULT '[]',
  validated_at TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

Several design choices in this schema are worth noting.

The `prediction_type` field distinguishes between directional predictions ("the price will go up"), price targets ("the price will reach 150"), timing predictions ("this event will occur before Q3"), relative predictions ("Stock A will outperform Stock B"), and binary predictions ("the central bank will cut rates"). Each type has a different verification methodology.

The `deadline` field is mandatory for verification. A prediction without a deadline is unfalsifiable --- it could always be "not yet" rather than "wrong." By requiring deadlines, the system ensures that every prediction eventually resolves.

The `brier_score` field records the Brier score --- a proper scoring rule that measures the accuracy of probabilistic predictions. The Brier score ranges from 0 (perfect prediction) to 1 (worst possible prediction), calculated as the squared difference between the predicted probability and the actual outcome (1 for correct, 0 for incorrect). A Brier score of 0.25 corresponds to a 50% confidence prediction that turned out correct --- the baseline for an uninformative predictor.

**The Verification Engine**

At 12:00 CET daily, the prediction verifier runs automatically. It identifies all active predictions whose deadlines have passed and attempts to verify them:

For directional predictions, the verifier retrieves the price at the deadline date and compares it to the price at prediction creation. If the predicted direction matches the actual price movement, the prediction is marked correct.

For price target predictions, the verifier compares the predicted value to the actual value. The grading is continuous, not binary:

- Direction correct and strong move (actual move exceeds predicted move): graded score 1.0
- Direction correct and target hit (actual value within 10% of predicted value): graded score 0.9
- Direction correct but weak move (actual move is less than 50% of predicted move): graded score 0.7
- Direction correct but target missed significantly: graded score 0.5
- Direction wrong but negligible move (less than 0.5%): graded score 0.3
- Direction wrong and significant move: graded score 0.0

This grading curve provides partial credit for close predictions, which is essential for meaningful calibration. A prediction that "the ETF will rise 5%" when it actually rises 3% should not be graded identically to a prediction that it rises 5% when it falls 10%. The continuous grading captures the distance between prediction and reality, not just the binary outcome.

**Feedback Records**

Every verification generates a detailed feedback record:

```sql
CREATE TABLE IF NOT EXISTS market_prediction_feedback (
  id SERIAL PRIMARY KEY,
  prediction_id TEXT NOT NULL,
  feedback_type TEXT NOT NULL DEFAULT 'validation',
    -- validation, partial_update, assumption_check
  predicted_value REAL,
  actual_value REAL,
  accuracy_score REAL,
  explanation TEXT,
  lessons_learned TEXT,
  atoms_created TEXT DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (prediction_id) REFERENCES market_predictions(id) ON DELETE CASCADE
);
```

The `accuracy_score` is 1 minus the Brier score --- a convenience inversion that makes higher values mean better performance (consistent with the rest of ANTON's confidence system). The `explanation` field records the verification methodology and reasoning. The `atoms_created` field links to new knowledge atoms generated from the verification --- lessons learned that feed back into the knowledge base.

**The Why-Chain: Root Cause Analysis**

Failed predictions are not just scored --- they are investigated. The why-chain system performs structured root cause analysis using the "5 Whys" methodology:

```sql
CREATE TABLE IF NOT EXISTS market_why_chains (
  id TEXT PRIMARY KEY,
  investigation_id TEXT,
  prediction_id TEXT,
  title TEXT NOT NULL,
  root_cause_type TEXT,
    -- data_gap, model_limitation, signal_weakness, process_gap,
    -- assumption_flaw, external_shock, infrastructure_gap,
    -- consul_calibration, regime_mismatch
  root_cause_description TEXT,
  impact_assessment TEXT,
  num_levels INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'in_progress',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TEXT,
  FOREIGN KEY (prediction_id) REFERENCES market_predictions(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS market_why_chain_levels (
  id SERIAL PRIMARY KEY,
  chain_id TEXT NOT NULL,
  level_number INTEGER NOT NULL,  -- 1 through 5
  question TEXT NOT NULL,         -- "Why did X happen?"
  answer TEXT NOT NULL,
  evidence_atoms TEXT DEFAULT '[]',
  atom_created TEXT,              -- atom ID created from this finding
  created_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (chain_id) REFERENCES market_why_chains(id) ON DELETE CASCADE
);
```

Each why-chain drills through up to five levels of causation. A failed prediction about Nordic bank stocks might produce:

- Level 1: "Why did the prediction fail?" --- "The price moved opposite to the predicted direction."
- Level 2: "Why did the price move opposite?" --- "An unexpected regulatory announcement increased capital requirements."
- Level 3: "Why was the regulatory announcement unexpected?" --- "The signal scanner did not cover the relevant regulatory body's publication calendar."
- Level 4: "Why was the publication calendar not covered?" --- "The data source configuration does not include [specific regulator] as a monitored source."
- Level 5: Root cause: `data_gap` --- "Add [regulator] to the monitored data sources and backfill historical regulatory publications."

Each level can generate a new atom (the `atom_created` field), feeding the finding back into the knowledge base. The root cause type (one of nine categories including data_gap, model_limitation, signal_weakness, assumption_flaw, and external_shock) enables meta-analysis: if 40% of failed predictions trace to data gaps, the system needs better data coverage. If 30% trace to consul_calibration, the consul weights need adjustment.

**Investigation Tasks**

Complex failures trigger investigation tasks assigned to specific consuls:

```sql
CREATE TABLE IF NOT EXISTS market_investigation_tasks (
  id TEXT PRIMARY KEY,
  trigger_type TEXT NOT NULL,
    -- prediction_wrong, unexplained_win, assumption_breach,
    -- pattern_anomaly, blind_spot, regime_shift,
    -- narrative_shift, consul_disagreement
  trigger_reference TEXT,
  title TEXT NOT NULL,
  question TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  assigned_consul TEXT,
  findings TEXT DEFAULT '[]',
  atoms_created TEXT DEFAULT '[]',
  process_improvements TEXT DEFAULT '[]',
  root_cause TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TEXT
);
```

Note the `trigger_type` field: investigations are triggered not only by incorrect predictions (`prediction_wrong`) but also by unexplained successes (`unexplained_win`). A prediction that was correct but for the wrong reasons is as informative as a prediction that was incorrect. If the Macro Strategist predicted a price rise based on interest rate expectations, but the price actually rose because of an unrelated merger announcement, the prediction was "correct" but the reasoning was wrong. The `unexplained_win` trigger captures this distinction, because compounding intelligence requires learning from the right reasons, not just the right answers.

**The Brier Score as Truth Metric**

The Brier score deserves additional discussion because it is the foundation of the honesty machine.

Consider a prediction system that always predicts 80% confidence. If actual accuracy is 80%, the Brier score is 0.16 (well-calibrated). If actual accuracy is 50%, the Brier score is 0.32 (overconfident). A well-calibrated system's Brier score tracks closely with the optimal score for its actual accuracy level.

Over hundreds of predictions, the aggregate Brier score tells you whether the system is actually learning. A declining Brier score (improving calibration) over time means the system's stated confidence is converging on its actual accuracy. An increasing Brier score means the system is becoming less calibrated --- either more overconfident or less accurate.

The confidence calibration table tracks this explicitly:

```sql
CREATE TABLE IF NOT EXISTS market_confidence_calibration (
  id SERIAL PRIMARY KEY,
  bucket_low REAL NOT NULL,
  bucket_high REAL NOT NULL,
  sample_size INTEGER NOT NULL DEFAULT 0,
  actual_accuracy REAL,
  stated_confidence_avg REAL,
  calibration_error REAL,
  is_overconfident INTEGER,
  period_start TEXT,
  period_end TEXT,
  computed_at TIMESTAMPTZ DEFAULT NOW()
);
```

Predictions are bucketed by confidence level (0.5--0.6, 0.6--0.7, etc.), and actual accuracy within each bucket is compared to stated confidence. A well-calibrated system shows actual accuracy close to stated confidence across all buckets. An overconfident system shows actual accuracy below stated confidence, especially in higher-confidence buckets.

The Renaissance Technologies analogy is instructive. Renaissance's Medallion Fund achieved roughly 50.75% accuracy on individual trades --- barely above chance. But compounded over millions of decisions with managed risk and proper position sizing, that 0.75% edge produced the greatest track record in quantitative finance history. ANTON does not need to be right most of the time. It needs to be right slightly more often than a naive predictor, consistently, with managed risk. The Brier score measures whether it achieves this.

---

## 15. ANTON Indexes --- The Public Scorecard

If predictions are the unit test of intelligence, ANTON Indexes are the integration test. They combine hundreds of individual prediction signals, thesis assessments, and consul recommendations into synthetic portfolios whose performance is continuously calculated against real market data.

**What They Are**

ANTON Indexes are paper-traded synthetic benchmark portfolios. No real money is involved. No brokerage integration exists. No financial advice is offered. They are computational exercises that transform market intelligence into portfolio decisions and track the outcomes.

```sql
CREATE TABLE IF NOT EXISTS market_indexes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  index_type TEXT NOT NULL DEFAULT 'custom',
    -- geographic, sector, philosophy, custom
  philosophy TEXT,
    -- value, growth, momentum, contrarian, etc.
  status TEXT NOT NULL DEFAULT 'draft',
    -- draft, active, paused, archived
  universe TEXT DEFAULT '[]',
  max_holdings INTEGER NOT NULL DEFAULT 20,
  rebalance_frequency TEXT NOT NULL DEFAULT 'monthly',
    -- weekly, monthly, quarterly
  weighting_method TEXT NOT NULL DEFAULT 'equal',
    -- equal, market_cap, conviction, risk_parity
  inception_date TEXT,
  last_rebalance_at TEXT,
  total_return REAL DEFAULT 0.0,
  current_nav REAL DEFAULT 1000.0,
  benchmark_symbol TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

Every index starts with a NAV (Net Asset Value) of 1,000. From there, the intelligence engine composes the portfolio, determines weights, executes rebalances, and calculates returns using closing prices from public market data. The benchmark symbol allows direct comparison: if the ANTON Nordic 30 index benchmarks against EUNL (iShares Core MSCI Europe), the performance gap is calculated daily.

**Default Seeded Indexes**

ANTON ships with five default index templates:

1. **ANTON US 100** --- Broad US market exposure. Universe: S&P 500 constituents. Weighting: conviction-based (AI-selected weights based on thesis confidence). Benchmark: SPY. This index tests whether the intelligence engine can outperform a passive market-cap-weighted index by tilting toward companies with stronger thesis support.

2. **ANTON Nordic 30** --- Nordic market focus. Universe: OMX Nordic 40 and selected Nordic mid-caps. Weighting: equal weight. Benchmark: EUNL (Europe-wide) and a custom Nordic composite. This is ANTON's home market index, where the system's regulatory knowledge (from the FCP and Legal pillars) creates an information edge.

3. **ANTON Value 20** --- Buffett-philosophy value investing. Universe: global large caps. Selection criteria: strong free cash flow, reasonable valuations, durable competitive advantages, honest management. Maximum 20 holdings. Low turnover. This index tests whether the intelligence engine can identify quality businesses using fundamental analysis.

4. **ANTON ESG Leaders 20** --- ESG-first selection. Universe: companies with strong environmental, social, and governance ratings. Weighting: risk-parity. This index tests whether ESG-aligned investing produces competitive returns --- a question with significant academic debate.

5. **ANTON NextGen 10** --- Disruptive technology and innovation. Universe: companies in AI, biotechnology, clean energy, space, and quantum computing. Maximum 10 holdings. High conviction. This is the highest-risk, highest-variance index, testing whether the intelligence engine can identify transformative companies early.

Users can create custom indexes via the Index Composer module. Define the universe, the weighting scheme, the rebalance frequency, and the benchmark. Share index templates as .anton bundles.

**NAV History and Performance Tracking**

Every trading day, the system calculates each index's NAV and a comprehensive set of performance metrics:

```sql
CREATE TABLE IF NOT EXISTS market_index_nav_history (
  id SERIAL PRIMARY KEY,
  index_id TEXT NOT NULL,
  nav_date TEXT NOT NULL,
  nav_value REAL NOT NULL,
  daily_return REAL,
  cumulative_return REAL,
  benchmark_value REAL,
  benchmark_return REAL,
  excess_return REAL,
  volatility_30d REAL,
  sharpe_30d REAL,
  max_drawdown REAL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (index_id) REFERENCES market_indexes(id) ON DELETE CASCADE
);
```

Daily return, cumulative return, excess return over benchmark, 30-day rolling volatility, 30-day Sharpe ratio, and maximum drawdown --- the standard suite of portfolio analytics, calculated daily and stored for historical analysis. This is not a simplified tracking system. It produces the same metrics that institutional portfolio managers use to evaluate fund performance.

**Rebalancing and Attribution**

When the intelligence engine determines that portfolio composition should change --- based on new theses, updated predictions, consul council recommendations, or scheduled rebalance cycles --- a rebalance is executed:

```sql
CREATE TABLE IF NOT EXISTS market_index_rebalances (
  id TEXT PRIMARY KEY,
  index_id TEXT NOT NULL,
  rebalance_type TEXT NOT NULL DEFAULT 'scheduled',
    -- scheduled, manual, threshold, event
  pre_holdings TEXT NOT NULL DEFAULT '[]',
  post_holdings TEXT NOT NULL DEFAULT '[]',
  trades TEXT NOT NULL DEFAULT '[]',
  reasoning TEXT,
  prediction_signals JSONB DEFAULT '[]',
  trigger_type TEXT DEFAULT 'scheduled',
  nav_at_rebalance REAL,
  executed_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (index_id) REFERENCES market_indexes(id) ON DELETE CASCADE
);
```

The `reasoning` field records the AI's explanation for each rebalance decision. The `prediction_signals` field links the rebalance to the specific predictions that influenced it. The `pre_holdings` and `post_holdings` fields capture the full portfolio state before and after, enabling before/after analysis.

Attribution tracks which predictions contributed to index performance:

```sql
CREATE TABLE IF NOT EXISTS market_prediction_attribution (
  id SERIAL PRIMARY KEY,
  prediction_id TEXT NOT NULL,
  rebalance_id TEXT NOT NULL,
  signal_score REAL NOT NULL,
  weight_change REAL NOT NULL,
  subsequent_return REAL,
  attribution_pnl REAL,
  computed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

This table answers the question: "Which predictions drove returns?" If the ANTON Nordic 30 outperformed its benchmark by 2% last quarter, the attribution system shows which specific predictions led to the overweight positions that generated that excess return. And which specific predictions led to underweight positions that cost performance. This is not just performance measurement --- it is intelligence measurement. The system can identify which types of predictions, from which consuls, in which market contexts, create the most value. This feeds directly back into the learning loop.

**The Leaderboard**

Performance across indexes is tracked on a leaderboard:

```sql
CREATE TABLE IF NOT EXISTS market_index_leaderboard (
  id SERIAL PRIMARY KEY,
  index_id TEXT NOT NULL,
  period TEXT NOT NULL,
    -- 1w, 1m, 3m, 6m, 1y, ytd, inception
  total_return REAL NOT NULL,
  annualized_return REAL,
  sharpe_ratio REAL,
  max_drawdown REAL,
  volatility REAL,
  alpha REAL,
  beta REAL,
  rank_position INTEGER,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (index_id) REFERENCES market_indexes(id) ON DELETE CASCADE
);
```

Alpha, beta, Sharpe ratio, maximum drawdown --- the leaderboard provides institutional-grade performance analytics. The `rank_position` field enables comparison across indexes: which investment philosophy is the intelligence engine most effective at? If the Value 20 consistently outperforms while the NextGen 10 consistently underperforms, the system has demonstrated that its analytical strengths lie in fundamental analysis rather than disruptive technology identification. This is useful self-knowledge.

**Why This Is the Most Important Marketing Asset**

Consider the headline: "Open-source AI platform's Nordic index outperforms OMX for four consecutive months." That is a headline that writes itself. It is not a claim about AI capability in the abstract --- it is a specific, verifiable, continuously updated demonstration. The index data is public. The methodology is documented. The performance is calculated using standard time-weighted return methodology and publicly available closing prices. Anyone can verify it.

If the indexes underperform, that is equally visible. This is the honesty machine at work. ANTON does not claim to have alpha. It claims to have a system for compounding intelligence. The indexes are the evidence, positive or negative.

For organisations evaluating ANTON, the indexes provide a unique form of due diligence. No other AI platform publishes continuously updated, verifiable performance metrics against objective benchmarks. The indexes are ANTON's proof of concept, running in public, every day.

---

## 16. Temporal Reasoning as a Generalizable Framework

Markets require reasoning across time horizons with values constraints. A prediction that "the ECB will cut rates at the September meeting" is a temporal claim --- it specifies both an expected event and a time boundary. The decision to increase exposure to European banks ahead of the expected cut is a temporal action --- it depends on the timing of the event relative to portfolio adjustment.

This temporal reasoning capability is not unique to finance. It appears in every professional domain where timing matters --- which is to say, every professional domain.

**The Temporal Reasoning Framework**

The system reasons about time in four dimensions:

**Temporal atoms.** Knowledge with explicit time dimensions --- effective dates, expiry dates, event horizons. "AMLR application date is July 2027" is a temporal atom with a specific future event. "Nordea's BWRA was last reviewed in Q3 2025" is a temporal atom with a specific past reference.

**Temporal relationships.** Structured dependencies between time-bound events. "A precedes B" (sequencing), "A blocks B" (dependency), "A expires before B becomes relevant" (temporal conflict), "A enables B after delay D" (cascade). These relationships are typed and stored alongside the knowledge relationship types described in Part 2, Section 8.

**Temporal patterns.** Recurring cycles, seasonal effects, deadline cascades, and rhythm detection. "Regulatory deadlines cluster in Q1" is a temporal pattern. "Market volatility increases before central bank meetings" is a temporal pattern. "Student comprehension drops after holiday breaks" is a temporal pattern. The pattern detection system (Part 2, Section 10) is extended with temporal pattern types that detect periodicity and cyclicality.

**Temporal confidence.** Predictions have a half-life. A 14-day market prediction might be high-confidence at day 1, medium-confidence at day 7, and low-confidence at day 12 as the time horizon narrows and the remaining window for the predicted event shrinks. Compliance deadline assessments have increasing urgency as the deadline approaches. Project timeline assessments have decreasing confidence as the planning horizon extends.

**Generalisation Examples**

The framework that enables market predictions generalises directly:

1. **Markets.** "If Nordic bank regulation tightens in Q3, CDD technology vendors will benefit in Q4--Q1." This is a temporal cascade: regulatory event at T1 creates demand at T2, which drives revenue at T3. The prediction is time-bound, the causal chain has temporal structure, and the confidence decays as the horizon extends.

2. **Compliance.** "AMLR application date is July 2027. If we start gap analysis now, we need 180 days for remediation, which means remediation must begin by January 2027 at the latest, which means gap analysis must complete by October 2026." This is a deadline cascade: a fixed future event creates backward-propagating constraints on present actions. The temporal reasoning framework computes these cascades automatically.

3. **Project Management.** "If Phase 1 slips by two weeks, the Phase 2 start date moves, the integration testing window shrinks, and the go-live date is at risk." This is a cascade with slack detection: the framework can identify which dependencies have buffer and which are on the critical path.

4. **Career Planning.** "If I obtain this certification by June, I am eligible for the senior role opening in September. The certification exam requires 200 hours of preparation, so I must start studying by February." This is an opportunity mapping problem: a future opportunity creates backward constraints on present commitments.

5. **Orchestrator Autonomy.** "Based on 50 successful autonomous executions of this task type over the past 90 days, the Orchestrator has earned Phase 3 trust for this category." This is temporal earned autonomy: a future trust state depends on the accumulation of successful past events within a time window.

**Why Markets Is the Proving Ground**

Markets validate the temporal framework because market timing is both critical and measurable. A prediction that "the ECB will cut rates" is useless without a time boundary. A thesis about "Nordic bank regulatory tightening" is imprecise without a temporal horizon. By requiring explicit time boundaries on all predictions and verifying against actual timing, Markets forces the temporal framework to demonstrate its value.

If the temporal patterns detected in market data prove genuinely predictive (even marginally), the same detection capability applied to compliance deadline patterns, project timeline patterns, and career progression patterns will be equally valuable. Markets is the hardest test case. Everything else is easier.

---

## 17. Database Architecture

The Markets pillar adds approximately 30 tables to the ANTON database, organised into seven functional groups. This section summarises the groups and their purposes. The full schema is defined across migrations 049--066 in the `server/db/migrations-pg/` directory.

**Group 1: Data Infrastructure** (market_data_sources, market_data_raw, market_computation_log)
Raw data ingestion, provider management, and computation audit trail. Every piece of data that enters the Markets system is logged with its source, fetch timestamp, and processing status. The computation log records every Python template execution --- inputs, outputs, execution time, and status --- for full audit trail.

**Group 2: Atom Layer** (market_atoms, market_atom_sources, market_atom_tags, market_atom_relationships)
The market-specific knowledge atom infrastructure. Atoms extracted from raw data, linked to their sources, tagged for filtering, and connected through typed relationships (supports, contradicts, extends, supersedes, caused_by).

**Group 3: Thesis and Evidence** (market_theses, market_thesis_atoms, market_predictions, market_prediction_feedback, market_prediction_attribution)
The analytical layer. Theses aggregate atoms into structured arguments. Predictions derive from theses with explicit time bounds. Feedback records verification outcomes. Attribution links prediction signals to portfolio outcomes.

**Group 4: Entity Graph** (market_entities, market_entity_relationships, market_entity_aliases)
The market entity knowledge graph. Companies, sectors, indexes, currencies, commodities, central banks, and event types, connected by typed relationships (competes_with, supplies_to, subsidiary_of, correlates_with, sector_member, affected_by). Entity aliases handle the reality that a single entity may be known by multiple names and identifiers (ticker, ISIN, CUSIP, LEI).

**Group 5: Index Management** (market_indexes, market_index_holdings, market_index_nav_history, market_index_rebalances, market_index_leaderboard)
The paper-traded portfolio infrastructure. Index definitions, current holdings with unrealised P&L, daily NAV history with performance metrics, rebalance audit trail with full before/after snapshots, and cross-index performance leaderboard.

**Group 6: Learning** (market_signal_weights, market_consul_performance, market_confidence_calibration, market_meta_learning, market_narratives, market_investigation_tasks, market_why_chains, market_why_chain_levels, market_backtests)
The self-learning infrastructure. Signal weight calibration, per-consul accuracy tracking, confidence calibration analysis, meta-learning events, narrative lifecycle tracking, investigation management, and root cause analysis chains. This group is the largest by table count because learning is the most important capability.

The meta-learning table deserves particular attention:

```sql
CREATE TABLE IF NOT EXISTS market_meta_learning (
  id TEXT PRIMARY KEY,
  learning_type TEXT NOT NULL,
    -- signal_reweight, correlation_update, blind_spot_discovery,
    -- consul_calibration, narrative_shift, regime_detection
  description TEXT NOT NULL,
  source_prediction_id TEXT,
  accuracy_delta_30d REAL,
  accuracy_delta_60d REAL,
  accuracy_delta_90d REAL,
  impact TEXT NOT NULL DEFAULT 'unknown',
    -- high, medium, low, unknown
  is_sustained INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

Meta-learning records are the system's record of learning about its own learning. When signal weights are recalibrated and the subsequent 30-day prediction accuracy improves by 5%, that improvement is logged as a meta-learning event of type `signal_reweight` with `accuracy_delta_30d = 0.05`. Over time, the meta-learning table reveals which types of system adjustments produce sustained improvements and which are noise. The `is_sustained` flag tracks whether a learning event's benefit persists at 60 and 90 days --- short-term improvements that fade are less valuable than improvements that compound.

The backtesting infrastructure enables retrospective validation:

```sql
CREATE TABLE IF NOT EXISTS market_backtests (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  strategy_config TEXT NOT NULL DEFAULT '{}',
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  results TEXT DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TEXT
);
```

Backtests answer the question: "If the current intelligence engine had been running over the past 12 months, what would its performance have been?" This is not forward-looking evidence (backtesting is notoriously prone to overfitting), but it provides a consistency check: a system that performs well on forward predictions but poorly on backtests may have benefited from luck rather than intelligence. A system that performs consistently across both forward and backward evaluation is more likely to have captured genuine patterns.

**Group 7: Detection** (market_pattern_detections, market_correlation_map, market_regime_history)
Automated pattern detection: momentum divergences, volume anomalies, correlation breaks, sector rotations, and regime changes. The correlation map tracks pairwise asset correlations with lag analysis. The regime history tracks the current market regime (low-vol bull, high-vol bull, range-bound, correction, crisis, recovery) and its implications for signal weight adjustment.

**Why PostgreSQL**

Markets is the strongest argument for the PostgreSQL migration that v0.7.x implements. The volume of daily price data, the signal processing pipeline, the NAV calculations, and the concurrent read/write patterns of data ingestion alongside analysis would stress SQLite's single-writer model. PostgreSQL's MVCC (Multi-Version Concurrency Control) allows the data ingestion process to write raw market data while the analysis process reads existing atoms and writes new ones --- without locking contention. Table partitioning (migration 057) enables efficient management of time-series data that grows indefinitely. GIN indexes on JSONB columns (migration 056) provide fast filtering on the JSON metadata fields that pervade the market schema.

The Markets pillar generates 65 Python computation templates for quantitative analysis: portfolio NAV calculation, volatility estimation, correlation computation, sector decomposition, and attribution analysis. These templates read and write large result sets --- operations that benefit substantially from PostgreSQL's query planner, parallel query execution, and efficient aggregation.

---

## 18. Legal and Compliance Boundaries

ANTON is not an investment advisor, a broker-dealer, a fund manager, or a financial services provider. The Markets pillar is explicitly and deliberately positioned outside the regulatory perimeter of financial advice.

**Not Investment Advice.** ANTON Indexes are paper-traded. No real money is invested. No financial recommendations are made. No suitability assessment is performed. No client assets are managed. The indexes are computational exercises that demonstrate the intelligence engine's analytical capabilities. A persistent disclaimer appears on every Markets page, every index view, every prediction record, and every exported report.

**No Brokerage Integration.** There is no API connection to any brokerage, exchange, or trading platform. This is not a limitation waiting to be lifted --- it is a deliberate architectural boundary. Adding brokerage integration would transform ANTON from a knowledge platform into a financial services application, triggering MiFID II compliance requirements, client suitability obligations, trade execution standards, and regulatory reporting obligations that are fundamentally incompatible with a local-first, open-source architecture.

**Performance Reporting.** Index performance is calculated using standard methodology: time-weighted returns using daily closing prices from public market data providers. The methodology is documented, reproducible, and verifiable. No performance claims are made that cannot be independently calculated from the published holdings and public price data.

**GDPR Considerations.** Market data is public. User-created theses, watchlists, predictions, and investigation notes are personal data under GDPR, stored locally on the user's device. No market-related personal data is transmitted to FutureChain or any third party. The GDPR controller is the user. Right to erasure is exercised by deleting the local database.

**Disclaimers.** The following disclaimer is displayed on every Markets interface element: "ANTON Markets is a research and learning tool. All indexes are paper-traded. No financial advice is given. Past analytical performance does not predict future accuracy. This is not a solicitation to buy or sell any security."

---

---

# Part 4: Knowledge Across the Boundary

## 19. The Hard Problem --- Trust in External Knowledge

Part 2's knowledge atoms are all generated locally, by your ANTON, from your sessions, by AI models you chose to call. They carry an implicit trust that derives from provenance: you created the session, you reviewed the output, you rated the atoms. When an atom appears in your retrieval results, you can trace it back to a specific session, a specific module, a specific question you asked. This traceability creates epistemic confidence.

When atoms arrive from another ANTON instance, new questions arise.

How reliable is the source? You know your own professional standards. You don't necessarily know your peer's. Their ANTON might have extracted an atom with confidence 0.92, but was their underlying analysis rigorous? Was their session well-structured? Was their feedback thoughtful?

How relevant is the atom to your context? An atom about Finnish AMLR implementation might be highly relevant to a cross-border gap analysis but irrelevant to a purely Swedish domestic assessment. The atom's content might be excellent in its original context but misleading in yours.

Should it influence your retrieval ranking? If an external atom ranks higher than a local atom in a semantic search, should it displace the local atom from your prompt context? The external atom might be more semantically similar to your question, but your local atom carries the context of your specific professional experience.

Can you distinguish your own knowledge from someone else's? When an output cites an injected atom, you need to know whether it came from your own work or from a peer's work. The distinction matters for professional accountability: if a gap analysis references a finding that originated in someone else's ANTON, the responsible professional needs to know that.

**This Is Not a Technical Problem**

Technically, an atom is an atom. Same schema, same embedding dimensions, same metadata structure. A knowledge atom from your ANTON instance and a knowledge atom from your peer's ANTON instance are structurally identical. They can be stored in the same table, searched with the same algorithm, and ranked with the same boosts.

But epistemically, they are different. Your atom from your session carries the weight of your professional judgement, your quality standards, your domain expertise. Your peer's atom carries the weight of their professional judgement, which you may or may not trust to the same degree.

This is not a technical problem --- it is a trust problem. And the solution must be architectural, not procedural. Telling professionals to "be careful about external knowledge" is insufficient. The system must encode trust structurally, apply it automatically, and make it visible.

**The Professional Analogy**

Consider how trust works in professional practice:

A colleague you've worked with for five years tells you that AMLR Article 15 requires a specific analytical methodology. You trust their interpretation because you've seen their work, you've validated their reasoning in the past, and you know their professional standards. You treat their input as highly reliable and integrate it into your analysis with minimal additional verification.

A new hire you met last week tells you the same thing. You don't distrust them --- you simply have less basis for trust. You might ask for their source, verify independently, or qualify the finding in your output. Their input is useful but requires more scrutiny.

A stranger on a professional forum posts the same claim. You have no basis for trust. The claim might be correct, but you would verify it before relying on it professionally.

ANTON applies the same graduated intuition, systematically. Local atoms receive maximum trust (you created them). Atoms from close collaborators receive high trust (Level 4 connections). Atoms from trusted peers receive moderate trust (Level 3 connections). Atoms from curated shares receive lower trust (Level 2 connections). This trust gradient is not a policy --- it is encoded in the retrieval ranking system through the provenance trust factor described in Section 21.

The system does not pretend that all knowledge is equally reliable. It acknowledges that provenance matters, encodes it structurally, and surfaces it transparently.

---

## 20. Knowledge Atom Provenance

Every atom that crosses an instance boundary carries provenance metadata. This metadata enables filtering, weighting, auditing, and revocation --- the four operations that transform raw knowledge sharing into trustworthy knowledge sharing.

The provenance fields are added to the existing atom schema:

```sql
ALTER TABLE knowledge_atoms
  ADD COLUMN IF NOT EXISTS source_instance_id TEXT,
  ADD COLUMN IF NOT EXISTS source_peer_hash TEXT,
  ADD COLUMN IF NOT EXISTS trust_level TEXT DEFAULT 'local'
    CHECK (trust_level IN ('local', 'trusted_peer', 'known_peer', 'external'));
```

**What Each Field Records**

`source_instance_id`: the ANTON instance that originally created this atom. For local atoms, this is your own instance ID. For received atoms, this identifies the originating instance. Combined with `source_peer_hash`, this creates a complete provenance chain: which ANTON, operated by which person, produced this knowledge.

`source_peer_hash`: the contact hash of the person whose ANTON created this atom. For local atoms, this is null or your own hash. For received atoms, this is the peer's contact hash --- the cryptographic identifier that ties the atom to a specific professional identity.

`trust_level`: the trust classification at the time the atom was accepted. Four levels:

- `local`: created by your own ANTON instance. Full trust.
- `trusted_peer`: received from a Level 4 (full collaboration) connection. High trust --- this is someone you work closely with, whose professional judgement you have validated through ongoing collaboration.
- `known_peer`: received from a Level 3 (filtered sync) connection. Moderate trust --- this is a peer with whom you have established an ongoing knowledge sharing relationship with defined scope.
- `external`: received from a Level 2 (curated sharing) connection or from a marketplace bundle. Lower trust --- this is knowledge that was shared deliberately but from a relationship with less established mutual trust.

**Provenance Enables Four Operations**

**Filtering.** "Show me only atoms from my own sessions." The `trust_level = 'local'` filter returns only locally created atoms, excluding all external knowledge. This is the privacy-preserving default: when you want to ensure that your output references only your own professional work, the filter is one clause.

**Weighting.** "Weight atoms from trusted peers higher than atoms from new connections." The provenance trust factor (Section 21) applies automatic weighting based on trust level. This means that in a retrieval where both local and external atoms are candidates, local atoms have a structural advantage. External atoms can still surface --- if they are highly relevant, high-confidence, and positively rated --- but they must overcome a provenance penalty to do so.

**Auditing.** "Which external atoms influenced this gap analysis output?" When a module session produces output, the injected atoms panel shows each atom's provenance: local origin (your ANTON), peer origin (which peer, which trust level), or marketplace origin (which bundle, which author). The professional reviewing the output knows exactly which knowledge came from where.

**Revocation.** "Remove all atoms from this connection." When a connection is revoked (Section 8), all atoms from that connection are flagged with a "revoked" status. The user can choose to purge them (delete permanently) or retain them with reduced trust (the provenance trust factor drops to its minimum for revoked connections).

---

## 21. The Boost Boundary --- Local vs Remote Atoms

Part 2, Sections 5--6 described the six-boost ranking system that transforms raw search results into professionally contextualised retrieval. The six boosts --- confidence, recency, area relevance, module relevance, superseded penalty, and feedback history --- work together to ensure that the most useful atoms rank highest.

Section 20 introduced provenance metadata. Section 21 describes how provenance integrates into the ranking system as a seventh boost factor.

**The Provenance Trust Factor**

The implementation in `server/services/atom-boost.ts` adds the provenance boost alongside the existing six:

```typescript
// Provenance boost: local atoms preferred over external
const trustLevel = (meta.trust_level as string) || 'local';
if (trustLevel === 'trusted_peer') boost *= 0.8;
else if (trustLevel === 'known_peer') boost *= 0.6;
else if (trustLevel === 'external') boost *= 0.4;
// 'local' -> 1.0 (no change)
```

The multipliers are:

| Trust Level | Source | Multiplier | Rationale |
|-------------|--------|------------|-----------|
| `local` | Your own ANTON | 1.0x | Full trust --- your own professional work |
| `trusted_peer` | Level 4 connection | 0.8x | Close collaborator, shared workspace |
| `known_peer` | Level 3 connection | 0.6x | Trusted peer with filtered sync |
| `external` | Level 2 connection or marketplace | 0.4x | Curated share from less-established relationship |
| Revoked | Former connection | Excluded | Atoms from revoked connections are excluded from retrieval by default |

**How Provenance Interacts with Existing Boosts**

The provenance factor multiplies with the existing six boosts. Consider two atoms competing for retrieval in a gap analysis:

Atom A (local): Content about AMLR Article 15 risk methodology. Confidence 0.85. Created 20 days ago. Same area (FCP). Same module (gap-analysis). Two positive ratings. Not superseded.

Score calculation:
- RRF base: 0.0310
- Confidence boost: 0.5 + (0.85 x 0.5) = 0.925x
- Recency boost: max(0.7, 1 - (20/365) x 0.3) = 0.984x
- Area relevance: 1.3x
- Module relevance: 1.2x
- Superseded: 1.0x
- Feedback: 1.15x (only positive)
- Provenance: 1.0x (local)
- **Final: 0.0310 x 0.925 x 0.984 x 1.3 x 1.2 x 1.0 x 1.15 x 1.0 = 0.0505**

Atom B (from trusted peer): Content about AMLR Article 15 with Finnish jurisdiction specifics. Confidence 0.92. Created 5 days ago. Same area. Same module. Three positive ratings. Not superseded.

Score calculation:
- RRF base: 0.0325 (higher semantic relevance to the query)
- Confidence boost: 0.5 + (0.92 x 0.5) = 0.96x
- Recency boost: max(0.7, 1 - (5/365) x 0.3) = 0.996x
- Area relevance: 1.3x
- Module relevance: 1.2x
- Superseded: 1.0x
- Feedback: 1.15x (only positive)
- Provenance: 0.8x (trusted peer)
- **Final: 0.0325 x 0.96 x 0.996 x 1.3 x 1.2 x 1.0 x 1.15 x 0.8 = 0.0459**

Atom A ranks higher (0.0505 vs 0.0459) despite Atom B having higher confidence, more recent creation, a higher RRF base score, and more positive feedback. The provenance factor makes the difference: the 0.8x multiplier for trusted-peer atoms creates a meaningful but not insurmountable barrier.

If Atom B had been from a local source, it would score 0.0574 --- higher than Atom A. The provenance factor does not prevent external atoms from surfacing. It creates a gradient that requires external atoms to be substantially more relevant, more recent, or better-rated to outrank local atoms of comparable quality.

**The Key Principle**

External atoms NEVER outrank local atoms at the same quality level. Your own professional judgement always takes precedence. External knowledge ENRICHES but does not OVERRIDE. This is not a limitation --- it is a design philosophy. When a compliance officer reviews an output, they need confidence that the AI prioritised their own institutional knowledge over knowledge from external sources. The provenance trust factor provides that confidence structurally, not through a disclaimer.

**User Overrides**

The provenance multipliers are defaults. Users can adjust them. An organisation that places high trust in a specific peer (perhaps a partner firm with decades of collaboration) can increase the trusted_peer multiplier to 0.95. An organisation that is cautious about external knowledge can decrease the external multiplier to 0.2. The system provides sensible defaults and full configurability.

---

## 22. Entity Graph Federation

Part 2, Section 9 described the knowledge graph: how ANTON tracks entities (clients, regulations, controls, people, systems) across sessions, building a map of who and what the professional works with. When two ANTON instances connect, their entity graphs overlap. The question is: should the graphs merge?

**The Problem**

Your ANTON tracks entity "Nordea" --- 47 mentions across 12 sessions, including gap analysis findings, risk assessment observations, compliance monitoring alerts, and engagement-specific decisions. Your entity graph records that Nordea has relationships with specific regulatory articles, specific control frameworks, and specific risk categories.

Your peer's ANTON tracks the same entity "Nordea" --- 83 mentions across 20 sessions, including supervisory assessment findings, industry benchmarking data, and cross-client comparison observations. Their entity graph records a different set of relationships, reflecting their different professional perspective and client base.

Should these two Nordea nodes merge into a single entity with 130 mentions? Should the relationships combine? Should one graph's observations be treated as facts in the other?

**The Answer: Federated, Not Merged**

Each ANTON maintains its own entity graph. When connected at Level 3 or Level 4, the peer's entity data is AVAILABLE but SEPARATE. The entity "Nordea" in your graph shows your 47 mentions. In the federated view, it additionally shows "83 mentions from [peer name], last updated [date]" --- but these are displayed as external references, not as local knowledge.

Entity relationships from external graphs are shown as "reported by [peer name]," not as facts. If your peer's graph contains the relationship "Nordea -> competes_with -> SEB" based on their industry analysis, your federated view shows this relationship with external provenance. It does not automatically appear in your graph as a verified relationship.

This federation approach avoids three problems:

**Graph pollution.** If a peer's entity graph contains incorrect data (perhaps a misidentified entity or an outdated relationship), merging would contaminate your graph. Federation keeps the incorrect data contained: it is visible as an external observation, but it does not corrupt your local graph.

**Trust confusion.** In a merged graph, you cannot distinguish "I found this relationship" from "my peer reported this relationship." In a federated graph, provenance is always visible. This matters for professional accountability: if your gap analysis output references an entity relationship, you need to know whether it came from your own analysis or from a peer's work.

**Privacy leaks.** Entity connections might reveal client work. If your entity graph shows that you have 47 mentions of "Nordea," that reveals that Nordea is (or was) a client. In a merged graph, this information flows to all connected peers. In a federated graph, entity data is shared only according to the trust level rules (Section 8): Level 4 connections see entity graphs; Level 2 connections do not.

**Practical Example**

A compliance consultant in Stockholm (ANTON-A) is connected at Level 4 with a colleague in Helsinki (ANTON-B). ANTON-A runs a gap analysis that involves entity "Nordea."

The retrieval system searches ANTON-A's local knowledge base and finds 12 atoms mentioning Nordea. It also searches ANTON-B's shared atoms (Level 4 enables this) and finds 8 atoms mentioning Nordea from ANTON-B's sessions.

The 12 local atoms rank normally. The 8 external atoms rank with the provenance trust factor (0.8x for trusted peer). In the injected atoms panel, external atoms are clearly tagged with their provenance: "[From Helsinki colleague] Nordea's Finnish subsidiary has implemented a separate CDD process for PEP identification."

The entity view for "Nordea" shows:
- Local: 47 mentions, 12 sessions, relationships to AMLR Articles 8, 15, and 22
- External (Helsinki colleague): 83 mentions, 20 sessions, relationships to Finnish AML Act, Finnish FSA guidelines

The consultant sees both perspectives without either overwriting the other. The federated view enriches without merging.

---

## 23. Pattern Sharing and Cross-Instance Detection

Part 2, Section 10 described five pattern detectors running on local data: Convergence Detection, Gap Detection, Quality Drift, Entity Cluster, and Temporal Patterns. These detectors identify patterns within a single ANTON instance's knowledge base. Cross-instance pattern detection extends these detectors to work across connected instances.

**The Network Pattern**

Consider Gap Detection: within your instance, it identifies areas where no sessions have been run, no atoms exist, and no knowledge has been accumulated. "No sessions about crypto asset risk in the last 6 months" is a local gap.

Now extend this to connected instances. If three of your five Level 3 connections also have no atoms about crypto asset risk, that is a network gap. It suggests a systemic blind spot in your professional community --- perhaps an emerging regulatory area that everyone is underinvesting in.

Convergence Detection works similarly. Within your instance, it identifies topics with accelerating session frequency: "AMLR gap analysis sessions have doubled in the last quarter." Across connected instances, if four of five connections show the same acceleration, that is a network convergence --- a signal that the entire professional community is responding to the same regulatory pressure.

**Cross-Instance Pattern Types**

**Entity Convergence.** "Regulation X is mentioned by 4 of 5 connected ANTONs in the last 30 days --- is this emerging as a community priority?" This detects when multiple independent professionals are working on the same topic, suggesting regulatory significance.

**Temporal Correlation.** "Every ANTON in the network updated its BWRA module within 48 hours of the same regulatory publication." This detects when a regulatory event triggers synchronised activity across the network, confirming the event's practical significance.

**Trend Divergence.** "Your sanctions screening session frequency is 3x your peer average." This detects when your activity pattern diverges from the network norm, which might indicate either a valuable specialisation or a potential blind spot.

**Quality Convergence.** "The average feedback rating for gap analysis atoms is 0.72 across the network, but 0.85 in your instance." This provides benchmarking --- your quality standards relative to your peers.

**The Privacy Constraint**

Cross-instance pattern detection uses AGGREGATED, ANONYMISED metadata --- not raw atoms. The detection messages that flow between connected instances contain:

- Area-level session counts (not session content)
- Entity mention frequencies (not entity relationships)
- Module usage statistics (not module outputs)
- Quality metric averages (not individual ratings)

What flows: "3 of 5 peers have high activity in Area X this month."

What never flows: "Peer Alice's client Nordea had a sanctions screening hit."

This constraint is enforced at the serialisation layer. The pattern sharing protocol defines a fixed set of aggregate metrics that can be exchanged. Raw atoms, raw entity data, and raw session content are excluded from the pattern sharing schema regardless of trust level. Even Level 4 connections share pattern metadata in aggregate, not in raw form.

**The Aggregate Metrics Protocol**

The pattern sharing exchange uses a defined message format. Each connected ANTON periodically (default: weekly) generates an aggregate metrics snapshot that it shares with Level 3 and Level 4 connections:

```
{
  "period": "2026-W14",
  "area_activity": {
    "fcp": { "sessions": 12, "atoms_created": 45, "avg_confidence": 0.78 },
    "legal": { "sessions": 4, "atoms_created": 18, "avg_confidence": 0.82 }
  },
  "top_entity_mentions": [
    { "entity_type": "regulation", "count": 23 },
    { "entity_type": "company", "count": 15 }
  ],
  "module_usage": {
    "gap-analysis": 8,
    "risk-assessment": 6,
    "regulatory-monitor": 3
  },
  "quality_metrics": {
    "avg_feedback_rating": 0.74,
    "atom_acceptance_rate": 0.88
  }
}
```

Note what is present and what is absent. Area-level session counts are present; session titles and content are absent. Entity type mention counts are present; entity names are absent. Module usage frequencies are present; module outputs are absent. The protocol reveals activity patterns without revealing the substance of the activity.

This aggregate snapshot is sufficient for the five cross-instance pattern detectors:

- Entity Convergence compares entity type distributions across peers. If four of five peers show elevated "regulation" entity mentions, convergence is detected --- without knowing which specific regulations anyone is working on.
- Temporal Correlation compares area-level session timing across peers. If all peers show a spike in FCP sessions in the same week, temporal correlation is detected.
- Trend Divergence compares your module usage distribution against the network average.
- Quality Convergence compares your feedback ratings against the network average.
- Gap Detection compares your area coverage against the network's area coverage, identifying areas where you have zero activity but peers are active.

The aggregate metrics are sufficient for pattern detection without revealing sensitive professional details. You don't need to know which bank your peer is assessing to know that peer activity in AML gap analysis is increasing across the network. The pattern is visible; the underlying data is not.

**The Most Powerful Network Effect**

Cross-instance pattern detection is, we believe, the most powerful capability in the network APCI architecture. Individual pattern detection (Part 2) finds patterns within one professional's experience. Network pattern detection finds patterns across an entire professional community's experience.

When five compliance consultants independently discover the same regulatory gap across five different banking clients, that convergence is enormously valuable. It transforms a series of individual findings into a market insight. It suggests a systemic industry weakness. It identifies a consulting opportunity. It informs regulatory strategy.

But without network pattern detection, no one sees the convergence. Each consultant knows their own finding. None knows that it is shared by four peers. The knowledge exists but the pattern is invisible.

This is the network effect that Part 3 is building toward. Not viral growth. Not engagement metrics. Not social graph monetisation. The professional network effect: the insight that emerges when independent professionals' knowledge bases are connected with trust, privacy, and consent.

---

---

# Part 5: The Marketplace --- Knowledge as a Network Good

## 24. From File Format to Ecosystem

Part 2, Section 27 described the .anton bundle format: ZIP archives containing JSON configuration and Markdown content, no executable code, with structured manifests that describe what each bundle contains and how it should be integrated. Part 2 documented 17 bundle types. By v0.7.5, the count has grown to 29, covering modules, skills, personas, output format templates, knowledge packs, regulatory frameworks, entity packs, quality baselines, dashboard layouts, and more.

The bundle format is the primitive. The marketplace is the ecosystem that the primitive enables.

**The Evolution**

The .anton bundle has progressed through three stages, with a fourth designed:

**Stage 1: File Format (Part 1).** Export and import work. A professional creates a module configuration, exports it as a .anton file, and shares it via email or file transfer. The recipient imports it and gets the same configuration. This is useful but limited: discovery is manual, quality is unassessed, and distribution is one-to-one.

**Stage 2: P2P Sharing (Part 3, AAP).** Bundles flow through the ANTON Agent Protocol. Level 1 connections (Section 8) enable bundle sharing between connected peers. A consultant can send a gap analysis template to a colleague with one click. The bundle travels through the secure communication channel (Section 6) and arrives in the peer's import queue. This is better than email but still limited to known connections.

**Stage 3: Discovery and Curation (Part 3, Marketplace).** A searchable catalogue enables professionals to find bundles they didn't know existed. Ratings and reviews provide quality signals. Community curation identifies "essential" bundles for each professional area. This is where the ecosystem begins to exhibit network effects: more content attracts more users, more users produce more content, and the catalogue becomes more valuable with each contribution.

**Stage 4: Economy (Part 4).** Paid bundles, creator monetisation, institutional certification, and FutureChain payment integration. This stage is the subject of Part 4 and is described here only in outline.

Part 3 covers Stages 2--3. The marketplace infrastructure is built at the database and API layer. The user interface and the payment integration are Part 4 territory.

**The Marketplace Schema**

Bundle listings are stored in a searchable catalogue:

```sql
CREATE TABLE IF NOT EXISTS marketplace_bundle_listings (
  id TEXT PRIMARY KEY,
  bundle_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  author_hash TEXT NOT NULL,
  author_name TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0.0',
  tags JSONB DEFAULT '[]',
  target_areas JSONB DEFAULT '[]',
  bundle_hash TEXT NOT NULL,
  bundle_size_bytes INTEGER,
  is_published INTEGER DEFAULT 1,
  avg_rating DOUBLE PRECISION DEFAULT 0.0,
  rating_count INTEGER DEFAULT 0,
  download_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

The `bundle_hash` provides integrity verification: a SHA-256 hash of the bundle contents ensures that the downloaded bundle matches the published listing. `target_areas` enables filtering: a bundle tagged for the "fcp" area appears in searches by compliance professionals. `author_hash` links the listing to the ANTON identity system (Section 4) --- the author is identified by their cryptographic contact hash, not by a username.

**Full-Text Search**

Discovery uses PostgreSQL's built-in full-text search:

```sql
CREATE INDEX IF NOT EXISTS idx_marketplace_search
  ON marketplace_bundle_listings
  USING gin(to_tsvector('english', title || ' ' || description));
```

The GIN index on the tsvector of title and description enables fast, linguistically-aware full-text search. A search for "sanctions screening" matches bundles with "sanction," "screened," and "sanctioning" in their descriptions. Ranking is by tsvector relevance, with secondary sorting by average rating and download count.

**The 29 Bundle Types**

By v0.7.5, the .anton format supports 29 registered bundle types:

1. Module configurations
2. Skill definitions
3. Persona definitions
4. Output format templates
5. Knowledge packs (regulatory knowledge)
6. Regulatory framework definitions
7. Entity packs (pre-built entity graphs)
8. Quality baselines
9. Dashboard layouts
10. Gap analysis templates
11. Engagement templates
12. Training curricula
13. Assessment rubrics
14. Prompt libraries
15. Contact bundles (identity exchange)
16. Group invitations
17. Index templates (Markets)
18. Watchlist configurations
19. Investigation templates
20. Computation template packs (Python)
21. Report templates
22. Workflow definitions
23. Data source configurations
24. Translation packs (locale bundles)
25. Theme configurations
26. Integration configurations
27. Knowledge relationship schemas
28. Pathway definitions (educational)
29. School configuration bundles

Each bundle type has a defined manifest schema, a validation function, and import logic. The import system verifies the manifest, validates the contents against the expected schema, and integrates the bundle into the appropriate database tables. No executable code is ever imported or executed from a bundle.

---

## 25. Discovery, Ratings, and Community Curation

A catalogue is only useful if professionals can find what they need. The marketplace provides four discovery mechanisms and a community quality layer.

**Search**

Full-text search across titles and descriptions, filtered by:
- Area (FCP, Legal, Audit, Consulting, Education, Markets, etc.)
- Bundle type (module, persona, knowledge pack, etc.)
- Keywords and tags
- Author
- Minimum rating (e.g., "only show bundles with 4+ stars")

Search results are ranked by tsvector relevance, with secondary sorting by average rating and download count. A bundle with a 4.8 average rating and 500 downloads ranks higher than a bundle with a 4.8 rating and 5 downloads --- popularity is a quality signal, though not the only one.

**Ratings and Reviews**

```sql
CREATE TABLE IF NOT EXISTS marketplace_reviews (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL
    REFERENCES marketplace_bundle_listings(id) ON DELETE CASCADE,
  reviewer_hash TEXT NOT NULL,
  reviewer_name TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  review_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(listing_id, reviewer_hash)
);
```

One review per reviewer per bundle (enforced by the UNIQUE constraint). Ratings are 1--5 stars with optional written reviews. The average rating on the listing is recalculated on each new review:

```
avg_rating = SUM(rating) / COUNT(rating)
rating_count = COUNT(rating)
```

The rating system is deliberately simple. More complex rating systems (helpfulness votes, weighted ratings, bayesian averages) are reserved for Part 4 when the marketplace has sufficient volume to make them statistically meaningful.

**Community Curation**

Beyond individual ratings, the marketplace supports community-flagged "essentials" for each professional area. When a bundle consistently receives high ratings from professionals in a specific area (for example, a BWRA template rated 4.5+ by 20+ compliance professionals), the community can nominate it as an "essential" bundle for that area.

Essentials serve as onboarding guidance: a new ANTON user in the FCP area can browse the essentials list and immediately access the community's consensus best templates, knowledge packs, and personas. This reduces the cold-start problem --- instead of building everything from scratch, new users start with community-validated configurations.

**Quality Signals**

Four quality signals are visible on each listing:

1. **Average rating** (1--5 stars). The most direct quality measure.
2. **Rating count.** More reviews means more confidence in the average. A 5.0 with one review is less informative than a 4.3 with fifty reviews.
3. **Download count.** Active usage is a signal of practical utility, though not of quality per se.
4. **Author reputation.** The author's contact hash links to their other published bundles and their aggregate rating across all bundles. A professional who has published twelve bundles with an average rating of 4.6 has demonstrated consistent quality.

These signals are displayed on listing cards, in search results, and on bundle detail pages. They enable professionals to make informed decisions about which bundles to invest time in.

---

## 26. The .anton Economy

The marketplace creates a knowledge economy. This section describes the economic structure; Part 4 will describe the payment infrastructure.

**Three Tiers of Content**

**Free Bundles.** Licensed under MIT (consistent with ANTON's own licence). Community contributions from professionals who want to share their expertise. Examples: a gap analysis template for a common regulatory framework, a set of custom personas for educational use, a translation pack for an underserved language. Free bundles are the foundation of the marketplace ecosystem --- they attract users, demonstrate value, and establish norms.

**Premium Bundles.** Creator-monetised professional expertise. A senior compliance consultant with fifteen years of experience creates a comprehensive AMLR gap analysis module with custom personas calibrated through hundreds of real engagements and a knowledge pack containing regulatory interpretations refined over years of supervisory interaction. This bundle represents genuine intellectual property --- professional knowledge encoded in a structured format. The creator sets a price. Buyers pay through the FutureChain payment system (Part 4). The creator receives the payment, minus a platform commission that funds marketplace operations.

Premium bundles address a fundamental inefficiency in professional knowledge markets. Currently, this expertise is locked inside individual consultants' heads (not scalable), published in expensive reports (typically one-time use), or sold as bespoke consulting engagements (high cost, limited reach). The .anton format makes this expertise portable, repeatable, and priced at a fraction of the engagement cost.

**Institutional Bundles.** Certified by FutureChain for regulated industries. An institutional bundle carries a quality certification that indicates independent review, regulatory accuracy verification, and ongoing maintenance commitment. Examples: a DORA compliance framework bundle reviewed by a team of DORA specialists, an AMLR knowledge pack updated quarterly to reflect regulatory developments, a MiFID II gap analysis module certified for use in supervisory assessments.

Institutional bundles serve organisations that need assurance beyond community ratings. A bank's compliance department might use community-rated free bundles for training purposes but require institutional bundles for supervisory-facing work where quality and accuracy carry regulatory consequences.

**The Network Effect**

The marketplace exhibits classic network effects: more content attracts more users, more users provide more ratings and reviews, better ratings improve discovery, better discovery attracts more creators, more creators produce more content. The flywheel is familiar from every successful marketplace platform.

But the .anton marketplace has a structural advantage over generic content marketplaces: the content is functional, not decorative. A gap analysis module doesn't just look good --- it runs. A knowledge pack doesn't just read well --- it enriches the retrieval system. The value of marketplace content is immediately testable through practical use, which makes ratings more meaningful (professionals rate based on professional utility, not aesthetics) and the quality convergence faster.

The long-term vision is a marketplace where professional domains have depth: not one or two gap analysis templates, but dozens, each specialised for different jurisdictions, different client types, different regulatory frameworks, and different team sizes. A Swedish AMLR specialist finds a template calibrated for Swedish banking. A Finnish AML specialist finds a template calibrated for Finnish regulations. A pan-Nordic firm finds a template that handles cross-border nuances. This specialisation is only possible at marketplace scale, where the long tail of professional needs finds a matching supply of professional expertise.

**The Creator Economics**

Premium bundles create a new professional income stream. Consider a senior compliance consultant with fifteen years of experience. Over three years, they have built a comprehensive AMLR gap analysis module in ANTON: custom personas calibrated for Nordic banking, quality baselines refined through two hundred real engagements, a knowledge pack containing regulatory interpretations vetted through supervisory interaction, and output format templates designed for specific regulatory audiences.

This expertise is currently monetised through consulting engagements --- billable hours at 200--400 per hour. The .anton marketplace allows the same expertise to be monetised differently: a bundle priced at 50--200 that can be purchased by hundreds of professionals. The marginal cost of distribution is zero (it's a file download). The value to each buyer is substantial (months of professional refinement, available instantly). The economics favour both creator and buyer: the creator earns revenue at scale, the buyer gets professional expertise at a fraction of the engagement cost.

This model extends beyond individual consultants. A consulting firm can publish its methodology as a premium bundle. A regulatory body can distribute compliance templates as institutional bundles. A professional association can curate and certify bundles for its members. A university can publish educational modules for its curriculum.

The .anton format makes this possible because the bundles are functional --- they don't just describe expertise, they encode it in a format that the AI can use immediately. A knowledge pack doesn't require the buyer to read and absorb hundreds of pages of regulatory guidance. It is automatically injected into the retrieval system, influencing the AI's output from the first session. The value is immediate and measurable.

**Comparison to Existing Knowledge Markets**

Current professional knowledge markets are inefficient. Management consulting firms sell expertise through engagements (high cost, limited scalability). Legal research platforms sell access to databases (broad but unstructured). Training providers sell courses (time-intensive, often disconnected from practice). Publisher sell books and reports (informative but passive).

The .anton marketplace is different because the "product" is operational. A gap analysis module doesn't teach you how to do a gap analysis --- it makes your AI better at gap analysis. A knowledge pack doesn't inform you about regulations --- it ensures your AI is informed about regulations. The value transfer is direct: from professional expertise to AI capability to better professional output.

This operational nature also makes quality assessment more reliable. When a buyer uses a premium knowledge pack and their gap analysis output improves measurably (better feedback ratings, fewer corrections, higher professional quality), the bundle's value is empirically demonstrated. Unlike a book review or a course rating, a bundle rating reflects the bundle's actual impact on professional work.

---

## 27. Quality Standards for Community Content

Professional expertise has a quality requirement that generic content does not. A poorly written blog post wastes a reader's time. A poorly constructed gap analysis module wastes a professional's time AND potentially produces incorrect regulatory conclusions. The marketplace enforces quality standards to prevent the second scenario.

**The Expertise Requirement**

Every marketplace listing must be published by an ANTON user with a verified identity (Ed25519-backed contact hash). Anonymous publishing is not supported. This does not mean real names are required --- the contact hash is pseudonymous --- but it means that every published bundle is linked to a persistent cryptographic identity. An author who publishes a bundle with misleading descriptions or incorrect regulatory content accumulates negative reviews against their identity. Reputation is persistent, not disposable.

**Quality Metadata**

Every .anton bundle carries quality metadata in its manifest:

- `version`: semantic versioning (major.minor.patch). Bundles that require updates for regulatory changes increment appropriately.
- `target_areas`: which professional areas this bundle is designed for. A bundle targeted at FCP is rated by FCP professionals, not by educators.
- `tags`: free-form tags for discoverability and context.
- `compatible_versions`: which versions of ANTON the bundle is compatible with. Bundles that use features from v0.7.0 won't work on v0.6.5.

**The Review Process**

Marketplace-listed bundles undergo three levels of quality assessment:

1. **Automated validation.** The import system validates the bundle against its declared type's schema. A module bundle must contain the required manifest fields, valid JSON configuration, and no executable code. This catches structural problems --- missing fields, invalid schemas, and format errors.

2. **Community review.** After publication, the bundle is available for community use and rating. The first five reviewers provide the initial quality signal. Bundles with consistently low ratings (below 2.0 average after 10 reviews) are flagged for review.

3. **Moderation review.** Flagged bundles are reviewed by a moderation team. Content that is misleading (claims to be for a jurisdiction it doesn't cover), harmful (provides incorrect regulatory guidance), or plagiarised (copies another creator's work without attribution) is removed from the marketplace. The author's identity is flagged, and repeat violations result in publishing restrictions.

**Reporting and Takedown**

Any user can report a marketplace listing. Reports follow the same moderation workflow as community content flags (Section 10): five standard reasons (spam, misleading, harmful, plagiarised, other), four resolution states (pending, reviewed, actioned, dismissed), and a full audit trail.

The takedown process is deliberate, not automatic. Reports are reviewed by humans. Context matters: a bundle that is genuinely incorrect is different from a bundle that is accurate but poorly structured. The goal is to maintain quality without creating a chilling effect on professional knowledge sharing.

---

---

# Closing

## 28. The Network Effect

Part 2 ended with a claim about the compound effect. The claim was that APCI --- knowledge atoms accumulating, feedback loops improving retrieval, entity graphs mapping professional domains, pattern detection surfacing insights, quality trajectories tracking improvement --- creates value that compounds over time. After one month, moderate benefit. After six months, substantial benefit. After two years, a genuine strategic asset.

That claim was one-dimensional. It described compounding along a single axis: depth. More atoms. Better feedback. Richer patterns. Deeper knowledge. All within a single instance, serving a single professional or team.

Part 3 adds the second dimension: width. Multiple instances connected through the ANTON Agent Protocol. Knowledge flowing across instance boundaries with provenance, trust, and consent. Entities federated without merging. Patterns detected across communities without exposing individual data. A marketplace where professional expertise is discoverable, rated, and distributable.

The compound effect is now two-dimensional: deeper AND wider. Every session adds depth to your local APCI. Every connection adds width to your network APCI. The two dimensions multiply, not add: a consultant with a deep knowledge base AND wide connections to trusted peers produces better work than a consultant with either quality alone.

Markets Intelligence makes both dimensions visible and measurable. The prediction tracking system (Section 14) demonstrates depth: does the intelligence engine get better at predictions over time? The consul calibration system (Section 13) demonstrates learning: do the analytical perspectives improve with experience? The ANTON Indexes (Section 15) demonstrate compound value: does structured intelligence translate into measurable performance? The answers to these questions are public, continuous, and unforgeable.

**Full Circle**

Part 2 opened with a law firm associate whose AI forgot everything between Monday and Wednesday. Part 2 solved her problem: her ANTON remembers. Two years of AMLR context, three years of client engagement history, a calibrated retrieval system that surfaces the right knowledge at the right time.

Part 3 extends the story. Her ANTON is now connected to her Helsinki colleague's ANTON through the ANTON Agent Protocol. The connection is Level 3 --- filtered knowledge sync for the FCP area, module type gap-analysis, confidence above 0.7, created within the last 180 days. Her Helsinki colleague's Finnish AMLR expertise flows to her automatically, tagged with provenance, ranked with the trust factor, visible in the injected atoms panel.

When she runs a gap analysis on Wednesday for a client with a Finnish subsidiary, she has her own two years of Swedish AMLR context AND her peer's Finnish jurisdiction expertise --- without either of them uploading anything to a cloud service, without either of them losing control of their data, without any administrator deciding what should be shared. The knowledge flows because they consented to it. The provenance is clear. The trust level is explicit. The revocation model is available if the relationship changes.

Her ANTON's Orchestrator has earned Phase 3 autonomy for routine gap analysis modules, so it proposes the session configuration, selects the relevant knowledge atoms (local and peer-sourced), and suggests the output format --- all subject to her review. The atom that surfaces most frequently in her Finnish subsidiary analyses is one from her Helsinki colleague: a finding about Finnish FSA expectations for CDD documentation that differs subtly from Swedish requirements. That atom has a provenance tag: "From Helsinki colleague, trust level: known_peer, created 2025-11-14, module: gap-analysis, confidence: 0.89, feedback: 2 positive." She knows where it came from. She can evaluate its relevance. She can rate it after seeing how it performs in her output.

That is the network effect we are building. Not surveillance-capitalised. Not cloud-dependent. Not vendor-locked. Sovereign, encrypted, consented, and compounding.

**What Comes Next**

Part 3 describes Layers 3 and 4 of the six-layer vision. The network infrastructure is built. The knowledge sharing protocol is designed. The markets intelligence engine is operational. The marketplace foundations are laid.

Part 4 will complete the picture. Layer 5 --- the full marketplace economics, with FutureChain payment integration, creator monetisation models, institutional certification programmes, and the pricing dynamics of professional knowledge. Layer 6 --- the ANTON economy, where the network creates economic value that feeds back to the professionals who contribute to it.

"The prompt is the product" was Part 1's thesis. "Context is the competitive advantage" was Part 2's thesis. Part 3's thesis: "The network is worth more than any single node."

Part 4's thesis will be: "The network is the economy."

---

## What Is Built, What Is Designed, What Is Directional

Maintaining the transparency commitment from Part 2, Section 38:

**Built and Running in v0.7.5**

- Community identity layer (Ed25519 keypairs, contact hashes, .anton contact bundles)
- Community connections (add, remove, block, import policy, delegation trust)
- Direct messaging (community_mail, threading, folders, structured message types)
- Group management (create, join, leave, admin roles, member management)
- Group discussion forums (topics, threaded posts, upvotes, pinning, locking)
- Content moderation infrastructure (flags, review, action tracking, member muting)
- Companion App Gateway (org profiles, intent routing, connected users, sessions, analytics)
- Companion App authentication (nonce-based challenge-response)
- Markets intelligence engine (atoms, theses, predictions, entities, signal weights)
- Prediction verifier (daily auto-verification, Brier scoring, grading curve)
- Why-chain root cause analysis (5 Whys with atom creation)
- Consul council persona system (5 consuls, independent assessment, synthesis)
- Per-consul performance tracking (accuracy by context type and time horizon)
- ANTON Indexes (5 default indexes, NAV tracking, holdings, rebalances, leaderboard)
- Confidence calibration analysis (bucket analysis, overconfidence detection)
- 65 Python computation templates for quantitative analysis
- X25519 key columns for E2E encryption preparation
- Atom provenance metadata (source_instance_id, source_peer_hash, trust_level)
- Provenance boost in atom-boost.ts (trust_level multiplier)
- Relay message store (store-and-forward, TTL, collection tracking)
- Bundle marketplace schema (listings, reviews, full-text search, ratings)
- P2P transport columns (endpoint, delivery_method, HTTP status tracking)
- Message queue with retry logic (exponential backoff, max retries)
- 245+ modules across 57 areas
- 32 regulatory knowledge packs
- 23 Counsel's Desk expert roles across 6 practice areas
- 29 .anton bundle types
- 15+ AI models across 6 providers (Anthropic, OpenAI, Azure OpenAI, Google, Mistral, Ollama)

**Designed in Detail, Not Yet Deployed**

- Full P2P transport (HTTP delivery with automatic relay fallback)
- E2E encryption protocol (X25519 DH key agreement + AES-256-GCM)
- Graduated knowledge sharing (Levels 0--4 enforcement in retrieval pipeline)
- Local network discovery (mDNS/Bonjour advertisement and scanning)
- QR code connection exchange (display and scan flow)
- Cross-instance pattern detection (aggregate metadata exchange protocol)
- Entity graph federation (federated view with provenance annotations)
- Marketplace user interface (browse, search, publish, review workflows)
- Community curation (essentials nomination, community voting)
- Forward secrecy with ephemeral keys (per-message DH exchange)

**Directional (Architecture Sketched, Implementation TBD)**

- Marketplace payment integration (FutureChain wallet connection)
- Premium and institutional bundle tiers
- Creator monetisation and commission structure
- Self-hosted relay deployment toolkit
- Cross-instance signal weight sharing for Markets
- Network-wide confidence calibration benchmarking
- Marketplace recommendation engine (collaborative filtering)
- Bundle dependency resolution (bundles that require other bundles)

---

## Metrics Snapshot (v0.7.5, April 2026)

| Metric | Value |
|--------|-------|
| Expert modules | 245+ |
| Professional areas | 57 |
| Regulatory knowledge packs | 32 |
| Counsel's Desk expert roles | 23 across 6 practice areas |
| Python computation templates (Markets) | 65 |
| .anton bundle types | 29 |
| AI models supported | 15+ across 6 providers |
| Community table count | 14 |
| Markets table count | ~30 |
| Marketplace tables | 2 (listings + reviews) |
| Database migrations (PostgreSQL) | 104+ |
| Companion App organisation types | 10 |
| Language support (localisation) | 30 |
| Output format types | 40+ |
| Thinking levels | 5 |

---

## Acknowledgements

ANTON is built with Claude. The codebase, the documentation, the knowledge packs, and --- yes --- parts of this whitepaper are produced in collaboration with Claude Code and Claude Opus 4.6. We are building an AI platform using AI, and we are transparent about it. The professional judgement, the architectural decisions, the strategic direction, and the editorial control are human. The implementation velocity and technical breadth are a partnership.

The Markets intelligence engine owes an intellectual debt to Philip Tetlock's work on superforecasting and calibration, to Renaissance Technologies' demonstration that small persistent edges compound, and to the broader quantitative finance literature on prediction markets and proper scoring rules.

The identity architecture draws on the work of the Signal Protocol designers (Moxie Marlinspike and Trevor Perrin), the Secure Scuttlebutt community (Dominic Tarr), and the age encryption tool (Filippo Valsorda). Ed25519 was designed by Daniel J. Bernstein, Niels Duif, Tanja Lange, Peter Schwabe, and Bo-Yin Yang.

---

ANTON by openEXPERT is open-source software.
Licensed under MIT.
Source code at github.com/altspace-hub/ANTON.

Version 0.7.5 | April 2026
Daniel Bardun
Founder, FutureChain AB
Creator of ANTON by openEXPERT
