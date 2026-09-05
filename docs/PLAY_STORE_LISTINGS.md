# Google Play — store listing copy (draft)

**Status:** draft, prepared 2026-09-05. Paste-ready per app. Character limits are
enforced by Play: **app name ≤ 30**, **short description ≤ 80**, **full
description ≤ 4000**. Counts are verified by `scripts/check-listing-lengths.py`.

**Why this file exists:** Pay's and Business's listing copy was byte-identical to
Comm's messenger copy, and Companion and Agent had none at all. Three listings
describing a messenger — one of them a point-of-sale terminal — is both wrong and
the shape Play's repetitive-content assessment looks for.

## Rules this copy follows

Every app here is a non-custodial crypto wallet, so the copy must survive a
compliance read as well as a marketing one:

- **No licence implied.** No "regulated", "authorised", "licensed", "approved".
  A MiCA white paper was notified and published; that is a disclosure, not an
  authorisation. Never write "MiCA-compliant" — say what was actually filed.
- **No price, no yield, no investment framing.** FTC has no reference price and
  the app will not invent one.
- **No reversibility.** There is no chargeback and no deposit guarantee; a lost
  recovery phrase is final. Say so in the listing, not only in the app.
- **No "auditable receipts" claim** until the serving node stores the ISO
  message body. It does not today.
- Describe what the app does. Play rejects keyword stuffing, competitor names,
  emoji in the title, and "#1"-style claims.

---

## 1. ANTON Business — `com.futurechain.anton.business`

**App name**
```
ANTON Business
```

**Short description**
```
Turn your phone into the till — sell, receipt, reconcile and close the day.
```

**Full description**
```
ANTON Business turns a single phone into a working point of sale. No terminal to
rent, no acquirer contract, no back office to install.

SELL THE WAY THE COUNTER ACTUALLY WORKS
• Simple sale — one amount, one receipt, done.
• Extended sale — a cart with line items and a VAT breakdown.
• Open tabs — hold an order by table, then charge it or split the bill.
• Item catalogue with prices and templates covering a wide range of trades.

THE PAPERWORK, HANDLED
• Every sale produces a receipt you can reopen, search and export.
• Cash drawer: opening float, cash in and out, and a counted-versus-expected
  reconciliation at day close.
• Day close produces a Z-report and an SIE 4 export for your bookkeeping.
• VAT and currency presets for a range of countries.

PAID IN FTC, SETTLED ON CHAIN
Customers pay by QR or by tapping their phone against yours. Payment settles on
the FutureChain ledger in around ten seconds, and the fee is fixed by rule at
0.1% capped at 0.1 FTC — signed into the transaction, so it cannot be raised
afterwards and there is no priority auction.

YOU HOLD THE KEYS
ANTON Business is a non-custodial wallet. Keys are generated on your device and
stored in the Android Keystore. We cannot move your funds, freeze them, or
recover them for you. Write down your 24-word recovery phrase and keep it
somewhere safe: if you lose it, the funds are gone permanently.

WHAT THIS IS NOT
• Not a bank account. There is no deposit guarantee.
• Not a card terminal. Payments are final — there is no chargeback.
• Not licensed as a crypto-asset service provider. A crypto-asset white paper
  under Regulation (EU) 2023/1114 has been notified to Sweden's
  Finansinspektionen and published; that is a disclosure obligation, not an
  authorisation.
• We do not convert FTC to euro or kronor. Getting in and out of FTC is your own
  arrangement.

Built in Sweden.
```

---

## 2. ANTON Pay — `com.futurechain.anton.pay`

**App name**
```
ANTON Pay
```

**Short description**
```
A self-custody FTC wallet. Scan, tap or send — and you hold the keys.
```

**Full description**
```
ANTON Pay is a wallet for FutureChain (FTC) that keeps the keys on your phone
and the decisions with you.

PAY AND GET PAID
• Scan a QR code to pay a merchant.
• Tap your phone against a terminal that supports it.
• Send to a saved contact or straight to an address.
• Show your own QR to receive, with or without a requested amount.

WHAT IT COSTS
0.1% of the amount, capped at 0.1 FTC and floored at 250 satoshi. You sign that
number into the payment before it leaves your phone, so nobody can recompute it
afterwards. There is no fee auction, no priority lane and no surge. Above 100
FTC the cap binds, so a large payment costs the same as a medium one.

KEEP YOUR OWN RECORDS
• Activity history with filters, search and export.
• Payment details for your own records.
• Scheduled payment reminders.
• A local tax readout you can export, using a rate you set yourself.

YOU HOLD THE KEYS
Keys are generated on your device and stored in the Android Keystore. We cannot
move your funds, freeze them, or recover them for you. Your 24-word recovery
phrase is the only way back into your wallet — write it down, store it offline,
and never photograph it or type it into anything else. If you lose it, the funds
are gone permanently. Optional protection: a payment PIN, an app lock, and a
wallet passphrase as a second factor on every send.

ABOUT THE PRICE OF FTC
FTC has no live reference price. The app will not invent one. Any fiat figure you
see is an estimate at a rate you entered yourself, and it is labelled as such.

WHAT THIS IS NOT
• Not a bank account. There is no deposit guarantee.
• Not a card. Payments are final — there is no chargeback and no reversal.
• Not an exchange. There is no on-ramp, no off-ramp and no swap.
• Not licensed as a crypto-asset service provider. A crypto-asset white paper
  under Regulation (EU) 2023/1114 has been notified to Sweden's
  Finansinspektionen and published; that is a disclosure obligation, not an
  authorisation.

Built in Sweden.
```

