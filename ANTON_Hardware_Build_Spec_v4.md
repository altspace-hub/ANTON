# Hardware Build — Tier 5 of the Coding Area (v4)

## Engineering Specification for Claude Code

*Fourth-pass specification. Supersedes v3. This version is purely engineering-focused — it specifies what ANTON can do with hardware and how to build it. Narrative content, partnership prerequisites, and whitepaper-adjacent sections have been removed. The humanitarian requirements from v3 are preserved as engineering constraints (offline-first, i18n, legacy hardware support, capacity-transfer artefacts) because they sharpen the product for every user.*

*Launch scope is three paths deep for ESP32 only. Arduino and Raspberry Pi support ships later via the same architecture. Every design decision in this spec assumes extensibility — hardware families, paths, bundle types, and knowledge-base content are all extension points that future Claude Code work fills in.*

---

## 0. Design Philosophy and Launch Scope

### 0.1 What v4 builds

- **Three paths** — Diagnose, Maintain, Develop — fully implemented for ESP32
- **Three-layer knowledge base** — Specification (hybrid SheetsData MCP + own content), Diagnostic (community-contributed outcome-verified cases), Lifecycle (CVE/EOL/regulatory feeds)
- **Hardware Engineering area** with path-aware personas and modules
- **Firmware quality pipeline** with mandatory static analysis, SBOM, CVE scan, simulation
- **Seven bundle types** covering HKPs, templates, projects, patches, diagnostic cases, lifecycle advisories, and humanitarian deployment kits
- **Tier classification** (1/2/3) as a structural axis independent of paths
- **Regulatory artefact generation** as a capability (CRA/RED/MDR templates — ANTON produces them, user is responsible economic operator)
- **Full ANTON platform integration** — Missions, Service Packs, Reasoning Trails, Quality Ratchet, Apprentice Model, AAP, MCP

### 0.2 What v4 does not build at launch

- Arduino and Raspberry Pi support (architectural scaffolding only — Section 11)
- Additional hardware families (STM32, nRF52, RP2040 variants) — same
- Additional workflows beyond the three paths (e.g., dedicated reverse-engineering mode)
- Native PCB design (use Flux/Quilter/JITX for that; `hardware-project` bundles can import from their outputs)
- Custom silicon or ASIC support

### 0.3 Design principles that shape everything

**Hardware-family-agnostic interfaces.** No code is hardcoded to ESP32. Every module, workflow, HKP schema, and persona-activation rule accepts `hardware_family` as a parameter. A hardware family registry maps family IDs to family-specific configuration (supported protocols, toolchain, simulator, pin-naming convention, primitive operations). At launch the registry contains only `esp32`; adding `arduino` or `raspberry_pi` later is adding content and configuration, not rewriting code.

**Offline-first.** Every path, every workflow, every HKP interaction, and every bundle operation works without internet. Online connectivity enhances (fresh CVE feeds, SheetsData queries for new parts, community contributions) but never blocks. This is non-negotiable.

**i18n at every layer.** All user-facing content — symptom descriptions, assembly guidance, training materials, capacity-transfer artefacts — passes through the ANTON i18n infrastructure. Generation output produces the user's working language, not only English.

**Extension points are first-class.** Every abstraction that could grow has a documented extension mechanism. New hardware families, new diagnostic case types, new lifecycle event types, new bundle types, new paths, new expert personas — each has a "how to add this" specification.

**Integration over rebuild.** Where mature ecosystem tools exist (PlatformIO, Wokwi, Renode, SheetsData, NVD, GitHub Security Advisories, Clang-tidy, Cppcheck, CycloneDX tooling), consume them via MCP or direct integration. Do not rebuild.

**Claim provenance throughout.** Every HKP claim, every diagnostic case resolution, every lifecycle event carries verification level and attribution. Firmware generation and maintenance operations surface uncertainty rather than hiding it.

---

## 1. Investigation-First Protocol

**Read and understand the following before writing any code.** Extend existing ANTON infrastructure; do not duplicate.

### 1.1 Must-read existing files

**Coding area foundation:**
- `CODING_AREA_SPEC.md` — Tier 5 Hardware Build is a new tier in this area
- `CodingLandingPage.tsx` and existing tier pages

**Seven-layer prompt architecture:**
- `server/services/prompt-builder.ts` — HKP layers attach at Layer 6 (Knowledge Source Integration); path-aware layer prioritisation happens here
- `server/areas/system-foundation.md`
- Existing area layouts as pattern reference

**Bundle system:**
- `server/services/anton-bundler.ts`, `antonImport.ts`, `antonExport.ts` — seven new bundle types extend this infrastructure

**Cross-area expert injection:**
- Existing Cybersecurity (Area 9), Software Engineering (Area 15), Data & Analytics (Area 7), FCP (Area 1), Legal (Area 2), Healthcare (if present) area personas — Hardware Build reuses this injection mechanism verbatim

**Knowledge source system:**
- `server/services/knowledge-source.ts`, `folder-indexer.ts`, `file-processor.ts` — the 4-mode resolver. Three HKP layers attach through this system

**Missions, Service Packs, Reasoning Trails:**
- Existing Mission lifecycle and task graph — Diagnose and Maintain operations register as Missions
- Service Pack registry — deployment workflows register here
- Reasoning Trail signing — every path operation produces a signed trail

**Quality, autonomy, governance:**
- `server/services/quality-ratchet.ts` — path-specific quality dimensions added
- `server/services/apprentice.ts` — progression per-path per-hardware-family
- Compliance-as-Code hooks

**Project/filesystem:**
- Hardware projects live in `~/hardware/`

**Offline capabilities:**
- Existing Ollama integration (`unified-llm-client.ts`, `model-adapter.ts`). Hardware Build must work fully offline via Ollama

**i18n infrastructure:**
- Existing i18n scaffolding per platform memory — all user-facing generation passes through it

**Existing Regulatory Radar:**
- `server/services/regulatory-radar.ts`, `RadarPage.tsx` — extended to feed the Lifecycle knowledge layer

**MCP client:**
- Existing MCP consumer infrastructure — used to integrate SheetsData and similar external hardware-knowledge services

### 1.2 Integration principle

*Does this feel like it belongs in ANTON, or does it feel like a separate product?* It must feel like ANTON. Same design language, same quality standards, same transparency, same integration with every existing capability.

---

## 2. Architectural Principles for Extensibility

Before the concrete capabilities, the patterns that make v4 extensible. Claude Code implements these patterns first; extension work in future sprints follows them.

### 2.1 Hardware family registry

A single registry defines all supported hardware families and their capabilities. Launch content: `esp32` only. Reserved entries with schema support but no content: `arduino`, `raspberry_pi`, `stm32`, `nrf52`, `rp2040`.

```typescript
// server/hardware/family-registry.ts

export interface HardwareFamily {
  id: string;
  display_name: string;
  manufacturer_context: string;
  
  // Toolchain
  toolchain: {
    build_system: 'platformio' | 'arduino-ide' | 'raspberry-pi-pico-sdk' | string;
    default_ide_config: Record<string, unknown>;
    supported_frameworks: string[];
  };
  
  // Simulation support
  simulation: {
    primary_simulator: 'wokwi' | 'renode' | 'qemu' | 'none';
    supported_variants: string[];
    integration_module: string; // import path for the family-specific simulation module
  };
  
  // Static analysis
  static_analysis: {
    primary_tool: 'clang-tidy' | 'cppcheck' | 'pylint' | string;
    config_template_path: string;
  };
  
  // Pin naming conventions
  pin_naming: {
    convention: string; // e.g., 'gpio-numeric', 'digital-analog-split', 'bcm-numbering'
    pin_map_schema_version: string;
  };
  
  // Secure update support
  secure_update: {
    default_supported: boolean;
    mechanism: 'ota-signed' | 'serial-only' | 'none';
    documentation_ref: string;
  };
  
  // HKP-related capabilities
  hkp_support: {
    photo_identification_available: boolean;
    sheetsdata_coverage: 'full' | 'partial' | 'none';
    vendor_advisory_feeds: string[]; // URL patterns for vendor security feeds
  };
  
  // Enabled paths per family (for gradual rollout)
  enabled_paths: {
    diagnose: boolean;
    maintain: boolean;
    develop: boolean;
  };
  
  // Common variants within the family (e.g., ESP32-WROOM-32, ESP32-S3)
  known_variants: string[];
  
  // Internationalisation — what languages have been validated for this family
  i18n_validated_languages: string[];
  
  // Status
  status: 'launch' | 'beta' | 'reserved' | 'deprecated';
}

export const HARDWARE_FAMILIES: Record<string, HardwareFamily> = {
  esp32: { /* fully populated at launch */ },
  arduino: { /* reserved entry — schema complete, status: 'reserved' */ },
  raspberry_pi: { /* reserved entry */ },
  stm32: { /* reserved entry */ },
  nrf52: { /* reserved entry */ },
  rp2040: { /* reserved entry */ },
};
```

