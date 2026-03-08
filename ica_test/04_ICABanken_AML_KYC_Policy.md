# ICA Banken AB — AML/KYC Policy
**Document type:** Policy  
**Classification:** Restricted — Compliance  
**Version:** 7.0  
**Last updated:** January 2025  
**Owner:** Chief Compliance Officer  
**Approved by:** Board of Directors

---

## 1. Purpose and Scope

### 1.1 Purpose
This policy establishes ICA Banken's framework for preventing, detecting, and reporting money laundering (ML), terrorist financing (TF), and other financial crime. It implements a risk-based approach to Anti-Money Laundering and Counter-Terrorist Financing (AML/CTF) and sets minimum standards for Know Your Customer (KYC) procedures.

### 1.2 Legal Basis
This policy is issued in compliance with:
- Swedish AML/CTF Act (Lag om åtgärder mot penningtvätt och finansiering av terrorism, 2017:630)
- Finansinspektionen regulations (FFFS 2017:11 as amended)
- EU Anti-Money Laundering Directives (4AMLD, 5AMLD, 6AMLD)
- FATF Recommendations (2012, updated 2023)
- EBA Guidelines on ML/TF Risk Factors (EBA/GL/2021/02)
- EU Regulation 2015/847 (Wire Transfer Regulation / Travel Rule)

From 2027: this policy will be updated to align with the EU Anti-Money Laundering Authority (AMLA) regulations and the EU AML Regulation (AMLR).

### 1.3 Scope
This policy applies to:
- All ICA Banken AB employees
- All contracted agents and outsourced service providers acting on ICA Banken's behalf
- All products and services offered by ICA Banken and ICA Försäkring

---

## 2. Governance

### 2.1 Accountability Structure

| Role | AML Responsibility |
|------|------------------|
| Board of Directors | Approve BWRA, risk appetite, AML policy; ultimate accountability |
| CEO | Overall accountability for AML compliance programme |
| Chief Compliance Officer (CCO) | Day-to-day responsibility for AML/CTF programme; Money Laundering Reporting Officer (MLRO) |
| Deputy MLRO | Deputises for CCO; approves STRs in CCO absence |
| Head of Financial Crime | Manages TM, CDD operations, and investigations |
| All employees | Obligation to report suspicions; complete training |

### 2.2 Money Laundering Reporting Officer (MLRO)
The CCO (currently Lena Martinsson) serves as ICA Banken's designated MLRO. The MLRO:
- Reports directly to the Board on AML matters
- Is responsible for STR filing with Finanspolisen (FIU Sweden)
- Reviews and approves all STRs before submission
- Has authority to block or exit customer relationships

### 2.3 Three Lines of Defence

| Line | Function | AML Role |
|------|---------|---------|
| 1st Line | Business units, operations | Implement CDD; apply AML controls; escalate suspicions |
| 2nd Line | Compliance, Risk | Set policy; monitor compliance; advise business; receive STRs |
| 3rd Line | Internal Audit | Independent assurance on effectiveness of AML controls |

---

## 3. Customer Due Diligence (CDD)

### 3.1 CDD Levels

ICA Banken applies three levels of CDD based on assessed risk:

**Standard CDD (SDD)**  
Applied to: Low-risk customers (standard Swedish residents with no elevated risk flags)  
Requirements:
- Verify identity (full name, personnummer, date of birth)
- Verify address (via Folkbokföringen)
- Screen against sanctions lists and PEP databases
- Understand purpose of account/relationship
- Record source of funds (for accounts > SEK 500,000 initial deposit)

**Enhanced CDD (EDD)**  
Applied to: PEPs, non-residents, high-risk customers, high-value customers, unusual business purposes  
Requirements:
All SDD requirements plus:
- Verify identity with original documents (ID card/passport)
- Obtain information on source of wealth (not just source of funds)
- Obtain senior management approval for the relationship
- More frequent and intensive ongoing monitoring
- Annual (minimum) relationship review

**Simplified CDD (SiCDD)**  
Applied to: Low-risk product categories (e.g., prepaid instruments below EU threshold, ISK accounts)  
Requirements:
- Basic identity verification (name + personnummer)
- Sanctions screening only
- No ongoing monitoring beyond automated systems

### 3.2 Identity Verification

