# Jurisdictional Skill: Nigeria — Central Bank of Nigeria (CBN)

You are working in the Nigerian financial regulatory jurisdiction. The following reference material covers the regulatory architecture, AML/CFT framework, identity infrastructure, fintech landscape, and key risk considerations for Africa's largest economy. Nigeria presents a complex and dynamic compliance environment — legislative frameworks have been substantially modernised since 2022, but implementation challenges and elevated financial crime risks remain significant factors in any analysis. Apply this context throughout your analysis.

---

## 1. Regulatory Architecture

Nigeria's financial sector is supervised by multiple agencies with distinct but sometimes overlapping mandates. Determining the correct regulatory authority is the essential first step in any Nigerian compliance engagement.

- **Central Bank of Nigeria (CBN):** The apex monetary authority and primary financial regulator. Governs commercial banks, merchant banks, development banks, microfinance banks (MFBs), finance companies, payment service banks (PSBs), payment service providers, mortgage banks, and primary mortgage institutions. CBN issues binding regulations, guidelines, and circulars.
- **Securities and Exchange Commission (SEC):** Regulates capital markets, stockbrokers, investment advisers, collective investment schemes, and digital asset platforms. SEC issued a Digital Asset framework in 2022 and has been actively regulating crypto activities.
- **National Insurance Commission (NAICOM):** Regulates insurance companies and insurance brokers. AML obligations under PMLA/MLPPA apply to insurers.
- **Nigerian Financial Intelligence Unit (NFIU):** Established as an autonomous body in 2018 (previously within the EFCC). Nigeria's FIU, responsible for receiving and analysing STRs, CTRs, and other financial intelligence. NFIU is an Egmont Group member. Reports are submitted via the goAML platform.
- **Economic and Financial Crimes Commission (EFCC):** The primary law enforcement agency for financial crimes — money laundering, advance fee fraud (419), cybercrime, and corruption. The EFCC has prosecution powers and extensive investigative resources. It is one of the most prominent financial crime enforcement bodies on the African continent.
- **Independent Corrupt Practices and Other Related Offences Commission (ICPC):** Focuses on corruption within public institutions. Relevant for PEP analysis and public sector financial flows.
- **Special Control Unit against Money Laundering (SCUML):** Under the Ministry of Industry, Trade and Investment. Supervises DNFBPs (Designated Non-Financial Businesses and Professions) — real estate agents, dealers in precious metals/stones, law firms, accounting firms, hospitality, auto dealers. SCUML registration is mandatory for DNFBPs — check whether a customer or counterparty is a regulated DNFBP when assessing CDD obligations.
- **Corporate Affairs Commission (CAC):** Companies registration authority. Beneficial ownership disclosure requirements are administered through the CAC.

---

## 2. Key Legislation

- **Money Laundering (Prevention and Prohibition) Act, 2022 (MLPPA):** A major legislative overhaul that replaced the Money Laundering (Prohibition) Act, 2011. The MLPPA significantly expanded reporting obligations, tightened beneficial ownership requirements, extended the scope of predicate offences, strengthened international cooperation provisions, and imposed new obligations on virtual asset service providers (VASPs). Compliance programmes built under the old MLPA require comprehensive review against the MLPPA.
- **Terrorism Prevention (Amendment) Act, 2022:** Updated the counter-terrorism financing framework. Strengthened asset freezing mechanisms, expanded the definition of terrorist financing, and introduced new offences related to financing travel for terrorism. Aligned more closely with FATF standards.
- **Proceeds of Crime (Recovery and Management) Act, 2022 (POCA):** Establishes the legal framework for identifying, restraining, confiscating, and managing proceeds of crime. Fills a significant gap in Nigeria's previous framework — historically, asset recovery had been difficult due to procedural barriers.
- **Banks and Other Financial Institutions Act, 2020 (BOFIA):** A comprehensive revision of the BOFIA 1991. Strengthens CBN supervisory powers, introduces new licensing categories, updates consumer protection provisions, and imposes stricter corporate governance requirements on financial institutions.
- **CBN Regulatory Framework for Mobile Money Services in Nigeria:** Governs mobile money operators (now reclassified as PSBs). Sets operational requirements, capital thresholds, float management, agent oversight, and AML/CFT obligations.
- **CBN Guidelines on Microfinance Banks:** Separate regulatory framework covering Unit, State, and National MFB tiers with different capital requirements and permissible activities.
- **National Financial Inclusion Strategy 2.0 (NFIS 2.0):** Government target: 95% financial inclusion by 2024 (actual progress trails target). Drives tiered KYC policy and agent banking expansion.
- **Digital Credit Providers Regulations (CBN, 2022):** Following the proliferation of predatory digital lending apps, CBN introduced mandatory registration, interest rate disclosure, and ethical lending standards for digital credit providers.

---

## 3. AML/CFT Framework

When conducting AML/CFT analysis for a Nigerian entity, apply the following parameters precisely.

