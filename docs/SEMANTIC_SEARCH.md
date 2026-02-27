# Semantic Search System

## Overview

The Semantic Search API provides powerful vector similarity search across knowledge collections using ChromaDB embeddings. It enables precise retrieval of relevant document chunks with automatic citation extraction, re-ranking, and context expansion.

## Key Features

### 1. Vector Similarity Search
- Uses OpenAI `text-embedding-3-small` (1536 dimensions) for embeddings
- Cosine similarity for semantic relevance
- Returns relevance scores (0-1, higher = more relevant)
- Searches across multiple collections simultaneously

### 2. Metadata Filtering
- Filter by document type, date, author, tags
- Combine filters with semantic queries
- ChromaDB native metadata support

### 3. Re-ranking
- Simple keyword overlap heuristic (70% vector + 30% keyword)
- Improves precision for fact-finding queries
- Optional — disabled by default for speed
- Can be upgraded to cross-encoder models for production

### 4. Citation Extraction
- Automatic citation building: `"filename.pdf, page 12"`
- Extracts page numbers, section headers from metadata
- Enables users to verify sources

### 5. Context Retrieval
- Fetch surrounding chunks (before/after a result)
- Expands context window for full paragraph/section
- Configurable context size

### 6. Hybrid Search
- Combines vector similarity + keyword matching
- Boosts chunks found in both searches
- Best of both worlds: semantic understanding + exact phrases

---

## API Endpoints

### POST `/api/search/semantic`

Semantic search using vector embeddings.

**Request Body:**
```json
{
  "query": "What are the requirements for customer due diligence?",
  "collections": ["regulations", "client-docs"],
  "topK": 10,
  "filters": { "fileType": "pdf" },
  "rerank": true
}
```

**Response:**
```json
{
  "results": [
    {
      "chunkId": "uuid-123",
      "documentId": "doc-456",
      "documentName": "AMLR-2024.pdf",
      "collectionId": "regulations",
      "collectionName": "Regulations & Laws",
      "content": "Article 13 requires institutions to apply customer due diligence measures...",
      "relevanceScore": 0.89,
      "metadata": {
        "chunkIndex": 42,
        "filename": "AMLR-2024.pdf",
        "fileType": "pdf",
        "page": 12
      },
      "citation": "AMLR-2024.pdf, page 12"
    }
  ],
  "count": 10
}
```

---

### POST `/api/search/keyword`

Keyword-based search (fallback/supplement to semantic search).

**Request Body:**
```json
{
  "query": "risk assessment",
  "collections": ["regulations"],
  "limit": 10
}
```

**Use when:**
- Embeddings not available
- Exact phrase matching needed
- Supplement semantic search results

---

### POST `/api/search/hybrid`

Hybrid search combining semantic + keyword.

**Request Body:** Same as `/semantic`

**How it works:**
1. Runs semantic and keyword searches in parallel
2. Merges results by chunk ID (deduplicates)
3. Boosts relevance score (+20%) for chunks found in both
4. Returns top K by combined relevance

**Best for:**
- General queries where both semantic and exact matching are valuable
- Improving recall (finding more relevant results)

---

### GET `/api/search/context/:chunkId`

Get surrounding chunks for context expansion.

**Query Parameters:**
- `contextSize` (default: 2) — number of chunks before/after

**Example:**
```
GET /api/search/context/uuid-123?contextSize=2
```

**Returns:**
Chunks at indices `[chunkIndex-2, chunkIndex-1, chunkIndex, chunkIndex+1, chunkIndex+2]` from the same document, in order.

**Use case:**
User clicks "Expand" on a search result to see full paragraph/section.

---

## Integration with Knowledge Source System

Semantic search integrates with the Knowledge Source Panel as **Mode 5: RAG Search**.

### In `knowledge-resolver.ts`

```typescript
const resolved = await resolveKnowledgeSources(
  knowledgeSourceConfig,
  uploadedFiles,
  {
    db,
    userQuery: userMessage,
    ragMode: {
      enabled: true,
      collections: ['regulations', 'client-docs'],
      topK: 10,
      minScore: 0.3,
      useSemanticSearch: true,
      rerank: true,
    },
  }
);
```

**Process:**
1. User submits query with RAG mode enabled
2. Knowledge resolver calls `semanticSearch()`
3. Top K chunks are retrieved from ChromaDB
4. Chunks are filtered by minimum relevance score
5. Results are formatted with citations and injected into system prompt
6. Claude uses retrieved knowledge to answer

