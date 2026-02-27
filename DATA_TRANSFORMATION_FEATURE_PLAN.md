# Data Transformation Pipeline Feature — Design & Implementation Plan

**Date:** February 20, 2026
**Concept:** "Palantir Lite" data management within workflows
**Goal:** Enable users to import, transform, merge, and export data from multiple sources in a single workflow

---

## 📋 User Story

**As a consultant,**
I want to import data from multiple sources (CSV, Excel, databases, APIs),
transform them into a unified format,
merge them using column/row mappings,
and export the result as a clean dataset or report,
**so that** I can automate data preparation without writing code.

**Example Use Cases:**
1. **Financial Consolidation:** Merge bank transaction CSVs from 3 different banks → unified format → export to Excel
2. **Customer Data Merge:** Import customer data from CRM API + Excel sheet → match by email → deduplicate → export to CSV
3. **Report Generation:** Query database → transform column names → filter rows → export to formatted Excel with charts
4. **Compliance Mapping:** Import regulatory data (CSV) → map to internal schema → validate → load to database

---

## 🏗️ Architecture Overview

### Current State (Already Exists)

**Workflow Step Types:**
- ✅ `api_call` - Call REST APIs
- ✅ `database_query` - Query databases (via ConnectionManager)
- ✅ `script` - Run custom scripts
- ✅ `file_read` - Read files
- ✅ `file_write` - Write files
- ✅ `llm_call` - Call LLM for analysis

**Infrastructure:**
- ✅ ConnectionManager - Manage DB/API/script connections
- ✅ Workflow execution engine with step chaining
- ✅ Variable passing between steps (`{{stepId.output}}`)

### What's Needed (New)

**New Step Types:**
1. `data_import` - Import data from source (CSV, Excel, JSON, database, API)
2. `data_transform` - Transform data (map columns, filter, convert types)
3. `data_merge` - Merge multiple datasets (join, union, deduplicate)
4. `data_export` - Export to format (CSV, Excel, JSON, database)

**New Services:**
1. `data-transformer.ts` - Core transformation engine
2. `data-merger.ts` - Merge logic (join types, key matching)
3. `schema-mapper.ts` - Column mapping and validation
4. `data-preview.ts` - Preview data before/after transformation

**New UI Components:**
1. `DataMappingInterface.tsx` - Visual column mapper
2. `DataPreviewPanel.tsx` - Before/after data preview
3. `MergeConfigBuilder.tsx` - Configure merge operations
4. `TransformationRulesBuilder.tsx` - Define transformation rules

---

## 🎯 Core Features

### 1. Data Import (Source Connectors)

**Supported Sources:**
- **Files:** CSV, Excel (.xlsx), JSON, Parquet
- **Databases:** PostgreSQL, MySQL, SQLite, SQL Server (via ConnectionManager)
- **APIs:** REST APIs with JSON/XML response
- **Cloud Storage:** Local files (initially), future: S3, Azure Blob

**Import Step Configuration:**
```typescript
{
  stepType: 'data_import',
  config: {
    source: 'file' | 'database' | 'api',

    // File source
    filePath?: string,
    fileType?: 'csv' | 'excel' | 'json',
    sheetName?: string, // For Excel
    delimiter?: ',', // For CSV

    // Database source
    connectionId?: string, // From ConnectionManager
    query?: string, // SQL query

    // API source
    apiConnectionId?: string,
    endpoint?: string,
    method?: 'GET' | 'POST',

    // Common
    preview?: boolean, // Return first 100 rows for preview
  },
  output: {
    columns: ['col1', 'col2', ...],
    rows: [ {col1: 'val1', col2: 'val2'}, ... ],
    rowCount: 1000,
    schema: { col1: 'string', col2: 'number', ... }
  }
}
```

### 2. Data Transformation (Column/Row Operations)

**Operations:**
- **Column Operations:**
  - Rename columns
  - Select columns (keep/discard)
  - Reorder columns
  - Add computed columns (formula or LLM-generated)
  - Convert data types (string → number, date → string, etc.)

