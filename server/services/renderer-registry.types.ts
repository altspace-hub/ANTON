// ── Renderer Registry — Shared Types ─────────────────────────────────────
//
// Contracts used by every Phase 1 renderer. A renderer receives a validated
// structured payload plus a context (session, options, brand template) and
// returns a RenderResult that points at the persisted artifact.

import type { ContentType, StructuredOutput } from '../schemas/content-types/index.js';

export type RendererCategory =
  | 'visualize'        // Mermaid, SVG charts, Gantt
  | 'adapt_audience'   // executive one-pager, plain-language, board-deck
  | 'package'          // DOCX, XLSX, PDF, PPTX, MD, HTML, redline
  | 'regulatory'       // Phase 2+ — ESRS, SIE, FHIR, …
  | 'review';          // devil's advocate, regulator's-eye

export type RendererTrigger = 'post_hoc' | 'upfront' | 'both';

export type RendererStatus = 'stable' | 'beta' | 'experimental' | 'disabled';

export interface RendererAppliesWhen {
  /** Empty/missing = matches any content type. */
  content_types?: ContentType[];
  /** Phase 1 renderers don't set sectors; Phase 2+ may. */
  sectors?: string[];
  /**
   * Dotted-path expressions into payload.body. All paths must resolve to a
   * non-null/non-empty value for the renderer to be offered.
   *
   * Examples:
   *   - "items"                  → body.items must exist + be non-empty
   *   - "items[*].likelihood"    → every row in body.items must have likelihood set
   *   - "steps[*].next"          → every step must have outbound edges
   */
  requires_fields?: string[];
}

export interface RendererOutput {
  file_type: string;              // 'svg', 'pdf', 'html', 'docx', 'pptx', 'xlsx', 'md', 'xml', 'json'
  mime_type: string;
  filename_template: string;      // '{module_id}-{renderer_id}-{timestamp}.{file_type}'
}

export interface RendererDefinition {
  id: string;
  label: string;
  description: string;
  category: RendererCategory;
  trigger: RendererTrigger;
  applies_when: RendererAppliesWhen;
  output: RendererOutput;
  renderer_module: string;        // relative import key, resolved by the loader
  preview_module?: string;
  phase: 1 | 2 | 3;
  status: RendererStatus;
  sort_order?: number;
}

// ── Runtime types (passed to/from RenderFn) ───────────────────────────────

export interface RenderSessionContext {
  id: string;
  module_id: string;
  title: string;
  area_id: string | null;
  content_type: ContentType | null;
  sector: string | null;
  user_id: string | null;
}

export interface BrandTemplate {
  primary_color?: string;
  accent_color?: string;
  font_family?: string;
  logo_path?: string;
  header_text?: string;
  footer_text?: string;
  mermaid_theme?: 'default' | 'dark' | 'forest' | 'neutral';
  /** Free-form additional brand config for renderers that need it */
  extra?: Record<string, unknown>;
}

/**
 * A company-uploaded LaTeX asset (`brand_templates` rows of type 'latex') —
 * a `.cls`, `.sty` or `.bib` file, already read into memory and already
 * reduced to a filename that is safe to use as an archive entry.
 *
 * `filename` is the name the file must have to be usable, NOT the name it is
 * stored under: LaTeX resolves `\documentclass{acmecorp}` to `acmecorp.cls`,
 * while uploads are stored under a random UUID.
 */
export interface LatexAssetFile {
  filename: string;
  content: Buffer;
}

export interface RenderContext {
  session: RenderSessionContext;
  options: Record<string, unknown>;
  brand_template?: BrandTemplate;
  /** Markdown output (from messages.content). Renderers that need prose rather
   *  than the structured payload (e.g. plain-language, executive-one-pager) use this. */
  markdown?: string;
  /**
   * LaTeX class/style/bibliography files uploaded for this session's owner.
   * Absent or empty means the instance has no LaTeX house style, and renderers
   * must behave exactly as they did before assets existed.
   */
  latex_assets?: LatexAssetFile[];
}

export interface RenderValidationResult {
  validated_against?: string;     // Schema URI or identifier
  valid: boolean;
  errors?: string[];
}

export interface RenderResult {
  file_path: string;              // absolute or OUTPUT_DIR-relative path of the rendered artifact
  preview_path?: string;
  file_type: string;
  mime_type: string;
  file_size_bytes?: number;
  validation?: RenderValidationResult;
  metadata: Record<string, unknown>;
  tokens_consumed?: number;       // present for LLM-based renderers; 0/undefined for deterministic
}

export type RenderFn<TBody = unknown> = (
  payload: StructuredOutput<TBody>,
  context: RenderContext,
) => Promise<RenderResult>;

// ── Registry row as returned by the service layer ─────────────────────────

export interface RegistryEntry extends RendererDefinition {
  /** Resolved render function, available after the loader has imported renderer_module. */
  render?: RenderFn;
}

// ── Helper — resolve a dotted-path / bracket expression against an object ──

/**
 * Evaluate a `requires_fields` expression against a payload body.
 *
 * Supported syntax:
 *   - "foo"             → body.foo is non-null + non-empty
 *   - "foo.bar"         → body.foo.bar is non-null + non-empty
 *   - "items"           → body.items is a non-empty array
 *   - "items[*].field"  → body.items is non-empty AND every row has .field set
 *
 * Returns true if the expression is satisfied.
 */
export function evaluateRequiresField(body: unknown, expr: string): boolean {
  if (body == null || typeof body !== 'object') return false;
  const parts = expr.split('.');
  // `strict` flips on after the first [*] segment — once we're iterating
  // array elements, missing values mean FAILURE (not "skip this element").
  let cursors: unknown[] = [body];
  let strict = false;
  for (const seg of parts) {
    const next: unknown[] = [];
    const [rawKey, ...rest] = seg.split('[');
    const isForAll = rest.length > 0 && rest[0].startsWith('*]');
    for (const c of cursors) {
      if (c == null || typeof c !== 'object') {
        if (strict) return false;
        continue;
      }
      const v = (c as Record<string, unknown>)[rawKey];
      if (v == null || v === '') {
        if (strict) return false;
        continue;
      }
      if (isForAll) {
        if (!Array.isArray(v) || v.length === 0) {
          if (strict) return false;
          continue;
        }
        for (const item of v) next.push(item);
      } else {
        next.push(v);
      }
    }
    if (next.length === 0) return false;
    cursors = next;
    if (isForAll) strict = true;
  }
  // All final cursors must be truthy / non-empty
  return cursors.every(v => {
    if (v == null) return false;
    if (typeof v === 'string') return v.length > 0;
    if (Array.isArray(v)) return v.length > 0;
    return true;
  });
}
