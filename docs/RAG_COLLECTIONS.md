# RAG Collections — Vector Database Knowledge Management

## Overview

RAG Collections provide a flexible, user-managed vector database system for organizing and semantically searching your knowledge base. Each collection is a separate ChromaDB vector store with customizable metadata schemas and automatic indexing capabilities.

## What Are RAG Collections?

Think of RAG Collections as **smart filing cabinets** for your documents:

- **Traditional folders**: Store files by name/path
- **RAG Collections**: Store files by *meaning* and enable semantic search

When you add documents to a collection, they are:
1. Split into chunks (paragraphs or logical sections)
2. Converted to vector embeddings (numerical representations of meaning)
3. Stored in ChromaDB for fast semantic similarity search
4. Tagged with custom metadata (client name, regulation type, etc.)

## Key Features

### 1. Unlimited Custom Collections

Create as many collections as you need:
- **Regulations** — EU/national AML regulations
- **Client Documents** — Policies, procedures, internal docs
- **Legal Precedents** — Court cases, rulings, interpretations
- **Tax Codes** — Tax regulations and guidance
- **Industry Standards** — Best practices, frameworks
- **Training Materials** — Internal training content

Each collection has:
- **Display Name** — Human-readable label
- **Icon** — Lucide icon for visual identification
- **Color** — Hex color for UI theming
- **Description** — What this collection contains

### 2. Semantic Search

Unlike keyword search, semantic search understands **meaning**:

**Keyword Search:**
- Query: "customer due diligence"
- Matches: Documents containing exactly "customer due diligence"

**Semantic Search (RAG):**
- Query: "customer due diligence"
- Matches:
  - "Know Your Customer procedures"
  - "Client onboarding verification"
  - "CDD requirements"
  - "Customer identification processes"

All results are ranked by **semantic similarity** (how closely the meaning matches).

### 3. Custom Metadata Schemas

Each collection can have its own metadata fields for filtering:

**Example: Regulations Collection**
```json
{
  "metadataSchema": {
    "regulation_type": ["EU Regulation", "National Law", "Directive", "Guideline"],
    "jurisdiction": ["EU", "Sweden", "Norway", "Finland", "Denmark"],
    "topic": ["AML", "Sanctions", "KYC", "Transaction Monitoring"],
    "effective_date": "date",
    "status": ["In Force", "Proposed", "Repealed"]
  }
}
```

**Example: Client Documents Collection**
```json
{
  "metadataSchema": {
    "client_name": "text",
    "document_type": ["Policy", "Procedure", "Risk Assessment", "Report"],
    "last_review_date": "date",
    "approval_status": ["Draft", "Approved", "Under Review"]
  }
}
```

Metadata enables **filtered queries**:
- "Find all Swedish AML regulations effective after 2024"
- "Search Nordea's approved policies for transaction monitoring procedures"

### 4. Watch Directories (Auto-Indexing)

Set up collections to automatically monitor folders:

```json
{
  "watchDirectories": [
    "/Users/daniel/Futurechain/Regulations/AMLR",
    "/Users/daniel/Futurechain/Regulations/AMLA"
  ],
  "autoIndex": true
}
```

When a new file is added to a watched directory:
1. System detects the file
2. Extracts text (supports .pdf, .docx, .txt, .md, .xlsx)
3. Chunks the content
4. Generates embeddings
5. Adds to the collection

**Note:** Auto-indexing runs on a schedule (configurable interval). Manual uploads are indexed immediately.

## Technical Architecture

### Stack
- **Vector DB**: ChromaDB (local, persistent)
- **Embeddings**: OpenAI `text-embedding-3-small` (1536 dimensions)
- **Similarity Metric**: Cosine similarity
- **Storage**: SQLite metadata + ChromaDB vectors

### Data Flow

```
Document Upload
      ↓
Text Extraction (mammoth, pdf-parse, xlsx)
      ↓
Text Chunking (1000 tokens/chunk, 200 token overlap)
      ↓
Embedding Generation (OpenAI API)
      ↓
Vector Storage (ChromaDB)
      ↓
Metadata Storage (SQLite)
```

