# ANTON Apps — Security Re-Validation + UX Roadmap (June 2026)

**Produced 2026-06-10** from six parallel read-only investigations: two security
re-validations (client-side crypto/custody; backend/transport/dependency) and one
deep functions/features/visual-design review per app (Comm, Pay, Business,
Companion). Every finding is ground-truthed to file:line. **Nothing here is
implemented yet — this is the plan to act on.**

---

## Verdict

**Security:** the *architecture* is sound and still matches its specs — native
Keystore signer (HW-backed, key never in JS heap, no custody drift across the
three money apps), wrap-before-delete migration, biometric-first payment gating,
PBKDF2 PINs, Comm's X25519+GCM+AAD+replay E2E stack, agreements defenses, signed
relay envelopes, a strong SSRF guard, and **no secrets in git history**. Relay
threat tests pass (20/21, 1 documented skip). The gaps are **operational/process
and one recurring code drift**, not architectural holes.

**Apps:** all four are functionally mature and the engines underneath are
launch-grade. The shared theme across reviews is **"looks shipped but isn't"** —
a handful of screens that present as finished but are fake or broken, plus
trust/polish gaps. These are cheap to fix and disproportionately damage a
first impression at a money launch.

---

## Decisions needed first (they gate work)

1. **Pay brand colour.** Pay is **sunrise orange `#C97220`** in code today; the
   brief assumed blue (blue is Business). Confirm orange stays, or schedule a
   pivot — any Pay visual work waits on this.
2. **Companion Wallet tab.** Recommendation from the review: **relabel €→FTC and
   hide the dead Send/Receive buttons for July** (don't ship live payments in
   the companion — that's Pay's track). Confirm.
3. **Dark mode scope for July.** Tokens exist in all apps but dark is unverified
   on several stakes screens (Pay review, Companion). In or out for launch?

---

## Lane A — Security remediation

### A1. Operator / launch-gating (no code, or one-line + ops)
| Item | Severity | Source |
|---|---|---|
| Set the real **Play-Integrity project number** in `android-pay/.../strings.xml` + Bahnhof `GOOGLE_CLOUD_PROJECT_NUMBER`; confirm `BAHNHOF_DEV_ATTESTATION_ALLOWED` **unset** in prod. Until then attestation = **no-op** (the documented submit-path gate). | High (launch) | SEC-A, SEC-B |
| **Re-sync the flat-file Bahnhof relay** to HEAD (picks up FCM gating + the legal pages) and convert it to a git checkout. Current delta is feature-absence, not a vuln, but the drift is a standing risk. | Medium | SEC-B |
| **Rotate the 4 dev API keys** that landed in `tasks/wvo5s1y7z.output` (`tasks/` is gitignored — confirmed — so not in git, but rotate anyway). | Medium | SEC-B |
| Set `INSTANCE_KEY_ENCRYPTION_KEY` + a real `ENCRYPTION_KEY` on the launch instance (from the morning sweep; still outstanding). | High (launch) | prior sweep |

### A2. Code (small, pre-launch)
| Item | Severity | Effort | File |
|---|---|---|---|
| **Wire Business's address-poisoning guard.** `addContact` never calls `findSimilarContacts` though the header claims it does and the helper is in-file — the exact recurring drift (Pay+Comm have it). | Medium | S | `src/business/services/address-book.ts:71-94` |
| Add `"loggingBehavior":"production"` to the 3 hand-synced `app/src/main/assets/capacitor.config.json` (debug-build-only gap; release already safe). | Low | S | android-{pay,comm,business} |

