// ── Structured Extractor — Phase 1 (Approach 2) ──────────────────────────
//
// Given a module's Markdown output and its content_type, this service
// produces a validated StructuredOutput payload. Phase 1 ships Approach 2
// (post-hoc LLM extraction via Haiku 4.5) so all 492 existing modules get
// structured output without rewriting a single module prompt.
//
// The extraction is deterministic from the user's perspective — we cache
// by content hash of the Markdown + content_type + schema version. The
// same input always produces the same output without re-calling the LLM.
//
// Failure modes are SILENT to the user:
//   - LLM call fails → structured_status='failed', session still succeeds
//   - Returned JSON is malformed → structured_status='failed'
//   - Returned JSON doesn't validate against schema → structured_status='failed'
// In every failure case the Markdown is preserved. The transform panel
// falls back to the generic exports (md/docx/xlsx/pdf/pptx).

import crypto from 'crypto';
import { callChat } from './provider-router.js';
import {
  loadContentTypeSchema,
  type ContentType,
  type StructuredOutput,
  isContentType,
  DEFAULT_CONTENT_TYPE,
} from '../schemas/content-types/index.js';
import type { DatabaseAdapter } from '../db/database.js';

const EXTRACTION_MODEL = 'claude-haiku-4-5-20251001';
const SCHEMA_VERSION = '1.0';
const EXTRACTION_TIMEOUT_MS = 45_000;

export type ExtractionStatus = 'extracted' | 'failed' | 'disabled';

export interface ExtractionResult {
  status: ExtractionStatus;
  payload: StructuredOutput | null;
  error?: string;
  cached: boolean;
  hash: string;
  tokens_used?: number;
}

export interface ExtractionInput {
  markdown: string;
  contentType: ContentType;
  moduleId: string;
  areaId?: string;
  generationModel?: string;      // model id that produced the markdown
  sector?: string | null;        // Phase 2 hint; null in Phase 1
}

