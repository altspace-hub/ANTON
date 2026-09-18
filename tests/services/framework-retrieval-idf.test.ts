/**
 * framework-retrieval-idf.test.ts — Wave 1 (2026-09-17), track F: retrieval
 * precision for framework article grounding.
 *
 * The defect these tests pin: `scoreArticles()` counted every query term as
 * worth the same, so on a short query the generic regulatory vocabulary
 * ("system", "provider", "market", "risk") — which sits in a large share of the
 * articles of any framework and therefore carries no discriminative power — was
 * most of the signal. With `branding`, `marketing`, `comms-pr` and seven other
 * areas newly able to reach framework text (see area-frameworks.test.ts), that
 * is how a copywriting brief pulled EU AI Act Art.47 (EU declaration of
 * conformity) and Art.22 (authorised representatives).
 *
 * Scoring is exercised through `retrieveGroundingText` against a temp
 * `frameworksDir` rather than by exporting the private scorer: `frameworksDir`
 * is the injection point the service already offers, and the fixtures make the
 * document frequencies exact, which the 60 real framework files cannot.
 * `tests/services/framework-grounding-area-seed.test.ts` covers the real corpus.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import {
  retrieveGroundingText,
  foldPlural,
  resetFrameworkIndexForTests,
} from '../../server/services/framework-text-retrieval.js';
import { frameworksForArea } from '../../server/services/area-frameworks.js';

let dir = '';

/**
 * 14 articles in which "system" and "provider" appear in all but one (document
 * frequency 13/14 → weight 0.03) while "watermarking", "catalogue" and "logs"
 * appear in one each (weight 1.0). Any scorer that counts terms flat cannot tell
 * those two classes of word apart.
 *
 * Art.13 and Art.14 were added by Wave 1H and carry the only `aliases` in the
 * fixture; Art.1-Art.12 are track F's originals, unchanged, so the pre-alias
 * assertions still say what they said.
 */
const FIXTURE = {
  id: 'idf-fixture',
  name: 'Fixture Regulation on Systems',
  shortName: 'IDFX',
  reference: 'Regulation (EU) 9999/1',
  articles: [
    { id: 'Art.1', title: 'Subject matter', requirement: 'This system lays down rules for every provider of a system placed on the market.' },
    { id: 'Art.2', title: 'Scope', requirement: 'Applies to any provider of a system and to any system deployed in the Union.' },
    { id: 'Art.3', title: 'Definitions', requirement: 'For the purposes of this system, provider means the natural or legal person concerned.' },
    { id: 'Art.4', title: 'General principles', requirement: 'A provider shall operate the system in accordance with the general principles.' },
    { id: 'Art.5', title: 'Watermarking of synthetic output', requirement: 'A provider of a system that produces synthetic material shall apply watermarking so the recipient is informed.' },
    { id: 'Art.6', title: 'Conformity', requirement: 'The provider shall draw up a declaration before the system is placed on the market.' },
    { id: 'Art.7', title: 'Governance', requirement: 'The provider shall put in place a governance arrangement covering the system.' },
    // Art.8 before Art.9 on purpose: the BODY hit is the earlier array entry, so
    // a tie would resolve to Art.8 and the title-hit assertion below can only
    // pass because of the title bonus. (It did not, the first time: both scored
    // identically and the stable sort answered for it. Verified by removing the
    // bonus and watching the test go red.)
    { id: 'Art.8', title: 'Miscellaneous', requirement: 'Where a provider operates a system, record keeping under this Chapter continues to apply.' },
    { id: 'Art.9', title: 'Record keeping', requirement: 'A provider shall document how the system was operated.' },
    { id: 'Art.10', title: 'Catalogue of approved bodies', requirement: 'The Commission shall maintain a catalogue naming every provider and system assessed.' },
    { id: 'Art.11', title: 'Automatically generated logs', requirement: 'A provider shall retain the logs its system produces for six months.' },
    { id: 'Art.12', title: 'IDFX transitional provisions', requirement: 'A provider whose system was placed before the date of application benefits from the transition.' },
    // ── Wave 1H (aliases) ───────────────────────────────────────────────────
    // Art.13 is the track-H defect in miniature: the article a practitioner
    // wants, written in vocabulary the practitioner does not use. Its sentence
    // says "material produced without human authorship"; nobody types that. It
    // is reachable ONLY through its aliases, which is what makes the alias
    // assertions below unable to pass for any other reason.
    {
      id: 'Art.13',
      title: 'Marking of material produced without human authorship',
      requirement: 'A provider shall ensure that material produced without human authorship is identifiable to the recipient.',
      aliases: ['chatbot', 'AI-generated', 'watermark'],
    },
    // Art.14 carries an alias that is ALREADY ubiquitous in the document, to
    // pin that an alias is weighted like any other term and cannot buy its way
    // past the mass gate.
    {
      id: 'Art.14',
      title: 'Final provisions',
      requirement: 'This Chapter enters into force on the twentieth day.',
      aliases: ['system'],
    },
    // Art.15 is LAST on purpose and its distinctive word ("deepfake") is in its
    // TITLE, while Art.13's equally distinctive word ("watermark") is an ALIAS
    // and sits earlier. A stable sort resolves a tie to the earlier entry, so
    // "Art.15 first" can only be true if the title bonus applies and the alias
    // bonus does not. (Track F was bitten by exactly this: a title-bonus test
    // that the stable sort was answering for.)
    {
      id: 'Art.15',
      title: 'Deepfake notices',
      requirement: 'A provider shall publish a notice describing the concerned material.',
    },
  ],
};

