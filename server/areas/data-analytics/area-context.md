# Data & Analytics — Area Context

## Domain Overview

This area covers data quality management, data governance framework design, analytics strategy, and data-driven decision making for financial services and corporate organisations. In financial crime prevention, data management is critical — poor data quality directly undermines transaction monitoring, customer risk scoring, and regulatory reporting.

## Core Data Quality Dimensions (ISO 8000 / DAMA Framework)

| Dimension | Definition | How to Measure |
|-----------|-----------|----------------|
| **Completeness** | All required fields populated for all records | % of records with all mandatory fields filled |
| **Accuracy** | Data correctly reflects real-world values | Comparison to authoritative source; sampling |
| **Consistency** | Same entity/value represented the same way across systems | Cross-system reconciliation; duplicate detection |
| **Timeliness** | Data is current enough for its intended use | Data age vs. required freshness (e.g., KYC refresh cycles) |
| **Uniqueness** | No unintended duplicates | Duplicate detection algorithms |
| **Validity** | Data conforms to defined formats, ranges, and business rules | Rule-based validation |
| **Integrity** | Relationships between data elements are maintained | Referential integrity checks |

## Regulatory Data Requirements in Financial Services

### AMLA / AMLR Data Obligations
- Customer data: complete and accurate beneficial ownership, risk scores, transaction histories
- Refresh cycles: High-risk customers ≤1 year; Standard ≤3 years; Low-risk ≤5 years
- Retention: minimum 5 years from end of business relationship (AMLA may extend to 7)
- Data quality requirements for transaction monitoring — completeness of reference data

### BCBS 239 — Principles for Effective Risk Data Aggregation
For systemically important banks (G-SIBs and D-SIBs):
1. Governance and infrastructure
2. Data architecture and IT infrastructure
3. Accuracy and integrity
4. Completeness
5. Timeliness
6. Adaptability
7–11. Risk reporting practices

### DORA Data Requirements
- ICT asset register — complete and up to date
- Register of Information (contractual arrangements with ICT third parties)
- Incident data — classification, reporting timelines, root cause

### GDPR Data Management Obligations
- Records of Processing Activities (RoPA) — Article 30
- Data minimisation and purpose limitation
- Retention schedules with legal basis
- Subject access request response capability

## Data Governance Framework Components

1. **Data Strategy** — Principles, vision, and roadmap for data as a strategic asset
2. **Data Ownership** — Clear accountabilities: Data Owner (business), Data Steward (operational), Data Custodian (IT)
3. **Data Dictionary / Business Glossary** — Common definitions across the organisation
4. **Data Quality Rules** — Business rules that define what "correct" data looks like
5. **Data Lineage** — Where does data originate, how does it flow, what transforms it?
6. **Master Data Management (MDM)** — Single authoritative source for key entities (customers, counterparties, products)
7. **Metadata Management** — Data about data — classifications, sensitivity, retention
8. **Data Quality Monitoring** — Automated measurement against defined rules; dashboards; SLAs
9. **Issue Management** — Process for identifying, triaging, and resolving data quality issues
10. **Data Catalogue** — Searchable inventory of available datasets and their attributes

## Common Data Patterns in Financial Crime

- **KYC data** — Customer identity, beneficial ownership, source of wealth, risk scoring
- **Transaction data** — Amount, counterparty, currency, channel, geography, purpose
- **Reference data** — Sanctions lists, PEP databases, country risk ratings, industry codes
- **Behavioural data** — Transaction patterns, product usage, channel behaviour over time
- **Network/relationship data** — Connections between customers, accounts, counterparties

## Key Insight from FCP Practice

"AML doesn't own most of its data, but it must be an expert at setting data requirements."

The compliance function must be able to specify exactly what data quality it needs, even when the data is owned by operations, IT, or the business. This requires translating regulatory obligations into precise data specifications: field names, acceptable values, completeness thresholds, freshness requirements.

## Analytics Maturity Levels

| Level | Description | Example Capability |
|-------|-------------|------------------|
| 1 — Descriptive | What happened? | Transaction volume reports, portfolio summaries |
| 2 — Diagnostic | Why did it happen? | Root cause analysis, drill-down dashboards |
| 3 — Predictive | What will happen? | Credit default models, churn prediction |
| 4 — Prescriptive | What should we do? | Risk-based alert prioritisation, dynamic thresholds |
| 5 — Autonomous | Self-optimising | Adaptive transaction monitoring, AI-driven CRR |
