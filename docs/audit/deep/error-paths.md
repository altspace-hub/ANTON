# G.15 — Error Path Audit

**Generated:** 2026-04-26 UTC
**Commit:** `0fabf7f`
**Pattern:** G.15

> Silent error handling is where bugs hide. The happy path is tested; the
> error path rarely is. This audit surfaces where errors are swallowed,
> rethrown without context, or leaked to clients.

## 1. Silent catches

`catch {}` or `catch (e) {}` blocks with no log, no rethrow, no recovery —
errors disappear without trace.

**Single-line empty catches:** 50

Top 30 occurrences (file:line):
```
server/index.ts:943:    } catch {}
server/routes/school.ts:399:      } catch {}
server/routes/school.ts:438:    } catch {}
server/routes/school.ts:648:          } catch {}
server/routes/school.ts:1870:    } catch {}
server/routes/school.ts:2332:      try { await fs.remove(req.file.path); } catch {}
server/routes/school.ts:2365:      } catch {}
server/routes/school.ts:2443:    } catch {}
server/routes/school.ts:2631:    } catch {}
server/routes/school.ts:2638:    } catch {}
server/routes/school.ts:3197:      } catch {}
server/routes/school.ts:3259:      } catch {}
server/services/document-indexer.ts:117:      } catch {}
server/services/market-fundamental-analysis-service.ts:72:    } catch {}
server/services/market-fundamental-analysis-service.ts:105:        } catch {}
server/services/unified-llm-client.ts:378:            } catch {}
src/app/pages/ProfilePage.tsx:41:    } catch {}
src/app/pages/TaskScreen.tsx:45:    } catch {}
src/app/services/api.ts:84:    try { errorMsg = JSON.parse(body).error || errorMsg; } catch {}
src/app/services/offline.ts:60:  } catch {} // localStorage full — silent fail
src/app/services/offline.ts:95:  } catch {}
src/components/knowledge/DocumentUploader.tsx:54:          } catch {}
src/pages/AppGatewayPage.tsx:479:    try { setIntents(await api.get(`/orgs/${orgId}/intents`)); } catch {}
src/pages/AppGatewayPage.tsx:523:    } catch {}
src/pages/AppGatewayPage.tsx:635:    } catch {}
src/pages/AppGatewayPage.tsx:646:    } catch {}
src/pages/AppGatewayPage.tsx:802:    } catch {}
src/pages/civic/CivicEngagementPage.tsx:293:                } catch {}
src/pages/civic/CivicEngagementPage.tsx:709:                                    try { const e = JSON.parse(line.slice(6)); if (e.delta?.text) text += e.delta.text; } catch {}
src/pages/community/CommunityCapabilityCardPage.tsx:28:    } catch {} finally { setLoading(false); }
```

**Severity:** HIGH if in critical path (orchestrator, prompt-builder, AAP, bundle-export); MEDIUM elsewhere.

### Multi-line empty/comment-only catch blocks

Catches whose body is just `/* ignore */` or whitespace-equivalent — same problem.

```
server/connections/api-adapter.ts:156:  } catch (err) {
server/connections/database-adapter.ts:80:  } catch (err) {
server/db/adapters/postgresql-adapter.ts:303:    } catch (err) {
server/db/adapters/postgresql-adapter.ts:378:    } catch (err) {
server/db/adapters/sqlite-adapter.ts:24:    } catch (err: unknown) {
server/db/adapters/sqlite-adapter.ts:39:    } catch (err: unknown) {
server/db/adapters/sqlite-adapter.ts:55:    } catch (err: unknown) {
server/db/adapters/sqlite-adapter.ts:78:    } catch (err) {
server/db/init-postgresql.ts:386:    } catch (e) {
server/db/init-postgresql.ts:437:    } catch (e) {
server/db/init-postgresql.ts:761:    } catch (_e) {
server/db/init-postgresql.ts:818:  } catch (e) {
server/db/init.ts:143:  } catch (e) {
server/db/init.ts:574:    } catch (migErr) {
server/db/init.ts:1105:    } catch (err) {
server/db/init.ts:1837:  } catch (e) {
server/db/init.ts:1970:  } catch (e) {
server/db/init.ts:2173:  } catch (e) {
server/db/init.ts:2220:  } catch (e) {
server/db/init.ts:2292:    } catch (migErr) {
server/db/init.ts:2857:  } catch (e) {
server/db/init.ts:2874:      } catch (e) {
server/db/init.ts:2885:    } catch (e) {
server/db/init.ts:2900:      } catch (e) {
server/db/init.ts:2916:      } catch (e) {
server/db/init.ts:2933:      } catch (e) {
server/db/init.ts:2950:      } catch (e) {
server/db/init.ts:2990:    } catch (_e) {
server/db/init.ts:3019:      } catch (e) {
server/db/init.ts:3024:  } catch (e) {
```

## 2. Stack-trace leakage to HTTP response

Routes that return `err.stack` or whole error objects to the client. Info disclosure.

✅ No HTTP responses found that return raw error stacks.

## 3. Async routes without try/catch or .catch(next)

An `async (req, res) => { ... }` handler with no try/catch produces an unhandled rejection on throw.
Express ≤4 doesn't catch these automatically; the rejection bubbles to process and the client sees a hung connection.

**Async route handlers found:** 1692
**Files with async routes but no try/catch / .catch / asyncHandler:** 0

✅ Every async-route file has at least some error handling.

## 4. `catch (e: any)` — type narrowing skipped

Catches typed as `any` skip the proper unknown→narrow flow. TypeScript 4.4+ defaults to `unknown`; `any` is an explicit override.

**Count:** 11

Top 20:
```
server/db/run_migrations.ts:79:    } catch (err: any) {
server/routes/coding.ts:117:    } catch (error: any) {
server/routes/commands.ts:22:    } catch (error: any) {
server/routes/commands.ts:46:    } catch (error: any) {
server/services/command-parser.ts:191:      } catch (error: any) {
server/services/command-parser.ts:221:      } catch (error: any) {
server/services/embeddings.ts:54:  } catch (error: any) {
server/services/embeddings.ts:87:  } catch (error: any) {
server/services/quality-ratchet.ts:117:    } catch (insertErr: any) {
src/components/shared/CommandPalette.tsx:232:    } catch (error: any) {
src/components/shared/CommandPalette.tsx:285:    } catch (error: any) {
```

**Severity:** LOW (typing debt; replace with `catch (e: unknown)` + narrow with `if (e instanceof Error)`).

## 5. `throw new Error(e.message)` — stack-trace loss

Rethrowing without `{ cause: e }` (Node 16.9+) loses the original stack. Debugging gets much harder.

✅ No bare `throw new Error(e.message)` rethrows found.

## 6. Critical-path silent catches (intersection of §1 and high-stakes services)

Silent catches in services where they're most dangerous: the orchestrator, prompt-builder,
bundle-export, AAP transport, and credential-vault paths.

✅ No silent catches in critical-path files.

---

## Summary

| Check | Count | Severity |
|---|---|---|
| Single-line empty catches | 50 | HIGH if critical-path |
| Stack-trace leaks | 0 | HIGH |
| Raw error responses | 0 | HIGH |
| Async-route files with no error handling | 0 | MEDIUM |
| `catch (e: any)` | 11 | LOW |
| Rethrow without `{ cause: e }` | 0 | MEDIUM |

**Cadence:** weekly + pre-release (per addendum §G.15).