/**
 * A second framework in which "system" is rare (1 of 10) — the same word,
 * the opposite weight. Document frequency is a property of the document.
 */
const NARROW = {
  id: 'sysx-fixture',
  name: 'Fixture Code on Procurement',
  shortName: 'SYSX',
  reference: 'Code 9999/2',
  articles: [
    { id: 'S.1', title: 'Purpose', requirement: 'Sets out how a contracting authority buys goods.' },
    { id: 'S.2', title: 'Tender notice', requirement: 'A notice shall be published before the procedure opens.' },
    { id: 'S.3', title: 'Award criteria', requirement: 'Criteria shall be disclosed to every candidate in advance.' },
    { id: 'S.4', title: 'Evaluation', requirement: 'Bids shall be evaluated against the disclosed criteria.' },
    { id: 'S.5', title: 'Standstill', requirement: 'A standstill period follows the award decision.' },
    { id: 'S.6', title: 'Remedies', requirement: 'An aggrieved bidder may seek review of the award decision.' },
    { id: 'S.7', title: 'Framework agreements', requirement: 'An agreement may be concluded for a maximum of four years.' },
    { id: 'S.8', title: 'Electronic system for tendering', requirement: 'Submissions shall be made through the electronic system designated for that purpose.' },
    { id: 'S.9', title: 'Record of the procedure', requirement: 'The authority shall keep a written record of the procedure.' },
    { id: 'S.10', title: 'Transparency', requirement: 'Awarded contracts shall be published.' },
  ],
};

function articleIds(r: { sources: Array<{ articleId?: string }> } | null): string[] {
  return (r?.sources ?? []).filter((s) => s.articleId).map((s) => s.articleId as string);
}

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'anton-idf-'));
  await fs.writeFile(path.join(dir, 'idf-fixture.json'), JSON.stringify(FIXTURE), 'utf8');
  await fs.writeFile(path.join(dir, 'sysx-fixture.json'), JSON.stringify(NARROW), 'utf8');
  resetFrameworkIndexForTests();
});

afterAll(async () => {
  resetFrameworkIndexForTests();
  await fs.rm(dir, { recursive: true, force: true });
});

describe('IDF weighting — a ubiquitous term is not evidence', () => {
  it('a query made only of words that appear in every article grounds nothing', async () => {
    // "system" and "provider" are in 12 of 12 articles. Under the old flat
    // count this cleared the `overlap >= 2` gate in every one of them and
    // injected the whole framework; weighted, it carries no information.
    const r = await retrieveGroundingText({
      query: 'system provider',
      frameworkIds: ['idf-fixture'],
      frameworksDir: dir,
    });
    expect(articleIds(r)).toEqual([]);
  });

  it('one distinctive term selects one article where two ubiquitous ones selected all twelve', async () => {
    // Flat counting gives every article of this framework an overlap of 2 from
    // "system" + "provider" alone, so the old scorer returned all twelve and
    // spent the whole budget on them. Weighted, those two words are worth
    // nothing and only the article that actually says "watermarking" survives.
    const r = await retrieveGroundingText({
      query: 'IDFX system provider watermarking',
      frameworksDir: dir,
    });
    expect(articleIds(r)).toEqual(['Art.5']);
  });

  it('document frequency is per framework — the same word weighs differently in two of them', async () => {
    // "system" is in 12/12 articles of IDFX and in 1/10 of SYSX. Both
    // frameworks are named, so both are strong candidates and the only thing
    // separating them is the weight of that one word.
    const r = await retrieveGroundingText({
      query: 'IDFX SYSX electronic system',
      frameworksDir: dir,
    });
    expect(r).not.toBeNull();
    expect(r!.sources.filter((s) => s.articleId).every((s) => s.frameworkId === 'sysx-fixture')).toBe(true);
    expect(articleIds(r)).toContain('S.8');
  });
});

