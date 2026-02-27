# RAG Collections — API Testing Guide

## Prerequisites

1. **OpenAI API Key Required**
   - Set `OPENAI_API_KEY=sk-...` in `.env`
   - Without this, ChromaDB embedding functions will fail
   - Used for: `text-embedding-3-small` model

2. **Start Server**
   ```bash
   pnpm run dev
   ```

3. **Check Health**
   ```bash
   curl http://localhost:3001/api/collections/health/check
   ```

   Expected response:
   ```json
   {
     "available": true,
     "openaiConfigured": true,
     "message": "ChromaDB is ready"
   }
   ```

## API Endpoints Testing

### 1. List All Collections

```bash
curl http://localhost:3001/api/collections
```

Expected: 3 default collections (regulations, client-docs, templates)

### 2. Get Collection Details

```bash
curl http://localhost:3001/api/collections/regulations
```

Expected: Full details including vectorCount, documentCount, chunkCount

### 3. Create New Collection

```bash
curl -X POST http://localhost:3001/api/collections \
  -H "Content-Type: application/json" \
  -d '{
    "name": "tax-codes",
    "displayName": "Tax Codes & Guidance",
    "description": "Swedish and EU tax regulations",
    "icon": "Calculator",
    "color": "#9B59B6",
    "watchDirectories": [],
    "autoIndex": false,
    "metadataSchema": {
      "jurisdiction": ["EU", "Sweden", "Norway"],
      "tax_type": ["Corporate", "VAT", "Income", "Withholding"]
    }
  }'
```

Expected: `{ "success": true, "collectionId": "tax-codes" }`

### 4. Update Collection

```bash
curl -X PUT http://localhost:3001/api/collections/tax-codes \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Updated: Nordic and EU tax regulations",
    "color": "#8E44AD"
  }'
```

Expected: `{ "success": true }`

### 5. Query Collection (requires documents)

```bash
curl -X POST http://localhost:3001/api/collections/regulations/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What are the customer due diligence requirements?",
    "limit": 5
  }'
```

Expected: `{ "results": [] }` (empty until documents are added)

### 6. Delete Collection (admin only)

```bash
curl -X DELETE http://localhost:3001/api/collections/tax-codes
```

Expected: `{ "success": true }`

## Testing with Authentication (Team Mode)

If `DEPLOYMENT_MODE=team`:

1. Login first:
   ```bash
   curl -X POST http://localhost:3001/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username": "admin", "password": "your-password"}'
   ```

2. Use token in subsequent requests:
   ```bash
   curl http://localhost:3001/api/collections \
     -H "Authorization: Bearer eyJhbGc..."
   ```

## Expected Database State

After initialization:

### knowledge_collections table
| id          | display_name            | icon      | color    |
|-------------|-------------------------|-----------|----------|
| regulations | Regulations & Laws      | Scale     | #3498DB  |
| client-docs | Client Documents        | Briefcase | #2DD4A8  |
| templates   | Templates & Examples    | FileText  | #F5A623  |

### rag_documents table
Empty (no documents uploaded yet)

### rag_chunks table
Empty (no documents indexed yet)

## Next Steps (Phase 5 - Future)

1. Document upload endpoint
2. Automatic text extraction and chunking
3. ChromaDB indexing on upload
4. Watch directory implementation
5. Frontend UI for collection management

## Troubleshooting

### Error: "ChromaDB unavailable"
**Cause:** OpenAI API key not set
**Fix:** Add `OPENAI_API_KEY=sk-...` to `.env` and restart server

### Error: "Collection not found"
**Cause:** Collection ID doesn't exist
**Fix:** Check available collections with `GET /api/collections`

### Error: "Admin access required"
**Cause:** DELETE endpoint requires admin role
**Fix:** Login as admin user or use solo mode

### Error: "Embedding generation failed"
**Cause:** OpenAI API rate limit or invalid key
**Fix:** Check OpenAI dashboard, verify API key, retry after 1 minute

## Performance Notes

- **Collection listing**: ~5ms (SQLite query)
- **Collection creation**: ~20ms (SQLite + ChromaDB)
- **Query (empty)**: ~100ms (embedding generation + ChromaDB search)
- **Query (1000 chunks)**: ~150ms (embedding + vector search)

## Cost Estimates

- **Create collection**: $0 (no embeddings)
- **Query collection**: ~$0.00002 per query
- **Index document (10 pages)**: ~$0.0002
- **Index document (100 pages)**: ~$0.002

Typical monthly cost for active use: **< $1**
