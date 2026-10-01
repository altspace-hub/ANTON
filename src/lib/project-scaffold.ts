/**
 * project-scaffold.ts — the answer of POST /api/ai-assist/project-scaffold,
 * read defensively. The server asks a model for the scaffold, so any field
 * can be missing or in another shape: the Projects page once read
 * `suggestedDeadlines.length` on an answer that had none and took the page
 * down after every scaffold. This keeps what is usable and drops the rest.
 */

export interface ScaffoldPhase {
  name: string;
  duration: string;
  tasks: string[];
}

export interface ProjectScaffold {
  description: string;
  recommendedModules: { id: string; reason: string }[];
  suggestedDeadlines: { title: string; dayOffset: number }[];
  phases: ScaffoldPhase[];
  successCriteria: string[];
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const strings = (v: unknown): string[] => list(v).map(text).filter((s) => s.length > 0);

/** The usable parts of a scaffold answer; null when it is not an object at all. */
export function normaliseScaffold(json: unknown): ProjectScaffold | null {
  if (!isRecord(json)) return null;
  const recommendedModules = list(json.recommendedModules)
    .map((m) => (typeof m === 'string'
      ? { id: m.trim(), reason: '' }
      : isRecord(m) ? { id: text(m.id), reason: text(m.reason) } : { id: '', reason: '' }))
    .filter((m) => m.id.length > 0);
  const suggestedDeadlines = list(json.suggestedDeadlines)
    .filter(isRecord)
    .map((d) => ({ title: text(d.title), dayOffset: Number.isFinite(Number(d.dayOffset)) ? Math.max(0, Math.round(Number(d.dayOffset))) : 0 }))
    .filter((d) => d.title.length > 0);
  const phases = list(json.phases)
    .map((p) => (typeof p === 'string'
      ? { name: p.trim(), duration: '', tasks: [] }
      : isRecord(p) ? { name: text(p.name) || text(p.title), duration: text(p.duration), tasks: strings(p.tasks) } : null))
    .filter((p): p is ScaffoldPhase => !!p && p.name.length > 0);
  return {
    description: text(json.description),
    recommendedModules,
    suggestedDeadlines,
    phases,
    successCriteria: strings(json.successCriteria),
  };
}