Every module, workflow, HKP, and persona activation looks up family-specific behaviour from this registry. Family-specific code lives in `server/hardware/families/{family_id}/` directories with a common interface defined in `server/hardware/family-interface.ts`. Launch ships `server/hardware/families/esp32/` fully populated; other directories have `README.md` stub explaining the extension pattern.

### 2.2 Extension points throughout

The following components have explicit extension mechanisms:

**HKP layer content.** New diagnostic case types, new lifecycle event types, new specification sections can be added by extending schemas with additive migrations. Existing bundles remain valid.

**Bundle types.** New bundle types register through `anton-bundler.ts` following the existing 17+ bundle type pattern. Each bundle type carries a schema version for forward compatibility.

**Paths.** The v4 spec ships three paths (Diagnose, Maintain, Develop). Future paths (e.g., a dedicated Reverse Engineer path for completely undocumented hardware, or a Deploy-at-Scale path for coordinated fleet provisioning) can be added by extending `server/hardware/paths/` with the same interface the three launch paths use.

**Expert personas.** New personas follow the existing `server/areas/hardware-engineering/personas/` structure with path-default tagging in the persona metadata.

**Knowledge-base feed ingestors.** Lifecycle layer feeds (NVD, vendor advisories, regulatory sources) register through a feed-ingestor interface. Adding a new feed is implementing `LifecycleFeedIngestor` and registering it.

**External tool integrations.** PlatformIO, Wokwi, Renode, Clang-tidy, CycloneDX, SheetsData — each integrates through a dedicated adapter in `server/hardware/integrations/`. Adding a new tool is implementing the relevant adapter interface.

**i18n content.** Localisation is content-driven; adding a new language is adding content files, not code changes.

### 2.3 Schema versioning discipline

All HKP content, bundle formats, and database tables carry explicit schema versions. Migrations are additive wherever possible. Breaking schema changes require explicit migration code and an upgrade path for existing content.

Schema version fields:
- `hkp_schema_version` on HKP bundles
- `bundle_schema_version` on all `.anton` bundles
- `lifecycle_history_schema_version` on `hardware-project` bundles
- Database migrations follow existing ANTON migration patterns

### 2.4 Why this matters

Claude Code is likely to do significant extension work on this spec over time — adding Arduino, adding Raspberry Pi, adding new paths, adding new feed sources, adding new bundle types, adding new tool integrations. If the architecture is rigid, each extension requires rewriting core interfaces. If the architecture is extensible by design, each extension is mechanical.

**Invest the extra time at launch in clean interfaces and explicit extension points.** The second hardware family costs a fraction of what the first did. The tenth feed ingestor is trivial. This is the engineering discipline that makes Hardware Build world-class over time, not just at launch.

---

## 3. The Three-Layer Knowledge Base

### 3.1 Overview

The HKP contains three integrated layers:

| Layer | Purpose | Primary source | Update cadence |
|---|---|---|---|
| Specification | What the device is | Hybrid: SheetsData MCP for widely-used parts + ANTON-curated content for gaps | Rarely |
| Diagnostic | How the device fails | Community-contributed cases, outcome-verified | Continuous |
| Lifecycle | How the device evolves | Automated feeds (NVD, vendor, EOL, regulatory) + community patches | Event-driven |

Path usage:
- Diagnose: diagnostic layer primary, specification and lifecycle as reference
- Maintain: lifecycle layer primary, specification as reference, diagnostic as "what else might break"
- Develop: specification layer primary, lifecycle for dependency safety, diagnostic for design-around-failure-modes

### 3.2 Specification layer (hybrid architecture)

For widely-used parts covered by commercial databases, the specification layer is a **thin wrapper** that queries SheetsData via MCP at generation time, caches results for offline use, and applies ANTON's claim classification on top of the fetched data.

For parts not covered by commercial databases — obscure, legacy, regional, or recently released — ANTON maintains own specification content as part of the HKP bundle.

**File structure:**

```
my-esp32-wroom-32e-hkp.anton/specification/
├── source.json               # where this specification comes from
├── hardware-specs.json       # pin map, electrical limits, timing
├── protocols.json            # I2C, SPI, UART, wireless
├── power.json                # power sources, sleep modes
├── environmental-profiles.json  # environmental hardening per deployment context
├── local-sourcing-alternatives.json  # regional parts availability
├── safety.md                 # safety considerations
├── primitives/               # verified primitive operations
│   ├── blink.ino
│   ├── read-adc.ino
│   ├── i2c-scan.ino
│   ├── wifi-connect.ino
│   └── deep-sleep.ino
├── tests/
│   ├── smoke-test.ino
│   └── authenticity-check.ino  # counterfeit detection
├── sbom.cdx.json             # CycloneDX SBOM for contained libraries
└── claims.json               # claim classification: datasheet-verified | community-verified | physically-verified | AI-unverified
```

**`source.json` structure:**

```json
{
  "schema_version": "1.0",
  "primary_source": "sheetsdata-mcp | anton-curated | community | user-generated | legacy-identified",
  "sheetsdata_query": {
    "part_number": "ESP32-WROOM-32E",
    "manufacturer": "Espressif",
    "last_fetched": "2026-04-17T14:30:00Z",
    "cache_expiry": "2026-10-17T14:30:00Z"
  },
  "anton_curated_supplement": ["environmental-profiles", "local-sourcing-alternatives", "primitives"],
  "provenance_signatures": ["..."]
}
```

The supplement list identifies sections where ANTON's content augments or overrides the SheetsData response. Environmental profiles, local-sourcing alternatives, and verified primitive operations are typically not available from SheetsData — these are ANTON-curated in every HKP.

**Claim classification:**

Every value in `hardware-specs.json`, `protocols.json`, `power.json` carries a classification in `claims.json`:

```json
{
  "claims": {
    "hardware-specs.adc.effective_resolution_bits": {
      "value": 9,
      "classification": "community-verified",
      "verified_by": ["contributor-abc", "contributor-xyz"],
      "verification_count": 23,
      "datasheet_says": 12,
      "notes": "Datasheet claims 12 bits; community testing shows effective 8-9 bits due to non-linearity"
    },
    "hardware-specs.gpio.max_current_per_pin_ma": {
      "value": 40,
      "classification": "datasheet-verified",
      "source": "Espressif ESP32 datasheet v3.9, page 27"
    }
  }
}
```

Firmware generation consults `claims.json` when using specification values in critical paths. AI-unverified claims in critical firmware generate explicit warnings.

**Database schema:**

```sql
CREATE TABLE hardware_knowledge_packs (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  manufacturer TEXT NOT NULL,
  part_number TEXT NOT NULL,
  revision TEXT,
  hkp_version TEXT NOT NULL,
  hkp_schema_version TEXT NOT NULL,
  installed_at TEXT NOT NULL,
  primary_source TEXT NOT NULL,
  source_last_refreshed TEXT,
  signed_by TEXT,
  signing_verified INTEGER DEFAULT 0,
  metadata_json TEXT NOT NULL,
  UNIQUE(manufacturer, part_number, revision, hkp_version)
);

CREATE TABLE hkp_claims (
  id TEXT PRIMARY KEY,
  hkp_id TEXT NOT NULL REFERENCES hardware_knowledge_packs(id),
  claim_path TEXT NOT NULL,
  claim_value TEXT NOT NULL,
  classification TEXT NOT NULL CHECK(classification IN ('datasheet-verified','community-verified','physically-verified','AI-unverified')),
  verified_by TEXT,
  verification_count INTEGER DEFAULT 0,
  evidence_ref TEXT
);

CREATE TABLE hkp_components (
  id TEXT PRIMARY KEY,
  hkp_id TEXT NOT NULL REFERENCES hardware_knowledge_packs(id),
  component_type TEXT NOT NULL,
  name TEXT NOT NULL,
  metadata_json TEXT NOT NULL
);

CREATE TABLE hkp_regional_alternatives (
  id TEXT PRIMARY KEY,
  hkp_id TEXT NOT NULL REFERENCES hardware_knowledge_packs(id),
  component_id TEXT REFERENCES hkp_components(id),
  region TEXT NOT NULL,
  alternative_part TEXT NOT NULL,
  distributor TEXT,
  typical_price_local REAL,
  typical_price_currency TEXT,
  typical_lead_days INTEGER,
  counterfeit_risk TEXT CHECK(counterfeit_risk IN ('low','moderate','high','critical'))
);
```

