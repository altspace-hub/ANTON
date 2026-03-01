# KitchenBox EU — Test Data Environment

Fictional company used for testing ANTON workflows, API connections, and knowledge base indexing.

## Company
**KitchenBox EU AB** — Swedish online retailer of kitchen equipment, shipping across the EU.

## Contents

| File | Purpose |
|---|---|
| `company/01-company-overview.md` | Company profile, structure, key people |
| `company/02-product-catalog.md` | Full product range with SKUs, prices, margins |
| `company/03-customers.csv` | 20 EU customer records |
| `company/04-orders-2024.csv` | 45 orders from 2024 with full line items |
| `company/05-financial-summary-2024.md` | P&L, cash flow, VAT position summary |
| `company/06-supplier-list.md` | Suppliers with country, payment terms, volumes |
| `seed-kitchenbox.ts` | Script to seed a standalone SQLite test database |
| `api-tests/workbench-api.sh` | Curl commands for testing ANTON API endpoints |
| `api-tests/workflow-payloads.json` | Sample workflow request bodies |

## How to Use

### 1. Index company documents into Knowledge Base
In ANTON → Knowledge Base, create a collection called "KitchenBox EU" and upload all files from `company/`. This lets you test RAG retrieval against realistic business documents.

### 2. Seed the test SQLite database
```bash
cd test-data
npx tsx seed-kitchenbox.ts
# Creates: test-data/kitchenbox.sqlite
```

### 3. Run API tests
```bash
cd test-data/api-tests
chmod +x workbench-api.sh
./workbench-api.sh
```

## Test Scenarios

- **Gap Analysis**: Upload EU VAT Directive + company financial summary → analyse compliance gaps
- **Data Management**: Load customers.csv → check GDPR data fields, retention policy
- **Risk Assessment**: Run sanctions screening against customer list (test DE/NL/FR names)
- **Document Creation**: Generate a B2B sales contract template for KitchenBox
- **Regulatory Monitor**: Fetch latest EU consumer rights developments + assess impact on returns policy
