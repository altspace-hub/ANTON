# ICA Banken AB — Customer Onboarding Policy
**Document type:** Policy & Procedure  
**Classification:** Internal – General  
**Version:** 5.1  
**Last updated:** January 2025  
**Owner:** Head of Operations / Head of Compliance  
**Approved by:** Chief Compliance Officer

---

## 1. Purpose

This document describes ICA Banken's policy and procedures for onboarding new customers, including identity verification, risk assessment, and approval workflows. It applies to all customer segments across all products.

---

## 2. Onboarding Channels

| Channel | Products available | ID verification method |
|---------|------------------|----------------------|
| ICA-appen (digital) | ICA Konto, Sparkonto, Cards, Personal Loans, ISK | BankID (electronic ID) |
| ICA.se (web) | ICA Konto, Sparkonto, Cards, Personal Loans, ISK | BankID (electronic ID) |
| In-store (ICA Banken service point) | All products incl. mortgages | Physical ID document |
| Telephone | Supplementary only (not primary onboarding) | BankID + verbal confirmation |

---

## 3. Digital Onboarding (ICA-appen / ICA.se)

### 3.1 Eligibility for Digital Onboarding
- Swedish resident with valid personnummer registered in Folkbokföringen
- Existing BankID issued by a Swedish bank
- Age 18+ (standard); age 15–17 with parental consent (Ung Konto only)
- Not previously exited by ICA Banken or on ICA Banken's internal refusal list

### 3.2 Digital Onboarding Steps

**Step 1 — Product Selection**
Customer selects product from ICA-appen menu or ICA.se

**Step 2 — BankID Authentication**
- Customer authenticates with BankID (Mobile BankID or card reader BankID)
- BankID confirms: full name, personnummer, and authentication timestamp
- ICA Banken verifies personnummer against Folkbokföringen in real time

**Step 3 — Pre-fill and Data Confirmation**
- Name, personnummer, and registered address pre-filled from Folkbokföringen via SPAR (Statens personadressregister)
- Customer confirms or updates contact information (email, mobile)
- Customer declares: occupation, employer, annual income, PEP status

**Step 4 — Product-Specific Information**
For credit products (credit cards, personal loans, mortgages):
- Income verification (customer declaration; cross-referenced with UC credit data)
- Purpose declaration
- UC credit check (KFM check for debt recovery status)
- Credit decision: automated (<2 min) or manual (flagged for review)

**Step 5 — AML/KYC Screening**
- Automatic sanctions screening (Dow Jones system)
- PEP database screening
- Internal blacklist check (previous ICA Banken exits/fraud flags)
- Risk score calculation (automated, based on CDD risk matrix)

**Step 6 — Consent and Terms**
- Customer reviews and accepts:
  - General Terms and Conditions
  - ICA Banken GDPR Privacy Notice
  - Product-specific terms
  - Marketing consent (optional; default off)
- Consents recorded with timestamp and version of document accepted

**Step 7 — Account Activation**
- Low-risk customer (risk score 1–3): Instant activation
- Medium-risk customer (risk score 4–5): Activation within 24 hours (auto-review)
- High-risk customer (risk score 6–7): Manual review by Compliance; EDD triggered; activation pending approval

**Total time (standard digital onboarding):** 3–7 minutes

### 3.3 BankID Failure / Non-BankID Customers

If BankID authentication fails or the customer does not have BankID:
- Customer directed to in-store onboarding
- Alternative digital verification via Verimi or equivalent third-party eID: in evaluation (not yet deployed)

---

## 4. In-Store Onboarding

### 4.1 Process

1. Customer presents valid ID document at ICA Banken service desk
2. ICA Banken colleague scans/copies ID and enters into CDD system
3. Customer completes onboarding form (paper or tablet — digital signature)
4. AML screening run by colleague in real time
5. Account opened (same-day for standard products; mortgage requires credit assessment — 2–5 days)

### 4.2 Accepted Identity Documents

