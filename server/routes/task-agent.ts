/**
 * task-agent.ts
 * ANTON Task Agent — Conversational task intake, approach proposal, and execution tracking.
 *
 * ANTON receives a task description (from chat, Jira webhook, Slack command, standup),
 * consults its self-knowledge DB, proposes 2-3 concrete execution approaches,
 * human picks one → ANTON asks clarifying questions → execution begins.
 */

import { Router, Request, Response } from 'express';
import { validate } from '../lib/validate.js';
import { TaskCreateSchema, TaskMessageSchema, TaskSelectApproachSchema, TaskIngestSchema } from '../lib/schemas.js';
import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type Anthropic from '@anthropic-ai/sdk';
import AnthropicSDK from '@anthropic-ai/sdk';
import { readFileSync, existsSync, writeFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import multer from 'multer';
import { extractTextFromFile } from '../services/text-extractor.js';
import { createAtomExtractor } from '../services/atom-extractor.js';

const __filename = fileURLToPath(import.meta.url);
const __routeDir = dirname(__filename);
const PROMPTS_DIR = join(__routeDir, '..', 'prompts');

interface TaskRow {
  id: string;
  user_id: string;
  title: string;
  description: string;
  status: string;
  source: string;
  source_ref: string | null;
  priority: string;
  conversation: string;
  proposals: string;
  chosen_approach_id: string | null;
  chosen_approach_config: string | null;
  clarifying_questions: string;
  clarifying_answers: string;
  execution_run_ids: string;
  execution_summary: string | null;
  tags: string;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  // Migration 027
  intake_answers: string | null;
  execution_results: string | null;
  current_step: number | null;
  intake_ready: number | null;
  // Migration 027b
  task_files: string | null;
  active_knowledge_packs: string | null;
}

interface TaskFile {
  id: string;
  name: string;
  size: number;
  text: string;
  uploaded_at: string;
}

interface ExecutionStep {
  step: number;
  name: string;
  capability_id?: string;
  description?: string;
}

interface IntakeTaskContext {
  status: string;
  title: string;
  description: string;
  chosenApproach?: {
    id: string;
    name: string;
    required_inputs: string[];
    execution_steps: ExecutionStep[];
  };
  chosenCapability?: {
    name: string;
    typical_inputs: string[];
  };
  intakeAnswers?: Record<string, string>;
  currentStep?: number;
  attachedFileNames?: string[];
  activePackNames?: string[];
}

interface CapabilityRow {
  id: string;
  capability_type: string;
  name: string;
  description: string;
  area: string | null;
  tags: string;
  route: string | null;
  module_id: string | null;
  typical_inputs: string | null;
  typical_outputs: string | null;
  effort_estimate: string;
  use_cases: string;
}

interface ApproachRow {
  id: string;
  name: string;
  summary: string;
  description: string;
  task_pattern: string;
  capability_ids: string;
  execution_steps: string;
  effort: string;
  outcome: string;
  required_inputs: string;
}

function getUserId(req: Request): string {
  return (req as unknown as { user?: { id?: string } }).user?.id ?? 'default';
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}

/** Build the self-knowledge context string injected into ANTON's system prompt */
function buildSelfKnowledgeContext(
  capabilities: CapabilityRow[],
  approaches: ApproachRow[]
): string {
  const capLines = capabilities.map((c) => {
    const useCases = parseJson<string[]>(c.use_cases, []).join(', ');
    return `- **${c.name}** [${c.id}] (${c.capability_type}, effort: ${c.effort_estimate})\n  ${c.description}\n  Use-cases: ${useCases}`;
  }).join('\n\n');

  const appLines = approaches.map((a) => {
    const patterns = parseJson<string[]>(a.task_pattern, []).join(', ');
    return `- **${a.name}** [${a.id}] (${a.effort})\n  ${a.summary}\n  Best for: ${patterns}`;
  }).join('\n\n');

  return `## ANTON SELF-KNOWLEDGE

### Available Capabilities
${capLines}

### Available Approach Templates
${appLines}`;
}

/** System prompt for ANTON Task Agent — supports 3 phases: propose / intake / (execute is server-side) */
function buildSystemPrompt(selfKnowledge: string, taskCtx?: IntakeTaskContext): string {
  // ── Phase 2: INTAKE (approach selected, gathering context before execution) ──
  let intakeSection = '';
  if (taskCtx?.status === 'clarifying' && taskCtx.chosenApproach) {
    const requiredInputs = taskCtx.chosenApproach.required_inputs ?? [];
    const typicalInputs = taskCtx.chosenCapability?.typical_inputs ?? [];
    // Deduplicate
    const allInputs = [...new Set([...requiredInputs, ...typicalInputs])];
    const currentStepIdx = taskCtx.currentStep ?? 0;
    const step = taskCtx.chosenApproach.execution_steps[currentStepIdx];
    const existingAnswers = taskCtx.intakeAnswers ?? {};
    const answersText = Object.keys(existingAnswers).length > 0
      ? `\n\n**Already gathered:**\n${Object.entries(existingAnswers).map(([k, v]) => `- ${k}: ${v}`).join('\n')}`
      : '';

    intakeSection = `

## CURRENT PHASE: INTAKE

Approach confirmed: **${taskCtx.chosenApproach.name}**
${step ? `Preparing to execute Step ${step.step}: **${step.name}**\n${step.description ? `(${step.description})` : ''}` : ''}

**Information needed to execute well:**
${allInputs.map((inp) => `- ${inp}`).join('\n')}

**Already known from the task description:**
"${taskCtx.description}"${answersText}
${(taskCtx.attachedFileNames?.length ?? 0) > 0 ? `\n**Documents already attached by the user:**\n${taskCtx.attachedFileNames!.map((f) => `- 📄 ${f}`).join('\n')}\nAcknowledge these documents and use them in your analysis.` : '\n**No documents attached yet.**\nYou MUST ask the user to attach relevant documents before marking intake as complete.'}
${(taskCtx.activePackNames?.length ?? 0) > 0 ? `\n**Active Knowledge Packs:**\n${taskCtx.activePackNames!.map((p) => `- 📚 ${p}`).join('\n')}\nThese regulatory knowledge packs are loaded and available.` : ''}

**YOUR JOB NOW — INTAKE RULES:**
- Do NOT propose new approaches or explain capabilities
- Do NOT use <clarifying> or <approaches> tags — those are ONLY for Phase 1
- Ask your questions as NATURAL CONVERSATION — numbered list, plain text, no XML/JSON tags
- Ask specifically for inputs NOT already covered in the task description above
- Ask for 2-3 items at a time — never overwhelm the user
- Be concrete: "What entity type is the client?" not "tell me about the context"
- **IMPORTANT: Always ask the user to attach relevant documents** using the "Attach doc" button below the chat:
  - Existing policies, procedures, or frameworks being assessed
  - Client documents, regulatory texts, or reference materials
  - Say something like: "Please attach the relevant [policy/document] using the 📎 Attach doc button below"
- **Also suggest activating relevant Knowledge Packs** if the task involves specific regulations:
  - Say: "You can also activate relevant regulatory knowledge packs (e.g. EU Sanctions, EBA Guidelines) using the 📚 Knowledge packs button"
- Start IMMEDIATELY with your questions — no preamble like "great, let me ask..."
- When you have enough context to do excellent work, output EXACTLY this (valid JSON inside the tags):

<intake_complete>
{
  "ready": true,
  "summary": "I have all I need to proceed: [1-2 sentence summary]",
  "answers": {
    "entity": "[entity name and type]",
    "jurisdiction": "[relevant jurisdiction]",
    "[add every other key piece of information gathered as key-value pairs]"
  }
}
</intake_complete>`;
  }

  return `You are ANTON — an AI coworker for Financial Crime Prevention (FCP) consultants. You have structured knowledge of your own capabilities, modules, and approach templates.

## PHASE 1: PROPOSE APPROACHES (default mode)

**If the task description is CLEAR** (entity type OR specific regulation + specific goal):
→ IMMEDIATELY propose 2-3 approaches. Do NOT ask clarifying questions first.
→ Clear examples: "AMLR gap analysis for Nordic bank", "Draft KYC policy for PSP", "SAR for suspicious transaction".

**If the task description is VAGUE** (just "help with AML", "improve compliance" without context):
→ Ask 2-3 TARGETED clarifying questions to disambiguate.
→ Do NOT propose approaches yet. After answers, propose approaches.

## OUTPUT FORMATS — Use ONLY these exact formats:

**When proposing approaches:**
<approaches>
{
  "ready": true,
  "proposals": [
    {
      "approach_id": "<MUST be a valid approach_id from AVAILABLE APPROACHES below>",
      "name": "<approach name>",
      "summary": "<one-line pitch>",
      "rationale": "<why this fits this specific task>",
      "effort": "quick|medium|deep",
      "outcome": "<what the user gets>"
    }
  ]
}
</approaches>

**CRITICAL: approach_id MUST be one of the IDs listed in AVAILABLE APPROACHES below.**

**If no approach matches:**
<approaches>
{
  "ready": false,
  "reason": "<why no approach matches>",
  "suggestions": ["<alternative suggestion>"]
}
</approaches>

**When asking clarifying questions:**
<clarifying>
{
  "questions": [
    {"id": "q1", "question": "<specific targeted question>", "required": true}
  ]
}
</clarifying>

## STYLE
Professional, direct, concise. Senior FCP consultant tone. No filler.
${intakeSection}
${selfKnowledge}`;
}

export function createTaskAgentRoutes(db: Database.Database, anthropic: Anthropic | null | undefined): Router {
  const router = Router();
  const ai = anthropic ?? new AnthropicSDK({ apiKey: process.env.ANTHROPIC_API_KEY });
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

  // Lazy atom extractor — creates workflow_output + extracts knowledge atoms on task completion
  let _atomExtractor: ReturnType<typeof createAtomExtractor> | null = null;
  function getAtomExtractor() {
    if (!_atomExtractor) _atomExtractor = createAtomExtractor(db, ai);
    return _atomExtractor;
  }

  /** Create a workflow_output row and fire-and-forget atom extraction */
  function emitTaskAtoms(task: TaskRow, output: string, stepName: string, stepIndex: number) {
    try {
      const outputId = `wo_task_${task.id}_${Date.now()}`;
      const outputData = JSON.stringify({
        title: task.title,
        description: task.description,
        output: output.length > 5000 ? output.slice(0, 5000) + '...(truncated)' : output,
      });
      db.prepare(`
        INSERT INTO workflow_outputs
          (id, execution_id, workflow_id, step_index, step_type,
           output_data, output_summary, created_by, workflow_name, step_name)
        VALUES (?, ?, ?, ?, 'task_completion', ?, ?, ?, ?, ?)
      `).run(
        outputId,
        task.id,
        `task-${task.id}`,
        stepIndex,
        outputData,
        `Task "${task.title}" — ${stepName}`,
        task.user_id,
        `ANTON Task: ${task.title}`,
        stepName,
      );
      // Fire-and-forget atom extraction (non-blocking)
      getAtomExtractor().extractAtoms(outputId).catch((err) => {
        console.warn('[task-agent] atom extraction failed (non-fatal):', err instanceof Error ? err.message : err);
      });
    } catch (err) {
      console.warn('[task-agent] emitTaskAtoms failed (non-fatal):', err instanceof Error ? err.message : err);
    }
  }

  // ── GET /api/task-agent/capabilities — list self-knowledge ──────────────
  router.get('/capabilities', (_req: Request, res: Response) => {
    try {
      const caps = db.prepare(
        'SELECT * FROM anton_capabilities WHERE active=1 ORDER BY capability_type, name'
      ).all() as CapabilityRow[];
      const approaches = db.prepare(
        'SELECT * FROM anton_approaches WHERE active=1 ORDER BY times_used DESC'
      ).all() as ApproachRow[];
      res.json({ capabilities: caps, approaches });
    } catch (err) {
      res.status(500).json({ error: 'Failed to load capabilities', detail: String(err) });
    }
  });

  // ── GET /api/task-agent/tasks — list tasks ──────────────────────────────
  router.get('/tasks', (req: Request, res: Response) => {
    const userId = getUserId(req);
    const { status, limit = '20', offset = '0' } = req.query as Record<string, string>;
    try {
      const where = status ? 'WHERE user_id=? AND status=?' : 'WHERE user_id=?';
      const params = status ? [userId, status] : [userId];
      const tasks = db.prepare(
        `SELECT id, title, description, status, source, source_ref, priority, tags, due_date,
                created_at, updated_at, chosen_approach_id, completed_at
         FROM anton_tasks ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
      ).all(...params, Math.min(parseInt(limit) || 20, 100), Math.max(parseInt(offset) || 0, 0)) as Partial<TaskRow>[];
      const { count } = db.prepare(
        `SELECT COUNT(*) as count FROM anton_tasks ${where}`
      ).get(...params) as { count: number };
      res.json({
        tasks: tasks.map((t) => ({ ...t, tags: parseJson(t.tags, []) })),
        total: count,
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to list tasks', detail: String(err) });
    }
  });

  // ── POST /api/task-agent/tasks — create a new task ─────────────────────
  router.post('/tasks', validate(TaskCreateSchema), (req: Request, res: Response) => {
    const userId = getUserId(req);
    const { title, description, source = 'manual', source_ref, priority = 'normal', tags = [], due_date } = req.body as {
      title: string; description: string; source?: string; source_ref?: string;
      priority?: string; tags?: string[]; due_date?: string;
    };
    const id = randomUUID();
    try {
      db.prepare(`
        INSERT INTO anton_tasks (id, user_id, title, description, status, source, source_ref, priority, tags, due_date)
        VALUES (?, ?, ?, ?, 'intake', ?, ?, ?, ?, ?)
      `).run(id, userId, title.trim(), description.trim(), source, source_ref ?? null, priority, JSON.stringify(tags), due_date ?? null);
      const row = db.prepare('SELECT * FROM anton_tasks WHERE id=?').get(id) as TaskRow;
      res.status(201).json({ task: { ...row, tags: parseJson(row.tags, []) } });
    } catch (err) {
      console.error('[task-agent] POST /tasks failed:', err);
      res.status(500).json({ error: 'Failed to create task. The server may need a restart to apply DB migrations.' });
    }
  });

  // ── GET /api/task-agent/tasks/:id — get task detail ────────────────────
  router.get('/tasks/:id', (req: Request, res: Response) => {
    const userId = getUserId(req);
    const task = db.prepare('SELECT * FROM anton_tasks WHERE id=? AND user_id=?').get(req.params.id, userId) as TaskRow | undefined;
    if (!task) return res.status(404).json({ error: 'Task not found' });
    // Resolve execution steps from chosen approach
    let executionSteps: ExecutionStep[] = [];
    if (task.chosen_approach_id) {
      const approach = db.prepare('SELECT execution_steps FROM anton_approaches WHERE id=?').get(task.chosen_approach_id) as { execution_steps: string } | undefined;
      if (approach) executionSteps = parseJson<ExecutionStep[]>(approach.execution_steps, []);
    }

    res.json({
      ...task,
      conversation: parseJson(task.conversation, []),
      proposals: parseJson(task.proposals, []),
      clarifying_questions: parseJson(task.clarifying_questions, []),
      clarifying_answers: parseJson(task.clarifying_answers, []),
      execution_run_ids: parseJson(task.execution_run_ids, []),
      tags: parseJson(task.tags, []),
      intake_answers: parseJson(task.intake_answers ?? '{}', {}),
      execution_results: parseJson(task.execution_results ?? '[]', []),
      current_step: task.current_step ?? 0,
      intake_ready: task.intake_ready ?? 0,
      task_files: parseJson<TaskFile[]>(task.task_files ?? '[]', []).map((f) => ({ id: f.id, name: f.name, size: f.size, uploaded_at: f.uploaded_at })),
      active_knowledge_packs: parseJson<string[]>(task.active_knowledge_packs ?? '[]', []),
      execution_steps: executionSteps,
    });
  });

  // ── POST /api/task-agent/tasks/:id/message — send message (streaming) ──
  router.post('/tasks/:id/message', validate(TaskMessageSchema), async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const task = db.prepare('SELECT * FROM anton_tasks WHERE id=? AND user_id=?').get(req.params.id, userId) as TaskRow | undefined;
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const { content } = req.body as { content: string };
    if (content.length > 2000) return res.status(400).json({ error: 'Message must be ≤2000 characters' });

    // Load self-knowledge
    const caps = db.prepare('SELECT * FROM anton_capabilities WHERE active=1').all() as CapabilityRow[];
    const approaches = db.prepare('SELECT * FROM anton_approaches WHERE active=1').all() as ApproachRow[];
    const selfKnowledge = buildSelfKnowledgeContext(caps, approaches);

    // Build task context for intake phase
    let taskCtx: IntakeTaskContext | undefined;
    if (task.status === 'clarifying' && task.chosen_approach_id) {
      const chosenApp = db.prepare('SELECT * FROM anton_approaches WHERE id=?').get(task.chosen_approach_id) as ApproachRow | undefined;
      if (chosenApp) {
        const steps = parseJson<ExecutionStep[]>(chosenApp.execution_steps, []);
        const primaryCapId = parseJson<string[]>(chosenApp.capability_ids, [])[0];
        const cap = primaryCapId ? db.prepare('SELECT * FROM anton_capabilities WHERE id=?').get(primaryCapId) as CapabilityRow | undefined : undefined;
        taskCtx = {
          status: task.status,
          title: task.title,
          description: task.description,
          chosenApproach: {
            id: chosenApp.id,
            name: chosenApp.name,
            required_inputs: parseJson<string[]>(chosenApp.required_inputs, []),
            execution_steps: steps,
          },
          chosenCapability: cap ? {
            name: cap.name,
            typical_inputs: parseJson<string[]>(cap.typical_inputs ?? '[]', []),
          } : undefined,
          intakeAnswers: parseJson<Record<string, string>>(task.intake_answers ?? '{}', {}),
          currentStep: task.current_step ?? 0,
          attachedFileNames: parseJson<TaskFile[]>(task.task_files ?? '[]', []).map((f) => f.name),
          activePackNames: (() => {
            const packIds = parseJson<string[]>(task.active_knowledge_packs ?? '[]', []);
            if (packIds.length === 0) return [];
            try {
              return db.prepare(
                `SELECT display_name FROM knowledge_packs WHERE id IN (${packIds.map(() => '?').join(',')}) AND status='active'`
              ).all(...packIds).map((r: any) => r.display_name as string);
            } catch { return []; }
          })(),
        };
      }
    }

    const systemPrompt = buildSystemPrompt(selfKnowledge, taskCtx);

    // Build conversation history — cap at last 30 messages to prevent token overflow
    const MAX_HISTORY = 30;
    const rawHistory: Array<{ role: 'user' | 'assistant'; content: string }> = parseJson(task.conversation, []);
    const history = rawHistory.length > MAX_HISTORY
      ? rawHistory.slice(-MAX_HISTORY)
      : rawHistory;
    history.push({ role: 'user', content: content.trim() });

    // Set up SSE stream
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let assistantText = '';

    try {
      const stream = ai.messages.stream({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: systemPrompt,
        messages: history.map((m) => ({ role: m.role, content: m.content })),
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          assistantText += event.delta.text;
          res.write(`data: ${JSON.stringify({ type: 'text', text: event.delta.text })}\n\n`);
        }
      }

      // Persist updated conversation
      history.push({ role: 'assistant', content: assistantText });

      // Extract proposals if present
      let proposals = parseJson<unknown[]>(task.proposals, []);
      let newStatus = task.status;
      const proposalsMatch = assistantText.match(/<approaches>([\s\S]*?)<\/approaches>/);
      if (proposalsMatch) {
        try {
          const parsed = JSON.parse(proposalsMatch[1].trim());
          if (parsed.ready && parsed.proposals?.length) {
            proposals = parsed.proposals;
            newStatus = 'awaiting_selection';
          }
        } catch { /* ignore parse errors */ }
      }

      // Extract clarifying questions if present
      let clarifyingQs = parseJson<unknown[]>(task.clarifying_questions, []);
      const clarifyMatch = assistantText.match(/<clarifying>([\s\S]*?)<\/clarifying>/);
      if (clarifyMatch) {
        try {
          const parsed = JSON.parse(clarifyMatch[1].trim());
          if (parsed.questions?.length) {
            clarifyingQs = parsed.questions;
            newStatus = 'clarifying';
          }
        } catch { /* ignore */ }
      }

      // Parse <intake_complete> if present
      let intakeReady = task.intake_ready ?? 0;
      let intakeAnswers = parseJson<Record<string, string>>(task.intake_answers ?? '{}', {});
      const intakeCompleteMatch = assistantText.match(/<intake_complete>([\s\S]*?)<\/intake_complete>/);
      if (intakeCompleteMatch) {
        try {
          const parsed = JSON.parse(intakeCompleteMatch[1].trim());
          if (parsed.ready && parsed.answers && typeof parsed.answers === 'object') {
            intakeAnswers = { ...intakeAnswers, ...parsed.answers };
            intakeReady = 1;
          }
        } catch { /* ignore malformed JSON */ }
      }

      db.prepare(`
        UPDATE anton_tasks
        SET conversation=?, proposals=?, clarifying_questions=?, status=?,
            intake_answers=?, intake_ready=?, updated_at=datetime('now')
        WHERE id=?
      `).run(
        JSON.stringify(history),
        JSON.stringify(proposals),
        JSON.stringify(clarifyingQs),
        newStatus,
        JSON.stringify(intakeAnswers),
        intakeReady,
        task.id
      );

      res.write(`data: ${JSON.stringify({ type: 'done', status: newStatus, proposals, clarifyingQuestions: clarifyingQs, intakeReady, intakeAnswers })}\n\n`);
      res.end();
    } catch (err) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: String(err) })}\n\n`);
      res.end();
    }
  });

  // ── POST /api/task-agent/tasks/:id/select-approach ─────────────────────
  router.post('/tasks/:id/select-approach', validate(TaskSelectApproachSchema), (req: Request, res: Response) => {
    const userId = getUserId(req);
    const task = db.prepare('SELECT * FROM anton_tasks WHERE id=? AND user_id=?').get(req.params.id, userId) as TaskRow | undefined;
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const { approach_id, config = {} } = req.body as { approach_id: string; config: Record<string, unknown> };

    const approach = db.prepare('SELECT * FROM anton_approaches WHERE id=?').get(approach_id) as ApproachRow | undefined;
    if (!approach) return res.status(404).json({ error: 'Approach not found' });

    db.prepare(`
      UPDATE anton_tasks
      SET chosen_approach_id=?, chosen_approach_config=?, status='clarifying',
          intake_answers='{}', intake_ready=0, current_step=0, updated_at=datetime('now')
      WHERE id=?
    `).run(approach_id, JSON.stringify(config), task.id);

    // Update usage stats
    db.prepare('UPDATE anton_approaches SET times_used=times_used+1 WHERE id=?').run(approach_id);

    const steps = parseJson<unknown[]>(approach.execution_steps, []);
    res.json({ success: true, approach, steps });
  });

  // ── POST /api/task-agent/tasks/:id/upload — attach a document ───────────
  router.post('/tasks/:id/upload', upload.single('file'), async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const task = db.prepare('SELECT * FROM anton_tasks WHERE id=? AND user_id=?').get(req.params.id, userId) as TaskRow | undefined;
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const MAX_FILES = 5;
    const existingFiles = parseJson<TaskFile[]>(task.task_files ?? '[]', []);
    if (existingFiles.length >= MAX_FILES) {
      return res.status(400).json({ error: `Maximum ${MAX_FILES} files per task` });
    }

    // Write buffer to temp file, extract text, clean up
    const ext = req.file.originalname.split('.').pop()?.toLowerCase() ?? 'bin';
    const tempPath = join(tmpdir(), `task-${randomUUID()}.${ext}`);
    let extractedText = '';
    try {
      writeFileSync(tempPath, req.file.buffer);
      extractedText = (await extractTextFromFile(tempPath)) ?? '';
    } finally {
      try { unlinkSync(tempPath); } catch { /* ignore */ }
    }

    if (!extractedText.trim()) {
      return res.status(422).json({ error: 'Could not extract text from file. Supported: PDF, DOCX, TXT, XLSX, MD.' });
    }

    const fileEntry: TaskFile = {
      id: randomUUID(),
      name: req.file.originalname,
      size: req.file.size,
      text: extractedText.slice(0, 50000), // cap at ~50k chars
      uploaded_at: new Date().toISOString(),
    };

    existingFiles.push(fileEntry);
    db.prepare("UPDATE anton_tasks SET task_files=?, updated_at=datetime('now') WHERE id=?")
      .run(JSON.stringify(existingFiles), task.id);

    res.json({ file: { id: fileEntry.id, name: fileEntry.name, size: fileEntry.size, uploaded_at: fileEntry.uploaded_at } });
  });

  // ── DELETE /api/task-agent/tasks/:id/upload/:fileId — remove attachment ─
  router.delete('/tasks/:id/upload/:fileId', (req: Request, res: Response) => {
    const userId = getUserId(req);
    const task = db.prepare('SELECT * FROM anton_tasks WHERE id=? AND user_id=?').get(req.params.id, userId) as TaskRow | undefined;
    if (!task) return res.status(404).json({ error: 'Task not found' });
    const files = parseJson<TaskFile[]>(task.task_files ?? '[]', []).filter((f) => f.id !== req.params.fileId);
    db.prepare("UPDATE anton_tasks SET task_files=?, updated_at=datetime('now') WHERE id=?")
      .run(JSON.stringify(files), task.id);
    res.json({ success: true });
  });

  // ── PUT /api/task-agent/tasks/:id/knowledge-packs — set active packs ─────
  router.put('/tasks/:id/knowledge-packs', (req: Request, res: Response) => {
    const userId = getUserId(req);
    const task = db.prepare('SELECT * FROM anton_tasks WHERE id=? AND user_id=?').get(req.params.id, userId) as TaskRow | undefined;
    if (!task) return res.status(404).json({ error: 'Task not found' });
    const { pack_ids } = req.body as { pack_ids: string[] };
    if (!Array.isArray(pack_ids)) return res.status(400).json({ error: 'pack_ids must be an array' });
    db.prepare("UPDATE anton_tasks SET active_knowledge_packs=?, updated_at=datetime('now') WHERE id=?")
      .run(JSON.stringify(pack_ids), task.id);
    res.json({ active_knowledge_packs: pack_ids });
  });

  // ── POST /api/task-agent/tasks/:id/execute-step — run current step ───────
  router.post('/tasks/:id/execute-step', async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const task = db.prepare('SELECT * FROM anton_tasks WHERE id=? AND user_id=?').get(req.params.id, userId) as TaskRow | undefined;
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (!task.chosen_approach_id) return res.status(400).json({ error: 'No approach selected' });
    if (!(task.intake_ready ?? 0)) return res.status(400).json({ error: 'Intake not complete — ANTON still needs more information' });

    const approach = db.prepare('SELECT * FROM anton_approaches WHERE id=?').get(task.chosen_approach_id) as ApproachRow | undefined;
    if (!approach) return res.status(404).json({ error: 'Approach not found' });

    const steps = parseJson<ExecutionStep[]>(approach.execution_steps, []);
    const currentStepIdx = task.current_step ?? 0;
    const step = steps[currentStepIdx];
    if (!step) return res.status(400).json({ error: 'All steps already completed' });

    // Resolve capability for this step
    const capId = step.capability_id ?? parseJson<string[]>(approach.capability_ids, [])[0];
    const capability = capId
      ? db.prepare('SELECT * FROM anton_capabilities WHERE id=?').get(capId) as CapabilityRow | undefined
      : undefined;

    // Load module system prompt from disk
    let modulePrompt = '';
    if (capability?.module_id) {
      const promptPath = join(PROMPTS_DIR, `${capability.module_id}.md`);
      if (existsSync(promptPath)) {
        modulePrompt = readFileSync(promptPath, 'utf-8');
      }
    }
    if (!modulePrompt) {
      modulePrompt = `You are ANTON — an expert Financial Crime Prevention consultant AI. Produce a comprehensive, high-quality professional deliverable based on the task and context provided.`;
    }

    // Assemble execution context from intake answers + task description + files + knowledge packs
    const intakeAnswers = parseJson<Record<string, string>>(task.intake_answers ?? '{}', {});
    const taskFiles = parseJson<TaskFile[]>(task.task_files ?? '[]', []);
    const activePackIds = parseJson<string[]>(task.active_knowledge_packs ?? '[]', []);

    const contextParts: string[] = [];
    contextParts.push(`## TASK\n**${task.title}**\n${task.description}`);
    if (Object.keys(intakeAnswers).length > 0) {
      contextParts.push(`## GATHERED CONTEXT\n${Object.entries(intakeAnswers).map(([k, v]) => `**${k}:** ${v}`).join('\n\n')}`);
    }

    // Inject attached documents
    if (taskFiles.length > 0) {
      const docTexts = taskFiles.map((f) => `### DOCUMENT: ${f.name}\n${f.text}`).join('\n\n---\n\n');
      contextParts.push(`## ATTACHED DOCUMENTS\nThe following documents have been provided for this task:\n\n${docTexts}`);
    }

    // Inject active knowledge packs
    if (activePackIds.length > 0) {
      try {
        const packs = db.prepare(
          `SELECT display_name, regulatory_area, regulation_ids, entity_count, description
           FROM knowledge_packs WHERE id IN (${activePackIds.map(() => '?').join(',')}) AND status='active'`
        ).all(...activePackIds) as Array<{ display_name: string; regulatory_area: string | null; regulation_ids: string; entity_count: number; description: string | null }>;
        if (packs.length > 0) {
          const packLines = packs.map((p) => {
            const regs = parseJson<string[]>(p.regulation_ids, []).join(', ');
            return `- **${p.display_name}** (${p.regulatory_area ?? 'General'}, ${p.entity_count} entities${regs ? `, covers: ${regs}` : ''})${p.description ? `\n  ${p.description}` : ''}`;
          });
          contextParts.push(`## ACTIVE REGULATORY KNOWLEDGE PACKS\nThe following knowledge packs are active for this task. Use them to ground article references, entity names, and regulatory details:\n\n${packLines.join('\n\n')}`);
        }
      } catch { /* knowledge_packs table may not exist — ignore */ }
    }

    contextParts.push(`## WHAT TO PRODUCE\nYou are executing **Step ${step.step}: ${step.name}**\n${step.description ?? ''}\n\nProduce the complete deliverable now. This is real work for a client — apply your full expertise.`);

    const fullSystemPrompt = `${modulePrompt}\n\n---\n\n${contextParts.join('\n\n')}`;

    // SSE stream
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Quality gate thresholds — FCP compliance demands high accuracy
    const DELIVERY_THRESHOLD = 8.5;  // warn if final score is below this
    const RETRY_THRESHOLD = 8.0;     // retry if score is below this (anything less than "Good")
    const MAX_RETRIES = 2;

    // Thinking level progression for retries: default → think_hard → investigate
    const RETRY_THINKING: Array<{ budget_tokens: number; label: string }> = [
      { budget_tokens: 10000, label: 'think_hard' },
      { budget_tokens: 20000, label: 'investigate' },
    ];

    /** Score the output using Haiku (fast, cheap). Returns 0–10 or null on error. */
    async function scoreOutput(output: string, taskTitle: string, stepName: string): Promise<number | null> {
      try {
        const scorePrompt = `You are a quality assessor for FCP compliance deliverables.
Score this deliverable on a scale of 0–10 where:
- 9–10: Exceptional — board/client ready, comprehensive, fully cited, no gaps
- 8–9: Good — solid, accurate, actionable, minor improvements only
- 6–7: Adequate — covers basics but missing depth, structure, or key requirements
- 4–5: Weak — significant gaps, vague conclusions, not client-ready
- 0–3: Poor — incomplete, off-topic, factually unreliable, or harmful

Be strict. For FCP/AML/sanctions compliance work, an 8 means the output is defensible and actionable. A 7 means you would want revisions before sending to a client.

Task: ${taskTitle}
Step: ${stepName}

Output (first 2000 chars):
${output.slice(0, 2000)}

Respond with ONLY a number (e.g. "7.5"). No explanation.`;

        const response = await ai.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 10,
          messages: [{ role: 'user', content: scorePrompt }],
        });
        const raw = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
        const score = parseFloat(raw);
        return isNaN(score) ? null : Math.min(10, Math.max(0, score));
      } catch {
        return null;
      }
    }

    /** Run one execution attempt (streaming to res). Returns { output, thinking }. */
    let lastThinkingContent = '';
    async function runExecution(thinkingBudget?: number): Promise<{ output: string; thinking: string }> {
      let output = '';
      let thinking = '';
      // Always enable thinking for transparency — adaptive for default, explicit budget for retries
      const thinkingConfig = thinkingBudget
        ? { thinking: { type: 'enabled' as const, budget_tokens: thinkingBudget } }
        : { thinking: { type: 'enabled' as const, budget_tokens: 5000 } };

      const stream = ai.messages.stream({
        model: 'claude-opus-4-6',
        max_tokens: thinkingBudget ? thinkingBudget + 8192 : 5000 + 8192,
        system: fullSystemPrompt,
        messages: [{ role: 'user', content: `Execute Step ${step.step}: ${step.name}. Produce the complete deliverable.` }],
        ...thinkingConfig,
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            output += event.delta.text;
            res.write(`data: ${JSON.stringify({ type: 'text', text: event.delta.text })}\n\n`);
          } else if (event.delta.type === 'thinking_delta') {
            thinking += event.delta.thinking;
            res.write(`data: ${JSON.stringify({ type: 'thinking', text: event.delta.thinking })}\n\n`);
          }
        }
      }
      lastThinkingContent = thinking;
      return { output, thinking };
    }

    try {
      let fullOutput = '';
      let qualityScore: number | null = null;
      let retryCount = 0;
      let thinkingLabel = 'standard';

      // Attempt 1 — standard execution (no extended thinking)
      const firstResult = await runExecution();
      fullOutput = firstResult.output;
      qualityScore = await scoreOutput(fullOutput, task.title, step.name);

      // Auto-retry loop when quality is below retry threshold
      while (
        qualityScore !== null &&
        qualityScore < RETRY_THRESHOLD &&
        retryCount < MAX_RETRIES
      ) {
        const retryConfig = RETRY_THINKING[retryCount];
        thinkingLabel = retryConfig.label;
        retryCount++;

        res.write(`data: ${JSON.stringify({
          type: 'quality_retry',
          attempt: retryCount,
          score: qualityScore,
          reason: `Quality score ${qualityScore.toFixed(1)} < ${RETRY_THRESHOLD} threshold. Retrying with deeper reasoning (${thinkingLabel}).`,
        })}\n\n`);

        // Clear previous output from stream (client replaces on retry event)
        const retryResult = await runExecution(retryConfig.budget_tokens);
        fullOutput = retryResult.output;
        qualityScore = await scoreOutput(fullOutput, task.title, step.name);
      }

      // Warn if final quality is below delivery threshold but above retry threshold
      if (qualityScore !== null && qualityScore < DELIVERY_THRESHOLD) {
        res.write(`data: ${JSON.stringify({
          type: 'quality_warning',
          score: qualityScore,
          threshold: DELIVERY_THRESHOLD,
          message: `Output quality score ${qualityScore.toFixed(1)} is below the ${DELIVERY_THRESHOLD} delivery threshold. Human review recommended before use.`,
        })}\n\n`);
      }

      // Save result + advance step
      const existingResults = parseJson<Array<{
        step: number; name: string; step_name?: string; output: string; at: string;
        quality_score?: number | null; retry_count?: number; thinking_level?: string;
        thinking?: string; description?: string;
      }>>(task.execution_results ?? '[]', []);

      existingResults.push({
        step: currentStepIdx,
        name: step.name,
        output: fullOutput,
        at: new Date().toISOString(),
        quality_score: qualityScore,
        retry_count: retryCount,
        thinking_level: thinkingLabel,
        thinking: lastThinkingContent || undefined,
        description: step.description || undefined,
      });

      const nextStepIdx = currentStepIdx + 1;
      const hasMoreSteps = nextStepIdx < steps.length;
      const newStatus = hasMoreSteps ? 'clarifying' : 'completed';

      // Add completion message to conversation
      const conversation = parseJson<Array<{ role: string; content: string }>>(task.conversation, []);
      const qualityNote = qualityScore !== null ? ` (quality score: ${qualityScore.toFixed(1)}/10)` : '';
      const stepSummaryMsg = hasMoreSteps
        ? `Step ${step.step} complete${qualityNote}. Ready for Step ${nextStepIdx + 1}: **${steps[nextStepIdx].name}**.`
        : `All steps complete${qualityNote}. Task finished.`;
      conversation.push({ role: 'assistant', content: stepSummaryMsg });

      if (newStatus === 'completed') {
        db.prepare(`
          UPDATE anton_tasks SET execution_results=?, current_step=?, intake_ready=0,
            status='completed', completed_at=datetime('now'), conversation=?, updated_at=datetime('now')
          WHERE id=?
        `).run(JSON.stringify(existingResults), nextStepIdx, JSON.stringify(conversation), task.id);
        db.prepare('UPDATE anton_approaches SET times_completed=times_completed+1 WHERE id=?').run(approach.id);

        // Update approach quality rolling average
        if (qualityScore !== null) {
          const approachRow = db.prepare(
            'SELECT avg_quality_score, times_completed FROM anton_approaches WHERE id=?'
          ).get(approach.id) as { avg_quality_score: number | null; times_completed: number } | undefined;
          if (approachRow) {
            const prevAvg = approachRow.avg_quality_score ?? qualityScore;
            const n = approachRow.times_completed;
            const newAvg = n > 0 ? (prevAvg * (n - 1) + qualityScore) / n : qualityScore;
            db.prepare('UPDATE anton_approaches SET avg_quality_score=? WHERE id=?').run(newAvg, approach.id);
          }
        }

        // Emit workflow output + extract knowledge atoms from all step results
        const allOutputText = existingResults.map((r, i) =>
          `## Step ${i + 1}: ${r.step_name ?? `Step ${r.step}`}\n${r.output ?? ''}`
        ).join('\n\n');
        emitTaskAtoms(task, allOutputText, `All ${existingResults.length} steps completed`, nextStepIdx);
      } else {
        // Auto-advance: set intake_ready=1 so the user can immediately run the next step.
        // Context carries forward from previous steps — no additional intake needed by default.
        // The user can still chat / attach docs before clicking "Run Step N".
        db.prepare(`
          UPDATE anton_tasks SET execution_results=?, current_step=?, intake_ready=1,
            status='clarifying', conversation=?, updated_at=datetime('now')
          WHERE id=?
        `).run(JSON.stringify(existingResults), nextStepIdx, JSON.stringify(conversation), task.id);
      }

      const nextStep = hasMoreSteps ? steps[nextStepIdx] : null;
      res.write(`data: ${JSON.stringify({
        type: 'done',
        status: newStatus,
        hasMoreSteps,
        nextStep,
        qualityScore,
        retryCount,
        thinkingLevel: thinkingLabel,
      })}\n\n`);
      res.end();
    } catch (err) {
      console.error('[task-agent] execute-step failed:', err);
      res.write(`data: ${JSON.stringify({ type: 'error', error: String(err) })}\n\n`);
      res.end();
    }
  });

  // ── POST /api/task-agent/tasks/:id/complete ─────────────────────────────
  router.post('/tasks/:id/complete', (req: Request, res: Response) => {
    const userId = getUserId(req);
    const task = db.prepare('SELECT * FROM anton_tasks WHERE id=? AND user_id=?').get(req.params.id, userId) as TaskRow | undefined;
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const { summary, run_ids = [], quality_score } = req.body as {
      summary?: string;
      run_ids?: string[];
      quality_score?: number;
    };

    db.prepare(`
      UPDATE anton_tasks
      SET status='completed', execution_summary=?, execution_run_ids=?, completed_at=datetime('now'), updated_at=datetime('now')
      WHERE id=?
    `).run(summary ?? null, JSON.stringify(run_ids), task.id);

    // Emit atoms from the summary/results
    if (summary) {
      emitTaskAtoms(task, summary, 'Task marked complete', 0);
    }

    // Update approach quality score if provided
    if (task.chosen_approach_id && quality_score != null) {
      const approach = db.prepare('SELECT avg_quality_score, times_completed FROM anton_approaches WHERE id=?')
        .get(task.chosen_approach_id) as { avg_quality_score: number | null; times_completed: number } | undefined;
      if (approach) {
        const prevAvg = approach.avg_quality_score ?? quality_score;
        const n = approach.times_completed + 1;
        const newAvg = (prevAvg * approach.times_completed + quality_score) / n;
        db.prepare('UPDATE anton_approaches SET times_completed=?, avg_quality_score=? WHERE id=?')
          .run(n, newAvg, task.chosen_approach_id);
      }
    }

    res.json({ success: true });
  });

  // ── PATCH /api/task-agent/tasks/:id — update status/priority/etc ────────
  router.patch('/tasks/:id', (req: Request, res: Response) => {
    const userId = getUserId(req);
    const task = db.prepare('SELECT * FROM anton_tasks WHERE id=? AND user_id=?').get(req.params.id, userId) as TaskRow | undefined;
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const allowed = ['status', 'priority', 'title', 'description', 'due_date', 'tags'];
    const updates: string[] = [];
    const values: unknown[] = [];

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updates.push(`${key}=?`);
        values.push(key === 'tags' ? JSON.stringify(req.body[key]) : req.body[key]);
      }
    }

    if (updates.length === 0) return res.status(400).json({ error: 'No valid fields to update' });

    updates.push("updated_at=datetime('now')");
    values.push(task.id);
    db.prepare(`UPDATE anton_tasks SET ${updates.join(', ')} WHERE id=?`).run(...values);

    const updated = db.prepare('SELECT * FROM anton_tasks WHERE id=?').get(task.id) as TaskRow;
    res.json({ task: updated });
  });

  // ── POST /api/task-agent/backfill-atoms — extract atoms from all existing completed tasks ──
  router.post('/backfill-atoms', async (req: Request, res: Response) => {
    try {
      const completedTasks = db.prepare(`
        SELECT * FROM anton_tasks WHERE status='completed' AND execution_results IS NOT NULL
        ORDER BY completed_at DESC LIMIT 50
      `).all() as TaskRow[];

      let created = 0;
      let skipped = 0;

      for (const task of completedTasks) {
        // Check if we already have a workflow_output for this task
        const existing = db.prepare(
          "SELECT id FROM workflow_outputs WHERE workflow_id = ?"
        ).get(`task-${task.id}`) as { id: string } | undefined;

        if (existing) {
          skipped++;
          continue;
        }

        const results = parseJson<Array<{ step: number; step_name?: string; output?: string }>>(
          task.execution_results ?? '[]', []
        );
        if (results.length === 0) {
          skipped++;
          continue;
        }

        const allOutputText = results.map((r, i) =>
          `## Step ${i + 1}: ${r.step_name ?? `Step ${r.step}`}\n${r.output ?? ''}`
        ).join('\n\n');

        emitTaskAtoms(task, allOutputText, `Backfill: ${results.length} steps`, results.length);
        created++;
      }

      res.json({ success: true, tasks_processed: created, tasks_skipped: skipped });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── DELETE /api/task-agent/tasks/:id ───────────────────────────────────
  router.delete('/tasks/:id', (req: Request, res: Response) => {
    const userId = getUserId(req);
    const task = db.prepare('SELECT * FROM anton_tasks WHERE id=? AND user_id=?').get(req.params.id, userId) as TaskRow | undefined;
    if (!task) return res.status(404).json({ error: 'Task not found' });
    db.prepare('DELETE FROM anton_tasks WHERE id=?').run(req.params.id);
    res.json({ success: true });
  });

  // ── POST /api/task-agent/ingest — external task intake (Jira/Slack) ────
  // Requires X-ANTON-Token header matching TASK_AGENT_WEBHOOK_SECRET env var
  router.post('/ingest', validate(TaskIngestSchema), (req: Request, res: Response) => {
    const webhookSecret = process.env.TASK_AGENT_WEBHOOK_SECRET;
    const providedToken = req.headers['x-anton-token'];
    if (webhookSecret && providedToken !== webhookSecret) {
      return res.status(401).json({ error: 'Invalid or missing X-ANTON-Token' });
    }

    const { source, title, description, source_ref, priority, metadata } = req.body as {
      source: string; title: string; description: string;
      source_ref?: string; priority?: string; metadata?: Record<string, unknown>;
    };

    const id = randomUUID();
    const userId = 'default'; // External tasks start as default user

    // Extract tags from Jira labels or Slack hashtags
    let tags: string[] = [];
    if (metadata?.labels && Array.isArray(metadata.labels)) {
      tags = (metadata.labels as unknown[]).map(String).slice(0, 10);
    }

    db.prepare(`
      INSERT INTO anton_tasks (id, user_id, title, description, status, source, source_ref, priority, tags)
      VALUES (?, ?, ?, ?, 'intake', ?, ?, ?, ?)
    `).run(id, userId, title.trim(), description.trim(), source, source_ref ?? null, priority ?? 'normal', JSON.stringify(tags));

    res.status(201).json({ task_id: id, message: 'Task ingested successfully' });
  });

  // ── GET /api/task-agent/stats — task queue stats ─────────────────────
  router.get('/stats', (req: Request, res: Response) => {
    const userId = getUserId(req);
    try {
      const byStatus = db.prepare(`
        SELECT status, COUNT(*) as count FROM anton_tasks WHERE user_id=? GROUP BY status
      `).all(userId) as Array<{ status: string; count: number }>;

      const recent = db.prepare(`
        SELECT id, title, status, priority, source, created_at FROM anton_tasks
        WHERE user_id=? ORDER BY created_at DESC LIMIT 5
      `).all(userId) as Array<Partial<TaskRow>>;

      const total = byStatus.reduce((sum, r) => sum + r.count, 0);
      const open = byStatus.filter((r) => !['completed', 'cancelled', 'failed'].includes(r.status))
        .reduce((sum, r) => sum + r.count, 0);

      res.json({ total, open, byStatus, recent });
    } catch (err) {
      res.status(500).json({ error: 'Failed to load stats', detail: String(err) });
    }
  });

  return router;
}
