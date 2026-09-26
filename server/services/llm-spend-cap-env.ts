/**
 * llm-spend-cap-env.ts — reading the two daily spend-cap variables.
 *
 * Kept free of imports so the demo-mode checks (middleware/demo-mode.ts) can
 * use the same parser without pulling in the compat resolver.
 *
 * A cap is a plain number of US dollars with a '.' decimal: "3", "0.25".
 * Unset, empty or 0 means no cap, as MONTHLY_BUDGET_CAP=0 does elsewhere.
 * Anything else — "0,25", "$3", "3 USD", "-1" — is INVALID. It used to read as
 * "no cap" without a word, so an operator who typed a Swedish decimal ran a
 * public demo with both caps off while believing they were on.
 */

export const SPEND_CAP_VARS = ['LLM_DAILY_SPEND_CAP_USD', 'LLM_USER_DAILY_SPEND_CAP_USD'] as const;
export type SpendCapVar = typeof SPEND_CAP_VARS[number];

export interface ParsedSpendCap {
  /** The cap in USD, or null for no cap (unset, empty, 0 or invalid). */
  value: number | null;
  /** True when the variable is set to something that is not a number ≥ 0. */
  invalid: boolean;
}

export function parseSpendCap(raw: string | undefined): ParsedSpendCap {
  const text = (raw ?? '').trim();
  if (text === '') return { value: null, invalid: false };
  // Number('') and Number(' ') are 0 and Number('0x10') is 16: accept only a
  // plain decimal, so a value that merely happens to parse is not taken.
  if (!/^\d+\.?\d*$|^\.\d+$/.test(text)) return { value: null, invalid: true };
  const n = Number(text);
  if (!Number.isFinite(n)) return { value: null, invalid: true };
  return { value: n > 0 ? n : null, invalid: false };
}

/** The cap variables that are set but cannot be read (names only, never values). */
export function invalidSpendCapVars(env: Readonly<Record<string, string | undefined>> = process.env): SpendCapVar[] {
  return SPEND_CAP_VARS.filter((name) => parseSpendCap(env[name]).invalid);
}

/** The one-line explanation for an invalid cap variable (name only). */
export function invalidSpendCapMessage(name: string): string {
  return `${name} is not a number (write US dollars with a '.' decimal and no currency sign, e.g. 0.25; 0 or unset = no cap)`;
}
