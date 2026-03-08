# ICA Banken AB — Incident Management & Operational Resilience Policy
**Document type:** Policy  
**Classification:** Internal – Restricted  
**Version:** 3.1  
**Last updated:** January 2025  
**Owner:** Chief Digital Officer / Chief Risk Officer  
**Approved by:** Board of Directors

---

## 1. Purpose

This policy establishes ICA Banken's framework for identifying, managing, escalating, and reporting operational incidents including IT failures, cybersecurity events, data breaches, fraud events, and AML-related incidents. It ensures compliance with DORA (Digital Operational Resilience Act), Finansinspektionen requirements, and ICA Banken's own operational resilience standards.

---

## 2. Scope

All incidents affecting:
- ICA Banken IT systems and services
- Customer data and privacy
- Payment processing
- AML/financial crime controls
- Regulatory compliance
- ICA Banken employees and physical facilities

---

## 3. Incident Classification

### 3.1 Severity Levels

| Level | Name | Criteria | Example |
|-------|------|---------|---------|
| P1 | Critical | Core service unavailable; >1,000 customers impacted; data breach likely; sanctions violation; safety risk | Core banking T24 down; mass card authorisation failure; ransomware attack |
| P2 | High | Significant service degradation; 100–1,000 customers impacted; financial loss >SEK 500K | ICA-appen banking features unavailable; intermittent payment failures; single confirmed fraud ring |
| P3 | Medium | Limited service disruption; <100 customers impacted; no data breach; financial loss <SEK 500K | Delayed SEPA processing; AML TM system delayed alerts; isolated fraud cases |
| P4 | Low | Minor degradation; <10 customers impacted; negligible financial impact | Single customer BankID sync failure; report generation delayed |

### 3.2 Incident Types

| Type | Category | Examples |
|------|---------|---------|
| IT Availability | Operational | System downtime, API failure, DC outage |
| Cybersecurity | Security | Phishing, malware, data exfiltration, DDoS |
| Data Breach | Privacy/Security | Unauthorised access to customer data |
| Payment Failure | Operational/Financial | Failed payment batch, settlement error |
| AML/Financial Crime | Compliance | Sanctions violation, major fraud scheme, STR filing breach |
| Physical | Operational | Office access failure, fire, flood |
| Third-party | Operational | Temenos outage, TSYS incident, BankID unavailability |
| Regulatory | Compliance | FI inquiry, enforcement letter, regulatory deadline miss |
| Conduct | Compliance | Customer mis-selling, data misuse by employee |

---

## 4. Incident Response Procedures

### 4.1 Detection and Reporting

**Automated detection:**
- Splunk SIEM — security events, anomalies
- Azure Monitor — infrastructure and application health
- Actimize — AML-related control failures
- Fircosoft — sanctions screening failures

**Manual detection:**
- Any employee discovering an incident must report immediately to:
  - Service Desk (IT incidents): +46-8-555-112-00 / itsupport@icabanken.se
  - Compliance (AML/regulatory incidents): compliance@icabanken.se
  - Risk team (fraud/financial incidents): risk@icabanken.se

**Golden rule:** If in doubt whether something is an incident — report it. Failing to report is always worse than over-reporting.

### 4.2 Incident Response Team

**Standing Incident Response Team (IRT):**

| Role | Responsible person | Contact |
|------|------------------|---------|
| Incident Commander (P1/P2) | CTO (or on-call senior IT manager) | +46-73-xxx-xxxx (24/7 pager) |
| Security Lead | Head of Cybersecurity | +46-73-xxx-xxxx |
| Communications Lead | Head of Communications | +46-73-xxx-xxxx |
| Compliance/Legal Lead | CCO or Deputy | +46-73-xxx-xxxx |
| Business Lead | Relevant business area head | On-call rota |
| Customer Service Lead | Head of Operations | On-call rota |

For P1 incidents: Incident Commander convenes the IRT within 30 minutes.

### 4.3 Response Timeline by Severity

| Severity | Detection-to-assessment | IRT convened | CEO notified | Board notified |
|----------|------------------------|-------------|-------------|---------------|
| P1 Critical | < 15 minutes | < 30 minutes | < 1 hour | < 4 hours |
| P2 High | < 30 minutes | < 2 hours | < 4 hours | Next Board meeting (or extraordinary if major) |
| P3 Medium | < 2 hours | Not required (team leads manage) | Daily incident digest | Monthly report |
| P4 Low | < 4 hours | Not required | Not required | Monthly report |

---

## 5. Regulatory Notification Requirements

### 5.1 Finansinspektionen

ICA Banken must notify Finansinspektionen for:

| Incident type | Notification deadline | Method |
|--------------|--------------------|----|
| Major IT incident (DORA classification) | Within 4 hours of P1 classification | FI secure portal |
| Significant cybersecurity incident | Within 24 hours of classification | FI secure portal |
| Suspension of payment services | Immediately | FI direct line + written |
| Material operational incident | Within 24 hours | FI secure portal |
| DORA Major Incident (formal definition) | Initial report: 4h; Intermediate: 72h; Final: 1 month | FI portal |

