/**
 * demo-legal.ts — the facts the owner still has to supply in the public
 * demo's privacy notice (/privacy) and demo terms (/terms), and how the two
 * pages fill them in (DEMO_MODE=true; privacy review G7, G10).
 *
 * The texts mark each such fact as [[NAME]]. A field left empty here stays on
 * the page as a highlighted [[NAME]], so the owner sees what is missing. Two
 * come from the server instead: the retention period (DEMO_ACCOUNT_TTL_DAYS,
 * via /api/config) and, when CONTROLLER_NAME is empty, the controller's name
 * (DEMO_OPERATOR_NAME).
 *
 * The red DRAFT box on both pages stays up while any field is missing, and
 * until DEMO_LEGAL_SIGNED_OFF is set — after counsel has signed the notice
 * and the terms off.
 */
import type { DemoConfig } from '@/lib/demo-config';

export type DemoLegalField =
  | 'NOTICE_EFFECTIVE_DATE'
  | 'TERMS_EFFECTIVE_DATE'
  | 'DEMO_URL'
  | 'CONTROLLER_NAME'
  | 'CONTROLLER_LEGAL_FORM'
  | 'CONTROLLER_ADDRESS'
  | 'CONTROLLER_ORG_NO'
  | 'CONTROLLER_VAT_NO'
  | 'PRIVACY_EMAIL'
  | 'MAILBOX_PROVIDER'
  | 'MAILBOX_LOCATION'
  | 'OPENROUTER_DPA_VERSION_DATE'
  | 'NGINX_LOG_SENTENCE';

/**
 * Filled in by the owner. What each one is: the PLACEHOLDERS list of the
 * privacy review (e.g. CONTROLLER_NAME is the registered business that holds
 * the OpenRouter, Bahnhof and domain accounts; NGINX_LOG_SENTENCE must match
 * the VM's nginx log format and rotation).
 */
export const DEMO_LEGAL_FIELDS: Readonly<Record<DemoLegalField, string>> = {
  NOTICE_EFFECTIVE_DATE: '',
  TERMS_EFFECTIVE_DATE: '',
  DEMO_URL: '',
  CONTROLLER_NAME: '',
  CONTROLLER_LEGAL_FORM: '',
  CONTROLLER_ADDRESS: '',
  CONTROLLER_ORG_NO: '',
  CONTROLLER_VAT_NO: '',
  PRIVACY_EMAIL: '',
  MAILBOX_PROVIDER: '',
  MAILBOX_LOCATION: '',
  OPENROUTER_DPA_VERSION_DATE: '',
  NGINX_LOG_SENTENCE: '',
};

/** Set to true once counsel has signed off the notice and the terms (G10). */
export const DEMO_LEGAL_SIGNED_OFF = false;

/**
 * The version of the terms text on /terms. It must equal DEMO_TERMS_VERSION in
 * server/middleware/demo-mode.ts (a test holds the two together): sign-up
 * sends this one, so a browser showing older terms is refused and asked to
 * reload. Change both whenever the terms text changes.
 */
export const DEMO_TERMS_TEXT_VERSION = '2026-09-26';

const PLACEHOLDER = /\[\[([A-Z0-9_]+)\]\]/g;

/** Characters that would change the Markdown around a value put into it. */
const escapeMarkdown = (value: string): string => value.replace(/[\\`*[\]<>|]/g, (c) => `\\${c}`);

/** The values the pages put into the texts. */
export function demoLegalValues(cfg: DemoConfig): Record<string, string> {
  return {
    ...DEMO_LEGAL_FIELDS,
    CONTROLLER_NAME: DEMO_LEGAL_FIELDS.CONTROLLER_NAME.trim() || cfg.operatorName,
    ACCOUNT_TTL_DAYS: String(cfg.demoMode ? cfg.retentionDays : 30),
  };
}

/** The Markdown with every known value put in; an unknown or empty one stays as [[NAME]]. */
export function fillLegalText(markdown: string, values: Readonly<Record<string, string>>): string {
  return markdown.replace(PLACEHOLDER, (whole, name: string) => {
    const value = values[name]?.trim();
    return value ? escapeMarkdown(value) : whole;
  });
}

/** The [[NAME]] fields still in a text, each once, in order. */
export function unfilledFields(text: string): string[] {
  return [...new Set([...text.matchAll(PLACEHOLDER)].map((m) => m[1]))];
}

/** Whether the DRAFT box shows: until counsel's sign-off, and while any field is missing. */
export function legalTextIsDraft(unfilled: readonly string[], signedOff: boolean = DEMO_LEGAL_SIGNED_OFF): boolean {
  return !signedOff || unfilled.length > 0;
}
