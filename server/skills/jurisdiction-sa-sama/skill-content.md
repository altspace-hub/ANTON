# Jurisdictional Skill: Saudi Arabia — Saudi Central Bank (SAMA)

You are working in the Saudi Arabian financial regulatory jurisdiction. The following reference material covers the regulatory architecture, Islamic finance framework, AML/CFT obligations, and Vision 2030 digital finance landscape essential for accurate, Saudi-specific compliance work. Apply this context throughout your analysis. A foundational principle: assume all banking and financial products are Sharia-compliant unless explicitly stated otherwise.

---

## 1. Regulatory Architecture

Saudi Arabia's financial sector operates under a multi-regulator model, with SAMA at the centre.

- **Saudi Central Bank (SAMA) — مؤسسة النقد العربي السعودي:** The primary regulator for banks, insurance companies, payment service providers, money changers, and financing companies. SAMA also functions as the AML/CFT supervisory authority for the entities it licenses. SAMA issues detailed rulebooks, circulars, and frameworks — its regulations have binding legal force.
- **Capital Market Authority (CMA) — هيئة السوق المالية:** Regulates the Saudi Exchange (Tadawul), capital market intermediaries, investment funds, sukuk issuance, and securities activities. CMA AML obligations are separate from SAMA's but aligned in approach.
- **Zakat, Tax and Customs Authority (ZATCA) — هيئة الزكاة والضريبة والجمارك:** Administers Zakat (mandatory Islamic levy on wealth), corporate income tax (for non-Saudi/non-GCC shareholders), VAT (introduced 2018 at 5%, raised to 15% in 2020), and customs duties. ZATCA has become increasingly sophisticated with e-invoicing mandates and data-sharing capabilities.
- **Saudi Financial Intelligence Unit (SAFIU):** Established as an independent unit within SAMA. FATF member since 2019. Receives STRs, CTRs, and other financial intelligence reports from all reporting entities. Shares intelligence with law enforcement (Public Prosecution, Presidency of State Security).
- **Public Prosecution (النيابة العامة):** Handles ML and TF prosecutions. Coordination with SAMA/SAFIU is improving significantly post-2020.
- **General Authority for Competition (GAC):** Relevant for mergers, acquisitions, and market concentration in financial services.

When working on Saudi compliance assignments, always verify which entity type is involved — SAMA-regulated banks operate under significantly different rules than CMA-regulated investment firms, even within the same financial group.

---

## 2. Key Legislation

- **AML Law (Royal Decree No. M/31, 2012, amended 2017):** Saudi Arabia's primary AML statute. Criminalises money laundering and establishes the obligation to report suspicious transactions, conduct CDD, and maintain records. The 2017 amendments strengthened penalties and clarified beneficial ownership requirements.
- **Counter-Terrorism and its Financing Law (Royal Decree No. M/16, 2014):** Criminalises terrorist financing and establishes obligations for financial institutions to freeze assets of designated persons and entities.
- **SAMA AML/CFT Rules (as amended):** The operational framework for SAMA-regulated entities. Covers customer risk assessment, CDD, enhanced due diligence, ongoing monitoring, staff training, independent audit, and reporting obligations. Regularly updated via SAMA circulars.
- **Banking Control Law (Royal Decree No. M/5, 1966):** The foundational banking licensing and supervision statute. Has been supplemented significantly by SAMA regulations and circulars.
- **Insurance Law (Royal Decree No. M/32, 2003):** Requires all insurance to be conducted on a cooperative (takaful) basis — conventional insurance is not permitted. SAMA regulates insurance.
- **Fintech Regulatory Sandbox Framework:** Allows fintech companies to test innovative products under a regulatory waiver. Several cohorts have graduated, including BNPL, crypto asset services, and embedded finance products.
- **Vision 2030 Financial Sector Development Programme (FSDP):** Not legislation per se, but a government strategic framework with binding targets for financial sector transformation — including a target of 70% cashless transactions (exceeded), increased financial inclusion, and Tadawul becoming a top-10 global exchange.

---

## 3. AML/CFT Framework

When conducting AML/CFT analysis for a Saudi entity, apply the following parameters precisely.

**Reporting to SAFIU:**
- **Suspicious Transaction Report (STR):** Mandatory. Suspicion-based — no minimum threshold. Must be filed without delay. STR filings are confidential; tipping off is a criminal offence.
- **Cash Transaction Report (CTR):** Required for cash transactions of SAR 60,000 (approximately USD 16,000) or above. Aggregate monitoring for structuring detection is expected.
- All reports are submitted to SAFIU via the goAML system (same platform used in many FATF-member jurisdictions).

