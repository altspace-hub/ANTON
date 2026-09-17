# Google Play — Financial Features declaration (draft answers)

**Status:** draft, prepared 2026-09-05. Every answer below is grounded in a file
in this repo; the citations are there so a reviewer (ours or Google's) can check
the claim rather than trust it. **The owner must submit these in Play Console —
this file only removes the "nobody has decided what the answers are" problem.**

Companion doc: `PLAY_DATA_SAFETY_DECLARATIONS.md` (a different form — Data Safety
is about *data*, this one is about *financial functionality*). Both are required.

---

## Why this file exists

Play's **Financial Features** declaration is mandatory for apps in the
*Crypto Exchanges and Software Wallets* category. Until now the repo enumerated
the submission checklist as "title, description, screenshots, Data Safety,
content rating, privacy policy" (`GO_LIVE_CHECKLIST.md`) and did not mention
this form at all.

That matters more than a missed checkbox: **undeclared crypto functionality is
the most common cause of post-publication removal for wallet apps, and the
enforcement lands on the developer account** — it would take all the apps down,
not just the one that was mis-declared.

---

## The one answer that governs everything: non-custodial

For all five apps the answer to *"does the developer have custody of user
funds?"* is **no**, and it is structural rather than a policy promise:

- Keys are generated on the device and held in the Android Keystore
  (`src/pay/services/wallets.ts`, `src/business/services/wallet.ts`).
- The 24-word phrase is shown only behind the reveal gate and is never
  transmitted (`RecoveryPhraseScreen.tsx` in Pay and Business,
  `business/hooks/useRecoveryReveal.ts`).
- The developer operates no key escrow, no omnibus account, and no mechanism to
  move a user's funds. Losing the phrase is unrecoverable — which is precisely
  what "non-custodial" costs the user, and it is disclosed in
  `RiskDisclosureSheet.tsx` before a wallet is created.

**Do not soften this into "we take security seriously" language.** The
defensible claim is mechanical: we cannot move user funds because we do not hold
the keys.

---

## Per-app answers

### ANTON Pay — `com.futurechain.anton.pay`

| Question | Answer |
|---|---|
| Contains financial features? | **Yes** |
| Category | **Crypto Exchanges and Software Wallets** → *software wallet* |
| Custodial? | **No** — non-custodial |
| Does it exchange / convert crypto? | **No.** There is no on-ramp, no off-ramp and no swap. FTC in, FTC out. |
| Does it broadcast transactions? | **Yes** — `POST /submit_signed_transaction` (`src/pay/services/fc-rpc.ts`) |
| Real-money value? | **Yes** — settles FTC on the FutureChain ledger |
| Countries offered | *Owner to decide.* See "Territory" below. |

### ANTON Business — `com.futurechain.anton.business`

| Question | Answer |
|---|---|
| Contains financial features? | **Yes** |
| Category | **Crypto Exchanges and Software Wallets** → *software wallet* |
| Custodial? | **No** — non-custodial |
| Does it broadcast transactions? | **No.** No `submit_signed_transaction` call exists anywhere in `src/business/`. It is receive-only: it watches for incoming payments and reconciles them. |
| Does it hold keys? | **Yes** — and this is the answer to get right. `BackupShowScreen.tsx`, `RecoveryPhraseScreen.tsx` and `AddWalletScreen.tsx` all exist; the app generates a mnemonic and can display it. A watch-only mode also exists (`services/reader-delegation.ts`) where the terminal holds no key. |

> **Correction to an existing doc.** `PLAY_DATA_SAFETY_DECLARATIONS.md` describes
> Business as "a **receive-only** merchant POS. It does **not** sign or broadcast
> transactions itself." The *broadcast* half is correct and verified. The
> sentence nonetheless reads as "no wallet here", and Business does generate,
> store and reveal a 24-word phrase. **Declare it as a software wallet.**
> Declaring otherwise would be the misdeclaration that gets an account actioned.

### ANTON Comm — `com.futurechain.anton.communication`

| Question | Answer |
|---|---|
| Contains financial features? | **Yes** |
| Category | **Crypto Exchanges and Software Wallets** → *software wallet* |
| Custodial? | **No** — non-custodial |
| Does it broadcast transactions? | **Yes** — the in-thread wallet signs and submits |
| Additional surfaces | Messaging, user-generated content, and in-thread games. The games do **not** touch the wallet — verified — so this is not a gambling declaration. Keep it that way; wiring a wager to the wallet changes the app's category. |

### ANTON Companion — `com.futurechain.anton.companion`

| Question | Answer |
|---|---|
| Contains financial features? | **Balance display only** |
| Holds keys? | **No** |
| Broadcasts? | **No** |

Companion pairs to the user's own self-hosted ANTON instance and can show a
wallet balance. It holds no key material and cannot move funds. Declare the
financial surface honestly rather than claiming none — a reviewer will see a
balance on screen.

### ANTON Agent — `com.futurechain.anton.agent`

**Not submitting in this wave** (see the launch roadmap). If it is ever
submitted: balance display only, no key custody, no broadcast — same shape as
Companion. Note that the repo's launch documents all say "four apps"; Agent
being absent from them is the reason this row exists.

---

## Territory — an owner decision, not a code fact

Play asks which countries you offer financial features in, and for some
categories requires evidence of local licensing or registration. Two things are
true at once and both must be stated plainly:

- **A MiCA crypto-asset white paper was notified to Finansinspektionen and
  published.** That is a disclosure obligation under Regulation (EU) 2023/1114.
- **That is not an authorisation.** No CASP authorisation is held or pending.

A non-custodial software wallet is generally not itself a CASP, which is why the
notification route applies. But the answer to "are you licensed?" is **no**, and
every user-facing surface must match. The in-app disclosure was corrected on
2026-09-05 — it had said authorisation was "pending publication", in 38
languages (`src/pay/pages/settings/SettingsScreen.tsx`, and every
`src/pay/i18n/locales/*.json`).

**Owner to decide:** launch territory. Sweden/EEA only is the defensible
starting point. Adding the US brings state money-transmitter analysis that
nothing in this repo has done.

---

## Before you submit

1. Answer the territory question above and record the decision here.
2. Submit the declaration for **each** app — it is per-listing, not per-account.
3. Keep this file in step with the app. If Business ever gains a send path, or
   Comm's games ever touch the wallet, the declarations change and stale answers
   become false ones.
4. Add the line item to `GO_LIVE_CHECKLIST.md` and `OPERATOR_TODO.md`, both of
   which currently enumerate the submission forms without this one, and both of
   which say "four apps".
