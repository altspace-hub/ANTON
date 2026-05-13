/**
 * summarize.ts — extract the searchable capability summary from a
 * capability descriptor at approval time.
 *
 * The portals.capability_summary column is denormalised for search:
 * it holds just the verbs/tags/categories/areas/languages so the
 * search endpoint can filter without parsing descriptor_json on every
 * query.
 *
 * Defensive: descriptors come from external submitters via the wire;
 * unknown / malformed fields are silently dropped rather than thrown.
 * The summary is "best effort" — search misses on a slightly off
 * descriptor are preferable to refusing approval.
 */

export interface CapabilitySummary {
  verbs: string[];
  tags: string[];
  categories: string[];
  serviceAreas: string[];
  languages: string[];
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function dedupe(arr: string[]): string[] {
  return Array.from(new Set(arr));
}

export function summarizeDescriptor(descriptor: unknown): CapabilitySummary {
  const out: CapabilitySummary = {
    verbs: [],
    tags: [],
    categories: [],
    serviceAreas: [],
    languages: [],
  };
  if (typeof descriptor !== 'object' || descriptor === null) return out;
  const d = descriptor as Record<string, unknown>;

  // Top-level category becomes a single-element categories list.
  const category = asString(d.category);
  if (category) out.categories.push(category);

  // Top-level tags / serviceAreas / languages copy through if present.
  if (isStringArray(d.tags)) out.tags.push(...d.tags);
  if (isStringArray(d.serviceAreas)) out.serviceAreas.push(...d.serviceAreas);
  if (isStringArray(d.languages)) out.languages.push(...d.languages);

  // Walk capabilities[]. Each may have a verb + tags.
  if (Array.isArray(d.capabilities)) {
    for (const raw of d.capabilities) {
      if (typeof raw !== 'object' || raw === null) continue;
      const cap = raw as Record<string, unknown>;
      const verb = asString(cap.verb);
      if (verb) out.verbs.push(verb);
      if (isStringArray(cap.tags)) out.tags.push(...cap.tags);
    }
  }

  // Dedupe everything — multiple capabilities can reuse the same verb
  // or tag and we don't want the search filter to over-weight them.
  out.verbs = dedupe(out.verbs);
  out.tags = dedupe(out.tags);
  out.categories = dedupe(out.categories);
  out.serviceAreas = dedupe(out.serviceAreas);
  out.languages = dedupe(out.languages);
  return out;
}
