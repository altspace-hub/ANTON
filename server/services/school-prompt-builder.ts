/**
 * School Mode Prompt Builder
 *
 * Assembles the 7-layer prompt system for School Mode.
 * Layer 1: System Foundation (school-system-foundation.md)
 * Layer 2: Subject Context (areas/school/{subject}/area-context.md)
 * Layer 3: Lesson Methodology (areas/school/{subject}/modules/{module}/system-prompt.md)
 * Layer 4: Teacher Persona (personas/school/{personaId}-prompt.md)
 * Layer 5: Pedagogical Skills (Socratic method, scaffolding — inline)
 * Layer 6: Knowledge Sources (curriculum docs, textbooks)
 * Layer 7: Assistance Level + Task Type (inline instruction)
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.join(__dirname, '..');

export interface SchoolPromptConfig {
  educationTier: 'T1' | 'T2' | 'T3' | 'T4' | 'T5';
  subjectId: string;          // 'mathematics'
  moduleId?: string;          // 'algebra', 'geometry', etc.
  topic?: string;             // Specific topic within module
  teacherPersonaId: string;   // 'alma'
  assistanceLevel: 'L1' | 'L2' | 'L3' | 'L4';
  taskType: 'homework' | 'studying' | 'practice' | 'quick_question' | 'assessment';
  curriculumId?: string;      // 'lgr22'
  additionalContext?: string; // Uploaded docs, specific instructions
  growthStage?: string;       // 'S1' | 'S2' | 'S3' | 'S4'
  senMode?: string | null;    // 'dyslexia' | 'adhd' | null
  explanationStyle?: string;  // 'balanced' | 'examples_first' | 'theory_first' | 'visual' | 'verbal'
}

async function readPromptFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return '';
  }
}

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

export async function buildSchoolPrompt(config: SchoolPromptConfig): Promise<string> {
  const layers: string[] = [];

  // ── Layer 1: System Foundation ─────────────────────────────────────────────
  const foundationTemplate = await readPromptFile(
    path.join(SERVER_DIR, 'prompts', 'school-system-foundation.md')
  );
  if (foundationTemplate) {
    const foundation = interpolate(foundationTemplate, {
      tier: config.educationTier,
      subject: config.subjectId,
      topic: config.topic ?? 'general',
      assistance_level: config.assistanceLevel,
      persona_name: config.teacherPersonaId,
      curriculum_name: config.curriculumId ?? 'lgr22',
      task_type: config.taskType,
    });
    layers.push(foundation);
  }

  // ── Layer 1.5: Student Growth Stage ──────────────────────────────────────
  if (config.growthStage) {
    const stageDesc: Record<string, string> = {
      S1: 'This student is brand new to AI-assisted learning (Stage 1: Getting to Know). Use maximum scaffolding. Never assume prior knowledge. Celebrate every step. Keep responses short and encouraging.',
      S2: 'This student is building confidence (Stage 2). Regular Socratic questioning. Connect new concepts to what they already know.',
      S3: 'This student has a solid foundation (Stage 3: Deepening Mastery). Challenge with harder variations. Expect independent application. Ask "why" and "what if" questions.',
      S4: 'This student is nearly independent (Stage 4). Minimal scaffolding. Treat as a near-peer. Focus on metacognition and self-directed learning.',
    };
    if (stageDesc[config.growthStage]) {
      layers.push(`\n\n---\n\n## Student Growth Stage\n\n${stageDesc[config.growthStage]}`);
    }
  }

  // ── Layer 2: Subject Context ───────────────────────────────────────────────
  const areaContextPath = path.join(
    SERVER_DIR, 'areas', 'school', config.subjectId, 'area-context.md'
  );
  const areaContext = await readPromptFile(areaContextPath);
  if (areaContext) {
    layers.push(`\n\n---\n\n${areaContext}`);
  }

  // ── Layer 3: Lesson Methodology ────────────────────────────────────────────
  if (config.moduleId) {
    const lessonPromptPath = path.join(
      SERVER_DIR, 'areas', 'school', config.subjectId,
      'modules', config.moduleId, 'system-prompt.md'
    );
    const lessonPrompt = await readPromptFile(lessonPromptPath);
    if (lessonPrompt) {
      layers.push(`\n\n---\n\n${lessonPrompt}`);
    }
  }

  // ── Layer 4: Teacher Persona ───────────────────────────────────────────────
  const personaPromptPath = path.join(
    SERVER_DIR, 'personas', 'school', `${config.teacherPersonaId}-prompt.md`
  );
  const personaPrompt = await readPromptFile(personaPromptPath);
  if (personaPrompt) {
    layers.push(`\n\n---\n\n${personaPrompt}`);
  }

  // ── Layer 5: Pedagogical Skills ────────────────────────────────────────────
  // Inline — specific to task type and assistance level
  const layer5 = buildPedagogicalSkillsLayer(config);
  if (layer5) layers.push(`\n\n---\n\n${layer5}`);

  // ── Layer 6: Knowledge Sources ─────────────────────────────────────────────
  if (config.curriculumId === 'lgr22' || config.curriculumId === undefined) {
    const curriculumPath = path.join(
      SERVER_DIR, '..', 'curricula', 'se', 'grundskolan', 'matematik', 'centralt_innehall.json'
    );
    try {
      const curriculumData = await fs.readJson(curriculumPath);
      const relevantTopic = config.moduleId
        ? curriculumData.topics?.find((t: { module_ids: string[]; name: string; subtopics: string[] }) =>
            t.module_ids?.includes(config.moduleId!)
          )
        : null;

      if (relevantTopic) {
        layers.push(`\n\n---\n\n## Curriculum Reference (Lgr22)\n\n**Topic area:** ${relevantTopic.name}\n\n**Centralt innehåll (Core content):**\n${relevantTopic.subtopics.map((s: string) => `- ${s}`).join('\n')}`);
      }
    } catch {
      // Non-fatal — proceed without curriculum reference
    }
  }

  if (config.curriculumId === 'lk20') {
    // Norwegian LK20 — map subject to Norwegian curriculum file
    const subjectFileMap: Record<string, string> = {
      mathematics: 'matematikk',
      'advanced-mathematics': 'matematikk',
      science: 'naturfag',
      biology: 'naturfag',
      chemistry: 'naturfag',
      physics: 'naturfag',
      svenska: 'norsk',
      english: 'norsk',
      'social-studies': 'samfunnsfag',
    };
    const noSubject = subjectFileMap[config.subjectId] ?? config.subjectId;
    const noPath = path.join(SERVER_DIR, '..', 'curricula', 'no', 'grunnskole', `${noSubject}.json`);
    try {
      const noData = await fs.readJson(noPath);
      const tier = config.educationTier;
      const gradeKey = tier === 'T1' ? 'grade1-2' : tier === 'T2' ? 'grade5-7' : 'grade8-10';
      const aims = noData.competencyAims?.[gradeKey] as string[] | undefined;
      if (aims) {
        layers.push(`\n\n---\n\n## Curriculum Reference (LK20 — ${noData.subjectName})\n\n**Kompetansemål (${gradeKey}):**\n${aims.map((a: string) => `- ${a}`).join('\n')}${noData.note ? `\n\n**Note:** ${noData.note}` : ''}`);
      } else {
        layers.push(`\n\n---\n\n## Curriculum Reference (LK20 Norway)\n\nThis class follows the Norwegian national curriculum (Læreplanverket, LK20). Core elements: ${(noData.coreElements as string[] | undefined)?.join(', ') ?? 'see curriculum documentation'}.`);
      }
    } catch {
      layers.push(`\n\n---\n\n## Curriculum Reference (LK20 Norway)\n\nThis class follows the Norwegian national curriculum (Læreplanverket, LK20 — Fagfornyelsen). Adapt content to Norwegian competency aims, emphasise deep learning, critical thinking, and interdisciplinary topics.`);
    }
  }

  if (config.curriculumId === 'uk-ks3' || config.curriculumId === 'uk-ks4') {
    const ksDir = config.curriculumId === 'uk-ks3' ? 'ks3' : 'ks4';
    const ukSubjectMap: Record<string, string> = {
      mathematics: config.curriculumId === 'uk-ks4' ? 'mathematics-gcse' : 'mathematics',
      science: config.curriculumId === 'uk-ks4' ? 'science-gcse' : 'science',
      english: 'english',
      svenska: 'english',
      biology: config.curriculumId === 'uk-ks4' ? 'science-gcse' : 'science',
      chemistry: config.curriculumId === 'uk-ks4' ? 'science-gcse' : 'science',
      physics: config.curriculumId === 'uk-ks4' ? 'science-gcse' : 'science',
    };
    const ukFile = ukSubjectMap[config.subjectId] ?? config.subjectId;
    const ukPath = path.join(SERVER_DIR, '..', 'curricula', 'uk', ksDir, `${ukFile}.json`);
    try {
      const ukData = await fs.readJson(ukPath);
      const ksLabel = config.curriculumId === 'uk-ks3' ? 'KS3 (Years 7–9)' : 'KS4 / GCSE (Years 10–11)';
      // Flatten topics from programmesOfStudy or tiers
      const topicLines: string[] = [];
      if (ukData.programmesOfStudy) {
        for (const [area, items] of Object.entries(ukData.programmesOfStudy)) {
          topicLines.push(`**${area}:** ${(items as string[]).join('; ')}`);
        }
      } else if (ukData.tiers) {
        if (ukData.tiers.foundation) topicLines.push(`**Foundation (grades 1-5):** ${ukData.tiers.foundation.topics?.join('; ')}`);
        if (ukData.tiers.higher?.additionalTopics) topicLines.push(`**Higher additional:** ${ukData.tiers.higher.additionalTopics.join('; ')}`);
      }
      if (ukData.biology) topicLines.push(`**Biology:** ${(ukData.biology.topics as string[]).slice(0, 3).join('; ')} (and more)`);
      if (ukData.chemistry) topicLines.push(`**Chemistry:** ${(ukData.chemistry.topics as string[]).slice(0, 3).join('; ')} (and more)`);
      if (ukData.physics) topicLines.push(`**Physics:** ${(ukData.physics.topics as string[]).slice(0, 3).join('; ')} (and more)`);

      layers.push(`\n\n---\n\n## Curriculum Reference (UK National Curriculum — ${ksLabel})\n\n**Subject:** ${ukData.subjectName}\n\n${topicLines.map(l => `- ${l}`).join('\n')}${ukData.examStructure ? `\n\n**Exam structure:** ${ukData.examStructure}` : ''}`);
    } catch {
      const ksLabel = config.curriculumId === 'uk-ks3' ? 'KS3 (Years 7–9)' : 'GCSE KS4 (Years 10–11)';
      layers.push(`\n\n---\n\n## Curriculum Reference (UK National Curriculum — ${ksLabel})\n\nThis class follows the UK National Curriculum for ${ksLabel}. Align content with DfE programmes of study. For GCSE subjects, refer to AQA/Edexcel/OCR specifications as appropriate.`);
    }
  }

  // ── Layer 6: fr-bac curriculum ─────────────────────────────────────────
  if (config.curriculumId === 'fr-bac') {
    try {
      const curricPath = path.join(SERVER_DIR, '..', 'curricula', 'fr', 'lycee', `${config.subjectId}.json`);
      if (fs.existsSync(curricPath)) {
        const curricData = JSON.parse(fs.readFileSync(curricPath, 'utf8'));
        layers.push(`\n\n---\n\n## Programme Baccalauréat (France)\n${JSON.stringify(curricData, null, 2)}`);
      }
    } catch { /* non-fatal */ }
  }

  if (config.additionalContext) {
    layers.push(`\n\n---\n\n## Additional Context\n\n${config.additionalContext}`);
  }

  // ── Layer 7: Assistance Level + Task Type Summary ─────────────────────────
  const layer7 = buildAssistanceSummaryLayer(config);
  layers.push(`\n\n---\n\n${layer7}`);

  // ── Layer 7.5: SEN Accommodations ────────────────────────────────────────
  if (config.senMode === 'dyslexia') {
    layers.push(`\n\n---\n\n## Accessibility: Dyslexia Mode\n\nALWAYS use:\n- Short sentences (max 15 words each)\n- Bullet points instead of dense paragraphs\n- Bold key terms on first use\n- Analogies over text-heavy explanations\n- Blank line between each idea`);
  } else if (config.senMode === 'adhd') {
    layers.push(`\n\n---\n\n## Accessibility: ADHD Mode\n\nALWAYS use:\n- Max 3 short paragraphs per response\n- One concept at a time\n- End with a single clear next step\n- Immediate positive reinforcement\n- "Does that make sense so far?" between ideas`);
  }

  return layers.join('').trim();
}

