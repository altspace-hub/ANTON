# RAG Integration Testing Checklist

**Phase**: 4.8 + 4.9 — RAG Integration into Modules & Workflows
**Date**: 2026-02-19

---

## Pre-Flight Checks

- [x] Build succeeds with zero TypeScript errors
- [x] All new components created
- [x] Database migration script updated
- [x] Documentation complete

---

## Unit Tests

### RAGSearchPanel Component

- [ ] **Renders correctly**
  - [ ] Toggle switch displays
  - [ ] Collection list loads
  - [ ] TopK slider renders
  - [ ] Re-rank checkbox displays

- [ ] **State management**
  - [ ] Toggling switch updates `enabled` prop
  - [ ] Selecting collection adds to `selectedCollections`
  - [ ] Deselecting collection removes from `selectedCollections`
  - [ ] TopK slider updates value correctly
  - [ ] Re-rank toggle updates state

- [ ] **Edge cases**
  - [ ] Empty collections list shows helpful message
  - [ ] Loading state displays spinner
  - [ ] API error shows graceful fallback
  - [ ] TopK boundary values (1, 50) work

### ContextBudgetIndicator Component

- [ ] **Token calculation**
  - [ ] Correctly sums system + RAG + user tokens
  - [ ] Percentage calculated accurately
  - [ ] Remaining tokens displayed

- [ ] **Color coding**
  - [ ] Green: 0-70%
  - [ ] Yellow: 70-90%
  - [ ] Red: 90-100%

- [ ] **Warnings**
  - [ ] 70-80%: Shows warning message
  - [ ] 90%+: Shows critical warning
  - [ ] Recommendations displayed correctly

### Citation Extraction

- [ ] **Pattern matching**
  - [ ] Extracts "Source N: filename, page X"
  - [ ] Handles multiple citations
  - [ ] Handles missing page numbers
  - [ ] Ignores false positives

- [ ] **Display**
  - [ ] Citations appear below assistant messages
  - [ ] Numbered correctly [1], [2], etc.
  - [ ] Formatting is readable

---

## Integration Tests

### Knowledge Source Panel

- [ ] **Mode 5b integration**
  - [ ] RAGSearchPanel appears when Mode 5b enabled
  - [ ] Configuration saved to `knowledgeSources.ragSearch`
  - [ ] Panel collapses/expands correctly
  - [ ] Badge "Mode 5b" displays

### Backend RAG Retrieval

- [ ] **Request parsing**
  - [ ] `req.body.ragSearch` correctly extracted
  - [ ] Collections array validated
  - [ ] TopK defaults to 10 if missing
  - [ ] Rerank defaults to true if missing

- [ ] **Semantic search call**
  - [ ] `semanticSearch(db, query)` called with correct params
  - [ ] Results returned with correct structure
  - [ ] Empty results handled gracefully
  - [ ] Error handling works (ChromaDB unavailable)

- [ ] **Context assembly**
  - [ ] RAG context formatted correctly
  - [ ] Citations included in output
  - [ ] Token estimation accurate (±10%)
  - [ ] Appended to `resolved.contextDocuments`

- [ ] **Audit logging**
  - [ ] `rag_chunks` column populated
  - [ ] JSON structure correct
  - [ ] Citations match retrieved chunks
  - [ ] Relevance scores saved

### API Flow

- [ ] **Request/Response**
  - [ ] Frontend sends correct `ragSearch` config
  - [ ] Backend receives and processes config
  - [ ] Response streams correctly
  - [ ] Citations appear in output

---

## End-to-End Tests

### Test Case 1: Basic RAG Search

**Steps:**
1. Navigate to Gap Analysis module
2. Enable Mode 5b (Knowledge Collections RAG)
3. Select "Regulations & Laws" collection
4. Set topK to 10
5. Enable re-rank
6. Type: "What are the CDD requirements in AMLR?"
7. Click Run

**Expected Results:**
- [ ] RAG panel shows "1 collection selected"
- [ ] Context budget shows estimated tokens
- [ ] Backend retrieves 10 chunks from "regulations" collection
- [ ] Response includes CDD information from AMLR
- [ ] Citations appear at bottom (e.g., "AMLR-2024.pdf, page 12")
- [ ] Audit log records RAG usage

### Test Case 2: Multi-Collection Search