**For Swedish residents:**  
- **Digital onboarding:** BankID authentication (equivalent to in-person verification under Swedish law)
- **In-store:** Swedish national ID card (Nationellt ID-kort), EU/EEA passport, or driving licence with photo

**For non-residents:**  
- Valid passport required
- Additional document confirming Swedish address or reason for banking relationship
- Face-to-face verification at ICA Banken service point mandatory (no remote onboarding for first account)

**For legal entities (sole traders and companies):**  
- Registration certificate (Bolagsregistrering via Bolagsverket)
- Verify UBO (Ultimate Beneficial Owner) — any natural person with >25% control
- All UBOs subject to SDD/EDD per their individual risk profile
- Board authorisation for account signatories

### 3.3 Customer Identification Program (CIP)

Minimum information collected for all customers:

| Data point | Source | Mandatory |
|-----------|--------|----------|
| Full legal name | Customer declaration + Folkbokföringen | Yes |
| Personnummer (or DOB + country for non-residents) | BankID / document | Yes |
| Residential address | Folkbokföringen / customer | Yes |
| Nationality | Customer declaration | Yes |
| Occupation / source of income | Customer declaration | Yes (EDD: additional evidence) |
| Purpose of banking relationship | Customer declaration | Yes |
| PEP status | Customer declaration + database screening | Yes |
| Beneficial ownership (legal entities) | Bolagsverket + customer | Yes (legal entities) |

---

## 4. Ongoing Monitoring

### 4.1 Transaction Monitoring

ICA Banken uses Nasdaq/Actimize RCM (Risk Case Manager) for automated transaction monitoring. The TM system applies approximately 48 monitoring rules across all customer accounts and transactions.

**Monitoring rule categories:**

| Category | # Rules | Examples |
|---------|---------|---------|
| Structuring detection | 8 | Multiple transactions just below SEK 50,000 threshold |
| High-value transactions | 6 | Single transactions > SEK 100,000 |
| Velocity anomalies | 10 | Unusual increase in transaction frequency |
| Geographic | 7 | Transactions to/from high-risk countries |
| PEP/High-risk customer | 5 | Unusual activity for PEP-classified account |
| Cash and quasi-cash | 4 | High ATM withdrawal volumes; cash deposits |
| Loan-related | 5 | Unusual repayment patterns; third-party repayment |
| Account behaviour | 3 | Dormant account activation; rapid balance movements |

**Alert management:**
- All alerts reviewed by Financial Crime Analysts within 5 business days
- Urgent alerts (sanctions hits, terrorist financing indicators) escalated within 1 hour
- Analyst decision options: Dismiss (with documented rationale), Escalate to MLRO, File STR, Request customer explanation

### 4.2 Periodic Customer Review

| Customer risk level | Review frequency |
|-------------------|----------------|
| Low risk | Every 5 years |
| Medium risk | Every 3 years (target; currently avg. 4.2 years — remediation in progress) |
| High risk (incl. PEPs) | Annual |
| Very high risk | 6-monthly |

Triggers for out-of-cycle review:
- TM alert escalation
- Adverse media alert
- Customer-reported change (change of address, business, PEP status)
- Sanctions screening hit

### 4.3 Sanctions Screening

ICA Banken screens all customers and transactions against:
- EU Consolidated Sanctions List
- UN Sanctions List
- HM Treasury (UK) — for EU/UK dual-listed entities
- OFAC (US) — for USD-correspondent transactions
- Swedish Government sanctions (Riksgälden/Government decisions)

**Screening frequency:**
- At onboarding: Full name + date of birth screening
- Ongoing: Daily batch screening of full customer base
- Real-time: All payment orders screened against sanctions lists before execution

**Match handling:**
- True match: Transaction blocked; CCO notified within 1 hour; Finansinspektionen and Riksgälden notified within 24 hours
- False positive: Documented dismissal by Compliance Analyst
- In 2024: 4 true sanctions matches identified (all North Korean-listed entities in indirect correspondent chains); all reported and transactions blocked.

---

## 5. Suspicious Transaction Reporting

### 5.1 Internal Reporting

All employees must report suspicions of ML or TF to the MLRO:
- **Internal SAR (Suspicious Activity Report):** submitted via ICA Banken's compliance platform (NAVEX EthicsPoint)
- **No tipping off:** Employees must not inform the customer or any third party that a suspicion has been reported
- **Protection:** No employee will be penalised for making a good-faith internal report