**Prompt injection format:**
```markdown
## RETRIEVED KNOWLEDGE
The following passages were retrieved from your knowledge base using semantic search as most relevant to this query.

--- [AMLR-2024.pdf, page 12] (Relevance: 89.2%) ---
Article 13 requires institutions to apply customer due diligence measures...

--- [Client-Policy-v3.docx, section 4.2] (Relevance: 82.5%) ---
Our CDD procedures are designed to meet the requirements of...
```

---

## When to Use Semantic vs. Keyword vs. Hybrid

| Search Type | Best For | Speed | Precision |
|---|---|---|---|
| **Semantic** | Conceptual queries, paraphrases, "questions about..." | Medium | High |
| **Keyword** | Exact phrases, regulatory article numbers, acronyms | Fast | Medium |
| **Hybrid** | General queries, maximum recall | Slower | Highest |

**Examples:**

| Query | Recommended |
|---|---|
| "What are the CDD requirements?" | Semantic |
| "Article 13(1)(a)" | Keyword |
| "risk assessment procedures" | Hybrid |
| "How should we handle PEPs?" | Semantic |
| "AMLR 2024/1624" | Keyword |

---

## Re-ranking Explained

Re-ranking improves precision by combining vector similarity with keyword overlap.

**Default (no re-ranking):**
- Pure cosine similarity from embeddings
- Fast, generally good results

**With re-ranking:**
- Calculates keyword match score: `matches / total query words`
- Combines: `finalScore = vectorScore * 0.7 + keywordScore * 0.3`
- Re-sorts results by combined score

**When to enable:**
- Fact-finding queries (specific terms must appear)
- Regulatory compliance (need exact phrases)
- User reports "results seem off-topic"

**When to disable:**
- Speed is critical
- Conceptual/exploratory queries
- Embeddings already perform well

**Production upgrade:**
Can replace simple keyword heuristic with a cross-encoder model (e.g., `cross-encoder/ms-marco-MiniLM-L-12-v2`) for true semantic re-ranking.

---

## Citation Format

Citations are built from filename + metadata:

| Metadata Available | Citation Format |
|---|---|
| `page` number | `"filename.pdf, page 12"` |
| `section` header | `"filename.docx, section \"4.2 CDD Procedures\""` |
| Nothing | `"filename.pdf"` |

**Why citations matter:**
- Users can verify AI-generated answers
- Compliance requirement: "show your sources"
- Enables auditors to trace analysis back to source documents

---

## Context Expansion

When a user sees a relevant chunk but needs more context, they can request surrounding chunks:

**Example:**
- User searches: "CDD requirements"
- Top result: Chunk 42 from AMLR-2024.pdf
- User clicks "Expand context"
- API returns chunks 40, 41, 42, 43, 44
- UI shows full paragraph/section

**Parameters:**
- `contextSize=1` → immediate neighbors (3 chunks total)
- `contextSize=2` → 5 chunks total (default)
- `contextSize=5` → 11 chunks total (full section)

**Use case:**
Regulatory text where a single chunk references "as defined in paragraph 2 above" — context expansion shows paragraph 2.

---

## Performance Considerations

### Token Budget
- Max context: 160,000 tokens
- System prompt: ~8,000 tokens
- Available for retrieved chunks: ~152,000 tokens
- Average chunk: ~200 words = ~260 tokens
- Typical retrieval: 10 chunks = 2,600 tokens (plenty of room)

### Speed
- **Semantic search:** ~100-300ms (depends on collection size)
- **Keyword search:** ~10-50ms (SQLite LIKE query)
- **Hybrid search:** ~150-350ms (parallel execution)
- **Context retrieval:** <10ms (indexed by chunk_index)

### Scaling
- ChromaDB handles 100K+ chunks efficiently
- OpenAI embeddings: $0.02 per 1M tokens (cheap)
- Re-ranking adds ~10-20ms per 100 results
- Consider caching frequent queries for production

---

## Error Handling

### No embeddings available
```json
{
  "error": "OpenAI API key not configured. Set OPENAI_API_KEY in .env to enable vector search."
}
```

**Fallback:** Use keyword search instead.

### Collection doesn't exist
- API returns empty results
- Check collection IDs via `/api/knowledge/collections`

