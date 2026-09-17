<!--
  CANONICAL SOURCE for the published privacy policy.

  This is the version to publish on the homepage. It is plain Markdown with no
  dependency on the help site's stylesheet or navigation, so it drops into any static
  site generator or CMS.

  Rendered copies exist and MUST NOT drift from this file:
    - docs/help/privacy.html    — the in-product copy, served at /help/privacy.html
    - docs/legal/privacy-policy.html — self-contained HTML, for hosting as-is
    - docs/legal/anton-privacy.html  — styled for futurechain.solutions/anton/privacy

  tests/docs/privacy-policy-consistency.test.ts pins the substantive claims across all
  three. A legal document that says different things at different URLs is worse than
  one that says nothing, and nobody notices the divergence until it matters.

  When the published URL is live, put it in:
    - the Google Play Console listing for all four apps (this is what unblocks them)
    - each app's in-product "About" or settings screen
    - PLAY_DATA_SAFETY_DECLARATIONS.md, decision 4, which is currently open
-->

# Privacy Policy

**For ANTON and the ANTON apps — Companion, Comm, Pay, Business and Agent.**

Version 1.1 · Last updated 5 September 2026

---

## The short version

These apps are local-first. Your documents, messages, contacts, receipts and private
keys stay on your own device or your own server. There is no account system, we cannot
read your messages, and we do not sell or share your data with advertisers.

Three things *do* leave your device, and each has its own section below: AI model
requests, encrypted message routing, and — if you use a wallet — payments written to a
public blockchain, which are permanent.

---

## 1. Who this covers

- **ANTON** — the workspace you install and run yourself, on your own machine or server.
- **ANTON Companion** — the phone app that connects to *your* ANTON instance.
- **ANTON Comm** — end-to-end encrypted messaging, with an optional wallet.
- **ANTON Pay** — a self-custody wallet for FutureChain payments.
- **ANTON Business** — a receive-only merchant point of sale.
- **ANTON Agent** — an assistant app that connects to your own instance or agents.

Where a section applies to only some of them, it says so.

## 2. What stays on your device

By design the following never leave your device or your own server. We have no copy and
no way to obtain one:

- Private keys, recovery phrases and device identity keys — held in the Android Keystore
  or iOS Keychain, or an encrypted local store on desktop.
- Your message history, attachments and voice messages.
- Your contacts and address book.
- Documents you add to ANTON, and anything derived from them.
- Receipts, sales records, Z-reports, inventory, customer lists and tax records.
- PINs and app-lock codes.

Exports — CSV, PDF, SIE, backups — leave only when *you* send them, through your
operating system's own share sheet. We are not a party to that transfer.

## 3. What leaves your device, and why

### 3.1 AI model requests — ANTON, Companion, Agent

When you run a module or ask a question, the text of that request — and any document
content you have chosen to include — is sent to the AI provider *you* have configured,
using *your* API key. That may be Anthropic, OpenAI, Azure OpenAI, Google or Mistral, or
a local model you run yourself, in which case nothing leaves your machine at all.

Those providers handle that data under their own terms, not ours. We receive no copy, and
we add no analytics or telemetry to that path.

### 3.2 Encrypted message routing — Comm

Message content — text, images, video, voice messages, and location if you choose to
share it — is encrypted on your device before it is sent and can be decrypted only by the
contact you sent it to. A relay server forwards the encrypted bytes.

The relay necessarily sees the *routing* information needed to deliver a message: your
public key and a derived routing identifier, and the same for the recipient. It does not
see, and cannot decrypt, the content. Voice and video calls connect device to device
where possible; establishing that connection exposes your IP address to a public STUN
server for NAT discovery, but no call content passes through it.

> **What we do not claim.** The message encryption is confidential and per-message
> key-separated. We do **not** claim forward secrecy for all traffic: a newer ratcheting
> protocol is in place between up-to-date devices, but messages to and from older builds
> still use the previous scheme, and the implementation has not yet been externally
> reviewed. This page will say so plainly when that changes.

### 3.3 Blockchain payments — Pay, Business, and the Comm wallet

If you use a wallet, a payment you send is signed on your device and broadcast to the
**public FutureChain ledger**.

> **This is public and permanent.** Anyone can read it, and it cannot be deleted, edited
> or withdrawn — not by you, and not by us.
>
> What is public includes the amount and fee, the sender and recipient addresses, the
> time, and the block it settled in.

