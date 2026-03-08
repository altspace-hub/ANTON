# ICA Banken AB — Transaction Monitoring Policy
**Document type:** Policy  
**Classification:** Restricted — Compliance  
**Version:** 4.2  
**Last updated:** January 2025  
**Owner:** Head of Financial Crime  
**Approved by:** Chief Compliance Officer / Board

---

## 1. Purpose

This policy establishes ICA Banken's framework for monitoring customer transactions to detect suspicious activity indicative of money laundering (ML), terrorist financing (TF), fraud, and other financial crime. It defines the roles, responsibilities, systems, and processes that make up the transaction monitoring (TM) programme.

---

## 2. Regulatory Basis

Transaction monitoring is a regulatory obligation under:
- Swedish AML Act (2017:630), Chapter 4 (Continuous monitoring)
- FFFS 2017:11, §17 (monitoring obligations)
- EBA Guidelines on transaction monitoring (EBA/GL/2021/02, Section 4.5)
- FATF Recommendation 10 (Customer due diligence) and Recommendation 20 (Reporting of suspicious transactions)

---

## 3. Transaction Monitoring System

### 3.1 Technology Platform

ICA Banken uses **Nasdaq (Actimize) Risk Case Manager (RCM)** as its primary transaction monitoring system.

| Component | Description |
|-----------|------------|
| Data ingestion | Real-time and batch feeds from core banking (T24), card systems (TSYS), and payment gateway |
| Rule engine | 48 configurable detection rules + 4 machine learning models |
| Alert management | Workflow for analyst triage, escalation, disposition |
| Case management | Full audit trail for investigations; linked to STR filing |
| Reporting | Management dashboard; regulatory reporting; MIS |

Data refresh:
- Payment transactions: real-time (< 60 seconds)
- Account data (balance, profile): nightly batch
- Customer risk score: weekly recalculation

### 3.2 Data Sources

| Source system | Data type | Frequency |
|-------------|----------|----------|
| Temenos T24 | Account transactions, balance movements | Real-time |
| TSYS (card management) | Card authorisations, ATM withdrawals, international transactions | Real-time |
| ICA-appen | Login events, device change, address change | Real-time |
| CDD system | Customer risk ratings, PEP flags, EDD status | Nightly |
| Sanctions engine | Screening results | Real-time |
| External data (UC) | Credit events, adverse changes | Monthly |

---

## 4. Detection Rules

### 4.1 Rule Categories

**Category 1 — Structuring Rules (8 rules)**

| Rule ID | Rule name | Threshold | Logic |
|---------|----------|-----------|-------|
| STR-001 | Multiple sub-threshold transfers out | SEK 49,000 | ≥3 transfers within 5 days, each < SEK 50,000, aggregate > SEK 100,000 |
| STR-002 | Multiple sub-threshold cash deposits | SEK 49,000 | ≥3 deposits within 5 days to different branches/ATMs |
| STR-003 | Cumulative monthly below-threshold | SEK 49,000 | >10 transfers in month all below SEK 50,000 |
| STR-004 | Round-sum structuring | Any | ≥5 round-sum transactions (e.g., SEK 10,000 exactly) within 10 days |
| STR-005 | Split transaction detection | SEK 99,000 | Original amount > SEK 100,000 split into smaller parts same day |
| STR-006 | Multi-account structuring | SEK 49,000 | Same beneficiary receives structured amounts across customer's multiple accounts |
| STR-007 | Customer-stated purpose mismatch | N/A | Transaction type inconsistent with declared account purpose |
| STR-008 | Salary account structuring | SEK 49,000 | Atypically large salary credit followed by structured withdrawals |

**Category 2 — High-Value Rules (6 rules)**

| Rule ID | Rule name | Threshold | Logic |
|---------|----------|-----------|-------|
| HV-001 | Single large domestic transfer | SEK 500,000 | Single transfer > SEK 500,000 not consistent with customer profile |
| HV-002 | Single large international transfer | SEK 100,000 | Single transfer > SEK 100,000 to non-EEA country |
| HV-003 | Rapid balance movement | SEK 250,000 | Account balance ≥ SEK 250,000 emptied within 48 hours |
| HV-004 | Large cash deposit | SEK 50,000 | Single cash deposit > SEK 50,000 |
| HV-005 | High-value credit card spending | SEK 100,000 | Credit card monthly spend > SEK 100,000 (3x avg.) |
| HV-006 | Large loan proceeds movement | 80% of loan | Loan proceeds moved out of account within 24 hours of disbursement |

