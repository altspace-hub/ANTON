/**
 * personas-manager.ts
 * Loads personas from server/personas/ on disk + exposes built-in fallback personas.
 *
 * Directory structure:
 *   server/personas/{persona-id}/
 *     persona.json         — Metadata
 *     persona-prompt.md    — Prompt injection text (Layer 4: Perspective)
 */

import path from 'path';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PERSONAS_DIR = path.join(__dirname, '..', 'personas');

// ── Types ─────────────────────────────────────────────────────

export interface PersonaConfig {
  id: string;
  label: string;
  role: string;
  expertise: string[];
  applicableAreas?: string[];
  description: string;
  tags?: string[];
  /** Populated at load time from persona-prompt.md */
  prompt?: string;
  /** 'builtin' | 'disk' */
  source?: string;
}

// ── Cache ─────────────────────────────────────────────────────

let _personas: PersonaConfig[] | null = null;
let _index: Map<string, PersonaConfig> | null = null;

// ── Built-in personas ─────────────────────────────────────────
// These exist as a guaranteed fallback. Disk personas take precedence if IDs overlap.

const BUILTIN_PERSONAS: PersonaConfig[] = [
  {
    id: 'fcp-expert',
    label: 'FCP Expert',
    role: 'Senior Financial Crime Prevention Advisor',
    expertise: ['AML/CFT', 'Sanctions', 'Regulatory compliance', 'FATF standards'],
    applicableAreas: ['fcp', 'banking', 'legal', 'audit', 'risk'],
    description: '15+ years in financial crime prevention. Deep expertise in AML/CFT frameworks, FATF recommendations, EU AMLR, sanctions regimes. Rigorous, evidence-based, methodical.',
    tags: ['aml', 'cft', 'sanctions', 'fatf', 'fcp'],
    prompt: `You bring the perspective of a Senior Financial Crime Prevention Advisor with 15+ years of hands-on experience. Your approach is:
- Evidence-based: cite specific regulatory texts, FATF recommendations, EBA guidelines
- Risk-based: always prioritise by likelihood × impact
- Practical: focus on what regulated firms can actually implement
- Rigorous: flag uncertainty clearly; never speculate as fact
You have worked across multiple jurisdictions and know how regulators think when they examine institutions.`,
    source: 'builtin',
  },
  {
    id: 'legal-expert',
    label: 'Legal Expert',
    role: 'Senior Legal Counsel',
    expertise: ['Corporate law', 'Regulatory law', 'Contract law', 'Litigation'],
    applicableAreas: ['legal', 'fcp', 'banking', 'audit', 'consulting'],
    description: 'Experienced legal practitioner combining technical precision with commercial pragmatism. Structures analysis by legal risk, jurisdiction, and enforceability.',
    tags: ['legal', 'regulatory', 'compliance', 'contracts'],
    prompt: `You bring the perspective of a Senior Legal Counsel with deep expertise in regulatory and corporate law. Your approach is:
- Legally precise: distinguish between legal obligations, regulatory expectations, and best practice
- Jurisdictionally aware: flag when answers differ by jurisdiction
- Risk-calibrated: identify legal risk clearly, with likelihood and consequence
- Commercially grounded: balance legal purity with business reality
Never give legal advice as if you are the client's lawyer — always frame as legal analysis.`,
    source: 'builtin',
  },
  {
    id: 'fsa-regulator',
    label: 'Regulatory Examiner',
    role: 'Senior Financial Supervisory Examiner',
    expertise: ['Supervisory methodology', 'Risk-based examination', 'Regulatory expectations'],
    applicableAreas: ['fcp', 'banking', 'audit', 'risk', 'insurance'],
    description: 'Views problems through the lens of a financial regulator conducting an examination. Knows what supervisors look for, what triggers enforcement, and how to demonstrate compliance.',
    tags: ['regulatory', 'examination', 'supervision', 'enforcement'],
    prompt: `You bring the perspective of a Senior Financial Supervisory Examiner. Your approach is:
- Examiner mindset: ask "what would a regulator see when they look at this?"
- Outcomes-focused: regulators care about whether controls actually prevent harm
- Evidence-oriented: what documentation would support or undermine this position?
- Proportionality-aware: supervisors apply risk-based judgement, not mechanical checklists
When analysing documents or processes, assess them as if conducting a regulatory examination.`,
    source: 'builtin',
  },
  {
    id: 'pragmatist',
    label: 'Pragmatist',
    role: 'Experienced Implementation Specialist',
    expertise: ['Change management', 'Practical implementation', 'Stakeholder management'],
    applicableAreas: ['consulting', 'project-mgmt', 'strategy', 'hr', 'operations'],
    description: 'Cuts through complexity to find what actually works in practice. Focuses on implementation reality, stakeholder buy-in, and achievable outcomes.',
    tags: ['implementation', 'practical', 'change', 'delivery'],
    prompt: `You bring the perspective of an experienced Implementation Specialist who has seen many initiatives succeed and fail. Your approach is:
- Practically focused: "this sounds good in theory, but what actually happens in practice?"
- Implementation-first: always consider feasibility, resourcing, and organisational readiness
- Stakeholder-aware: who needs to change behaviour, and will they?
- Bias for action: prefer a good plan executed well over a perfect plan never started
Challenge unrealistic timelines, under-resourced plans, and solutions that don't fit the organisation's culture.`,
    source: 'builtin',
  },
];

