# ICA Banken AB — Customer Due Diligence (CDD) Procedures
**Document type:** Procedure  
**Classification:** Restricted — Compliance  
**Version:** 4.0  
**Last updated:** January 2025  
**Owner:** Head of Compliance Operations  
**Approved by:** Chief Compliance Officer

---

## 1. Purpose

This document provides detailed operational procedures for implementing ICA Banken's Customer Due Diligence (CDD) programme. It supplements the AML/KYC Policy and is the day-to-day reference for compliance analysts, front-line staff, and operations teams.

---

## 2. CDD Workflow Overview

```
New customer application
         ↓
Identity verification (BankID / physical ID)
         ↓
Data collection (name, DOB, address, occupation, PEP status)
         ↓
Screening (sanctions, PEP, adverse media, internal blacklist)
         ↓
Risk scoring (automated, 1–7 scale)
         ↓
CDD level determination (Standard / Enhanced / Simplified)
         ↓
Approval (instant for low-risk; manual for high-risk)
         ↓
Account activation
         ↓
Ongoing monitoring (periodic review + TM alerts)
```

---

## 3. Standard CDD (SDD)

### 3.1 Applicability

Standard CDD applies to:
- Swedish residents with personnummer
- Age 18+
- No PEP flags
- No sanctions/adverse media flags
- Risk score 1–3 (low risk)

### 3.2 Information Required

| Data element | Collection method | Verification |
|-------------|-----------------|-------------|
| Full legal name | BankID / customer declaration | BankID (authoritative) or ID document |
| Personnummer | BankID / customer declaration | BankID links directly to Skatteverket records |
| Date of birth | Derived from personnummer | Automatic |
| Registered address | SPAR lookup | Cross-reference Folkbokföringen |
| Contact details (email, mobile) | Customer declaration | Not independently verified (OTP-confirmed mobile) |
| Nationality | Customer declaration | Not independently verified for SDD |
| Occupation | Customer declaration | Not independently verified for SDD |
| Annual income band | Customer declaration | Compared to UC data for credit products |
| Purpose of relationship | Customer declaration | Not independently verified for SDD |
| PEP self-declaration | Customer declaration | Cross-referenced with Dow Jones PEP database |

### 3.3 SDD Controls

- Sanctions screening: automated (real-time, Dow Jones Fircosoft)
- PEP screening: automated (daily batch, Dow Jones)
- Internal blacklist: automated (real-time)
- Account monitoring: standard TM rules apply

### 3.4 SDD Decision Time

- Digital onboarding: < 5 minutes (fully automated)
- In-store: < 15 minutes (staff-assisted)

---

## 4. Enhanced Due Diligence (EDD)

### 4.1 Applicability

EDD is mandatory for:
- All PEP customers and their family members / close associates
- Non-resident customers
- Customers with risk score 6–7
- Customers in high-risk occupations (cash-intensive businesses)
- Customers seeking credit limits > SEK 100,000
- Customers with adverse media hits not cleared by initial review
- Any customer where the standard CDD information raises unexplained inconsistencies

### 4.2 EDD — Additional Information Required

In addition to all SDD data:

| Additional data element | Collection method | Verification requirement |
|------------------------|-----------------|------------------------|
| Full nationality history | Customer declaration | Supported by passport/ID |
| Physical ID document | Original in-store or certified copy | Certified copy by notary or government authority |
| Source of funds | Customer declaration | Supporting evidence (payslips, tax return, bank statements — last 3 months) |
| Source of wealth | Customer declaration | Explanation of how the customer accumulated their overall wealth |
| Employment/business details | Customer declaration | Employer confirmation or business registration |
| Beneficial ownership (if legal entity) | Bolagsverket / customer | UBO register extract |

### 4.3 Source of Wealth Assessment

EDD requires understanding the **origin of the customer's total wealth**, not just the funds being deposited. The following documentation is accepted:

| Source of wealth | Acceptable evidence |
|-----------------|-------------------|
| Employment income | Last 3 payslips + latest tax return |
| Business ownership | Audited accounts (last 2 years) + business registration |
| Property sale | Sale completion documentation |
| Inheritance | Grant of probate / inheritance certificate |
| Investment returns | Investment account statements (last 12 months) |
| Pension | Pension statement |
| Savings over time | Bank account statements (last 24 months) |
| Other | Written explanation + supporting documentation assessed by Compliance |

### 4.4 EDD Decision Matrix