**Customer Identification and Verification:**
- **Saudi National ID (Hawieh — الهوية الوطنية):** The primary identity document for Saudi nationals. Linked to the ABSHER digital identity platform (government app providing biometric verification and digital authentication).
- **Iqama (الإقامة):** The residency permit for non-Saudi expatriates. Over 38% of Saudi Arabia's population is expatriate. All Iqama-holders require valid employer sponsorship under the Kafala system. KYC for expatriate accounts must verify Iqama validity and employer details.
- **ABSHER verification:** ABSHER-linked biometric KYC is available for account opening and customer verification — similar in concept to India's Aadhaar e-KYC. SAMA has approved ABSHER-based remote onboarding for banks and fintech companies.
- **PEP Treatment:** Saudi Arabia defines PEPs broadly, including members of the royal family, ministers, senior military officers, senior executives of government-owned enterprises, and their immediate family members and close associates. Enhanced CDD is mandatory. SAMA examiners pay particular attention to PEP account management.
- **Beneficial Ownership:** Saudi AML Law requires disclosure of ultimate beneficial owners (25%+ threshold for legal persons). Corporate shareholders require look-through analysis. Ministry of Commerce beneficial ownership registry is in development.
- **Hawala:** Saudi Arabia is a major hub for hawala/hundi activity, driven by large South Asian and Southeast Asian remittance flows. All hawala providers must be licensed by SAMA as Registered Hawala Providers (RHPs). Unlicensed hawala activity is illegal and subject to criminal prosecution. Licensed RHPs have full AML/CFT obligations including SAFIU reporting.

---

## 4. Islamic Finance — The Dominant Framework

This is the most critical contextual factor when working in Saudi Arabia. Approximately 85% of Saudi banking assets are Sharia-compliant, and ALL licensed banks must maintain a Sharia Supervisory Board. When analysing any Saudi banking product, financing structure, or transaction, apply Islamic finance principles by default.

**Core Islamic Finance Products:**

- **Murabaha (مرابحة) — Cost-Plus Sale:** The dominant financing structure in Saudi Arabia (~70-75% of all financing). The bank purchases an asset at cost and resells it to the customer at a disclosed mark-up, payable in instalments. Used for property, vehicles, consumer goods, and corporate financing. Crucially, the bank must briefly hold title to the asset before selling — this has AML implications for beneficial ownership and transaction monitoring.

- **Tawarruq (تورق) — Commodity Murabaha:** The bank purchases a commodity (typically on a commodity exchange), sells it to the customer on credit at a mark-up, and the customer immediately sells it for cash to a third party. Used extensively for personal financing and liquidity management. Controversial among some Sharia scholars but widely used in Saudi banking. Note: when reviewing personal finance portfolios, Tawarruq is likely the underlying structure.

- **Ijara (إجارة) — Leasing:** Sharia-compliant leasing arrangement. Bank purchases and leases an asset to the customer. At lease end, ownership may transfer (Ijara Wa Iqtina — finance lease) or not (operating ijara). Used heavily for real estate, vehicles, and equipment.

- **Musharakah / Diminishing Musharakah (مشاركة متناقصة):** Partnership financing where the bank and customer jointly own an asset. The customer gradually buys out the bank's share. Used for home and business financing. Less common than Murabaha but growing.

- **Sukuk (صكوك) — Islamic Bonds:** Asset-backed or asset-based certificates representing ownership or right to assets/cash flows. Saudi Arabia and Nasdaq Dubai are the world's largest sukuk listing venues. Saudi Government sukuk (domestically denominated) are a key instrument for sovereign financing. Critical for any capital markets or structured finance work in Saudi Arabia.

- **Takaful (تكافل) — Cooperative Insurance:** All insurance in Saudi Arabia is conducted on a cooperative (Takaful) model — contributions are pooled, and profits/surpluses are distributed among participants. Conventional insurance (premium-based, profit-retained by insurer) is prohibited. SAMA regulates all insurance companies under the Cooperative Insurance framework.

**Sharia Governance:**
- Every SAMA-licensed bank must have a Sharia Supervisory Board (SSB) — typically 3-7 senior Islamic scholars. The SSB reviews and certifies all products and must be consulted before any new product launch.
- SAMA's Higher Sharia Authority provides centralised Sharia governance guidance, reducing divergence between individual bank SSBs.
- All fatwas (religious opinions) from SSBs are documented and retained. Non-compliance with SSB decisions is a serious governance risk.

---

## 5. Digital Finance & Vision 2030

Saudi Arabia has undergone a rapid digital payments transformation under Vision 2030.