| Document | Accepted for Swedish residents | Accepted for non-residents |
|----------|-------------------------------|--------------------------|
| Swedish national ID card (Nationellt ID-kort) | ✅ Primary | ✅ (with Swedish address proof) |
| Swedish driving licence (with photo) | ✅ Secondary | ❌ |
| Swedish passport | ✅ Primary | N/A |
| EU/EEA passport | ✅ (for EU/EEA nationals) | ✅ |
| Non-EU passport | ✅ (with Swedish address proof) | ✅ (face-to-face only) |
| Swedish residence permit (uppehållstillstånd) | ✅ (with passport or national ID) | N/A |

Expired documents: not accepted. Damaged/unclear documents: not accepted.

---

## 5. Customer Risk Scoring at Onboarding

All new customers receive an automated AML risk score at onboarding (1 = lowest, 7 = highest):

| Risk factor | Score contribution |
|------------|------------------|
| Swedish resident, Swedish personnummer | -1 (reduces score) |
| Non-resident | +2 |
| PEP status | +3 |
| High-risk occupation (cash business owner, etc.) | +2 |
| Non-EEA nationality | +1 |
| Inconsistent address/income information | +2 |
| Sanctions/adverse media alert | +3 (triggers manual review regardless of total score) |
| Young account (18–20 years) requesting high credit limit | +1 |
| Existing ICA loyalty member (>2 years) | -1 (reduces score) |

**Score to risk level mapping:**

| Score | Risk level | CDD level | Activation |
|-------|-----------|----------|-----------|
| 1–3 | Low | Standard CDD | Instant |
| 4–5 | Medium | Standard CDD with monitoring flag | Auto-review (24h) |
| 6 | High | Enhanced CDD | Manual Compliance review |
| 7 | Very High | Enhanced CDD + Senior Approval | CCO/CEO approval required |

---

## 6. Declined Applications

Applications are declined when:

| Reason | Decline type |
|--------|-------------|
| Sanctions match (confirmed) | Mandatory decline; internal blacklist; Riksgälden notification |
| Internal blacklist (previous fraud, policy breach) | Mandatory decline |
| Failed credit assessment (credit products only) | Decline with consumer credit refusal notice |
| PEP — relationship declined (risk too high) | CCO decision; documented |
| Identity cannot be verified | Decline; customer directed to in-store with documents |
| False/inconsistent KYC information | Decline; internal fraud flag |

Declined applicants receive a written or in-app notification explaining the reason (where disclosure is legally permissible — not for sanctions-related declines).

---

## 7. Minors (Age 15–17)

ICA Ung Konto for ages 15–17:
- Parent or guardian must have an active ICA Banken account
- Parent/guardian completes the application and signs consent digitally (BankID)
- Parent/guardian has co-access view only (no transaction capability)
- Card limit: SEK 3,000/month
- Monthly spending report sent to parent (if consented)
- Account automatically reviewed and converted to full ICA Konto at age 18

---

## 8. Business Customers (Sole Traders — Enskild Firma)

ICA Banken accepts sole traders (enskild firma) as customers for current accounts and basic lending.

Additional onboarding requirements:
- F-skattebevis (tax registration certificate) or Bolagsverket registration
- Personal personnummer (sole trader operates under personal ID)
- Declaration of business type, annual turnover, and primary business activities
- High-risk business types (cash-intensive sectors): EDD triggered automatically

---

## 9. Ongoing Data Quality

After onboarding, ICA Banken maintains the accuracy of customer data through:
- Annual data verification prompt in ICA-appen (customer confirms or updates information)
- Automated Folkbokföringen sync (address updates)
- Change-triggered review (customer-reported change of occupation, marital status, address abroad)
- KYC refresh programme (see BWRA §2.2 for KYC refresh backlog management)

---

## 10. Record Keeping

All onboarding records (ID documents, consent timestamps, screening results, risk scores, credit decisions) are retained for:
- **5 years** from account opening (AML Act requirement)
- **10 years** for mortgage-related documentation (Konsumentkreditlagen)

Records stored in ICA Banken Document Management System (SharePoint Online with retention policies).

---

*Document owner: Head of Operations. For queries, contact compliance@icabanken.se*
