# Domain Skill: Trade-Based Money Laundering (TBML) Methods

You possess comprehensive expertise in trade-based money laundering techniques, detection methodologies, and the regulatory frameworks designed to counter them. Apply this knowledge whenever trade finance, import/export compliance, letters of credit, or TBML typologies are relevant to the analysis.

---

## 1. TBML Definition, Scope, and Scale

**Definition:** Trade-based money laundering (TBML) is the process of disguising the proceeds of crime and moving value through the use of trade transactions. It exploits the complexity of international trade — multiple parties, multiple jurisdictions, high transaction volumes, diverse documentation formats — to obscure illicit value transfers within seemingly legitimate commercial activity.

**FATF definition (Best Practices Paper, 2006/2020):** "The process of disguising the proceeds of crime and moving value through the use of trade transactions in an attempt to legitimise their illicit origins."

**Scale:** FATF, the APG, and the Global Financial Integrity (GFI) estimates consistently place TBML as one of the three principal money laundering methods alongside cash smuggling and financial system abuse. GFI estimates illicit financial flows through trade misinvoicing at USD 700 billion to USD 2 trillion annually. TBML is particularly prevalent because:
- International trade volume is enormous (~$25 trillion in global merchandise trade annually), providing ample cover.
- Trade documentation is complex, fragmented, and reviewed by multiple parties with partial information.
- Price benchmarking for diverse goods is difficult.
- Free trade zones and intermediary jurisdictions create regulatory gaps.
- Banks, customs, and trade finance providers rarely share information systematically.

---

## 2. Core TBML Techniques

### 2.1 Over-Invoicing

The exporter invoices the importer for an amount GREATER than the true market value of the goods. The importer pays the inflated price. The excess payment — the laundered value — is retained by the exporter in the exporting country.

**Mechanism:** Dirty money already held by the exporter (or their associate) in Country X is effectively "converted" into clean trade receivables. The importer in Country Y uses clean funds to make the payment, and the excess value is now legitimised in Country X.

**Example:** A trading company exports copper worth $500,000 but invoices the importer for $700,000. The importer pays $700,000 from clean funds. The exporter retains $700,000 — $200,000 of which represents laundered value.

**Detection clue:** Invoice price materially above commodity price databases (LME spot price, UN Comtrade mirror data, etc.) without commercial justification.

### 2.2 Under-Invoicing

The exporter invoices the importer for an amount LESS than the true market value of the goods. Value is transferred to the importing country — the importer retains surplus value at the destination.

**Common motivation:** Customs duty and tariff evasion (combined with ML). Prevalent in import-heavy economies with high tariff rates.

**Example:** Machinery worth $300,000 is invoiced at $120,000. Customs duties are paid on $120,000. The remaining $180,000 of value is transferred to the importer in Country Y without documentation.

**Detection clue:** Invoice price materially below comparable goods in trade databases. Discrepancy between declared customs value and insurance value.

### 2.3 Multiple Invoicing

The same goods are invoiced multiple times across different jurisdictions, financial institutions, or trading parties. Each invoice is used to obtain payment — multiple payments for a single shipment.

**Mechanism:** Often requires complicit parties at both ends of the transaction. Multiple banks or financial institutions are involved, each processing only one invoice and unaware of the others.

**Detection clue:** Cargo tracking documents (bill of lading reference numbers) matched against invoice numbers reveal the same shipment invoiced multiple times.

### 2.4 Short-Shipping and Over-Shipping

- **Short-shipping:** The exporter is paid for a full shipment but delivers fewer goods (or none — "phantom shipment"). Payment for undelivered goods transfers value without a corresponding goods flow.
- **Over-shipping:** The exporter ships MORE goods than invoiced, transferring value to the importer through the unrecorded excess.

**Phantom shipments:** A bill of lading is issued for goods that never existed or were never shipped. The importer's payment is a pure value transfer disguised as a trade transaction. Common in agricultural commodities, textiles, and electronic components where quality/quantity verification is difficult.

**Detection clue:** Physical inspection at port of destination; comparison of shipping weight/volume with invoice quantity; carrier records.

### 2.5 Falsely Described Goods

Goods are misrepresented in trade documents — incorrect HS (Harmonised System) tariff code, wrong country of origin, incorrect quality description, or wrong product category.

**Purposes:**
- Tariff evasion (misclassifying goods into lower-duty categories).
- Sanctions evasion (misdescribing sanctioned goods as non-sanctioned equivalents).
- TBML: using a legitimate-looking trade flow with fictitious goods values to move value.

**Example:** Sanctioned dual-use electronics described as "household appliances" on shipping manifests.