describe('the overrides that must survive weighting', () => {
  it('an exact article number still wins outright, with no term overlap at all', async () => {
    // Art.3 (Definitions) shares nothing with "transitional catalogue" — only
    // the +1000 article-number override can put it first.
    const r = await retrieveGroundingText({
      query: 'IDFX Art.3 please',
      frameworksDir: dir,
    });
    expect(articleIds(r)[0]).toBe('Art.3');
  });

  it('a title hit still beats the same words in a body', async () => {
    // Art.9 has "Record keeping" as its title; Art.8 has the same two words in
    // its requirement and sits EARLIER in the file, so the weighted mass is
    // identical and only the title bonus can put Art.9 first.
    const r = await retrieveGroundingText({
      query: 'IDFX record keeping',
      frameworksDir: dir,
    });
    const ids = articleIds(r);
    expect(ids).toContain('Art.8');
    expect(ids).toContain('Art.9');
    expect(ids.indexOf('Art.9')).toBeLessThan(ids.indexOf('Art.8'));
  });
});

describe('word matching, not substring matching', () => {
  it('"log" no longer matches "catalogue"', async () => {
    const r = await retrieveGroundingText({ query: 'IDFX log', frameworksDir: dir });
    expect(articleIds(r)).not.toContain('Art.10');
  });

  it('…but "log" still reaches an article about "logs"', async () => {
    const r = await retrieveGroundingText({ query: 'IDFX log retention', frameworksDir: dir });
    expect(articleIds(r)).toContain('Art.11');
  });

  it('foldPlural normalises the regular plural and leaves the traps alone', () => {
    expect(foldPlural('logs')).toBe('log');
    expect(foldPlural('providers')).toBe('provider');
    expect(foldPlural('policies')).toBe('policy');
    expect(foldPlural('breaches')).toBe('breach');
    // -ss / -us / -is must survive intact or they collide with real words
    expect(foldPlural('business')).toBe('business');
    expect(foldPlural('status')).toBe('status');
    expect(foldPlural('analysis')).toBe('analysis');
    expect(foldPlural('bias')).toBe('bias');
  });

  it('foldPlural is idempotent and meets the singular of every pair it folds', () => {
    // The fold is only useful if BOTH sides of a pair land on the same key, and
    // only safe if folding an already-folded word changes nothing.
    for (const [plural, singular] of [
      ['logs', 'log'], ['records', 'record'], ['policies', 'policy'],
      ['breaches', 'breach'], ['cases', 'case'], ['processes', 'process'],
      ['biases', 'bias'], ['areas', 'area'], ['risks', 'risk'],
    ] as Array<[string, string]>) {
      expect(foldPlural(plural), `${plural} → ${singular}`).toBe(foldPlural(singular));
      expect(foldPlural(foldPlural(plural)), `${plural} idempotent`).toBe(foldPlural(plural));
    }
  });
});

describe('the framework’s own acronym identifies the document, not an article', () => {
  it('naming the framework does not pull the article that happens to mention it', async () => {
    // Art.12's title is "IDFX transitional provisions". Under the old scorer a
    // title hit on the acronym was enough on its own; weighted it would be the
    // rarest word in the document and so the strongest — which is exactly why
    // it is discounted to zero.
    const r = await retrieveGroundingText({ query: 'IDFX', frameworksDir: dir });
    expect(articleIds(r)).not.toContain('Art.12');
  });
});

describe('the gate: weight for a named framework, weight AND corroboration for a guessed one', () => {
  it('one distinctive term is enough when the user named the framework', async () => {
    const r = await retrieveGroundingText({ query: 'IDFX watermarking', frameworksDir: dir });
    expect(articleIds(r)).toEqual(['Art.5']);
  });

  it('…and is not enough when only the area map offered it', async () => {
    const r = await retrieveGroundingText({
      query: 'watermarking',
      frameworkIds: ['idf-fixture'],
      frameworksDir: dir,
    });
    expect(r).toBeNull();
  });

  it('two corroborating distinctive terms do ground a weak-scope framework', async () => {
    const r = await retrieveGroundingText({
      query: 'watermarking synthetic',
      frameworkIds: ['idf-fixture'],
      frameworksDir: dir,
    });
    expect(articleIds(r)).toEqual(['Art.5']);
  });
});

