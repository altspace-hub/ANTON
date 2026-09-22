/**
 * The task box's placeholder, per module.
 *
 * Every module used to show one global example — "Analyze our AML policy
 * against AMLR requirements for a Nordic bank…" — on a green-claims review, a
 * citation manager and a DORA register alike (2026-09-22 Work QA). A module
 * with a worked example shows the start of it; the rest get a neutral prompt
 * that names the module.
 */
const MAX_EXAMPLE_CHARS = 140;

/** The start of a worked example, cut at a sentence or word boundary. */
export function examplePlaceholder(example: string): string {
  const text = example.replace(/\s+/g, ' ').trim();
  if (text.length <= MAX_EXAMPLE_CHARS) return `e.g., ${text}`;
  const head = text.slice(0, MAX_EXAMPLE_CHARS);
  const sentenceEnd = Math.max(head.lastIndexOf('. '), head.lastIndexOf('; '));
  const cut = sentenceEnd > 60 ? head.slice(0, sentenceEnd + 1) : head.slice(0, head.lastIndexOf(' '));
  return `e.g., ${cut.trim()}…`;
}

export function taskPlaceholder(opts: {
  example: string | null | undefined;
  moduleLabel: string | null | undefined;
  /** The neutral, module-naming text (translated). */
  neutral: (moduleLabel: string) => string;
  /** The old global placeholder — kept only where the neutral text is not translated yet. */
  legacy: string;
  neutralTranslated: boolean;
}): string {
  if (opts.example && opts.example.trim()) return examplePlaceholder(opts.example);
  if (opts.neutralTranslated && opts.moduleLabel) return opts.neutral(opts.moduleLabel);
  return opts.legacy;
}