function buildPedagogicalSkillsLayer(config: SchoolPromptConfig): string {
  const parts: string[] = ['## Pedagogical Skills for This Session'];

  if (config.taskType === 'homework' || config.taskType === 'studying') {
    parts.push(`
### Scaffolding Techniques Available:
- **Chunking:** Break complex problems into small, manageable steps
- **Think-aloud modelling:** Show your reasoning process explicitly ("I notice that... so I think...")
- **Analogical reasoning:** Connect to familiar contexts ("This is like...")
- **Error analysis:** When the student makes a mistake, ask "What was your reasoning here?" before correcting
- **Fading:** Start with maximum support, gradually reduce hints as the student gains confidence`);
  }

  if (config.assistanceLevel === 'L1') {
    parts.push(`
### L1 Socratic Protocol — STRICT MODE:
You MUST NOT provide the answer under any circumstances.
If directly asked for the answer, respond: "I know you want the answer! But working through it together will make sure you can do the next one too. What have you tried so far?"
Always end your message with a question that moves the student forward.`);
  }

  if (config.taskType === 'assessment') {
    parts.push(`
### Assessment Mode:
During an assessment, you MUST follow the assistance level setting strictly.
If assistance_level is L1 or L2, you may NOT give answers or confirm whether answers are correct until the student has submitted.
After submission, provide detailed explanation and feedback.`);
  }

  return parts.join('\n');
}

