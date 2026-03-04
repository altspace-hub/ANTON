# PART 8: EXTERNAL DATA & DISCOVERY — NEW IN v3.0

*The most powerful AI analysis in the world is only as valuable as the data it can access and the questions it knows to ask. ANTON v3.0 introduces two capabilities that dramatically expand both dimensions: an External Data Integration Framework that connects ANTON to live databases, APIs, and MCP services, and Discovery Mode that ensures the right questions are asked before any analysis begins — whether in a physical workshop or a digital guided conversation.*

---

## §30. External Data Integration Framework

ANTON's original knowledge source system provided four modes: Claude's built-in knowledge with web search, online reference links, local file folders, and combined mode. These remain powerful for document-centric analysis. But professional work increasingly requires integration with live data — querying a client database for transaction patterns, pulling real-time risk scores from an API, or connecting to enterprise systems via standardised protocols.

The External Data Integration Framework extends ANTON's reach beyond documents into the world of live, structured data.

### Supported Data Sources

ANTON supports six categories of external data connections:

**PostgreSQL** — The industry-standard relational database for enterprise applications. ANTON can query PostgreSQL databases to pull client data, transaction records, compliance metrics, or any structured data needed for analysis. Connection configuration includes host, port, database name, SSL settings, and credential management.

**MySQL** — Widely deployed in web applications and mid-market systems. Full query support with the same configuration and security model as PostgreSQL.

**MSSQL (Microsoft SQL Server)** — Common in enterprise Windows environments, particularly in financial services. ANTON supports MSSQL via the standard TDS protocol with Windows Authentication and SQL Authentication options.

**MongoDB** — Document-oriented database popular for flexible schema requirements. ANTON can query MongoDB collections using the native query syntax, supporting both simple lookups and aggregation pipelines.

**REST APIs** — Connect to any HTTP API: internal microservices, third-party data providers, regulatory databases, or SaaS platforms. Configuration supports all HTTP methods, custom headers (including authentication tokens), request body templates with variable substitution, and response parsing rules.

**MCP (Model Context Protocol)** — Anthropic's open protocol for connecting AI models to external tools and data sources. ANTON can function as both an MCP client (consuming tools exposed by MCP servers) and an MCP server (exposing ANTON's modules as tools to other AI interfaces like Claude Desktop). This creates powerful bidirectional integration: use ANTON modules directly from Claude.ai, or bring external MCP tools into ANTON workflows.

---

### Connection Management

All external connections are managed through ANTON's connections framework, which provides:

**Secure Credential Storage:** Database credentials and API keys are stored with encryption at rest, never included in prompts or logs, and accessible only to authorised users via RBAC.

**Connection Testing:** Before any connection is used in production, ANTON tests connectivity, validates credentials, and confirms access permissions. Failed connections are flagged with clear error messages.

**Query Sandboxing:** All database queries execute through parameterized statements only — no string concatenation, no injection risk. Read-only access is the default; write access requires explicit configuration and elevated RBAC permissions.

**Audit Logging:** Every external data access is logged to the `connection_audit_log` table with timestamp, user, connection type, query or request details, and result summary. This creates a complete audit trail for compliance purposes.

---

### Integration with Modules and Workflows

External data connections integrate seamlessly with ANTON's existing capabilities:

**In Module Execution:** A module can pull data from an external database as part of its knowledge context. For example, an AMLR Gap Analysis module could query a client's CDD database to understand current data fields, completeness rates, and quality metrics — grounding the analysis in actual data rather than assumptions.

**In Workflows:** The Database Query step type (Step Type 4 in the workflow engine) uses the connections framework to execute parameterized queries at any point in a workflow. A workflow might query a risk scoring API, pull the results into context, and pass them to a subsequent module execution step.

**In the Coding Area:** Script Lite and Script Medium projects can connect to external databases for data processing tasks. A Script Lite output might generate a Python script that queries a PostgreSQL database, performs clustering analysis, and produces a visualisation — all configured through ANTON's guided interface rather than manual coding.

---

### Use Case: Live Data Gap Analysis

**Scenario:** A compliance team needs to assess their AMLR data readiness — not against documentation, but against actual data.

**Traditional approach:** Request data extracts from IT, wait days or weeks, manually analyse CSV files, write findings in a separate document.

**With ANTON External Data Integration:**
1. Configure a read-only connection to the client's CDD database
2. Run the "Data Readiness Assessment" module with the database connection as a knowledge source
3. ANTON queries the database to understand: which data fields exist, what percentage are populated, what data types and formats are used, which fields map to AMLR data point requirements
4. The module produces a data readiness scorecard grounded in actual data — not estimates or documentation that may be outdated

**Result:** Analysis based on reality rather than assumptions, completed in minutes rather than weeks.

---

## §31. Discovery Mode