### Query Flow

```
User Query
      ↓
Query Embedding (OpenAI API)
      ↓
Vector Search (ChromaDB cosine similarity)
      ↓
Top K Results (default: 10)
      ↓
Re-ranking (optional, by metadata filters)
      ↓
Return Results
```

## Database Schema

### knowledge_collections
```sql
CREATE TABLE knowledge_collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT 'FolderOpen',
  color TEXT DEFAULT '#2DD4A8',
  watch_directories TEXT DEFAULT '[]',
  auto_index INTEGER DEFAULT 0,
  metadata_schema TEXT DEFAULT '{}',
  created_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### rag_documents
```sql
CREATE TABLE rag_documents (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER,
  chunk_count INTEGER DEFAULT 0,
  metadata TEXT,
  uploaded_by TEXT,
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  indexed_at DATETIME,
  index_status TEXT DEFAULT 'pending'
);
```

### rag_chunks
```sql
CREATE TABLE rag_chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  chroma_id TEXT NOT NULL,
  metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## API Endpoints

### Collections Management

#### List Collections
```http
GET /api/collections
```

Response:
```json
{
  "collections": [
    {
      "id": "regulations",
      "name": "regulations",
      "display_name": "Regulations & Laws",
      "description": "EU/national regulations, directives, legal frameworks",
      "icon": "Scale",
      "color": "#3498DB",
      "documentCount": 45,
      "chunkCount": 1234,
      "watchDirectories": ["/path/to/regulations"],
      "metadataSchema": {...},
      "created_at": "2026-02-01T10:00:00Z"
    }
  ]
}
```

#### Get Collection Details
```http
GET /api/collections/:id
```

#### Create Collection
```http
POST /api/collections
Content-Type: application/json

{
  "name": "tax-codes",
  "displayName": "Tax Codes",
  "description": "Swedish and EU tax regulations",
  "icon": "Calculator",
  "color": "#9B59B6",
  "watchDirectories": ["/path/to/tax-codes"],
  "autoIndex": true,
  "metadataSchema": {
    "jurisdiction": ["EU", "Sweden"],
    "tax_type": ["Corporate", "VAT", "Income"]
  }
}
```

#### Update Collection
```http
PUT /api/collections/:id
Content-Type: application/json

{
  "description": "Updated description",
  "watchDirectories": ["/new/path"]
}
```

#### Delete Collection
```http
DELETE /api/collections/:id
```
**Requires admin role.**

### Document Management

#### List Documents in Collection
```http
GET /api/collections/:id/documents
```

#### Query Collection (Semantic Search)
```http
POST /api/collections/:id/query
Content-Type: application/json

{
  "query": "What are the CDD requirements for high-risk customers?",
  "limit": 10,
  "filter": {
    "regulation_type": "EU Regulation",
    "topic": "KYC"
  }
}
```

Response:
```json
{
  "results": [
    {
      "content": "Article 13 of AMLR requires enhanced CDD for high-risk customers...",
      "metadata": {
        "regulation_type": "EU Regulation",
        "topic": "KYC",
        "effective_date": "2024-07-01"
      },
      "distance": 0.12,
      "id": "chunk_abc123"
    }
  ]
}
```

### Health Check
```http
GET /api/collections/health/check
```

Returns ChromaDB availability and OpenAI API key configuration status.

## Configuration

### Environment Variables

```bash
# Required for vector embeddings
OPENAI_API_KEY=sk-...

# ChromaDB storage path (default: ./data/chroma)
CHROMA_PATH=./data/chroma
```

### Embedding Model

Default: `text-embedding-3-small`
- **Dimensions:** 1536
- **Cost:** $0.00002 per 1K tokens (~$0.02 per million tokens)
- **Speed:** ~50ms per request
- **Performance:** Excellent for compliance/legal text

Can be changed in `server/services/chroma-client.ts`:
```typescript
openai_model: 'text-embedding-3-small', // or 'text-embedding-3-large'
```

## Best Practices

### 1. Collection Design