| Customer type | EDD reviewer | Approval required |
|--------------|-------------|-----------------|
| Non-resident (EEA) | Compliance Analyst | Head of Compliance |
| Non-resident (non-EEA) | Senior Compliance Analyst | CCO |
| Risk score 6 (High) | Senior Compliance Analyst | Head of Compliance |
| Risk score 7 (Very High) | CCO review | CCO + CEO |
| Domestic PEP | Senior Compliance Analyst | CCO |
| Foreign PEP | CCO | CCO + CEO |
| Cash-intensive business | Compliance Analyst | Head of Compliance |

### 4.5 EDD Timeline

- EDD review initiated within 24 hours of application
- EDD completed within 5 business days
- If additional documentation needed from customer: 10 business day customer response deadline
- If no response or insufficient documentation: application declined

---

## 5. Simplified Due Diligence (SiCDD)

### 5.1 Applicability

SiCDD applies only to:
- ISK (Investeringssparkonto) fund savings with no cash withdrawal rights
- Prepaid instruments below EUR 150 limit
- Youth accounts (Ung Konto, age 15–17) opened with parental EDD already completed

### 5.2 SiCDD Information Required

- Full name and personnummer
- Sanctions screening only
- No occupation, income, or source of funds information required

---

## 6. Beneficial Ownership Procedures

### 6.1 Applicability

Beneficial ownership verification is required for:
- All legal entity customers (enskild firma with registered employees, AB companies, HB, KB)
- Trust arrangements
- Customers acting on behalf of a third party

### 6.2 UBO Identification

ICA Banken uses Bolagsverket's Beneficial Ownership Register (Verkliga huvudmänsregister) as the primary source, supplemented by customer declaration.

A UBO is defined as any natural person who:
- Directly or indirectly owns > 25% of the shares or voting rights, OR
- Controls the legal entity through other means (board control, veto rights, etc.)

### 6.3 UBO Verification Steps

1. Extract Bolagsverket UBO register entry (API or manual)
2. Compare with customer declaration
3. If discrepancy: customer must explain and provide supporting ownership documentation
4. Each UBO is subject to individual SDD/EDD based on their own risk profile
5. UBO information re-verified at each periodic review

---

## 7. Periodic CDD Review

### 7.1 Review Schedule

| Customer risk level | Review frequency | Trigger |
|-------------------|----------------|---------|
| Low risk | 5 years | Calendar-based |
| Medium risk | 3 years | Calendar-based |
| High risk (incl. PEPs) | 12 months | Calendar-based |
| Very High risk | 6 months | Calendar-based |

Target: all periodic reviews completed within 30 days of due date.

Current compliance (Dec 2024):
- Low risk reviews: 98.3% on time
- Medium risk reviews: 89.1% on time (2.1% backlog — KYC Refresh Programme)
- High risk reviews: 95.8% on time

### 7.2 What is Reviewed

During periodic review:
1. Check if identity information is still current (cross-reference SPAR)
2. Check if PEP status has changed
3. Re-run sanctions screening
4. Re-run adverse media screening
5. Review transaction history (last 12 months) for unexplained activity
6. For EDD customers: refresh source of funds/wealth documentation if material change

### 7.3 Event-Triggered Reviews

Out-of-cycle reviews are triggered by:
- TM alert escalation
- Customer-reported change (address abroad, new employer, change of business)
- Adverse media alert
- Sanctions screening alert
- Account behaviour inconsistency flagged by analyst

---

## 8. CDD Records Management

All CDD documentation is stored in ICA Banken's CDD Records System (Actimize RCM integrated with SharePoint):

| Record type | Retention period |
|-------------|----------------|
| Identity documents | 5 years from end of relationship |
| CDD questionnaires | 5 years from end of relationship |
| Source of funds/wealth documentation | 5 years from end of relationship |
| Screening results (sanctions, PEP, adverse media) | 5 years from end of relationship |
| Periodic review reports | 5 years from end of relationship |
| STR-related CDD records | 10 years (or until investigation closed) |

Access to CDD records:
- Compliance Analysts: full access
- Business units (relationship managers): read-only
- Internal Audit: full access for audit purposes
- Finansinspektionen: full access on request

---

## 9. Reliance on Third Parties

ICA Banken may rely on third parties to conduct CDD when:
- The third party is a supervised financial institution (FI-regulated or equivalent)
- A written agreement is in place confirming the third party's CDD standards
- The third party provides its CDD documentation on request within 2 business days
- ICA Banken retains ultimate responsibility for CDD adequacy

**Current third-party reliance arrangements:**
- None active as of January 2025

---

## 10. Quality Assurance

The Head of Compliance Operations conducts monthly QA sampling:
- Random sample of 50 SDD cases (automated random selection)
- Random sample of 10 EDD cases
- All PEP new relationships opened in the month

QA findings are reported to the CCO monthly and to the Board quarterly.

---

*Restricted distribution: Compliance, Financial Crime, Internal Audit, and Senior Management only.*
