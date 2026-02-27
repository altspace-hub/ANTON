# .anton Format — Codebase Audit & Bundle Type Expansion

> **Audience:** Claude Code  
> **Purpose:** (1) Audit the existing bundler code against the .anton Format Specification to find gaps and misalignments, and (2) expand the format to cover ALL portable configuration in the platform — not just modules and skills.  
> **First step:** Read this document fully. Then read `anton-bundler.ts`, `antonImport.ts`, `antonExport.ts`, and `anton-importer.ts` to understand what exists. Then execute the audit checklist. Then implement the expansion.  

---

## PART 1: AUDIT — Does The Codebase Match The Spec?

The .anton Format Specification (v1.0.0) defines a standard. The existing bundler code was written before the spec was formalized. Claude Code must check every point below and fix discrepancies.

---

### Audit 1: File Structure

**Spec says:**
```
package.anton (ZIP archive)
├── manifest.json
├── README.md
├── contents/
│   ├── modules/
│   ├── skills/
│   ├── personas/
│   ├── workflows/
│   ├── knowledge/
│   └── assets/
└── checksums.sha256
```

**Check in codebase:**
- [ ] Is the output a ZIP file with `.anton` extension?
- [ ] Does it contain a `manifest.json` at root level?
- [ ] Is content organized under a `contents/` directory?
- [ ] Are subdirectories named exactly as spec (`modules/`, `skills/`, etc.)?
- [ ] Is a `README.md` generated? (Recommended, not required)
- [ ] Is `checksums.sha256` generated? (Recommended, not required)

**If misaligned:** The bundler may use a flat structure or different directory names. Refactor to match the spec exactly. This is the public standard — the code must conform to our own specification.

---

### Audit 2: Manifest Schema

**Spec says `manifest.json` must contain:**

```json
{
  "format_version": "1.0.0",
  "package": {
    "id": "reverse.domain.package-name",
    "name": "Human Readable Name",
    "version": "1.0.0",
    "author": { "name": "", "organization": "", "email": "", "url": "" },
    "license": "Apache-2.0",
    "created_at": "ISO8601",
    "tags": [],
    "target_areas": [],
    "target_roles": [],
    "min_platform_version": "2.0.0",
    "languages": ["en"]
  },
  "contents": { "modules": 0, "skills": 0, ... },
  "compatibility": { "llm_providers": [] }
}
```

**Check in codebase:**
- [ ] Does the bundler generate a `manifest.json`?
- [ ] Does it include `format_version`?
- [ ] Does it use reverse-domain `id` format?
- [ ] Does it include `author` with name, organization, email, url?
- [ ] Does it include `contents` with counts per type?
- [ ] Does it include `compatibility.llm_providers`?
- [ ] Does it include `min_platform_version`?
- [ ] Does it include `tags` and `target_areas`?
- [ ] Is the `license` field present? (Should default to "Apache-2.0")
- [ ] Are timestamps ISO 8601?

**If misaligned:** The existing bundler likely has a simpler metadata format. Extend it to include all spec fields. Add sensible defaults where the user doesn't provide values (e.g., pull author from `user_profiles` table, default license to "Apache-2.0").

---

### Audit 3: Module Definition Schema

**Spec says each module JSON must contain:**
- `bundle_type`: "module"
- `module.id`, `module.name`, `module.area_id`, `module.area_name`
- `module.system_prompt`
- `module.config`: default_thinking_level, default_creativity, default_output_formats, recommended_model, max_tokens
- `module.input_schema`: required_context, optional_context, guided_questions
- `module.output_schema`: sections (expected output structure)
- `module.skills_attached`: array of skill IDs
- `module.persona_id`: linked persona

**Check in codebase:**
- [ ] Does the existing module export include all these fields?
- [ ] Does it include `bundle_type` as a discriminator?
- [ ] Does it include `input_schema` with guided questions?
- [ ] Does it include `output_schema` with expected sections?
- [ ] Does it link to skills and persona by ID?
- [ ] Are the field names exactly as specified (not camelCase vs snake_case mismatches)?