**Steps:**
1. Enable Mode 5b
2. Select both "Regulations & Laws" and "Client Documents"
3. Set topK to 20
4. Type: "Compare client AML policy against AMLR Article 8"
5. Run

**Expected Results:**
- [ ] RAG panel shows "2 collections selected"
- [ ] Backend searches both collections
- [ ] Response includes content from both sources
- [ ] Citations reference both regulations and client docs
- [ ] Token budget updates with actual RAG token count

### Test Case 3: Token Budget Warning

**Steps:**
1. Enable Mode 5b
2. Select all collections
3. Set topK to 50
4. Type a long message (500+ words)
5. Observe context budget indicator

**Expected Results:**
- [ ] Context budget shows high usage (>80%)
- [ ] Yellow or red warning appears
- [ ] Warning message recommends reducing chunks
- [ ] User can still submit (not blocked)

### Test Case 4: No Collections Selected

**Steps:**
1. Enable Mode 5b
2. Do NOT select any collections
3. Submit query

**Expected Results:**
- [ ] No error thrown
- [ ] RAG search skipped gracefully
- [ ] Module runs normally without RAG
- [ ] No citations appear

### Test Case 5: Re-ranking Impact

**Steps:**
1. Enable Mode 5b, select "Regulations & Laws"
2. Set topK to 10, re-rank OFF
3. Run query: "CDD requirements"
4. Note results
5. Enable re-rank
6. Run same query

**Expected Results:**
- [ ] Without re-rank: Results in vector similarity order
- [ ] With re-rank: Results include keyword matching boost
- [ ] Citations may differ between runs
- [ ] Both runs complete successfully

### Test Case 6: Citation Verification

**Steps:**
1. Run query with RAG enabled
2. Note cited sources in output
3. Check actual retrieved chunks in audit log

**Expected Results:**
- [ ] All cited sources match audit log entries
- [ ] Relevance scores accurate
- [ ] No phantom citations (Claude inventing sources)
- [ ] Citations formatted correctly

### Test Case 7: Error Handling — ChromaDB Down

**Steps:**
1. Stop ChromaDB service
2. Enable Mode 5b, select collections
3. Submit query

**Expected Results:**
- [ ] Error logged on backend
- [ ] Module continues without RAG (non-fatal)
- [ ] User sees response (without RAG context)
- [ ] No crash or infinite loading

### Test Case 8: Large Context Handling

**Steps:**
1. Enable Mode 5b
2. Select 3 collections
3. Set topK to 50
4. Add 5 uploaded files
5. Use a long system prompt
6. Submit query

**Expected Results:**
- [ ] Context budget shows high usage
- [ ] Warning appears if >90%
- [ ] Claude API call succeeds
- [ ] Output may be truncated if context exceeded
- [ ] No server error

---

## Performance Tests

### Latency Benchmarks

- [ ] **RAG retrieval time**
  - [ ] Single collection, topK=10: <100ms
  - [ ] Two collections, topK=20: <200ms
  - [ ] Re-ranking overhead: +20-50ms

- [ ] **Context assembly**
  - [ ] Formatting 10 chunks: <50ms
  - [ ] Token estimation: <10ms

- [ ] **Total additional latency**
  - [ ] RAG enabled vs disabled: +100-300ms acceptable

### Load Tests

- [ ] **Concurrent requests**
  - [ ] 5 simultaneous RAG queries: All succeed
  - [ ] ChromaDB handles concurrent queries
  - [ ] SQLite locks handled correctly

---

## User Acceptance Tests

### Non-Technical User Flow

**Tester**: Compliance officer (non-technical)

**Steps:**
1. "I want to search my regulatory documents"
2. Navigate to module
3. Find and enable RAG panel
4. Select collections
5. Adjust settings
6. Run query

**Success Criteria:**
- [ ] User finds RAG panel without help
- [ ] Collection selector is intuitive
- [ ] topK slider makes sense ("Focused" vs "Comprehensive")
- [ ] User understands re-rank toggle
- [ ] Citations are useful and readable

### Documentation Usability

**Tester**: New user (first-time RAG user)

**Steps:**
1. Read RAG_USER_GUIDE.md
2. Follow "Step 1: Upload Documents"
3. Follow "Step 2: Enable RAG in Module"
4. Follow "Step 3: Run Query"