- **Row Operations:**
  - Filter rows (conditions: equals, contains, greater than, etc.)
  - Sort rows
  - Deduplicate (by key columns)
  - Add/remove rows

- **Cell Operations:**
  - Find & replace
  - Trim whitespace
  - Extract patterns (regex)
  - AI transformation (use LLM to reformat values)

**Transform Step Configuration:**
```typescript
{
  stepType: 'data_transform',
  inputData: '{{stepId.output}}', // Reference previous step
  config: {
    operations: [
      {
        type: 'rename_column',
        oldName: 'customer_id',
        newName: 'customerId'
      },
      {
        type: 'select_columns',
        columns: ['customerId', 'email', 'amount']
      },
      {
        type: 'convert_type',
        column: 'amount',
        fromType: 'string',
        toType: 'number'
      },
      {
        type: 'filter_rows',
        condition: {
          column: 'amount',
          operator: 'greater_than',
          value: 100
        }
      },
      {
        type: 'add_column',
        name: 'riskCategory',
        formula: 'if(amount > 10000, "high", "low")' // Or AI-generated
      }
    ]
  },
  output: {
    // Transformed data in same format as import
  }
}
```

### 3. Data Merge (Join/Union Operations)

**Merge Types:**
- **Join:** Merge two datasets by matching keys (inner, left, right, full outer)
- **Union:** Stack datasets vertically (same columns)
- **Concat:** Concatenate datasets horizontally (same row count)
- **Deduplicate:** Remove duplicates across merged data

**Merge Step Configuration:**
```typescript
{
  stepType: 'data_merge',
  inputs: {
    left: '{{step1.output}}',
    right: '{{step2.output}}'
  },
  config: {
    mergeType: 'join' | 'union' | 'concat',

    // For join
    joinType?: 'inner' | 'left' | 'right' | 'full',
    leftKey?: 'customerId',
    rightKey?: 'customer_id', // Can be different column name

    // For union (stack vertically)
    columnMapping?: {
      'customer_id': 'customerId', // Map right columns to left
      'email_address': 'email'
    },

    // Deduplication
    deduplicateBy?: ['customerId'],
    deduplicateStrategy?: 'keep_first' | 'keep_last' | 'merge_values'
  },
  output: {
    // Merged data
  }
}
```

### 4. Data Export (Output Formats)

**Supported Outputs:**
- **Files:** CSV, Excel (.xlsx with formatting), JSON, Parquet
- **Databases:** Insert into table (via ConnectionManager)
- **APIs:** POST data to API endpoint
- **Reports:** Formatted Excel with charts, pivot tables

**Export Step Configuration:**
```typescript
{
  stepType: 'data_export',
  inputData: '{{transformStep.output}}',
  config: {
    destination: 'file' | 'database' | 'api',

    // File export
    filePath?: './output/merged_data.xlsx',
    fileType?: 'csv' | 'excel' | 'json',
    excelOptions?: {
      sheetName: 'Consolidated Data',
      autoFilter: true,
      freezeHeader: true,
      conditionalFormatting: [...]
    },

    // Database export
    connectionId?: string,
    tableName?: string,
    insertMode?: 'insert' | 'upsert' | 'replace',

    // API export
    apiConnectionId?: string,
    endpoint?: string,
    method?: 'POST' | 'PUT'
  }
}
```

---

## 🎨 UI Design

### Data Mapping Interface (Visual Column Mapper)

```
┌────────────────────────────────────────────────────────────────┐
│ Data Transformation: Map Columns                              │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│ Source: customer_data.csv (left)                               │
│ Target: Unified Schema (right)                                 │
│                                                                │
│ ┌─────────────────────┐        ┌─────────────────────┐        │
│ │ Source Columns      │        │ Target Columns      │        │
│ ├─────────────────────┤        ├─────────────────────┤        │
│ │ □ customer_id   ─────────────> customerId          │        │
│ │ □ email         ─────────────> email               │        │
│ │ ☑ amount        ─────────────> transactionAmount   │        │
│ │ □ date          ─────────────> transactionDate     │        │
│ │ ☑ ignored_col   (not mapped)                       │        │
│ └─────────────────────┘        └─────────────────────┘        │
│                                                                │
│ Transformations:                                               │
│ • amount → transactionAmount: Convert string to number         │
│ • date → transactionDate: Parse as ISO date                    │
│                                                                │
│ [Add Transformation] [Preview Data]                            │
└────────────────────────────────────────────────────────────────┘
```