**Reporting to NFIU:**
- **Suspicious Transaction Report (STR):** Mandatory under MLPPA 2022. Suspicion-based — no minimum threshold. Must be filed within 24 hours of forming suspicion (for banks) or 7 days (for other reporting entities). Tipping off is a criminal offence.
- **Cash Transaction Report (CTR):** Required for cash transactions exceeding NGN 5 million (~USD 3,300) for individuals and NGN 10 million (~USD 6,600) for corporates, within a single business day. Given Nigeria's status as a high-cash economy, CTR volumes are substantial.
- **International Transfer Report (ITR):** Required for international wire transfers — submitted to NFIU for monitoring cross-border flows.
- All reports submitted via goAML portal.

**Identity Infrastructure (BVN and NIN — critical for Nigerian compliance):**
- **BVN (Bank Verification Number):** Introduced by CBN in 2014. A unique 11-digit identifier linked to an individual's biometric data (fingerprints and photograph). Mandatory for all bank customers. Over 55 million BVNs enrolled. BVN serves as the cornerstone of individual identity verification in the Nigerian financial system — it links across all financial institutions, preventing identity fraud and enabling cross-institution checks. Account opening without BVN linkage is not permitted for standard accounts.
- **NIN (National Identification Number):** The national identity number issued by the National Identity Management Commission (NIMC). 12-digit unique number linked to biometric data. CBN mandated NIN-BVN linkage since 2021 — customers who had not linked their NIN to their BVN faced account restrictions. As of 2024, NIN linkage is effectively mandatory for active accounts. NIN + BVN together provide robust dual-biometric identity verification.
- **Tiered KYC Structure:**
  - **Tier 1:** Basic account — no BVN required initially, but with transaction limits (daily debit cap NGN 50,000, maximum balance NGN 300,000). Primarily for unbanked/underbanked customers.
  - **Tier 2:** BVN required, higher limits (daily debit NGN 200,000, maximum balance NGN 500,000).
  - **Tier 3:** Full CDD — BVN + NIN + address verification + one form of photo ID + utility bill. No transaction limits.
- **PEP Risk:** Nigeria has a significant and well-documented PEP risk profile. Senior government officials at federal and state levels, legislators, military officers, and their associates require enhanced due diligence. Notable historical typologies include: diversion of public funds through state-owned enterprise accounts, use of nominees to hold real estate, and routing of illicit funds through offshore jurisdictions (Cayman Islands, BVI, Jersey) back to Nigeria. The Abacha-era looting cases and subsequent FATF plenary discussions remain reference points for global typologies.
- **Beneficial Ownership:** MLPPA 2022 requires disclosure of UBOs with 5% or more ownership (note: lower than the typical 25% threshold). CBN mandates UBO disclosure at account opening for all corporate customers. CAC now maintains a beneficial ownership register linked to company registration.

---

## 4. Mobile Money & Fintech Ecosystem

Nigeria's fintech sector is one of the most dynamic on the African continent and represents significant compliance complexity.

- **Payment Service Banks (PSBs):** CBN created the PSB category to enable mobile network operators and other non-banks to provide basic deposit, payment, and remittance services without a full banking licence. PSBs CANNOT lend. Key PSBs: MTN MoMo PSB, Airtel Money PSB. Float management is regulated — customer deposits are held in trust accounts at CBN-approved custodians.
- **Fintechs:** Nigeria has a large and well-developed fintech ecosystem — OPay (payments, savings, micro-lending), Flutterwave (payment infrastructure), Paystack (payment gateway, acquired by Stripe 2020), Moniepoint (SME payments/lending), PalmPay, Carbon, FairMoney. These companies are regulated by CBN (for payment activities) and SEC (for investment/lending activities). Their AML obligations are equivalent to those of licensed financial institutions.
- **eNaira:** Nigeria's CBDC, launched October 2021 — the first CBDC on the African continent. Initial adoption was low; CBN has made multiple efforts to increase uptake. Regulated by CBN; AML rules apply to all eNaira wallets.
- **CBN Regulatory Sandbox:** Active since 2021. Enables pilot programmes for innovative financial products under regulatory forbearance.
- **Super Agent Licensing:** CBN licences "Super Agents" — hub-and-spoke agent banking operators who manage large networks of sub-agents. Key players: Access Bank agents, FirstMonie, OPay. Agents serve as the primary financial access point in rural and peri-urban areas. Agent oversight (due diligence, monitoring, liability) is a significant compliance area.
- **Open Banking Framework (2022):** CBN published an Open Banking Policy in 2022. Still in early implementation — API standards and licensing categories are developing.
- **CBN Forex Restrictions:** Nigeria has historically maintained multiple exchange rates and significant restrictions on forex access. CBN moved to a more unified, market-determined exchange rate in 2023. The NGN has experienced substantial depreciation. Forex restriction history creates cross-border compliance complexity — verify the current forex regulatory status when working on any Nigeria cross-border transaction analysis, as the position has changed materially and continues to evolve.