export function createStructuredExtractor(db: DatabaseAdapter) {
  // In-memory cache keyed by content hash. Hot path for repeated extracts
  // within one process (tests, re-renders).
  const memCache = new Map<string, ExtractionResult>();

  async function extract(input: ExtractionInput): Promise<ExtractionResult> {
    const hash = contentHash(input.markdown, input.contentType);

    // 1. Check in-process cache
    const memHit = memCache.get(hash);
    if (memHit) return { ...memHit, cached: true };

    // 2. Check DB cache — any prior session with the same hash already has
    //    a valid extraction we can reuse. This covers re-extractions of
    //    the same output (e.g. after a session import).
    const dbHit = await db.get<{ output_structured: unknown }>(
      `SELECT output_structured FROM sessions
       WHERE structured_hash = ? AND structured_status = 'extracted'
       LIMIT 1`,
      hash,
    );
    if (dbHit?.output_structured) {
      const payload = coercePayload(dbHit.output_structured);
      if (payload) {
        const result: ExtractionResult = { status: 'extracted', payload, cached: true, hash };
        memCache.set(hash, result);
        return result;
      }
    }

    // 3. Live LLM extraction
    const result = await runExtraction(input, hash);
    memCache.set(hash, result);
    return result;
  }

  async function runExtraction(input: ExtractionInput, hash: string): Promise<ExtractionResult> {
    const schema = loadContentTypeSchema(input.contentType);

    const systemPrompt = buildSystemPrompt(input.contentType, schema);
    const userPrompt = buildUserPrompt(input.markdown, input.contentType);

    let chat;
    try {
      chat = await Promise.race([
        callChat({
          model: EXTRACTION_MODEL,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
          maxTokens: 8_000,
          temperature: 0,
          db,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Extraction timed out after ${EXTRACTION_TIMEOUT_MS}ms`)), EXTRACTION_TIMEOUT_MS),
        ),
      ]);
    } catch (err) {
      return {
        status: 'failed', payload: null, hash, cached: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    const text = chat.text ?? '';
    const json = extractJsonBlock(text);
    if (!json) {
      return { status: 'failed', payload: null, hash, cached: false, error: 'No JSON block found in extractor output' };
    }
    let parsed: unknown;
    try { parsed = JSON.parse(json); }
    catch (err) {
      return { status: 'failed', payload: null, hash, cached: false, error: `Malformed JSON: ${err instanceof Error ? err.message : String(err)}` };
    }

    // Light validation — we check the required top-level keys on the body
    // and leave deeper conformance to the consuming renderer (which also
    // validates).
    const validation = validateAgainstSchema(parsed, schema);
    if (!validation.valid) {
      return { status: 'failed', payload: null, hash, cached: false, error: `Schema validation failed: ${validation.errors.join('; ')}` };
    }

    const payload: StructuredOutput = {
      schema_version: SCHEMA_VERSION,
      module_id: input.moduleId,
      area_id: input.areaId ?? '',
      content_type: input.contentType,
      sector: input.sector ?? null,
      generated_at: new Date().toISOString(),
      model: input.generationModel ?? 'unknown',
      body: parsed,
    };
    return {
      status: 'extracted', payload, hash, cached: false,
      tokens_used: (chat.inputTokens ?? 0) + (chat.outputTokens ?? 0),
    };
  }

  /**
   * Convenience wrapper — extract + persist to sessions row.
   * Returns the ExtractionResult (caller can log or surface status).
   */
  async function extractAndStore(sessionId: string, input: ExtractionInput): Promise<ExtractionResult> {
    const result = await extract(input);
    await db.run(
      `UPDATE sessions
       SET output_structured = ?, content_type = ?, structured_status = ?, structured_hash = ?, updated_at = NOW()
       WHERE id = ?`,
      result.payload ? JSON.stringify(result.payload) : null,
      input.contentType,
      result.status,
      result.hash,
      sessionId,
    );
    return result;
  }

  return { extract, extractAndStore };
}

export type StructuredExtractor = ReturnType<typeof createStructuredExtractor>;

// ── Prompt builders ────────────────────────────────────────────────────

function buildSystemPrompt(contentType: ContentType, schema: Record<string, unknown>): string {
  return `You are a structured-data extractor for ANTON. Your ONE job is to read a Markdown professional output and emit a JSON object that conforms to the given schema.

RULES:
- Output ONLY a single fenced JSON block labelled \`json\`. No prose, no preamble, no explanation.
- The JSON must validate against the schema below (content type: ${contentType}).
- Preserve all information from the Markdown — do not summarise or truncate items. If the Markdown lists 14 risks, your output must contain 14 items.
- If a required field is missing from the Markdown, infer a reasonable value from context. If you truly cannot, use an empty string for text fields, an empty array for lists, or 0 for numbers. Do NOT invent false specifics (dates, names, amounts).
- Do NOT speculate or add items the Markdown does not mention.
- For ids: generate short stable identifiers (e.g. "R-001", "F1") if the Markdown doesn't provide them.
- Output the JSON body only (no envelope, no schema_version, no module_id — just the "body" part the schema describes).

SCHEMA (JSON Schema draft-07):
\`\`\`json
${JSON.stringify(schema, null, 2)}
\`\`\`

OUTPUT FORMAT:
\`\`\`json
{ ... }
\`\`\``;
}

function buildUserPrompt(markdown: string, contentType: ContentType): string {
  return `Extract the structured payload (content_type: ${contentType}) from the following Markdown. Output only a single \`json\` block, nothing else.

---

${markdown}`;
}

// ── JSON extraction + validation ──────────────────────────────────────

function extractJsonBlock(text: string): string | null {
  // Prefer the LAST fenced json block (extractors sometimes think out loud
  // before emitting the final answer).
  const re = /```json\s*\n([\s\S]*?)\n```/g;
  let match: RegExpExecArray | null;
  let last: string | null = null;
  while ((match = re.exec(text)) !== null) last = match[1];
  if (last) return last.trim();
  // Fallback: maybe the LLM forgot the ``` wrapper — try to find the first
  // balanced { ... } block.
  const firstBrace = text.indexOf('{');
  if (firstBrace < 0) return null;
  const lastBrace = text.lastIndexOf('}');
  if (lastBrace < firstBrace) return null;
  return text.slice(firstBrace, lastBrace + 1);
}

/**
 * Lightweight validator — checks `required` top-level keys and recursively
 * enforces `required` inside each object in an array when the schema
 * specifies it. Full JSON Schema validation is deferred to ajv if/when
 * added as a dep; for Phase 1 this catches the 90% case.
 */
export function validateAgainstSchema(value: unknown, schema: Record<string, unknown>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  validateNode(value, schema, '$', errors);
  return { valid: errors.length === 0, errors };
}

function validateNode(value: unknown, schema: Record<string, unknown>, path: string, errors: string[]): void {
  const t = schema.type as string | undefined;
  if (t === 'object') {
    if (value == null || typeof value !== 'object' || Array.isArray(value)) {
      errors.push(`${path}: expected object`);
      return;
    }
    const required = (schema.required as string[] | undefined) ?? [];
    for (const key of required) {
      if (!(key in (value as Record<string, unknown>))) {
        errors.push(`${path}.${key}: required`);
      }
    }
    const props = (schema.properties as Record<string, Record<string, unknown>> | undefined) ?? {};
    for (const [key, childSchema] of Object.entries(props)) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) validateNode(v, childSchema, `${path}.${key}`, errors);
    }
  } else if (t === 'array') {
    if (!Array.isArray(value)) { errors.push(`${path}: expected array`); return; }
    const itemsSchema = schema.items as Record<string, unknown> | undefined;
    if (itemsSchema) {
      value.forEach((item, i) => validateNode(item, itemsSchema, `${path}[${i}]`, errors));
    }
  }
  // string/number/boolean types + enum checks deliberately skipped here —
  // we rely on renderers + Phase-1f dogfood to surface those. The goal of
  // this function is just "did the LLM return something with the required
  // structural keys".
}

// ── Helpers ───────────────────────────────────────────────────────────

function contentHash(markdown: string, contentType: ContentType): string {
  return crypto
    .createHash('sha256')
    .update(`${SCHEMA_VERSION}|${contentType}|${markdown}`)
    .digest('hex');
}

function coercePayload(v: unknown): StructuredOutput | null {
  if (typeof v === 'string') {
    try { return JSON.parse(v) as StructuredOutput; }
    catch { return null; }
  }
  return v as StructuredOutput;
}

/**
 * Public helper — choose a safe content_type when the module metadata is
 * missing or unreadable. Falls back to analytic_report (most permissive).
 */
export function safeContentType(v: unknown): ContentType {
  return isContentType(v) ? v : DEFAULT_CONTENT_TYPE;
}
