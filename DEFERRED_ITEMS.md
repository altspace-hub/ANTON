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
| SEC-12 | Add Zod/schema validation to all `req.body` / `req.query` / `req.params` at route entry | L | 65+ routes need schemas. Batch as a separate validation sprint. Start with highest-risk endpoints (auth, files, claude). |
| SEC-14 | Add CSRF token validation on all state-mutating routes (POST/PUT/DELETE) | M | JWT Bearer header in `Authorization` already provides CSRF protection for all API endpoints (browser SameSite form submissions can't set custom headers). CSRF tokens only needed if/when switching to cookie-based auth (SEC-05). Do together with SEC-05. |
| SEC-16 | Add WebSocket auth validation: reject Socket.IO connections without valid JWT | M | School Mode study rooms use anonymous displayName (no JWT by design). Community namespace uses contactHash. Add JWT gate only for community namespace in team mode deployment. |

---

## Notes

- **SEC-02 + SEC-05 should be done together**: Once JWT moves to httpOnly cookies, the CSP
  `unsafe-inline` for `localStorage` token reads is no longer needed and the nonce system
  can be added in the same PR.

- **SEC-12 priority order** (when tackled): `auth.ts` → `files.ts` → `claude.ts` → `folders.ts`
  → remaining routes alphabetically.

- **SEC-14 is blocked by SEC-05**: Don't implement CSRF tokens until cookies are in use.