---

## 5. Microfinance Sector

- **MFB Tiers:**
  - **Unit MFB:** Licensed to operate in a single location (LGA). Minimum capital NGN 200 million.
  - **State MFB:** Licensed to operate in a single state. Minimum capital NGN 1 billion.
  - **National MFB:** Nationwide. Minimum capital NGN 5 billion.
- **Key Players:** LAPO Microfinance Bank, AB Microfinance Bank, ACCION Microfinance Bank, Grooming Centre.
- **Credit Bureau Coverage:** Improving but incomplete. CRC Credit Bureau, FirstCentral, CR Services operate. Credit bureau penetration remains low relative to the adult population, making credit risk assessment challenging and contributing to multiple borrowing.
- **NPL Rates:** MFBs have historically exhibited high non-performing loan ratios. CBN conducts periodic stress tests and has closed/merged underperforming MFBs.

---

## 6. FATF Status and Compliance Challenges

- **FATF Grey List (2023):** Nigeria was added to the FATF List of Jurisdictions under Increased Monitoring (grey list) in October 2023. The primary deficiencies cited included: inadequate investigation and prosecution of ML/TF, insufficient confiscation of proceeds of crime, incomplete implementation of the MLPPA 2022, and gaps in DNFBP supervision. When working on Nigerian compliance matters, note that enhanced scrutiny from correspondent banks, international regulators, and counterparties is an active business risk.
- **Progress Reporting:** Nigeria committed to an action plan with FATF. Verify the current grey list status as of the date of analysis — Nigeria's position may have changed following progress reports and FATF plenary sessions.
- **High-Cash Economy:** Despite fintech growth, Nigeria remains substantially cash-dependent. Cash in circulation as a percentage of M2 is among the highest in Sub-Saharan Africa. The 2023 naira redesign (CBN recalled old notes, introduced new notes) caused significant disruption and highlighted the depth of the cash economy.
- **Cybercrime and Fraud Typologies:** Nigeria is prominently associated in international financial crime typologies with:
  - Business Email Compromise (BEC) — Nigerian criminal networks are responsible for a significant share of global BEC losses
  - Advance fee fraud (419 fraud / "yahoo yahoo") — though substantially evolved from the original email-based scheme
  - Romance scams and investment fraud
  - This does NOT mean Nigerian customers are inherently higher risk, but transaction monitoring rules should incorporate these typologies for relevant product/sector combinations.
- **Trade-Based Money Laundering (TBML):** Lagos port (Apapa and Tin Can Island) is a significant channel for TBML. Over/under-invoicing of goods, phantom shipments, and multiple invoicing are documented typologies.
- **Oil Sector Illicit Flows:** Nigeria's oil sector — including bunker fuel trading, oil bunkering, and state oil company (NNPCL) transactions — is associated with significant illicit financial flows. Politically connected individuals in the oil sector carry elevated ML risk.

---

## 7. Key Terminology Glossary

| Term | Definition |
|---|---|
| MLPPA | Money Laundering (Prevention and Prohibition) Act, 2022 — Nigeria's principal AML statute |
| BOFIA | Banks and Other Financial Institutions Act, 2020 — CBN's foundational banking law |
| NFIU | Nigerian Financial Intelligence Unit — autonomous FIU; receives STRs/CTRs via goAML |
| EFCC | Economic and Financial Crimes Commission — primary ML/fraud enforcement agency |
| SCUML | Special Control Unit against Money Laundering — supervises DNFBPs |
| BVN | Bank Verification Number — 11-digit biometric-linked ID; mandatory for bank accounts |
| NIN | National Identification Number — 12-digit NIMC-issued biometric identifier |
| PSB | Payment Service Bank — deposit and payments only, no lending (MTN MoMo, Airtel Money) |
| MFB | Microfinance Bank — three tiers (Unit, State, National); serves unbanked/low-income |
| eNaira | Nigeria's CBDC, launched 2021; low adoption but regulatory framework in place |
| POCA | Proceeds of Crime (Recovery and Management) Act, 2022 |
| CTR | Cash Transaction Report — NGN 5M (individuals) / NGN 10M (corporates) threshold |
| STR | Suspicious Transaction Report — suspicion-based, no threshold |
| goAML | UNODC-developed reporting platform; used by NFIU for report submissions |
| DNFBP | Designated Non-Financial Business or Profession — must register with SCUML |
| Naira (NGN) | Nigerian currency — significant depreciation since 2023; verify current rate |
| NNPCL | Nigerian National Petroleum Company Limited — state oil company; elevated PEP/ML risk |
| 419 Fraud | Advance fee fraud — iconic Nigerian fraud typology; evolved into BEC and romance scams |
| BEC | Business Email Compromise — Nigerian criminal networks prominent in global BEC typologies |
| CAC | Corporate Affairs Commission — company registry; administers beneficial ownership register |
| Super Agent | CBN-licensed agent banking hub operator managing networks of sub-agents |
