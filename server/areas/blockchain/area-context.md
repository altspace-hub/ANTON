# Crypto & Blockchain Compliance — Area Context

## Domain Overview

The digital asset sector has moved from regulatory grey zone to fully regulated territory in the EU with the entry into force of the Markets in Crypto-Assets Regulation (MiCA, Regulation 2023/1114) and the Transfer of Funds Regulation (TFR, Regulation 2023/1113). This area covers the full compliance lifecycle for entities operating in crypto and digital assets: from authorisation and licensing through AML/CFT programme design, transaction investigation, risk assessment, and navigating the complex DeFi and NFT regulatory frontier.

## Primary Regulatory Framework

### EU Architecture
| Instrument | Scope | Application Date |
|---|---|---|
| MiCA — Regulation (EU) 2023/1114 | CASPs, EMT/ART/utility token issuers | Stablecoins: 30 Jun 2024; CASPs: 30 Dec 2024 |
| TFR — Regulation (EU) 2023/1113 (Transfer of Funds) | CASP transfers of crypto-assets | 30 Dec 2024 |
| AMLR — Regulation (EU) 2024/1624 | All obliged entities incl. CASPs | Phased from 2027 (CASPs earlier under AMLD6) |
| AMLD6 — Directive (EU) 2018/843 | VASPs as obliged entities | In force (transitioning to AMLR) |
| DORA — Regulation (EU) 2022/2554 | ICT risk for financial entities incl. CASPs | 17 Jan 2025 |
| DLT Pilot Regime — Regulation (EU) 2022/858 | Tokenised financial instruments | In force (pilot) |
| MiFID II | Crypto qualifying as financial instruments | In force |

### International Standards
- **FATF Recommendation 15** — VASPs must apply AML/CFT measures equivalent to other financial institutions
- **FATF Guidance on Virtual Assets and VASPs** (2021, updated 2023) — Typologies, VASP due diligence, Travel Rule implementation
- **IOSCO Policy Recommendations for Crypto and Digital Asset Markets** (2023) — Same activity, same risk, same regulation
- **FSB Crypto-Asset Activities Framework** (2023) — Global baseline
- **Basel Committee** — Prudential treatment of banks' crypto exposures (Group 1 / Group 2 / Group 2b)

## Key Entity Types

| Entity | Definition | Primary Regulation |
|---|---|---|
| CASP | Crypto-Asset Service Provider authorised under MiCA Title V | MiCA Title V, TFR, AMLR |
| VASP | Virtual Asset Service Provider (pre-MiCA / non-EU term) | FATF R15, national AML law |
| EMT Issuer | E-Money Token issuer (single fiat peg) — must be EMI or bank | MiCA Title IV |
| ART Issuer | Asset-Referenced Token issuer (multi-asset / basket peg) | MiCA Title III |
| Utility Token Offeror | Offeror of tokens giving access to goods/services | MiCA Title II |
| DeFi Protocol | Decentralised protocol — may be exempt if "fully decentralised" | MiCA Art. 2(4) — contested |

## CASP Services Under MiCA (Art. 3(1)(16))
1. Custody & administration of crypto-assets on behalf of clients
2. Operation of a trading platform for crypto-assets
3. Exchange of crypto-assets for funds
4. Exchange of crypto-assets for other crypto-assets
5. Execution of orders for crypto-assets on behalf of clients
6. Placing of crypto-assets
7. Reception and transmission of orders for crypto-assets on behalf of clients
8. Providing advice on crypto-assets
9. Portfolio management of crypto-assets
10. Providing transfer services for crypto-assets on behalf of clients

## Key Terminology

- **MiCA** — Markets in Crypto-Assets Regulation (EU) 2023/1114
- **CASP** — Crypto-Asset Service Provider (MiCA term for regulated exchange, wallet, broker, etc.)
- **VASP** — Virtual Asset Service Provider (FATF / pre-MiCA term; broadly equivalent to CASP)
- **EMT** — E-Money Token (stablecoin pegged to single official currency)
- **ART** — Asset-Referenced Token (stablecoin pegged to basket of currencies/assets)
- **TFR** — Transfer of Funds Regulation — the EU Travel Rule for crypto
- **Travel Rule** — Obligation to pass originator/beneficiary data with crypto transfers (FATF R.16 for crypto)
- **Unhosted wallet** — Wallet not held with a regulated CASP (self-custody)
- **DeFi** — Decentralised Finance — protocol-based financial services without a central intermediary
- **NFT** — Non-Fungible Token — unique digital asset (may or may not fall under MiCA)
- **AMM** — Automated Market Maker — DeFi exchange model using liquidity pools
- **RWA** — Real-World Asset tokenisation — tokenised bonds, equities, real estate on blockchain
- **FATF grey/black list** — Jurisdictions with strategic deficiencies in AML/CFT (International Co-operation Review Group)
- **Nested exchange** — High-risk exchange embedded within a compliant exchange's infrastructure
- **Blockchain analytics** — Tools (Chainalysis, Elliptic, TRM) that trace transactions and attribute wallet addresses

## Analytical Principles

1. **MiCA is EU-directly-applicable** — no national transposition needed; however NCAs add national nuances
2. **Substance over form** — regulators look through labels (a "utility token" that pays dividends may be a security)
3. **Cite articles precisely** — MiCA has 149 articles; always specify which article imposes which obligation
4. **Distinguish binding vs. guidance** — MiCA "shall" provisions vs. ESMA/EBA guidelines ("should")
5. **Travel Rule is zero-threshold** — no de minimis for crypto (unlike €1,000 threshold for traditional wire transfers)
6. **DeFi remains unsettled** — be explicit about regulatory ambiguity; do not overstate the clarity of the rules
7. **FATF standards inform EU law** — EBA guidelines consistently reference FATF guidance; treat FATF as highly persuasive even where not binding
8. **Blockchain analytics are probabilistic** — risk scores and cluster attributions carry uncertainty; always caveat