**If misaligned:** The existing module export likely captures the system prompt and basic config but may miss `input_schema`, `output_schema`, and the `bundle_type` discriminator. Add these fields. For existing modules that don't have explicit input/output schemas, generate reasonable defaults from the module configuration.

---

### Audit 4: Skill, Persona, Workflow Schemas

Run the same field-by-field check for:

**Skills:**
- [ ] `bundle_type`: "skill"
- [ ] `skill.id`, `skill.name`, `skill.description`
- [ ] `skill.prompt_fragment`
- [ ] `skill.attachment_rules` (applicable_areas, applicable_module_types, auto_attach)

**Personas:**
- [ ] `bundle_type`: "persona"
- [ ] `persona.id`, `persona.name`, `persona.description`
- [ ] `persona.prompt`
- [ ] `persona.expertise_areas`, `persona.tone`, `persona.perspective`

**Workflows:**
- [ ] `bundle_type`: "workflow"
- [ ] `workflow.id`, `workflow.name`, `workflow.description`
- [ ] `workflow.steps` array with: step_id, type, module_id, name, description, output_forwards_to, input_from
- [ ] Checkpoint steps include `decision_options`

---

### Audit 5: Import Validation

**Spec says importing software should:**
- Validate `manifest.json` against spec before processing
- Show package contents preview before applying
- Verify checksums if present
- Allow selective import
- Log imports in audit trail

**Check in codebase:**
- [ ] Does `antonImport.ts` / `anton-importer.ts` validate the manifest?
- [ ] Does it show a preview before importing?
- [ ] Does it check checksums?
- [ ] Can the user selectively import (e.g., modules but not workflows)?
- [ ] Does it log the import in the `audit_log` table?
- [ ] Does it handle version mismatches gracefully (format_version check)?
- [ ] Does it reject packages with unsupported major version?
- [ ] Does it gracefully ignore unknown fields (forward compatibility)?

---

### Audit 6: Export Completeness

**Check:** When exporting, does the bundler include ALL related content?

- [ ] Exporting a module → also exports its linked persona?
- [ ] Exporting a module → also exports its attached skills?
- [ ] Exporting a workflow → also exports all modules referenced in steps?
- [ ] Exporting a skill pack → exports modules + skills + personas + workflow?
- [ ] Does the export resolve all internal references so the package is self-contained?

---

### Audit 7: Security Compliance

**Spec says .anton files must NOT contain:**
- Executable code
- Scripts
- Binaries
- Anything that triggers network requests on import

