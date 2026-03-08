# ICA Group — IT Systems Flora
**Document type:** Systems Landscape & Architecture Overview  
**Classification:** Internal – Restricted  
**Version:** 4.1  
**Last updated:** January 2025  
**Owner:** Chief Digital Officer / Group IT Architecture

---

## 1. Introduction

This document describes ICA Group's technology landscape across all business units. It is the master reference for enterprise architects, IT procurement, vendor management, and compliance functions. The landscape spans approximately 380 active systems (140 core, 240 peripheral/departmental).

---

## 2. Architecture Principles

1. **Cloud-first** — All new systems must be cloud-native or cloud-hosted (Azure primary, AWS for select workloads)
2. **API-first** — All services expose APIs; point-to-point integrations are prohibited for new builds
3. **Data ownership** — Business units own their data; Group Data Platform provides the integration layer
4. **Vendor diversity** — No single vendor may account for more than 30% of total IT spend
5. **Security by design** — Zero-trust network architecture; all data classified and encrypted in transit and at rest

---

## 3. Core Systems by Domain

### 3.1 ERP & Finance

| System | Vendor | Version | Purpose | Hosting |
|--------|--------|---------|---------|---------|
| SAP S/4HANA | SAP | 2023 | Group finance, accounts payable/receivable, fixed assets | Azure (Swedish DC) |
| ISAAC | In-house (ICA) | v8.2 | Grocery procurement, purchase orders, supplier invoicing | Azure |
| Basware | Basware | Cloud | Invoice processing, e-invoicing to suppliers | SaaS |
| Hyperion Financial Management | Oracle | v11.2 | Group financial consolidation and reporting | Azure |
| Cognos Analytics | IBM | v11.2 | Management reporting, budgeting | Azure |

### 3.2 Merchandising & Category Management

| System | Vendor | Version | Purpose | Hosting |
|--------|--------|---------|---------|---------|
| ISAAC Assortment | In-house | v8.2 | Central assortment management, planogramming | Azure |
| JDA/Blue Yonder | Blue Yonder | 2022.2 | Space planning, category optimisation | SaaS |
| Syndigo | Syndigo | Cloud | Product content management (PIM), supplier data onboarding | SaaS |
| ICA Recipe Platform | In-house | v3.1 | Recipe database, content management | Azure |

### 3.3 Supply Chain & Logistics

| System | Vendor | Version | Purpose | Hosting |
|--------|--------|---------|---------|---------|
| Blue Yonder Demand Planning | Blue Yonder | 2022.2 | Demand forecasting, replenishment | SaaS |
| SAP Extended Warehouse Mgmt | SAP | EWM 2022 | Warehouse management (all 5 DCs) | Azure |
| Manhattan Associates TMS | Manhattan | 2023.1 | Transport management, route optimisation | SaaS |
| Zetes WMS Mobile | Zetes | v5.0 | DC scanner terminals, goods receipt/dispatch | On-premise DC |
| HighJump (Körschema) | Aptean | v8.1 | Driver scheduling, fleet management | On-premise |

### 3.4 Point of Sale & Store Systems

| System | Vendor | Version | Purpose | Hosting |
|--------|--------|---------|---------|---------|
| ICA POS (Kassor) | In-house + NCR | v12.5 | POS terminals in all ~1,300 Swedish stores | Hybrid (local + Azure) |
| NCR Emerald | NCR | 2022.1 | Self-checkout (SCO) terminals | Local store |
| ICA Back Office | In-house | v6.1 | Store ordering, inventory management, price updates | Azure |
| Pricer ESL | Pricer | v4.2 | Electronic shelf labels (deployed in ~400 stores) | In-store |
| CBRE Store Dashboard | CBRE | Cloud | Store energy consumption monitoring | SaaS |

### 3.5 Customer & Digital Platforms

| System | Vendor | Version | Purpose | Hosting |
|--------|--------|---------|---------|---------|
| ICA-appen (iOS) | In-house | v5.4.1 | Customer app — shopping, loyalty, banking | App Store |
| ICA-appen (Android) | In-house | v5.4.1 | Customer app — shopping, loyalty, banking | Google Play |
| ICA.se web platform | In-house | React v18 | E-commerce, recipes, store locator | Azure CDN |
| Adobe Experience Manager | Adobe | AEM 6.5 | CMS for ICA.se and campaign microsites | Azure |
| Salesforce Marketing Cloud | Salesforce | 2024 | CRM, email/push campaign management, journeys | SaaS |
| ICA Smart (AI engine) | In-house + Databricks | v2.1 | Personalisation, recommendation engine | Azure |
| Apptus Esales | Apptus/Voyado | Cloud | E-commerce search and merchandising | SaaS |

### 3.6 Loyalty & Payments

| System | Vendor | Version | Purpose | Hosting |
|--------|--------|---------|---------|---------|
| ICA Loyalty Platform | In-house | v4.0 | ICA Kortet — points accrual, voucher management | Azure |
| ICA Pay | In-house + Nets | v3.2 | In-app mobile payment | Azure |
| Adyen Terminal API | Adyen | Latest | Card terminal processing (Visa/MC/Amex) | SaaS |
| Klarna | Klarna | API v3 | BNPL / checkout alternative for ICA Online | SaaS |
| Swish | Bankgirot | API | Swish payment acceptance | SaaS |