The best analysis in the world is wasted if it answers the wrong question. In consulting, the most critical phase of any engagement is discovery — understanding what the client actually needs, not just what they say they need. The most experienced consultants know that the first hour of asking the right questions saves hundreds of hours of misdirected work.

Discovery Mode brings this professional discipline into ANTON through two complementary formats: physical paper workshops and digital guided conversations.

### Paper Workshop Framework

**What it is:** A structured workshop format designed for in-person or hybrid sessions where a facilitator guides a group through a discovery process using ANTON-generated materials.

**How it works:** The facilitator selects a Discovery Workshop template (available for various contexts: compliance assessment, project kickoff, strategy planning, technology evaluation, risk assessment). ANTON generates a complete workshop package:

**Pre-Workshop Materials:** Participant briefing document, pre-read materials on the topic, and a questionnaire to gather baseline information before the session.

**Workshop Guide:** A facilitator's guide with timed sections, key questions for each discussion block, prompts for drawing out different perspectives, and decision frameworks for capturing outcomes.

**Working Templates:** Structured templates that participants fill in during the session — maturity assessment scorecards, capability maps, priority matrices, risk registers, or whatever format suits the discovery context.

**Post-Workshop Processing:** After the workshop, the facilitator feeds the completed templates and notes back into ANTON, which synthesises the inputs into a structured discovery document. This document then drives downstream analysis — gap analyses, roadmaps, action plans — ensuring that the analytical work is firmly grounded in stakeholder input.

**Example:** An AMLR readiness workshop might include a maturity self-assessment (participants score their organisation across 12 dimensions), a capability assessment (can the organisation actually deliver what's needed?), a priority mapping exercise (which gaps are most urgent?), and a constraints discussion (budget, timeline, competing priorities). The synthesised output becomes the foundation for ANTON's AMLR Gap Analysis module, ensuring the analysis reflects the organisation's real situation rather than generic assumptions.

---

### Digital Guided Conversation

**What it is:** An AI-led discovery session within ANTON that replaces (or supplements) the physical workshop with a structured multi-turn conversation.

**How it works:** The user selects a Discovery conversation template. ANTON conducts a guided interview, asking questions across multiple dimensions and bringing in appropriate expert perspectives for each. The conversation follows a deliberate structure — starting broad (context, goals, constraints) and narrowing progressively (specific requirements, priorities, trade-offs) — but adapts based on the user's responses.

**Expert perspective injection:** This is where ANTON's multi-domain architecture becomes uniquely valuable. During a compliance assessment discovery, ANTON doesn't just ask compliance questions — it brings in the regulatory perspective ("Which AMLR articles are most relevant to your entity type?"), the technology perspective ("What systems will need to change?"), the data perspective ("Do you have the data points required?"), the project management perspective ("What's your realistic timeline given current capacity?"), and the governance perspective ("Who needs to sign off on the remediation plan?").

**Adaptive questioning:** Unlike a static questionnaire, the guided conversation adapts based on previous answers. If a participant indicates they have no transaction monitoring system, ANTON doesn't ask about TM scenario tuning — it pivots to system selection and implementation planning. If they indicate they're a crypto asset service provider, ANTON surfaces AMLR provisions specific to CASPs.

**Output:** The guided conversation produces a structured discovery document — the same format as the paper workshop synthesis — which feeds directly into ANTON's analytical modules. The document captures not just answers but rationale, uncertainties flagged by the participant, and areas where further investigation is needed.

---

### Connecting Discovery to Action

The real power of Discovery Mode is what happens after the discovery. The structured discovery document becomes a knowledge source that enriches every subsequent analysis:

**Direct module feeding:** "Run AMLR Gap Analysis using the discovery document as primary context" — the gap analysis is now grounded in the organisation's actual situation, constraints, and priorities.

**Workflow triggering:** A discovery session can automatically trigger a pre-configured workflow: Discovery → Gap Analysis → Action Plan → Team Assignment → Deadline Creation.

**Cross-session intelligence:** Discovery findings are extracted as knowledge atoms and added to ANTON's knowledge graph, enriching pattern detection and institutional memory across the organisation.

**Living document:** As the organisation progresses through its remediation or implementation, the discovery document can be updated through follow-up discovery sessions, creating a longitudinal record of how understanding evolved over time.

---

### Why Both Formats Matter

Paper workshops and digital conversations serve different needs and contexts. A paper workshop works best for large groups, complex topics requiring diverse perspectives, situations where relationship building and alignment are as important as information gathering, and contexts where participants are senior stakeholders who respond better to facilitated discussion than AI interaction.

Digital guided conversations work best for individual or small-team assessments, follow-up and update sessions, situations where participants are distributed across locations, rapid preliminary assessments before committing to a full workshop, and ongoing discovery as circumstances evolve.

Many engagements will use both — a paper workshop for the initial discovery with senior stakeholders, followed by digital guided conversations for deep-dives into specific areas with subject matter experts.
