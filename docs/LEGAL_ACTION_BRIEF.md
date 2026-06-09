# ANTON — Legal Action Brief (counsel-engagement prep)

**Status 2026-06-09.** Companion to `docs/GO_LIVE_CHECKLIST.md §5`.

> ⚠️ **This is NOT legal advice.** It is a preparation brief — it organizes what *your own*
> compliance plan (`docs/HOSTED_ANTON_COMPLIANCE_PLAN.md`) already says you need, into an agenda
> and a set of questions to take to a qualified lawyer. Your counsel provides the actual legal
> advice and sign-off. Bring this document (and the cited files) to that meeting.

---

## TL;DR — the three things to do this week

1. **Engage EU counsel now** — ideally Swedish-qualified or with Swedish regulatory (Finansinspektionen)
   knowledge, covering both **MiCA / crypto** and **GDPR / data protection**. This has the longest lead
   time of anything in the launch and **cannot be compressed by engineering.**
2. **Get one question answered in writing (the launch blocker):** *Does FutureChain need a MiCA CASP
   licence to operate, given the self-custody architecture?* (See §1.)
3. **Get the in-app legal copy approved:** the self-custody risk disclosure + real Terms of Service and
   Privacy Policy URLs. (See §3.)

Everything else (DPO, DPAs, Article 30 records, breach runbook, …) is heavier but mostly attaches to
the **hosted relay**, which the launch defers — so it can run in parallel and finish after launch.

---

## 1. The launch blocker: MiCA classification (self-custody)

**The facts (from the repo, for counsel to assess):**
- The launch is **self-custody / local-first**: each user's signing key (Ed25519 / BIP-39) is generated
  and stored only on the user's own device. Users sign transactions **locally**. FutureChain never holds
  a user's private key and never signs on their behalf.
- FutureChain *does* operate infrastructure: a public "light-hub" RPC node (`rpc.futurechain.eu`) that
  **accepts already-signed transactions from users and forwards them** to the network, plus the app
  software. (`docs/FUTURECHAIN_INTEGRATION_PLAN.md §2` — three self-custody transaction paths.)

**The question for counsel (ask in writing):**
> Under MiCA (Regulation (EU) 2023/1114), does operating a public light-hub RPC node that accepts and
> forwards *user-signed* transactions — with no custody of user keys and on-device signing — make
> FutureChain a Crypto-Asset Service Provider (CASP) requiring authorisation? Or does the self-custody /
> "we never hold keys or transfer on the customer's behalf" architecture fall outside the CASP
> definition (Art. 3(9))?

**Why it's the blocker:** if a regulator later deems the light-hub a "transfer service on behalf of
customers," operating it without a CASP licence is unlawful and exposes you to a cease-and-desist (the
apps' on-chain payments would stop) and enforcement. The repo does **not** contain the MiCA filing that
was reportedly submitted or any regulator response — **counsel must see that filing/response.**

**Acceptable outcomes before launch (either one):**
- Counsel confirms **in writing** that the self-custody architecture does not require a CASP licence; **or**
- A CASP licence / registration is obtained (note: this is typically a months-long process and would
  likely slip the launch).

**Action:** add to the go/no-go gates (`GO_LIVE_CHECKLIST.md §9`): *"Counsel confirms in writing that the
self-custody architecture does not trigger MiCA CASP licensing — or a licence is obtained."* Until then,
the apps should not move real FTC value on mainnet.

---

## 2. What gates THIS launch vs what's deferred with the hosted relay

Your compliance plan's production-gate list (`HOSTED_ANTON_COMPLIANCE_PLAN.md §16`) was written for the
**hosted-relay** phase. Because the launch is self-custody / local-first, most of those gates **defer**.

