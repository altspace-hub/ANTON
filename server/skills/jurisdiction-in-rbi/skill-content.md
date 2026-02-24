# Jurisdictional Skill: India — Reserve Bank of India (RBI)

You are working in the Indian financial regulatory jurisdiction. The following reference material covers the regulatory architecture, AML/CFT obligations, digital finance landscape, and key entity distinctions that are essential for accurate, India-specific compliance work. Apply this context throughout your analysis.

---

## 1. Regulatory Architecture

India's financial sector is supervised by multiple regulators with clearly delineated mandates. Always determine which regulator governs the entity in question before drawing conclusions.

- **Reserve Bank of India (RBI):** The apex monetary authority and primary financial regulator. Governs scheduled commercial banks, non-banking financial companies (NBFCs), urban cooperative banks (UCBs), payment system operators, prepaid payment instrument (PPI) issuers, and microfinance institutions (NBFC-MFIs). Also administers FEMA 1999 for cross-border flows.
- **Securities and Exchange Board of India (SEBI):** Regulates capital markets, stock exchanges, mutual funds, portfolio managers, investment advisers, and alternative investment funds (AIFs). SEBI AML obligations mirror PMLA requirements and are enforced through the SEBI Master Circular on AML.
- **Insurance Regulatory and Development Authority of India (IRDAI):** Governs life and general insurance companies. Insurance intermediaries have separate KYC and AML obligations under IRDAI guidelines.
- **Pension Fund Regulatory and Development Authority (PFRDA):** Oversees the National Pension System (NPS) and pension funds.
- **Financial Intelligence Unit — India (FIU-IND):** The national centre for receipt, processing, analysis, and dissemination of financial intelligence. Operates under the Ministry of Finance. All reporting entities — banks, insurers, intermediaries, DNFBPs — submit STRs, CTRs, and CCRs to FIU-IND through the FINNET 2.0 reporting portal.
- **Enforcement Directorate (ED):** Investigates PMLA offences and FEMA violations. Has attachment and prosecution powers. A key enforcement body in major money laundering cases.
- **Serious Fraud Investigation Office (SFIO):** Investigates corporate fraud under the Companies Act.

When working on India-specific compliance matters, note that entity classification drives the applicable regulatory framework — an NBFC-MFI, a Payments Bank, and a Scheduled Commercial Bank each operate under materially different capital, reserve, and compliance requirements, even though all are ultimately RBI-regulated.

---

## 2. Key Legislation

- **Prevention of Money Laundering Act, 2002 (PMLA):** India's primary AML statute. Establishes reporting obligations, defines "reporting entity," prescribes KYC requirements, and empowers attachment of proceeds of crime. Significantly amended in 2023 (via Finance Act 2023) to expand the scope of "proceeds of crime," broaden the definition of reporting entities, and tighten beneficial ownership disclosures. The PMLA Rules (2005, as amended) set out detailed KYC and reporting procedures.
- **Foreign Exchange Management Act, 1999 (FEMA):** Governs cross-border capital flows, current account and capital account transactions, and external commercial borrowings. FEMA contraventions are civil, not criminal (unlike the predecessor FERA). RBI administers FEMA. Important for correspondent banking, remittances, and trade finance compliance.
- **Banking Regulation Act, 1949:** Governs the licensing, operations, and supervision of banks. Provides RBI with broad supervisory powers.
- **Payment and Settlement Systems Act, 2007 (PSS Act):** Legal basis for RBI's oversight of payment systems, including NEFT, RTGS, UPI, and card networks.
- **RBI Master Direction on KYC, 2016 (as amended):** The operational bible for KYC compliance in India. Covers customer due diligence, ongoing monitoring, risk categorisation, simplified KYC for low-risk customers, enhanced KYC for high-risk customers, and periodic re-KYC. Updated frequently — always check for the latest amendment.
- **NBFC Master Directions:** Separate master directions govern different NBFC categories — NBFC-ND (non-deposit taking), NBFC-D (deposit taking), NBFC-MFI, NBFC-ICC, NBFC-HFC, etc.
- **Microfinance Institutions (Development and Regulation) Direction, 2022:** Governs NBFC-MFIs. Sets borrower protection standards, interest rate caps, and household income limits for microfinance lending.

---

## 3. AML/CFT Framework

When conducting AML/CFT analysis for an Indian entity, note the following operational parameters:

**Reporting to FIU-IND:**
- **Cash Transaction Report (CTR):** Required for cash transactions of INR 10 lakh (approximately USD 12,000) or above in a single day, whether a single transaction or multiple related transactions. Banks must also report suspicious series of cash transactions below this threshold.
- **Suspicious Transaction Report (STR):** Suspicion-based, no threshold. Must be filed within 7 days of arriving at a conclusion that a transaction is suspicious. Attempted transactions that are refused must also be reported.
- **Counterfeit Currency Report (CCR):** For detection of counterfeit notes.
- **Non-Profit Organisation Transaction Report (NTR):** For transactions involving non-profit organisations (a high-risk category in India for TF purposes).

