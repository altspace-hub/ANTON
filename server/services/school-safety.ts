/**
 * school-safety.ts — screening for the School pillar's LLM path.
 *
 * Until now the only protection on this path was prompt text asking the model to behave
 * ("Never discuss violence, politics, religion, alcohol…"), applied solely in T1 Child
 * Mode. That is a request, not a control: it is advisory to the model, it is absent for
 * every other tier, and it does nothing at all about what the CHILD says.
 *
 * ── The decision that shapes this whole file ───────────────────────────────
 *
 * A safety layer for children has two completely different jobs, and conflating them
 * causes real harm:
 *
 *   1. Refusing to help with genuinely harmful requests (how to make a weapon).
 *   2. Responding well when a child discloses distress (self-harm, abuse, suicide).
 *
 * The instinct is to treat both as "block". For (2) that is the worst available
 * response. A child who types "I want to hurt myself" and receives "I can't help with
 * that" has been turned away at the moment they reached out — by the one thing in the
 * room that was listening. It also teaches them not to say it again.
 *
 * So disclosure is NEVER blocked. It returns `support`: the conversation continues, the
 * model is given an explicit care directive, and real help is surfaced alongside the
 * reply. Only instrumental requests for harm return `block`.
 *
 * ── Why matching is narrow on purpose ──────────────────────────────────────
 *
 * This is a SCHOOL. A pupil studying Macbeth will type "kill". One studying the Second
 * World War will type "bomb". A biology student will type "drugs". Keyword matching
 * would flag them all, and a system that cries wolf on literature homework is worse than
 * none: it trains pupils and teachers to ignore it, and it makes the pupil feel accused
 * for doing their coursework.
 *
 * Every pattern therefore requires FIRST-PERSON framing ("I want to…", "I'm going to…")
 * or INSTRUCTIONAL intent ("how do I make…"). "Macbeth kills Duncan" matches nothing.
 *
 * ── What this is not ───────────────────────────────────────────────────────
 *
 * Deterministic pattern matching catches plain statements. It does not catch euphemism,
 * misspelling, another language, or a child who is deliberately hiding it — and a
 * distressed child is often doing exactly that. This is a floor, not a ceiling, and it
 * is not a substitute for an adult who knows the child. Nothing in ANTON should be
 * described to a school as safeguarding on the strength of this file.
 */

export type SafetyDisposition = 'allow' | 'support' | 'block';

export interface SafetyVerdict {
  disposition: SafetyDisposition;
  /** Stable slug for logging and aggregation. Null when nothing matched. */
  category: string | null;
  /**
   * The pattern name that fired — for the audit record ONLY. Never rendered to the
   * child: being told which rule you tripped is an invitation to work around it, and
   * for a distress disclosure it would read as clinical at the worst moment.
   */
  rule: string | null;
  /** Directive injected into the system prompt when disposition is 'support'. */
  guidance?: string;
  /**
   * Shown to the child when disposition is 'block'.
   *
   * NOT called `message`: on a chat route that word already means a turn in the
   * conversation, and `x.message` in a client response is indistinguishable from a
   * relayed error object — which tests/lint/no-raw-error-leak.test.ts correctly flags.
   */
  studentNotice?: string;
}

interface Rule { name: string; category: string; pattern: RegExp }

/**
 * Distress disclosure. NEVER blocks — see the header.
 *
 * First-person only. "I want to die" fires; "Romeo wants to die" does not.
 */