**Category 3 — Velocity Rules (10 rules)**

| Rule ID | Rule name | Logic |
|---------|----------|-------|
| VEL-001 | Transaction frequency spike | >3x average monthly transaction count in rolling 30 days |
| VEL-002 | Inbound velocity increase | >5x average inbound amount in 7 days |
| VEL-003 | Rapid pass-through | Funds in > SEK 20,000, moved out >80% within 24h |
| VEL-004 | Multiple new payees | >8 new payees added within 7 days |
| VEL-005 | Card transaction spike | >5x average daily card transactions |
| VEL-006 | ATM withdrawal frequency | >5 ATM withdrawals in one day |
| VEL-007 | International transfer frequency | >3 international transfers per week |
| VEL-008 | Micro-transaction testing | >20 transactions < SEK 10 within 24h (card testing indicator) |
| VEL-009 | Mule account indicator | Account receives multiple inbound small amounts from different senders |
| VEL-010 | New account velocity | Account opened < 30 days ago with high transaction volume |

**Category 4 — Geographic Rules (7 rules)**

| Rule ID | Rule name | Logic |
|---------|----------|-------|
| GEO-001 | Transfer to FATF blacklist | Any transfer to Iran, DPRK, Myanmar — auto-block + alert |
| GEO-002 | Transfer to FATF grey list | Transfer to FATF-monitored jurisdictions above SEK 10,000 |
| GEO-003 | Multiple countries in short period | Card used in >3 countries within 5 days (potential mule or card fraud) |
| GEO-004 | High-risk country transfer | Transfer to ICA Banken Category A high-risk countries > SEK 5,000 |
| GEO-005 | Jurisdiction inconsistency | Transfer destination inconsistent with customer's declared geography |
| GEO-006 | Offshore jurisdiction | Transfer to known offshore financial centres > SEK 25,000 |
| GEO-007 | Sanctioned region card use | Card used in country subject to targeted sanctions |

**Category 5 — PEP/High-Risk Customer Rules (5 rules)**

| Rule ID | Rule name | Logic |
|---------|----------|-------|
| PEP-001 | PEP unusual activity | Any transaction for PEP-designated customer >2x 12-month average |
| PEP-002 | PEP international transfer | Any international transfer by PEP customer |
| PEP-003 | PEP large cash | Any cash transaction by PEP > SEK 10,000 |
| PEP-004 | High-risk customer velocity | EDD-rated customer with velocity spike |
| PEP-005 | Newly designated PEP | Customer newly identified as PEP with retroactive review of 12-month transaction history |

**Category 6 — Cash and Quasi-Cash Rules (4 rules)**

| Rule ID | Rule name | Logic |
|---------|----------|-------|
| CASH-001 | Cash deposit followed by transfer | Cash deposit > SEK 10,000 followed by domestic transfer within 24h |
| CASH-002 | ATM cashout pattern | Repeated max-value ATM withdrawals at different locations |
| CASH-003 | Credit card cash advance | Cash advance > SEK 20,000 within 7 days |
| CASH-004 | Cryptocurrency exchange payment | Payment to known cryptocurrency exchange > SEK 25,000 |

**Category 7 — Loan-Related Rules (5 rules)**

| Rule ID | Rule name | Logic |
|---------|----------|-------|
| LOAN-001 | Third-party loan repayment | Loan repayment received from unrelated third party |
| LOAN-002 | Rapid loan proceeds dispersal | >80% of loan disbursement moved out within 24h |
| LOAN-003 | Unexplained income surge at application | Transaction data shows income spike inconsistent with prior 24 months |
| LOAN-004 | Loan and instant transfer | Personal loan disbursed + full balance transferred immediately |
| LOAN-005 | Mortgage irregular | Third party pays mortgage instalment regularly |

**Category 8 — Dormancy Rules (3 rules)**

| Rule ID | Rule name | Logic |
|---------|----------|-------|
| DORM-001 | Dormant reactivation large inbound | Account inactive > 12 months; receives inbound > SEK 50,000 |
| DORM-002 | Dormant reactivation high velocity | Account inactive > 6 months; sudden high transaction frequency |
| DORM-003 | Dormant international | Account inactive > 6 months; first transaction is international transfer |