### 3.3 Diagnostic layer

Unit of content: the *diagnostic case*. Structured record of an observed fault pattern and its resolution, with outcome tracking across subsequent attempts.

**Example case (ESP32 — ADC2 with Wi-Fi):**

```json
{
  "case_id": "esp32-adc2-wifi-brownout-2024-03",
  "hkp_id": "esp32-wroom-32",
  "family_id": "esp32",
  "title": "Intermittent resets when using ADC2 with Wi-Fi active",
  "severity": "moderate",
  "symptoms": [
    {
      "symptom": "device resets every 45-90 seconds with Wi-Fi active",
      "observable_via": ["serial-console-brownout-detector-trigger"],
      "confidence_when_present": 0.8
    },
    {
      "symptom": "resets correlate with ADC2 read calls in application code",
      "observable_via": ["code-inspection"],
      "confidence_when_present": 0.7
    }
  ],
  "probable_causes": [
    {
      "cause": "ADC2 shared with Wi-Fi radio; simultaneous use causes power rail dip triggering brownout",
      "confidence": 0.9,
      "evidence": ["espressif-documentation"]
    }
  ],
  "resolutions": [
    {
      "resolution_id": "r1",
      "description": "Move ADC reads to ADC1 channels only",
      "outcome_tracking": {
        "tried": 47,
        "worked": 42,
        "made_worse": 0,
        "no_effect": 5
      },
      "verified_by": ["community","espressif-documentation"]
    },
    {
      "resolution_id": "r2",
      "description": "Disable Wi-Fi during ADC2 reads using esp_wifi_stop/start",
      "outcome_tracking": {
        "tried": 12,
        "worked": 11,
        "made_worse": 1,
        "no_effect": 0
      },
      "verified_by": ["community"]
    }
  ],
  "related_cases": ["esp32-brownout-usb-power-quality"],
  "contributor_signatures": ["..."],
  "authoritative": true,
  "first_reported": "2024-03-15",
  "last_updated": "2026-02-10"
}
```

**Database schema:**

```sql
CREATE TABLE diagnostic_cases (
  case_id TEXT PRIMARY KEY,
  hkp_id TEXT NOT NULL REFERENCES hardware_knowledge_packs(id),
  family_id TEXT NOT NULL,
  title TEXT NOT NULL,
  severity TEXT,
  case_data_json TEXT NOT NULL,
  first_reported TEXT NOT NULL,
  last_updated TEXT NOT NULL,
  signed_by TEXT,
  signing_verified INTEGER DEFAULT 0,
  authoritative INTEGER DEFAULT 0,
  case_schema_version TEXT NOT NULL
);

CREATE TABLE diagnostic_case_outcomes (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES diagnostic_cases(case_id),
  resolution_id TEXT NOT NULL,
  attempted_at TEXT NOT NULL,
  outcome TEXT CHECK(outcome IN ('worked','made_worse','no_effect','partial')),
  contributor_id TEXT,
  context_notes TEXT,
  consent_for_sharing INTEGER DEFAULT 0
);

CREATE TABLE diagnostic_case_cross_references (
  id TEXT PRIMARY KEY,
  primary_case_id TEXT NOT NULL REFERENCES diagnostic_cases(case_id),
  related_case_id TEXT NOT NULL REFERENCES diagnostic_cases(case_id),
  relationship_type TEXT
);
```

**Acquisition mechanism:** the Diagnose path's Phase 5 (Resolution) includes a "save this case?" step. The diagnostic case is constructed from the diagnostic Reasoning Trail with minimal user input (title confirmation, resolution selection, consent for community sharing). **Every successful Diagnose workflow produces a candidate case.** This is how the diagnostic layer grows organically.

**Outcome tracking:** when another user encounters similar symptoms, ANTON surfaces the existing case; the user tries the resolution; the outcome is reported (explicitly via workflow step or implicitly via continued operation). Outcome counters update.

**Deduplication:** at contribution time, ANTON searches for similar existing cases. If found, the contribution is offered as either "confirm this existing case" or "add a variant resolution" rather than creating a duplicate.

**Launch seed:** at ESP32 launch, 30-50 seeded authoritative cases covering: ADC2/Wi-Fi conflicts, brownout from bad USB cables, flash wear from SPIFFS excessive writes, Wi-Fi connection instability, deep sleep wake issues, I2C address conflicts, PSRAM access issues, counterfeit ESP32 identification patterns, OTA update failures, web server memory exhaustion, classic interrupt-priority mistakes.

### 3.4 Lifecycle layer

Unit of content: the *lifecycle event*. CVE advisories, EOL events, revision changes, regulatory updates, recalls, field-modification patterns, known-good patches.

**Example event (ESP32 — hypothetical CVE):**

```json
{
  "event_id": "cve-2026-XXXXX-esp32-wifi-driver",
  "hkp_id_pattern": "esp32-*",
  "family_id": "esp32",
  "event_type": "security-advisory",
  "title": "Buffer overflow in ESP-IDF Wi-Fi driver wifi_scan_start",
  "severity": "high",
  "cvss_v3_score": 8.1,
  "published_at": "2026-04-10",
  "source": "nvd",
  "source_url": "https://nvd.nist.gov/vuln/detail/CVE-2026-XXXXX",
  "affected_versions": {
    "esp-idf": "<5.2.3",
    "arduino-esp32": "<3.0.5"
  },
  "fix_available": true,
  "fix_details": {
    "type": "library-update",
    "target_versions": {
      "esp-idf": ">=5.2.3",
      "arduino-esp32": ">=3.0.5"
    },
    "migration_notes": "check wifi_init sequence for deprecated API calls"
  },
  "impact_assessment": {
    "exploitability": "remote-unauthenticated",
    "impact_if_exploited": "arbitrary-code-execution",
    "deployed_device_exposure": "high-for-connected-wifi-devices"
  },
  "regulatory_implications": {
    "cra_notification_required": true,
    "cra_notification_window_days": 72,
    "red_cybersecurity_impact": true
  }
}
```

**Event types:** `security-advisory`, `end-of-life`, `revision-change`, `regulatory-update`, `recall`, `field-modification-pattern`, `known-good-patch`.

**Database schema:**

```sql
CREATE TABLE lifecycle_events (
  event_id TEXT PRIMARY KEY,
  hkp_id TEXT REFERENCES hardware_knowledge_packs(id),
  hkp_id_pattern TEXT,  -- when event affects multiple HKPs
  family_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  severity TEXT,
  cvss_score REAL,
  published_at TEXT NOT NULL,
  source TEXT NOT NULL,
  source_url TEXT,
  event_data_json TEXT NOT NULL,
  superseded_by TEXT REFERENCES lifecycle_events(event_id),
  event_schema_version TEXT NOT NULL
);

CREATE TABLE lifecycle_event_project_impacts (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES lifecycle_events(event_id),
  project_id TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  impact_assessment_json TEXT,
  user_action_taken TEXT,
  action_taken_at TEXT,
  acknowledged INTEGER DEFAULT 0
);
```

**Acquisition mechanisms per event type:**

- `security-advisory`: automated daily ingestion from NVD, GitHub Security Advisories (GHSA), and Espressif security advisory feed. Matched against library SBOMs in the specification layer.
- `end-of-life`: automated ingestion from manufacturer EOL databases (Espressif product lifecycle notices primarily for ESP32 family).
- `revision-change`: manufacturer announcements; community reports when physical verification reveals a revision difference.
- `regulatory-update`: extension of existing Regulatory Radar infrastructure to track hardware-relevant events (CRA applicability, RED amendments, FCC rule changes, ENISA guidance).
- `recall`: manufacturer announcements; CPSC and RAPEX feeds.
- `field-modification-pattern`: community contributions documenting successful intentional modifications.
- `known-good-patch`: community contributions documenting patch applications that worked in a specific context.

