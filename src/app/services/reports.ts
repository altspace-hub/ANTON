/**
 * reports.ts — reporting an AI response the model should not have produced.
 *
 * Google Play requires apps that generate content with an LLM to give the user
 * an in-app way to report what came out of it. The Companion app is squarely
 * one of those apps — free chat, module chat, a model picker, and a
 * child-facing School mode that funnels into the same ChatPage — and until
 * this file existed it had no reporting affordance anywhere. That is a
 * rejection on its own, independent of how good the safety of the model is.
 *
 * WHAT IS "REPORTED" HERE IS NOT A PERSON
 * Comm reports a contact (src/comm/services/reports.ts, the shape this mirrors).
 * There is no other user on the far end of a Companion conversation — the thing
 * that misbehaved is the MODEL, in one specific turn, possibly under a specific
 * module's system prompt. So a record pins: which model answered, which module
 * framed it, which conversation and which message, and the user's own account
 * of what was wrong.
 *
 * SAME PRIVACY CONTRACT AS COMM
 * Nothing here transmits anything. A Companion conversation routinely carries
 * the user's confidential work — that is the entire premise of a local-first
 * expert workspace — so a reporting flow that quietly posted the offending turn
 * to someone would be a data-exfiltration path wearing a safety badge. A report
 * is therefore:
 *
 *   • written to this device only
 *   • never auto-populated with conversation text; the response is attached
 *     ONLY when the user ticks the box
 *   • escalated by the USER, through the OS share sheet, carrying exactly what
 *     they chose to include
 *
 * The escalation text is assembled here rather than in the sheet so the rule
 * about what may leave the device lives in exactly one place and can be tested
 * without rendering anything.
 */

/** Why the user is reporting. Aimed at model output, not at a person. */
export type ReportCategory =
  | 'harmful'
  | 'hateful'
  | 'sexual'
  | 'inaccurate'
  | 'illegal'
  | 'other';

export const REPORT_CATEGORIES: readonly ReportCategory[] =
  ['harmful', 'hateful', 'sexual', 'inaccurate', 'illegal', 'other'] as const;

export interface AiContentReport {
  /** Local id — reports never leave the device unless the user shares one. */
  id: string;
  /**
   * The model that produced the response. `null` means the user had not
   * overridden the org default, which is itself worth recording: "the default
   * did this" and "the model I picked did this" are different bug reports.
   */
  modelId: string | null;
  /** Human label shown in the chip at the time of reporting. */
  modelLabel: string;
  /** Module whose system prompt framed the answer, when the user was in one. */
  moduleId?: string;
  /** Conversation the response belongs to; absent for an unsaved first turn. */
  sessionId: string | null;
  /** The specific assistant turn being reported. Required — see saveReport. */
  messageId: string;
  category: ReportCategory;
  /** The user's own words. Never auto-filled from the conversation. */
  note?: string;
  /**
   * The reported response text, ONLY when the user chose to attach it. Absent
   * by default — see the module comment.
   */
  includedResponseText?: string;
  createdAt: number;
}

const STORAGE_KEY = 'anton-companion-reports';

/**
 * Newest N kept. localStorage is a few MB shared with the session cache
 * (offline.ts), and an attached response can be long; an unbounded log would
 * eventually start throwing QuotaExceededError on the cache writes that keep
 * the app usable offline. The user's own record of recent reports is what this
 * is for, not an archive.
 */
const MAX_REPORTS = 200;

function newId(): string {
  // crypto.randomUUID exists in the WebView and in jsdom 22+; the fallback is
  // for older PWA browsers, where a colliding id would silently overwrite an
  // earlier report.
  return globalThis.crypto?.randomUUID?.()
    ?? `r_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/** Newest first. The user's own record of what they have flagged. */
export function listReports(): AiContentReport[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Written by us, but a corrupt or hand-edited blob must not crash the chat.
    return (parsed as AiContentReport[])
      .filter((r): r is AiContentReport =>
        !!r && typeof r === 'object' && typeof r.messageId === 'string')
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export function saveReport(
  input: Omit<AiContentReport, 'id' | 'createdAt'>, now = Date.now(),
): AiContentReport {
  // A report that cannot be tied back to a turn is not actionable — neither by
  // the user re-reading their own log nor by anyone they escalate to.
  if (!input.messageId) throw new Error('saveReport: messageId is required');
  const row: AiContentReport = { ...input, id: newId(), createdAt: now };
  try {
    const next = [row, ...listReports()].slice(0, MAX_REPORTS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked (private mode). The report is still returned, so
    // the user can still SHARE it — losing the local copy is much less bad than
    // losing the report they just wrote.
  }
  return row;
}

export function reportCountFor(messageId: string): number {
  return listReports().filter((r) => r.messageId === messageId).length;
}

/**
 * The escalation text the user may choose to send onward.
 *
 * PURE and exported so a test can assert what it does and does not contain.
 * The invariant: conversation text appears ONLY when `includedResponseText` is
 * set, which only happens when the user ticked the box. Nothing derived from
 * the conversation — not a preview, not a truncated summary — leaks in by
 * another route. The user's prompt is never carried at all: it is the half of
 * the exchange most likely to hold their confidential material, and it is not
 * what is being reported.
 */
export function formatReportForSharing(
  r: AiContentReport, opts: { appVersion?: string } = {},
): string {
  const lines: string[] = [
    'ANTON Companion — AI content report',
    `Model: ${r.modelLabel}${r.modelId ? ` (${r.modelId})` : ' (instance default)'}`,
  ];
  if (r.moduleId) lines.push(`Module: ${r.moduleId}`);
  if (r.sessionId) lines.push(`Conversation: ${r.sessionId}`);
  lines.push(`Response: ${r.messageId}`);
  lines.push(`Category: ${r.category}`);
  lines.push(`When: ${new Date(r.createdAt).toISOString()}`);
  if (r.note) lines.push('', 'What was wrong:', r.note);
  if (r.includedResponseText) {
    lines.push('', 'Response text I chose to include:', r.includedResponseText);
  } else {
    lines.push('',
      'No response text is included. The report is stored on the reporter\'s',
      'device and only they can disclose what was said.');
  }
  if (opts.appVersion) lines.push('', `App: ${opts.appVersion}`);
  return lines.join('\n');
}
