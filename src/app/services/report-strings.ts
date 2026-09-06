/**
 * report-strings.ts — en + sv copy for the report-a-response sheet.
 *
 * WHY A PLAIN MAP AND NOT i18next
 * The Comm app ships i18next with src/comm/i18n/locales/{en,sv}.json. The
 * Companion app does NOT: every screen under src/app/ writes its English
 * inline, and there is no i18n runtime in this Vite build at all. Wiring
 * react-i18next into src/app for one sheet would be a large, risky diff in
 * launch week and would leave every other screen untranslated anyway.
 *
 * So the copy that must exist in Swedish — the reporting flow, because the
 * devices this ships to run in Swedish and a safety affordance nobody can read
 * is not an affordance — lives here as a typed map instead. The shape is
 * deliberately the same as a locale file: one key per string, identical key
 * sets, so moving it into i18next later is mechanical rather than a rewrite.
 *
 * Anything added here must be added to BOTH maps; the tests fail otherwise.
 */

export type ReportLang = 'en' | 'sv';

export interface ReportStrings {
  /** Label on the affordance under an assistant message. */
  action: string;
  title: string;
  /** `{{model}}` is substituted with the model label. */
  answeredBy: string;
  reason: string;
  catHarmful: string;
  catHateful: string;
  catSexual: string;
  catInaccurate: string;
  catIllegal: string;
  catOther: string;
  notePlaceholder: string;
  includeResponse: string;
  includeResponseHint: string;
  privacy: string;
  cancel: string;
  submit: string;
  /** Confirmation shown after the sheet closes. */
  saved: string;
  /** Title offered to the OS share sheet. */
  shareTitle: string;
}

export const REPORT_STRINGS: Record<ReportLang, ReportStrings> = {
  en: {
    action: 'Report',
    title: 'Report this response',
    answeredBy: 'Answered by {{model}}',
    reason: 'What was wrong',
    catHarmful: 'Harmful or dangerous advice',
    catHateful: 'Hateful, harassing or abusive',
    catSexual: 'Sexual or not suitable for children',
    catInaccurate: 'False or misleading',
    catIllegal: 'Illegal content',
    catOther: 'Something else',
    notePlaceholder: 'Tell us what happened (optional)',
    includeResponse: 'Attach the response text to my report',
    includeResponseHint:
      'Off by default. The report stays on this device until you choose to share it.',
    privacy:
      'Saved on this device. Nothing is sent anywhere unless you share it yourself.',
    cancel: 'Cancel',
    submit: 'Report',
    saved: 'Report saved on this device.',
    shareTitle: 'ANTON Companion — AI content report',
  },
  sv: {
    action: 'Rapportera',
    title: 'Rapportera det här svaret',
    answeredBy: 'Besvarat av {{model}}',
    reason: 'Vad var fel',
    catHarmful: 'Skadligt eller farligt råd',
    catHateful: 'Hatiskt, trakasserande eller kränkande',
    catSexual: 'Sexuellt eller olämpligt för barn',
    catInaccurate: 'Falskt eller vilseledande',
    catIllegal: 'Olagligt innehåll',
    catOther: 'Något annat',
    notePlaceholder: 'Berätta vad som hände (frivilligt)',
    includeResponse: 'Bifoga svarets text i min rapport',
    includeResponseHint:
      'Av som standard. Rapporten stannar på den här enheten tills du själv delar den.',
    privacy:
      'Sparas på den här enheten. Inget skickas någonstans om du inte delar det själv.',
    cancel: 'Avbryt',
    submit: 'Rapportera',
    saved: 'Rapporten är sparad på den här enheten.',
    shareTitle: 'ANTON Companion — rapport om AI-innehåll',
  },
};

/**
 * Resolve the copy for a BCP-47 tag (identity.preferredLanguage). Only the
 * primary subtag matters, so 'sv-SE' and 'sv' land in the same place; anything
 * we have not translated falls back to English rather than showing keys.
 */
export function reportStrings(lang?: string | null): ReportStrings {
  const primary = (lang ?? '').toLowerCase().split('-')[0];
  return primary === 'sv' ? REPORT_STRINGS.sv : REPORT_STRINGS.en;
}
