/**
 * demo-config.ts — what the web client knows about a public demo server
 * (DEMO_MODE=true; server/middleware/demo-mode.ts). Pure functions over the
 * public /api/config answer, so the login page, the banner, the sidebar and
 * the pillar switch all read one interpretation of it.
 *
 * On a demo the server answers 404 to a non-admin outside the Work routes;
 * these helpers hide what would only lead there. Admins see everything —
 * the server does not restrict them either.
 */

/** The app-mode pillars (useSettingsStore AppMode). */
export const PILLARS = [
  'work', 'school', 'life', 'pathfinder', 'markets', 'community',
  'payments', 'portals', 'missions', 'procure', 'civic', 'grow',
] as const;
export type Pillar = typeof PILLARS[number];

export interface DemoConfig {
  demoMode: boolean;
  offeredModels: string[];
  enabledPillars: Pillar[];
  signupOpen: boolean;
  signupCodeRequired: boolean;
  retentionDays: number;
  privacyPath: string;
}

/** An ordinary (non-demo) server. */
export const DEMO_OFF: DemoConfig = {
  demoMode: false,
  offeredModels: [],
  enabledPillars: [...PILLARS],
  signupOpen: false,
  signupCodeRequired: false,
  retentionDays: 0,
  privacyPath: '/privacy',
};

const isPillar = (v: unknown): v is Pillar => typeof v === 'string' && (PILLARS as readonly string[]).includes(v);

/** Reads /api/config defensively: anything malformed means "not a demo". */
export function parseDemoConfig(json: unknown): DemoConfig {
  if (!json || typeof json !== 'object') return DEMO_OFF;
  const c = json as Record<string, unknown>;
  if (c.demoMode !== true) return DEMO_OFF;
  const pillars = Array.isArray(c.enabledPillars) ? c.enabledPillars.filter(isPillar) : [];
  const days = Number(c.retentionDays);
  return {
    demoMode: true,
    offeredModels: Array.isArray(c.offeredModels) ? c.offeredModels.filter((m): m is string => typeof m === 'string' && m.length > 0) : [],
    enabledPillars: pillars.includes('work') ? pillars : ['work', ...pillars],
    signupOpen: c.signupOpen === true,
    signupCodeRequired: c.signupCodeRequired === true,
    retentionDays: Number.isFinite(days) && days > 0 ? Math.floor(days) : 30,
    // Only a same-site path: the value becomes a link on the login page.
    privacyPath: typeof c.privacyPath === 'string' && /^\/[a-z0-9/-]*$/i.test(c.privacyPath) ? c.privacyPath : '/privacy',
  };
}

/** True when this person is held to the demo's reduced surface. */
export function demoRestricted(cfg: DemoConfig, role: string | undefined): boolean {
  return cfg.demoMode && role !== 'admin';
}

/** Whether a pillar is offered to this person. */
export function pillarVisible(cfg: DemoConfig, role: string | undefined, pillar: Pillar): boolean {
  return !demoRestricted(cfg, role) || pillar === 'work' || cfg.enabledPillars.includes(pillar);
}

/** Sidebar entries (NavItemConfig ids) that belong to a pillar. */
export const NAV_ITEMS_BY_PILLAR: Readonly<Partial<Record<Pillar, readonly string[]>>> = {
  pathfinder: ['pathfinder', 'pathfinder-history'],
  markets: ['markets'],
  procure: ['procure'],
  civic: ['civic'],
  grow: ['grow'],
  school: ['school'],
  life: ['news', 'finance', 'travel'],
  community: ['community', 'community-groups', 'community-mail', 'community-calendar'],
  payments: [],
  portals: ['trusted-stores'],
  missions: [],
};

// ── Sign-up (POST /api/auth/demo-signup) ──────────────────────────────────────

/** The server's rules (RegisterSchema): 3–50 of letters, digits, _ and -. */
export const DEMO_USERNAME_RE = /^[a-zA-Z0-9_-]{3,50}$/;
export const DEMO_PASSWORD_MIN = 12;

export interface DemoSignupInput {
  username: string;
  password: string;
  code: string;
  agreed: boolean;
}

/** What is wrong with the form before it is sent, or null. */
export function demoSignupProblem(input: DemoSignupInput, codeRequired: boolean): string | null {
  if (!DEMO_USERNAME_RE.test(input.username.trim())) return 'Choose a username of 3–50 letters, numbers, _ or -.';
  if (input.password.length < DEMO_PASSWORD_MIN) return `Use a password of at least ${DEMO_PASSWORD_MIN} characters.`;
  if (input.password.length > 200) return 'That password is too long (200 characters at most).';
  if (codeRequired && !input.code.trim()) return 'Enter the invite code you were given.';
  if (!input.agreed) return 'Please confirm that you have read the notice above.';
  return null;
}

/** The message for a refused sign-up. The server's own sentence where it wrote one. */
export function demoSignupErrorMessage(status: number, body: unknown): string {
  const b = (body && typeof body === 'object' ? body : {}) as { error?: unknown; details?: Record<string, unknown> };
  if (status === 400 && b.details) {
    if (b.details.password) return `Use a password of at least ${DEMO_PASSWORD_MIN} characters.`;
    if (b.details.username) return 'Choose a username of 3–50 letters, numbers, _ or -.';
  }
  if ([403, 409, 429].includes(status) && typeof b.error === 'string' && b.error.length < 200) return b.error;
  if (status === 404) return 'Sign-up is not available on this server.';
  return 'Sign-up could not be completed. Please try again.';
}

/** The Work entries a demo visitor keeps: home, where the module catalogue is. */
export const DEMO_WORK_NAV_ITEMS: readonly string[] = ['home'];

/**
 * The sidebar entries to hide for this person: none on an ordinary server
 * or for an admin; on a demo, everything but the Work home and the entries
 * of the enabled pillars.
 */
export function demoHiddenNavItems(cfg: DemoConfig, role: string | undefined, allIds: readonly string[]): Set<string> {
  if (!demoRestricted(cfg, role)) return new Set();
  const visible = new Set<string>(DEMO_WORK_NAV_ITEMS);
  for (const pillar of cfg.enabledPillars) for (const id of NAV_ITEMS_BY_PILLAR[pillar] ?? []) visible.add(id);
  return new Set([...allIds, 'home'].filter((id) => !visible.has(id)));
}
