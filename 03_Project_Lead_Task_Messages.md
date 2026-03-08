# Project Lead Task Messages
## ICA Banken AML Maturity & AMLA Readiness — ADV-2025-FCP-0142
**Sender:** Max Krackhardt, Engagement Manager  
**Format:** Teams messages / email instructions to team (as sent during the engagement)

---

## TASK MESSAGE 1
**To:** Sofia Stenius-Linna  
**Channel:** Teams — ICA-AML Project  
**Date:** Monday 10 March, 09:14  
**Subject:** KYC refresh backlog — first pass by Wednesday

---

Sofia,

Good kick-off this morning. Before we start the formal gap work, I want to get a clear picture of the KYC backlog situation — it's the most concrete and press-able finding we already know exists before we've even started.

Can you do the following by Wednesday EOD:

1. Read through the BWRA Section 2.2 (Customer risk) and the AML/KYC Policy Section 4.2 (Ongoing CDD). Pull out everything they say about the refresh backlog, the target intervals, and the current actuals.

2. Based on those documents, write me a one-page summary answering: *What is the gap, how large is it, and what does ICA Banken say they are doing about it?*

3. Identify the three most important questions we need to ask their Head of Compliance Operations when we meet them Thursday. Think about root cause — we need to know whether this is a capacity problem, a system problem, or a prioritisation problem. The answer changes the remediation recommendation completely.

Don't go deep into the technical review yet — this is just framing so we know what we're walking into Thursday.

Drop it in the Phase 1 working papers folder when done.

/Max

---

## TASK MESSAGE 2
**To:** Björn Heir  
**Channel:** Teams — ICA-AML Project  
**Date:** Tuesday 11 March, 11:32  
**Subject:** TM rules — let's start with the crypto gap

---

Björn,

The one area I want us to front-load in the TM review is crypto. The TM Policy (Section 7.3) explicitly flags crypto-related typology coverage as a known gap — they want to lower the threshold on CASH-004 from SEK 25,000 to SEK 10,000 and add a new rule for crypto ATM structuring. That's actually pretty useful because it shows they've already self-identified the problem, which makes our job of validating and prioritising it easier.

What I'd like from you this week:

1. Pull the current CASH-004 rule definition from the TM Policy. Map it against FATF's latest guidance on virtual asset typologies (the 2023 update to Recommendation 16 / Travel Rule is the key reference). What's missing?

2. Based on your knowledge of Nordic AML typologies, what 2–3 additional crypto-related TM rules would you recommend they add? Keep it practical — we need things that Actimize can actually implement without a major rebuild.

