# ICA Banken AB — IT Systems Flora
**Document type:** Systems Landscape & Architecture  
**Classification:** Restricted — IT / Compliance  
**Version:** 3.5  
**Last updated:** January 2025  
**Owner:** Chief Digital Officer  
**Approved by:** CEO / Board IT & Risk Committee

---

## 1. Overview

ICA Banken's technology landscape consists of approximately 85 active systems. The architecture is cloud-first, hosted primarily on Microsoft Azure (Sweden North region). This document is the authoritative reference for enterprise architects, IT risk, compliance, and vendor management.

**Architecture principles:**
- Cloud-native where possible; legacy on-premise phased out by 2027
- API-first; all integrations via ICA Banken API Gateway (Azure API Management)
- Zero-trust security model
- DORA (Digital Operational Resilience Act) compliance target: Q4 2025
- Regulated by Finansinspektionen IT/cyber resilience requirements (FFFS 2014:7)

---

## 2. Core Banking

| System | Vendor | Version | Purpose | Hosting |
|--------|--------|---------|---------|---------|
| Temenos T24 (now Transact) | Temenos | R20.1 | Core banking — accounts, transactions, interest, GL | Azure Sweden North |
| Temenos Infinity | Temenos | 21.2 | Digital banking front-end (web + API) | Azure |
| T24 Reporting | Temenos | R20.1 | Regulatory reporting (FI, ECB, SCB) | Azure |

**Temenos T24 is ICA Banken's system of record.** It holds all customer accounts, transactions, balances, and the general ledger.

---

## 3. Card Management

| System | Vendor | Version | Purpose | Hosting |
|--------|--------|---------|---------|---------|
| TSYS (Global Payments) | Global Payments | TS2 v6.1 | Card issuing, authorisation, statement generation | Global Payments DC (Frankfurt) |
| Mastercard Connect | Mastercard | API | Mastercard network connectivity, settlement | Mastercard global |
| Visa VisaNet | Visa | API | Visa debit network, settlement | Visa global |
| Adyen | Adyen | Platform | Card terminal processing (ICA store POS) | SaaS |

**Note:** TSYS hosts card data in Frankfurt under EU data residency requirements. Cardholder data (PAN, CVV) is never stored in ICA Banken's own systems — it remains in the TSYS PCI-DSS-certified environment.

---

## 4. Mortgage and Lending Systems

| System | Vendor | Version | Purpose | Hosting |
|--------|--------|---------|---------|---------|
| ICA Bolån Origination Platform | In-house | v3.2 | Mortgage application, credit assessment, auto-approval | Azure |
| ICA Kredit Engine | In-house + Experian | v2.4 | Personal loan credit scoring (AI-based) | Azure |
| UC (Upplysningscentralen) | UC | API | Credit bureau data (credit history, payment remarks) | SaaS |
| Bolagsverket API | Bolagsverket | REST API | Business registration and UBO verification | External |
| Kronofogden API | Kronofogden | REST API | Debt enforcement record check | External |
| LM (Lantmäteriet) | Lantmäteriet | API | Property registry, title search | External |
| Valueguard | Valueguard | API | Automated property valuation (AVM) | SaaS |

---

## 5. Payments

| System | Vendor | Version | Purpose | Hosting |
|--------|--------|---------|---------|---------|
| Bankgirocentralen BGC | Bankgirot | API | Swedish domestic payment clearing (Bankgiro) | Bankgirot infra |
| RIX (Riksbank) | Riksbanken | SWIFT-based | Large-value and interbank settlement | Riksbanken |
| Swish | Getswish AB | API | P2P and point-of-sale Swish payments | Getswish |
| SEPA SCT/SDD | SEB (correspondent) | SWIFT | SEPA credit transfers and direct debits | SEB infra |
| SWIFT | SWIFT | Alliance Lite2 | International payments, correspondent banking | SWIFT |
| ICA Pay Platform | In-house | v3.2 | ICA-appen in-app payment, checkout | Azure |
| PSD2 Open Banking API | In-house | v2.1 | AISP/PISP open banking compliance | Azure |

---

## 6. Savings and Investments

| System | Vendor | Version | Purpose | Hosting |
|--------|--------|---------|---------|---------|
| Funnel (fund platform) | Funnel AB | Cloud | ISK (investeringssparkonto), fund distribution | SaaS |
| AMF Fonder API | AMF | API | Fund NAV and transaction connectivity | External |
| Swedbank Robur API | Swedbank | API | Fund distribution connectivity | External |
| Strukturinvest | — | — | Fixed savings account management (in T24) | Azure (T24) |

---

## 7. Identity and Customer Management

| System | Vendor | Version | Purpose | Hosting |
|--------|--------|---------|---------|---------|
| BankID | BankID Sverige / Nets | API | Customer authentication (onboarding + login) | BankID infra |
| SPAR | Skatteverket | API | Swedish address register — population data | Skatteverket |
| ICA Banken CRM | Salesforce FSC | 2024 SP1 | Customer 360 view, relationship management, campaign | SaaS |
| OneTrust | OneTrust | Cloud | GDPR consent management, data subject rights | SaaS |
| ICA Loyalty Integration | In-house (ICA Group) | API v4.0 | ICA Kortet points, stamkundspris, vouchers | Azure |

