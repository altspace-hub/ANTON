// ── career-profile.ts ──────────────────────────────────────────────────────
// Portable CV + aspiration data. Bundle type #44. Per the Talent spec, the
// schema anchors on: career_path (history), growth_map (skills + goals),
// aspirations (internal-mobility opt-out-default), assessments (past
// auto-graded results), cv_rendered (auto-generated document for legacy
// consumers).
//
// The candidate owns the bundle. Export creates a signed .anton; import
// replaces the user's active profile. An AAP signature on the bundle
// proves the candidate authored it — recruiters can verify without
// trusting the candidate's ANTON instance.

import { z } from 'zod';

// ── Schemas ───────────────────────────────────────────────────────────────

export const CareerPathEntrySchema = z.object({
  title: z.string().min(1).max(128),
  organisation: z.string().min(1).max(128),
  start_date: z.string(),                      // ISO-8601 date
  end_date: z.string().nullable().optional(),  // null = current
  summary: z.string().max(2000).optional(),
  achievements: z.array(z.string()).max(16).optional(),
  skills_applied: z.array(z.string()).max(32).optional(),
});

export const GrowthMapSchema = z.object({
  current_strengths: z.array(z.string()).max(16),
  growth_areas: z.array(z.string()).max(16),
  learning_goals_next_12_months: z.array(z.string()).max(8),
  preferred_working_style: z.string().max(512).optional(),
});

export const AspirationsSchema = z.object({
  opt_in: z.boolean(),                         // defaults to false; candidate must explicitly opt in
  target_roles: z.array(z.string()).max(8).optional(),
  target_sectors: z.array(z.string()).max(8).optional(),
  relocation_willingness: z.enum(['none', 'regional', 'national', 'international']).optional(),
  compensation_floor_eur: z.number().int().min(0).optional(),
  timeline: z.enum(['exploring', '3-6-months', '6-12-months', '12-plus-months']).optional(),
  notes: z.string().max(1000).optional(),
});

export const AssessmentRecordSchema = z.object({
  application_id: z.string(),
  scored_at: z.string(),
  dimensions: z.record(z.string(), z.number()),
  overall: z.number(),
  bias_audit_flags: z.array(z.string()).optional(),
});

export const CareerProfileBundleSchema = z.object({
  bundle_type: z.literal('career-profile'),
  spec_version: z.literal('1.0'),
  profile_id: z.string().uuid(),
  candidate_contact_hash: z.string().regex(/^ANTON-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/),
  candidate_display_name: z.string().min(1).max(128),
  career_path: z.array(CareerPathEntrySchema).max(32),
  growth_map: GrowthMapSchema,
  aspirations: AspirationsSchema,
  assessments: z.array(AssessmentRecordSchema).max(64).optional(),
  cv_rendered: z.object({
    format: z.enum(['markdown', 'html']),
    content: z.string().max(64 * 1024),
  }).optional(),
  signed_by: z.string().optional(),
  signature: z.string().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type CareerProfileBundle = z.infer<typeof CareerProfileBundleSchema>;
export type CareerPathEntry = z.infer<typeof CareerPathEntrySchema>;
export type GrowthMap = z.infer<typeof GrowthMapSchema>;
export type Aspirations = z.infer<typeof AspirationsSchema>;

export function parseCareerProfile(raw: unknown): { ok: true; profile: CareerProfileBundle } | { ok: false; reason: string } {
  const r = CareerProfileBundleSchema.safeParse(raw);
  if (!r.success) return { ok: false, reason: r.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') };
  return { ok: true, profile: r.data };
}

// Renders a minimal Markdown CV from a profile. Used by /jobs/profile
// "Export as PDF" — the PDF layer converts Markdown to PDF via the
// existing pdf-export pipeline in server/services/.
export function renderProfileAsMarkdown(profile: CareerProfileBundle): string {
  const parts: string[] = [];
  parts.push(`# ${profile.candidate_display_name}`);
  parts.push('');
  if (profile.career_path.length > 0) {
    parts.push('## Experience');
    for (const e of profile.career_path) {
      const end = e.end_date ?? 'Present';
      parts.push(`### ${e.title} — ${e.organisation}`);
      parts.push(`*${e.start_date} – ${end}*`);
      if (e.summary) { parts.push(''); parts.push(e.summary); }
      if (e.achievements && e.achievements.length > 0) {
        parts.push('');
        parts.push('**Achievements:**');
        for (const a of e.achievements) parts.push(`- ${a}`);
      }
      if (e.skills_applied && e.skills_applied.length > 0) {
        parts.push('');
        parts.push(`**Skills:** ${e.skills_applied.join(', ')}`);
      }
      parts.push('');
    }
  }
  parts.push('## Growth');
  parts.push('');
  parts.push(`**Current strengths:** ${profile.growth_map.current_strengths.join(', ')}`);
  parts.push('');
  parts.push(`**Growth areas:** ${profile.growth_map.growth_areas.join(', ')}`);
  if (profile.growth_map.learning_goals_next_12_months.length > 0) {
    parts.push('');
    parts.push(`**Learning goals (12 months):** ${profile.growth_map.learning_goals_next_12_months.join('; ')}`);
  }
  if (profile.aspirations.opt_in) {
    parts.push('');
    parts.push('## Aspirations');
    if (profile.aspirations.target_roles) parts.push(`**Target roles:** ${profile.aspirations.target_roles.join(', ')}`);
    if (profile.aspirations.target_sectors) parts.push(`**Target sectors:** ${profile.aspirations.target_sectors.join(', ')}`);
    if (profile.aspirations.timeline) parts.push(`**Timeline:** ${profile.aspirations.timeline}`);
  }
  return parts.join('\n');
}
