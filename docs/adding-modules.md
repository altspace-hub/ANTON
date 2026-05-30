# Adding Modules to openEXPERT

This guide explains how to add a new expert module to openEXPERT. Modules are the core unit of the platform — each one packages an AI-assisted professional task with a pre-built system prompt, sensible defaults, and guided inputs.

No TypeScript required for a basic module. If your module needs custom UI beyond the standard guided inputs, you will also write a small React component.

---

## What is a Module?

A **module** is a named expert task within an **area**. Examples:

- Area: **FCP** → Module: **AMLR Gap Analysis**
- Area: **Legal** → Module: **Contract Summary**
- Area: **Cyber** → Module: **Incident Response Playbook**

Each module has:
- A `module.json` file describing its metadata, defaults, and guided inputs
- A `system-prompt.md` file containing the AI's instructions

Both files live in `server/areas/<area-id>/modules/<module-id>/`.

---

## File Structure

```
server/areas/
└── <area-id>/
    ├── area.json               # Area metadata
    ├── area-context.md         # Injected into every module in this area
    └── modules/
        └── <module-id>/
            ├── module.json     # Module metadata, defaults, guided inputs
            └── system-prompt.md    # The AI's system prompt for this module
```

---

## Worked Example: Contract Summary Module

We will add a **Contract Summary** module to a **Legal** area. This module reads a contract document and extracts key terms, obligations, risks, and red flags.

### Step 1: Ensure the area exists

Check whether `server/areas/legal/` exists. If not, create the area first (see the Contributing guide). For this example, assume the Legal area already exists.

### Step 2: Create the module directory

```bash
mkdir -p server/areas/legal/modules/contract-summary
```

### Step 3: Write `module.json`

Create `server/areas/legal/modules/contract-summary/module.json`:

```json
{
  "id": "contract-summary",
  "areaId": "legal",
  "label": "Contract Summary",
  "icon": "FileText",
  "description": "Extract key terms, obligations, risks, and red flags from any commercial contract.",
  "version": "1.0.0",
  "author": "Daniel Bardun & Futurechain",

  "defaultModel": "claude-opus-4-8",
  "defaultThinking": "think_hard",
  "defaultCreativity": "strict",

  "defaultOutputFormats": ["executive-summary", "detailed-findings", "action-plan"],

  "defaultKnowledgeSources": {
    "claudeKnowledge": {
      "enabled": true,
      "webSearchEnabled": false,
      "description": "Contract law principles and standard commercial terms"
    },
    "onlineReference": {
      "enabled": false,
      "urls": [],
      "fetchDepth": "summary"
    },
    "localFolder": {
      "enabled": true,
      "recursive": false
    },
    "combinedMode": {
      "enabled": false,
      "priority": "merged"
    }
  },

  "guidedInputs": [
    {
      "id": "contractType",
      "label": "Contract type",
      "type": "select",
      "required": true,
      "options": [
        "Service agreement",
        "Software licence (SaaS)",
        "Non-disclosure agreement (NDA)",
        "Employment contract",
        "Vendor / supplier agreement",
        "Partnership agreement",
        "Asset purchase agreement",
        "Other"
      ],
      "helpText": "Selecting the correct type ensures the AI applies the right review criteria."
    },
    {
      "id": "ourRole",
      "label": "Our party's role",
      "type": "select",
      "required": true,
      "options": ["Customer / buyer", "Vendor / supplier", "Both / JV", "Third party / beneficiary"],
      "helpText": "Determines which obligations and risks to prioritise."
    },
    {
      "id": "jurisdiction",
      "label": "Governing law",
      "type": "text",
      "required": false,
      "placeholder": "e.g. English law, Swedish law, New York law",
      "helpText": "The law governing the contract. Leave blank if unknown."
    },
    {
      "id": "contractValue",
      "label": "Estimated contract value",
      "type": "select",
      "required": false,
      "options": [
        "Under €50,000",
        "€50,000 – €500,000",
        "€500,000 – €5,000,000",
        "Over €5,000,000",
        "Not disclosed"
      ],
      "helpText": "Helps calibrate risk thresholds and liability cap assessment."
    },
    {
      "id": "focusAreas",
      "label": "Focus areas (optional)",
      "type": "textarea",
      "required": false,
      "placeholder": "e.g. liability caps, IP ownership, termination for convenience, data processing clauses, auto-renewal",
      "helpText": "List any clauses or topics you are particularly concerned about. The AI will give these extra attention."
    },
    {
      "id": "knownConcerns",
      "label": "Known concerns or red flags",
      "type": "textarea",
      "required": false,
      "placeholder": "e.g. supplier has history of late delivery, contract was drafted by counterparty",
      "helpText": "Any context about the counterparty or deal that might affect the risk assessment."
    }
  ],

  "suggestedFollowUps": [
    "Generate a redline negotiation memo with suggested changes",
    "Draft a risk summary for the board",
    "Create a comparison against our standard contract template"
  ]
}
```

### Field reference for `module.json`

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | URL-safe identifier. Use kebab-case. Must be unique within the area. |
| `areaId` | string | Yes | The parent area's `id`. Must match the directory name. |
| `label` | string | Yes | Display name shown in the UI. |
| `icon` | string | Yes | Lucide React icon name (PascalCase). See lucide.dev for options. |
| `description` | string | Yes | One-line description shown in the module card and sidebar tooltip. |
| `version` | string | Yes | Semver version of this module definition. |
| `author` | string | No | Who wrote this module. |
| `defaultModel` | string | Yes | Default LLM. Use `claude-opus-4-8` for all serious work. |
| `defaultThinking` | string | Yes | `quick`, `think`, `think_hard`, `investigate`, or `plan_first`. |
| `defaultCreativity` | string | Yes | `strict`, `balanced`, or `creative`. |
| `defaultOutputFormats` | string[] | Yes | IDs from `src/lib/output-format-definitions.ts`. At least one. |
| `defaultKnowledgeSources` | object | Yes | The 4-mode knowledge source config. Enable what makes sense for this module. |
| `guidedInputs` | array | No | Structured inputs rendered as form fields in the UI. See below. |
| `suggestedFollowUps` | string[] | No | Pre-written follow-up prompts shown after the first response. |