---

## 3. ANTON Comm — `com.futurechain.anton.communication`

*Wave 3. Copy drafted, but do not submit until the user-generated-content
reporting flow exists — an app with UGC and no in-app report mechanism is
rejected regardless of how good the listing is.*

**App name**
```
ANTON Comm
```

**Short description**
```
End-to-end encrypted messaging, with a wallet inside the conversation.
```

**Full description (skeleton — finish alongside the UGC work)**
```
Messages, photos, voice notes and calls, encrypted end to end on your device
before they reach the relay. The relay forwards ciphertext it cannot read.

• Direct and group conversations, with reactions and edits.
• Voice messages and calls.
• Share your location once, or live, with a contact you choose.
• Events you can plan together.
• A wallet in the thread: send FTC to someone you are already talking to.

YOU HOLD THE KEYS — both for messages and for money. Keys never leave the
device. We cannot read your messages or move your funds, and we cannot recover
either for you.

[TO ADD BEFORE SUBMISSION: how to report a message or a contact, and how to
block. Play requires an in-app reporting route for user-generated content.]

NOTE ON ENCRYPTION: messages are confidential and key-separated, but the current
protocol is not forward-secret. Do not describe this app as offering forward
secrecy.

Not licensed as a crypto-asset service provider. Payments are final.
```

---

## 4. ANTON Companion — `com.futurechain.anton.companion`

*Held. A reviewer cannot get past the pairing screen without an instance, so
this listing cannot be submitted until a public demo instance with durable
review credentials exists.*

**App name**
```
ANTON Companion
```

**Short description**
```
Approve what your ANTON instance is about to do, from anywhere.
```

**Full description (skeleton)**
```
Companion pairs to an ANTON instance you run yourself and puts its pending
decisions in your pocket.

• An approvals inbox, sorted by severity, with biometric confirmation on the
  ones that matter.
• Ask your instance a question by voice or text.
• Capture a document or a photo and send it straight in.
• Switch between several instances if you run more than one.

Companion holds no keys and moves no funds. It talks only to the instance you
paired it with; there is no ANTON account and no central server in between.

[REQUIRES: a self-hosted ANTON instance. State this in the first line of the
listing so no one installs it expecting a standalone app — and supply demo
instance credentials in Play Console under App access.]
```

---

## 5. ANTON Agent — `com.futurechain.anton.agent`

**Not submitting.** Descoped from this launch. It has no reviewable feature: an
empty list, a paste box only a desktop binary can fill, and a font-size picker.
Recorded here so the next person working the checklist does not discover a fifth
app at submission time and write its listing from memory.

---

## Still needed for every listing (not copy — assets and forms)

| Item | Status |
|---|---|
| App icon, 512×512, 32-bit PNG | **missing** |
| Feature graphic, 1024×500 | **missing** |
| Phone screenshots, 2–8 | raw captures exist; see the note below |
| Privacy policy public URL | **missing** — `/anton/privacy` is now referenced by the apps but is not yet served |
| Data Safety form | drafted in `PLAY_DATA_SAFETY_DECLARATIONS.md` (Agent absent) |
| Financial Features declaration | drafted in `PLAY_FINANCIAL_FEATURES.md` |
| Content rating questionnaire | not started |
| App access (demo credentials) | required for Companion and Agent |

**Screenshot note.** Captures from the Xperia test devices are 1096×2560, which
is 2.34:1. **Play rejects phone screenshots taller than 2:1**, so raw device
captures cannot be uploaded as-is. Pad the width to 1280×2560 (nothing is lost)
rather than cropping 368px of content.

**Business demo-data note.** Before capturing listing screenshots, set the
merchant currency to SEK — the test profile is a Swedish AB (`SE556000-0000`,
kvitto, SIE 4, Z-report) with every price shown in USD — and record a few sales
dated today so the Statistics screen is not an empty state.