### A3. Process / CI (pre-launch or fast-follow)
| Item | Severity | Effort |
|---|---|---|
| **Triage dependency CVEs** (5 crit / 44 high at root — overwhelmingly dev/build tooling: vitest, rollup, protobufjs, shell-quote, xlsx, electron; **no app-runtime crypto/transport lib is critical** — @noble/*, ws, web-push are clean), allowlist the ignorable ones, then **drop `\|\| true`** so `pnpm audit --audit-level=high` blocks. | Medium | M |
| Add **gitleaks + CodeQL** to CI (no SAST or secret-scanning today). | Medium | M |
| Raise/restructure the relay **30/min SEND_COMM cap** (or move group fan-out relay-side) before shipping 256-member groups — today a full group fan-out throttles to ~9 min (no loss, but an invisible latency ceiling). | Medium | M |

### A4. Documentation debt (security)
- Write **`docs/APPS_SECURITY_AUDIT.md`** — the apps have **no consolidated
  security doc**; all app-security knowledge is scattered in memory. This pass is
  its raw material.
- `OWASP_COMPLIANCE.md` (2026-02-19) + `DEPLOYMENT_SECURITY.md` (2026-02-19) are
  **server-only and stale** (zero app coverage; predate attestation/enrollment/
  the empty ENCRYPTION_KEY). `SECURITY_AUDIT.md` is a generic guide still naming
  the project "FCP Workbench." Mark stale or refresh.
- Flag in `PAY_DEVICE_ATTESTATION_SPEC.md`: "attestation provides zero protection
  in prod until the project number is set." Correct the Business `address-book.ts`
  header that over-claims the guard.

**Confirmed still-valid (no action):** native signer custody, wrap-before-delete
migration, secure-store fail-closed on native, biometric-first gating, PINs,
Comm E2E + pubkeyBindsTo + agreements, manifests (allowBackup=false, no deep-link
on money apps, cleartext blocked), SSRF IPv4-mapped-IPv6 bypass closed, signed
envelopes + replay nonce, CORS exact-match allowlist, relay runtime deps clean,
no secrets in history.

---

## Lane B — Pre-launch fixes (real bugs + trust-killers)

These are cheap, real, and damage a money launch most. Grouped by app.

### Business (the merchant workflow has two genuine ship-blockers)
| # | Sev | Eff | Finding | File |
|---|---|---|---|---|
| B1 | **P0** | M | **Refunds fully built + tested but ZERO UI** — no way to refund a confirmed sale; Settings even advertises a refund gate that doesn't exist. Wire `refunds.ts` into KvittoDetail. | `refunds.ts` → `KvittoDetailScreen.tsx` |
| B2 | **P1** | S | **Cash / "Mark as paid" sales never reach `confirmed`** → read "Pending" forever; staff think payments failed. | `SimpleScreen.tsx:142`, `ExtendedScreen.tsx:167` |
| B3 | **P1** | S | **Hardware-back on the QR screen abandons the live sale → Home** (the leftover-QR trap; fixable via `registerBackHandler`). | `SimpleScreen.tsx:239`, `App.tsx:89` |
| B4 | P1 | M | **KvittoView is 100% hardcoded English** — Swedish shop hands customer + accountant an English receipt (the one place i18n leaks to the end customer). | `KvittoView.tsx` |

### Companion (two "looks shipped but fake" screens)
| # | Sev | Eff | Finding | File |
|---|---|---|---|---|
| C1 | **P0** | M | **Voice non-functional everywhere** — the real wired `VoiceMode` was orphaned when the FAB was removed (Pro tile dead-ends to a blank); Standard orb just toggles a boolean ("simulate" comment). Route Pro `'voice'`→`VoiceMode`; have Std reuse its recognizer. | `App.tsx:240`, `StdVoiceScreen.tsx:97` |
| C2 | **P1** | S | **Std Wallet labels FTC as €** + dead Send/Receive + non-flipping arrow. → **relabel + hide** (decision #2). | `StdWalletScreen.tsx:58,152-176,221` |
| C3 | **P1** | S | **Offline queue never flushes** — "will be sent when you reconnect" but nothing drains it; messages silently lost. Add an `onConnectionChange` drain. | `offline.ts:98-113`, `ChatPage.tsx:208` |

### Pay (one real hygiene bug + the confirmation feel)
| # | Sev | Eff | Finding | File |
|---|---|---|---|---|
| P1a | **P1** | S | **"Reset app" leaves data behind** — uses `wipeWallet` not `wipeAllWallets`, so **secondary wallets + keys survive**, plus contacts/schedules/agreements/disclosure acceptance. A device hand-off keeps the prior owner's wallets. | `SettingsScreen.tsx:112` |
| P1b | **P1** | S | **A successful payment doesn't FEEL confirmed** — `@capacitor/haptics` is a declared dep used nowhere; done-screen swaps a static check. Add success haptic + check scale-in. Highest-leverage polish on the highest-stakes moment. | `PaymentDoneScreen.tsx:184` |
| P1c | P1 | M | **No `futurechain:` deep-link intent filter** — URIs from chat/email/browser can't open Pay; user must hand-paste via Scan. | `AndroidManifest.xml` |

### Comm
| # | Sev | Eff | Finding | File |
|---|---|---|---|---|
| Cm1 | **P0** | — | **Risk-disclosure copy is placeholder** pending counsel (gates MiCA wallet creation). Operator/legal, not code. | `disclosure.ts:15` |

---

## Lane C — Launch-quality (P1 features + visual polish)

**Comm:** safety-number/contact-verification UI (the defining missing E2E
primitive — keys already present) · draft persistence per thread · group
poll+location parity (1:1 has them, groups don't) · message pinning · snooze/DND
+ a Pulse notification channel · shared `ScreenHeader`/`Ico` back-button across
~12 hand-SVG wallet/secondary screens · replace the raw-contactHash chat subtitle.

**Pay:** transaction search · friendly self-custody education (re-readable, not
just the legal sheet) · backup-health reminder for funded wallets · manual-pay
fiat-first parity · received-credit/queued-pill colour semantics (use success/
info, not brand orange) · replace native `window.prompt/confirm` with in-app
sheets · fiat value on Home balance.

**Business:** orphan/unmatched-payment reconciliation surface · tipping (the
restaurant persona it explicitly targets) · status-colour tokens (receipts/
Z-reports use the Comm teal, not Business blue) · real "share receipt" (today a
4-line text stub; HTML discarded).

**Companion:** notification→deep-link beyond approvals (missions/briefs can't
route) · history/own-context search · regroup the 18-tile "More" junk drawer ·
add accent+mode toggle to Pro Settings (currently a one-way door) · `onChunk`
append-to-last (so future streaming doesn't spawn new bubbles).

---

## Lane D — Fast-follow (post-July)

Comm: bill-splitting · Pulse search + scroll-to-match · forward multi-select +
groups · 3–4 high-value locale catalogues (es/ar/de/pt) · high-contrast/font-
scale a11y. Pay: editable/received notes · QR-scan-to-add-friend · portfolio
value. Business: multi-staff attribution · thermal/BT receipt printing · product
images/SKU · split-tender · offline-state indicator. Companion: richer mission
push · Pro Settings notification controls · wire the "Modify" approval payload.
Cross-app: a **TalkBack/accessibility pass** (none done; user base is 35–65 +
family/parental scenarios; Play surfaces a11y warnings to reviewers).

---

## Suggested sequencing

1. **Answer the 3 decisions** (brand, Companion wallet, dark-mode scope).
2. **Lane B first** — the real bugs/fakes (B1–B4, C1–C3, P1a–c). Mostly S/M, and
   they remove the worst first-impression risks at a money launch. ~1 week.
3. **Lane A2 + the operator items in A1** in parallel (small code + ops).
4. **Lane C** — launch-quality, pick by value (Comm safety-number, Pay
   education/search/backup-nudge, Business reconciliation, Companion More-menu).
5. **Lane A3/A4 + Lane D** — fast-follow (CI hardening, the apps security doc,
   the accessibility pass).

The per-app reports each carry a ranked top-10 with file:line — this doc is the
merge; drill into the agent reports for the line-level detail when implementing.
