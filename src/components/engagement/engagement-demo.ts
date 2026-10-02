/**
 * engagement-demo.ts — what the Engagement Task pages need to know about a
 * public demo (DEMO_MODE=true on the server), and how they read a refusal.
 *
 * On a demo a visitor (any non-admin) runs only the demo's models, none of
 * which can search the web, and has no folder on the server to index; the
 * server refuses those (routes/engagements.ts, engagement-run-policy.ts).
 * These helpers keep the pages from offering what would only be refused, and
 * show the server's own sentence when something is.
 */
import { useMemo } from 'react';
import { useDemoStore } from '@/stores/useDemoStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { demoRestricted, type DemoConfig } from '@/lib/demo-config';

export interface EngagementDemo {
  /** True for a non-admin on a public demo. */
  restricted: boolean;
  /** The full model ids the demo offers (empty when not restricted or unknown). */
  offeredModels: string[];
  /** The model an unpinned run uses on the demo: its default when offered, else the first offered; '' when unknown. */
  demoModel: string;
}

export function engagementDemoFor(cfg: DemoConfig, role: string | undefined): EngagementDemo {
  if (!demoRestricted(cfg, role)) return { restricted: false, offeredModels: [], demoModel: '' };
  const offered = cfg.offeredModels;
  const demoModel = cfg.defaultModel && offered.includes(cfg.defaultModel) ? cfg.defaultModel : (offered[0] ?? '');
  return { restricted: true, offeredModels: offered, demoModel };
}

export function useEngagementDemo(): EngagementDemo {
  const cfg = useDemoStore((s) => s.config);
  const role = useAuthStore((s) => s.user?.role);
  return useMemo(() => engagementDemoFor(cfg, role), [cfg, role]);
}

/**
 * The sentence to show for a refused request: the server's `error` (with its
 * `reason`, as the budget check sends one), else the status. Never the raw
 * JSON body.
 */
export async function responseErrorMessage(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  const fallback = `Request failed (${res.status})`;
  let body: unknown;
  try { body = JSON.parse(text); } catch { body = undefined; }
  if (body !== undefined) {
    // JSON: the server's sentence, or nothing of the body.
    const b = (body && typeof body === 'object' ? body : {}) as { error?: unknown; reason?: unknown };
    const error = typeof b.error === 'string' ? b.error : '';
    const reason = typeof b.reason === 'string' ? b.reason : '';
    if (error && reason) return `${error}: ${reason}`;
    return error || fallback;
  }
  return text && text.length < 300 && !/^\s*</.test(text) ? text : fallback;
}

/** An error's message without the "Error: " prefix String(err) adds. */
export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** The link to show for a resource URL: http(s) only, anything else is not a link. */
export function safeHttpUrl(value: string | null | undefined): URL | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
}

/** The file types a visitor may upload (the server's VISITOR_UPLOAD_EXTENSIONS): what the text extractor reads. */
export const VISITOR_UPLOAD_ACCEPT = '.pdf,.docx,.doc,.txt,.md,.xlsx,.csv,.html';