---

## 5. Machine Learning Models

ICA Banken supplements rule-based detection with 4 ML models (deployed from Q3 2023):

| Model | Type | Purpose | Performance |
|-------|------|---------|------------|
| Anomaly Detection — Accounts | Autoencoder (unsupervised) | Detect unusual account behaviour vs. peer group | Precision: 42%; Recall: 61% |
| Network Analysis | Graph neural network | Detect money mule networks | Precision: 38%; Recall: 54% |
| PEP Behaviour | Gradient boosting | Detect unusual PEP activity | Precision: 51%; Recall: 68% |
| Crypto-Asset Risk | Random forest | Identify transactions with crypto-asset nexus | Precision: 45%; Recall: 58% |

ML model alerts are scored and routed to a dedicated ML alert queue reviewed by Senior Financial Crime Analysts.

---

## 6. Alert Management

### 6.1 Alert Workflow

```
Transaction generated
       ↓
TM System applies rules + ML models
       ↓
Alert generated → Prioritised (P1/P2/P3)
       ↓
Financial Crime Analyst triage
       ↓
    [Options]
    ├── Dismiss (documented)
    ├── Request customer information (Section 6.3)
    ├── Escalate to Senior Analyst
    └── Escalate to MLRO → Consider STR
```

### 6.2 Alert Priorities

| Priority | SLA | Criteria |
|----------|-----|---------|
| P1 | 1 hour | Sanctions hit; TF indicators; account freeze required |
| P2 | 24 hours | PEP unusual activity; high-value international transfer; ML model high-confidence |
| P3 | 5 business days | Standard rule alerts; low-risk customers |

### 6.3 Customer Information Requests

Analysts may request information from the customer to clarify a transaction. This must be done:
- Without disclosing that a suspicion exists (no tipping-off)
- Via a standardised customer communication (pre-approved by CCO)
- With a response deadline of 10 business days

If the customer does not respond, or the response does not satisfactorily explain the transaction, the alert is escalated to the MLRO.

### 6.4 Alert Statistics (FY2024)

| Metric | Value |
|--------|-------|
| Total alerts generated | 12,350 |
| Alerts dismissed (documented) | 10,128 (82%) |
| Alerts escalated to MLRO | 1,060 (8.6%) |
| STRs filed | 166 (15.7% of escalated) |
| False positive rate | 86.5% (within acceptable range) |
| P1 SLA compliance | 99.8% |
| P3 SLA compliance | 94.2% |

---

## 7. Rule Governance

### 7.1 Rule Tuning

Rules are reviewed quarterly by the TM Governance Committee:
- Thresholds adjusted based on alert volume and quality metrics
- New rules proposed based on emerging typologies (FATF reports, FIU advisories)
- Retired rules documented and archived

### 7.2 TM Governance Committee

| Member | Role |
|--------|------|
| Head of Financial Crime | Chair |
| Senior Financial Crime Analyst | TM specialist |
| Head of Compliance Operations | |
| Data Science (ML models) | |
| IT/TM System Owner | |

Frequency: Quarterly; extraordinary meetings as needed.

### 7.3 Upcoming Rule Changes (Q1–Q2 2025)

| New/modified rule | Priority | Rationale |
|------------------|----------|---------|
| CRYPTO-001: Crypto exchange payment > SEK 10,000 (reduce threshold from SEK 25,000) | High | FATF Recommendation 16 Travel Rule; increased crypto typology risk |
| CRYPTO-002: Multiple micro-purchases at crypto ATMs | High | Emerging typology — crypto ATM structuring |
| MULE-010: AI-enhanced mule network detection | High | Upgrade MULE rules to ML model |
| GEO-008: Transfer to Myanmar (newly FATF-blacklisted) | Immediate | Myanmar added to FATF blacklist Oct 2024 |

---

## 8. Escalation and Governance

- All STR filing decisions are made by the MLRO (or Deputy MLRO)
- No STR may be filed without MLRO sign-off
- All dismissed escalations are reviewed by the MLRO in monthly batch review
- Board receives quarterly TM performance report (alert volumes, STRs, FIU feedback)
- Finansinspektionen examination access to all TM records on request

---

*Restricted distribution: Compliance, Financial Crime, Internal Audit, and Senior Management only.*