/**
 * Wave 1H — per-article `aliases`.
 *
 * The defect these pin is not in the scorer at all: data/frameworks/*.json holds
 * roughly one summary sentence per article, and that sentence often contains
 * none of the vocabulary a practitioner types. EU AI Act Art.50 is the measured
 * case — the transparency obligation that binds a marketer, whose stored text
 * has no "marketing", "chatbot", "label" or "disclosure" in it. No re-weighting
 * can select an article with zero term overlap, and the obvious alternative
 * (stemming "generated" → "generate") also maps "marketing" → "market" and
 * would put back the "placing on the market" false positives Wave 1F removed.
 *
 * Art.13 of the fixture is that situation in miniature: "material produced
 * without human authorship", reachable only through its aliases.
 */
describe('aliases — the words a practitioner types, which the summary sentence lacks', () => {
  it('an alias selects an article that the body text alone could never reach', async () => {
    // "chatbot" appears in no title and no requirement anywhere in the fixture.
    // The ONLY route from this query to Art.13 is its alias list.
    const r = await retrieveGroundingText({ query: 'IDFX chatbot', frameworksDir: dir });
    expect(articleIds(r)).toEqual(['Art.13']);
  });

  it('the same query finds nothing when the alias is the only thing removed', async () => {
    // A negative control kept in the suite rather than only run by hand: the
    // identical article, identical title, identical requirement, no aliases.
    const noAliasDir = await fs.mkdtemp(path.join(os.tmpdir(), 'anton-idf-noalias-'));
    try {
      const stripped = {
        ...FIXTURE,
        articles: FIXTURE.articles.map((a) => {
          const copy: Record<string, unknown> = { ...a };
          delete copy.aliases;
          return copy;
        }),
      };
      await fs.writeFile(path.join(noAliasDir, 'idf-fixture.json'), JSON.stringify(stripped), 'utf8');
      resetFrameworkIndexForTests();
      const r = await retrieveGroundingText({ query: 'IDFX chatbot', frameworksDir: noAliasDir });
      expect(articleIds(r)).toEqual([]);
    } finally {
      await fs.rm(noAliasDir, { recursive: true, force: true });
      resetFrameworkIndexForTests();
    }
  });

  it('a hyphenated alias also matches its parts, so "AI-generated" is reachable as "generated"', async () => {
    // This is the whole reason aliases are a data fix and not a stemming rule:
    // the surface forms that matter are enumerated per article, so "generated"
    // reaches Art.13 without any global rule that would also fold
    // "marketing" → "market".
    const r = await retrieveGroundingText({ query: 'IDFX generated material', frameworksDir: dir });
    expect(articleIds(r)).toContain('Art.13');
  });

  it('an alias does not bypass the weighted-mass gate', async () => {
    // Art.14's alias is "system", which sits in 13 of the 14 articles and so
    // weighs ~0.03. An alias that is not discriminative buys nothing, exactly
    // like a body word that is not discriminative.
    const r = await retrieveGroundingText({ query: 'IDFX system', frameworksDir: dir });
    expect(articleIds(r)).not.toContain('Art.14');
  });

  it('an alias does not bypass the weak-scope corroboration floor either', async () => {
    // One alias hit, framework not named — still blocked, like any single term.
    const weak = await retrieveGroundingText({
      query: 'chatbot', frameworkIds: ['idf-fixture'], frameworksDir: dir,
    });
    expect(articleIds(weak)).toEqual([]);
    // …and two hits (one alias, one body word) do clear it.
    const both = await retrieveGroundingText({
      query: 'chatbot authorship', frameworkIds: ['idf-fixture'], frameworksDir: dir,
    });
    expect(articleIds(both)).toEqual(['Art.13']);
  });

  it('an alias scores like a body hit, not like a title hit', async () => {
    // "watermark" reaches Art.13 only through its alias list.
    const r = await retrieveGroundingText({ query: 'IDFX watermark', frameworksDir: dir });
    expect(articleIds(r)).toEqual(['Art.13']);
    // Now the discriminating part. "watermark" (Art.13, ALIAS) and "deepfake"
    // (Art.15, TITLE) both appear in exactly one article, so both weigh 1.0 and
    // the two articles carry identical mass. Art.13 comes first in the file, so
    // a tie resolves to Art.13. Art.15 can only lead if the title bonus is real
    // and the alias does NOT earn one.
    const mixed = await retrieveGroundingText({ query: 'IDFX watermark deepfake', frameworksDir: dir });
    const ids = articleIds(mixed);
    expect(ids).toContain('Art.13');
    expect(ids).toContain('Art.15');
    expect(ids.indexOf('Art.15')).toBeLessThan(ids.indexOf('Art.13'));
  });

  it('a framework file with no alias field anywhere still loads and behaves exactly as before', async () => {
    // SYSX (10 articles, no `aliases` key on any of them) must be byte-for-byte
    // the same retrieval it was before the field existed.
    const r = await retrieveGroundingText({ query: 'SYSX electronic tendering', frameworksDir: dir });
    expect(articleIds(r)).toContain('S.8');
    expect(r!.sources.every((s) => s.frameworkId === 'sysx-fixture')).toBe(true);
  });

  it('a malformed aliases field is normalised away rather than thrown on', async () => {
    // These files are hand-authored across 60 documents and also feed the Gap
    // Assessor, so the loader must survive a string where an array belongs and
    // a number inside one.
    const oddDir = await fs.mkdtemp(path.join(os.tmpdir(), 'anton-idf-odd-'));
    try {
      const odd = {
        id: 'odd-fixture', name: 'Odd Fixture', shortName: 'ODDX',
        articles: [
          { id: 'O.1', title: 'Alpha', requirement: 'Concerns the alpha procedure.', aliases: 'not-an-array' },
          { id: 'O.2', title: 'Beta', requirement: 'Concerns the beta procedure.', aliases: [42, null, 'bravocharlie', '  '] },
        ],
      };
      await fs.writeFile(path.join(oddDir, 'odd-fixture.json'), JSON.stringify(odd), 'utf8');
      resetFrameworkIndexForTests();
      const bad = await retrieveGroundingText({ query: 'ODDX not-an-array', frameworksDir: oddDir });
      expect(articleIds(bad)).toEqual([]);
      const good = await retrieveGroundingText({ query: 'ODDX bravocharlie', frameworksDir: oddDir });
      expect(articleIds(good)).toEqual(['O.2']);
    } finally {
      await fs.rm(oddDir, { recursive: true, force: true });
      resetFrameworkIndexForTests();
    }
  });
});

