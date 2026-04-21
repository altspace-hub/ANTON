// ── visitor-categories.ts ──────────────────────────────────────────────────
// Frontend mirror of server/services/portals/starter-pack-schema.ts constants.
// Kept in sync by hand; enough overlap that a schema-gen could be introduced
// later but not worth the build-tooling cost now.

export type CategoryTier = 'we-own' | 'placeholder';

export interface CategoryConfig {
  id: string;
  label: string;
  icon_ref: string;
  native_tool_ref?: { type: 'module' | 'page' | 'service'; ref: string };
  featured_query?: { capabilities?: string[]; tags?: string[]; jurisdictions?: string[] };
  pathfinder_scope?: string;
  design_principle?: string;
  tier?: CategoryTier;
  sort_order: number;
}

export interface BookmarkConfig {
  bookmark_type: 'platform' | 'portal' | 'route' | 'external';
  target_portal_id?: string;
  target_route?: string;
  target_url?: string;
  label: string;
  icon_ref?: string;
  sort_order: number;
  undeletable?: boolean;
}

// Same canon as the server. When updating, update both.
export const DEFAULT_15_CATEGORIES: CategoryConfig[] = [
  { id: 'pathfinder',  label: 'Pathfinder',   icon_ref: 'Compass',       tier: 'we-own',      sort_order: 0,  design_principle: 'Search that tells you why.' },
  { id: 'jobs',        label: 'Jobs',         icon_ref: 'Briefcase',     tier: 'we-own',      sort_order: 1,  design_principle: 'Transparent hiring or none at all.' },
  { id: 'marketplace', label: 'Marketplace',  icon_ref: 'Store',         tier: 'we-own',      sort_order: 2,  design_principle: 'Inspect before you install.' },
  { id: 'friends',     label: 'Friends',      icon_ref: 'Users',         tier: 'we-own',      sort_order: 3,  design_principle: 'Social without the surveillance.' },
  { id: 'video',       label: 'Video',        icon_ref: 'Video',         tier: 'we-own',      sort_order: 4,  design_principle: 'Video that respects you.' },
  { id: 'music',       label: 'Music',        icon_ref: 'Music',         tier: 'placeholder', sort_order: 5,  design_principle: 'Creators paid via FutureChain. No platform ads.' },
  { id: 'food',        label: 'Food',         icon_ref: 'ChefHat',       tier: 'placeholder', sort_order: 6,  design_principle: 'No dark-pattern upsells. No opaque fees.' },
  { id: 'shop',        label: 'Shop',         icon_ref: 'ShoppingBag',   tier: 'placeholder', sort_order: 7,  design_principle: 'No fake reviews. Quality signals are AAP attestations, not stars.' },
  { id: 'sport',       label: 'Sport',        icon_ref: 'Trophy',        tier: 'placeholder', sort_order: 8,  design_principle: 'No engagement-optimised rankings.' },
  { id: 'news',        label: 'News',         icon_ref: 'Newspaper',     tier: 'placeholder', sort_order: 9,  design_principle: 'Ranking is transparent and time-decayed, not outrage-weighted.' },
  { id: 'money',       label: 'Money',        icon_ref: 'Wallet',        tier: 'placeholder', sort_order: 10, design_principle: 'No hidden spread. No gamified trading.' },
  { id: 'travel',      label: 'Travel',       icon_ref: 'Plane',         tier: 'placeholder', sort_order: 11, design_principle: 'No dark-pattern booking funnels. Pricing transparent.' },
  { id: 'health',      label: 'Health',       icon_ref: 'HeartPulse',    tier: 'placeholder', sort_order: 12, design_principle: 'Medical privacy by default.' },
  { id: 'places',      label: 'Places',       icon_ref: 'MapPin',        tier: 'placeholder', sort_order: 13, design_principle: 'No surveillance tracking. Location stays on-device.' },
  { id: 'learn',       label: 'Learn',        icon_ref: 'GraduationCap', tier: 'placeholder', sort_order: 14, design_principle: 'Content is inspectable. No black-box AI tutors.' },
];

/** Tier-B categories that use the shared placeholder CategoryPage template. */
export const TIER_B_CATEGORY_IDS = DEFAULT_15_CATEGORIES
  .filter(c => c.tier === 'placeholder')
  .map(c => c.id);