**KYC Framework:**
- **Aadhaar e-KYC:** The biometric-linked Aadhaar identity system (1.4 billion enrolled) enables electronic KYC via OTP or biometric authentication. Following the 2018 Supreme Court ruling (Puttaswamy case), Aadhaar-based KYC by private entities was restricted, but subsequent amendments to the Aadhaar Act permit voluntary use for financial entities. Aadhaar e-KYC is currently permitted for banks, NBFCs, and regulated intermediaries with RBI/SEBI authorisation.
- **Video KYC (V-CIP):** RBI introduced Video Customer Identification Process in 2020 — allows KYC to be completed remotely via live video with a trained official. Widely adopted post-COVID. Permissible for account opening, loan origination, and re-KYC.
- **Simplified KYC:** For low-risk accounts (e.g., Jan Dhan accounts, small savings accounts with limited transactions), simplified KYC with basic documentation is permissible. Subject to transaction limits.
- **Central KYC (CKYC) Registry:** Operated by CERSAI (Central Registry of Securitisation Asset Reconstruction and Security Interest). Once a customer completes KYC with any financial institution and receives a CKYC number (14-digit), other institutions can retrieve the KYC data without repeating the exercise. Mandatory for new individual accounts since 2017.
- **Periodic Re-KYC:** High-risk customers every 2 years; medium-risk every 8 years; low-risk every 10 years (or when material change in circumstances).

**Beneficial Ownership:**
- Threshold: 25% or more beneficial ownership, or significant control, triggers disclosure under PMLA Rules and Companies (Amendment) Act 2020.
- Companies maintain a Register of Significant Beneficial Owners (SBO Register). Non-disclosure attracts penalties.
- RBI requires banks to identify ultimate beneficial owners of all non-individual customers at account opening and to update this information on a risk-sensitive basis.

**PEP Treatment:**
- India follows the FATF definition of politically exposed persons. Enhanced CDD applies to domestic and foreign PEPs.
- India-specific PEP categories include Members of Parliament, state legislators, senior government officials, judicial officers, senior military officers, and executives of state-owned enterprises.
- Family members and close associates of PEPs also require enhanced monitoring.

---

## 4. Digital Finance & UPI

India's digital payments infrastructure is among the most advanced globally and is directly relevant to AML/CFT compliance design.

- **Unified Payments Interface (UPI):** Operated by the National Payments Corporation of India (NPCI). Enables real-time interbank transfers via mobile phone using a virtual payment address (VPA). As of 2024, UPI processes over 10 billion transactions per month — the largest real-time payments system in the world by volume. Key participants: PhonePe (~48% market share), Google Pay (~37%), Paytm, BHIM (government app). UPI transactions are linked to bank accounts — KYC flows through the bank, not the UPI app.
- **RuPay:** India's domestic card network (alternative to Visa/Mastercard), operated by NPCI. Significant government promotion for financial inclusion.
- **IMPS (Immediate Payment Service):** 24/7 interbank push payments, higher transaction limits than UPI.
- **NEFT/RTGS:** Traditional interbank transfer systems. NEFT is batch-based (30-minute cycles, 24/7 since 2019); RTGS is real-time for high-value transfers (INR 2 lakh+).
- **Prepaid Payment Instruments (PPIs):** Wallets (e.g., Paytm Wallet, MobiKwik), gift cards, and transit cards. Governed by RBI Master Direction on PPIs. Full KYC PPIs allow higher limits; minimum detail PPIs have INR 10,000 maximum balance. AML obligations apply to PPI issuers.
- **Account Aggregator (AA) Framework:** RBI-licensed Account Aggregators (e.g., Finvu, Anumati, Perfios) enable consent-based sharing of financial data across institutions. Based on DEPA (Data Empowerment and Protection Architecture). Relevant for credit underwriting and regulatory reporting.
- **RBI Regulatory Sandbox:** Multiple cohorts completed — covering retail payments, cross-border payments, MSME lending, and prevention and mitigation of financial fraud. Governs pilot programmes for new financial products.

---

## 5. Entity Types — Critical Distinctions

Correctly classifying the entity type is essential for determining applicable compliance obligations.

| Entity Type | Key Features | AML Obligations |
|---|---|---|
| Scheduled Commercial Bank (SCB) | Full banking licence, deposit-taking and lending, SEBI/IRDAI activities permitted through subsidiaries | Full PMLA, RBI KYC Master Direction, FIU-IND reporting |
| Non-Banking Financial Company (NBFC) | Cannot accept demand deposits; lending, investment, leasing activities; very large sector (~10,000+ registered) | PMLA applies, separate NBFC Master Directions |
| Small Finance Bank (SFB) | Primarily for financial inclusion; can lend and take deposits; 75% of loans must be to priority sector | Same as SCB |
| Payments Bank | Can accept deposits up to INR 2 lakh per customer; CANNOT lend; issue debit cards only (e.g., Airtel Payments Bank, India Post Payments Bank, Jio Payments Bank) | Full KYC required; PPI-like monitoring |
| Urban Cooperative Bank (UCB) | Member-owned cooperative; dual regulation by RBI (banking) and state Registrar of Cooperatives | RBI KYC directions apply; historically weaker compliance |
| NBFC-MFI (Microfinance) | Lends exclusively to low-income borrowers; household income limits apply; interest rate caps; MFI Direction 2022 governs | PMLA, simplified KYC for eligible customers |
| Primary Agricultural Credit Society (PACS) | Cooperative credit societies; not directly RBI-regulated; significant financial inclusion gap | Limited AML oversight — a known vulnerability |

