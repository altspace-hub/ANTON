/**
 * disclaimer.ts — produces the §3 mandatory disclaimer.
 *
 * Hard rule per the spec: every calculation output from the engine
 * MUST carry this text. The output formatters refuse to render
 * without it (enforced in reporting/*).
 *
 * Translations land per the locales the Comm App + Heimdall Module
 * 19 target. Until a translator signs off on a locale we keep it
 * out of `SUPPORTED_LOCALES` — better to fall back to English than
 * to ship a legally-fraught approximate translation.
 */

export type DisclaimerLocale = 'en' | 'sv';

export const SUPPORTED_LOCALES: DisclaimerLocale[] = ['en', 'sv'];

export interface DisclaimerInput {
  jurisdictionName: string;
  /** ISO date — when the rules block was last verified by an
   *  authoritative source. Surfaced to the user so they can see how
   *  stale the computation inputs are. */
  lastVerified: string;
  locale?: DisclaimerLocale;
}

const TEMPLATES: Record<DisclaimerLocale, (input: DisclaimerInput) => string> = {
  en: ({ jurisdictionName, lastVerified }) =>
    `This estimate is based on FutureChain's interpretation of publicly available tax rules in ${jurisdictionName} as of ${lastVerified}. It is not tax advice. Crypto tax rules change frequently and individual circumstances vary. Before filing any tax return based on these figures, consult a qualified tax adviser in your jurisdiction. FutureChain AB accepts no liability for filings made on the basis of this estimate.`,
  sv: ({ jurisdictionName, lastVerified }) =>
    `Denna uppskattning bygger på FutureChains tolkning av offentligt tillgängliga skatteregler i ${jurisdictionName} per ${lastVerified}. Detta är inte skatterådgivning. Skattereglerna för krypto ändras ofta och individuella förhållanden varierar. Konsultera en kvalificerad skatterådgivare i din jurisdiktion innan du lämnar in en deklaration baserad på dessa siffror. FutureChain AB tar inget ansvar för deklarationer som lämnas in baserat på denna uppskattning.`,
};

export function buildDisclaimer(input: DisclaimerInput): string {
  const locale = input.locale ?? 'en';
  const tpl = TEMPLATES[locale] ?? TEMPLATES.en;
  return tpl(input);
}

/** Sentinel returned by output formatters when they refuse to render
 *  because the disclaimer is missing. Caught by the reporting layer. */
export class MissingDisclaimerError extends Error {
  constructor() {
    super('Tax-engine output cannot be rendered without the §3 disclaimer.');
    this.name = 'MissingDisclaimerError';
  }
}