**Launch seed:** ESP32 launch includes active NVD feed integration, Espressif security advisory feed integration, 3-5 known active advisories affecting common ESP32 deployments, and 5-10 known-good-patch events for common maintenance scenarios.

**Project impact notification:** when a lifecycle event is ingested that matches an HKP used in a deployed project, the project owner is notified (respecting notification preferences). For Tier 3 projects, notification is mandatory and includes regulatory-implication assessment per the event's `regulatory_implications` field.

### 3.5 HKP prompt attachment

The prompt-builder Layer 6 extension handles path-aware layer prioritisation:

```typescript
// server/services/hkp-prompt-attachment.ts

export interface HKPAttachmentContext {
  path: 'diagnose' | 'maintain' | 'develop';
  tier: 1 | 2 | 3;
  hkps: string[];  // HKP IDs in use
  token_budget: number;
  language: string;
}

export function assembleHKPContext(ctx: HKPAttachmentContext): PromptLayer6Content {
  // Priority order varies by path:
  //   diagnose: diagnostic > specification > lifecycle
  //   maintain: lifecycle > specification > diagnostic
  //   develop: specification > lifecycle > diagnostic
  //
  // Token budget management:
  //   - Primary layer gets 60% of budget
  //   - Secondary layers split remainder
  //   - Claim classifications are always included regardless of budget
  //   - AI-unverified claims in critical paths trigger explicit warnings
}
```

---

## 4. The Hardware Engineering Area

New area (`server/areas/hardware-engineering/`) following the existing area structure.

### 4.1 Personas with path-default tagging

```
personas/
├── embedded-systems-engineer.md       # default: develop, maintain
├── electronics-engineer.md            # default: develop, diagnose
├── industrial-designer.md             # default: develop
├── reliability-engineer.md            # default: diagnose, maintain, develop
├── safety-engineer.md                 # default: develop (safety-critical)
├── clinical-safety-officer.md         # default: develop + maintain (medical-adjacent)
├── field-technician.md                # default: diagnose, maintain
├── humanitarian-tech-operator.md      # default: all paths (humanitarian context)
└── quality-engineer.md                # default: maintain, develop
```

Each persona markdown file has YAML frontmatter declaring path defaults, hardware-family applicability (default: all families), and activation triggers (symptom patterns, regulatory contexts).

### 4.2 Skills

```
skills/
├── power-budgeting.md
├── signal-integrity.md
├── failure-mode-analysis.md
├── regulatory-compliance-check.md
├── thermal-analysis.md
├── sbom-generation.md
├── cra-documentation-builder.md
├── medical-device-classification.md
├── environmental-hardening.md
├── capacity-transfer-documentation.md
├── legacy-hardware-identification.md
├── diagnostic-decision-tree-builder.md
├── incident-case-curator.md
├── symptom-to-cause-reasoner.md
├── patch-impact-assessor.md
├── regression-verification-planner.md
├── cve-applicability-analyser.md
├── fleet-change-coordinator.md
└── field-modification-documenter.md
```

### 4.3 Modules

Each module tagged with applicable paths.

**Develop-oriented:**
- hardware-component-selection
- firmware-architecture-design
- wiring-diagram-generation
- bom-optimisation
- assembly-instruction-generation
- hardware-test-plan-design
- deployment-guide-generation
- extend-existing-device-workflow
- training-material-generation
- field-deployment-planning
- regulatory-pathway-advisory
- tco-analysis-deployment-context

**Diagnose-oriented:**
- symptom-capture-and-characterisation
- diagnostic-hypothesis-generation
- diagnostic-decision-tree-navigation
- test-execution-guidance
- resolution-verification
- diagnostic-case-synthesis

**Maintain-oriented:**
- patch-need-identification
- patch-impact-assessment
- patch-planning-and-staging
- patch-application-guidance
- regression-verification
- patch-documentation-and-audit-trail
- fleet-rollout-coordination
- cve-applicability-assessment

**Cross-path:**
- troubleshooting-diagnostic-tree (shared by all three paths)
- repair-workflow (maintain, sometimes diagnose)
- hardware-document-inbox (all paths)

### 4.4 Cross-area expert injection

Uses the same mechanism Coding Large uses. Paths affect which injection defaults apply, not the injection mechanism itself:

- Diagnose default: Reliability Engineer, Field Technician. Cross-area activation on symptom: Cybersecurity (security symptoms), Safety Engineer (safety symptoms), Clinical Safety Officer (medical-adjacent), Data & Analytics (data-integrity symptoms).
- Maintain default: Cybersecurity, Software Engineering, Quality Engineer. Cross-area for Tier 2/3: Legal. For medical-adjacent: Clinical Safety Officer. Compliance-as-Code hooks active.
- Develop default: full panel. Cross-area per project context.

---

## 5. The Three Paths

### 5.1 Phase 0 — Classification (shared across paths)

Non-skippable first screen. Determines path and tier, produces signed declaration in Reasoning Trail.

```typescript
// server/hardware/paths/phase-0-classification.ts

export interface PhaseZeroOutput {
  path: 'diagnose' | 'maintain' | 'develop';
  tier: 1 | 2 | 3;
  tier_3_producer_acknowledgement?: SignedAcknowledgement;
  humanitarian_context?: {
    deployment_operator: string;
    target_region: string;
    intended_languages: string[];
  };
  signed_declaration: SignedReasoningTrailEntry;
}
```

UX: single screen asking "what are you doing today with hardware?" with three options (Diagnose / Maintain / Develop, each with example scenarios). Followed by tier selection with examples. Humanitarian-context fields shown when Tier 3 is selected with a field-deployment environmental answer.

### 5.2 Diagnose path

**UX:** iterative, symptom-driven, voice-capable for field use. Mobile-optimised (user is at the device). Local-language generation.

**Phases:**

#### Phase 1 — Symptom Capture

```typescript
// server/hardware/paths/diagnose/phase-1-symptom-capture.ts

export interface SymptomCaptureInput {
  user_description: string;  // plain language, any language
  attachments?: {
    photos?: string[];
    serial_logs?: string[];
    error_logs?: string[];
  };
  device_context: {
    family_id: string;
    known_hkp_id?: string;  // or null for legacy-hardware-identification flow
    deployment_environment?: string;
  };
}

export interface SymptomCaptureOutput {
  structured_symptoms: Symptom[];
  observability_profile: ObservabilityProfile;  // what the user can measure with available tools
  confidence: number;
}
```

Module: `symptom-capture-and-characterisation`. Produces structured symptom profile. For humanitarian/field contexts, voice-first input in local language via existing i18n infrastructure.

Knowledge base: diagnostic layer queried for cases matching symptom pattern.

#### Phase 2 — Hypothesis Generation

Module: `diagnostic-hypothesis-generation`. Produces ranked hypothesis list with confidence scores and evidence pointers (to diagnostic cases, specification constraints, active lifecycle events).

Expert review: Reliability Engineer, Field Technician review top three hypotheses for plausibility in deployment context.

Knowledge base: all three layers consulted.

#### Phase 3 — Diagnostic Decision Tree

Module: `diagnostic-decision-tree-navigation`. Constructs test plan distinguishing between top hypotheses. Prefers tests the user can actually perform given their tools (multimeter yes, oscilloscope maybe, JTAG debugger probably not).

Output: interactive decision tree document. User can execute tests in any order; tree updates as results come in.

#### Phase 4 — Test Execution

Module: `test-execution-guidance`. Walks user through each test with clear local-language instructions, expected result patterns, interpretation guidance for ambiguous results.

After each test: hypothesis list re-ranks based on results. When confidence in a single hypothesis exceeds threshold, move to Phase 5.

#### Phase 5 — Resolution and Case Synthesis

Module: `resolution-verification`. Presents resolution(s). User executes, reports outcome.

Module: `diagnostic-case-synthesis`. On resolution success, offers to save the case to the HKP's diagnostic layer with user consent for community sharing.

