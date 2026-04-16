# RAG Integration User Guide

## Overview

The RAG (Retrieval-Augmented Generation) system allows Claude to intelligently search and retrieve relevant information from your organized knowledge collections. Instead of sending entire documents, RAG retrieves only the most relevant passages, making queries faster and more accurate.

---

## Knowledge Collections

Knowledge is organized into **Collections** — thematic groupings of documents. Three default collections are provided:

1. **📏 Regulations & Laws** (Blue)
   - EU/national regulations, directives, legal frameworks
   - Example: AMLR, DORA, MiCA, GDPR

2. **💼 Client Documents** (Teal)
   - Client policies, procedures, internal documents
   - Example: AML Policy, KYC Procedures, BWRA

3. **📄 Templates & Examples** (Gold)
   - Best-practice templates, past deliverables, examples
   - Example: Gap analysis templates, report formats

You can create custom collections to organize your knowledge base as needed.

---

## How to Use RAG in Modules

### Step 1: Upload Documents to Collections

1. Navigate to **Knowledge Base** → **Collections**
2. Select a collection (or create a new one)
3. Click **Upload Documents**
4. Upload your files (.pdf, .docx, .txt, .md)
5. Documents are automatically chunked and indexed

**Supported file types:**
- PDF documents
- Word documents (.docx)
- Text files (.txt, .md)
- Excel files (.xlsx) — extracted as text

### Step 2: Enable RAG in a Module

When working in any module (Gap Analysis, Document Creation, etc.):

1. Scroll to **Knowledge Sources** section
2. Find **Knowledge Collections (RAG)** — labeled "Mode 5b"
3. Toggle it **ON**
4. Select which collections to search
5. Configure retrieval settings:
   - **Chunks to Retrieve**: 5-50 passages (default: 10)
   - **Re-rank**: Enable for better precision (recommended)

### Step 3: Run Your Query

Simply describe your task as usual. The RAG system will:

1. Use your message as the search query
2. Search selected collections for relevant passages
3. Retrieve the most relevant chunks
4. Add them to Claude's context automatically
5. Claude uses these sources to answer your question

---

## Configuration Options

### Chunks to Retrieve (Top-K)

Controls how many passages are retrieved:

- **5-10**: Focused, precise answers
- **10-20**: Balanced coverage
- **20-50**: Comprehensive, broad context

**⚠️ Token Budget Warning**: Higher chunk counts use more tokens. If you approach the model's context limit, reduce the number of chunks.

### Re-ranking

Re-ranking combines vector similarity (70%) with keyword matching (30%) for better precision.

- **Enabled** (recommended): More accurate results, slight performance cost
- **Disabled**: Faster, but may include less relevant chunks

### Show Relevance Scores

When enabled, Claude's output will include relevance percentages for each retrieved source.

---

## Understanding Results

### Citations

Claude automatically cites sources when answering. Look for:

- **Source N: filename.pdf, page 12**
- **[N]** references in the text

Citations appear at the bottom of assistant messages in the conversation thread.

### Relevance Scores

Each retrieved chunk has a relevance score (0-100%):

- **90-100%**: Highly relevant
- **70-90%**: Relevant
- **50-70%**: Moderately relevant
- **Below 50%**: Low relevance (may be noise)

If results seem off-topic, try:
- Refining your query
- Selecting different collections
- Reducing the number of chunks

---

## Token Budget Management

RAG adds retrieved passages to Claude's context, consuming tokens.

### Context Budget Indicator

The **Context Budget** panel shows:
- **System**: Base prompt tokens
- **RAG**: Retrieved chunk tokens
- **User**: Your message tokens
- **Available**: Remaining context capacity

### Warnings

- **Yellow (70-80% used)**: High usage, consider reducing chunks
- **Red (90%+ used)**: Approaching limit, reduce chunks or use a larger model

### Best Practices

1. **Start small**: Begin with 5-10 chunks, increase if needed
2. **Monitor the budget**: Check the Context Budget indicator before running
3. **Use larger models**: Opus 4.7 has a 200k token context (vs. 128k for Sonnet)
4. **Be specific**: Precise queries retrieve more relevant chunks