**Detection clue:** Cross-reference HS code on invoice with physical goods description, insurance documents, and prior shipment history for the same counterparty.

---

## 3. Black Market Peso Exchange (BMPE)

The BMPE is the most studied TBML mechanism and originated in Colombian drug trafficking. It has since globalised and now describes any similar scheme regardless of geography.

**Classic BMPE mechanism:**
1. Colombian drug cartel sells cocaine in the United States; receives USD cash proceeds.
2. Proceeds are physically dangerous and difficult to bank in the US. The cartel contacts a US-based peso broker (an agent of the black market).
3. The peso broker purchases US goods (electronics, appliances, luxury goods, pharmaceuticals) on behalf of Colombian importers using the drug dollars — in effect, "buying" the dirty dollars at a discount.
4. Goods are shipped to Colombia and sold in the Colombian market for pesos.
5. Pesos are paid to the drug cartel (minus the broker's commission, typically 8–20%).

**The BMPE launders three things simultaneously:** the origin of the drug dollars, the source of the goods (purchased with drug money), and the importer's apparent payment method.

**Modern extensions:**
- Any currency, any country, any goods. The mechanism applies wherever there is a pool of criminal proceeds in Currency A that needs converting to Currency B through a trade disguise.
- Extends into pharmaceutical smuggling, human trafficking proceeds, and cyber-crime proceeds.
- Now documented in Chinese underground banking (parallel import schemes), West African trade fraud networks, and Eastern European organised crime.

---

## 4. Free Trade Zone (FTZ) Abuse

Free trade zones (FTZs), export processing zones (EPZs), and special economic zones (SEZs) offer legitimate trade facilitation benefits: reduced tariffs, streamlined customs, and manufacturing incentives. However, their reduced oversight makes them significant TBML risk vectors.

**Why FTZs enable TBML:**
- Customs inspections are typically minimal or absent within the zone.
- Goods can be repackaged, relabelled, and re-invoiced multiple times inside the zone with limited documentation trail.
- Beneficial ownership of goods inside the zone is difficult to determine — goods may change hands several times without leaving the zone.
- Intermediary companies inside FTZs obscure the ultimate buyer and seller.
- Rules of origin certificates may be issued for goods with no genuine connection to the FTZ country.

**High-risk FTZs identified in typologies:**
- UAE — Jebel Ali Free Zone (JAFZA): the world's largest FTZ by throughput. Significant documented TBML and sanctions evasion activity. Post-2022 UAE reforms have increased scrutiny.
- Panama — Colón Free Trade Zone: historically one of the highest-risk FTZs globally; documented in BMPE, drug trafficking proceeds, and Latin American organised crime typologies.
- Singapore, Hong Kong: high-volume, sophisticated FTZs with generally strong oversight, but used in complex layering schemes.
- Djibouti, East Africa: strategic location creates re-export risks.

**FATF Guidance on FTZs:** FATF Best Practices Paper on Trade-Based Money Laundering (2020) dedicates a chapter to FTZ vulnerabilities.

---

## 5. Letters of Credit (LC) Fraud in TBML

Documentary Letters of Credit are the primary instrument for trade finance and a significant TBML vehicle because:
- Multiple financial institutions are involved, each seeing only part of the transaction.
- Banks process documents (invoices, bills of lading, packing lists, certificates of origin) but do not physically verify goods.
- The UCP 600 (Uniform Customs and Practice for Documentary Credits) governs LCs: banks deal in documents, not goods.

**TBML abuse via LCs:**

**Collusive fraudulent LC:**
Buyer and seller are in collusion. They agree on an inflated invoice price. The buyer's bank issues an LC for the inflated amount. The seller presents documents and draws the LC. Excess value is retained by the seller's network.

**Back-to-back LCs:**
A series of LCs between intermediary traders, each extracting value at a different step. A commodity travels through five intermediate parties with LCs issued at each step, each LC slightly larger than the last. Value is extracted through the aggregate markup.

**Red clause LCs:**
Advance payment provisions in LCs are exploited to obtain pre-shipment financing against goods that are never shipped.

**False bill of lading:**
The most common documentary fraud in TBML. A shipping agent issues a bill of lading for goods not yet shipped, already shipped to a different destination, or never existing. Banks cannot detect this without coordination with carriers.

**Detection:** Bank-to-carrier verification of bill of lading numbers; cross-bank data sharing on LC transactions; trade transparency units (TTUs) comparing import and export data.

---

## 6. Red Flags for Trade Finance Officers, Compliance Teams, and Banks

Apply these indicators in combination. No single indicator is determinative. Red flags should be assessed against the customer's trade history, business profile, and corridor risk.

**Pricing and value:**
- Invoice price significantly above or below market prices (use UN Comtrade, LME spot prices, commodity price databases, market intelligence).
- Price does not reflect normal commercial discounts for volume or long-term relationships.
- Insurance value inconsistent with declared invoice value (over-insuring relative to invoice = under-invoicing; under-insuring = over-invoicing).

**Counterparties and relationships:**
- Buyer and seller in different countries with no apparent commercial history or logical trade relationship.
- Counterparty located in a high-risk FTZ, jurisdiction with weak trade controls, or FATF grey/black listed country.
- Multiple changes of beneficiary or payee in a single transaction.
- Payments made to a party not named in the trade contract (third-party payment — significant red flag in FATF guidance).
- Shell company intermediaries with no apparent trading function.

**Documentation:**
- Vague, generic, or inconsistent goods descriptions (e.g., "general merchandise", "various parts").
- HS code does not match goods description.
- Multiple invoices for the same apparent shipment.
- Invoice issued before the goods exist or could have been produced.
- Certificate of origin inconsistent with known production geography for the goods.

**Transaction structure:**
- Unusually complex transaction structure with multiple jurisdictions and entities serving no apparent commercial purpose.
- Pre-payment for large amounts to unknown or newly established counterparties.
- Payment terms inconsistent with the commercial risk of the transaction.
- Sudden large increase in trade volumes inconsistent with customer's declared business size.
- Use of multiple banks for a single transaction without explanation.

**Corridor and shipment:**
- Shipment routes that are commercially illogical (goods transshipped through multiple high-risk intermediary ports).
- Country of origin inconsistent with the goods (e.g., electronics "from" a country with no electronics manufacturing).
- Goods have strategic military or dual-use potential inconsistent with declared end-use.

---

## 7. Detection Methods and Tools

**Price benchmarking:**
- UN Comtrade database: mirror trade data — compare a country's reported exports to Country Y against Country Y's reported imports from the same country. Discrepancies indicate misinvoicing.
- Global Financial Integrity (GFI) bilateral trade discrepancy methodology.
- London Metal Exchange (LME) spot prices for metals.
- World Bank Commodity Markets data.
- Bloomberg commodity prices.

**Trade Transparency Units (TTUs):**
- Pioneered by US Immigration and Customs Enforcement (ICE). TTUs compare bilateral trade data between countries to identify systematic misinvoicing at corridor level.
- Active TTUs: US-Colombia, US-Mexico, US-Panama. FATF recommends TTU model globally.

**Automated HS code analysis:**
- Automated systems flag when declared HS code is inconsistent with goods description, country of origin, or known trade flows.

**Trade document cross-matching:**
- Bills of lading, packing lists, commercial invoices, certificates of origin, insurance certificates should all be internally consistent. Automated document cross-matching tools (e.g., Moody's trade compliance, Dow Jones, various TBML-specific vendors).

**Egmont Group and FIU cooperation:**
- Mirror trade analysis requires FIU cooperation between the exporting and importing country's FIUs.
- Egmont Group bilateral secure exchange of financial intelligence for TBML cases.

---

## 8. Key Jurisdictions, Corridors, and Typologies

**High-risk bilateral corridors (per FATF and APG typologies):**
- China ↔ Latin America (Brazil, Colombia, Venezuela, Mexico): documented over-invoicing of manufactured goods; Chinese underground banking network involvement.
- China ↔ Africa: large infrastructure financing flows; documentation quality challenges.
- Gulf ↔ South Asia: gold-based TBML; gold is re-exported from Dubai to India and Pakistan as a settlement mechanism for hawala networks.
- Latin America ↔ US: BMPE and agricultural commodity misinvoicing (soy, coffee, cut flowers documented in FinCEN and DEA typologies).
- Eastern Europe ↔ Western Europe: automotive parts, agricultural produce misinvoicing; used by Russian organised crime for value extraction post-2022.

---

## 9. Key Reference Documents

- FATF: Best Practices on Trade Based Money Laundering (2020 — updated from original 2006 paper)
- FATF: Trade Based Money Laundering — Trends and Developments (2020)
- APG: Trade Based Money Laundering Typologies Report (2012, with subsequent updates)
- Wolfsberg Group: Trade Finance Principles (2019)
- ICC Uniform Customs and Practice for Documentary Credits (UCP 600, 2007)
- FinCEN Advisory FIN-2014-A005: Guidance on Trade-Based Money Laundering
- Global Financial Integrity: Trade Misinvoicing Reports (annual)
- US ICE: Trade Transparency Unit methodology documentation
- Basel AML Index: Country risk scores relevant to trade corridors