**Output of entire Diagnose workflow:** signed Reasoning Trail, resolution applied (or clear escalation conclusion), optional contributed diagnostic case.

**Cross-path transitions:** diagnostic findings can trigger Maintain operations ("this fault may exist across the fleet — want to initiate a Maintain operation?") or Develop operations ("this device cannot be repaired with available resources — propose a replacement design?").

**Tier implications:**
- Tier 1: fast, informal, no CRA implications.
- Tier 2: audit trail produced; FCP/Data & Analytics review if data-handling fault.
- Tier 3: if finding has regulatory implications (security-relevant symptom confirmed), CRA vulnerability assessment triggered automatically, notification mechanisms activated for connected-device fleets.

**Quality scoring dimensions added:** diagnostic accuracy (hypothesis matched confirmed cause), resolution effectiveness (recommended resolution worked), efficiency (tests required), knowledge contribution (case enriched community library).

### 5.3 Maintain path

**UX:** deliberate, verification-oriented, audit-trailed. Workspace-oriented interface showing affected devices, proposed change, verification plan. Less time-pressured than Diagnose; more rigour per change.

**Phases:**

#### Phase 1 — Need Identification

Triggers: automated (lifecycle event impacts a project or deployed device) or manual (user-initiated update/replacement/adjustment).

Module: `patch-need-identification`. Characterises the change: what, why, scope.

Knowledge base: lifecycle layer primary.

#### Phase 2 — Impact Assessment

Module: `patch-impact-assessment`. Evaluates:
- Affected devices (single / batch / fleet)
- Library dependency impacts (does this affect other firmware relying on the library?)
- Regulatory obligations (Tier 3: CRA vulnerability handling, notification timelines, RED cybersecurity)
- User-observable behaviour changes
- Testing and verification requirements

Output: structured impact assessment.

Expert review: Cybersecurity (security patches), Quality Engineer (any change), Legal (Tier 2/3 regulatory), Clinical Safety Officer (medical-adjacent).

#### Phase 3 — Patch Planning and Staging

Module: `patch-planning-and-staging`. Produces the change package:
- The specific update (firmware, component swap, config, calibration)
- Rollback plan
- Staged rollout plan for fleet-wide changes (1 device → 10% → 100% pattern)
- Per-stage verification plan
- Communication plan for affected users

Output: signed `patch-bundle` (Section 6).

Quality pipeline: same as firmware quality pipeline in Develop (static analysis, SBOM, CVE scan, simulation where supported). Patches failing the pipeline are rejected.

#### Phase 4 — Application

Module: `patch-application-guidance` for single devices. Module: `fleet-change-coordinator` for fleet-wide rollouts via Missions.

Fleet rollout: staged per plan, per-device success tracking, automatic pause on failure threshold, audit logging.

**Tier 3 non-negotiable:** OTA update integrity chain enforced (signed images, verified boot, rollback counters). No bypassing.

#### Phase 5 — Regression Verification

Module: `regression-verification`. Executes verification plan per affected device. Tests:
- The specific thing the patch fixed: is it fixed?
- Previously-working functionality: still working?
- Unexpected behaviour: signs of regression?

For humanitarian Tier 3 fleets where direct verification is impractical per device: sampling-based verification with statistical confidence.

**Gate:** patches failing verification are rolled back. No exceptions.

#### Phase 6 — Documentation and Audit Trail

Module: `patch-documentation-and-audit-trail`. Produces:
- Signed Reasoning Trail of full maintenance operation
- Append to project's `lifecycle_history.jsonl`
- Tier 3: updated CRA technical file reflecting the patch
- Regulatory-driven patches: notification to affected parties where required

**Cross-path transitions:** Maintain failures can spawn Diagnose ("patch did not resolve on 3 of 10 devices — diagnose those?"). Successful Maintain updates the project bundle's lifecycle_history.

**Quality scoring dimensions added:** patch accuracy, regression rate, verification coverage, audit completeness, fleet coordination success rate.

### 5.4 Develop path

**UX:** exploratory, iterative. The classic hardware-engineering workflow, six phases.

#### Phase 1 — Discovery & Requirements

Module: `hardware-document-inbox` for any existing documentation user uploads. Module: `extend-existing-device-workflow` if starting from legacy hardware. Module: `tco-analysis-deployment-context` for realistic cost estimation.

Output: structured requirements, constraint matrix, risk register, TCO estimate per deployment region.

#### Phase 2 — Architecture & Component Selection

Module: `hardware-component-selection`. Queries specification layer (SheetsData MCP + own content) for candidate parts. Applies `hkp_regional_alternatives` for target deployment region.

Module: `bom-optimisation`. Constructs BOM with supplier links, cost estimate, counterfeit-risk flags.

Module: `environmental-hardening`. Specifies enclosure rating (IP code), connector class, conformal coating for deployment environment.

#### Phase 3 — Design & Schematic

Module: `wiring-diagram-generation`. Produces SVG wiring diagrams (breadboard view and schematic view). Pin-accurate. For import from Flux/Schematik/KiCad projects, use `hardware-document-inbox` flow and preserve original format in the project bundle.

#### Phase 4 — Firmware & Software (with mandatory quality pipeline)

Module: `firmware-architecture-design`. Generates firmware source targeting the family's build system (PlatformIO for ESP32). Uses HKP primitives as building blocks.

**Mandatory quality pipeline (Section 7).** Static analysis, SBOM generation, CVE scan, simulation. Firmware is not presented as "ready" until all gates pass.

Expert reviews: Software Engineering (always), Cybersecurity (connected devices, Tier 3), Data & Analytics (sensor data capture), Clinical Safety Officer (medical-adjacent), FCP/Legal (privacy/Tier 2-3), Field Technician and Humanitarian Tech Operator (humanitarian context).

#### Phase 5 — Assembly & Test

Module: `assembly-instruction-generation`. Produces step-by-step instructions with safety callouts, tool list, estimated time, skill level.

Module: `capacity-transfer-documentation`. Produces explain-how-it-works document for next-person handoff. Local-language where deployment warrants.

Module: `hardware-test-plan-design`. Smoke tests, functional tests, edge cases, calibration procedures.

#### Phase 6 — Deploy, Operate & Maintain

Module: `deployment-guide-generation`. PlatformIO flashing, initial configuration, OTA setup for connected devices.

Module: `training-material-generation`. Operation guides, troubleshooting decision trees (local language). Explicit handoff into Maintain path for operational life.

**Cross-path transitions:** at Phase 6 completion, the project enters Maintain mode. The `hardware-project` bundle carries a `lifecycle_history.jsonl` initialised with the Develop event.

**Quality scoring dimensions:** standard ANTON dimensions plus Safety, Buildability, Maintainability.

### 5.5 Cross-path transitions

Single-click transitions between paths, carrying Reasoning Trail context:

- Diagnose → Maintain: diagnostic finding triggers fleet-wide maintenance operation
- Diagnose → Develop: diagnosis concludes device cannot be repaired with available resources, propose replacement design
- Maintain → Diagnose: patch verification failure on subset of fleet, diagnose failing devices
- Develop → Maintain: deployment handoff (automatic at Phase 6 completion)

Transitions preserve context — the originating path's Reasoning Trail is the first input to the destination path.

---

## 6. Bundle Types

Seven bundle types total. All follow existing `.anton` bundle infrastructure.

### 6.1 `hardware-knowledge-pack`

Three-layer HKP per Section 3. Schema version `1.0`.

### 6.2 `hardware-template`

Partially-filled starting point. User clones, specialises, builds.

```
hardware-template.anton/
├── manifest.json           # includes bundle_schema_version, target_family_id
├── template-metadata.json  # what this template is for, expected specialisation points
├── requirements-skeleton.json
├── hkp-references.json     # which HKPs this template builds on
├── components-proposed.json
├── firmware-skeleton/      # partial firmware with TODO markers
├── documentation-skeleton/ # partial assembly/operation docs
└── signature.json
```

### 6.3 `hardware-project`

Complete hardware project. Contains everything from Develop path output plus lifecycle history tracking.