### Guided input types

| Type | Renders as | Notes |
|---|---|---|
| `text` | Single-line text input | Use for short values: jurisdiction, entity name |
| `textarea` | Multi-line text area | Use for free-form descriptions, lists |
| `select` | Dropdown / radio group | Requires `options: string[]` |
| `multiselect` | Checkboxes | Requires `options: string[]` |
| `number` | Numeric input | Optional `min`, `max` |
| `boolean` | Toggle switch | Yes / No |

### Step 4: Write `system-prompt.md`

Create `server/areas/legal/modules/contract-summary/system-prompt.md`:

```markdown
# Contract Summary and Risk Review

## Role

You are a senior commercial lawyer with 20 years of experience reviewing contracts across multiple jurisdictions. You have deep expertise in identifying unfavourable terms, hidden risks, and negotiation opportunities. You combine legal precision with practical commercial judgement.

## Primary Task

Review the contract provided in the context documents and produce a thorough summary and risk assessment. Your output must enable a business decision-maker to understand exactly what they are agreeing to and what risks they are taking on — without needing to read the full contract.

## Review Checklist

For every contract, systematically assess:

### 1. Parties and Scope
- Full legal names and jurisdiction of incorporation of all parties
- Precise scope of goods, services, or rights being exchanged
- Territory and exclusivity provisions

### 2. Commercial Terms
- Contract value, payment terms, and invoicing requirements
- Price adjustment mechanisms, indexation, or benchmarking rights
- Penalty clauses, liquidated damages, or service credits

### 3. Term and Termination
- Contract duration and start date
- Renewal provisions (automatic renewal, notice periods)
- Termination rights: for convenience, for cause, for insolvency
- Consequences of termination (wind-down period, data return, survival clauses)

### 4. Liability and Indemnities
- Liability cap (amount, basis — e.g. annual fees, direct loss only)
- Exclusions from the cap (typically: IP infringement, death/personal injury, wilful misconduct)
- Indemnification obligations and carve-outs
- Insurance requirements

### 5. Intellectual Property
- Ownership of deliverables and work product
- Licence grants (scope, duration, sublicensing rights)
- Background IP protection
- Open source obligations

### 6. Data and Privacy
- Data processing obligations and GDPR compliance (if applicable)
- Data localisation requirements
- Breach notification obligations
- Data return or destruction on termination

### 7. Confidentiality
- Scope and duration of confidentiality obligations
- Permitted disclosures
- Obligations that survive termination

### 8. Dispute Resolution
- Governing law and jurisdiction
- Dispute escalation process
- Arbitration vs. litigation
- Venue and applicable rules

### 9. Standard Clauses
- Force majeure (scope, notice, right to terminate)
- Assignment and change of control
- Entire agreement and variation
- Notices and counterparts

## Risk Assessment

For each identified issue:
- Rate severity: **Critical** / **High** / **Medium** / **Low**
- State the risk clearly in plain language
- Quote the relevant clause (clause number and brief extract)
- Suggest a negotiation position or mitigation

## Quality Standards

- Quote clause numbers for every finding. Never state a risk without citing its source.
- Use the contract's defined terms (e.g. "Services", "Deliverables") consistently.
- Distinguish between risks that are standard market practice and those that are genuinely unusual or aggressive.
- Flag any clauses that are missing but should be present (e.g. no liability cap is itself a critical risk).
- If the governing law significantly affects interpretation, note it explicitly.
- Do not speculate about intent. Assess the contract as written.

## Tone

Professional and precise. Write for a non-lawyer business executive who needs to make a decision. Avoid legal jargon where plain language is clearer. When legal precision is necessary, explain the term.
```

### Step 5: Test the module

Start the development server and navigate to your module. Upload a sample contract and run it. Check that:

- The guided inputs render correctly
- The system prompt produces the expected output structure
- The default output formats (Executive Summary, Detailed Findings, Action Plan) are pre-selected
- Export to DOCX and XLSX works correctly

---

## Tips for Writing Good System Prompts

**Be specific about structure.** Tell Claude exactly what sections to include, in what order, with what headings. Vague prompts produce vague outputs.

**Define the role precisely.** "You are a senior commercial lawyer with 20 years of experience" is better than "You are a legal expert". Specificity calibrates tone and vocabulary.

**Set quality standards explicitly.** List what makes a good output: cite sources, flag uncertainty, use specific terminology, do not speculate.

**Use a review checklist.** For analytical modules, an explicit checklist ensures Claude covers every dimension systematically, even if the user's document is incomplete.

**Calibrate thinking level.** Investigative tasks (gap analysis, risk assessment) → `investigate`. Document drafting → `think_hard`. Summarisation → `think`. Simple extraction → `quick`.

**Match creativity to task type.**
- `strict` — legal review, regulatory analysis, compliance assessment (precision over style)
- `balanced` — most modules (accurate and readable)
- `creative` — training content, client proposals, communications (engaging and compelling)

---

## Community Module Submission

If you have written a module that others would find useful, please share it. See the [module_submission issue template](.github/ISSUE_TEMPLATE/module_submission.md) on GitHub to submit it for review and inclusion in the community library.

You can also export your module as a `.anton` bundle from the openEXPERT UI (Settings → Export Module) and attach it to your GitHub issue.
