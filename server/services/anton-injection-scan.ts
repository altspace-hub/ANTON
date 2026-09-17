/**
 * anton-injection-scan.ts — the prompt-injection scan a module bundle must
 * pass before it is installed (Wave 6, track G).
 *
 * Before this file, the validator's step-4 scan covered system-prompt.md
 * only and reported WARNINGS — "ignore previous instructions" imported as a
 * valid module. Now every text a bundle can put in front of the model is
 * scanned (the prompt, the guided inputs, the default config with its
 * referenceOutput, every embedded skill and persona), and a finding BLOCKS
 * the import unless the importer explicitly accepts the findings. The
 * accepted findings are recorded with the module so the decision is
 * auditable.
 *
 * The patterns are heuristics for the common jailbreak phrasings. They name
 * the MODEL as the object ("your system prompt", "ignore previous
 * instructions"), never a topic a domain module legitimately discusses
 * ("data exfiltration", "customers forget what they bought"). A legit prompt
 * can still trip one — that is what the opt-in is for, and why each finding
 * carries an excerpt: the user sees the actual sentence and decides.
 *
 * Calibration (2026-09-17): swept over the 1,312 built-in texts — every
 * module system prompt and module.json, the built-in and disk skills, every
 * persona, server/prompts/*.md — with zero findings.
 * tests/services/anton-bundle-injection.test.ts re-runs that sweep, so a
 * pattern that starts flagging shipped content fails the suite instead of
 * blocking a user's export → import.
 *
 * Pure: no DB, no I/O. anton-validator keeps its own <script> stripping.
 */

export interface InjectionPattern {
  id: string;
  label: string;
  regex: RegExp;
  severity: 'high' | 'medium';
}

export interface InjectionFinding {
  /** Bundle entry the text came from (system-prompt.md, skills/<id>.md, …). */
  file: string;
  patternId: string;
  label: string;
  severity: 'high' | 'medium';
  /** The matched sentence, trimmed to a readable window. */
  excerpt: string;
  /** 1-based line of the match inside the scanned text (for JSON: the Nth string value). */
  line: number;
}

/** Up to three determiners: "all the", "all of your", "any of the". */
const OPT = '(?:(?:all|any|the|your|my|these|those|of)\\s+){0,3}';
const PREV = '(?:previous|prior|above|earlier|preceding|former|initial|original|existing|system|default)';
const INSTR = '(?:instructions?|prompts?|rules?|directives?|guidelines?|guidance|context|constraints?|programming|training)';
/** What an attacker wants out of the model: its prompt, the chat, or secrets. */
const LOOT = '(?:system\\s+prompts?|hidden\\s+(?:instructions?|prompts?)|prompts?|instructions?|conversation|chat\\s+history|context\\s+window|secrets?|api\\s+keys?|credentials?|access\\s+tokens?)';
const DET = '(?:the\\s+|your\\s+|this\\s+|all\\s+(?:of\\s+)?(?:your\\s+|the\\s+)?|any\\s+|its\\s+|my\\s+)?';