### Context budget exceeded
- Knowledge resolver stops adding chunks when token limit reached
- Logged as: `"SKIPPED — context budget"`
- Solution: Increase `topK` or raise `minScore` threshold

---

## Example: Full Workflow

**Scenario:** User asks "What are the AMLR requirements for beneficial ownership?"

### 1. Knowledge Source Panel
```typescript
{
  modes: {
    ragSearch: {
      enabled: true,
      collections: ['regulations', 'guidance-notes'],
      topK: 8,
      rerank: true
    }
  }
}
```

### 2. API Call
```http
POST /api/search/semantic
{
  "query": "AMLR requirements for beneficial ownership",
  "collections": ["regulations", "guidance-notes"],
  "topK": 8,
  "rerank": true
}
```

### 3. Results Retrieved
- 8 chunks from AMLR regulation and EBA guidance
- Relevance scores: 0.92, 0.88, 0.85, 0.81, 0.76, 0.72, 0.68, 0.64
- All have `minScore >= 0.3` ✓

### 4. Injected into Prompt
```markdown
## RETRIEVED KNOWLEDGE

--- [AMLR-2024.pdf, page 23] (Relevance: 92.1%) ---
Article 3(6) defines beneficial owner as the natural person(s) who ultimately owns or controls the customer...

--- [EBA-Guidelines-BO.pdf, page 8] (Relevance: 88.4%) ---
Institutions must identify the beneficial owner by applying risk-based measures...
```

### 5. Claude's Response
Uses retrieved chunks to provide accurate, cited answer:

> "Under AMLR Article 3(6), beneficial ownership refers to natural persons who ultimately own or control the customer [AMLR-2024.pdf, page 23]. The EBA Guidelines clarify that institutions must apply risk-based measures to identify these individuals [EBA-Guidelines-BO.pdf, page 8]..."

### 6. User Verification
User clicks citation → opens PDF → sees exact source → trusts the answer.

---

## Future Enhancements

### Cross-Encoder Re-ranking
Replace keyword heuristic with transformer-based re-ranker:
```python
from sentence_transformers import CrossEncoder
model = CrossEncoder('cross-encoder/ms-marco-MiniLM-L-12-v2')
scores = model.predict([(query, chunk.content) for chunk in results])
```

### Query Expansion
Auto-expand queries with synonyms:
- "CDD" → "customer due diligence"
- "PEP" → "politically exposed person"
- "STR" → "suspicious transaction report"

### Multi-hop Retrieval
For complex questions:
1. Retrieve initial chunks
2. Extract key terms from chunks
3. Retrieve again with expanded query
4. Merge and re-rank

### Caching
Cache embeddings for frequent queries:
```typescript
const cacheKey = `semantic:${query}:${collections.join(',')}`;
const cached = await redis.get(cacheKey);
if (cached) return JSON.parse(cached);
```

---

## Troubleshooting

### "Results not relevant"
- **Check query phrasing:** Semantic search works best with natural questions
- **Enable re-ranking:** May improve precision
- **Try hybrid search:** Combines semantic + keyword
- **Inspect embeddings:** Are chunks properly indexed?

### "Can't find exact phrase"
- **Use keyword search:** Better for exact matching
- **Check chunk boundaries:** Phrase may be split across chunks
- **Context expansion:** Retrieve surrounding chunks

### "Too slow"
- **Disable re-ranking:** Saves 10-20ms
- **Reduce topK:** Fewer results = faster
- **Use semantic only:** Faster than hybrid
- **Index fewer collections:** Narrower search space

### "Not finding anything"
- **Check collections indexed:** `/api/knowledge/collections`
- **Verify documents uploaded:** `/api/rag/documents`
- **Lower minScore threshold:** May be filtering too aggressively
- **Try keyword fallback:** Check if embeddings working

---

## Summary

✅ **Semantic search** = vector similarity, conceptual queries, high precision
✅ **Keyword search** = exact phrases, fast, simple fallback
✅ **Hybrid search** = best of both, maximum recall
✅ **Re-ranking** = improve precision, optional, upgradeable
✅ **Citations** = always included, enables verification
✅ **Context expansion** = get full paragraph/section on demand
✅ **Knowledge integration** = seamless RAG mode in Knowledge Source Panel

The semantic search system is production-ready, fast, and scales to 100K+ chunks. It's the foundation for RAG-powered compliance analysis in openEXPERT.