**Check in codebase:**
- [ ] Does the bundler strip any executable content?
- [ ] Does the importer validate that no executable content is present?
- [ ] Are system prompts treated as text only (not eval'd)?
- [ ] Is there any code path where importing an .anton file could trigger a network request?

---

## PART 2: NEW BUNDLE TYPES — What Else Should Be .anton?

The original spec defines 6 bundle types. The Coding Area spec adds 3 more. After auditing the full platform, here are **8 additional bundle types** that should be added. Every one of these represents professional configuration that has value when shared between colleagues, teams, or community members.

The principle: **if someone spent time configuring it, someone else shouldn't have to repeat that work.** If it's portable and contains no sensitive data, make it .anton-exportable.

---

### NEW Bundle Type 1: `compliance-ruleset`

**What it is:** A set of custom compliance rules that an organization has built.

**Why it's valuable:** A compliance team at one bank builds custom rules for AMLR compliance checking (e.g., "All gap analyses must reference at least 5 specific AMLR articles," "Output must include risk quantification matrix"). Other banks need the same rules. Export them as .anton, share, import.

**Source tables:** `compliance_rules`

**JSON schema:**
```json
{
  "bundle_type": "compliance-ruleset",
  "ruleset": {
    "id": "amlr-compliance-checks",
    "name": "AMLR Compliance Rules",
    "description": "Custom rules for AMLR-related outputs",
    "rules": [
      {
        "rule_id": "AMLR_CITATION_001",
        "name": "AMLR Article Citations",
        "description": "All AMLR analyses must cite at least 5 specific articles",
        "category": "governance",
        "severity": "medium",
        "rule_type": "threshold",
        "rule_logic": {
          "field": "citation_count",
          "operator": ">=",
          "value": 5
        },
        "action": "warn",
        "applicable_areas": [1, 2],
        "applicable_modules": ["amlr-gap-analysis", "amlr-policy-review"]
      }
    ]
  }
}
```

**What NOT to include:** Rule execution history, violation records, user-specific data.

---

### NEW Bundle Type 2: `radar-config`

**What it is:** A configured set of regulatory radar sources and subscription filters.

**Why it's valuable:** One firm sets up monitoring for EU AML regulations — specific RSS feeds, EUR-Lex queries, keyword filters, jurisdiction scoping. Another firm in the same regulatory landscape needs the exact same setup. Export the radar configuration, import it, and you're monitoring the same sources from day one.

**Source tables:** `radar_sources`, radar subscription settings

**JSON schema:**
```json
{
  "bundle_type": "radar-config",
  "radar": {
    "id": "eu-aml-monitoring",
    "name": "EU AML/CFT Regulatory Radar",
    "description": "Monitoring setup for EU AML package regulations",
    "sources": [
      {
        "name": "European Banking Authority (EBA)",
        "source_type": "rss",
        "url": "https://www.eba.europa.eu/rss/...",
        "check_frequency": "daily",
        "keywords": ["AML", "CFT", "AMLD", "AMLR", "sanctions"],
        "jurisdictions": ["EU"],
        "categories": ["regulation", "consultation", "guideline"]
      },
      {
        "name": "EU AML/CFT (EUR-Lex)",
        "source_type": "eur_lex",
        "query_config": {
          "celex_prefixes": ["32024R1624", "32024L1640"],
          "search_terms": ["anti-money laundering"]
        },
        "check_frequency": "weekly"
      }
    ],
    "subscription_filters": {
      "min_relevance_score": 0.5,
      "auto_review_threshold": 0.8,
      "notification_channels": ["dashboard", "email"]
    }
  }
}
```

**What NOT to include:** Actual radar items fetched, user review decisions, API keys or authentication tokens.

---

### NEW Bundle Type 3: `quality-baseline`

**What it is:** A set of quality thresholds and scoring baselines for specific modules or areas.

**Why it's valuable:** A consulting firm establishes that their AMLR gap analyses must score 8.0+ on structure and 7.5+ on citations before client delivery. These baselines represent professional standards. Other teams or offices should use the same standards.

**Source tables:** `quality_baselines`, `quality_scores` (for reference only, not exported)

**JSON schema:**
```json
{
  "bundle_type": "quality-baseline",
  "baseline": {
    "id": "consulting-grade-fcp",
    "name": "Consulting-Grade FCP Quality Standards",
    "description": "Quality baselines for client-facing FCP deliverables",
    "baselines": [
      {
        "module_pattern": "area:1:*",
        "min_composite_score": 7.5,
        "dimension_thresholds": {
          "structure": 8.0,
          "depth": 7.0,
          "actionability": 7.5,
          "citations": 7.5
        },
        "enforcement": "warn",
        "notes": "Board reports require 8.5+ composite"
      }
    ],
    "grade_labels": {
      "9.0+": "Exceptional — ready for regulatory submission",
      "8.0-8.9": "Strong — client-ready",
      "7.0-7.9": "Acceptable — internal use or with review",
      "6.0-6.9": "Below standard — requires rework",
      "<6.0": "Insufficient — do not distribute"
    }
  }
}
```

---

### NEW Bundle Type 4: `brand-template`

**What it is:** Export styling and branding configuration for document exports (DOCX, PPTX, PDF).

**Why it's valuable:** A firm configures their brand colors, logos, header/footer text, font choices, and cover page layout for exports. New team members or other offices should produce documents with identical branding without reconfiguring.

**Source tables:** `brand_templates`

**JSON schema:**
```json
{
  "bundle_type": "brand-template",
  "brand": {
    "id": "advisense-brand-2026",
    "name": "Advisense Brand Template",
    "description": "Advisense brand styling for all document exports",
    "colors": {
      "primary": "#2E75B6",
      "secondary": "#1B4F72",
      "accent": "#27AE60",
      "text": "#333333",
      "background": "#FFFFFF",
      "table_header": "#D5E8F0"
    },
    "typography": {
      "heading_font": "Arial",
      "body_font": "Arial",
      "code_font": "Consolas"
    },
    "header": {
      "text": "Advisense — Confidential",
      "show_logo": true,
      "show_date": true
    },
    "footer": {
      "text": "© 2026 Advisense | Page {page} of {pages}",
      "show_page_numbers": true
    },
    "cover_page": {
      "enabled": true,
      "title_size": 36,
      "subtitle_size": 18
    }
  },
  "assets": {
    "logo": "assets/logo.png"
  }
}
```

**Note:** Logo and image files go in `contents/assets/` as actual files referenced by path. This is the one bundle type that includes binary assets.

---

### NEW Bundle Type 5: `output-chain`

**What it is:** A pre-configured chain of modules designed to run in sequence, where each step's output feeds the next — with audience adaptation and format conversion built in.

**Why it's valuable:** A compliance consultant builds the perfect chain: Gap Analysis → Executive Summary → Board Presentation → Action Plan with Deadlines. Each step uses the right persona, thinking level, and output format. This chain is reusable for every new client engagement.

**Source:** Workflow templates + module configurations (a specialized workflow)

**JSON schema:**
```json
{
  "bundle_type": "output-chain",
  "chain": {
    "id": "gap-to-board-chain",
    "name": "Gap Analysis to Board Report Chain",
    "description": "Full chain from gap analysis to board-ready deliverables",
    "steps": [
      {
        "step_order": 1,
        "name": "Detailed Gap Analysis",
        "module_id": "amlr-gap-analysis",
        "persona_id": "senior-mlro",
        "thinking_level": "investigate",
        "output_format": "structured_report",
        "checkpoint_after": true,
        "checkpoint_prompt": "Review gap analysis before generating executive summary"
      },
      {
        "step_order": 2,
        "name": "Executive Summary",
        "type": "audience_adaptation",
        "audience": "board",
        "input_from_step": 1,
        "output_format": "executive_summary",
        "max_length": "2 pages"
      },
      {
        "step_order": 3,
        "name": "Board Presentation",
        "type": "format_conversion",
        "input_from_step": 2,
        "output_format": "pptx",
        "template": "board-deck",
        "max_slides": 10
      },
      {
        "step_order": 4,
        "name": "Remediation Action Plan",
        "module_id": "remediation-plan",
        "input_from_step": 1,
        "persona_id": "project-manager",
        "thinking_level": "think_hard",
        "output_format": "action_plan"
      }
    ]
  }
}
```

**Distinction from `workflow`:** A workflow is the generic multi-step engine (12 step types, branching, scheduling). An output-chain is specifically a sequence of module executions with output forwarding, designed for document production. It's a specialized, opinionated workflow pattern.

---

### NEW Bundle Type 6: `review-panel`

**What it is:** A configured set of expert review perspectives for a specific domain or use case.

**Why it's valuable:** A team establishes that all FCP deliverables go through a 4-perspective review: Regulator's Eye, Board Member, Devil's Advocate, and Auditor. Each perspective has a custom prompt tuned to their industry. Export the panel, share across offices.

**JSON schema:**
```json
{
  "bundle_type": "review-panel",
  "panel": {
    "id": "fcp-delivery-review",
    "name": "FCP Deliverable Review Panel",
    "description": "4-perspective expert review for FCP client deliverables",
    "applicable_areas": [1, 2, 5, 6],
    "reviewers": [
      {
        "id": "regulator",
        "name": "Regulator's Eye",
        "icon": "🏛️",
        "prompt": "Review this output as if you are a financial supervisor at Finansinspektionen or EBA. Would this pass regulatory scrutiny? What would you ask follow-up questions about? What evidence is missing from a supervisory perspective?",
        "focus_areas": ["regulatory compliance", "evidence trail", "supervisory expectations"]
      },
      {
        "id": "board_member",
        "name": "Board Member",
        "icon": "👔",
        "prompt": "Review this as a non-executive board member receiving it at a board meeting. Is the strategic significance clear? Are resource implications quantified? What decisions does this enable or require?",
        "focus_areas": ["strategic clarity", "decision readiness", "resource implications"]
      },
      {
        "id": "devils_advocate",
        "name": "Devil's Advocate",
        "icon": "😈",
        "prompt": "Challenge every assumption in this output. What could go wrong? What has been overlooked? Where is the analysis weakest? What would a hostile peer reviewer attack?",
        "focus_areas": ["assumptions", "blind spots", "methodology gaps"]
      },
      {
        "id": "auditor",
        "name": "Internal Auditor",
        "icon": "🔍",
        "prompt": "Review from an audit perspective. Is the methodology documented? Is the evidence trail sufficient for an audit finding? Are controls adequately assessed?",
        "focus_areas": ["methodology documentation", "evidence sufficiency", "control assessment"]
      }
    ],
    "panel_settings": {
      "min_reviewers_for_approval": 3,
      "require_all_clear": false,
      "auto_run_on_thinking_level": ["investigate"]
    }
  }
}
```

---

### NEW Bundle Type 7: `project-template`

**What it is:** A complete project setup — modules, workflow, deadlines, quality baselines, review panel, radar config — all pre-wired for a specific engagement type.

**Why it's valuable:** This is the ultimate reuse package. A consulting firm does 20 AMLR readiness assessments a year. Each one follows the same structure: same modules, same workflow, same deadlines (relative to engagement start), same quality standards, same review panel. Export the entire project template once, import it for every new engagement, adapt the client-specific details.

**JSON schema:**
```json
{
  "bundle_type": "project-template",
  "template": {
    "id": "amlr-readiness-assessment",
    "name": "AMLR Readiness Assessment — Engagement Template",
    "description": "Complete project template for AMLR readiness assessments",
    "target_duration_weeks": 8,
    "included_bundles": {
      "modules": ["amlr-gap-analysis", "policy-review", "remediation-plan", "board-report", "training-needs"],
      "workflow": "amlr-implementation-workflow",
      "skill_pack": "mlro-compliance-pack",
      "review_panel": "fcp-delivery-review",
      "quality_baseline": "consulting-grade-fcp",
      "compliance_ruleset": "amlr-compliance-checks",
      "output_chains": ["gap-to-board-chain"],
      "radar_config": "eu-aml-monitoring"
    },
    "relative_deadlines": [
      {
        "name": "Gap Analysis Complete",
        "offset_weeks": 2,
        "from": "project_start",
        "priority": "high",
        "dependencies": []
      },
      {
        "name": "Policy Review Complete",
        "offset_weeks": 4,
        "from": "project_start",
        "priority": "high",
        "dependencies": ["Gap Analysis Complete"]
      },
      {
        "name": "Remediation Plan Approved",
        "offset_weeks": 6,
        "from": "project_start",
        "priority": "critical",
        "dependencies": ["Policy Review Complete"]
      },
      {
        "name": "Board Report Delivered",
        "offset_weeks": 8,
        "from": "project_start",
        "priority": "critical",
        "dependencies": ["Remediation Plan Approved"]
      }
    ],
    "adaptation_prompts": [
      "What is the client institution's name?",
      "What jurisdictions does the client operate in?",
      "What is the engagement start date?",
      "Who is the engagement lead?",
      "What is the target completion date?"
    ]
  }
}
```

**On import:** ANTON walks the user through the `adaptation_prompts`, converts relative deadlines to absolute dates based on the project start date, and creates the full project with all linked components.

---

### NEW Bundle Type 8: `audience-profile`

**What it is:** A configured audience adaptation profile that defines how to rewrite output for a specific stakeholder type.

**Why it's valuable:** Different firms have different board cultures, different regulatory relationships, different client expectations. An audience profile for "Scandinavian Bank Board" might emphasize different things than one for "UK Fund Management Board." Export audience profiles that encode organizational knowledge about how to communicate.

**JSON schema:**
```json
{
  "bundle_type": "audience-profile",
  "audience": {
    "id": "scandinavian-bank-board",
    "name": "Scandinavian Bank Board",
    "description": "Adaptation for Nordic bank board/senior management audience",
    "tone": "professional, understated, consensus-oriented",
    "max_length": "2-3 pages",
    "language_preferences": {
      "avoid": ["aggressive recommendations", "absolute statements", "US-centric references"],
      "prefer": ["balanced assessment", "options with trade-offs", "Nordic regulatory references"]
    },
    "emphasis": [
      "Regulatory risk and supervisory expectations",
      "Resource and budget implications",
      "Timeline against AMLR implementation deadline",
      "Comparison with Nordic peer institutions",
      "Clear decision points with options"
    ],
    "structure": [
      "Situation summary (1 paragraph)",
      "Key findings (3-5 bullets maximum)",
      "Risk assessment (red/amber/green)",
      "Recommended actions with resource estimate",
      "Decision required from the board"
    ],
    "system_prompt": "Rewrite this analysis for a Scandinavian bank board. The audience values understated professionalism, balanced assessment, and clear decision points. Lead with the regulatory context, present findings concisely, and end with specific decisions the board needs to make. Avoid absolute language — use 'we recommend considering' rather than 'you must.' Reference Nordic regulatory expectations (Finansinspektionen, EBA) rather than US frameworks. Maximum 3 pages."
  }
}
```

---

## PART 3: WHAT SHOULD NOT BE .ANTON

Not everything should be exportable. These items contain sensitive, personal, or execution-specific data that doesn't belong in a shareable package:

| Item | Why NOT .anton |
|------|---------------|
| **Connection configs with credentials** | API keys, passwords, database credentials = security breach if shared |
| **User profiles & apprentice profiles** | Personal data, learning preferences = privacy concern |
| **Session history & outputs** | Potentially contains client-confidential data. Use existing session export (not .anton) |
| **Audit logs** | Organization-specific operational data. Export as CSV/XLSX (existing feature) |
| **Institutional memory decisions** | Contains organization-specific judgment calls, potentially confidential reasoning |
| **Knowledge graph entities** | May contain extracted PII or confidential entity data from documents |
| **Radar items (fetched)** | These are per-instance results, not configuration. The config is exportable, the items are not |
| **Budget & usage data** | Organization-specific operational metrics |

**The rule:** Export configuration, methodology, and structure. Never export data, credentials, or personal information.

---

## PART 4: UPDATED BUNDLE TYPE REGISTRY

After this expansion, the complete .anton bundle type registry is:

| # | Bundle Type | Description | Priority |
|---|-------------|-------------|----------|
| 1 | `module` | Expert module (prompt + config + metadata) | ✅ Exists |
| 2 | `skill` | Reusable prompt fragment | ✅ Exists |
| 3 | `persona` | Expert persona definition | ✅ Exists |
| 4 | `workflow` | Multi-step workflow template | ✅ Exists |
| 5 | `skill-pack` | Curated bundle of modules + workflow | 🔨 Build now |
| 6 | `coding-blueprint` | Full software project template (Coding Large) | 📋 Build with Coding Area |
| 7 | `coding-review-profile` | Code review lens configuration (Coding Tier 1) | 📋 Build with Coding Area |
| 8 | `script-lite-template` | Data analysis script template (Coding Tier 2) | 📋 Build with Coding Area |
| 9 | `script-medium-template` | Application template (Coding Tier 3) | 📋 Build with Coding Area |
| 10 | `compliance-ruleset` | Custom compliance rules | 🔨 Build now |
| 11 | `radar-config` | Regulatory radar source configuration | 🔨 Build now |
| 12 | `quality-baseline` | Quality thresholds per module/area | 🔨 Build now |
| 13 | `brand-template` | Export styling and branding | 🟡 Build soon |
| 14 | `output-chain` | Sequential module chain for document production | 🔨 Build now |
| 15 | `review-panel` | Expert review perspective configuration | 🔨 Build now |
| 16 | `project-template` | Complete project setup with all components | 🟡 Build soon |
| 17 | `audience-profile` | Stakeholder communication adaptation | 🔨 Build now |

---

## PART 5: IMPLEMENTATION PLAN FOR CLAUDE CODE

### Step 1: Audit (Do First)

1. Read `anton-bundler.ts` line by line
2. Read `antonImport.ts` and `antonExport.ts` line by line  
3. Read `anton-importer.ts` if it exists separately
4. Read `anton-validator.ts` if it exists
5. Complete every checkbox in Part 1 above
6. Document findings: what matches, what doesn't, what's missing
7. Fix all misalignments with the spec before adding new bundle types

### Step 2: Refactor Bundler for Extensibility

The current bundler likely handles a fixed set of types. Refactor to support a registry pattern:

```typescript
// Bundle type registry — easy to extend
const BUNDLE_HANDLERS: Record<string, BundleHandler> = {
  'module': new ModuleBundleHandler(),
  'skill': new SkillBundleHandler(),
  'persona': new PersonaBundleHandler(),
  'workflow': new WorkflowBundleHandler(),
  'skill-pack': new SkillPackBundleHandler(),
  'compliance-ruleset': new ComplianceRulesetHandler(),
  'radar-config': new RadarConfigHandler(),
  'quality-baseline': new QualityBaselineHandler(),
  'brand-template': new BrandTemplateHandler(),
  'output-chain': new OutputChainHandler(),
  'review-panel': new ReviewPanelHandler(),
  'project-template': new ProjectTemplateHandler(),
  'audience-profile': new AudienceProfileHandler(),
  // Coding area types added when Coding Area is built
};

interface BundleHandler {
  export(id: string, db: Database): Promise<BundleContent>;
  import(content: BundleContent, db: Database): Promise<ImportResult>;
  validate(content: BundleContent): ValidationResult;
  preview(content: BundleContent): PreviewData;
}
```

This makes adding new bundle types a matter of implementing one interface, not modifying a monolithic bundler.

### Step 3: Add New Bundle Types (Priority Order)

**Immediate (build now):**
1. `compliance-ruleset` — high value, relatively simple (export from `compliance_rules` table)
2. `review-panel` — high value, simple (new concept, no existing table to migrate from)
3. `audience-profile` — high value, simple (new concept)
4. `quality-baseline` — high value, simple (export from `quality_baselines` table)
5. `radar-config` — high value, moderate (export from `radar_sources` table)
6. `output-chain` — high value, moderate (specialized workflow variant)
7. `skill-pack` — high value, complex (bundles multiple other types)

**Soon (next iteration):**
8. `brand-template` — moderate value (export from `brand_templates` table + asset files)
9. `project-template` — very high value but complex (bundles everything)

**With Coding Area:**
10-13. All coding bundle types (review-profile, script-lite, script-medium, coding-blueprint)

### Step 4: Update Import UI

The MarketplacePage.tsx import flow (from the implementation brief) should handle ALL bundle types:

```
📦 Package: AMLR Complete Setup v1.0
   Author: Advisense Nordic
   
   Contents:
   ├── 6 modules
   ├── 2 skills
   ├── 1 persona
   ├── 1 workflow
   ├── 1 compliance ruleset (8 custom rules)
   ├── 1 radar configuration (5 regulatory sources)
   ├── 1 quality baseline set
   ├── 1 review panel (4 perspectives)
   ├── 2 audience profiles (Board, Regulator)
   └── 1 output chain (Gap → Board Report)
   
   [Preview All] [Import All] [Select Items...] [Cancel]
```

When "Select Items..." is clicked, show checkboxes for each component.

### Step 5: Update Export UI

On every relevant page, add export buttons:

| Page | Export Option |
|------|-------------|
| `CompliancePage.tsx` | "Export Compliance Rules as .anton" |
| `RadarPage.tsx` | "Export Radar Configuration as .anton" |
| `QualityPage.tsx` | "Export Quality Baselines as .anton" |
| `ReviewEnginePage.tsx` | "Export Review Panel as .anton" |
| `WorkflowBuilder.tsx` | "Export Workflow as .anton" (exists) + "Export as Output Chain" (new) |
| `Settings.tsx` (brand section) | "Export Brand Template as .anton" |
| Project page | "Export Project Template as .anton" |
| Module page | "Export Module as .anton" (exists — verify spec compliance) |

### Step 6: Update Format Specification

After implementation, update `docs/ANTON_FORMAT_SPEC.md` to include:
- All new bundle type definitions (schemas from Part 2)
- Updated bundle type registry table
- Examples for each new type
- Bump format version to 1.1.0 (new optional bundle types = minor version)

---

## PART 6: MANIFEST EVOLUTION

With project-templates that bundle multiple other types, the manifest `contents` field needs to support nested counting:

```json
{
  "contents": {
    "modules": 6,
    "skills": 2,
    "personas": 1,
    "workflows": 1,
    "compliance_rulesets": 1,
    "radar_configs": 1,
    "quality_baselines": 1,
    "review_panels": 1,
    "audience_profiles": 2,
    "output_chains": 1,
    "brand_templates": 0,
    "project_templates": 0,
    "coding_blueprints": 0
  }
}
```

The importer should count each type and display it in the preview. Unknown types should be listed as "Unknown type: {name} (×{count})" for forward compatibility.

---

## SUMMARY

| Task | Priority | Estimated Effort |
|------|----------|-----------------|
| Audit existing bundler against spec | 🔴 Critical | 2-4 hours |
| Fix all spec misalignments | 🔴 Critical | 4-8 hours |
| Refactor bundler to registry pattern | 🔴 Critical | 4-6 hours |
| Add compliance-ruleset type | 🟠 High | 2-3 hours |
| Add review-panel type | 🟠 High | 2-3 hours |
| Add audience-profile type | 🟠 High | 2-3 hours |
| Add quality-baseline type | 🟠 High | 2-3 hours |
| Add radar-config type | 🟠 High | 3-4 hours |
| Add output-chain type | 🟠 High | 4-6 hours |
| Add skill-pack type | 🟠 High | 6-8 hours |
| Add export buttons to all pages | 🟡 Medium | 3-4 hours |
| Update import UI for all types | 🟡 Medium | 4-6 hours |
| Add brand-template type | 🟡 Medium | 4-6 hours |
| Add project-template type | 🟡 Medium | 8-12 hours |
| Update format spec to v1.1.0 | 🟡 Medium | 2-3 hours |

**Total estimated effort:** 50-75 hours

---

*Audit & expansion document for Claude Code — February 25, 2026*  
*Reference: ANTON_FORMAT_SPEC.md v1.0.0*