function buildAssistanceSummaryLayer(config: SchoolPromptConfig): string {
  const levelDescriptions: Record<string, string> = {
    L1: 'FULL GUIDANCE — Socratic only. NEVER give the answer. End every response with a guiding question.',
    L2: 'MODERATE HELP — Explain concepts clearly. Give worked examples on similar (not identical) problems.',
    L3: 'PRACTICE MODE — Generate practice problems. Check answers. Explain errors.',
    L4: 'REFERENCE MODE — Answer directly and clearly. Explain reasoning. Check understanding at end.',
  };

  const taskDescriptions: Record<string, string> = {
    homework: "The student is working on a homework assignment. Follow the Socratic nudging protocol.",
    studying: "The student is studying independently. Be a supportive, knowledgeable study partner.",
    practice: "Generate practice problems. The student wants to test and improve their skills.",
    quick_question: "Answer a quick factual or conceptual question. Be concise and clear.",
    assessment: "The student is completing an assessed assignment. Enforce the assistance level strictly.",
  };

  return `## Active Session Parameters

**Assistance Level:** ${config.assistanceLevel} — ${levelDescriptions[config.assistanceLevel]}

**Task Type:** ${taskDescriptions[config.taskType]}

**Education Tier:** ${config.educationTier} (adjust complexity and vocabulary accordingly)

**Subject:** ${config.subjectId}${config.moduleId ? ` — ${config.moduleId}` : ''}${config.topic ? ` — ${config.topic}` : ''}`;
}