- **Saudi Payments:** The national payment infrastructure operator. Operates mada (national debit/ATM card network), the Saudi Fast Payments System (Sarie), and point-of-sale infrastructure.
- **mada (مدى):** Saudi Arabia's domestic debit card and payment network — interoperable with international networks. Virtually all merchants accept mada.
- **Sarie (سريع):** The instant payment system for retail transfers (launched 2021). Operates 24/7. Comparable to UK Faster Payments or India's UPI. Interoperable with IBAN-based bank transfers.
- **Sadad (سداد):** Bill payment platform — allows consumers to pay government fees, utilities, and telecom bills through their bank. Widely used.
- **STC Pay / STC Bank:** Originally launched as a digital wallet, STC Pay received a banking licence from SAMA in 2021 and rebranded as STC Bank — Saudi Arabia's first digital bank. Significant customer base (~10 million users).
- **SAMA Fintech Lab:** Facilitates engagement between SAMA and fintech startups. Open Banking Framework launched 2022 — enabling third-party providers to access customer data with consent.
- **BNPL:** Buy-Now-Pay-Later is actively used and being regulated — SAMA issued BNPL guidelines in 2023, requiring BNPL providers to be licensed and limiting exposure.
- **Crypto:** Not yet fully regulated for retail, but SAMA and CMA have issued a framework for digital assets in the capital markets context. Saudi Arabia is participating in Project mBridge (CBDC cross-border pilot with BIS, China, UAE, Hong Kong). Expect further regulatory developments.

---

## 6. Labour / Kafala System

The Kafala (كفالة) system — though being reformed under Vision 2030 — links expatriate workers' legal status to their employer sponsor. This has compliance implications.

- **Wage Protection System (WPS):** Mandatory salary payment through the banking system for private sector employees. All companies with 10+ employees must use WPS-registered bank accounts. Non-compliance leads to licence suspension. WPS creates a compliance-relevant data trail for payroll transactions.
- **Saudization (Nitaqat — نطاقات):** Labour localisation programme requiring minimum percentages of Saudi national employees in different business sectors. Non-compliant companies face restrictions on government services and licensing. Relevant for client due diligence when assessing a corporate customer's operational legitimacy.

---

## 7. GCC Cross-Border Context

- **GCC Common Market:** Saudi Arabia is a founding member of the Gulf Cooperation Council. Relatively free movement of capital and services among GCC states (Bahrain, Kuwait, Oman, Qatar, UAE). GCC national identity documents are acceptable KYC for each other's citizens.
- **AFAQ:** The GCC's instant cross-border payment system (in development). Once operational, will allow real-time transfers across GCC member states using local currency.
- **Remittance Corridors:** Saudi Arabia is the world's second-largest source of remittances (~USD 35-40 billion annually). Primary corridors: India, Pakistan, Bangladesh, Egypt, Philippines, Yemen. Licensed exchange houses (regulated by SAMA) are the primary formal channel. Hawala remains a significant informal alternative — a key ML/TF risk area.
- **Correspondent Banking:** Saudi banks maintain extensive correspondent relationships for trade finance and cross-border payments, particularly for emerging market corridors. De-risking by Western correspondent banks remains an issue — a topic of active engagement between SAMA and international banking bodies.

---

## 8. Key Terminology Glossary

| Term | Definition |
|---|---|
| SAMA | Saudi Central Bank — primary financial regulator for banks, insurance, payments |
| SAFIU | Saudi Arabia Financial Intelligence Unit — receives STRs/CTRs, FATF member |
| CMA | Capital Market Authority — regulates securities, sukuk, investment funds |
| ZATCA | Zakat, Tax and Customs Authority — Zakat, corporate tax, VAT, customs |
| Murabaha | Cost-plus sale — dominant Islamic financing structure (~75% of all financing) |
| Ijara | Islamic leasing — bank purchases and leases asset to customer |
| Musharakah | Partnership financing — joint ownership with gradual customer buyout |
| Tawarruq | Commodity Murabaha — used for personal financing and liquidity; controversial in some schools |
| Sukuk | Islamic bonds — asset-backed/based certificates; Saudi Arabia is a global sukuk hub |
| Takaful | Cooperative Islamic insurance — the only permitted insurance model in Saudi Arabia |
| Sharia Board (SSB) | Mandatory Islamic scholars' body at every licensed bank; certifies all products |
| Kafala | Employer-sponsorship system governing expatriate workers' legal status |
| Iqama | Expatriate residency permit — primary KYC document for non-Saudi residents |
| ABSHER | Government digital identity app; enables biometric KYC verification |
| Nitaqat | Saudization / labour localisation programme with sector quotas |
| mada | Saudi national debit card and payment network |
| Sarie | Saudi instant payments system (24/7 real-time retail transfers) |
| Sadad | Bill payment platform for utilities, government fees, telecom |
| Hawala | Informal value transfer; legal only if SAMA-registered as RHP |
| RHP | Registered Hawala Provider — SAMA-licensed hawala operator |
| Zakat | Mandatory Islamic wealth levy (2.5% on qualifying assets) — administered by ZATCA |
| WPS | Wage Protection System — mandatory salary payment through banking channels |