**Good:**
- **Regulations** (all regulations together, filter by jurisdiction/type)
- **Client Work** (all client docs, filter by client name)

**Less Optimal:**
- **Swedish AML Regulations** (too narrow, makes cross-jurisdiction queries hard)
- **Nordea Documents** (better to have one Client collection with metadata)

**Rule:** Prefer broad collections with rich metadata over many narrow collections.

### 2. Metadata Schema Design

**Required Fields:**
- Source/jurisdiction
- Document type
- Effective/review dates

**Optional but Useful:**
- Status (draft, approved, repealed)
- Confidence level (for AI-generated content)
- Last verification date

**Avoid:**
- Free-text metadata (use controlled vocabularies)
- Overly granular fields (combine related fields)

### 3. Chunking Strategy

Default: 1000 tokens/chunk, 200 token overlap

**When to Increase Chunk Size:**
- Long regulatory articles
- Multi-paragraph definitions

**When to Decrease Chunk Size:**
- Short-form content (social media, emails)
- Highly structured data (tables, lists)

Adjust in `server/services/document-processor.ts` (future implementation).

### 4. Query Optimization

**Good Queries:**
- "What are the customer due diligence requirements for crypto exchanges?"
- "How should a bank handle suspicious transaction reports under AMLR?"

**Less Effective:**
- "AML" (too vague)
- "Tell me everything about sanctions" (too broad)

**Pro Tip:** Use natural language questions. The embeddings model performs best with complete sentences.

## Limitations

### Current Limitations
- **No OCR**: Scanned PDFs are not supported (text must be extractable)
- **No images**: Image content in PDFs is ignored
- **English-optimized**: OpenAI embeddings are strongest in English (but work for Nordic languages)
- **No real-time watch**: Auto-indexing runs on schedule, not file system events

### Cost Considerations
- **Embedding cost**: ~$0.02 per 1M tokens (~750k words)
- **Storage**: ChromaDB is local, no cloud costs
- **Query cost**: ~$0.00002 per query embedding

**Example:**
- 100 PDF documents (avg 10 pages each) ≈ 500k tokens ≈ $0.01 to index
- 1000 queries/month ≈ $0.02/month

**Total typical monthly cost: < $1**

## Troubleshooting

### "ChromaDB unavailable" Error

**Cause:** OpenAI API key not configured

**Fix:**
```bash
# .env
OPENAI_API_KEY=sk-...
```

Restart server: `pnpm run dev`

### "Embedding generation failed"

**Cause:** OpenAI API rate limit or network issue

**Fix:** Retry after 1 minute. If persistent, check OpenAI dashboard for quota/billing issues.

### "Index status: failed"

**Cause:** Document text extraction failed (corrupted PDF, unsupported format)

**Fix:**
1. Check file format (must be .pdf, .docx, .txt, .md, .xlsx)
2. Try re-exporting from original source
3. Use a different file format (e.g., export PDF to Word)

### Slow Query Performance

**Cause:** Collection too large (>100k chunks)

**Fix:**
1. Split into multiple collections
2. Use metadata filters to narrow search space
3. Reduce `limit` parameter (default: 10)

## Roadmap

### Phase 5 (Current)
- ✅ Collection creation/management
- ✅ Semantic search API
- ✅ Custom metadata schemas
- 🔄 Watch directory indexing (stub only)

### Phase 6 (Planned)
- Upload UI in frontend
- Real-time watch directory monitoring
- Hybrid search (BM25 + vector)
- Re-ranking by metadata + recency
- Export search results to Excel

### Phase 7 (Future)
- OCR support for scanned PDFs
- Multi-language embeddings (auto-detect)
- Custom embeddings (fine-tuned on domain data)
- Collection sharing across users

## Support

For questions or issues:
1. Check this documentation
2. Review API error messages (detailed logs in console)
3. Test with `/api/collections/health/check`
4. Contact: daniel@advisense.fcp (internal only)

---

**Version:** 1.0
**Last Updated:** 2026-02-19
**Author:** Daniel Bardun & Futurechain
