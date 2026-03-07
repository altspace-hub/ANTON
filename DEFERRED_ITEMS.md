# Deferred Items — Phase 0 Carry-overs

These were scoped for Phase 0 but deferred due to complexity or refactor scope.
Pick up in Phase 1/2 or a dedicated security sprint.

Last updated: 2026-03-07

---

## From Phase 0 (Security & Legal)

| ID | Finding | Effort | Reason deferred |
|----|---------|--------|----------------|
| SEC-02 | Remove `unsafe-inline` from Helmet CSP `scriptSrc`; switch to nonce-based CSP | S→L | Requires generating per-request nonce, threading it through SSR/Vite build, and updating every inline script. Non-trivial with Vite. |
| SEC-05 | Move JWT from `localStorage` to `httpOnly; Secure; SameSite=Strict` cookies | M | Requires changing `useAuthStore`, all `getAuthHeader()` callers, CORS `credentials: true` on all routes, and updating the auth route to set/clear cookies. Solo mode still uses localStorage. Coordinate with auth refactor. |
| SEC-09 | Add compression ratio check to ZIP uploads: reject if expanded > 100× compressed size | M | ZIP uploads are not currently a primary flow. Add when ZIP extraction is added as a file type. |
| ~~SEC-12~~ | ~~Zod validation on route bodies~~ | L | **DONE** — `server/lib/validate.ts` + `server/lib/schemas.ts`; applied to auth, files, folders, export, claude, task-agent. |
| SEC-14 | Add CSRF token validation on all state-mutating routes (POST/PUT/DELETE) | M | JWT Bearer header in `Authorization` already provides CSRF protection for all API endpoints (browser SameSite form submissions can't set custom headers). CSRF tokens only needed if/when switching to cookie-based auth (SEC-05). Do together with SEC-05. |
| ~~SEC-16~~ | ~~WebSocket JWT auth~~ | M | **DONE** — `communityNS.use()` middleware in server/index.ts; team mode rejects without valid JWT; solo mode unchanged. |

---

## From Phase 2 (Data Quality)

| ID | Finding | Effort | Reason deferred |
|----|---------|--------|----------------|
| DATA-01 | Fix Art. 12 mislabel: "Enhanced due diligence" → "CDD measures" | S | No mislabel found in current entities.json — AMLR-A12 is correctly labeled "Management Body Responsibility". Improvement plan item may be erroneous. Verify against EUR-Lex before applying. |
| DATA-02 | Fix application date: July 10 2027 → June 30 2025 | S | Current date (July 10, 2027) IS the official AMLR 2024/1624 Art. 74 application date. The "June 30, 2025" in the improvement plan appears to be incorrect. Do NOT change without EUR-Lex confirmation. |
| DATA-03 | Fix CDD threshold: €10k → €15,000 | S | AMLR Art. 20(2)(b) specifies €10,000 for occasional transactions — the current data appears correct. €15,000 was the AMLD4/5 threshold. Improvement plan item may be outdated. Verify against EUR-Lex. |
| DATA-04 | Fix Art. 40 mislabel: "Ongoing monitoring" → "Beneficial ownership registers" | S | No AMLR-A40 entry exists in current entities.json. OBL-MONITOR (Art. 25) is correctly labeled. No mislabel found. Verify if Art. 40 is missing from the pack. |
| DATA-05 | Add missing Art. 22: "Reliance on third parties for CDD" | S | Art. 22 IS in the dataset as OBL-UBO (Beneficial Ownership Identification), which is correct. Third-party reliance is Art. 28 (OBL-TPREL), also present. Improvement plan has wrong article number. |
| DATA-06 | Add "shall" vs "may" distinction to all articles | M | Requires reading each article's actual text to determine obligation_strength. Safe to add as metadata but requires EUR-Lex fact-checking per article. |
| DATA-07 | Add cross-reference structure: `references: [art_id, ...]` | M | Relationships.json already captures cross-references. Adding inline `references` array to entity metadata is feasible but requires systematic review per article. |
| DATA-08 | Validate entire AMLR dataset against EUR-Lex official text | L | Major effort. Do as a dedicated data quality sprint with legal review. |
| KG-01 | Embed all entity_nodes — invisible to semantic search | M | Requires adding entity description embedding to the ChromaDB pipeline. Blocked by OpenAI API key availability in dev. |
| KG-02 | Add embedding dimension validation | M | Requires storing expected dimensions per collection + check at query time. Block on ChromaDB architecture review. |
| KG-03 | Replace SQL LIKE with proper BM25 using better-sqlite3-fts5 | L | Major search refactor. Requires FTS5 virtual table migration and full reindex. |
| KG-06 | Add transitive closure query support | L | Graph traversal feature. Requires recursive CTE or adjacency list expansion. |

---

## Notes

- **SEC-02 + SEC-05 should be done together**: Once JWT moves to httpOnly cookies, the CSP
  `unsafe-inline` for `localStorage` token reads is no longer needed and the nonce system
  can be added in the same PR.

- **SEC-12 priority order** (when tackled): `auth.ts` → `files.ts` → `claude.ts` → `folders.ts`
  → remaining routes alphabetically.

- **SEC-14 is blocked by SEC-05**: Don't implement CSRF tokens until cookies are in use.