### Data Preview Panel (Before/After)

```
┌────────────────────────────────────────────────────────────────┐
│ Preview: customer_data.csv → Unified Schema                   │
├────────────────────────────────────────────────────────────────┤
│ Before (100 rows loaded)                                       │
│ ┌────────────┬─────────────────┬──────────┬────────────┐      │
│ │customer_id │ email           │ amount   │ date       │      │
│ ├────────────┼─────────────────┼──────────┼────────────┤      │
│ │ 12345      │ john@email.com  │ "1000"   │ 2024-01-15 │      │
│ │ 67890      │ jane@email.com  │ "2500"   │ 2024-01-16 │      │
│ └────────────┴─────────────────┴──────────┴────────────┘      │
│                                                                │
│ After Transformation                                           │
│ ┌────────────┬─────────────────┬─────────────────┬──────────┐ │
│ │customerId  │ email           │transactionAmount│transactio│ │
│ ├────────────┼─────────────────┼─────────────────┼──────────┤ │
│ │ 12345      │ john@email.com  │ 1000            │2024-01-15│ │
│ │ 67890      │ jane@email.com  │ 2500            │2024-01-16│ │
│ └────────────┴─────────────────┴─────────────────┴──────────┘ │
│                                                                │
│ ✓ 2 rows transformed • 1 column renamed • 1 type converted    │
└────────────────────────────────────────────────────────────────┘
```

### Merge Configuration Builder

```
┌────────────────────────────────────────────────────────────────┐
│ Merge Configuration                                            │
├────────────────────────────────────────────────────────────────┤
│ Merge Type: ● Join  ○ Union  ○ Concat                         │
│                                                                │
│ Join Settings:                                                 │
│ Join Type: [Inner Join ▼]                                      │
│                                                                │
│ Left Dataset: customer_data (100 rows)                         │
│ Join Key: [customerId ▼]                                       │
│                                                                │
│ Right Dataset: transaction_data (250 rows)                     │
│ Join Key: [customer_id ▼]                                      │
│                                                                │
│ Column Conflicts:                                              │
│ • "email" exists in both → Keep: ○ Left ● Right ○ Merge       │
│                                                                │
│ Preview Result:                                                │
│ Estimated output: 250 rows (all transactions matched)          │
│ Unmatched customers: 0 (all found)                             │
│                                                                │
│ [Preview Merge] [Apply]                                        │
└────────────────────────────────────────────────────────────────┘
```

---

## 🔧 Implementation Plan

### Phase 1: Core Data Transformation Engine (Week 1)

**Backend:**
1. Create `server/services/data-transformer.ts`
   - Column operations (rename, select, convert types)
   - Row operations (filter, sort, deduplicate)
   - Schema inference and validation

2. Create `server/services/data-merger.ts`
   - Join logic (inner, left, right, full outer)
   - Union/concat logic
   - Deduplication strategies

3. Create `server/services/schema-mapper.ts`
   - Column mapping resolver
   - Type conversion validation
   - Schema compatibility checking

**API Routes:**
- `POST /api/data/import` - Import data from source
- `POST /api/data/transform` - Apply transformations
- `POST /api/data/merge` - Merge datasets
- `POST /api/data/export` - Export to destination
- `POST /api/data/preview` - Preview transformations

### Phase 2: Workflow Integration (Week 1-2)

**Workflow Step Types:**
1. Add `data_import` step type to workflow builder
2. Add `data_transform` step type
3. Add `data_merge` step type
4. Add `data_export` step type

