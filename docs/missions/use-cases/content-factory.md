# Content Factory

> **Template id:** `tmpl_content_factory_v1`
> **Status:** ✅ seeded (Phase 3)
> **Pillar:** Work · **Category:** marketing · **Author:** ANTON

---

## What it does

Take a topic and a brand voice; ANTON researches angles, drafts a long-form anchor (blog post / newsletter), repurposes it for short-form channels (Twitter, LinkedIn, Instagram), runs a brand-voice consistency pass, and generates a visual brief. v1 delivers the content bundle to your Mission Inbox for manual publishing. Direct CMS publish lands in v2 once the Service Pack is wired.

## Who it's for

- A founder running content single-handed who needs a repeatable batch process.
- A marketing lead at a small team replacing the "write once, repurpose by hand" loop.
- A consultant producing thought-leadership content for their book of business.

Not for: real-time / news-reactive content (this is batch-style); or content that requires direct platform API access (use a Service Pack-enabled mission once those are wired).

## The workflow

| # | Task | Type | Tokens (est.) | Notes |
|---|---|---|---|---|
| 1 | **Research the topic** | LLM | 6,000 | Angles, framings, supporting evidence, counter-arguments |
| 2 | **Draft long-form anchor** | LLM | 14,000 | Blog / newsletter at requested word count |
| 3 | **Checkpoint — review anchor** | checkpoint | 0 | Human gate before repurposing |
| 4 | **Repurpose for short-form channels** | analysis | 10,000 | Twitter thread, LinkedIn, Instagram, Threads |
| 5 | **Brand-voice consistency pass** | analysis | 5,000 | Scores every variant 1–5 across tone / vocabulary / forbidden phrases |
| 6 | **Visual brief** | LLM | 4,000 | Alt text + image prompts for hero / thumbnail / carousel |
| 7 | **Checkpoint — approve bundle** | checkpoint | 0 | Final human gate |
| 8 | **Deliver bundle** | notification | 0 | Mission Inbox delivery |

Total estimated active time: ~1 hour. Total elapsed (with checkpoints): up to 7 days.

## Inputs the user provides

| Input | Required | Notes |
|---|---|---|
| **Topic or angle** | yes | What the content is about. One paragraph. |
| **Brand voice + style** | yes | Tone, forbidden phrases, sentence-length preference, references |
| **Channels** | yes | Comma-separated: blog, twitter, linkedin, newsletter, instagram, threads. First listed is the long-form anchor. |
| **Target reader** | yes | Who this is for |
| **Anchor length** | yes | `short_600`, `standard_1200`, or `long_2200` words |

No credentials needed for v1.

## Outputs delivered

A content bundle (Markdown) containing:
1. Topic research brief
2. Long-form anchor (blog post or newsletter)
3. Channel-specific variants (one section per requested channel)
4. Brand-voice scorecard (1–5 across all variants)
5. Visual brief (alt text + image prompts)
6. Recommended next publishing steps

Delivered to Mission Inbox; pushed to email / Companion if those channels are enabled.

## Trust-phase compatibility

Designed for **trust phase 3+**. Both checkpoints are hard-coded — the human always reviews the anchor draft and the final bundle, regardless of phase.

## Budget

| Setting | Value |
|---|---|
| Token budget | 400,000 max |
| Time budget (elapsed) | 7 days |
| Time budget (active) | 1 hour |
| Default autonomy | `check_in` |

## Success criteria

1. On-brief for the supplied topic + audience
2. Covers every requested channel with channel-appropriate adaptation
3. Scores ≥ 4/5 on brand-voice consistency across all variants
4. Includes a usable visual brief

## A real example

Run this mission with:
- **Topic:** "Why mid-market banks should pilot local-first AI before their compliance team's next audit"
- **Brand voice:** Direct, founder-led, British English, no hedging. Forbidden: "leverage", "synergy", "robust".
- **Channels:** `blog,linkedin,twitter,newsletter`
- **Target reader:** Compliance officers at €5–50bn Nordic banks
- **Anchor length:** `standard_1200`

Expected output: ~1,200-word blog post, paired LinkedIn long-form, a 9-tweet thread, and a newsletter version — all scored against the brand voice and ready for human-driven publishing.

---

## Where to look

- **Code:** `server/services/missions/seed-templates.ts` (search `CONTENT_FACTORY_TEMPLATE`)
- **Catalogue UI:** `/missions/catalogue` → "Content Factory"
- **Roadmap:** v2 = Buffer / WordPress / Ghost Service Pack for direct publishing