export const INJECTION_PATTERNS: ReadonlyArray<InjectionPattern> = [
  // ── The validator's original eight, sharpened to the model-directed forms ──
  {
    id: 'ignore-instructions',
    label: 'Ignore previous / above / prior instructions',
    // "ignore [all] previous instructions", "ignore the above rules",
    // "ignore your prior programming", "ignore all instructions" — but not
    // "ignore instructions inside uploaded documents" (a legit defence line).
    regex: new RegExp(`\\bignore\\s+(?:${OPT}${PREV}\\s+${INSTR}|all\\s+(?:of\\s+)?(?:your\\s+|the\\s+)?${INSTR}|everything\\s+(?:above|before|previously))\\b`, 'i'),
    severity: 'high',
  },
  {
    id: 'disregard-instructions',
    label: 'Disregard instructions / rules',
    regex: new RegExp(`\\bdisregard\\s+(?:${OPT}${PREV}\\s+${INSTR}|all\\s+(?:of\\s+)?(?:your\\s+|the\\s+)?${INSTR}|everything\\s+(?:above|before|previously))\\b`, 'i'),
    severity: 'high',
  },
  {
    id: 'forget-everything',
    label: 'Forget everything / previous instructions',
    regex: new RegExp(`\\bforget\\s+(?:everything\\s+(?:above|before|you\\s+(?:were|have\\s+been)\\s+told)|${OPT}${PREV}\\s+${INSTR}|all\\s+(?:of\\s+)?your\\s+${INSTR}|who\\s+you\\s+are)\\b`, 'i'),
    severity: 'high',
  },
  {
    id: 'new-directive',
    label: 'Inline "new instructions:" directive',
    regex: /(?:^|\n)\s*(?:#+\s*)?(?:new|updated|real|actual|true)\s+(?:system\s+)?(?:instructions?|directives?|rules|persona|identity)\s*:/i,
    severity: 'medium',
  },
  {
    id: 'you-are-now',
    label: '"You are now …" identity switch',
    // "You are now DAN", "you are now in developer mode", "you are now an
    // unrestricted AI", "you are now free of your guidelines" — not "you are
    // now a member" or "you are now better prepared".
    regex: /\byou\s+are\s+now\s+(?:(?:called\s+|named\s+|known\s+as\s+)?DAN\b|in\s+(?:\w+\s+){0,2}mode\b|(?:an?\s+|the\s+)?(?:\w+\s+){0,2}(?:unrestricted|unfiltered|uncensored|unbound|unconstrained|jailbroken|evil|rogue|amoral)\b|no\s+longer\s+(?:bound|restricted|limited|an?\s+(?:AI|assistant|language\s+model))\b|free\s+(?:of|from)\s+(?:all\s+|any\s+|your\s+)?(?:rules|restrictions|limits|guidelines|constraints|filters)\b|(?:\w+\s+){0,5}(?:without|with\s+no)\s+(?:any\s+)?(?:rules|restrictions|limits|guidelines|constraints|filters|ethics)\b)/i,
    severity: 'high',
  },
  {
    id: 'system-you',
    label: 'Fake "System:" turn',
    regex: /(?:^|\n)\s*system\s*:\s*you\b/i,
    severity: 'high',
  },
  {
    id: 'system-tag',
    label: 'Chat-template role tag ([SYSTEM], [INST], <|im_start|>)',
    regex: /\[\s*\/?\s*(?:SYSTEM|INST)\s*\]|<\|\s*(?:im_start|im_end|system|endoftext)\s*\|>|<<\s*SYS\s*>>/i,
    severity: 'high',
  },
  {
    id: 'sudo-mode',
    label: 'Developer / sudo / jailbreak mode',
    regex: /\b(?:enable|enter|activate|switch\s+(?:to|into)|turn\s+on|unlock|operate\s+in|act\s+in|respond\s+in)\s+(?:the\s+)?(?:developer|dev|sudo|god|jailbreak|jailbroken|unrestricted|unfiltered|uncensored|DAN)\s+mode\b|\bsudo\s+mode\b/i,
    severity: 'high',
  },

  // ── Added in Wave 6 — the phrasings the old scan let through ──
  {
    id: 'system-prompt-override',
    label: 'System prompt override',
    regex: /\bsystem\s+prompt\s+override\b|\b(?:override|overwrite|overrule|replace|supersede)\s+(?:the\s+|your\s+|any\s+|all\s+|its\s+|this\s+)?(?:system\s+prompts?|system\s+instructions?|system\s+messages?)\b|\b(?:override|overwrite|overrule|bypass|disable|turn\s+off|ignore|remove)\s+(?:all\s+(?:of\s+)?)?your\s+(?:safety\s+(?:rules?|guidelines?|instructions?|filters?|training|measures)|guardrails?|content\s+(?:policy|policies|filters?)|restrictions|ethical\s+guidelines)\b/i,
    severity: 'high',
  },
  {
    id: 'reveal-system-prompt',
    label: 'Reveal / repeat the system prompt',
    regex: /\b(?:reveal|print|repeat|output|show|display|dump|leak|echo|recite|disclose|expose)\s+(?:me\s+|back\s+)?(?:your|the|this|its|all\s+(?:of\s+)?(?:your|the))\s+(?:(?:full|entire|complete|original|exact|hidden|initial|secret|raw)\s+)*(?:system\s+prompts?|system\s+instructions?|hidden\s+(?:instructions?|prompts?)|initial\s+(?:instructions?|prompts?)|instructions\s+above|secret\s+(?:instructions?|prompts?)|prompt\s+above)\b|\b(?:verbatim|word\s+for\s+word)\b[^\n.]{0,40}\byour\s+(?:system\s+)?(?:prompt|instructions)\b/i,
    severity: 'high',
  },
  {
    id: 'exfiltrate',
    label: 'Exfiltrate the prompt / secrets',
    // Verb + object, so "data exfiltration" as a threat topic is not flagged.
    regex: new RegExp(`\\bexfiltrat(?:e|es|ed|ing)\\s+${DET}${LOOT}\\b|\\bexfiltration\\s+of\\s+${DET}${LOOT}\\b`, 'i'),
    severity: 'high',
  },
  {
    id: 'base64-prompt',
    label: 'Base64-encode the prompt / secrets',
    regex: new RegExp(`\\bbase\\s*-?\\s*64(?:\\s*-?\\s*encode)?\\s+${DET}${LOOT}\\b|\\b(?:encode|convert|translate|output|write|print|return|send|give\\s+me)\\s+${DET}${LOOT}\\b[^\\n.]{0,40}\\b(?:in|to|as|into|using)\\s+base\\s*-?\\s*64\\b`, 'i'),
    severity: 'high',
  },
  {
    id: 'send-to-url',
    label: 'Send the conversation / secrets to a URL',
    regex: new RegExp(`\\b(?:send|post|transmit|upload|forward|beacon|leak)\\s+${DET}${LOOT}\\b[^\\n]{0,60}\\b(?:to|at)\\s+(?:https?:\\/\\/|[a-z0-9-]+\\.[a-z]{2,}\\/)`, 'i'),
    severity: 'high',
  },
  {
    id: 'do-anything-now',
    label: '"Do Anything Now" (DAN)',
    regex: /\b[Dd]o\s+[Aa]nything\s+[Nn]ow\b|\bDAN\s+(?:mode|prompt|jailbreak)\b|\b(?:[Aa]s|[Aa]ct\s+as|[Yy]ou\s+are)\s+DAN\b/,
    severity: 'high',
  },
  {
    id: 'pretend-no-rules',
    label: 'Pretend there are no rules / restrictions',
    regex: /\b(?:pretend|act\s+as\s+if|imagine|assume)\s+(?:that\s+)?(?:you\s+)?(?:have|had|there\s+are|there\s+were|with)\s+no\s+(?:rules|restrictions|limits|limitations|guidelines|filters|boundaries|ethics)\b/i,
    severity: 'high',
  },
];

const EXCERPT_WINDOW = 90;

/** Zero-width and bidi-control characters an attacker can splice into a phrase to dodge a regex. */
const INVISIBLE_CHARS = /[­᠎​-‏‪-‮⁠-⁤﻿]/g;

/** NFKC-fold (full-width / ligature look-alikes) and drop invisible characters before matching. */
export function normaliseForScan(text: string): string {
  return text.normalize('NFKC').replace(INVISIBLE_CHARS, '');
}

function excerptAround(text: string, index: number, length: number): string {
  const start = Math.max(0, index - EXCERPT_WINDOW);
  const end = Math.min(text.length, index + length + EXCERPT_WINDOW);
  const raw = text.slice(start, end).replace(/\s+/g, ' ').trim();
  return `${start > 0 ? '…' : ''}${raw}${end < text.length ? '…' : ''}`;
}

function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

/** Scan one text. One finding per pattern per file (the first match). */
export function scanTextForInjection(text: string, file: string): InjectionFinding[] {
  if (!text) return [];
  const scanned = normaliseForScan(text);
  const findings: InjectionFinding[] = [];
  for (const pattern of INJECTION_PATTERNS) {
    const match = pattern.regex.exec(scanned);
    if (!match) continue;
    findings.push({
      file,
      patternId: pattern.id,
      label: pattern.label,
      severity: pattern.severity,
      excerpt: excerptAround(scanned, match.index, match[0].length),
      line: lineOf(scanned, match.index),
    });
  }
  return findings;
}

/** Every string value in a JSON document (keys too), one per line. */
function jsonStrings(value: unknown, out: string[]): void {
  if (typeof value === 'string') {
    out.push(value.replace(/\r?\n/g, ' '));
  } else if (Array.isArray(value)) {
    for (const item of value) jsonStrings(item, out);
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out.push(key);
      jsonStrings(item, out);
    }
  }
}

/**
 * Scan every text a bundle can put in front of the model. Keys are bundle
 * entry names. A `.json` entry is scanned over its DECODED string values
 * (so `ignore previous instructions` cannot hide behind JSON escapes);
 * JSON that does not parse is scanned as raw text.
 */
export function scanBundleForInjection(files: Record<string, string | undefined | null>): InjectionFinding[] {
  const findings: InjectionFinding[] = [];
  for (const [file, text] of Object.entries(files)) {
    if (typeof text !== 'string' || text.length === 0) continue;
    let scanned = text;
    if (file.toLowerCase().endsWith('.json')) {
      try {
        const values: string[] = [];
        jsonStrings(JSON.parse(text) as unknown, values);
        scanned = values.join('\n');
      } catch {
        scanned = text;
      }
    }
    findings.push(...scanTextForInjection(scanned, file));
  }
  return findings;
}

/** One line per finding, for logs and the import response's `error`. */
export function summariseInjectionFindings(findings: InjectionFinding[]): string {
  return findings.map((f) => `${f.file}:${f.line} ${f.label}`).join('; ');
}
