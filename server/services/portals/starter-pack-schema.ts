// ── starter-pack-schema.ts ──────────────────────────────────────────────────
// Bundle type #43 — `starter-pack`. Configures the Visitor Home (bookmark
// bar + 15-category grid) per region / pillar-mode / deployment. Ships as
// .anton files under data/starter-packs/ and can also be installed from
// the bundle marketplace.
//
// Schema validated on import; packs with bad shapes are rejected with a
// specific reason so users + curators can fix them.

import { z } from 'zod';

// ── Zod schemas ───────────────────────────────────────────────────────────

export const BookmarkConfigSchema = z.object({
  bookmark_type: z.enum(['platform', 'portal', 'route', 'external']),
  target_portal_id: z.string().optional(),
  target_route: z.string().optional(),
  target_url: z.string().url().optional(),
  label: z.string().min(1).max(64),
  icon_ref: z.string().max(64).optional(),
  sort_order: z.number().int().min(0).max(999),
  undeletable: z.boolean().optional(),
}).refine(
  (b) => {
    const targets = [b.target_portal_id, b.target_route, b.target_url].filter(Boolean).length;
    return targets === 1;
  },
  { message: 'bookmark must have exactly one of target_portal_id, target_route, target_url' },
);

export const CategoryConfigSchema = z.object({
  id: z.string().min(1).max(48),
  label: z.string().min(1).max(48),
  icon_ref: z.string().max(64),
  native_tool_ref: z.object({
    type: z.enum(['module', 'page', 'service']),
    ref: z.string(),
  }).optional(),
  featured_query: z.object({
    capabilities: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    jurisdictions: z.array(z.string()).optional(),
  }).optional(),
  pathfinder_scope: z.string().optional(),
  design_principle: z.string().max(280).optional(),
  tier: z.enum(['we-own', 'placeholder']).optional(),
  sort_order: z.number().int().min(0).max(999),
});

export const StarterPackBundleSchema = z.object({
  bundle_type: z.literal('starter-pack'),
  spec_version: z.literal('1.0'),
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(128),
  description: z.string().max(1024),
  target_mode: z.enum(['global', 'school', 'work', 'life']).optional(),
  locale: z.string().regex(/^[a-z]{2,3}(-[A-Z]{2})?$/).optional(),
  bookmarks: z.array(BookmarkConfigSchema).max(32),
  categories: z.array(CategoryConfigSchema).min(1).max(32),
  featured_portals: z.record(z.string(), z.array(z.string())).optional(),
  signed_by: z.string().optional(),
  signature: z.string().optional(),
});

// ── Exported TypeScript types (inferred from schemas) ─────────────────────

export type BookmarkConfig = z.infer<typeof BookmarkConfigSchema>;
export type CategoryConfig = z.infer<typeof CategoryConfigSchema>;
export type StarterPackBundle = z.infer<typeof StarterPackBundleSchema>;

// ── Validation helper ─────────────────────────────────────────────────────

export function parseStarterPack(raw: unknown): { ok: true; pack: StarterPackBundle } | { ok: false; reason: string } {
  const parsed = StarterPackBundleSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, reason: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') };
  }
  return { ok: true, pack: parsed.data };
}

// ── Default 15-category canon ─────────────────────────────────────────────
// Used by the global starter-pack and as the fallback layout when no pack
// is active. Keep in sync with src/lib/visitor-categories.ts (frontend).

export const DEFAULT_15_CATEGORIES: CategoryConfig[] = [
  // Row 1 — "We own"
  { id: 'pathfinder',  label: 'Pathfinder',   icon_ref: 'Compass',     tier: 'we-own',      sort_order: 0,  design_principle: 'Search that tells you why.' },
  { id: 'jobs',        label: 'Jobs',         icon_ref: 'Briefcase',   tier: 'we-own',      sort_order: 1,  design_principle: 'Transparent hiring or none at all.' },
  { id: 'marketplace', label: 'Marketplace',  icon_ref: 'Store',       tier: 'we-own',      sort_order: 2,  design_principle: 'Inspect before you install.' },
  { id: 'friends',     label: 'Friends',      icon_ref: 'Users',       tier: 'we-own',      sort_order: 3,  design_principle: 'Social without the surveillance.' },
  { id: 'video',       label: 'Video',        icon_ref: 'Video',       tier: 'we-own',      sort_order: 4,  design_principle: 'Video that respects you.' },
  // Row 2 — Placeholder
  { id: 'music',       label: 'Music',        icon_ref: 'Music',       tier: 'placeholder', sort_order: 5,  design_principle: 'Creators paid via FutureChain. No platform ads.' },
  { id: 'food',        label: 'Food',         icon_ref: 'ChefHat',     tier: 'placeholder', sort_order: 6,  design_principle: 'No dark-pattern upsells. No opaque fees.' },
  { id: 'shop',        label: 'Shop',         icon_ref: 'ShoppingBag', tier: 'placeholder', sort_order: 7,  design_principle: 'No fake reviews. Quality signals are AAP attestations, not stars.' },
  { id: 'sport',       label: 'Sport',        icon_ref: 'Trophy',      tier: 'placeholder', sort_order: 8,  design_principle: 'No engagement-optimised rankings.' },
  { id: 'news',        label: 'News',         icon_ref: 'Newspaper',   tier: 'placeholder', sort_order: 9,  design_principle: 'Ranking is transparent and time-decayed, not outrage-weighted.' },
  // Row 3 — Placeholder
  { id: 'money',       label: 'Money',        icon_ref: 'Wallet',      tier: 'placeholder', sort_order: 10, design_principle: 'No hidden spread. No gamified trading.' },
  { id: 'travel',      label: 'Travel',       icon_ref: 'Plane',       tier: 'placeholder', sort_order: 11, design_principle: 'No dark-pattern booking funnels. Pricing transparent.' },
  { id: 'health',      label: 'Health',       icon_ref: 'HeartPulse',  tier: 'placeholder', sort_order: 12, design_principle: 'Medical privacy by default.' },
  { id: 'places',      label: 'Places',       icon_ref: 'MapPin',      tier: 'placeholder', sort_order: 13, design_principle: 'No surveillance tracking. Location stays on-device.' },
  { id: 'learn',       label: 'Learn',        icon_ref: 'GraduationCap', tier: 'placeholder', sort_order: 14, design_principle: 'Content is inspectable. No black-box AI tutors.' },
];

export const DEFAULT_PLATFORM_BOOKMARKS: BookmarkConfig[] = [
  { bookmark_type: 'platform', target_route: '/pathfinder',  label: 'Pathfinder',  icon_ref: 'Compass',   sort_order: 0, undeletable: true  },
  { bookmark_type: 'route',    target_route: '/jobs',        label: 'Jobs',        icon_ref: 'Briefcase', sort_order: 1, undeletable: false },
  { bookmark_type: 'route',    target_route: '/marketplace', label: 'Marketplace', icon_ref: 'Store',     sort_order: 2, undeletable: false },
  { bookmark_type: 'platform', target_route: '/portals/mine', label: 'My ANTON',   icon_ref: 'User',      sort_order: 3, undeletable: true  },
];