**Execution Engine:**
- Update `server/services/workflow-executor.ts` to handle new step types
- Add data passing between steps (store in execution context)
- Add validation for data transformation steps

### Phase 3: UI Components (Week 2)

**Components:**
1. `DataImportStepConfig.tsx` - Configure import sources
2. `DataTransformStepConfig.tsx` - Visual column mapper + transformation rules
3. `DataMergeStepConfig.tsx` - Merge configuration interface
4. `DataExportStepConfig.tsx` - Export destination config
5. `DataPreviewPanel.tsx` - Before/after preview

**Workflow Builder Enhancement:**
- Add data step types to step palette
- Update step editor to render data-specific configs
- Add data preview in execution results

### Phase 4: Advanced Features (Week 3)

**AI-Assisted Transformation:**
- Use LLM to suggest column mappings
- Use LLM to transform cell values (e.g., "format as currency", "extract first name")
- Use LLM to generate computed columns

**Excel Advanced Export:**
- Charts and pivot tables
- Conditional formatting
- Cell styling and formulas

**Smart Deduplication:**
- Fuzzy matching (Levenshtein distance for names)
- AI-powered duplicate detection
- Merge strategies (combine values from duplicates)

---

## 📊 Technical Specifications

### Data Structure (In-Memory)

```typescript
interface Dataset {
  columns: Array<{
    name: string;
    type: 'string' | 'number' | 'boolean' | 'date' | 'json';
    nullable: boolean;
  }>;
  rows: Array<Record<string, any>>;
  metadata: {
    rowCount: number;
    source: string;
    importedAt: string;
  };
}
```

### Transformation Operation Types

```typescript
type TransformOperation =
  | { type: 'rename_column'; oldName: string; newName: string }
  | { type: 'select_columns'; columns: string[] }
  | { type: 'convert_type'; column: string; fromType: string; toType: string }
  | { type: 'filter_rows'; condition: FilterCondition }
  | { type: 'add_column'; name: string; formula: string | AIPrompt }
  | { type: 'sort'; column: string; order: 'asc' | 'desc' }
  | { type: 'deduplicate'; keys: string[]; strategy: 'keep_first' | 'keep_last' }
  | { type: 'replace'; column: string; find: string; replace: string }
  | { type: 'extract'; column: string; pattern: string; newColumn: string };
```

### Merge Configuration

```typescript
interface MergeConfig {
  mergeType: 'join' | 'union' | 'concat';

  // Join
  joinType?: 'inner' | 'left' | 'right' | 'full';
  leftKey?: string;
  rightKey?: string;

  // Union
  columnMapping?: Record<string, string>; // right → left

  // Deduplication
  deduplicateBy?: string[];
  deduplicateStrategy?: 'keep_first' | 'keep_last' | 'merge_values';
}
```

---

## 💡 Example Workflows

### Example 1: Consolidate Bank Transactions

```
Step 1: Import Bank A CSV
  → columns: [Date, Description, Amount]
  → 150 rows

Step 2: Import Bank B CSV
  → columns: [date, desc, amt]
  → 200 rows

Step 3: Transform Bank B
  → Rename: date→Date, desc→Description, amt→Amount
  → Convert: Amount (string → number)

Step 4: Merge (Union)
  → Stack vertically
  → Result: 350 rows with columns [Date, Description, Amount]

Step 5: Transform Merged
  → Sort by Date (desc)
  → Add column: Category (AI-generated from Description)
  → Filter: Amount > 0 (exclude refunds)

Step 6: Export to Excel
  → Sheet: "Consolidated Transactions"
  → Auto-filter on headers
  → Conditional formatting: Amount > 1000 = red
```

### Example 2: Customer Data Enrichment

