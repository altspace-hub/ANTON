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
  teacherLevelOverride?: string; // set by teacher for specific student
  gymnasietProgram?: string;  // 'NA' | 'TE' | 'EK' | 'SA' | 'HU' | 'VO' | 'BA' | 'EE' | 'IN'
  universityProgram?: string; // 'industriell-ekonomi' | 'datateknik' | 'kemiteknik' | 'maskinteknik' | 'elektroteknik' | etc.
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

  // ── T1 Child Mode Layer (highest priority) ─────────────────────────────────
  if (config.educationTier === 'T1') {
    layers.unshift(`## T1 CHILD MODE — Ages 7–12
You are talking with a child aged 7–12 years old. ALWAYS follow these rules:
- Use simple, everyday words. If a hard word is needed, immediately explain it.
- Keep answers short: maximum 4 sentences unless the child asks for more.
- Be warm, encouraging, and enthusiastic. Use lots of positive reinforcement.
- Use examples from everyday life that children know (toys, games, animals, food).
- Never discuss violence, politics, religion, alcohol, or adult themes of any kind.
- Add ONE relevant emoji at the end of each response. 🌟
- Celebrate effort always: "Great thinking! 🎉", "You're asking brilliant questions! 🌟"
- Use simple sentence structure: Subject + Verb + Object. No nested clauses.
- When you need to explain a concept, use an analogy first.
- Ask one simple question at a time. Never overwhelm with multiple questions.`);
  }

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

  // ── Layer 5.5: Gymnasiet Program Line Context ────────────────────────────
  if (config.educationTier === 'T3' && config.gymnasietProgram) {
    const programNames: Record<string, string> = {
      NA: 'Naturvetenskapsprogrammet (Science)',
      TE: 'Teknikprogrammet (Technology & Engineering)',
      EK: 'Ekonomiprogrammet (Business & Economics)',
      SA: 'Samhällsvetenskapsprogrammet (Social Sciences)',
      HU: 'Humanistiska programmet (Humanities & Languages)',
      VO: 'Vård- och omsorgsprogrammet (Healthcare)',
      BA: 'Bygg- och anläggningsprogrammet (Construction)',
      EE: 'El- och energiprogrammet (Electrical & Energy)',
      IN: 'Industritekniska programmet (Industrial Technology)',
    };
    const programContexts: Record<string, string> = {
      NA: 'This student is in Naturvetenskapsprogrammet. They take Matematik 1c–4/5, Physics 1+2, Chemistry 1+2, Biology 1+2. They are preparing for university studies in natural sciences, medicine, or engineering. Emphasise mathematical rigour, laboratory methodology, and scientific reasoning.',
      TE: 'This student is in Teknikprogrammet. They take Matematik 1c–3c, Physics 1, Chemistry 1, Teknik 1, and programme-specific courses (Programming, Electronics, CAD, Construction). They are preparing for engineering university (KTH/Chalmers/LTH). Emphasise practical problem-solving, design thinking, and the link between mathematics and engineering.',
      EK: 'This student is in Ekonomiprogrammet. They take Matematik 1b–2, Företagsekonomi 1+2, and specialise in Redovisning (accounting) or Marknadsföring (marketing). Connect topics to real business cases, entrepreneurship, and the Swedish/EU economy.',
      SA: 'This student is in Samhällsvetenskapsprogrammet. They take social sciences, law, media, and humanities. They are preparing for law, political science, social work, or journalism. Emphasise text analysis, argumentation, and societal connections.',
      HU: 'This student is in Humanistiska programmet. They focus on languages, literature, philosophy, and cultural studies. Emphasise deep reading, rhetorical analysis, and interdisciplinary humanities approaches.',
      VO: 'This student is in Vård- och omsorgsprogrammet, preparing for healthcare and social care work. Connect academic subjects to practical healthcare contexts. Emphasise person-centred care, anatomy/physiology, and professional Swedish.',
      BA: 'This student is in Bygg- och anläggningsprogrammet, studying construction and civil engineering. Connect mathematics and physics to practical construction calculations. Emphasise technical drawing, materials, and building standards.',
      EE: 'This student is in El- och energiprogrammet, studying electrical installation and energy systems. Connect physics and mathematics to electrical circuits, power systems, and renewable energy. Emphasise practical safety and Swedish electrical standards (NEC/SEK).',
      IN: 'This student is in Industritekniska programmet, studying manufacturing and industrial processes. Connect mathematics and physics to CNC machining, automation, and industrial production. Emphasise quality systems (ISO) and Swedish manufacturing context.',
    };
    const programName = programNames[config.gymnasietProgram] ?? config.gymnasietProgram;
    const programContext = programContexts[config.gymnasietProgram] ?? '';
    layers.push(`\n\n---\n\n## Gymnasiet Programme Context\n\n**Programme:** ${programName}\n\n${programContext}`);

    // Load Gy11 curriculum for this programme
    try {
      const programFileMap: Record<string, string> = {
        NA: 'na-naturvetenskap',
        TE: 'te-teknik',
        EK: 'ek-ekonomi',
        SA: 'sa-samhall',
        HU: 'hu-humaniora',
      };
      const programFile = programFileMap[config.gymnasietProgram];
      if (programFile) {
        const gy11Path = path.join(SERVER_DIR, '..', 'curricula', 'se', 'gymnasiet', `${programFile}.json`);
        if (fs.existsSync(gy11Path)) {
          const gy11Data = JSON.parse(fs.readFileSync(gy11Path, 'utf8'));
          const programSubjects = gy11Data.programSpecificSubjects?.core?.map((s: {subject: string; points: number}) => s.subject).join(', ');
          if (programSubjects) {
            layers.push(`\n\n**Programme-specific core subjects:** ${programSubjects}`);
          }
        }
      }
    } catch { /* non-fatal */ }
  }

  // ── Layer 5.5: University Programme Context ──────────────────────────────
  if (config.educationTier === 'T4' && config.universityProgram) {
    const programNames: Record<string, string> = {
      'industriell-ekonomi': 'Industriell Ekonomi / Industrial Engineering & Management (KTH/Chalmers style)',
      'datateknik': 'Datateknik / Computer Science & Engineering (KTH/Chalmers)',
      'kemiteknik': 'Kemiteknik / Chemical Engineering (KTH/Chalmers)',
      'maskinteknik': 'Maskinteknik / Mechanical Engineering (KTH/Chalmers)',
      'elektroteknik': 'Elektroteknik / Electrical Engineering (KTH/Chalmers)',
      'medicine': 'Medicine (MD programme)',
      'law': 'Law (Juridikprogrammet)',
      'business': 'Business Administration (Handelshögskolan/SSE)',
      'architecture': 'Architecture (KTH/Chalmers)',
    };
    const programContexts: Record<string, string> = {
      'industriell-ekonomi': 'This student studies Industriell Ekonomi — the programme that combines engineering sciences with management, operations research, and economics. Core tensions: optimisation vs. strategy, quantitative models vs. qualitative judgement. Key courses include Operations Management, Operations Research (LP/network models), Corporate Finance, and Strategic Management. Swedish context: many graduates work at McKinsey, Volvo, Ericsson, or start tech companies.',
      'datateknik': 'This student studies Datateknik (CS engineering). Strong theoretical and practical program covering algorithms, systems, networks, and software engineering. They work with formal methods, have strong mathematics background (discrete math, linear algebra, probability), and code in C/C++/Java/Python. Swedish context: graduates work at Spotify, King, Klarna, Ericsson, or in research at KTH/Chalmers.',
      'kemiteknik': 'This student studies Kemiteknik (Chemical Engineering). Strong physical chemistry and process engineering background. They work with thermodynamics, transport phenomena, reaction engineering, and process design. Emphasis on safety and sustainability. Swedish context: graduates work at AkzoNobel, Perstorp, SSAB, Neste, or in pharma (AstraZeneca).',
      'maskinteknik': 'This student studies Maskinteknik (Mechanical Engineering). Core areas: solid mechanics, fluid mechanics, thermodynamics, manufacturing. Strong CAD/FEM skills. Swedish context: major employers include Volvo Cars, Volvo Trucks, Scania, Atlas Copco, SKF, Sandvik.',
      'elektroteknik': 'This student studies Elektroteknik (Electrical Engineering). Core areas: circuit theory, signal processing, power systems, control theory, electromagnetics. Strong mathematics background (Laplace/Fourier transforms, linear algebra). Swedish context: major employers include Ericsson, ABB, Vattenfall, Saab.',
    };
    const programName = programNames[config.universityProgram] ?? config.universityProgram;
    const programContext = programContexts[config.universityProgram] ?? `This student is studying ${config.universityProgram} at university level.`;
    layers.push(`\n\n---\n\n## University Programme Context\n\n**Programme:** ${programName}\n\n${programContext}`);
  }

  // ── Layer 6: Knowledge Sources ─────────────────────────────────────────────
  if (config.curriculumId === 'gy11') {
    // Try to load common core + programme-specific subjects
    try {
      const commonCorePath = path.join(SERVER_DIR, '..', 'curricula', 'se', 'gymnasiet', 'common-core.json');
      if (fs.existsSync(commonCorePath)) {
        const coreData = JSON.parse(fs.readFileSync(commonCorePath, 'utf8'));
        const coreSubjects = Object.keys(coreData.subjects ?? {}).map((k: string) => coreData.subjects[k].courses?.[0] ?? k).join(', ');
        layers.push(`\n\n---\n\n## Curriculum Reference (Swedish Gymnasieskolan Gy11/Gy25)\n\n**Gymnasiegemensamma ämnen (common core for all programmes):** ${coreSubjects}\n\nAlign content with the Swedish Gy11/Gy25 curriculum (Skolverket). For mathematics, follow the Matematik 1c/2c/3c/4/5 progression. Assess using the A-F grading scale (A=Excellent, C=Proficient, E=Pass, F=Fail).`);
      } else {
        layers.push(`\n\n---\n\n## Curriculum Reference (Swedish Gymnasieskolan Gy11)\n\nThis class follows the Swedish upper secondary curriculum (Gy11/Gy25, Skolverket). Use the A-F grading scale. Subjects follow Gy11 course plans (kursplaner).`);
      }
    } catch {
      layers.push(`\n\n---\n\n## Curriculum Reference (Gy11)\n\nFollows Swedish Gy11/Gy25 curriculum (Skolverket). A-F grading scale.`);
    }
  }

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

  // ── Layer 6: in-cbse curriculum ────────────────────────────────────────
  if (config.curriculumId === 'in-cbse') {
    const cbseSubjectMap: Record<string, string> = {
      mathematics: 'mathematics',
      science: 'science',
      physics: 'science',
      chemistry: 'science',
      biology: 'science',
      english: 'english',
      svenska: 'english',
      'social-studies': 'social-science',
      'computational-thinking': 'computer-science',
    };
    const cbseFile = cbseSubjectMap[config.subjectId] ?? config.subjectId;
    try {
      const cbsePath = path.join(SERVER_DIR, '..', 'curricula', 'in', 'cbse', `${cbseFile}.json`);
      if (fs.existsSync(cbsePath)) {
        const cbseData = JSON.parse(fs.readFileSync(cbsePath, 'utf8'));
        layers.push(`\n\n---\n\n## Curriculum Reference (CBSE India)\n\n**Subject:** ${cbseData.subject}\n\n${JSON.stringify(cbseData, null, 2)}`);
      } else {
        layers.push(`\n\n---\n\n## Curriculum Reference (CBSE India)\n\nThis class follows the Central Board of Secondary Education (CBSE) curriculum. Align content with NCERT textbooks and CBSE board exam patterns for Classes 6-12.`);
      }
    } catch {
      layers.push(`\n\n---\n\n## Curriculum Reference (CBSE India)\n\nThis class follows the CBSE curriculum. Reference NCERT textbooks and align with board exam patterns.`);
    }
  }

  // ── Layer 6: ng-waec curriculum ────────────────────────────────────────
  if (config.curriculumId === 'ng-waec') {
    const waecSubjectMap: Record<string, string> = {
      mathematics: 'mathematics',
      science: 'biology',
      biology: 'biology',
      chemistry: 'chemistry',
      physics: 'physics',
      english: 'english',
      svenska: 'english',
      'social-studies': 'economics',
    };
    const waecFile = waecSubjectMap[config.subjectId] ?? config.subjectId;
    try {
      const waecPath = path.join(SERVER_DIR, '..', 'curricula', 'ng', 'waec', `${waecFile}.json`);
      if (fs.existsSync(waecPath)) {
        const waecData = JSON.parse(fs.readFileSync(waecPath, 'utf8'));
        layers.push(`\n\n---\n\n## Curriculum Reference (WAEC/JAMB Nigeria)\n\n**Subject:** ${waecData.subject}\n\n${JSON.stringify(waecData, null, 2)}`);
      } else {
        layers.push(`\n\n---\n\n## Curriculum Reference (WAEC/JAMB Nigeria)\n\nThis class follows the West African Examinations Council (WAEC) syllabus and prepares for JAMB. Align content with WAEC approved topics and past question patterns.`);
      }
    } catch {
      layers.push(`\n\n---\n\n## Curriculum Reference (WAEC/JAMB Nigeria)\n\nThis class follows the WAEC/JAMB curriculum. Focus on exam-pattern topics and past question practice.`);
    }
  }

  // ── Layer 6: uk-alevel curriculum ──────────────────────────────────────
  if (config.curriculumId === 'uk-alevel') {
    const alevelSubjectMap: Record<string, string> = {
      mathematics: 'mathematics',
      'advanced-mathematics': 'further-mathematics',
      'further-mathematics': 'further-mathematics',
      physics: 'physics',
      chemistry: 'chemistry',
      biology: 'biology',
      english: 'english-literature',
      'english-literature': 'english-literature',
      history: 'history',
      economics: 'economics',
    };
    const alevelFile = alevelSubjectMap[config.subjectId] ?? config.subjectId;
    try {
      const alevelPath = path.join(SERVER_DIR, '..', 'curricula', 'uk', 'alevel', `${alevelFile}.json`);
      if (fs.existsSync(alevelPath)) {
        const alevelData = JSON.parse(fs.readFileSync(alevelPath, 'utf8'));
        const topicsKey = alevelData.topics ?? alevelData.pure ?? alevelData.corePure;
        const topicLines = Array.isArray(topicsKey) ? topicsKey.slice(0, 6).map((t: string) => `- ${t}`) : [];
        layers.push(`\n\n---\n\n## Curriculum Reference (UK A-Level)\n\n**Subject:** ${alevelData.subject}\n\n**Key topics:**\n${topicLines.join('\n')}${alevelData.examFormat ? `\n\n**Exam format:** ${alevelData.examFormat}` : ''}${alevelData.note ? `\n\n**Note:** ${alevelData.note}` : ''}`);
      } else {
        layers.push(`\n\n---\n\n## Curriculum Reference (UK A-Level)\n\nThis class follows the UK A-Level specification (Years 12–13). Align content with AQA/Edexcel/OCR A-Level specifications. Prepare students for linear exams and, where applicable, coursework and practical endorsement.`);
      }
    } catch {
      layers.push(`\n\n---\n\n## Curriculum Reference (UK A-Level)\n\nThis class follows UK A-Level specifications for Year 12–13 sixth form students. Focus on exam technique, extended analytical writing, and deep subject knowledge.`);
    }
  }

  if (config.additionalContext) {
    layers.push(`\n\n---\n\n## Additional Context\n\n${config.additionalContext}`);
  }

  // ── T4 University layer ─────────────────────────────────────────────────
  if (config.educationTier === 'T4') {
    layers.push(`\n\n---\n\n## UNIVERSITY MODE (T4)
You are tutoring a university student. Apply these standards:
- Use precise academic language. Avoid oversimplification.
- Expect and model rigorous argumentation with evidence.
- Reference seminal texts, theorems, and authors where relevant.
- Challenge the student's reasoning: ask "How would you prove that?" and "What are the counterexamples?"
- Use the Socratic seminar method: guide through questions rather than giving direct answers.
- Academic integrity: never write essays or assignments for the student — guide them to write their own.
- LaTeX notation is appropriate for mathematics and sciences.`);
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

  const effectiveLevel = config.teacherLevelOverride ?? config.assistanceLevel;

  return `## Active Session Parameters

**Assistance Level:** ${effectiveLevel} — ${levelDescriptions[effectiveLevel] ?? levelDescriptions[config.assistanceLevel]}

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