// ── Disk loader ───────────────────────────────────────────────

async function loadPersonaFromDisk(personaDir: string): Promise<PersonaConfig | null> {
  const configPath = path.join(personaDir, 'persona.json');
  const promptPath = path.join(personaDir, 'persona-prompt.md');

  if (!await fs.pathExists(configPath)) return null;

  try {
    const config: PersonaConfig = await fs.readJson(configPath);
    config.source = 'disk';

    if (await fs.pathExists(promptPath)) {
      config.prompt = (await fs.readFile(promptPath, 'utf-8')).trim();
    }

    return config;
  } catch (err) {
    console.error(`[personas-manager] Failed to load persona at ${personaDir}:`, err);
    return null;
  }
}

async function loadAll(): Promise<void> {
  const diskPersonas: PersonaConfig[] = [];

  if (await fs.pathExists(PERSONAS_DIR)) {
    const entries = await fs.readdir(PERSONAS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const persona = await loadPersonaFromDisk(path.join(PERSONAS_DIR, entry.name));
      if (persona) diskPersonas.push(persona);
    }
  }

  // Merge: disk personas override builtins with the same ID
  const diskIds = new Set(diskPersonas.map((p) => p.id));
  const merged = [
    ...BUILTIN_PERSONAS.filter((p) => !diskIds.has(p.id)),
    ...diskPersonas,
  ];

  _personas = merged;
  _index = new Map(merged.map((p) => [p.id, p]));

  console.log(`[personas-manager] Loaded ${merged.length} persona(s) (${diskPersonas.length} from disk, ${merged.length - diskPersonas.length} built-in)`);
}

// ── Public API ────────────────────────────────────────────────

export async function getPersonas(): Promise<PersonaConfig[]> {
  if (!_personas) await loadAll();
  return _personas!;
}

export async function getPersona(id: string): Promise<PersonaConfig | undefined> {
  if (!_index) await loadAll();
  return _index!.get(id);
}

export async function resolvePersonas(ids: string[]): Promise<PersonaConfig[]> {
  if (!_index) await loadAll();
  return ids.map((id) => _index!.get(id)).filter(Boolean) as PersonaConfig[];
}

/**
 * Build the persona injection text for use in system prompts (Layer 4).
 * Returns empty string if no personas found.
 */
export async function buildPersonaInjection(ids: string[]): Promise<string> {
  const personas = await resolvePersonas(ids);
  if (personas.length === 0) return '';

  const blocks = personas
    .filter((p) => p.prompt)
    .map((p) => `### Perspective: ${p.label} (${p.role})\n${p.prompt}`);

  if (blocks.length === 0) return '';

  return `## EXPERT PERSPECTIVES\nThe following expert perspectives shape how you approach this task:\n\n${blocks.join('\n\n')}`;
}

export function invalidatePersonaCache(): void {
  _personas = null;
  _index = null;
}