---

## 6. Compliance Nuances

- **Jan Dhan Yojana:** Government's financial inclusion scheme — over 500 million accounts opened with simplified KYC. These accounts have transaction and balance limits. Monitor for structuring patterns using Jan Dhan accounts.
- **FATF Mutual Evaluation of India (2024):** India's 2024 FATF Mutual Evaluation Report resulted in a "Regular Follow-Up" rating — a significant improvement. Key findings acknowledged India's large financial sector, strong legislative framework, and improved prosecutions. Remaining concerns include DNFBP coverage gaps, non-profit sector monitoring, and speed of confiscation.
- **DNFBP Gaps:** Real estate agents, dealers in precious metals/stones, lawyers, and accountants have limited AML obligations and supervision under India's framework — a known weakness noted by FATF.
- **India VASP Framework:** Virtual Digital Assets (VDAs) were brought under PMLA reporting obligations in 2023 — crypto exchanges and VDA service providers must register with FIU-IND and comply with KYC/AML requirements. A significant regulatory development.
- **High-Risk Jurisdictions:** India-specific cross-border risk includes hawala networks (hundi), trade-based money laundering via over/under-invoicing of goods, shell companies in offshore jurisdictions used to repatriate funds to India.

---

## 7. Transfer Pricing & Tax (for Tax/TP Modules)

- **Indian TP Rules:** Contained in Sections 92–92F of the Income Tax Act, 1961 and the Transfer Pricing Rules 2001. Broadly follow OECD Guidelines but with India-specific modifications.
- **APA Programme:** India's Advance Pricing Agreement programme (unilateral, bilateral, multilateral) has been active since 2012 and is one of the most productive globally in terms of agreements signed.
- **CBDT:** Central Board of Direct Taxes — administers income tax, TP, and international taxation policy.
- **GAAR (General Anti-Avoidance Rule):** Operative since 2017 — allows tax authorities to disregard arrangements that are primarily tax-motivated.
- **GST:** Goods and Services Tax replaced most indirect taxes in 2017. A destination-based, dual-structure tax (Central GST + State GST or Integrated GST for interstate). GSTIN (GST Identification Number) is a key identity anchor for business customers.
- **SEZs:** Special Economic Zones offer tax incentives (profit-linked deductions, customs exemptions). SEZ units and developers are significant in export-oriented industries. Note: SEZ transactions have specific transfer pricing and tax implications.
- **DTAA Network:** India has Double Taxation Avoidance Agreements with 90+ countries. Treaty-shopping is a known risk — India's Principal Purpose Test (PPT) under BEPS MLI implementation helps address this.

---

## 8. Key Terminology Glossary

| Term | Definition |
|---|---|
| PMLA | Prevention of Money Laundering Act, 2002 — India's principal AML statute |
| FEMA | Foreign Exchange Management Act, 1999 — governs cross-border flows |
| FIU-IND | Financial Intelligence Unit — India; receives STRs, CTRs from reporting entities |
| NPCI | National Payments Corporation of India; operates UPI, RuPay, IMPS, NEFT |
| UPI | Unified Payments Interface — real-time push payment system, 10B+ monthly transactions |
| CKYC | Central KYC Registry — once-only KYC for financial sector (operated by CERSAI) |
| Aadhaar | Biometric national identity number (12-digit), 1.4 billion enrolled, UIDAI-managed |
| V-CIP | Video Customer Identification Process — remote KYC via live video |
| NBFC | Non-Banking Financial Company — large and diverse lending/investment sector |
| NBFC-MFI | Microfinance-focused NBFC; lends to low-income borrowers under MFI Direction 2022 |
| Jan Dhan | Pradhan Mantri Jan Dhan Yojana — financial inclusion scheme with simplified KYC accounts |
| PPI | Prepaid Payment Instrument — mobile wallets, gift cards, transit cards |
| CTR | Cash Transaction Report — filed for INR 10 lakh+ cash transactions |
| STR | Suspicious Transaction Report — suspicion-based, no threshold |
| ED | Enforcement Directorate — investigates PMLA and FEMA violations |
| SFIO | Serious Fraud Investigation Office — investigates corporate fraud |
| DEPA | Data Empowerment and Protection Architecture — underpins Account Aggregator framework |
| VDA | Virtual Digital Asset — crypto assets; PMLA-obligated since 2023 |
| Hundi | Informal value transfer system (hawala equivalent) — significant ML risk channel |
| GSTIN | GST Identification Number — key business identifier in post-2017 India |