**Success Criteria:**
- [ ] User completes all steps without external help
- [ ] Documentation is clear and jargon-free
- [ ] Examples are helpful
- [ ] Troubleshooting section answers user's questions

---

## Regression Tests

### Existing Features Still Work

- [ ] **Mode 1 (Claude Knowledge)**
  - [ ] Web search still works
  - [ ] Focus area input works

- [ ] **Mode 2 (Online Reference)**
  - [ ] URL fetching works
  - [ ] EUR-Lex quick-load buttons work

- [ ] **Mode 3 (Local Folders)**
  - [ ] Folder selection works
  - [ ] Recursive toggle works

- [ ] **Mode 4 (Combined)**
  - [ ] Priority selection works
  - [ ] Combined mode still functional

- [ ] **Mode 5a (Folder RAG)**
  - [ ] Existing folder-based RAG works
  - [ ] Indexing works
  - [ ] Re-indexing works

---

## Browser Compatibility

- [ ] **Chrome/Edge** (Chromium)
  - [ ] RAG panel renders correctly
  - [ ] Slider works
  - [ ] Collections load

- [ ] **Firefox**
  - [ ] All features work
  - [ ] No layout issues

- [ ] **Safari** (if applicable)
  - [ ] RAG panel functional
  - [ ] No CSS issues

---

## Security Tests

### Input Validation

- [ ] **Collection IDs**
  - [ ] SQL injection attempts blocked
  - [ ] Invalid collection IDs handled

- [ ] **TopK values**
  - [ ] Negative values rejected
  - [ ] Values >50 capped
  - [ ] Non-numeric values handled

### Authorization

- [ ] **Team mode**
  - [ ] Users can only access their collections
  - [ ] Admin can access all collections

---

## Audit & Compliance

### Audit Log Verification

- [ ] **RAG entries logged**
  - [ ] `rag_chunks` column populated
  - [ ] JSON is valid
  - [ ] Citations match output

- [ ] **Audit log query**
  ```sql
  SELECT session_id, rag_chunks
  FROM audit_log
  WHERE rag_chunks IS NOT NULL
  LIMIT 10;
  ```
  - [ ] Returns valid JSON
  - [ ] Citations readable

---

## Documentation Review

### User Documentation

- [ ] **RAG_USER_GUIDE.md**
  - [ ] Comprehensive (10 pages)
  - [ ] Step-by-step instructions
  - [ ] Examples for each workflow
  - [ ] Troubleshooting section
  - [ ] Best practices

### Technical Documentation

- [ ] **RAG_IMPLEMENTATION_SUMMARY.md**
  - [ ] Architecture explained
  - [ ] API contract documented
  - [ ] Success criteria met

- [ ] **RAG_ARCHITECTURE.md**
  - [ ] Visual diagrams accurate
  - [ ] Data flow correct
  - [ ] Component interactions documented

---

## Final Checklist

### Pre-Deployment

- [ ] All tests passing
- [ ] Documentation complete
- [ ] No TypeScript errors
- [ ] No console errors in browser
- [ ] Performance acceptable (<300ms added latency)
- [ ] Security review complete

### Deployment

- [ ] Database migration script ready
- [ ] Backup plan in place
- [ ] Rollback procedure documented
- [ ] Monitoring configured (RAG usage, errors)

### Post-Deployment

- [ ] Monitor audit logs for RAG usage
- [ ] Track performance metrics
- [ ] Collect user feedback
- [ ] Address any issues promptly

---

## Test Results Summary

**Date Tested**: _______________
**Tester**: _______________
**Version**: 1.0

| Category | Tests Passed | Tests Failed | Notes |
|----------|-------------|--------------|-------|
| Unit Tests | __ / 20 | __ | |
| Integration Tests | __ / 15 | __ | |
| E2E Tests | __ / 8 | __ | |
| Performance | __ / 5 | __ | |
| UAT | __ / 2 | __ | |
| Regression | __ / 10 | __ | |
| Browser | __ / 3 | __ | |
| Security | __ / 4 | __ | |
| Audit | __ / 2 | __ | |

**Total**: ___ / 69 tests

**Status**: ☐ Ready for Production | ☐ Needs Fixes

**Blocker Issues**:
_________________________________________________

**Notes**:
_________________________________________________

---

**Approved By**: _______________
**Date**: _______________
