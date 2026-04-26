# Humanitarian Deployment Kit

> **What it is:** A pre-configured ANTON + local LLM + curricula bundle, designed to ship on field-grade hardware to NGO / refugee / humanitarian-context settings.
> **Status:** `.anton humanitarian-deployment-kit` bundle type registered (anton-bundler.ts type 37); humanitarian deployment surface at `/hardware/humanitarian` (`HardwareHumanitarianPage.tsx`); `hw_humanitarian_deployments` table (mig 140).
> **Why it matters:** Most AI tooling assumes connectivity and a Western context. The Humanitarian Deployment Kit is what ships when neither holds.

---

## The problem we built this for

Two patterns dominate AI deployment in humanitarian / NGO / refugee-context settings, and both fail:

1. **Cloud-first AI tools** — assume reliable internet. In Cox's Bazar, eastern DRC, or the West Bank, that's not a safe assumption.
2. **Locally-hosted "lite" models** — strip away the entire compliance / audit / safe-mode layer that makes the tool defensible. Field workers end up with a chatbot that can't be governed.

The Humanitarian Deployment Kit ships **the full ANTON platform** — pillars, audit trails, safe-mode, signed evidence packs — but pre-configured to run **fully locally** via Ollama or Mistral, with curated curriculum packs, on hardware that can survive heat, dust, and intermittent power.

---

## What's in the kit

| Layer | Component |
|---|---|
| **Hardware** | Field-grade SBC or laptop (configured per-deployment via `HardwareHumanitarianPage`) |
| **Local LLM** | Ollama running a small generation model (Llama 3, Qwen, or Mistral local) + `nomic-embed-text` for embeddings |
| **ANTON instance** | Full platform: Work / School / Life pillars, evidence pack, audit trail, signed bundles |
| **Pre-loaded curricula** | School-mode curriculum packs for the deployment country (e.g. Kenya, Uganda, India) |
| **Pre-loaded knowledge packs** | Regulatory / domain knowledge relevant to the context (refugee rights, primary healthcare, microfinance) |
| **Companion App** | PWA + Capacitor build, paired locally to the field instance via mDNS |
| **Identity** | Pre-provisioned instance Ed25519 key, AES-GCM encrypted privkey at rest |

---

## How it ships

1. **Build the kit** at the deployment-planning stage in `HardwareHumanitarianPage.tsx`.
2. **Bundle as `.anton humanitarian-deployment-kit`** — signed by the issuing organisation's instance key.
3. **Ship to the field** on physical media or via initial-sync over satellite / cellular.
4. **Verify on arrival** — the field instance checks the bundle's signature against the issuing org's pubkey before applying.
5. **Deploy** — local pairing via mDNS; companion-app users on a local LAN can immediately reach the instance without any internet.

---

## Why the architecture supports this

This isn't a special build — it's the same code paths everyone runs, configured for offline operation:

- **Knowledge resolver** has a `Combined` mode that prioritises local folders + Chroma over web search.
- **LLM adapter** treats Ollama as a first-class provider; `OLLAMA_BASE_URL=http://localhost:11434` and the same prompt works.
- **mDNS advertiser** (`server/services/mdns-advertiser.ts`) is the same one the Companion App uses for LAN discovery in any setting.
- **Evidence Pack** signs locally; signed bundles can be verified later when connectivity returns.
- **Audit trail** persists in PostgreSQL locally — the consolidated `/audit-trail` viewer (post-C.2) works exactly the same.

---

## What humanitarian users get out

- **A defensible AI workspace** in a setting that usually gets none.
- **Local privacy** — sensitive data (refugee identities, medical records, microfinance ledgers) never leaves the device unless the operator chooses to share a signed bundle.
- **Education continuity** — School pillar with local curricula, voice-first for low-literacy users.
- **Healthcare triage** — Life-pillar `community-health-worker` and `nutrition-health-educator` modules, designed for community settings.
- **Microfinance + livelihoods** — `microfinance-field-officer`, `agricultural-extension-worker`, `mobile-money-agent-trainer` modules.

---

## Operational pattern

The recommended deployment cadence:

| Cadence | Action |
|---|---|
| **Pre-deployment** | Operator configures the kit, runs all relevant curriculum + knowledge packs into the bundle, signs, ships. |
| **Field deployment** | Local lead pairs companion-app users via mDNS QR. No internet required. |
| **Periodic sync** | When connectivity is available, signed evidence packs (deidentified) sync back to the issuing org for monitoring + reporting. |
| **Lifecycle** | Patches ship as `.anton patch-bundle` files, signed by the issuing org, applied verifiably. |

---

## Where to look

- **Surface:** `/hardware/humanitarian` (`src/pages/HardwareHumanitarianPage.tsx`).
- **Schema:** `server/db/migrations-pg/140_hardware_humanitarian.sql` (`hw_humanitarian_deployments`).
- **Bundle type:** `humanitarian-deployment-kit` in `server/services/anton-bundler.ts`.
- **Companion-app architecture:** `/docs/architecture/31-companion-app-gateway.md` — mDNS + multi-instance + offline pairing.
- **School-mode offline path:** `/docs/architecture/future/f-54-school-mode.md` — the offline / humanitarian deployment story.

---

*Document maintained alongside `HardwareHumanitarianPage`. Refresh when a deployment region adds country-specific curriculum coverage or when the local-LLM recommendation changes.*
