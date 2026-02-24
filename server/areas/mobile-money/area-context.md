# Mobile Money & Digital Finance — Area Context

## Domain Landscape

Mobile money has become the primary financial system for over one billion people who lack access to traditional banking. Originating with M-Pesa's launch in Kenya in 2007, mobile money has evolved from a simple peer-to-peer transfer mechanism into a comprehensive digital financial services platform spanning payments, savings, credit, insurance, and cross-border remittances.

As of 2024, the GSMA State of the Industry Report records 1.75 billion registered mobile money accounts globally, processing over $1.4 trillion in transactions annually. The sector spans over 100 countries and is growing at approximately 13% per year by transaction value.

## Key Markets and Operators

**Sub-Saharan Africa** dominates global mobile money activity, accounting for approximately 70% of total transaction value. East Africa pioneered the model:
- **Kenya** — M-Pesa (Safaricom/Vodafone), the global benchmark, serving 30M+ customers with 99% of Kenya's adult population within 5km of an agent
- **Tanzania** — M-Pesa, Tigo Pesa, Airtel Money; 60%+ mobile money penetration
- **Uganda/Ghana** — MTN Mobile Money and Airtel Money as dominant operators in each market

West Africa has seen rapid growth driven by **MTN MoMo** across Nigeria, Ghana, Ivory Coast, and Cameroon, and **Orange Money** across Francophone Africa.

**South and Southeast Asia** represent the second major growth axis:
- **Bangladesh** — bKash (brac Bank subsidiary) with 65M+ registered users; one of the most concentrated mobile money markets globally
- **Pakistan** — Easypaisa (Jazz/Telenor) and JazzCash under SBP oversight
- **Philippines** — GCash (Globe) and Maya (PLDT) driving financial inclusion in an archipelago with limited branch infrastructure
- **India** — Paytm, PhonePe, and Google Pay operating under the UPI interoperability framework regulated by the Reserve Bank of India and NPCI

## Regulatory Evolution

Mobile money regulation has matured from an unregulated or telco-regulated environment toward dedicated payment service or e-money issuer frameworks:

- **Kenya** — National Payment System Act 2011, CBK Prudential Guidelines for Payment Service Providers; revised framework under CBK Act amendments 2021
- **Nigeria** — CBN Framework for Mobile Money Services 2021; Payment Service Bank Guidelines; NIBSS interoperability mandate
- **Ghana** — Payment Systems and Services Act 2019 (Act 987); Bank of Ghana payment service provider licences (PSP Tier 1-3)
- **Bangladesh** — Bangladesh Bank Mobile Financial Services Regulations 2018; agent banking guidelines
- **Philippines** — BSP Circular 649 (e-money) and National Retail Payment System framework; EMI licensing under BSP
- **EU** — Payment Services Directive 2 (PSD2) and Electronic Money Directive (EMD2) for e-money institutions; now transitioning to PSD3/PSR

## GSMA Industry Standards

The GSMA Mobile Money programme publishes the definitive industry standards framework:
- **GSMA Code of Conduct for Mobile Money Providers** — voluntary baseline on consumer protection, AML, agent management
- **GSMA Mobile Money API** — technical interoperability standard
- **GSMA MMU AML/CFT Toolkit** — operational guidance for compliance programmes in developing markets
- **GSMA Interoperability Framework** — bilateral and hub-based models (AfricaNenda Fast Payment Systems)

## AML/CFT Challenges Specific to Mobile Money

Mobile money presents a distinct AML/CFT risk profile that differs materially from traditional banking:

**Tiered KYC** is the central compliance mechanism. Most regulators permit three tiers:
- Tier 1 (basic identity, e.g. national ID): low limits (e.g. $200/day, $500/month)
- Tier 2 (enhanced ID, proof of address): medium limits
- Tier 3 (full KYC equivalent): higher or unrestricted limits

**Agent networks** introduce a unique risk dimension: agents perform in-person customer onboarding and cash-in/cash-out, creating a distributed and difficult-to-supervise front line. Agent fraud, KYC forgery, and liquidity manipulation are documented typologies.

**Transaction monitoring** at mobile money scale (millions of micro-transactions per day) requires automated, rules-based systems calibrated to the micro-transaction context rather than wholesale banking thresholds.

FATF has classified mobile money operators as Money or Value Transfer Services (MVTS) under Recommendation 14, with additional wire transfer obligations under Recommendation 16 (Travel Rule) for cross-border flows.

## Cross-Border Mobile Payments

Cross-border mobile money has grown rapidly with remittance corridors such as Kenya-Tanzania, Ghana-UK, and Bangladesh-Gulf States. Key frameworks:
- **FATF R.16** — Wire Transfer Rule: originator and beneficiary information must travel with every cross-border transfer
- **GSMA MMU International Transfer Guidelines** — bilateral and hub-based corridor arrangements
- **AfricaNenda** — non-profit promoting inclusive instant payment systems across Africa
- **EAC Payment and Settlement Systems Integration Project** — East African Community interoperability initiative
- **ECOWAS Payments Integration** — West African regional framework under BCEAO

## Key Terminology

- **MMO** — Mobile Money Operator
- **MNO** — Mobile Network Operator
- **EMI** — E-Money Institution (regulatory licence category)
- **PSP** — Payment Service Provider
- **CICO** — Cash-In / Cash-Out (agent transaction types)
- **PAR** — Portfolio At Risk (also used in mobile credit)
- **MVTS** — Money or Value Transfer Service (FATF classification)
- **Travel Rule** — FATF Recommendation 16: information accompanying wire transfers
- **Interoperability** — ability for customers of different operators to transact with each other