### 5.2 Integritetsskyddsmyndigheten (IMY — Data Protection Authority)

Personal data breach notification requirements:
- Notification to IMY: **within 72 hours** of becoming aware of a breach (GDPR Article 33)
- Notification to affected individuals: **without undue delay** if high risk to their rights
- If breach is unlikely to result in risk to individuals: document only; no notification required

Threshold for individual notification (Article 34):
- Highly likely to result in high risk: discrimination, identity theft, financial loss, social disadvantage

### 5.3 Riksgälden (Sanctions)

Confirmed sanctions match:
- Notify Riksgälden within **24 hours**
- Written report within **5 business days**

### 5.4 Other Notifications

| Situation | Authority | Deadline |
|-----------|----------|---------|
| Fraud exceeding SEK 1M | Ekobrottsmyndigheten (EBM) | Within 48 hours |
| STR filing (suspicious transaction) | Finanspolisen (FIU) | Within 5 business days of classification |
| Terrorist financing suspicion | Finanspolisen (FIU) | Immediately |
| Customer death with frozen funds | Riksgälden | As applicable |

---

## 6. DORA — ICT Incident Classification

From January 2025, ICA Banken applies the DORA Major Incident classification framework:

**DORA Major Incident criteria (any of the following triggers Major Incident status):**
- Number of clients affected: > 10% of ICA Banken's active customers (> 141,000)
- Geographical spread: Incident affects multiple regions in Sweden
- Duration: ICT-related downtime > 24 hours
- Data losses: Loss of data relating to > 10,000 customers
- Reputational impact: Significant media coverage
- Financial losses: > EUR 1 million (approx. SEK 11.5 million)
- Criticality: Incident affects payment service availability

**DORA reporting timeline:**
1. **Initial notification to FI:** Within 4 hours of Major Incident classification
2. **Intermediate report:** Within 72 hours — updated information
3. **Final report:** Within 1 month — root cause analysis, remediation

---

## 7. Cybersecurity Incidents

### 7.1 Cybersecurity Incident Response Playbooks

ICA Banken maintains documented response playbooks for:
- Ransomware / malware infection
- Phishing campaign (targeted at customers or employees)
- Data exfiltration
- DDoS attack
- Insider threat
- Third-party breach affecting ICA Banken data

Playbooks are stored in ICA Banken's incident management system (ServiceNow) and reviewed annually.

### 7.2 Forensics and Evidence Preservation

For cybersecurity incidents:
- IRT Security Lead activates forensic preservation within 1 hour of P1/P2 classification
- No systems powered down or data deleted without Security Lead approval
- Chain of custody maintained for any evidence that may be used in legal proceedings
- External forensic firm (Deloitte Cyber) on retainer; can be engaged within 4 hours

### 7.3 Communication to Customers

For incidents affecting customer data or services:
- Customer communication drafted by Communications Lead; approved by CEO and Legal
- Communication via: ICA-appen push notification, email, ICA.se/banken banner
- Tone: transparent, action-oriented, no technical jargon
- Initial customer communication: within 4 hours of P1 classification (if service-impacting)

---

## 8. Post-Incident Review

All P1 and P2 incidents require a formal Post-Incident Review (PIR):
- Completed within **10 business days** of incident resolution
- PIR must include: timeline, root cause, contributing factors, impact assessment, remediation actions
- Remediation actions assigned to named owners with deadline dates
- P1 PIR presented to Board at next scheduled meeting

PIR template available in ServiceNow.

---

## 9. Testing and Exercising

ICA Banken tests its incident response capabilities:

| Exercise type | Frequency | Scope |
|-------------|----------|-------|
| Tabletop exercise (scenario simulation) | Semi-annual | IRT + senior management |
| Technical DR failover test | Annual | IT, Operations |
| BCP test (business continuity) | Annual | All critical functions |
| Cyber red team exercise | Annual | IT Security + CrowdStrike |
| DORA TLPT (Threat-Led Penetration Test) | Every 3 years (mandatory) | External specialist firm |

Last DR test: September 2024 — Pass  
Last tabletop exercise: November 2024 — Topic: ransomware + customer notification  
Next TLPT: Q3 2025

---

## 10. Governance

| Report | Frequency | Audience |
|--------|----------|---------|
| Incident log | Real-time (ServiceNow) | IT, Compliance |
| Weekly incident digest | Weekly | CTO, CCO, CRO |
| Monthly incident summary | Monthly | CEO, management team |
| Quarterly incident report | Quarterly | Board |
| DORA Major Incident report | Per event | FI + Board |

---

*Document owner: CDO/CRO. For incident reporting, contact the Service Desk (IT) or Compliance (non-IT incidents).*