/**
 * The two measured failures from the brief, against the REAL corpus. These are
 * the only assertions here that read data/frameworks, and they are deliberately
 * about reachability (is the article there at all), not about rank.
 */
describe('the real corpus: the two articles the brief measured as unreachable', () => {
  it('EU AI Act Art.50 reaches a branding/marketing copy brief', async () => {
    resetFrameworkIndexForTests();
    const r = await retrieveGroundingText({
      query: 'Copywriting Assistant write marketing copy for a new AI system we are placing on the market',
      frameworkIds: frameworksForArea('branding'),
      tokenBudget: 3000,
    });
    expect(articleIds(r)).toContain('Art.50');
    expect(r!.sources.some((s) => s.frameworkId === 'eu-ai-act-2024' && s.articleId === 'Art.50')).toBe(true);
  });

  it('GDPR Art.32 reaches a health-data safeguards question', async () => {
    resetFrameworkIndexForTests();
    const r = await retrieveGroundingText({
      query: 'Healthcare GDPR Compliance Assess lawful basis and safeguards for processing patient health records',
      frameworkIds: frameworksForArea('healthcare'),
      tokenBudget: 3000,
    });
    expect(r!.sources.some((s) => s.frameworkId === 'gdpr-2016' && s.articleId === 'Art.32')).toBe(true);
  });

  it('the marketing alias does not drag Art.50 into a query with no AI in it', async () => {
    // "Write website copy for our new savings product launch" never mentions AI.
    // Silence is the right answer and the aliases must not change that.
    resetFrameworkIndexForTests();
    const r = await retrieveGroundingText({
      query: 'Copywriting Assistant Write website copy for our new savings product launch',
      frameworkIds: frameworksForArea('branding'),
      tokenBudget: 3000,
    });
    expect((r?.sources ?? []).filter((s) => s.articleId)).toHaveLength(0);
  });
});