**Required for the scoped launch (minimum):**
- MiCA classification confirmation (§1) — **the blocker.**
- Counsel-approved **risk-disclosure copy** + published **ToS** and **Privacy Policy** (§3).
- A **DPO appointed** + a published contact (mandatory under GDPR Art. 37; modest lead time — start now).
- A monitored **data-subject-rights (DSR) contact** (e.g. `dsr@futurechain.eu`) with a published SLA —
  minimal for self-custody (the operator can't decrypt user data) but it must exist.
- A short **privacy notice** appropriate to local-first apps (what leaves the device: the device IP +
  attestation token when submitting a signed transaction to the node; push tokens *if* push is enabled).

**Deferred with the hosted relay (start now, finish after launch):**
- DPIA sign-off · Bahnhof Article-28 **sub-processor DPA** · full **Article 30** records · **Article 26**
  joint-controller template · full **breach-response** runbook + tabletop · **SCC / adequacy** analysis
  for APNs/FCM (US transfer) — these activate when `relay.futurechain.eu` serves user data. Don't skip
  them later; they become mandatory the moment the hosted relay is in production.

> Confirm with counsel which sub-processors are actually live at launch: if **push notifications** are
> enabled at launch, Apple (APNs) and Google (FCM) process push tokens in the US → that pulls forward the
> SCC/transfer question. If push is off at launch, it defers.

---

## 3. The in-app legal copy (engineering is ready; counsel must approve)

The code is wired; only the **wording + URLs** need counsel:
- **Self-custody risk disclosure** — `src/pay/components/RiskDisclosureSheet.tsx` (placeholder copy,
  marked in-code). Counsel revises the wording; then bump `DISCLOSURE_VERSION` in
  `src/pay/services/disclosure.ts` so every user re-accepts the approved copy.
- **Terms of Service** + **Privacy Policy** — currently placeholder URLs
  (`https://futurechain.eu/legal/{terms,privacy}`). Counsel drafts/reviews; publish at real URLs; update
  the two URL constants in `RiskDisclosureSheet.tsx`.
- Confirm the **"not financial advice"** + **tax** disclaimers are sufficient (the tax engine already
  emits a disclaimer per `FUTURECHAIN_TAX_RULES.md §3`).

---

## 4. First counsel meeting — agenda + what to bring

**Bring (printed or shared):**
1. `docs/HOSTED_ANTON_COMPLIANCE_PLAN.md` — focus counsel on §1 (scope), §2 (controller status), §3
   (lawful bases), §4 (privacy notice), and **§18 (open questions — use it as the agenda)**.
2. `docs/FUTURECHAIN_INTEGRATION_PLAN.md §2` — the architecture showing FutureChain never holds keys
   (the basis for the CASP-exemption argument).
3. `src/pay/components/RiskDisclosureSheet.tsx` — the disclosure copy to approve.
4. **The MiCA filing + any Finansinspektionen response** — *you* must supply this; it's not in the repo
   and counsel needs it first.

**Ask (in writing, for a paper trail):**
1. MiCA CASP classification for the self-custody / light-hub model (§1). **← the blocker**
2. Lawful basis per processing operation (GDPR Art. 6) for the local-first apps.
3. Is the placeholder risk-disclosure + privacy notice content sufficient under GDPR Art. 13 + MiCA?
4. DPO appointment process under Swedish/EU law.
5. If push is enabled: SCC / adequacy approach for APNs/FCM (US transfer), post-Schrems II.
6. ToS scope: self-custody liability, no fund recovery, not-financial-advice, limitation of liability
   given **real money** is now at stake.
7. App-store policy: crypto-wallet listing strategy + any regional restrictions on Play / App Store.

---

## 5. Timeline (~3 weeks)

- **Week 1:** engage counsel (day 1); request/obtain the FI filing + response; start the DPO appointment;
  counsel begins MiCA classification + ToS/Privacy drafting in parallel.
- **Week 2:** publish approved ToS + Privacy URLs; counsel approves disclosure copy → bump
  `DISCLOSURE_VERSION`; create the Article 30 / Article 32 *skeletons* (lists, detail can follow).
- **Week 3:** obtain counsel **written sign-off** for the launch scope (MiCA classification + disclosure +
  ToS/Privacy); go/no-go.

---

## 6. The single biggest legal risk

**Launching real-value mainnet apps before the MiCA classification is confirmed.** If a regulator later
treats the light-hub as an unlicensed CASP transfer service, you face a stop order (apps' payments break)
and enforcement exposure. **Mitigation:** get the written classification answer (or a licence) *before*
the apps move real value — and if it isn't ready by go/no-go, **ship without real-value on-chain
payments, or don't ship the wallet apps**, until it is. (iOS and the hosted relay can always be
fast-follows; this one cannot be worked around.)

---

## 7. Gaps the repo is silent on (raise with counsel)

- The **MiCA filing / FI correspondence** (not in repo — supply it).
- Whether **push** is enabled at launch (decides the US-transfer/SCC question).
- Whether **Bahnhof** is a sub-processor at launch (local-first) or only Phase 2.
- ToS depth for a **real-money** product (runtime-failure / loss-of-funds liability language).
- App-store crypto-wallet listing policy + regional restrictions.

---

*Engineering note:* everything code-side for these is done or trivially ready — the disclosure gate is
wired (just needs approved copy + a `DISCLOSURE_VERSION` bump), the URL constants are one edit, and the
compliance-doc skeletons can be scaffolded on request. The work here is counsel's, not the codebase's.