```
hardware-project.anton/
├── manifest.json
├── phase-0-classification.json   # tier, path, humanitarian context if applicable
├── requirements.json
├── constraints.json
├── risk-register.json
├── architecture.md
├── bom.json
├── wiring/                       # SVG diagrams, original CAD if imported
├── firmware/                     # source files, build config
├── firmware-quality/             # static analysis results, SBOM, CVE scan results, simulation output
├── assembly/                     # instructions, illustrations
├── testing/                      # test plan, results
├── deployment/                   # flashing guide, OTA config
├── operation/                    # operation guide, troubleshooting tree (local language)
├── capacity-transfer/            # training materials, handoff guide, modify-it-yourself
├── tco-projection.json
├── regulatory/                   # per-tier artefacts (see Section 8)
├── expert-reviews/               # signed review artefacts per persona
├── reasoning-trails/             # all signed trails: develop + every maintain + every diagnose
├── lifecycle-history.jsonl       # append-only path operations log
└── signature.json
```

**Critical field — `lifecycle-history.jsonl`:**

```
{"op":"develop","started":"2026-04-18T10:00:00Z","completed":"2026-04-18T16:30:00Z","operator":"daniel","trail_ref":"trails/develop-001.json"}
{"op":"maintain","started":"2026-06-15T09:00:00Z","completed":"2026-06-15T09:30:00Z","operator":"khady","patch_ref":"maintain/patch-cve-2026-xxxxx.anton","trail_ref":"trails/maintain-001.json"}
{"op":"diagnose","started":"2026-08-02T14:20:00Z","completed":"2026-08-02T14:45:00Z","operator":"khady","case_ref":"diagnose/case-sensor-node-3.anton","outcome":"resolved","trail_ref":"trails/diagnose-001.json"}
```

Append-only, signed per entry. This is institutional memory for the project.

### 6.4 `humanitarian-deployment-kit`

Specialised bundle extending `hardware-project` with fleet-deployment content.

```
humanitarian-deployment-kit.anton/
├── manifest.json
├── ... (all hardware-project content)
├── deployment-operator.json      # who deploys, who sustains, for how long
├── regional-localisation/        # language, sourcing, power standards, regulatory
├── fleet-configuration.json      # unit count, locations, provisioning, communication
├── capacity-building-plan.md
├── sustaining-partnership.md
├── exit-handoff-plan.md
└── signature.json
```

### 6.5 `diagnostic-case-bundle` (new)

A diagnostic case per Section 3.3, packaged for portability and community contribution.

```
diagnostic-case-bundle.anton/
├── manifest.json
├── case.json               # structured case per Section 3.3
├── reasoning-trail.json    # full Diagnose Reasoning Trail
├── attachments/
│   ├── symptom-photos/
│   ├── serial-logs/
│   └── ...
├── outcome-log.jsonl       # append-only outcome reports from subsequent uses
└── signature.json
```

### 6.6 `patch-bundle` (new)

A governed change package from Maintain path planning.

```
patch-bundle.anton/
├── manifest.json
├── change.json             # what, why, scope
├── impact-assessment.json
├── artefacts/              # firmware, config, etc.
├── rollback-plan.md
├── verification-plan.md
├── cra-notification.json   # if applicable (Tier 3 security)
├── reasoning-trail.json
└── signature.json
```

### 6.7 `lifecycle-advisory-bundle` (new)

Authoritative lifecycle event with applicability assessment.

```
lifecycle-advisory-bundle.anton/
├── manifest.json
├── event.json              # structured event per Section 3.4
├── applicability-assessment.json
├── recommended-action.md
├── source-attribution.json
└── signature.json
```

---

## 7. Firmware Quality Pipeline

**Non-negotiable for all paths producing firmware.** No firmware is presented as "ready" until the pipeline passes.

### 7.1 Pipeline stages

1. **Generate firmware** via the path's firmware module
2. **Static analysis** (Clang-tidy for C/C++; family-specific config from hardware family registry)
3. **SBOM generation** (CycloneDX 1.6+ with hardware extensions)
4. **CVE scan** against lifecycle layer advisory database (matches SBOM components to known CVEs)
5. **Simulation** via Wokwi (primary for ESP32) or Renode where applicable
6. **Firmware security scorecard** — buffer safety, interrupt safety, input validation, secret storage, secure update chain, boot integrity
7. **Only then** present firmware to the user as "ready for review"

### 7.2 Gates

- Static analysis fails: refactor and regenerate
- Critical CVE detected in used library: regenerate with alternative library
- Simulation fails: fix and regenerate
- Security scorecard below threshold: refactor and regenerate

### 7.3 Tier 3 additions

- Connected devices require secure-update chain (signed images, verified boot, rollback protection). Pipeline refuses to complete connected-device firmware without this unless Tier 1 acknowledgement.
- Medical-adjacent requires hazard analysis and tamper-evident logging.

### 7.4 Tool integrations

Each tool integrates via an adapter in `server/hardware/integrations/`:

- `platformio-adapter.ts` — build system integration
- `wokwi-adapter.ts` — ESP32 simulation primary
- `renode-adapter.ts` — advanced simulation (reserved, not fully implemented at ESP32 launch)
- `clang-tidy-adapter.ts` — static analysis for C/C++
- `cyclonedx-adapter.ts` — SBOM generation
- `cve-scanner-adapter.ts` — SBOM-to-CVE matching (consumes from lifecycle layer)
- `security-scorecard-generator.ts` — firmware security scoring

Extension pattern: adding a new tool is implementing the adapter interface.

---

## 8. Tier Classification (Structural, Lean)

### 8.1 Three tiers

- **Tier 1 — Personal tinkering.** Not placed on market. User builds for self/household.
- **Tier 2 — Professional internal use.** Builder uses in own work, not distributed.
- **Tier 3 — Placed on market / distributed.** Third-party use.

### 8.2 Tier-gated capabilities

| Capability | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|
| Basic firmware quality pipeline | ✓ | ✓ | ✓ |
| Secure update chain | Optional (warning) | Required | Required |
| SBOM | Basic | Full | Full CycloneDX 1.6+ |
| Data protection assessment | — | Required | Required |
| Workplace safety checklist | — | Required | — |
| CRA technical file outline | — | — | Required |
| Declaration of conformity template | — | — | Required |
| Vulnerability disclosure policy | — | — | Required |
| Hazard analysis | — | — | Required (medical) |
| Medical device classification advisory | — | — | Required (medical) |
| RED compliance declaration | — | — | Required (radio) |

### 8.3 Regulatory artefact generation

ANTON produces the templates and assessments. **The user is the responsible economic operator** under applicable law. ANTON does not claim certification; it prepares documentation the user can submit for conformity assessment.

Tier 3 workflow cannot complete without the applicable regulatory artefact package. This is a workflow gate, not a launch prerequisite.

### 8.4 Humanitarian Tier 3 addition

Humanitarian deployments receive Tier 3 plus: local-language user documentation, training material package for local technicians, capacity-transfer plan, sustaining-partnership agreement template, end-of-programme handoff plan.

---

## 9. ANTON Platform Integration

### 9.1 Missions

Diagnose incidents spanning multiple sessions register as Missions. Maintain fleet operations register as Missions with progress tracking, staged rollout, rollback capability.

### 9.2 Service Packs

Deployment workflows and fleet-operation patterns register as Service Packs.

### 9.3 Reasoning Trails

Every path operation produces a signed trail, tagged with path and tier. Trail queries support "show me all Maintain operations on project X" and similar.

### 9.4 Quality Ratchet

Path-specific quality dimensions added. Scores track per-path per-user per-hardware-family.

### 9.5 Apprentice Model

User progresses through Observer → Autonomous per path per family. Autonomous at Diagnose for ESP32 does not imply Autonomous at Develop for ESP32 or Autonomous at Diagnose for Arduino (when added).

### 9.6 AAP (Agent Protocol)

Store-and-forward support critical for fleet Maintain operations in intermittent-connectivity deployments. Humanitarian deployment kit uses AAP for telemetry synchronisation.

### 9.7 MCP

Consumed: SheetsData for specification layer. CVE feeds. Regulatory content feeds.

Exposed: `hardware.diagnose(symptoms)`, `hardware.patch(project_id, event_id)`, `hardware.develop(requirements)`, `hkp.query(part_number)`, `hkp.diagnostic_cases_for(symptom_pattern)`.

### 9.8 Regulatory Radar extension

Existing Regulatory Radar infrastructure extended to feed lifecycle layer. Hardware-relevant regulatory events become `lifecycle-advisory-bundle`s automatically.

### 9.9 Markets