### 5.2 MLRO Assessment and External Filing

Upon receipt of an internal SAR:
1. MLRO reviews within 24 hours (priority), 5 business days (standard)
2. MLRO determines whether to file an STR with Finanspolisen (FIU Sweden)
3. STRs are filed via the goAML portal
4. MLRO documents reasoning for file/no-file decisions

**STR statistics (2024):**
- Internal SARs received: 312
- STRs filed with Finanspolisen: 166
- STR filing rate: 53%
- Average time from alert to STR filing: 3.2 business days
- Feedback received from FIU: 8 cases (4 confirmed investigations)

### 5.3 Tipping-Off Prohibition

It is a criminal offence under the Swedish AML Act to tip off a customer or any other person that:
- A suspicion report has been made
- An investigation is underway

Employees found to have tipped off a subject will face immediate disciplinary action and potential criminal prosecution.

---

## 6. Record Keeping

All AML/KYC records must be retained for **5 years** from:
- The date of the transaction (transaction records)
- The end of the business relationship (CDD records)
- The date of the STR filing (SAR/STR records)

Records are stored in ICA Banken's document management system (SharePoint Online with legal hold policies). After 5 years, records are automatically purged unless a legal hold is in place.

Extended retention (10 years) applies when:
- A law enforcement request has been received
- A matter is under investigation by Finanspolisen or Finansinspektionen

---

## 7. High-Risk Categories — Specific Policies

### 7.1 Cash-Intensive Businesses

Sole trader and business customers operating in cash-intensive sectors are subject to EDD:

High-risk sectors (automatic EDD trigger):
- Restaurant, café, and catering (SIC: 5510–5520)
- Taxi and private hire (SIC: 4922)
- Beauty salons and barbershops (SIC: 9602)
- Vehicle trading (SIC: 4511–4519)
- Second-hand and antique dealers (SIC: 4791)

EDD for these customers includes annual review, source of cash documentation, and comparison of declared turnover with transaction data.

### 7.2 Non-Resident Customers

ICA Banken accepts non-resident customers on a limited basis (primarily Swedish nationals living abroad). Requirements:
- Face-to-face identity verification at an ICA Banken service point before account activation
- Source of funds declaration and supporting documentation
- Home country tax residence information (FATCA/CRS reporting)
- No accounts opened for customers resident in FATF blacklisted countries

### 7.3 Correspondent Banking

ICA Banken does not maintain correspondent banking relationships for third-party use. The bank uses correspondent relationships through its settlement bank (Riksbank/Bankgirot) and card network (Mastercard/Visa) under industry-standard frameworks only.

---

## 8. Training

### 8.1 Training Requirements

| Training module | Frequency | Target audience | Completion rate (2024) |
|----------------|----------|----------------|----------------------|
| AML Awareness (general) | Annual | All employees | 94% |
| AML Specialist (deep-dive) | Annual | Compliance, Financial Crime, Front Line | 98% |
| PEP and Sanctions | Annual | Compliance, Relationship Managers | 100% |
| Onboarding refresher (new-hire) | Within 30 days of joining | All new employees | 100% |
| Event-triggered training | As needed | Relevant staff | N/A |

Training is delivered via Cornerstone LMS. Completion is tracked and reported to the Board quarterly.

### 8.2 Fitness and Propriety

The MLRO and Deputy MLRO are assessed for fitness and propriety by Finansinspektionen annually. The CCO holds the Finansinspektionen-approved AML certification (Swedish AML Academy, Level 3).

---

## 9. Policy Compliance and Exceptions

Any request for an exception to this policy must be:
- Submitted in writing to the CCO
- Assessed for regulatory compliance risk
- Approved by the CCO and documented

No exceptions will be granted that would result in breach of the AML Act or Finansinspektionen regulations.

Breaches of this policy by employees are subject to disciplinary action up to and including termination of employment and referral to law enforcement.

---

## 10. Policy Review

This policy is reviewed:
- Annually (standard)
- Following material changes to the regulatory framework
- Following identification of a significant control failure
- Upon issuance of new Finansinspektionen guidance

Next review: January 2026

---

*Restricted distribution: This document is distributed to Compliance, Risk, Internal Audit, and senior management only. Controlled copies tracked by Compliance.*
