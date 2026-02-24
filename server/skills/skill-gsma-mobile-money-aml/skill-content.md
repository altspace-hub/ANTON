# Domain Skill: Mobile Money AML/CFT (GSMA Guidelines)

You possess comprehensive expertise in the AML/CFT compliance framework for mobile money services, including GSMA guidance, tiered KYC design, agent due diligence, transaction monitoring, and mobile-money-specific ML/TF typologies. Apply this knowledge whenever mobile money, digital wallets, agent banking, or mobile financial services compliance are relevant to the analysis.

---

## 1. GSMA and the Mobile Money Industry

**GSMA (Global System for Mobile Communications Association)** represents 750+ mobile network operators worldwide and nearly 400 companies in the broader mobile ecosystem. Its Mobile Money programme functions as the principal industry body for mobile money AML/CFT standards, regulatory engagement, and compliance guidance.

**Mobile money at scale (2024 data):**
- 1.75 billion registered mobile money accounts globally.
- 315+ live mobile money services across 97 countries.
- Approximately USD 1.4 trillion in annual transaction value.
- Daily transaction volume exceeds USD 3.8 billion.
- Sub-Saharan Africa accounts for approximately 70% of global mobile money transaction value and 64% of registered accounts.

**Dominant operators and services:**
- East Africa: M-Pesa (Safaricom/Vodacom — Kenya, Tanzania, Ethiopia, DRC, Egypt, Ghana, Lesotho, Mozambique); Airtel Money; MTN MoMo.
- West Africa: Orange Money (Francophone West Africa); Wave (Senegal, Ivory Coast — wallet-only, no cash-in/out at branches); MTN MoMo (Ghana, Nigeria, Cameroon); Airtel Money.
- Southern Africa: Ecocash (Zimbabwe); M-Pesa (Tanzania, Mozambique); MTN MoMo.
- South and Southeast Asia: bKash (Bangladesh — 70M+ users, the world's largest single-country mobile money service); Nagad (Bangladesh); JazzCash, EasyPaisa (Pakistan); GCash, Maya (Philippines).
- Latin America: Tigo Money, various operator wallets.

**Why mobile money creates distinct AML/CFT challenges:**
- Transactions are small individually but enormous in aggregate volume — making rule-based transaction monitoring difficult to calibrate without generating massive false positive rates.
- A large proportion of users are unbanked, with no prior financial footprint against which to establish a behavioural baseline.
- Agent networks are geographically dispersed and difficult to supervise.
- KYC standards vary significantly across markets, creating regulatory arbitrage between corridors.
- Real-time nature means suspicious transactions may be completed before any monitoring alert is generated.

---

## 2. Tiered KYC — The Core Mobile Money Compliance Model

**GSMA's foundational position:** Proportionate, risk-based tiered KYC is the model that best achieves the dual objective of financial inclusion and AML/CFT compliance. Full bank-grade KYC as a precondition for any mobile money access excludes the poorest and most vulnerable customers who are precisely those most likely to lack formal identity documents.

**GSMA advocacy and outcomes:** GSMA has engaged regulators in 40+ markets to shift from a blanket full-KYC requirement to a tiered model. Countries that have adopted tiered KYC for mobile money include Kenya, Tanzania, Ghana, Uganda, Bangladesh, Pakistan, Rwanda, and Senegal. This policy change is directly credited with enabling mass-market account growth.

### Standard Three-Tier Model

**Tier 1 — Basic / Minimal KYC:**
- Identity data collected: Mobile phone number + full name + national ID number (not document verified; number self-declared).
- Or in lower-documentation markets: mobile number + name only.
- No document inspection or verification required at Tier 1.
- Applicable transaction limits (illustrative, vary by market):
  - Maximum single transaction: USD 50–200 equivalent
  - Maximum daily outflow: USD 100–300 equivalent
  - Maximum monthly cumulative: USD 200–500 equivalent
  - Maximum account balance: USD 100–200 equivalent
- Use case: Cash-in, cash-out, peer-to-peer transfers, bill payments within limits.
- Financial inclusion rationale: Serves unbanked individuals who cannot provide government-issued photo ID, including rural subsistence farmers, day labourers, elderly, women in low-documentation markets.
- AML/CFT rationale: Low transaction limits cap the financial crime exposure per account. ML at scale through Tier 1 accounts requires massive account volume, making network detection feasible.

**Tier 2 — Verified KYC:**
- Identity data collected: Full name, date of birth, national ID number AND identity document physically inspected (original) or digitally verified (e-KYC where available).
- Verification method: Agent in-person inspection; national ID database check (where available); biometric verification (where national biometric ID system exists).
- Transaction limits (illustrative):
  - Maximum single transaction: USD 200–1,000 equivalent
  - Maximum daily outflow: USD 500–2,000 equivalent
  - Maximum monthly cumulative: USD 1,000–5,000 equivalent
  - Maximum account balance: USD 500–2,000 equivalent
- Typical target segment: Regular wage earners, small traders, merchants.

**Tier 3 — Full CDD:**
- All Tier 2 requirements plus: address verification (utility bill, tenancy agreement), source of funds documentation for large transactions, enhanced due diligence for PEPs or high-risk customers.
- In practice, Tier 3 aligns to bank-standard KYC.
- Transaction limits: Often equivalent to bank account limits in the jurisdiction.
- Typical target segment: Business accounts, high-value personal users, PEPs, high-risk customers.

**Regulatory implementation:** Each market's central bank or financial regulator sets the specific transaction limits and identity requirements for each tier. GSMA's role is to advocate for the tiered model and provide technical guidance on how to implement it in ways that satisfy both FATF requirements and financial inclusion objectives.

---

## 3. Agent Due Diligence and Oversight

Mobile money agents are the physical distribution network — they enable cash-in and cash-out transactions for customers who are not online. The quality of the agent network is the single most critical operational control in the mobile money AML/CFT system.

**Agent profile and role:**
- Typically small retail businesses: pharmacies, airtime shops, petrol stations, market traders, supermarkets.
- Agents hold a "float" of e-money and physical cash, exchanging one for the other on behalf of customers.
- In dense urban markets, agent density may reach 50+ per square kilometre. In rural areas, an agent may serve a 30km radius.

**GSMA Agent Management Toolkit — key requirements:**

**Pre-onboarding due diligence:**
- Business registration verification (formal registration documents or equivalent informal business identity documentation where formal registration is uncommon).
- Principal agent identity verification (full Tier 2 or Tier 3 KYC on the human behind the business).
- Negative-list screening: national criminal records, UN sanctions lists, OFAC SDN list, domestic PEP databases.
- Reference checks in high-risk or remote locations.
- Physical site visit or verification (in some models).

**Agent agreement:**
- Written contract specifying AML/CFT obligations: prohibited transactions, reporting obligations, customer KYC responsibilities, record-keeping requirements.
- Express prohibition on agents performing KYC on behalf of the operator (agents can collect but not assess documents) — document review with verification is a controlled function.
- Liability: operator remains legally responsible for agent acts. This drives the operational imperative for robust agent monitoring.

**Ongoing agent monitoring:**
- Transaction monitoring by agent: automated flags for unusual cash-in/cash-out ratios (agent account receiving far more cash-in than cash-out suggests it is being used as a pass-through); unusually high transaction velocities; unusual customer concentration (same customer transacting multiple times per day).
- Mystery shopping: compliance team or third-party testers verify agent adherence to KYC procedures, prohibited transaction rules, and customer identification requirements.
- Periodic agent re-due-diligence: annually or on material change.
- Agent complaint mechanism: enables customers to report agent misconduct.
- Sanctions for non-compliant agents: suspension, contract termination, reports to regulator.

**High-risk agent categories:**
- Agents in border areas: elevated structuring and cross-border ML risk.
- Agents in cash-intensive sectors: money changers, petrol stations, market traders have higher exposure to criminal proceeds presented as legitimate business cash.
- Agents with rapidly growing transaction volumes inconsistent with declared business size.
- Agents showing high concentrations of transactions to or from specific high-risk counterparties.

---

## 4. Transaction Monitoring for Mobile Money

**Core challenges unique to mobile money:**
- Transaction volumes are orders of magnitude higher than equivalent bank account portfolios.
- Average transaction size is very small (often USD 5–50), meaning individual transactions are rarely suspicious; patterns and network effects drive detection.
- New-to-finance users have no prior financial history baseline.
- Real-time settlement in most markets means suspicious transactions are completed before manual review.

**Standard rule-based TM approach for mobile money:**

**Velocity rules:**
- P2P transaction count exceeding X in a rolling Y-hour window (e.g., more than 20 P2P transfers in 24 hours).
- Cash-out volume exceeding X within Y hours of receipt of funds.
- Multiple small cash-in transactions followed immediately by a single large outward transfer (structuring pattern).

**Cash-in/cash-out ratio rules (for agents and customers):**
- Agent account showing cash-in:cash-out ratio exceeding 5:1 or below 1:5 over a rolling period (suggests the agent is primarily serving laundering activity rather than balanced customer cash conversion).
- Customer account receiving large cash-in transactions at multiple agents in a short time window (account aggregation for structuring purposes).

**Dormancy followed by sudden activity:**
- Account dormant for 90+ days suddenly receiving large inflows and immediately outflowing. A common typology for accounts created for ML/TF but inactive until needed.

**Network/cluster analysis:**
- Group of accounts with no apparent relationship transacting in a circular pattern (A sends to B, B sends to C, C sends back to A) — layering typology.
- Multiple accounts sending small amounts to a single recipient account (structuring aggregation; common in terrorism financing small-amount collection).
- Single account sending to a large number of previously unrelated accounts in a short time (possible disbursement of criminal proceeds).

**Geographic risk rules:**
- Transactions involving cross-border mobile money services to/from FATF grey/black listed jurisdictions trigger EDD requirement.
- Transactions routed through agents in border areas combined with counterparty location in adjacent high-risk country.

---

## 5. SIM Registration and Its AML/CFT Role

**Why SIM registration matters for mobile money AML:**
SIM registration — requiring customers to register their national identity documentation before activating a SIM card — provides the identity anchor that makes mobile money KYC possible. Without SIM registration, a mobile money account cannot be meaningfully linked to a real person. Most mobile money markets have implemented mandatory SIM registration, typically enforced by the telecoms regulator.

**SIM registration models:**

**Basic SIM registration:** Customer provides name and national ID number at point of SIM purchase. Typically self-declared, no document verification. Provides a starting-point identity link but weak verification.

**Biometric SIM registration:** Customer provides fingerprint, iris scan, or facial biometric at point of SIM registration, linked to a national biometric identity database. Strong identity verification — used in Ghana (since 2012, linked to Ghana Card), Nigeria (NIN-SIM linkage, 2020–2022), and Kenya (NIIMS/Huduma Namba programme). Provides the foundation for strong mobile money KYC.

**Challenges:**
- ID document quality varies across markets: damaged cards, expired documents, inconsistent naming conventions across different official documents.
- Undocumented populations (refugees, stateless persons, remote rural communities) cannot register and are excluded.
- SIM swap fraud: criminals obtain a replacement SIM for a victim's number, intercepting OTP-based authentication and taking over the mobile money account. Requires robust SIM swap controls (e.g., cooling-off period, biometric re-verification before SIM replacement).

---

## 6. Cross-Border Mobile Money AML/CFT

**GSMA Cross-Border Compliance Guidelines:** Published to address the growing volume of cross-border mobile money transactions, particularly in Africa where mobile money operators in adjacent countries have established interoperability agreements.

**Active cross-border mobile money corridors:**
- Kenya ↔ Uganda ↔ Tanzania (M-Pesa interoperability, Airtel-Airtel cross-border).
- Ghana ↔ Ivory Coast ↔ Senegal (Orange Money, MTN MoMo, Wave interconnection).
- Senegal ↔ Mali ↔ Burkina Faso (Wave and Orange Money significant cross-border flows).
- Tanzania ↔ DRC: high-volume, elevated risk given DRC's FATF status and conflict context.
- Bangladesh → India: bKash-to-IMPS corridor; significant unregulated parallel corridor also exists.

**Compliance challenges in cross-border transactions:**
- **Regulatory mismatch:** The sending country may have Tier 2 KYC standards while the receiving country has only Tier 1. The receiving operator cannot verify the KYC quality applied at the sending end.
- **AML/CFT obligation jurisdiction:** When money moves from Country A's mobile money system to Country B's, who bears the STR obligation? GSMA guidance assigns primary responsibility to the operator in the country where the suspicious activity originates.
- **Currency conversion risk:** Cross-border transactions involve FX conversion, often at unregulated rates, creating an additional layer of opacity.
- **Interoperability hubs:** Some cross-border models route through a central hub (e.g., GSMA Mobile Money API standard). Hub operators also bear AML/CFT responsibilities.

---

## 7. Financial Inclusion and AML/CFT — Complementary, Not in Conflict

A common misconception is that strong AML/CFT controls and financial inclusion are in tension. GSMA's core advocacy position — supported by FATF Guidance on Financial Inclusion (2013, updated 2020) and the World Bank — is that they are complementary:

**The inclusion argument:**
- Bringing unbanked individuals into the formal financial system makes ML/TF activity MORE detectable, not less. Criminals prefer cash precisely because it is untrackable.
- Tiered KYC enables low-risk customers to access basic services while retaining the ability to escalate scrutiny as accounts grow.
- Exclusion of underserved populations from formal financial services pushes them toward hawala, cash couriers, and other informal channels that are genuinely undetectable.

**FATF position:** FATF explicitly recognises that "the exclusion of certain customers from the formal financial sector can itself be a risk factor, as it drives those customers to use informal and unregulated methods." FATF Guidance on Financial Inclusion explicitly endorses tiered KYC as a risk-based, proportionate approach consistent with the Recommendations.

**Practical calibration:** The AML risk of a Tier 1 mobile money account with a USD 500 monthly transaction limit is structurally limited. The amount of money that can be laundered through such an account is bounded by the limit. Setting limits based on empirical risk analysis (rather than regulatory conservatism) allows maximum inclusion at minimum ML/TF risk.

---

## 8. Notable ML/TF Typologies in Mobile Money

**Structuring through multiple accounts:**
Multiple registered accounts (across different registered names, sometimes using stolen identity data) used to aggregate funds below detection thresholds before consolidating into a single recipient account. Detected through network analysis.

**Agent-facilitated layering:**
An agent transacts on behalf of multiple anonymous customers, aggregating funds through the agent's own account before moving to final destinations. Appears in East African typologies; also documented by AUSTRAC in Pacific island mobile money corridors.

**Ransom and extortion payments:**
Mobile money used for ransom payment in kidnapping cases due to speed and difficulty of reversal. M-Pesa used in documented Kenyan kidnapping cases. Specific TM rules for rapid large-value person-to-person transfers to new counterparties assist detection.

**Terrorism financing — small amount collection:**
Multiple small P2P transfers from a dispersed network of sympathisers to a central account, then outbound cross-border transfer. Individually below detection thresholds; network analysis and destination risk rules are the primary detection mechanisms.

**Mobile money fraud vs. ML — important distinction:**
The majority of suspicious mobile money activity is fraud (SIM swap, agent fraud, phishing) rather than professional ML. Compliance teams must distinguish: fraud typologies have different detection mechanisms and investigative pathways than ML typologies. Conflating the two dilutes the quality of STRs filed.

---

## 9. Key Reference Documents

- GSMA Mobile Money: AML/CFT Compliance Toolkit (2019 edition)
- GSMA Mobile Money: Agent Management Toolkit
- GSMA Mobile Money: Cross-Border Payments Compliance Guidelines
- GSMA State of the Industry Report on Mobile Money (annual — most recent 2024)
- FATF Guidance on Financial Inclusion (2013, updated 2020)
- FATF Guidance on Digital Identity (2020)
- FATF Guidance on Mobile Payments (2013)
- World Bank: Mobile Money for the Unbanked (annual data and research)
- UNCDF: Mobile Money, Financial Inclusion, and Development — case studies
- Alliance for Financial Inclusion (AFI): Proportionate AML/CFT Regulation and Supervision for Financial Inclusion Policy Framework
