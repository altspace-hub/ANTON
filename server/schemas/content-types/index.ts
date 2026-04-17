// ── Content-Type Schemas — Phase 1 registry ──────────────────────────────
//
// Eight JSON Schemas define the canonical body shapes for the structured
// output payload. Every module is mapped to exactly one of these; the
// Renderer Registry filters by content_type to show the right transforms.
//
// The envelope (schema_version, module_id, area_id, content_type, sector,
// generated_at, model, body) is validated by the extractor; this module
// validates the body part against the content-type schema.
//
// Phase 2 adds sector-specific oneOf branches; Phase 3 adds format-native
// types (sie_accounting_file, fhir_bundle, esrs_report, …).

import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type ContentType =
  | 'gap_analysis'
  | 'risk_register'
  | 'process_map'
  | 'policy_document'
  | 'analytic_report'
  | 'plan_document'
  | 'entity_register'
  | 'scorecard';

export const CONTENT_TYPES: readonly ContentType[] = [
  'gap_analysis',
  'risk_register',
  'process_map',
  'policy_document',
  'analytic_report',
  'plan_document',
  'entity_register',
  'scorecard',
] as const;

export const DEFAULT_CONTENT_TYPE: ContentType = 'analytic_report';

/** Loads the JSON Schema for a given content type. Throws if unknown. */
export function loadContentTypeSchema(type: ContentType): Record<string, unknown> {
  const filePath = path.join(__dirname, `${type}.json`);
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw) as Record<string, unknown>;
}

/** Lightweight guard — does NOT validate, only checks the string is a known type. */
export function isContentType(v: unknown): v is ContentType {
  return typeof v === 'string' && (CONTENT_TYPES as readonly string[]).includes(v);
}

/**
 * The envelope shape. `body` conforms to the content-type-specific schema.
 * Sector is always null in Phase 1; populated in Phase 2.
 */
export interface StructuredOutput<TBody = unknown> {
  schema_version: string;          // '1.0' in Phase 1
  module_id: string;
  area_id: string;
  content_type: ContentType;
  sector: string | null;
  generated_at: string;            // ISO timestamp
  model: string;                   // the model id that produced the underlying markdown
  body: TBody;
}