```
Step 1: Import CRM API
  → GET /api/customers
  → columns: [id, email, name]
  → 1000 rows

Step 2: Import Excel (transaction history)
  → columns: [customer_id, total_spent, last_purchase_date]
  → 800 rows

Step 3: Merge (Left Join)
  → Left: CRM data (id)
  → Right: Excel data (customer_id)
  → Result: 1000 rows (200 customers have no transactions)

Step 4: Transform
  → Add column: segment (if total_spent > 10000 → "VIP", else "Regular")
  → Fill nulls: total_spent = 0 for customers with no transactions

Step 5: Export to Database
  → Insert into: customer_segments table
  → Upsert by: id
```

---

## 🚀 Complexity Assessment

### Difficulty: **Medium-High**

**Easy Parts:**
- ✅ Basic column operations (rename, select, reorder) - **Easy**
- ✅ Type conversion (string ↔ number ↔ date) - **Easy**
- ✅ Row filtering and sorting - **Easy**
- ✅ Union (vertical stack) - **Easy**

**Medium Parts:**
- 🟡 Join operations (inner, left, right, full) - **Medium** (standard SQL join logic)
- 🟡 Deduplication with fuzzy matching - **Medium**
- 🟡 Excel export with formatting - **Medium** (ExcelJS already installed)
- 🟡 UI components (column mapper, preview) - **Medium**

**Hard Parts:**
- 🔴 AI-assisted transformation - **Hard** (need good prompting)
- 🔴 Fuzzy matching for smart deduplication - **Hard**
- 🔴 Large dataset handling (100k+ rows) - **Hard** (need streaming)
- 🔴 Complex merge with conflict resolution - **Hard**

**Overall Estimate:** **2-3 weeks** for full implementation (all phases)
- Phase 1 (Core engine): **3-4 days**
- Phase 2 (Workflow integration): **2-3 days**
- Phase 3 (UI): **4-5 days**
- Phase 4 (Advanced features): **3-4 days**

---

## 🎯 MVP (Minimum Viable Product)

**If time-constrained, focus on:**

1. ✅ **Data Import** (CSV, Excel, database query)
2. ✅ **Basic Transformations** (rename, select, convert types, filter)
3. ✅ **Simple Merge** (inner join only)
4. ✅ **Export** (CSV, Excel with basic formatting)
5. ✅ **Workflow Integration** (4 new step types)
6. ✅ **Basic UI** (Config forms, no visual mapper yet)

**Skip for MVP:**
- AI-assisted transformation
- Fuzzy matching
- Advanced Excel formatting (charts, pivots)
- Visual column mapper (use JSON config instead)

**MVP Timeline:** **5-7 days**

---

## 📋 Next Steps

### Decision Point: When to Build This?

**Option A: Build Now (Before Feature 2)**
- **Pros:** Completes a major user-facing feature, high value
- **Cons:** Delays completion of 5 core features

**Option B: Build After 5 Features Complete**
- **Pros:** Completes original goal first
- **Cons:** User has to wait for this valuable feature

**Option C: Build MVP in Parallel**
- **Pros:** Get basic functionality working alongside Feature 2-5
- **Cons:** Spreading effort across multiple features

**Recommendation:** **Option B** - Complete 5 core features first (original commitment), then build data transformation as Feature 6.

**Rationale:**
- User explicitly wanted 5 "core but expanding" features completed
- Data transformation is a separate, new feature (not part of original 5)
- Better to deliver 5 complete features than 4 complete + 1 partial

---

## ✅ Summary

**Is it hard to add?** No, **medium complexity** with clear implementation path.

**Does it make sense?** Yes, **excellent fit** for workflow system and high user value.

**Should we build it?** Yes, but **after completing the 5 core features**.

**Timeline:** 2-3 weeks for full implementation, 5-7 days for MVP.

**Dependencies:**
- ✅ Workflow system (exists)
- ✅ ConnectionManager (exists)
- ✅ File handling (exists)
- ✅ ExcelJS (already installed)
- 🆕 Data transformation engine (needs building)
- 🆕 UI components (needs building)

---

**Next Action:** Continue with Feature 2 (Cross-Workflow Intelligence), then circle back to data transformation as Feature 6 after completing Features 2-5.

**This feature will be added to the roadmap as "Feature 6: Data Transformation Pipelines"**