---

## Modes Comparison

### Mode 5a: Indexed Knowledge Base (Folders)

- Index entire local folders
- Full-text retrieval
- Good for: Broad document libraries

### Mode 5b: Knowledge Collections (RAG)

- Organized, curated collections
- Semantic vector search
- Re-ranking for precision
- Good for: Structured knowledge bases, compliance work

**Recommendation**: Use **Mode 5b (Collections)** for compliance modules where accuracy and citation are critical.

---

## Common Workflows

### 1. Gap Analysis with RAG

**Goal**: Compare client policy against AMLR regulation

1. Upload client policy to **Client Documents** collection
2. Upload AMLR text to **Regulations & Laws** collection
3. In Gap Analysis module:
   - Enable **Knowledge Collections (RAG)**
   - Select both collections
   - Set chunks to 15-20 for comprehensive coverage
4. Run: "Compare client AML policy against AMLR requirements"

### 2. Regulatory Monitor with RAG

**Goal**: Check if new regulation impacts existing policies

1. Upload new regulation to **Regulations & Laws**
2. Upload current policies to **Client Documents**
3. Enable RAG in Regulatory Monitor
4. Ask: "How does this new regulation affect our current AML framework?"

### 3. Document Creation with RAG

**Goal**: Draft a new policy using templates and regulations

1. Upload templates to **Templates & Examples**
2. Upload reference regulations to **Regulations & Laws**
3. Enable RAG in Document Creation
4. Request: "Draft a Sanctions Policy following best practices"

---

## Troubleshooting

### No Results Retrieved

**Possible causes:**
- Query too vague
- Selected collections don't contain relevant documents
- Documents not yet indexed

**Solutions:**
- Refine your query to be more specific
- Select different collections
- Re-index collections (Collections page → Reindex button)

### Results Not Relevant

**Possible causes:**
- Collections contain unrelated documents
- Re-ranking disabled
- Query doesn't match document terminology

**Solutions:**
- Enable re-ranking
- Use exact terms from the documents
- Try hybrid search (combine Mode 3 local folders + Mode 5b RAG)

### Context Limit Exceeded

**Possible causes:**
- Too many chunks retrieved
- Large system prompt
- Long conversation history

**Solutions:**
- Reduce chunks to 5-10
- Start a new session (shorter history)
- Use Opus 4.7 (200k context vs. 128k)

---

## Advanced: Custom Collections

Create collections for specific use cases:

1. Go to **Knowledge Base** → **Create Collection**
2. Name: e.g., "DORA Technical Standards"
3. Description: Purpose and content
4. Icon: Visual identifier
5. Color: Brand or category color
6. Upload relevant documents

**Examples:**
- **Jurisdiction-specific**: "Swedish AML Regulations"
- **Client-specific**: "Nordea Compliance Library"
- **Topic-specific**: "Sanctions Guidance Documents"

---

## Audit Trail

All RAG retrievals are logged in the **Audit Log**:

- Which collections were searched
- How many chunks retrieved
- Relevance scores
- Citations used

Access: **Settings** → **Audit Log** → Filter by session

---

## Best Practices Summary

✅ **DO:**
- Organize documents into thematic collections
- Start with 10 chunks, adjust as needed
- Enable re-ranking for critical work
- Monitor context budget
- Verify citations in outputs

❌ **DON'T:**
- Upload entire folder structures without curation
- Use 50 chunks by default (too much noise)
- Disable re-ranking for compliance analysis
- Ignore context budget warnings

---

## Support

For questions or issues with RAG:

1. Check the **Context Budget** indicator
2. Review the **Audit Log** for RAG entries
3. Try hybrid mode (Mode 3 + Mode 5b) for comparison
4. Contact your system administrator

---

**Version**: 1.0
**Last Updated**: 2026-02-19
**Component**: RAG Integration (Phase 4.8 + 4.9)