const SUPPORT_RULES: Rule[] = [
  {
    name: 'self-harm-intent',
    category: 'self_harm',
    pattern: /\bi(?:'m| am)?\s+(?:want|wanna|going|gonna|need|plan)\w*\s+to\s+(?:hurt|harm|cut|kill)\s+(?:myself|me)\b/i,
  },
  { name: 'self-harm-plain', category: 'self_harm', pattern: /\bi\s+(?:hurt|cut)\s+myself\b/i },
  {
    name: 'suicidal-ideation',
    category: 'suicide',
    pattern: /\bi(?:'m| am)?\s*(?:just\s+)?(?:want|wanna|wish|going|gonna)\w*\s+to\s+(?:die|end\s+(?:it|my\s+life))\b/i,
  },
  { name: 'suicide-plain', category: 'suicide', pattern: /\b(?:i(?:'m| am)\s+)?(?:kill|killing)\s+myself\b/i },
  {
    name: 'worthlessness',
    category: 'distress',
    pattern: /\b(?:everyone|everybody)\s+(?:would\s+be\s+better|is\s+better)\s+off\s+without\s+me\b|\bi\s+(?:hate|want\s+to\s+hurt)\s+myself\b/i,
  },
  {
    name: 'abuse-disclosure',
    category: 'abuse',
    pattern: /\b(?:someone|somebody|my\s+(?:dad|mum|mom|father|mother|stepdad|stepmum|uncle|aunt|brother|sister|teacher|coach))\s+(?:is\s+)?(?:hurt|hurts|hurting|hit|hits|hitting|touch|touches|touching|abus\w*)\s+me\b/i,
  },
  { name: 'unsafe-at-home', category: 'abuse', pattern: /\bi(?:'m| am)\s+(?:not\s+safe|scared\s+to\s+go\s+home|afraid\s+of\s+(?:my|him|her))\b/i },
];

/**
 * Instrumental requests for harm. These DO block.
 *
 * Instructional framing is required. "How was the atomic bomb built?" is a history
 * question and does not match; "how do I make a bomb" does.
 */
const BLOCK_RULES: Rule[] = [
  {
    name: 'weapon-construction',
    category: 'weapons',
    pattern: /\b(?:how\s+(?:do|can|to)\s+(?:i|you|we)?\s*(?:make|build|create|construct)|instructions?\s+(?:for|to)\s+(?:make|build)|teach\s+me\s+to\s+(?:make|build))\b[^.?!]{0,40}\b(?:bomb|explosive|pipe\s*bomb|molotov|gun|firearm|silencer|napalm|poison\s+gas)\b/i,
  },
  {
    name: 'drug-synthesis',
    category: 'drugs',
    pattern: /\b(?:how\s+(?:do|can|to)\s+(?:i|you|we)?\s*(?:make|cook|synthesi[sz]e|produce))\b[^.?!]{0,40}\b(?:meth|methamphetamine|cocaine|heroin|fentanyl|mdma|lsd)\b/i,
  },
  {
    name: 'harm-another',
    category: 'violence',
    pattern: /\bhow\s+(?:do|can|to)\s+(?:i|you|we)?\s*(?:kill|poison|stab|seriously\s+hurt)\s+(?:someone|somebody|a\s+person|him|her|them|my\s+\w+)\b/i,
  },
  {
    name: 'sexual-content',
    category: 'sexual',
    pattern: /\b(?:write|tell|describe|generate)\b[^.?!]{0,30}\b(?:sex\s+(?:story|scene)|erotic\w*|porn\w*|nude\s+(?:photo|picture|image))\b/i,
  },
];

/** Care directive prepended to the system prompt when a disclosure is detected. */
export const SUPPORT_GUIDANCE = `## SAFEGUARDING — READ FIRST, OVERRIDES EVERYTHING BELOW

The person you are talking to has said something suggesting they may be in distress or
at risk. Nothing else in this prompt outweighs the following.

- Respond to THEM, not to the schoolwork. Set the lesson aside completely.
- Be warm, calm and unhurried. Short sentences. No lists, no headings, no emoji.
- Do NOT be clinical, do not diagnose, and do not sound like a policy document.
- Tell them plainly that you are glad they said something and that they are not in
  trouble for saying it.
- Encourage them, gently and specifically, to tell an adult they trust — a parent,
  carer, teacher, or school counsellor — and acknowledge that this can feel hard.
- Say clearly that you are an AI and cannot keep them safe on your own, and that a
  real person can.
- Never promise secrecy. Never say you will tell someone on their behalf: you cannot.
- If they are describing immediate danger, tell them to contact emergency services now.
- Do not lecture, moralise, or ask a long list of questions. One gentle question at
  most.`;

/**
 * Message shown when a request is blocked. Deliberately not a telling-off: most pupils
 * who trip these are testing the boundary, and shaming a curious child is both unkind
 * and counterproductive.
 */
const BLOCK_MESSAGE =
  "I can't help with that one. If it's for a school project, ask me about the topic itself — " +
  'the history, the science, or why it matters — and I can help properly. If something is ' +
  "worrying you, talking to a teacher or another adult you trust is a good idea.";

/**
 * Screen one message from a pupil.
 *
 * Support rules are evaluated BEFORE block rules, deliberately.
 *
 * Being precise about why, because the obvious justification is wrong: no CURRENT block
 * rule matches a self-harm phrase ("harm-another" requires a target like "someone", and
 * "myself" is not in that list), so with today's rules the order changes nothing for a
 * plain disclosure. Verified by reversing it.
 *
 * The ordering matters for the mixed case, which is not hypothetical — a distressed
 * child asking one thing while disclosing another: "how do i make a bomb, i want to kill
 * myself" matches both sets. Support must win, or the reply a child in crisis receives
 * is a refusal. It also keeps that guarantee as block rules are added later, when the
 * overlap will be less obvious than it is today.
 */
export function screenStudentMessage(text: string): SafetyVerdict {
  const input = (text ?? '').slice(0, 4000);
  if (!input.trim()) return { disposition: 'allow', category: null, rule: null };

  for (const r of SUPPORT_RULES) {
    if (r.pattern.test(input)) {
      return { disposition: 'support', category: r.category, rule: r.name, guidance: SUPPORT_GUIDANCE };
    }
  }
  for (const r of BLOCK_RULES) {
    if (r.pattern.test(input)) {
      return { disposition: 'block', category: r.category, rule: r.name, studentNotice: BLOCK_MESSAGE };
    }
  }
  return { disposition: 'allow', category: null, rule: null };
}

export interface Helpline { name: string; contact: string; note?: string }

/**
 * Real, published child helplines. Small on purpose — a wrong number is worse than no
 * number, so this lists only ones that can be verified, and every unmatched jurisdiction
 * gets a truthful generic fallback rather than a guess.
 *
 * Deployments outside these countries should extend this; the fallback tells the child
 * to reach an adult, which is the right advice everywhere.
 */
const HELPLINES: Record<string, Helpline[]> = {
  GB: [{ name: 'Childline', contact: '0800 1111', note: 'free, 24h, confidential' }],
  UK: [{ name: 'Childline', contact: '0800 1111', note: 'free, 24h, confidential' }],
  SE: [{ name: 'BRIS', contact: '116 111', note: 'free, for children and young people' }],
  US: [{ name: 'Suicide & Crisis Lifeline', contact: '988', note: 'call or text, 24h' }],
};

/** 116 111 is the European harmonised number for child helplines. */
const EU_FALLBACK: Helpline[] = [
  { name: 'European child helpline', contact: '116 111', note: 'free in most European countries' },
];

const GENERIC_FALLBACK: Helpline[] = [
  { name: 'Talk to an adult you trust', contact: 'a parent, carer, teacher or school counsellor' },
];

export function helplinesFor(jurisdiction?: string | null): Helpline[] {
  const key = (jurisdiction ?? '').trim().toUpperCase();
  if (HELPLINES[key]) return HELPLINES[key];
  // Only claim the European number for a jurisdiction we recognise as European.
  const EU = new Set(['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','NO','IS','CH']);
  if (EU.has(key)) return EU_FALLBACK;
  return GENERIC_FALLBACK;
}