A payment also carries a structured **ISO 20022 message** alongside it, containing the
payer's name, any reference you attach, and — for transfers of €1,000 or more, where
transfer-of-funds rules require it — the originator's postal address. Two things about that message
matter, and both are easy to get wrong:

- **It is not encrypted.** The protocol field it travels in is named `encrypted_data`, which
  is a misnomer. Treat anything you put in a payment reference as readable by whoever handles
  the payment.
- **Today it is discarded after screening.** The node that settles your payment reads the
  message to run compliance screening, then drops it: it is not written to the public ledger
  and is not retrievable afterwards — not by us, not by the recipient, not by you. If a node
  operator later enables message storage, the message becomes retrievable by readers the
  recipient has authorised, and this policy will be updated before that happens.

Reading your balance or history sends your wallet address to the node you have
configured, which lets that node's operator associate the address with your IP address.
You can point the app at a different node, including one you run yourself.

Converting between FutureChain and ordinary currency is arranged between you and your own
exchange partner. That relationship, and any identity checks it involves, is between you
and them; the apps are not a party to it and hold none of that data.

### 3.4 Pairing and abuse prevention — Companion, Comm, Pay, Business

To stop automated abuse of the relay, apps send a random per-installation identifier when
they first enrol, and Pay and Comm may send a Google Play Integrity token. These are not
advertising identifiers and are not linked to your identity. Reinstalling generates a new
one.

### 3.5 Notifications

If push notifications are enabled for your instance, a push token is registered with
Google (FCM) or Apple (APNs). The payload carries only an opaque wake signal — an event
identifier and a severity — never message content. Push is off by default.

### 3.6 Portals — Comm

If you visit or use a portal published by someone else, what you type into it is sent to
*their* ANTON instance, together with your contact hash. That is a transfer to a third
party, and their handling applies to it.

## 4. What we do not do

- We do not run an account system for these apps. There is no server-side profile.
- We do not use advertising identifiers, ad networks or third-party analytics.
- We do not sell or rent personal data.
- We do not read your messages, documents or receipts. For messages, we cannot.
- We do not profile you for advertising, or make automated decisions with legal effect.

## 5. Deleting your data

Because there is no account, deletion is something you carry out on the device.

| App | How to delete |
|---|---|
| ANTON | Delete the data directory and database on your own machine. |
| Companion | Unpair the device, then uninstall — removes the session and device keys. |
| Comm | Sign out, which wipes identity and keys, then uninstall. |
| Pay | Settings → Reset app, then uninstall. |
| Business | Settings → full reset, then uninstall. |

Uninstalling also clears the keys held in the Android Keystore or iOS Keychain.

> **One thing cannot be deleted.** Payments already written to the public ledger are
> permanent. Resetting or uninstalling removes your local copy; it does not, and cannot,
> remove the on-chain record. Please take that into account before you send.

## 6. Your rights

If you are in the EU or the UK, the GDPR gives you rights of access, rectification,
erasure, restriction, portability and objection. For these apps most of those rights are
exercised directly: the data is in your possession, so you can read it, correct it,
export it and delete it without asking us. Where we do act as a controller — for a
support email you send us, for example — use the contact address below.

You also have the right to complain to your national data protection authority.

## 7. Children and School mode

These apps are not directed at children under 13. ANTON's School mode is intended for use
under the supervision of a school or a parent, who is responsible for the pupil's data
under their own policies.

In School mode, ordinary conversations are **not** stored. If safety screening flags a
concern, a record of the *category* only — never what the pupil wrote — is made available
to their teacher.

## 8. Security

Data in transit is protected with TLS, except for connections to a node or instance on
your own machine, where the traffic does not leave the device. Message content is
additionally end-to-end encrypted. Keys are stored in the platform's hardware-backed
keystore where the device provides one.

No system is perfectly secure, and self-custody means that if you lose your recovery
phrase we cannot restore your wallet for you. Keep it somewhere safe and offline.

## 9. Changes to this policy

If we change this policy materially we will update the version and date at the top and
note what changed. Continuing to use the apps after a change means the updated policy
applies.

## 10. Contact

Questions about this policy, or about data we hold as a controller:
**privacy@futurechain.eu**

---

*This policy describes the apps' actual behaviour, derived from an audit of the code
paths that transmit data off the device. It is a factual description, not legal advice,
and should be reviewed by counsel before being relied on for a regulatory filing.*