### 3.7 HR & People Systems

| System | Vendor | Version | Purpose | Hosting |
|--------|--------|---------|---------|---------|
| Workday HCM | Workday | 2024.1 | Core HR, payroll, talent management | SaaS |
| Quinyx | Quinyx | Cloud | Workforce scheduling (stores + DCs) | SaaS |
| Cornerstone OnDemand | Cornerstone | Cloud | Learning management, compliance training | SaaS |
| Jobylon | Jobylon | Cloud | Applicant tracking, recruitment | SaaS |

### 3.8 Compliance & Risk Systems

| System | Vendor | Version | Purpose | Hosting |
|--------|--------|---------|---------|---------|
| MetricStream | MetricStream | 2023 | Enterprise risk management, internal controls | Azure |
| NAVEX Global (PolicyTech) | NAVEX | Cloud | Policy management, compliance training | SaaS |
| OneTrust | OneTrust | Cloud | GDPR/privacy management, consent | SaaS |
| ICA Banken Compliance Suite | See ICA Banken Flora | — | AML, KYC, sanctions screening | Separate |

### 3.9 Infrastructure & Security

| System | Vendor | Version | Purpose | Hosting |
|--------|--------|---------|---------|---------|
| Microsoft Azure | Microsoft | — | Primary cloud platform (90% of workloads) | Azure North Europe |
| Microsoft 365 | Microsoft | E5 | Email, collaboration, Teams | SaaS |
| Azure Active Directory | Microsoft | — | Identity and access management (IAM) | Azure |
| CrowdStrike Falcon | CrowdStrike | Latest | Endpoint detection & response (EDR) | SaaS |
| Palo Alto Networks | Palo Alto | — | Network firewall, SASE | Hybrid |
| Splunk | Splunk | 9.2 | SIEM, log management, security analytics | Azure |
| Qualys | Qualys | Cloud | Vulnerability management, patch status | SaaS |
| BeyondTrust | BeyondTrust | Cloud | Privileged access management (PAM) | SaaS |
| Zscaler | Zscaler | — | Zero-trust network access, proxy | SaaS |

---

## 4. Integration Architecture

### 4.1 Integration Platforms

| Platform | Role |
|---------|------|
| MuleSoft Anypoint | Primary ESB/API gateway; manages 1,200+ active API flows |
| Azure Service Bus | Event-driven messaging between microservices |
| Azure Data Factory | ETL/ELT for data lake ingestion |
| Kafka (Confluent) | Real-time streaming (POS transactions, app events) |

### 4.2 Data Platform

| Component | Technology | Purpose |
|-----------|-----------|---------|
| ICA Data Lake | Azure Data Lake Storage Gen2 | Raw and curated data, all business areas |
| ICA Data Warehouse | Azure Synapse Analytics | Enterprise reporting and analytics |
| ICA ML Platform | Azure Databricks | Machine learning model training and serving |
| Data Catalogue | Microsoft Purview | Data discovery, lineage, governance |

---

## 5. Key Vendors & Contract Summary

| Vendor | Annual spend (SEK M) | Contract end | Strategic dependency |
|--------|---------------------|-------------|---------------------|
| Microsoft | 185 | Rolling | Critical — cloud, productivity |
| SAP | 95 | 2027 | Critical — finance, procurement |
| Blue Yonder | 68 | 2026 | High — supply chain |
| Salesforce | 45 | 2026 | High — CRM/marketing |
| Adyen | 38 | 2026 | High — payments |
| NCR | 32 | 2025 | Medium-high — POS hardware |
| Workday | 28 | 2027 | Medium — HR |
| Adobe | 22 | 2026 | Medium — CMS |

---

## 6. Cybersecurity Posture

**Maturity level:** ISO 27001 certified (Group IT and ICA Banken)  
**Penetration testing:** Annual external pen test + quarterly internal red team  
**SOC:** 24/7 Security Operations Centre (co-managed with IBM Security)  
**Incident response time targets:** P1 (critical breach): 15 min detection, 2h containment  
**Last major incident:** N/A (no Tier-1 incidents in 2023)  
**GDPR breach notifications to IMY (Integritetsskyddsmyndigheten):** 2 minor incidents in 2023 (both resolved; no sanctions)

---

## 7. IT Investment Plan 2025–2026

| Initiative | Budget (SEK M) | Status |
|------------|--------------|--------|
| SAP S/4HANA upgrade & Baltic rollout | 145 | In progress |
| ICA-appen v6.0 (banking deepening) | 78 | Planning |
| AI personalisation (ICA Smart v3) | 62 | In progress |
| POS hardware refresh (NCR Emerald 3.0) | 58 | Approved |
| Zero-trust network rollout | 44 | In progress |
| Data platform consolidation | 38 | Planning |
| ESL rollout (remaining 900 stores) | 95 | Approved |

---

*Document owner: Group IT Architecture. For system access requests, contact it-support@ica.se*