3. One paragraph on the EU AI Act angle for their ML-based Crypto-Asset Risk model (model #4 in TM Policy §5). If that model is classifying transactions, it almost certainly falls under the AI Act's high-risk AI definition. What does that mean for their documentation and governance requirements?

I want this to be a strong, concrete finding — not just "you should monitor crypto more." We're recommending specific rule logic and an implementation timeline.

Ping me if you need to talk it through.

/Max

---

## TASK MESSAGE 3
**To:** Petra Andrésdottir  
**Channel:** Teams — ICA-AML Project  
**Date:** Wednesday 12 March, 08:55  
**Subject:** AMLA supervision brief — Board-ready by end of next week

---

Petra,

Jonas wants a crisp Board-level briefing note ready for when we present Phase 2. The specific question is: *Will AMLA directly supervise ICA Banken, and what does that mean for how they should prepare?*

Your job is to produce the research that answers this clearly enough that a Board member who knows nothing about AMLA can read it in 2 minutes and know exactly where ICA Banken stands.

Here's what I need:

1. Go through the AMLR draft (Q4 2024 trilogue text — it's in our knowledge base under Regulatory Research/AMLA). Find the articles that define the criteria for direct AMLA supervision. Note the exact article numbers.

2. Map ICA Banken's profile against those criteria. You have what you need in the ICA Banken Business Overview (doc 01 in their folder) and the BWRA. Key facts: domestic-only, SEK 68.4 billion total assets, 1.82M customers, Swedish licence only.

3. Conclusion: in scope / out of scope / borderline. If borderline, what would push them over the threshold?

4. One paragraph on what changes for ICA Banken under indirect supervision via Finansinspektionen (which is the likely scenario) — how does the FI's role change when AMLA is running the show at EU level?

Keep it to one page maximum. No footnotes — if you want to cite sources, put the article numbers in brackets inline. Jonas will use this directly in the Board deck.

/Max

---

## TASK MESSAGE 4
**To:** Full team (Björn, Sofia, Petra)  
**Channel:** Teams — ICA-AML Project  
**Date:** Thursday 13 March, 17:22  
**Subject:** Meeting notes from today + actions

---

Team,

Good session with ICA Banken today. Here's what I need from each of you based on what came out of the conversations.

**Björn:**
The Head of Financial Crime mentioned that their Actimize alert-to-STR conversion rate (1.34%) actually *increased* from 0.9% last year. He said it's because they added the mule account rule (VEL-009) in Q3 2024 and it's generating more genuine escalations. That's a useful data point but I want us to validate it. When you get the full alert data from them (DRL item 6), cross-reference the VEL-009 alerts specifically — what % are being escalated vs. dismissed? If it really is finding mule accounts that convert to STRs, that's a best practice worth calling out in the report. If the rule is noisy but the *overall* STR rate went up for other reasons, that's a different story.

**Sofia:**
The Head of Compliance Operations confirmed the KYC refresh backlog is a capacity problem more than a system problem — they know who needs refreshing, they just don't have enough analysts to get through the volume at medium-risk customers. She mentioned they've been piloting a "light refresh" process for lower-medium risk customers (basically automated re-screening without a full questionnaire). Ask her for the written description of that process before next Thursday — I want to assess whether that approach is defensible under the AML Act or whether it creates a compliance risk of its own.

**Petra:**
The Compliance team mentioned that the FI came back with some informal comments after last year's AML supervisory dialogue — apparently they highlighted that ICA Banken's PEP source-of-wealth documentation for foreign PEPs was "thin." That's not in any of the documents we've received. Ask the CCO's office if there's a written record of that feedback (letter, meeting minutes, or internal note). If FI have raised this as a concern, it elevates the PEP finding from medium to high priority in our report.

I'll send out the updated project tracker tomorrow morning.

Max

---

## TASK MESSAGE 5
**To:** Sofia Stenius-Linna  
**Channel:** Teams — ICA-AML Project  
**Date:** Monday 17 March, 10:05  
**Subject:** PEP policy — I need a plain-language summary for the report

---

Sofia,

One thing I've noticed is that ICA Banken's PEP Policy (doc 07) is actually very well-structured — it covers domestic, foreign, and former PEPs properly, it has the right EDD triggers, and the senior management approval matrix is clear. But I want to know whether they're actually *doing* what the policy says, not just whether the policy looks good.

Can you prepare a short testing note — no more than 2 pages — structured as follows:

**What the PEP Policy says (summary)**
Pull the 4–5 most important requirements from the policy — things like: annual review for all PEPs, CEO approval for foreign PEPs, source of wealth documentation for all EDD cases.

**What we should test to verify compliance**
For each requirement above: what question would we ask, what document or record would we request to verify it? Think of this as the test plan for a mini-audit.

**Red flags from what we know already**
FI apparently flagged thin source-of-wealth documentation for foreign PEPs (see my Thursday message). If that's confirmed, what does it mean for the policy-vs-practice gap? Write 3–4 sentences on the risk implication.

This will feed directly into the Phase 1 report Chapter 3 (EDD process findings). We present to CCO in 3 weeks so I want this done by Wednesday.

/Max

---

## TASK MESSAGE 6
**To:** Björn Heir  
**Channel:** Teams — ICA-AML Project  
**Date:** Tuesday 18 March, 14:17  
**Subject:** Russia sanctions — needs its own section in the report

---

Björn,

After re-reading the Sanctions Policy (doc 06), I think the Russia section (§8) deserves its own standalone section in the Phase 1 report. Here's why: the EU Russia sanctions framework has been updated 14 times since February 2022, and ICA Banken's policy just says "quarterly review." I want to know if their quarterly reviews have kept pace with the updates.

Please do the following:

1. List the major EU Russia sanctions packages that were issued since ICA Banken's current Sanctions Policy version date (v3.1, January 2025). You're looking for anything that added new categories of prohibited services, new designated individuals, or new sectoral restrictions that would be relevant to a retail bank.

2. Cross-check the ICA Banken Sanctions Policy §4.1 country list. Is Russia listed as Category 1 — Comprehensive Sanctions? It should be. If yes, does the policy cover all the key sectoral restrictions (financial services, SWIFT, correspondent banking)?

3. The policy says 23 accounts were closed following the 2022 review. We should flag that this number feels low for a retail bank with 1.82 million customers. Write 2–3 sentences on why this might be a reasonable number (most Russian nationals in Sweden are long-term residents with legitimate ties) or a concern (did the review miss anyone?).

4. The Fircosoft screening system — confirm it's screening against the EU Consolidated List which includes all Russia-designated individuals. This is a technical point but it's important.

Can you have a draft section (about 500 words + a table) for this by Friday?

/Max

---

## TASK MESSAGE 7
**To:** Petra Andrésdottir  
**Channel:** Teams — ICA-AML Project  
**Date:** Wednesday 19 March, 09:30  
**Subject:** Write the "quick wins" slide for Jonas

---

Petra,

Jonas wants a "quick wins" slide for the Phase 1 presentation — 3–5 things ICA Banken could do in the next 30–60 days that would materially improve their AML posture without requiring major system changes or budget.

Based on everything we've reviewed so far (policies, BWRA, TM Policy, onboarding policy, and the meeting notes from last week), draft 5 quick wins. For each one:

- What is the action? (one sentence, very concrete)
- Why does it matter? (which regulatory requirement or risk does it address?)
- How long would it realistically take? (days or weeks)
- Who at ICA Banken would own it?

Some ideas to get you started — but push back on these if you think others are more impactful:
- Lowering the CASH-004 crypto threshold (they already planned this)
- Completing AML training for the 6% of non-completers before the next FI interaction
- Issuing written guidance to 1st line on the "light refresh" pilot process for medium-risk customers
- Running an out-of-cycle PEP review focused on foreign PEPs to address the FI source-of-wealth feedback

Use the documents we have — specifically reference them by name when you're justifying why something matters. Jonas will push back in the presentation if the rationale isn't grounded in what we've actually seen.

Due Friday.

/Max

---

## TASK MESSAGE 8
**To:** Full team  
**Email (not Teams — formal record)  
**Date:** Friday 21 March, 16:00  
**Subject:** Phase 1 report — working paper submission deadline and review process

---

Team,

As we head into the final stretch of Phase 1, here's the confirmed timeline and what I need from each of you:

**Working paper submission deadline: Thursday 27 March, 17:00**

Each person submits their working papers to the SharePoint Phase 1 folder in final draft form by that time. No exceptions — we present the draft to ICA Banken on the 31st.

**What "final draft" means:**
- Complete, coherent sentences — not bullet notes
- Every finding has: (1) what we found, (2) what the standard/requirement is, (3) what the gap is, (4) what we recommend
- RAG rating agreed with me in advance (don't just self-assign red on everything — we need to be defensible)
- No "TBD" sections — if you're missing a piece of information, flag it to me now and we'll decide whether to request it urgently or note it as a limitation

**My review:** Friday 28 March (full day)  
**Jonas review:** Monday 31 March AM  
**Draft to ICA Banken:** Monday 31 March 17:00

**Individual submissions:**
- Sofia: CDD/KYC section, PEP/EDD section, KYC backlog section, governance section
- Björn: TM rules section, ML models section, Russia sanctions section
- Petra: AMLA supervision brief (already done — just format for report appendix), quick wins section

If anything is at risk of not being ready, tell me by Tuesday. I'd rather know now than find out Thursday at 16:55.

Good work this week.

Max

---

## TASK MESSAGE 9
**To:** Jonas Karlsson  
**Channel:** Teams — Engagement Directors  
**Date:** Friday 21 March, 16:45  
**Subject:** Phase 1 — status update and one flag for you

---

Jonas,

Quick end-of-week update.

Overall we're on track for the March 31 draft delivery. The team is solid and the findings are shaping up well.

One thing I want to flag before you see the draft: the PEP source-of-wealth finding is going to be a **High** finding, not Medium. The FI apparently flagged this informally in last year's supervisory dialogue, and if that's confirmed in writing, it means ICA Banken already knew about a deficiency and it hasn't been fixed. That changes the framing — it's not just a gap, it's a gap with regulatory awareness.

I'd suggest we discuss how to present this to Lena (CCO) before the 31st meeting. She's the one who would have received the FI feedback, so she knows — but we need to make sure the CEO is also sighted. Can we do a 20-minute call Monday morning to align on the narrative?

Also: the KYC backlog root cause is capacity. 38,000 customers is roughly 6 months' worth of refresh work at current throughput. They need either more analysts or a risk-based automated solution. I'll have a remediation option in the report but wanted you to know the headline.

Speak Monday.

Max