/**
 * Detect which module best matches a student's question for a given subject.
 * Used when no explicit moduleId is provided.
 */
export function inferMathsModule(text: string): string {
  return inferSubjectModule(text, 'mathematics');
}

export function inferSubjectModule(text: string, subjectId: string): string {
  const lower = text.toLowerCase();

  switch (subjectId) {
    case 'mathematics':
      if (/equat|algebra|linear|quadrat|ekvation/i.test(lower)) return 'algebra';
      if (/triangle|circle|area|perimeter|pythag|geometr|geometri|omkrets/i.test(lower)) return 'geometry';
      if (/statistic|probability|mean|median|mode|sannolikhet|statistik/i.test(lower)) return 'statistics';
      if (/function|gradient|y=|kx|samband|funktion/i.test(lower)) return 'functions';
      if (/fraction|decimal|percent|power|root|bråk|procent|potens/i.test(lower)) return 'number-theory';
      return 'algebra';

    case 'svenska':
      if (/läs|read|text|förstå|comprehend|passage|stycke/i.test(lower)) return 'reading-comprehension';
      if (/skriv|write|essay|uppsats|berättel|text typ|berättande|argumenter/i.test(lower)) return 'writing';
      if (/grammatik|grammar|ordklass|satsde|verb|substantiv|adjektiv|syntax/i.test(lower)) return 'grammar';
      if (/litteratur|literature|bok|roman|berättare|tema|karaktär|analys/i.test(lower)) return 'literature';
      if (/tala|prata|presentation|redovisning|muntlig|speaking|speech/i.test(lower)) return 'oral-skills';
      return 'writing';

    case 'english':
      if (/read|text|passage|comprehension|understand/i.test(lower)) return 'reading';
      if (/write|essay|email|letter|story|report|paragraph/i.test(lower)) return 'writing';
      if (/word|vocabulary|meaning|definition|synonym|collocation/i.test(lower)) return 'vocabulary';
      if (/grammar|tense|verb|article|preposition|sentence/i.test(lower)) return 'grammar';
      if (/speak|talk|presentation|conversation|pronunciation/i.test(lower)) return 'speaking';
      return 'writing';

    case 'science':
      if (/biology|biolog|cell|gene|eco|organism|evolution|organism|kropp|växt|djur/i.test(lower)) return 'biology';
      if (/chemistry|kemi|atom|molecule|reaction|acid|base|periodic|element/i.test(lower)) return 'chemistry';
      if (/physics|fysik|force|energy|electric|magnet|wave|light|motion|gravity/i.test(lower)) return 'physics';
      if (/experiment|hypothesis|method|variable|lab|scientific|lab|rapport/i.test(lower)) return 'scientific-method';
      return 'biology';

    case 'social-studies':
      if (/history|historia|war|krig|revolution|century|1[0-9]{3}|[0-9]{4}/i.test(lower)) return 'history';
      if (/geography|geografi|country|country|climate|map|population|urban/i.test(lower)) return 'geography';
      if (/civics|samhäll|democracy|politik|government|EU|human rights|election/i.test(lower)) return 'civics';
      if (/religion|faith|church|mosque|temple|islam|christian|buddh|hindu|jewish|ethic/i.test(lower)) return 'religion';
      return 'history';

    case 'computational-thinking':
      if (/explain|förstå|what does|vad gör|understand.*code/i.test(lower)) return 'code-explainer';
      if (/debug|error|bug|fel|fungerar inte|doesn.*work|TypeError|SyntaxError/i.test(lower)) return 'debug-guide';
      return 'code-mentor';

    default:
      return 'general';
  }
}
