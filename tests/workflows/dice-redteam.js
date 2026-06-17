export const meta = {
  name: 'dice-redteam',
  description: 'Adversarial red-team of the backgammon commit-reveal dice protocol — find a real cheat',
  phases: [
    { title: 'Attack', detail: 'independent attackers each try a distinct break' },
    { title: 'Triage', detail: 'verify or refute each claimed exploit' },
  ],
}

const CTX = [
  'Target: the verifiable shared-randomness dice protocol for backgammon over a deterministic-replay move log.',
  'Read these in full:',
  '- src/comm/services/games/backgammon-dice.ts (the protocol + its header doc)',
  '- src/comm/__tests__/backgammon-dice.test.ts (the claimed properties)',
  '- src/comm/services/games/engine.ts + session.ts (how a game = engine + replayed move log; replay-validation is the anti-cheat; fromHash authenticates the sender)',
  '',
  'How it will be used: each backgammon move carries a DiceBundle {revealSelf, contributeNext, commitOwnNext}. dice[k]=sha256(sA[k]:sB[k]:k) rejection-sampled to 1..6. The mover commits H(s_M[k]) two turns ahead and reveals s_M[k] on its turn; the contributor injects a fresh blind secret one turn ahead. The engine will verify each turn via diceForTurn() during replay; an illegal/forged move is rejected exactly like other games. Both peers run the SAME deterministic code; there is no trusted server. A move only travels if the sender is the relay-authenticated opponent.',
  '',
  'Threat model: a malicious/MODIFIED client (one of the two players) wanting to (a) bias a roll toward a favourable outcome, (b) re-roll / grind for a better roll, (c) foresee future rolls, (d) equivocate (reveal a different secret than committed), (e) desync the two boards, or (f) exploit an implementation/crypto bug. Casual stakes-free game; the abort-by-stalling case (a player refusing to reveal) is a known LIVENESS limitation, NOT a finding unless it yields a fairness/bias advantage.',
].join('\n')

const FINDINGS_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['lens', 'findings'],
  properties: {
    lens: { type: 'string' },
    findings: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      required: ['id', 'title', 'attack', 'severity', 'isRealBreak', 'suggestedFix'],
      properties: {
        id: { type: 'string' }, title: { type: 'string' },
        attack: { type: 'string', description: 'the concrete attack/steps' },
        severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'nit'] },
        isRealBreak: { type: 'boolean', description: 'does it actually break fairness/binding/determinism given the code?' },
        suggestedFix: { type: 'string' },
        location: { type: 'string' },
      },
    } },
  },
}

const VERDICT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['findingId', 'verdict', 'reasoning'],
  properties: {
    findingId: { type: 'string' },
    verdict: { type: 'string', enum: ['confirmed-exploit', 'refuted', 'liveness-only', 'design-note'] },
    reasoning: { type: 'string' },
    severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'nit'] },
  },
}

const LENSES = [
  { key: 'bias-grind', prompt: 'You are a cryptographic-games attacker. LENS: roll BIAS + GRINDING. Try to make a roll come out favourably, or to re-roll until you get a good one. Consider: can the mover (who reveals last + sees the contributor secret first) substitute or choose its reveal? can the contributor (revealing blind) bias by trying many contributions? can either party grind their committed secret before committing? Be concrete with code references; isRealBreak only if it actually beats the binding.' },
  { key: 'foresight', prompt: 'You are a cryptographic-games attacker. LENS: FORESIGHT of future rolls. Can a player learn dice[k+1], dice[k+2], … before they must? Consider what each DiceBundle reveals, the pipelining schedule, and whether a committed hash + a contributed secret together leak a future roll early.' },
  { key: 'equivocate', prompt: 'You are a cryptographic-games attacker. LENS: COMMITMENT equivocation / binding. Can a player reveal a secret different from what they committed (sha256 second-preimage / collision / malleability)? Is the 16-byte secret space / commit format adequate? Can a malformed or duplicate bundle slip past diceForTurn / verifyCommit? Check the regex/shape guards.' },
  { key: 'desync', prompt: 'You are a cryptographic-games attacker. LENS: DESYNC / determinism. Can the two devices derive DIFFERENT dice or ledgers from the same move log (non-determinism, secret-order ambiguity, rejection-sampling divergence, number/string coercion, utf8 encoding, modulo/rounding)? Can a replay/out-of-order/duplicate move corrupt the ledger? Trace deriveDice + advanceLedger precisely.' },
  { key: 'impl-crypto', prompt: 'You are a cryptographic-games attacker + code auditor. LENS: IMPLEMENTATION + crypto misuse. Audit the actual code for bugs: randomBytes source/entropy, sha256 input construction (delimiter-injection between sA:sB:k — can two different (sA,sB,k) map to the same hash input string?), hex parsing, the rejection-sampling loop termination, Player typing, any throw path, mutation of shared state in advanceLedger. Find concrete defects.' },
]

phase('Attack')
log('Red-teaming the dice protocol across 5 attack lenses')
const reviewed = await pipeline(
  LENSES,
  function (l) { return agent(CTX + '\n\n' + l.prompt + '\n\nReturn lens=' + l.key + '. List every distinct attack you can construct; set isRealBreak honestly.', { label: 'attack:' + l.key, phase: 'Attack', schema: FINDINGS_SCHEMA }) },
  function (rev, l) {
    const fs = (rev && rev.findings) || []
    if (!fs.length) return []
    return parallel(fs.map(function (f) {
      return function () {
        return agent(CTX + '\n\nAdversarially adjudicate this claimed attack. READ the code yourself. Decide: confirmed-exploit (it really breaks fairness/binding/determinism), refuted (it does not, explain why), liveness-only (a stall/abort with no fairness gain), or design-note (true but acceptable/known). Be rigorous — do not rubber-stamp. Lens ' + l.key + '. Finding:\n' + JSON.stringify(f), { label: 'triage:' + f.id, phase: 'Triage', schema: VERDICT_SCHEMA })
          .then(function (v) { return { finding: f, lens: l.key, verdict: v } })
      }
    }))
  },
)

const all = reviewed.flat().filter(Boolean)
const exploits = all.filter(function (r) { return r.verdict && r.verdict.verdict === 'confirmed-exploit' })
const order = { critical: 0, high: 1, medium: 2, low: 3, nit: 4 }
exploits.sort(function (a, b) { return order[(a.verdict.severity || a.finding.severity)] - order[(b.verdict.severity || b.finding.severity)] })
log('Red-team done: ' + exploits.length + ' confirmed exploit(s) of ' + all.length + ' attacks tried')

return {
  confirmedExploits: exploits.map(function (r) { return { id: r.finding.id, lens: r.lens, severity: r.verdict.severity || r.finding.severity, title: r.finding.title, attack: r.finding.attack, location: r.finding.location, fix: r.finding.suggestedFix, why: r.verdict.reasoning } }),
  refutedOrAccepted: all.filter(function (r) { return !(r.verdict && r.verdict.verdict === 'confirmed-exploit') })
    .map(function (r) { return { id: r.finding.id, title: r.finding.title, verdict: r.verdict && r.verdict.verdict, why: r.verdict && r.verdict.reasoning } }),
}