---

## 8. AML / Compliance Systems

| System | Vendor | Version | Purpose | Hosting |
|--------|--------|---------|---------|---------|
| Actimize RCM (Risk Case Manager) | Nasdaq/Actimize | v8.2 | Transaction monitoring, alert management, case mgmt | Azure |
| Actimize Customer Screening | Nasdaq/Actimize | v8.2 | Batch PEP, sanctions, adverse media screening | Azure |
| Fircosoft (Dow Jones) | Dow Jones | FircoSoft v6 | Real-time payment sanctions screening | On-premise (DR in Azure) |
| goAML | UNODC / Finanspolisen | Web portal | STR (Suspicious Transaction Report) filing with FIU Sweden | Finanspolisen |
| NAVEX EthicsPoint | NAVEX | Cloud | Internal SAR/whistleblower reporting | SaaS |
| FATCA/CRS Reporting | Sovos | Cloud | Automatic exchange of information (AEOI) reporting | SaaS |
| Regulatory Reporting | BearingPoint RegTech | Cloud | FI regulatory returns (COREP, FINREP, LCR, NSFR) | SaaS |
| MetricStream | MetricStream | 2023 | Compliance policy management, risk registers | Azure |

---

## 9. Risk Management Systems

| System | Vendor | Version | Purpose | Hosting |
|--------|--------|---------|---------|---------|
| ICA Banken Credit Risk Platform | In-house | v2.1 | Portfolio credit risk analytics, stress testing, IFRS9 | Azure |
| Moody's CreditLens | Moody's | Cloud | Commercial credit analysis (minor usage) | SaaS |
| ALM (Asset-Liability Management) | Kamakura (now SAS) | v10.0 | Interest rate risk, liquidity modelling | Azure |
| Bloomberg Terminal | Bloomberg | — | Market data, interest rate benchmarks | Terminal (on-premise) |
| ICARA/SREP Tool | In-house | v1.5 | Internal Capital Adequacy (ICAAP/ILAAP) | Azure |

---

## 10. Infrastructure and Security

| System | Vendor | Purpose | Hosting |
|--------|--------|---------|---------|
| Microsoft Azure (Sweden North) | Microsoft | Primary cloud — all production workloads | Azure |
| Microsoft Azure (West Europe) | Microsoft | Disaster recovery site | Azure |
| Microsoft 365 E5 | Microsoft | Email, Teams, SharePoint, OneDrive | SaaS |
| Azure Active Directory (Entra ID) | Microsoft | IAM — all employees and systems | Azure |
| Azure API Management | Microsoft | API gateway — all internal/external APIs | Azure |
| CrowdStrike Falcon | CrowdStrike | EDR — endpoint protection | SaaS |
| Palo Alto Prisma | Palo Alto | SASE, firewall-as-a-service | SaaS |
| Splunk | Splunk | SIEM, log aggregation | Azure |
| BeyondTrust | BeyondTrust | Privileged Access Management (PAM) | SaaS |
| Qualys VMDR | Qualys | Vulnerability management | SaaS |
| Mimecast | Mimecast | Email security, anti-phishing | SaaS |
| Varonis | Varonis | Data classification, DLP | Azure |
| Nessus | Tenable | Penetration testing / vulnerability scanning | On-premise |

---

## 11. Digital Banking Platforms

| System | Description | Hosting |
|--------|------------|---------|
| ICA Banken App (iOS) | Mobile banking; integrated with ICA-appen; BankID auth; full product access | App Store |
| ICA Banken App (Android) | As above | Google Play |
| ICA.se/banken (web portal) | Browser-based internet banking | Azure CDN |
| ICA-appen integration layer | API bridge between ICA Group ICA-appen and ICA Banken core systems | Azure |

**Digital banking stack:** React Native (mobile), React 18 (web), Node.js (BFF), .NET 7 (microservices), PostgreSQL + CosmosDB (data), Azure Kubernetes Service (AKS) for container orchestration.

---

## 12. Key Vendor Dependencies

| Vendor | Annual spend (SEK M) | Risk level | Contract end |
|--------|---------------------|-----------|-------------|
| Temenos | 38 | Critical | 2027 |
| Global Payments (TSYS) | 28 | Critical | 2026 |
| Nasdaq/Actimize | 22 | High | 2026 |
| Microsoft Azure | 18 | Critical | Rolling EA |
| Salesforce | 12 | Medium | 2026 |
| Dow Jones / Fircosoft | 9 | High | 2025 (renewal in progress) |
| BankID Sverige | Revenue share | Critical | N/A (industry utility) |

---

## 13. Operational Resilience

**Recovery targets (in line with FI DORA requirements):**

| System tier | RTO (Recovery Time Objective) | RPO (Recovery Point Objective) |
|------------|------------------------------|-------------------------------|
| Tier 1 (Core banking, payments) | 4 hours | 1 hour |
| Tier 2 (AML, CRM) | 8 hours | 4 hours |
| Tier 3 (Reporting, analytics) | 24 hours | 24 hours |

**DR site:** Azure West Europe (Netherlands). Full active-passive failover. Last DR test: September 2024 — successful.

---

*Restricted distribution: IT, Risk, Compliance, Internal Audit, and Senior Management only.*