Devices feeding telemetry (environmental monitors, compliance devices) can feed Markets predictions as grounded inputs.

### 9.10 Three Pillars access control

Hardware Build sits in Work (primary) and School (secondary). Life gets Tier 1 access for personal tinkering. Path-specific access controls layer on top of pillar-based access.

---

## 10. Launch Scope — ESP32 Only

### 10.1 What ships at launch

**Hardware family:** `esp32` fully populated in the hardware family registry. Variants covered: ESP32-WROOM-32, ESP32-WROOM-32E, ESP32-S3, ESP32-C3, ESP32-S2.

**HKP seed content:**
- 3 curated HKPs: ESP32-WROOM-32E, ESP32-S3, ESP32-C3. All three layers populated.
- Specification layer: hybrid. SheetsData MCP integration active. Own-curated environmental profiles, local-sourcing alternatives (West Africa and EU regions at launch), verified primitives, authenticity checks.
- Diagnostic layer: 30-50 seeded authoritative cases covering common ESP32 failure modes.
- Lifecycle layer: active NVD and GitHub Security Advisories feeds; Espressif security advisory feed; 3-5 known active advisories at launch; 5-10 known-good-patch events.

**All three paths fully implemented for ESP32:**
- Diagnose: 5 phases, case synthesis and contribution flow
- Maintain: 6 phases, CVE applicability, fleet coordination, OTA chain
- Develop: 6 phases, PlatformIO integration, Wokwi simulation, mandatory quality pipeline

**Cross-path transitions active.**

**Hardware Engineering area:** all nine personas, all skills, all modules.

**Seven bundle types:** all functional.

**All three tiers:** Tier 1 and Tier 2 fully functional. Tier 3 capabilities present (regulatory artefact generation, CRA/RED/MDR templates, medical device classification advisory, hazard analysis) as workflow capabilities.

**Humanitarian-deployment-kit:** fully functional for ESP32 deployments in West Africa and EU regions. Additional regions added later via regional HKP steward contributions.

**ANTON platform integration:** all platform touchpoints active (Missions, Service Packs, Reasoning Trails, Quality Ratchet, Apprentice Model, AAP, MCP, Regulatory Radar, Markets, three-pillar access control).

### 10.2 What is deferred

- Arduino family support (architectural scaffolding present, content and family-specific logic not populated)
- Raspberry Pi family support (same)
- STM32, nRF52, RP2040 family support (reserved in registry)
- Additional regions in local-sourcing alternatives beyond West Africa and EU
- Additional languages beyond ANTON's current i18n set (adding languages is content work)
- Native Flux/Schematik/KiCad import (imports via `hardware-document-inbox` flow at launch; native one-click import is follow-on work)
- Renode simulation integration (Wokwi primary at launch; Renode adapter stubbed)
- Additional paths beyond the three (reverse-engineer mode, etc.)

### 10.3 Why this scope

World-class means: a user with an ESP32 in front of her can run any of the three paths and each works well. Narrow family scope + deep path scope produces this.

The alternative (broad family scope + shallow path scope) produces something that looks comprehensive but feels thin. Diagnose on a Raspberry Pi that doesn't have seeded diagnostic cases is worse than Diagnose on ESP32 that has 50 seeded cases.

---

## 11. Extension Architecture — What Comes After ESP32

This section exists so Claude Code knows exactly how the launch architecture will grow. **Every extension point documented here is already built into the launch architecture.** Adding these capabilities later is population, not redesign.

### 11.1 Adding a new hardware family (Arduino, Raspberry Pi, etc.)

Steps:

1. Populate the family registry entry in `server/hardware/family-registry.ts`. Status: `beta` initially, then `launch`.
2. Create `server/hardware/families/{family_id}/` directory with family-specific modules:
   - `primitives/` — verified primitive operations
   - `simulation-config.ts` — Wokwi or Renode configuration for this family
   - `toolchain-config.ts` — PlatformIO (or equivalent) configuration
   - `pin-naming.ts` — pin-naming convention translator
   - `secure-update-config.ts` — if family supports secure OTA
3. Curate 2-5 initial HKPs for the family's most common variants. Populate all three layers.
4. Seed 20-50 diagnostic cases covering common failure modes for the family.
5. Activate lifecycle feeds: vendor security advisories, EOL announcements.
6. Test the three paths end-to-end on the new family.
7. Update hardware family registry status to `launch`.

Time estimate: one family per 6-10 engineer-weeks once the ESP32 launch is complete and the patterns are proven. The first (ESP32) is expensive; subsequent families are much cheaper.

Priority order suggestion:
1. Raspberry Pi (Raspberry Pi 4B, Pi 5, Pi Pico W) — humanitarian use case alignment (School Mode offline AI tutors, field-deployable tablets)
2. Arduino (Uno R4, Mega, Nano) — educational use case, low-cost maker projects
3. STM32 (F4, F7 series) — professional/industrial embedded
4. nRF52 — Bluetooth/BLE focused applications
5. RP2040 variants — dual-core applications beyond the Pi Pico W covered in Raspberry Pi family

### 11.2 Adding a new path (beyond Diagnose/Maintain/Develop)

Candidate additional paths:

- **Reverse-engineer** — for completely undocumented hardware where even identification is partial. Deep legacy-hardware-identification workflow, partial-HKP generation, extensive cross-referencing against similar hardware.
- **Deploy-at-scale** — coordinated fleet provisioning for humanitarian or enterprise rollouts at 100+ device scale. Dedicated staged-rollout orchestration beyond what Maintain's fleet-change-coordinator handles.
- **Retire** — end-of-life management. Data migration, secure data destruction, sustainable recycling guidance, successor-device recommendation.

Steps to add a new path:

1. Create `server/hardware/paths/{path_id}/` directory with phase modules
2. Define the path's workflow phases and their modules
3. Tag applicable personas and skills with the new path-default
4. Define quality scoring dimensions specific to the path
5. Define cross-path transitions to/from the new path
6. Update Phase 0 classification UX to include the new path option
7. Update bundle types if the path produces new artefact kinds
8. Update documentation and training materials

### 11.3 Adding a new bundle type

Follow existing bundle-type pattern:
1. Define schema with `bundle_schema_version`
2. Register bundle type in `server/services/anton-bundler.ts`
3. Implement import/export handlers
4. Document in bundle-type catalogue

### 11.4 Adding a new feed ingestor for the lifecycle layer

1. Implement `LifecycleFeedIngestor` interface in `server/hardware/lifecycle-feeds/{feed_id}.ts`
2. Define polling cadence and authentication
3. Define event type generation from feed content
4. Define HKP matching logic
5. Register in feed registry

Priority additional feeds:
- CISA Known Exploited Vulnerabilities (KEV) catalogue
- Additional vendor security feeds (ST, Nordic, Microchip, Raspberry Pi Foundation)
- OpenSSF Scorecard data for library health
- Additional regional regulatory feeds (US FCC, UK Ofcom, Chinese MIIT where applicable)

### 11.5 Adding a new external tool integration

1. Implement adapter interface in `server/hardware/integrations/{tool}-adapter.ts`
2. Define tool-specific capabilities exposed through the adapter
3. Register adapter with the firmware quality pipeline where applicable
4. Document integration contract

Priority integrations beyond launch:
- Native Flux import/export
- Native Schematik import/export
- KiCad BOM import
- Fritzing breadboard import (educational use case)
- PCB manufacturing service integration (JLCPCB, PCBWay) for BOM-to-order

### 11.6 Adding regional HKP content

1. Identify regional HKP steward
2. Extend `hkp_regional_alternatives` table with region-specific content
3. Update HKP bundles to include region-specific sourcing data
4. Document region-steward responsibilities and commit authority

### 11.7 Adding new language support

1. Add language to i18n infrastructure
2. Translate UI strings
3. Validate generation quality with native speakers for relevant hardware families
4. Add language to hardware family registry's `i18n_validated_languages`
5. Add language-specific capacity-transfer templates where warranted

---

## 12. Implementation Order for ESP32 Launch

### Phase 1 — Hardware family registry and extensibility infrastructure (weeks 1-4)

- Hardware family registry schema and ESP32 entry
- `server/hardware/families/esp32/` directory with all family-specific modules
- Family-interface definitions
- Extension-point infrastructure (schema versioning, migration patterns)

