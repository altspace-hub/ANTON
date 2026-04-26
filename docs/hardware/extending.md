# Extending Hardware

> How to add a new MCU family, a new diagnostic case, a new hardware template, or a new humanitarian deployment kit.

---

## Add a new MCU family HKP

ANTON ships ESP32-WROOM-32E as the seed. To add (e.g.) STM32 or Raspberry Pi Pico:

1. **Build the HKP** as a `.anton hardware-knowledge-pack` bundle (#34):
   - `manifest.json` with id, mcu_family, region, version
   - `components.json` — part numbers, vendors, substitution rules
   - `claims.json` — datasheet / errata claims with evidence URLs
   - `regional-alternatives.json` — substitution table per region (sanctions, availability)
2. **Drop into** `data/hkp/<family>/` (or import via the bundle import flow).
3. **Sign** the bundle with the issuing org's instance Ed25519 key.
4. **Seed the diagnostic-case library** for the family — start with 5–10 cases covering the most common failure modes documented in the family's official errata + community knowledge bases.

---

## Add a new diagnostic case

Diagnostic cases live in `diagnostic_cases` (mig 134). To add:

1. **Author** the case JSON with: symptoms (with `observable_via` + `confidence_when_present`), probable_causes (with `evidence` references), resolutions (with `outcome_tracking`).
2. **Seed via migration** OR programmatically via `POST /api/hardware/diagnostic-cases`.
3. **Set `authoritative=true`** if it's curated by the ANTON Hardware Build team; `false` if user-contributed.
4. **Idempotency** — use `ON CONFLICT (case_id) DO NOTHING` if seeding via SQL (mig 134 was patched to do this after the second-take review).

---

## Add a new hardware template

Hardware templates are reusable scaffolds — BoM + firmware skeleton + regulatory checklist for a class of project. Examples might be: "BLE sensor + LiPo + microcontroller", "LoRa gateway", "industrial 4–20mA logger".

1. **Author** the template under `data/hw-templates/<template-id>/`.
2. **Manifest** with id, name, target_mcu_family, included_components, expected_certifications.
3. **Ship as a `.anton hardware-template` bundle** (#35).
4. **Reference** in the Hardware Templates UI for instantiation.

---

## Add a new humanitarian deployment kit

Per [`/docs/marketing/humanitarian-deployment-kit.md`](../marketing/humanitarian-deployment-kit.md). To author a kit for a new country/context:

1. **Identify** the deployment requirements: hardware target, local LLM (Ollama model), curricula, knowledge packs, language packs.
2. **Build the kit** by combining:
   - Hardware HKP for the target hardware
   - School curricula bundle for the deployment country
   - Regulatory knowledge packs relevant to the operating context
   - Mission templates pre-bound to the local Service Pack
3. **Bundle as `.anton humanitarian-deployment-kit`** (#37) — signed by the issuing org's instance Ed25519 key.
4. **Test the offline path** — verify the kit works with `MARKETS_FETCH_DISABLED=true` and Ollama as the only LLM.
5. **Document** the deployment context in the kit's README.

---

## Add a new patch / lifecycle event

Patches and lifecycle events are signed advisories that flow through `hw_patch_*` and `lifecycle_*` tables.

1. **Author** the patch as a `.anton patch-bundle` (#39) — signature mandatory, since this updates fielded firmware.
2. **Apply** to fleet via the maintain UI; rollout stages enforce gradual deployment.
3. **Lifecycle advisory** as a `.anton lifecycle-advisory-bundle` (#40) — for non-firmware events (component EOL, supplier change, regulatory deadline).

---

## Add a new regulatory certification track

Currently: CE, FCC, RoHS, REACH (per the Regulatory page). To add a new certification:

1. **Add** a row to `hw_regulatory_artefacts` defining the certification (id, name, required_evidence_types, issuing_authority).
2. **Implement** the per-evidence-type collection in the Regulatory UI.
3. **Update** the signoff workflow in `hw_regulatory_signoffs`.

---

## Anti-patterns

- **Don't ship an unsigned `patch-bundle`.** Firmware updates are high-stakes; signature is mandatory.
- **Don't skip the diagnostic-case `outcome_tracking`.** It's how the case library learns over time which resolutions actually work.
- **Don't bypass `hw_community_review_queue`** for community-contributed packs / templates. The queue is the curation gate.
- **Don't hard-code regional alternatives.** Use `hkp_regional_alternatives` rows so they update without code changes.

---

*Maintained alongside `server/services/hkp-service.ts` and the Hardware-related migrations. Refresh when a new MCU family ships, when humanitarian deployment expands, or when new bundle types are added.*