### Phase 2 — Three-layer knowledge base foundation (weeks 4-12)

- Database schemas for specification, diagnostic, lifecycle layers
- HKP bundle type with three-layer structure (`hardware-knowledge-pack` schema 1.0)
- HKP attachment to prompt-builder Layer 6 with path-aware layer prioritisation
- SheetsData MCP integration
- NVD and GitHub Security Advisories feed ingestors
- Espressif security advisory feed ingestor
- Regulatory Radar extension for hardware-relevant events
- Three seed HKPs with all three layers populated
- HKP browser/library page

### Phase 3 — Hardware Engineering area (weeks 10-18)

- Area scaffolding
- Nine personas with path-default tagging
- 19 skills
- All modules tagged with applicable paths
- Cross-area injection integration tested with Cybersecurity and Software Engineering

### Phase 4 — Phase 0 classification + Tier 1 Develop path (weeks 16-26)

- `HardwareBuildPage.tsx` with Phase 0 classification as first screen
- Full Develop path end-to-end for Tier 1 ESP32
- Mandatory firmware quality pipeline (static analysis, SBOM, CVE scan, Wokwi simulation, security scorecard)
- Quality scoring for Develop path
- First-available user flow: Tier 1 personal-tinkering ESP32 project

Validation: a user can complete a Marta-family-network-analogue ESP32 project end-to-end.

### Phase 5 — Diagnose path (weeks 22-32)

- Full 5-phase Diagnose workflow for ESP32
- `diagnostic-case-bundle` bundle type
- Diagnostic case contribution flow at resolution
- Outcome tracking
- Voice-first symptom capture with i18n
- Photo-based ESP32 variant identification
- Quality scoring for Diagnose path
- 30-50 seeded diagnostic cases

Validation: a user with a malfunctioning ESP32 can diagnose the fault conversationally, apply the resolution, and optionally contribute the case to the community layer.

### Phase 6 — Maintain path (weeks 28-40)

- Full 6-phase Maintain workflow for ESP32
- `patch-bundle` and `lifecycle-advisory-bundle` bundle types
- CVE applicability assessment against projects
- Patch planning with rollback and verification
- Fleet-change-coordinator with Missions and AAP store-and-forward
- OTA chain enforcement for Tier 3 connected devices
- Quality scoring for Maintain path

Validation: a user can apply a security patch to a deployed ESP32 project with full audit trail, rollback capability, and (Tier 3) CRA-compliant documentation.

### Phase 7 — Tier 2 and Tier 3 capabilities + regulatory artefact generation (weeks 36-46)

- Tier 2 gating with data protection assessment, workplace safety checklist
- Tier 3 gating with full regulatory artefact package generation
- CRA technical file outline generator
- Declaration of conformity template
- Vulnerability disclosure policy generator
- Medical device classification advisory
- Hazard analysis template
- RED compliance declaration
- `hardware-project` bundle schema 2.0 with Tier 2/3 regulatory section

### Phase 8 — Humanitarian deployment kit + legacy hardware workflow (weeks 42-54)

- `humanitarian-deployment-kit` bundle type
- Capacity-transfer artefact generation
- West Africa and EU regional HKP content
- AAP store-and-forward for fleet telemetry
- Legacy Hardware Identification workflow (photo-based, for ESP32 variants)
- `extend-existing-device-workflow` for non-greenfield starts

### Phase 9 — Templates, community contribution, polish (weeks 50-62)

- `hardware-template` bundle type
- 5-10 initial ESP32 templates across sectors
- Community HKP submission flow with mandatory security review
- Community diagnostic case contribution vetting
- "Modify and share back" flow for field modifications
- Documentation completion
- End-to-end testing across all three paths and all three tiers

### Phase 10 — Launch validation (weeks 60-66)

- Internal validation: Daniel or a test user completes each of the three paths end-to-end for an ESP32 project
- External validation: at least one enterprise user (Advisense or similar) completes a Tier 2 Develop project (e.g., MLRO Desk Dashboard)
- Final polish and bug fixes
- Documentation review
- Launch

### Engineering investment estimate

Approximately 60-80 engineer-weeks across 15-18 months for ESP32 launch. This is denser than the v3 estimate because v4 is single-family-deep rather than multi-family-shallow, and because the firmware quality pipeline and Tier 3 regulatory artefact generation are both non-trivial engineering efforts when done well.

Subsequent family additions (Raspberry Pi, Arduino) are estimated at 6-10 engineer-weeks each given the extensibility infrastructure.

---

## 13. Non-Negotiables

- **Never skip Phase 0 classification.** Path and tier shape everything.
- **Never produce firmware without the mandatory quality pipeline.** Static analysis, SBOM, CVE scan, simulation where supported.
- **Never produce connected-device firmware without secure-update chain** unless explicit Tier 1 acknowledgement.
- **Never produce medical-adjacent firmware without hazard analysis and tamper-evident logging.**
- **Never allow Tier 3 build to complete without full regulatory artefact package.**
- **Never use AI-unverified HKP claims in critical firmware paths without explicit user-facing warnings.**
- **Never silently include community-HKP content without signature verification and security scan.**
- **Never claim regulatory certification.** ANTON prepares documentation; formal conformity assessment remains with the user (economic operator).
- **Never bypass expert review for safety-critical applications.**
- **Always preserve user agency.** Suggestions are suggestions; user approves before commit.
- **Always log decisions.** Every path operation in signed Reasoning Trail.
- **Never hardcode to ESP32.** Every abstraction accepts `hardware_family` as a parameter.
- **Never block on internet connectivity.** Offline operation is required, enhanced by online.
- **Never ship user-facing content in only one language.** i18n at every layer.
- **Never apply a Maintain patch that fails verification.** Rollback is automatic.
- **Never submit a diagnostic case to community without explicit per-contribution user consent.**
- **For humanitarian Tier 3: never ship without capacity-transfer artefacts in the local deployment language.**

---

## 14. Extensibility Principles for Future Claude Code Work

When extending Hardware Build in future sprints:

**Start from the registry, not the code.** Adding Arduino means populating the family registry entry first, then implementing the family-specific modules to satisfy the interface. Don't start by copying ESP32 code and modifying it.

**Preserve schema versioning discipline.** Every schema change is either additive (safe) or requires explicit migration. Never break existing bundles.

**Extend paths additively.** A new path doesn't modify existing paths; it adds a new module in `server/hardware/paths/`. Cross-path transitions are defined in a transition registry, not hardcoded.

**Integrate over rebuild.** When a commercial or open-source tool exists for a capability, integrate via adapter. Don't rebuild unless there's a specific reason (offline requirement, licensing, regulatory constraint).

**Community content over platform content where appropriate.** Diagnostic cases, regional sourcing alternatives, some HKP content is better maintained by community contribution than by platform-team effort. Optimise for the contribution flow.

**Humanitarian constraints sharpen the product for everyone.** When in doubt about a design decision, ask: does this work offline? Does this work in a language other than English? Does this work for a field technician who cannot call tech support? Does this work when the original builder has left? The answers guide good decisions.

**Tier 3 is a capability, not a launch blocker.** Regulatory artefact generation ships as part of the product. Whether a user takes responsibility for Tier 3 economic-operator status is their decision, not ANTON's. ANTON's job is to produce the artefacts they need if they choose Tier 3.

**The three paths plus three tiers plus three knowledge-base layers structure the product.** Nine combinations of path × tier, each with its own quality bar. Three knowledge-base layers consulted differently per path. When a new capability is proposed, locate it on these axes first. If it doesn't fit any of the nine path × tier combinations, the capability is probably something else (Scripts tier, FCP module, Markets module) and belongs elsewhere in ANTON.

---

## 15. Summary

v4 is the engineering spec for a world-class ESP32 Hardware Build capability that is architected for extension to Arduino, Raspberry Pi, and future families via the same patterns. Three paths (Diagnose, Maintain, Develop) implemented deeply. Three knowledge-base layers (Specification hybrid with SheetsData MCP, Diagnostic community-contributed, Lifecycle feed-automated) integrated throughout. Seven bundle types. Mandatory firmware quality pipeline. Tier classification and regulatory artefact generation as capabilities. Full ANTON platform integration. Humanitarian requirements preserved as engineering constraints. Explicit extension points everywhere.

Build this. Then extend.
