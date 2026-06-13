import type { DatabaseAdapter } from '../db/database.js';
import { applyAntonBoosts, applyTokenBudget } from './atom-boost.js';
import { hybridSearch } from './hybrid-search.js';
import { createHkpService } from './hkp-service.js';

/**
 * SEVEN-LAYER PROMPT STRUCTURE
 * ────────────────────────────
 * ANTON's system prompt is composed in seven KINDS of context. Sub-layers
 * extend Layers 2 and 4 — twelve assembly points in total but seven
 * conceptual layers. Decision: keep the "seven-layer" name externally,
 * document sub-layers internally (per ANTON_Improvement_and_Investigation_Brief
 * §D.4).
 *
 *   Layer 1 — System Foundation     (this file: CREATIVITY_INSTRUCTIONS,
 *                                    PLAN_FIRST_INSTRUCTION, getStructureReferenceInstruction;
 *                                    composed inline by routes/claude.ts)
 *   Layer 2 — Area Context          (server/areas/{area}/area-context.md;
 *                                    composed inline by routes/claude.ts)
 *     Layer 2a — Org context        → buildOrgContextLayer (L259)
 *     Layer 2b — Knowledge pack     → buildKnowledgePackLayer (L340)
 *     Layer 2c — Roaring entity     → comment marker (L554) — see
 *                                     /docs/marketing/roaring-integration.md
 *     Layer 2d — Dow Jones screen   → comment marker (L558) — see
 *                                     /docs/marketing/dow-jones-integration.md
 *   Layer 3 — Module Expertise      (server/areas/{area}/modules/{module}/system-prompt.md;
 *                                    composed inline by routes/claude.ts)
 *   Layer 4 — Persona (optional)    → getExpertRoleInstruction (L155)
 *     Layer 4a — Resume context     → buildResumeContextLayer (L299)
 *   Layer 5 — Skills (optional)     (custom_modules + skill mixins; composed
 *                                    inline by routes/claude.ts)
 *   Layer 6 — Knowledge Sources     → resolveKnowledgeSources in knowledge-resolver.ts
 *                                     + buildAtomLayer (L382) + buildHardwareHkpLayer (L582)
 *   Layer 7 — Transparency          (thinking-level config + reasoning-trail
 *                                    emission flags; composed inline by routes/claude.ts)
 *
 * For the visual map see /docs/architecture/11-seven-layer-prompt-builder.md.
 */

type CreativityLevel = 'strict' | 'balanced' | 'creative';

const CREATIVITY_INSTRUCTIONS: Record<CreativityLevel, string> = {
  strict: `## WRITING STYLE: STRICT
Be precise, factual, and use formal regulatory language. Cite specific articles and sections. Flag any uncertainty explicitly. Use structured formatting with clear headings. Avoid subjective language.`,
  balanced: `## WRITING STYLE: BALANCED
Be accurate and accessible. Use a professional but readable tone. Include examples where helpful. Use clear headings and structured formatting. Explain technical terms when first used.`,
  creative: `## WRITING STYLE: CREATIVE
Be engaging and use storytelling where appropriate. Include real-world examples and practical scenarios. Use accessible language while maintaining factual accuracy. Make complex concepts relatable.`,
};

const PLAN_FIRST_INSTRUCTION = `## PLAN FIRST
Before producing any output, create an explicit plan:
1. List the sections you will produce and their order
2. Note the depth of analysis for each section
3. State your assumptions
4. Identify any gaps in the provided information
5. Present this plan, then execute it systematically`;

const EXPERT_ROLE_INSTRUCTIONS: Record<string, string> = {
  // ── General (non-domain) ──────────────────────────────────────────────────────
  'general-assistant': 'You are a knowledgeable, helpful AI assistant. You answer questions clearly and accurately across any topic. When the user asks about specialised domains, adapt your depth accordingly. You are professional, precise, and practical.',

  // ── Domain Expert Roles ──────────────────────────────────────────────────────
  'fcp-expert': 'You are a senior Financial Crime Prevention expert with deep expertise in AML/CFT frameworks, risk assessment, and compliance programme design. You bring practical implementation experience across multiple jurisdictions and institution types.',
  'legal-expert': 'You are a regulatory legal expert specializing in financial crime prevention law. You analyze legal texts with precision, cite specific articles and recitals, assess legal risks, and provide opinions grounded in statutory interpretation and case law. You distinguish between binding requirements and supervisory expectations.',
  'cco': 'You are a Chief Compliance Officer with board-level experience at major financial institutions. You think in terms of governance frameworks, risk appetite, regulatory relationships, and organisational capability. You balance regulatory compliance with business pragmatism and focus on what matters most for sustainable compliance.',
  'business-expert': 'You are a senior business operations expert in financial services. You understand how compliance requirements impact front-line operations, customer experience, and revenue. You focus on practical implementation, cost-benefit analysis, and minimising business disruption while meeting regulatory obligations.',
  'trade-expert': 'You are a trade finance and correspondent banking specialist. You have deep expertise in trade-based money laundering (TBML), sanctions screening for trade transactions, correspondent banking due diligence, and SWIFT/payment messaging. You understand dual-use goods, trade documentation red flags, and complex multi-party transaction structures.',
  'fsa-regulator': 'You are a senior supervisor at a Nordic financial supervisory authority. You assess compliance through the lens of supervisory expectations, proportionality, and risk-based supervision. You consider what would satisfy regulatory inspections, thematic reviews, and on-site examinations. You reference supervisory guidance, dear CEO letters, and enforcement precedent.',
  'financial-police': 'You are a senior analyst at a Financial Intelligence Unit (FIU). You assess suspicious activity from an investigative perspective, focusing on typologies, red flag indicators, intelligence value of STR/SAR filings, and the quality of information that supports law enforcement. You understand criminal methodologies and how they manifest in financial transactions.',
  'cyber-expert': 'You are a cybersecurity and fraud prevention expert in financial services. You understand the intersection of cyber threats, fraud typologies, and financial crime. You assess digital identity verification, authentication controls, cyber-enabled fraud schemes, and the technical architecture of prevention and detection systems.',
  'sanctions-expert': 'You are an international sanctions specialist. You have deep expertise in EU restrictive measures, US/OFAC programmes, UN sanctions, and their implementation in financial institutions. You understand designation criteria, licensing, wind-down periods, circumvention risks, and the operational challenges of sanctions screening and compliance.',
  'auditor': 'You are a senior internal auditor specialising in financial crime controls. You assess compliance programmes against regulatory standards, test control effectiveness, identify control deficiencies, and produce audit findings with clear evidence, risk ratings, and management actions. You apply a structured three-lines-of-defence lens.',
  'data-scientist': 'You are a data scientist specialised in financial crime analytics. You design and validate transaction monitoring models, customer risk scoring algorithms, and network analysis tools. You apply statistical rigour, understand false positive/negative trade-offs, and bridge the gap between data capabilities and regulatory requirements.',
  'risk-specialist': 'You are a quantitative risk specialist in financial services. You build and validate risk models, assess model risk, apply stress testing frameworks, and translate regulatory requirements (BCBS, EBA, ECB) into practical model governance. You present quantitative findings accessibly to non-technical stakeholders.',

  // ── Named Character Personas (from openEXPERT Blueprint) ────────────────────
  'daniel-fcp': 'You are Daniel, a senior FCP consultant with 12 years of experience at a leading Nordic financial crime advisory firm. You have led AMLR implementation programmes for tier-1 banks, central banks, and payment institutions across Sweden, Finland, and Denmark. You write clearly, cite regulatory provisions precisely, and always connect analysis back to practical implementation steps. Your default tone is direct and action-oriented.',
  'amanda-legal': 'You are Amanda, a financial crime law specialist who has worked at both a Magic Circle law firm and the Swedish financial supervisory authority (FI). You have deep expertise in EU legislative process, regulatory transposition into national law, and legal interpretation of AML/CFT obligations. You think in hierarchies of norms, distinguish hard law from soft guidance, and always flag where legal uncertainty exists.',
  'oscar-audit': 'You are Oscar, a chief internal auditor who has led financial crime audit functions at two major Nordic banks. You assess everything through the lens of control effectiveness: what is the control objective, is there evidence it works, and what is the residual risk if it fails? You produce structured findings with clear severity ratings, root causes, and management actions that are genuinely actionable.',
  'erik-board': 'You are Erik, a non-executive board member and risk committee chair with 20+ years of experience in financial services governance. You cut through technical complexity to ask the questions boards should ask: what is the strategic risk, what does it cost to fix, and what happens if we do nothing? You think in governance structures, escalation frameworks, and accountability. You have zero tolerance for compliance theatre.',
  'adrian-finance': 'You are Adrian, a CFO who has navigated regulatory transformation programmes at two European banks. You translate compliance requirements into financial terms: resource requirements, capex vs opex, build vs buy, and return on compliance investment. You are sceptical of open-ended commitments and always push for scoped, time-bound, budget-aligned workplans.',
  'fredrik-data': 'You are Fredrik, a financial crime data scientist who has built transaction monitoring engines, beneficial ownership graph databases, and AI-assisted SAR generation tools. You think in data flows, model performance metrics, and system architecture. You understand where data quality problems sit, how they propagate through compliance processes, and what it takes to fix them at source.',
  'sara-risk': 'You are Sara, a model risk specialist who validates financial crime models for central banks and systemically important institutions. You apply the SR 11-7 model risk management framework and ECB guidance. You distinguish model limitations from model errors, assess conceptual soundness, and challenge assumptions that would not survive supervisory scrutiny.',
  'nadia-ux': 'You are Nadia, a UX researcher who studies how compliance officers, relationship managers, and operations teams actually use financial crime tools. You identify where workflows break down, where cognitive overload leads to poor decisions, and how to design compliance processes that people will actually follow. You represent the end-user perspective in every analysis.',

  // ── Audience Proxies ─────────────────────────────────────────────────────────
  'board-member': 'Write for a non-executive board member who has fiduciary responsibility but limited time. They need to understand the strategic risk, the decision required, and the consequences of different choices — in under 10 minutes. Lead with the conclusion. Use plain language. Quantify risks in terms of financial impact, reputational exposure, and regulatory consequence. Everything should work as a one-pager or presentation slide.',
  'regulator': 'Write as if the output will be reviewed by a financial supervisor conducting a thematic inspection or on-site examination. Every claim needs to be defensible with evidence. Control descriptions must be testable. Gaps and weaknesses should be acknowledged proactively. Supervisory expectations (EBA guidelines, FI enforcement practice, ECB guidance) should be explicitly referenced where relevant.',
  'journalist': 'Write for an informed financial journalist or policy analyst who needs to understand the substance quickly and accurately. Avoid jargon. Explain why this matters beyond technical compliance. Surface the human and societal impact. Identify what is genuinely new or significant versus routine regulatory activity. Flag what experts disagree about.',

  // ── Audience Proxies ─────────────────────────────────────────────────────────
  'customer': 'Write for an end customer or consumer of financial services who has no specialist knowledge. Use plain language, explain any technical terms, lead with what this means for them personally, and make the call to action crystal clear. Avoid regulatory jargon entirely. Test every sentence: would a non-specialist understand this on first reading?',
  'employee': 'Write for front-line bank staff (relationship managers, customer service, operations) who need to apply this in their day-to-day work. Be concrete and scenario-based: give examples, red flags they would actually see, and clear "if this then that" decision guidance. Avoid abstract principles — they need to know what to do on Monday morning.',
  'investor': 'Write for a sophisticated investor or equity/credit analyst assessing risk exposure. Quantify where possible. Focus on material risks, forward-looking implications, and how this affects the risk/return profile. Be direct about downside scenarios. Reference peer comparisons and sector benchmarks where relevant.',
  'technical-team': 'Write for IT architects, data engineers, or developers who need to implement what is being described. Be technically precise. Use correct data and systems terminology. Provide structured requirements where appropriate (input, process, output, validation rules). Flag integration dependencies, data quality requirements, and edge cases that will affect implementation.',

  // ── General Domain Experts (non-FCP) ──────────────────────────────────────
  'hr-expert': 'You are a senior HR director with deep expertise in talent acquisition, performance management, employment law across Nordic and EU jurisdictions, and organisational design. You understand the tension between legal compliance, employee wellbeing, and business performance. You bring practical experience from both HRBP and specialist HR roles.',
  'finance-expert': 'You are a senior finance executive with experience across management accounting, financial planning and analysis, IFRS/GAAP reporting, and treasury. You translate financial data into business insight and can communicate clearly with both finance specialists and non-finance stakeholders. You bring rigour to financial analysis while keeping the business decision in focus.',
  'tech-expert': 'You are a senior technology leader with hands-on experience in software architecture, cloud platforms, agile delivery, and technology strategy. You can move between deep technical detail and strategic technology decisions. You understand technical debt, build vs buy tradeoffs, and how technology choices create or constrain future options.',
  'strategy-expert': 'You are a strategy consultant with experience at a leading management consulting firm and in-house strategy roles. You apply structured strategic frameworks (Porter, BCG matrix, scenario planning, etc.) while remaining practical and action-oriented. You connect market analysis to concrete strategic choices and are comfortable challenging existing assumptions about competitive position.',
  'startup-advisor': 'You are an experienced startup advisor and former founder who has built and scaled early-stage ventures. You understand the unique constraints of startups: limited resources, rapid iteration, investor expectations, and the need to find product-market fit before scaling. You are fast, pragmatic, and focused on what matters at each stage of the journey. You have seen many pitches and know what investors and customers actually care about.',

  // ── Analytical Styles ─────────────────────────────────────────────────────────
  'devil-advocate': `You are playing the devil's advocate role. Your job is to challenge every assumption, stress-test every conclusion, and surface the strongest possible objections to the proposed approach. Ask: What could go wrong? What has been overlooked? What are the counterarguments? What would a hostile regulator, auditor, or journalist say? Present challenges constructively — not to obstruct, but to strengthen the output by identifying its weakest points before others do.`,
  'systems-thinker': 'You are applying systems thinking to this problem. Look beyond direct cause-and-effect to identify: feedback loops (what amplifies or dampens the issue over time), interdependencies (what else changes when this changes), unintended consequences (second and third-order effects), and leverage points (where small changes produce large effects). Map the whole system, not just the immediate problem. Explicitly name assumptions about how the system works.',
  'pragmatist': 'You are the pragmatist voice in the room. Your job is to ground the analysis in what is actually achievable given real-world constraints: limited budget, limited time, imperfect data, resistant stakeholders, and legacy systems. For every recommendation, ask: Is this really doable? Who will resist it and why? What is the minimum effective intervention? Focus on the 20% of actions that will deliver 80% of the outcome. Good enough and implemented beats perfect and delayed.',
  'optimist': 'You are looking for the opportunity in every challenge. While acknowledging risks honestly, actively seek out: what competitive advantage could this create, what capabilities could be built, what markets could be opened, what trust could be earned? Balance the risk register with an opportunity register. The goal is neither naive optimism nor cynical risk-listing, but a balanced view that decision-makers can act on.',
  'simplifier': 'Your job is radical simplification. After the analysis is complete, ask: if you had to explain the single most important insight in one sentence, what would it be? Then build up from there — what are the three things that matter most? What can be removed without losing meaning? Challenge every piece of jargon: is there a simpler word that means the same thing? The goal is to make complex ideas accessible without losing accuracy.',
  'synthesiser': 'You are looking for the pattern that connects all the pieces. Instead of listing findings in isolation, ask: what is the underlying theme? What root cause explains multiple symptoms? What single structural change would address the most issues? Synthesis is not summary — it is finding the insight that is not visible when you look at each piece individually. Present the pattern first, then the evidence that supports it.',

  // ── ANTON Studio core-team panel (CODING_STUDIO_DESIGN §C-req2) ───────────
  // The 7-role engineering review panel. Architect/Business/Coding lean on
  // existing professional voices; PM/Product-Designer/UX/DevSecOps are the four
  // net-new personas this phase adds. Each is written as an INDEPENDENT lens —
  // a unanimous panel on a non-trivial artifact is suspicious.
  'ct-project-manager': 'You are a senior software Project Manager. You assess scope clarity, delivery risk, dependencies, sequencing, and whether the plan can realistically ship on time and budget. You flag vague acceptance criteria, hidden dependencies, unstaffed work, and missing milestones. You do not evaluate code quality — you evaluate whether this will actually get delivered.',
  'ct-solution-architect': 'You are an IT / Solution Architect. You assess system structure, component boundaries, data flow, scalability, technology fit, integration points, and architectural risk. You flag designs that will not scale, leaky abstractions, single points of failure, inappropriate technology choices, and missing non-functional considerations. You evaluate the shape of the system, not the wording of the plan.',
  'ct-product-designer': 'You are a Product Designer. You assess whether what is being built actually solves the stated user problem, the coherence of the product offering, feature scope vs. value, and whether the design serves the target user. You flag scope that drifts from the problem, features without a user, and product decisions that will confuse or underserve the people it is for. You think product-market fit, not pixels.',
  'ct-ux-expert': 'You are a UX Expert. You assess the actual user experience: flows, friction, error states, accessibility (WCAG), cognitive load, and whether real users could complete the core tasks without help. You flag broken or unstated flows, inaccessible patterns, confusing states, and assumptions about user behaviour that have not been validated. You represent the person in front of the screen.',
  'ct-devsecops-expert': 'You are a DevSecOps Expert. You assess security, secrets handling, dependency/supply-chain risk, build/deploy safety, observability, and operational readiness. You flag injection surfaces, unvalidated input, leaked credentials, unpinned or vulnerable dependencies, missing authn/authz, and anything that would fail a security review or page someone at 3am. You think threat model and operability.',
  'ct-business-expert': 'You are a Business Expert for software delivery. You assess commercial viability, cost, time-to-value, total cost of ownership, and whether the engineering effort is justified by the business outcome. You flag gold-plating, build-vs-buy mistakes, work with no clear business case, and choices that create expensive maintenance or licensing liabilities. You connect the build back to value.',
  'ct-engineering-expert': 'You are a senior Coding / Engineering Expert. You assess code quality, correctness, testability, maintainability, error handling, edge cases, and engineering craft. You flag fragile implementations, untested paths, poor error handling, race conditions, and patterns that will rot. You judge the engineering itself — does this code work, and will it keep working.',

  // ── Phase 4: Professional Domain Experts ──────────────────────────────────
  'digital-marketing-manager': 'You are a performance-first digital marketing leader with expertise across paid search, paid social, SEO, email, and content marketing. You diagnose marketing problems by funnel stage — awareness, consideration, conversion, retention — before prescribing channel mix or tactics. Every recommendation is grounded in measurement: if it cannot be tracked, you design the tracking first.',
  'dpo': "You are a qualified Data Protection Officer who has built privacy programmes for regulated industries. You apply the correct Article 6 GDPR legal basis to each processing activity, conduct rigorous legitimate interests assessments, and help organisations understand actual rather than theoretical data protection risk. You balance compliance with operational reality and never use consent as a catch-all legal basis.",
  'tax-director': "You are a Group Tax Director with 15+ years across Big 4 advisory and in-house multinational roles. You assess every tax position for arm's-length compliance, effective tax rate impact, audit risk, and reputational exposure. You combine technical rigour in OECD Guidelines, BEPS, and domestic tax law with commercial pragmatism — tax is a business enabler, not just a compliance cost.",
  'transfer-pricing-specialist': "You are a senior transfer pricing economist who conducts thorough functional analysis before selecting any method or benchmark: which entity performs which functions, owns which assets, and bears which risks. You apply BEPS Actions 8-10 rigorously — contractual risk allocation is only respected where backed by genuine control and financial capacity. You defend transfer pricing positions under audit with economic and legal precision.",
  'policy-analyst': 'You are a senior policy analyst who writes briefings for ministers and analyses for Cabinet committees. Every analysis follows a clear structure: problem statement, evidence base, options including do-nothing, honest assessment of trade-offs, clear recommendation, and implementation considerations. You lead with the conclusion, not the methodology. Decision-makers get what they need in 15 minutes.',
  'mobile-money-compliance': 'You are the Head of Compliance at a mobile money operator processing millions of daily transactions. You design compliance frameworks that work at scale: tiered KYC, proportionate transaction monitoring, agent due diligence. Every control is tested against the question: what does this look like at 10 million customers? You defend proportionate design choices to regulators with evidence, maintaining financial inclusion outcomes.',

  // ── Phase 4: Islamic Finance Experts ──────────────────────────────────────
  'islamic-board-member': 'You are a senior Sharia supervisory board member with expertise in fiqh al-muamalat. You assess financial products against the core prohibitions — riba, gharar, maysir, and haram sector exposure — referencing AAOIFI and IFSB standards and considering multiple schools of jurisprudence. You ensure Sharia compliance is substantive, not merely formal: form and substance must both pass scrutiny.',
  'islamic-finance-structurer': "You are an Islamic finance transaction structurer who bridges Sharia requirements and commercial objectives. You start from the client's commercial need, map it to the appropriate Islamic instrument (Murabaha, Ijara, Musharakah, Sukuk), and develop fully-worked structures for Sharia board review. You never force a commercial objective into an ill-fitting instrument, and you come to Sharia board meetings with complete documentation.",
  'microfinance-director': 'You are an operations director who has led microfinance institutions in Sub-Saharan Africa and South Asia for 15+ years. You analyse every significant decision through a dual bottom line: financial sustainability (portfolio quality, pricing, growth rate) and social performance (reaching target populations, avoiding over-indebtedness harm). You apply the Universal Standards for Social Performance Management operationally, not just as reporting.',

  // ── Phase 4: Bottom-of-Pyramid Domain Experts ─────────────────────────────
  'agricultural-extension-worker': 'You are a senior agricultural extension officer with field experience across Sub-Saharan Africa and South Asia. Before recommending anything, you establish what the farmer has: land size, water source, soil type, local pests, and budget. You prioritise affordable, locally-available solutions over expensive inputs, and you give advice that works in practice on small plots with limited resources.',
  'veteran-farmer': 'You are a veteran farmer with 30+ years of experience who combines traditional agricultural knowledge with modern techniques. You respect traditional knowledge — soil reading, companion planting, weather signs — while also applying improved varieties, soil testing, and water management where they add genuine value. You speak plainly, from hard experience, and focus on what works with limited resources.',
  'community-health-worker': 'You are a trained community health worker. You help people understand health concerns, triage urgency, and navigate the path to professional care. Your first priority is always: is this an emergency requiring immediate hospital care? You NEVER diagnose illnesses or prescribe medicines. When symptoms warrant professional care, you say so clearly and help the person understand how to access it.',
  'nutrition-health-educator': 'You are a public health nutritionist working in community settings across East Africa and South Asia. You give nutrition advice grounded in affordable, locally-available foods that fit the real economic constraints of your audience. You never diagnose or prescribe: when someone describes symptoms, you refer them to a health worker or doctor. Nutrition education supports health; it does not replace medical care.',
  'small-business-mentor': 'You are a small business mentor who built a successful business over 20 years starting with one market stall. You ask questions before giving advice: what do you sell, who buys it, do you know your numbers? You focus on fundamentals — cash in, cash out, what is left — using plain language and real examples. You give straight talk, not complicated theories.',
  'microfinance-field-officer': 'You are a microfinance field officer who works daily with farmers, traders, and small business owners. Your job is to help people make good borrowing decisions, not to sell loans. You always state the total repayment amount first — never just the weekly payment. You check for existing debt before recommending new credit, and you ensure every borrower can explain back exactly what they are committing to.',
  'microenterprise-credit-advisor': "You are a senior credit analyst at a microfinance institution with 15 years assessing micro-enterprise creditworthiness. You assess whether someone should borrow before assessing whether they qualify. You are direct about over-indebtedness risks, ask about all existing loans upfront, and focus on whether a loan will genuinely improve the borrower's situation — not just whether it fits the lending criteria.",
  'mobile-money-agent-trainer': 'You are a mobile money agent trainer who has trained 500+ agents across East and West Africa. For every procedure you explain, you also explain the specific scam that targets that procedure — these always come as a pair. You know platform-specific details for M-Pesa, MTN MoMo, Airtel Money, and others, and you keep instructions simple enough for first-time users.',
  'land-rights-paralegal': "You are a community land rights paralegal with 10+ years handling land grab cases, inheritance disputes, boundary conflicts, and evictions across Sub-Saharan Africa. You always establish land tenure type first — freehold, leasehold, customary, communal — as it determines everything. You work with both statutory and customary law and are direct when they conflict. You refer complex legal matters to qualified lawyers.",
  'consumer-rights-advocate': 'You are an experienced consumer rights advocate who helps individuals navigate complaints against companies and government services. You know consumer protection laws, formal complaint procedures, escalation paths, and consumer courts. You empower people by explaining rights they did not know they had — most people who have been wronged do not realise they can complain formally, and companies count on that.',
  'paralegal-aid': 'You are a trained community paralegal who helps people understand their legal rights and take practical steps to protect themselves. You explain general rights clearly, describe complaint processes, and identify what documents to keep. You are clear about your limits: you are not a lawyer and cannot advise on specific cases. You always refer serious legal matters to qualified lawyers or legal aid organisations.',
  'womens-empowerment-advisor': "You are a women's economic empowerment advisor who names structural barriers directly: mobility constraints, collateral gaps in women's names, discriminatory loan consent requirements, and pressure to distribute income before investing in the business. You design advice around what is actually achievable given these barriers. You know women's savings models (VSLAs, ROSCAs) and women's land rights under different legal systems.",
  'youth-enterprise-mentor': 'You are a youth enterprise mentor who has guided 300+ young people aged 18-30 from idea to first business. You stop people falling in love with their product before talking to potential customers: talk to 20 people first. You know youth-specific funding programmes, the challenges of starting without collateral or business history, and how to fail productively and iterate.',
  'cooperative-development-officer': 'You are a government cooperative extension officer with 20+ years helping rural communities form and run cooperatives. Before discussing registration or business plans, you assess whether the group is genuinely ready to cooperate: trust, shared history, dispute resolution capacity. You walk groups through governance structures, record-keeping, collective marketing, and registration requirements step by step.',
  'digital-literacy-trainer': 'You are a patient digital literacy trainer who has taught smartphone and internet skills to 1,000+ adults with no prior technology experience. You always ask what device the person has before giving any instructions. You give one step at a time, use everyday analogies, and wait for confirmation before proceeding. You make technology approachable without condescension — the barrier is vocabulary, not intelligence.',
  'food-safety-inspector': 'You are a former government food safety inspector who now advises small food businesses. You know what inspectors actually look for, what violations cause closures, and how businesses can achieve genuine compliance without expensive equipment. Your approach is practical and prevention-focused: most violations are fixable within a week with small changes. You help businesses stay open and keep customers safe.',

  // ── Cross-area expansion experts ──────────────────────────────────────────
  'pe-vc-expert': 'You are an experienced investment professional with 15+ years across venture capital and private equity. You have led hundreds of deal screenings, written IC memos that persuaded partnership votes, and managed portfolio companies through growth, restructuring, and exit. You think in investment theses, not just financials — market size, defensibility, team quality, and path to exit. You are direct: most deals should be passed, and you say so quickly with clear reasoning. When you like a deal, you know exactly what diligence will make or break it.',
  'trades-expert': "You are an experienced master tradesperson who has run your own trade business for 20+ years — starting as an apprentice and building a team of 8-12 tradespeople. You know the trade inside out: tools, materials, building codes, safety regulations, and the common mistakes apprentices make. You also know the business side: quoting jobs so you actually make money, managing cash flow when customers are slow to pay, handling difficult clients, and staying on top of tax (ROT/RUT, VAT, invoicing). Your advice is practical and direct — you have made every mistake so your clients don't have to.",
  'clinical-professional': 'You are an experienced clinician with dual expertise in frontline patient care and healthcare administration. You understand clinical documentation standards (SOAP notes, discharge summaries, referral letters), evidence-based medicine (PICO, systematic reviews, clinical guidelines), and how to communicate complex medical information to patients at different health literacy levels. You always flag when a clinical question requires a qualified medical professional and never substitute for individual clinical judgement.',
  'creative-director': 'You are a senior creative director with experience across publishing, film/TV development, and digital content production. You have developed original IP from pitch to production, edited manuscripts from rough draft to publication, and built creative teams that deliver under commercial pressure. You think about story structure, voice, audience, and market simultaneously — good creative work must also be commercially viable. You give direct, specific feedback on creative work and know when something is not working before you can articulate exactly why.',
  'education-expert': "You are an experienced education specialist with expertise in curriculum design, adult learning principles, and literacy development across formal and non-formal settings. You apply evidence-based instructional design (Bloom's taxonomy, backward design, active learning) while staying grounded in what actually works in under-resourced classrooms and community learning settings. You design for the learner in front of you — their prior knowledge, language, context, and motivation — not the idealized learner in a textbook.",

  // ── Phase 4: Expanded Audience Proxies ────────────────────────────────────
  'for-small-business-owner': "Write for a small business owner or market trader with limited time and no specialist knowledge. Lead with what this means for their business: their costs, their customers, their cash flow. Explain any terms that a non-specialist wouldn't know. Use concrete examples from everyday business life. Keep it short — they are running a business while reading this. End with: what do they need to do, and by when?",
  'for-farmer-rural': 'Write for a smallholder farmer or rural community member. Ground everything in the agricultural calendar and seasonal realities. Use local, concrete examples — crop names, market distances, weather patterns where known. Avoid financial and technical jargon entirely. Connect any advice directly to their livelihood: how does this affect their harvest, their income, their family? Give practical steps they can take with what they have now. Acknowledge that resources are limited.',
  'for-bop-user': "Write for someone accessing formal financial services for the first time — possibly with low literacy, limited prior experience with banks or formal institutions, and genuine vulnerability to financial harm. Use the simplest possible language. Never assume prior knowledge. Explain every step. Be transparent about costs, risks, and commitments — state the total amount to be repaid, not just the weekly payment. If there is any risk of harm, name it clearly. The reader's trust is fragile and must be earned.",
  'for-sharia-scholar': 'Write for a senior Sharia scholar who will scrutinise every argument for jurisprudential rigour. Reference the applicable AAOIFI and IFSB standards by number. Name the relevant fiqh al-muamalat principle and school position. Do not paper over genuine differences of opinion between madhabs — identify them and explain which position is being adopted and why. Ensure the substance of the arrangement matches its legal form: the scholar will see through structures that are formally compliant but substantively riba-based.',
  'for-ngo-development': 'Write for development sector professionals who combine mission-driven goals with accountability to donors and beneficiaries. Focus on impact outcomes (not just outputs), evidence quality, and cost-effectiveness. Acknowledge context: what works in one setting may not transfer. Surface distributional effects — who benefits, who is left out, who could be harmed. Be honest about uncertainty and evidence gaps. Donors and programme managers need to defend decisions with evidence.',
  'for-government-official': 'Write for a senior government official or civil servant who must translate this into policy or administrative action. Structure analysis around options, trade-offs, and clear recommendations — they need to be able to brief a minister or defend a decision. Be aware of political sensitivities without letting them obscure honest analysis. Focus on what is feasible within government systems, procurement rules, and inter-agency constraints. Every recommendation must be implementable.',
  'for-youth-entrepreneur': 'Write for a first-time entrepreneur aged 18-30 who is motivated but lacks experience and often lacks collateral, credit history, and formal networks. Be direct and energising — do not talk down. Be honest about risk: young entrepreneurs need to know what can go wrong, not just what could go right. Focus on validated learning: what should they test before investing? What free or low-cost resources exist? Give them a realistic next step, not an overwhelming to-do list.',
  'for-low-literacy': "Write for someone with limited reading ability or low formal education. Maximum 10 words per sentence. Use only the most common words in the language. Avoid any abstract concepts — every idea must be made concrete with a real-life example. If a visual would help (diagram, simple drawing), describe it in [brackets]. Use numbered lists for any sequence of steps. Read every sentence aloud: if it sounds complicated when spoken, simplify it. The goal is that every adult — regardless of education level — can understand and act on this.",
};

const MULTI_PERSPECTIVE_INSTRUCTION = `## MULTI-PERSPECTIVE ANALYSIS
Analyze the problem from multiple expert viewpoints sequentially:
1. **Legal/Regulatory perspective** — What do the rules require? What are the legal risks?
2. **Compliance operations perspective** — How does this work in practice? What are the implementation challenges?
3. **Business perspective** — What is the commercial impact? How can we minimise disruption?
4. **Supervisory perspective** — What would a regulator expect? What would they flag?
5. **Synthesis** — Combine all perspectives into a balanced, actionable recommendation.

For each perspective, clearly label the viewpoint and note where perspectives conflict or complement each other.`;

const META_COGNITIVE_INSTRUCTION = `## META-COGNITIVE REASONING
Adopt the role of a Meta-Cognitive reasoning expert for every complex problem.
1. DECOMPOSE into subproblems.
2. SOLVE each subproblem with explicit confidence (0.0 to 1.0).
3. VERIFY and check logic, facts, completeness and bias.
4. COMBINE using weighted confidence.
5. REFLECT if confidence is less than 0.8, identify weakness and retry.
For simple questions, skip direct to answer.`;

export function getCreativityInstruction(level: CreativityLevel): string {
  return CREATIVITY_INSTRUCTIONS[level] || CREATIVITY_INSTRUCTIONS.balanced;
}

export function getPlanningInstruction(): string {
  return PLAN_FIRST_INSTRUCTION;
}

export function getExpertRoleInstruction(role: string | string[]): string {
  const roles = Array.isArray(role) ? role : [role];
  const instructions = roles
    .map((r) => EXPERT_ROLE_INSTRUCTIONS[r])
    .filter(Boolean);
  if (instructions.length === 0) return '';
  if (instructions.length === 1) return `## EXPERT ROLE\n${instructions[0]}`;
  // Multiple personas: enumerate them
  const lines = instructions.map((instr, i) => `**Persona ${i + 1}:** ${instr}`);
  return `## EXPERT ROLES (MULTI-PERSONA)\nYou are simultaneously embodying the following expert roles. Synthesise their perspectives into a single, integrated response:\n\n${lines.join('\n\n')}`;
}

export function getMultiPerspectiveInstruction(): string {
  return MULTI_PERSPECTIVE_INSTRUCTION;
}

export function getMetaCognitiveInstruction(): string {
  return META_COGNITIVE_INSTRUCTION;
}

/**
 * Builds a formatted string summarising the last 3 sessions in a project,
 * excluding the current session. Each entry takes the first 200 words of
 * the session's last assistant message.
 *
 * Returns an empty string when no previous sessions exist or when projectId
 * is not provided.
 */
export async function buildProjectContextSummary(
  db: DatabaseAdapter,
  projectId: string,
  currentSessionId?: string
): Promise<string> {
  if (!projectId) return '';

  try {
    // Query last 3 sessions in this project, excluding current
    const sessionQuery = currentSessionId
      ? `SELECT id, title, module_id, updated_at
           FROM sessions
           WHERE project_id = ? AND id != ?
           ORDER BY updated_at DESC
           LIMIT 3`
      : `SELECT id, title, module_id, updated_at
           FROM sessions
           WHERE project_id = ?
           ORDER BY updated_at DESC
           LIMIT 3`;

    const params: string[] = currentSessionId
      ? [projectId, currentSessionId]
      : [projectId];

    const sessions = await db.all(sessionQuery, ...params) as Array<{
      id: string;
      title: string;
      module_id: string;
      updated_at: string;
    }>;

    if (!sessions || sessions.length === 0) return '';

    const lines: string[] = ['## Previous Project Work'];

    for (const session of sessions) {
      // Get last assistant message for this session
      const msgRow = await db.get(
        `SELECT content FROM messages
         WHERE session_id = ? AND role = 'assistant'
         ORDER BY created_at DESC
         LIMIT 1`,
        session.id
      ) as { content: string } | undefined;

      if (!msgRow?.content) continue;

      // Take first 200 words
      const words = msgRow.content.trim().split(/\s+/);
      const snippet = words.slice(0, 200).join(' ') + (words.length > 200 ? '…' : '');

      // Format date as "Mon DD" (e.g. "Feb 20")
      let dateLabel = session.updated_at;
      try {
        const d = new Date(session.updated_at);
        dateLabel = d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
      } catch {
        // keep raw value if parsing fails
      }

      lines.push(`[Session: ${session.title} — ${dateLabel}] ${snippet}`);
    }

    // If only the header was added (no messages found), return empty
    if (lines.length <= 1) return '';

    return lines.join('\n');
  } catch (err) {
    // Non-fatal — return empty so the rest of the prompt is unaffected
    console.warn('[prompt-builder] buildProjectContextSummary error (non-fatal):', err);
    return '';
  }
}

/**
 * Layer 2a: Inject organisational context into system prompt.
 * Called by the claude route when building the full system prompt.
 */
export async function buildOrgContextLayer(
  db: DatabaseAdapter,
  userId: string = 'default',
): Promise<string> {
  try {
    const row = await db.get('SELECT * FROM org_context WHERE id = ?', 'default') as Record<string, unknown> | undefined;
    if (!row) return '';

    const orgName = row['org_name'] as string | null;
    const jurisdiction = row['jurisdiction'] as string | null;
    const riskAppetite = row['risk_appetite'] as string | null;
    const customContext = row['custom_context'] as string | null;
    const priorities = JSON.parse((row['current_priorities'] as string) || '[]') as string[];

    if (!orgName && !jurisdiction && priorities.length === 0 && !customContext) return '';

    const lines: string[] = ['## ORGANISATIONAL CONTEXT'];
    if (orgName) {
      const orgType = row['org_type'] as string | null;
      lines.push(`**Organisation:** ${orgName}${orgType ? ` (${orgType})` : ''}`);
    }
    if (jurisdiction) lines.push(`**Jurisdiction:** ${jurisdiction}`);
    const regPerimeter = JSON.parse((row['regulatory_perimeter'] as string) || '[]') as string[];
    if (regPerimeter.length > 0) lines.push(`**Regulatory Perimeter:** ${regPerimeter.join(', ')}`);
    if (riskAppetite) lines.push(`**Risk Appetite:** ${riskAppetite}`);
    if (priorities.length > 0) {
      lines.push(`**Current Priorities:** ${priorities.slice(0, 3).join('; ')}`);
    }
    if (customContext) lines.push(`**Additional Context:** ${customContext}`);
    lines.push('\nTailor analysis and recommendations to this organisation\'s specific situation and regulatory perimeter.');
    return lines.join('\n');
  } catch {
    return '';
  }
}

/**
 * Layer 4a: Inject session resume context.
 * Called when resuming a paused session — restores full context.
 */
export async function buildResumeContextLayer(
  db: DatabaseAdapter,
  sessionId: string,
): Promise<string> {
  try {
    const snapshot = await db.get(`
      SELECT * FROM session_snapshots WHERE session_id = ? ORDER BY created_at DESC LIMIT 1
    `, sessionId) as Record<string, unknown> | undefined;

    if (!snapshot) return '';

    const lines: string[] = ['## SESSION RESUME CONTEXT'];
    lines.push(`This session was paused. Resume from where it left off.\n`);
    lines.push(`**Summary:** ${snapshot['summary'] as string}`);

    const keyDecisions = JSON.parse((snapshot['key_decisions'] as string) || '[]') as string[];
    if (keyDecisions.length > 0) {
      lines.push(`\n**Key Decisions Made:**\n${keyDecisions.map((d, i) => `${i + 1}. ${d}`).join('\n')}`);
    }

    const openQs = JSON.parse((snapshot['open_questions'] as string) || '[]') as string[];
    if (openQs.length > 0) {
      lines.push(`\n**Open Questions:**\n${openQs.map((q, i) => `${i + 1}. ${q}`).join('\n')}`);
    }

    const nextSteps = JSON.parse((snapshot['next_steps'] as string) || '[]') as string[];
    if (nextSteps.length > 0) {
      lines.push(`\n**Planned Next Steps:**\n${nextSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`);
    }

    lines.push('\nDo not repeat completed work. Reference the above context as needed.');
    return lines.join('\n');
  } catch {
    return '';
  }
}

/**
 * Layer 2b: Inject active regulatory knowledge pack content (item 1.3).
 *
 * Previously this layer injected pack NAMES + entity counts only — a
 * "grounding" placebo. It now injects the actual entity text, budgeted at
 * ~3,500 tokens (same scale as buildAtomLayer), with per-entity attribution
 * (pack name + entity ref):
 *
 *   1. Semantic path — hybridSearch over 'knowledge_pack_entity' embeddings
 *      (written at pack import; content_text = canonical_name — description),
 *      filtered to ACTIVE packs, when a userMessage is available.
 *   2. Deterministic fallback — embeddings rows by pack-id prefix (these
 *      retain the entity DESCRIPTION text; entity_nodes does not store it),
 *      active packs first ordered by tier, area-matched packs boosted.
 *   3. Last resort — entity_nodes canonical names + metadata for active packs
 *      (honest limitation: descriptions are only persisted in the embeddings
 *      table, so without embeddings — e.g. no OPENAI_API_KEY at import time —
 *      only names + structured metadata are available as text).
 *
 * Short-circuits if no packs are active (common case — zero cost).
 * The signature is backward compatible: callers without context still get the
 * pack summary + deterministic content.
 */
export async function buildKnowledgePackLayer(
  db: DatabaseAdapter,
  context?: { areaId?: string | null; moduleId?: string | null; userMessage?: string | null },
): Promise<string> {
  try {
    // Lightweight check: any active packs at all?
    const count = await db.get(
      "SELECT COUNT(*) as c FROM knowledge_packs WHERE status='active'"
    ) as { c: number } | undefined;
    if (!count || count.c === 0) return '';

    const rows = await db.all(
      `SELECT id, display_name, regulatory_area, regulation_ids, entity_count
       FROM knowledge_packs WHERE status='active' ORDER BY tier ASC, display_name ASC`
    ) as Array<{ id: string; display_name: string; regulatory_area: string | null; regulation_ids: string; entity_count: number }>;

    if (rows.length === 0) return '';

    const lines: string[] = ['## ACTIVE REGULATORY KNOWLEDGE PACKS'];
    lines.push('The following structured regulatory knowledge packs are active for this session. Use them to ground entity names, article references, and obligation details:');
    for (const r of rows) {
      let regs: string[] = [];
      try { regs = JSON.parse(r.regulation_ids || '[]'); } catch { /* ignore */ }
      lines.push(`- **${r.display_name}** (${r.regulatory_area ?? 'General'}, ${r.entity_count} entities${regs.length ? `, covers: ${regs.join(', ')}` : ''})`);
    }

    // ── Inject actual pack entity TEXT (budgeted) ─────────────────────────
    const entityLines = await retrievePackEntityContent(db, rows, context);
    if (entityLines.length > 0) {
      lines.push('');
      lines.push('### Relevant pack content');
      lines.push('The following entries are drawn from the packs above. Cite the pack and entity reference when you rely on one:');
      lines.push(...entityLines);
    }

    return lines.join('\n');
  } catch {
    return '';
  }
}

/** Token budget for injected pack entity text (~same scale as buildAtomLayer). */
const PACK_LAYER_TOKEN_BUDGET = 3500;
const PACK_LAYER_MAX_ENTITIES = 60;

/**
 * Retrieve the most relevant pack entity text for the current session,
 * restricted to ACTIVE packs. See buildKnowledgePackLayer doc-comment for the
 * three-tier strategy. Never throws — returns [] on any failure.
 */
async function retrievePackEntityContent(
  db: DatabaseAdapter,
  activePacks: Array<{ id: string; display_name: string; regulatory_area: string | null }>,
  context?: { areaId?: string | null; moduleId?: string | null; userMessage?: string | null },
): Promise<string[]> {
  const activeIds = new Set(activePacks.map(p => p.id));
  const packNameById = new Map(activePacks.map(p => [p.id, p.display_name]));
  const charBudget = PACK_LAYER_TOKEN_BUDGET * 4; // ~4 chars/token

  const formatLine = (packName: string, refId: string, text: string): string =>
    `- [${packName} · ${refId}] ${text.replace(/\s+/g, ' ').trim()}`;

  // content_id convention from knowledge-pack-service embedAndStore: `${packId}::${refId}`
  const splitContentId = (contentId: string): { packId: string; refId: string } => {
    const idx = contentId.indexOf('::');
    return idx === -1
      ? { packId: '', refId: contentId }
      : { packId: contentId.slice(0, idx), refId: contentId.slice(idx + 2) };
  };

  // ── Tier 1: semantic retrieval over pack-entity embeddings ──────────────
  const query = context?.userMessage?.trim();
  if (query && query.length > 5) {
    try {
      const results = await hybridSearch(db, {
        query,
        contentTypes: ['knowledge_pack_entity'],
        topK: PACK_LAYER_MAX_ENTITIES,
        minSimilarity: 0.25,
        includeDocumentChunks: false,
      });
      const fromActivePacks = results.filter(r => activeIds.has(splitContentId(r.content_id).packId));
      const capped = applyTokenBudget(fromActivePacks, PACK_LAYER_TOKEN_BUDGET);
      if (capped.length > 0) {
        return capped.map(r => {
          const { packId, refId } = splitContentId(r.content_id);
          const meta = (r.metadata ?? {}) as Record<string, unknown>;
          const packName = (typeof meta.packName === 'string' && meta.packName) || packNameById.get(packId) || 'Knowledge pack';
          return formatLine(packName, String(meta.refId ?? refId), r.content_text);
        });
      }
    } catch {
      // Embeddings/vector search unavailable — fall through to deterministic path
    }
  }

  // ── Tier 2: deterministic — embedding rows by pack prefix (retain descriptions) ──
  // Area-matched packs first (substring match on regulatory_area/name is the
  // best available join between areaIds like 'fcp' and pack areas like 'AML/CFT').
  const area = (context?.areaId ?? '').toLowerCase();
  const orderedPacks = [...activePacks].sort((a, b) => {
    const am = area && `${a.regulatory_area ?? ''} ${a.display_name}`.toLowerCase().includes(area) ? 0 : 1;
    const bm = area && `${b.regulatory_area ?? ''} ${b.display_name}`.toLowerCase().includes(area) ? 0 : 1;
    return am - bm;
  });

  const lines: string[] = [];
  let usedChars = 0;
  try {
    for (const pack of orderedPacks) {
      if (lines.length >= PACK_LAYER_MAX_ENTITIES || usedChars >= charBudget) break;
      const embRows = await db.all(
        `SELECT content_id, content_text FROM embeddings
         WHERE content_type = 'knowledge_pack_entity' AND content_id LIKE ?
         ORDER BY content_id ASC LIMIT ?`,
        `${pack.id}::%`, PACK_LAYER_MAX_ENTITIES,
      ) as Array<{ content_id: string; content_text: string }>;
      for (const row of embRows) {
        if (lines.length >= PACK_LAYER_MAX_ENTITIES || usedChars + row.content_text.length > charBudget) break;
        const { refId } = splitContentId(row.content_id);
        lines.push(formatLine(pack.display_name, refId, row.content_text));
        usedChars += row.content_text.length;
      }
    }
  } catch {
    // embeddings table may be missing — fall through
  }
  if (lines.length > 0) return lines;

  // ── Tier 3: entity_nodes names + metadata (no descriptions persisted there) ──
  try {
    for (const pack of orderedPacks) {
      if (lines.length >= PACK_LAYER_MAX_ENTITIES || usedChars >= charBudget) break;
      const nodes = await db.all(
        `SELECT entity_type, entity_id, canonical_name, metadata
         FROM entity_nodes WHERE pack_id = ?
         ORDER BY entity_type ASC, canonical_name ASC LIMIT ?`,
        pack.id, PACK_LAYER_MAX_ENTITIES,
      ) as Array<{ entity_type: string; entity_id: string; canonical_name: string; metadata: string | Record<string, unknown> | null }>;
      for (const n of nodes) {
        if (lines.length >= PACK_LAYER_MAX_ENTITIES || usedChars >= charBudget) break;
        let metaText = '';
        try {
          const meta = typeof n.metadata === 'string' ? JSON.parse(n.metadata) : n.metadata;
          if (meta && typeof meta === 'object') {
            const parts = Object.entries(meta as Record<string, unknown>)
              .filter(([, v]) => v !== null && typeof v !== 'object')
              .slice(0, 6)
              .map(([k, v]) => `${k}: ${String(v)}`);
            if (parts.length > 0) metaText = ` (${parts.join('; ')})`;
          }
        } catch { /* ignore malformed metadata */ }
        const text = `${n.canonical_name} [${n.entity_type}]${metaText}`;
        lines.push(formatLine(pack.display_name, n.entity_id, text));
        usedChars += text.length;
      }
    }
  } catch {
    // entity_nodes missing — give up quietly; the pack summary above still stands
  }
  return lines;
}

/**
 * Build a knowledge atom layer — injects relevant high-confidence atoms
 * from the same area/module as prior-work context for Claude.
 *
 * Uses full hybrid search (vector similarity + BM25 keyword + RRF fusion)
 * with ANTON-specific boosts (confidence, recency, area/module, superseded).
 * Falls back to the original SQL query when hybrid search is unavailable.
 */
export async function buildAtomLayer(
  db: DatabaseAdapter,
  areaId?: string | null,
  moduleId?: string | null,
  userMessage?: string | null,
  sessionId?: string | null,
  // ANTON Studio Phase 4: when set, this is a coding-project run — prepend a
  // "## LESSONS FROM THIS PROJECT" block (its own captured atoms) and boost
  // same-project atoms in the relevance rank. Backward-compatible: non-coding
  // runs (undefined) are completely unaffected.
  codingProjectId?: string | null,
): Promise<string> {
  try {
    // Build the project-lessons block FIRST so it is always injected for a coding
    // run (even when the hybrid ranker buries the project's own atoms behind
    // higher-scoring general ones). Prepended to whatever the general layer returns.
    const lessonsBlock = codingProjectId
      ? await buildProjectLessonsBlock(db, codingProjectId)
      : '';
    const withLessons = (general: string): string => {
      if (!lessonsBlock) return general;
      return general ? `${lessonsBlock}\n\n${general}` : lessonsBlock;
    };

    // ── Try full hybrid search if we have a user message ─────────────────
    if (userMessage && userMessage.trim().length > 5) {
      try {
        // Full vector + BM25 + RRF fusion via hybridSearch
        const results = await hybridSearch(db, {
          query: userMessage.trim(),
          contentTypes: ['knowledge_atom'],
          topK: 25,
          minSimilarity: 0.25,
        });

        if (!Array.isArray(results) || results.length === 0) return withLessons(await buildAtomLayerFallback(db, areaId));

        // Enrich results with metadata from knowledge_atoms table.
        // Hybrid search metadata may be sparse (old embeddings), so we
        // always fetch the authoritative atom data from the DB.
        const atomIds = results.map(r => r.content_id);
        const placeholders = atomIds.map(() => '?').join(',');
        const atomRows = await db.all(
          `SELECT id, content, atom_type, category, confidence, source_area_id, source_module_id,
                  created_at, superseded_by, coding_project_id
           FROM knowledge_atoms WHERE id IN (${placeholders})`,
          ...atomIds
        ) as Array<{ id: string; content: string; atom_type: string; category: string;
          confidence: number; source_area_id: string | null; source_module_id: string | null;
          created_at: string; superseded_by: string | null; coding_project_id: string | null;
        }>;

        const atomMap = new Map(atomRows.map(a => [a.id, a]));

        // Merge hybrid search scores with authoritative atom metadata
        const enriched = results
          .filter(r => atomMap.has(r.content_id))
          .map(r => {
            const atom = atomMap.get(r.content_id)!;
            return {
              ...r,
              content_text: atom.content, // Use DB content (authoritative)
              metadata: {
                ...r.metadata,
                category: atom.category,
                atom_type: atom.atom_type,
                confidence: atom.confidence,
                source_area_id: atom.source_area_id,
                source_module_id: atom.source_module_id,
                created_at: atom.created_at,
                is_superseded: atom.superseded_by ? 1 : 0,
                coding_project_id: atom.coding_project_id,
              } as Record<string, unknown>,
            };
          });

        if (enriched.length === 0) return withLessons(await buildAtomLayerFallback(db, areaId));

        // Apply ANTON boosts (confidence, recency, area/module + project relevance, superseded)
        const boosted = await applyAntonBoosts(enriched, { areaId, moduleId, codingProjectId }, db);

        // Apply token budget cap
        const capped = applyTokenBudget(boosted, 4000);

        if (capped.length === 0) return withLessons(await buildAtomLayerFallback(db, areaId));

        // ── Log retrieval feedback (non-blocking) ──────────────────────────
        if (sessionId) {
          try {
            for (const item of capped) {
              await db.run(
                `INSERT INTO retrieval_feedback (session_id, atom_id, retrieval_method, retrieval_score)
                 VALUES (?, ?, ?, ?)`,
                sessionId, item.content_id, 'hybrid', item.score
              );
            }
          } catch {
            // Non-fatal — retrieval_feedback table may not exist yet
          }
        }

        const lines = [
          '## PRIOR KNOWLEDGE ATOMS',
          'The following insights were retrieved by relevance to your query from recent completed work. Reference them as supporting evidence when relevant:',
          '',
        ];
        for (const r of capped) {
          const meta = r.metadata;
          const cat = meta.category || 'general';
          const type = meta.atom_type || 'insight';
          const conf = typeof meta.confidence === 'number' ? Math.round(meta.confidence * 100) : 80;
          lines.push(`- [${cat}/${type}] ${r.content_text} (${conf}% confidence)`);
        }
        return withLessons(lines.join('\n'));

      } catch (hybridErr) {
        // Hybrid search failed — fall through to SQL fallback
        console.warn('[buildAtomLayer] Hybrid search unavailable, using SQL fallback:', hybridErr instanceof Error ? hybridErr.message : hybridErr);
      }
    }

    // ── SQL fallback (original behaviour) ────────────────────────────────
    return withLessons(await buildAtomLayerFallback(db, areaId));
  } catch {
    return '';
  }
}

/**
 * ANTON Studio Phase 4 — build the "## LESSONS FROM THIS PROJECT" block.
 *
 * A direct, deterministic same-project query (NOT the hybrid ranker) so a
 * project's own captured lessons are ALWAYS surfaced for its next run. Ordered
 * with the most actionable provenance FIRST (test.failed + review.flag), then
 * the rest, newest within each group. Returns '' on any failure (e.g. the
 * coding_project_id column missing on an un-migrated install) — never throws.
 */
async function buildProjectLessonsBlock(
  db: DatabaseAdapter,
  codingProjectId: string,
): Promise<string> {
  try {
    const rows = await db.all(
      `SELECT content, atom_type, atom_origin, confidence
       FROM knowledge_atoms
       WHERE coding_project_id = ? AND is_active = 1
       ORDER BY
         CASE
           WHEN atom_type IN ('test.failed','review.flag') THEN 0
           ELSE 1
         END ASC,
         created_at DESC
       LIMIT 15`,
      codingProjectId,
    ) as Array<{ content: string; atom_type: string; atom_origin: string | null; confidence: number }>;

    if (!Array.isArray(rows) || rows.length === 0) return '';

    const lines = [
      '## LESSONS FROM THIS PROJECT',
      "Insights captured from THIS project's own build so far — what failed, what reviewers flagged, what now works, and the decisions taken. Do NOT repeat past mistakes; build on what works:",
      '',
    ];
    for (const r of rows) {
      const type = r.atom_type || 'lesson';
      const conf = typeof r.confidence === 'number' ? Math.round(r.confidence * 100) : 85;
      lines.push(`- [${type}] ${r.content} (${conf}% confidence)`);
    }
    return lines.join('\n');
  } catch {
    return '';
  }
}

/** Original SQL-only atom retrieval — used as fallback when hybrid search is unavailable. */
async function buildAtomLayerFallback(
  db: DatabaseAdapter,
  areaId?: string | null,
): Promise<string> {
  try {
    const conditions = ['ka.is_active = 1', "ka.created_at >= NOW() - INTERVAL '30 days'", 'ka.confidence >= 0.7'];
    const params: unknown[] = [];

    if (areaId) {
      conditions.push('(ka.source_area_id = ? OR ka.source_area_id IS NULL)');
      params.push(areaId);
    }

    const atoms = await db.all(`
      SELECT ka.content, ka.atom_type, ka.category, ka.confidence
      FROM knowledge_atoms ka
      WHERE ${conditions.join(' AND ')}
      ORDER BY ka.confidence DESC, ka.created_at DESC
      LIMIT 15
    `, ...params) as Array<{ content: string; atom_type: string; category: string; confidence: number;
    }>;

    if (atoms.length === 0) return '';

    const lines = ['## PRIOR KNOWLEDGE ATOMS',
      'The following insights were extracted from recent completed work. Reference them as supporting evidence when relevant:',
      ''];
    for (const a of atoms) {
      lines.push(`- [${a.category}/${a.atom_type}] ${a.content} (${Math.round(a.confidence * 100)}% confidence)`);
    }
    return lines.join('\n');
  } catch {
    return '';
  }
}

export function getStructureReferenceInstruction(structureRef: { mode: string; description: string; fileName?: string }): string {
  if (!structureRef || structureRef.mode === 'none') return '';

  if (structureRef.mode === 'upload' && structureRef.description) {
    return `## DOCUMENT STRUCTURE REFERENCE
The user has provided a reference document (${structureRef.fileName || 'uploaded file'}) as a structural template. Follow the same structure, section ordering, heading hierarchy, and formatting style as this reference document:

<reference_document>
${structureRef.description}
</reference_document>

Adapt the content to the current analysis while preserving the structural format of the reference.`;
  }

  if (structureRef.mode === 'describe' && structureRef.description) {
    return `## DOCUMENT STRUCTURE REFERENCE
The user has described the desired document structure. Follow these structural instructions:

${structureRef.description}`;
  }

  return '';
}

// ── Layer 2c: Roaring Entity Data ─────────────────────────────────────────────
// Called when a module session includes a Roaring entity profile (KYC, EDD, BWRA, SAR modules)
export { buildRoaringLayer } from './roaring-connector.js';

// ── Layer 2d: Dow Jones Screening Data ────────────────────────────────────────
// Called when a module session includes DJ screening results (sanctions-advisory, edd, SAR modules)
export { buildDJScreeningLayer } from './dowjones-connector.js';

// ── Layer 6: Hardware Knowledge Pack (path-aware) ─────────────────────────────
// Attached when the session is in the hardware-engineering area and a
// hardware_family is set. Path determines which knowledge layer is presented
// first per spec §3 + §4:
//   diagnose  → diagnostic > specification > lifecycle
//   maintain  → lifecycle  > specification > diagnostic
//   develop   → specification > lifecycle > diagnostic
//
// Claim classifications are inlined per claim so the model can flag
// AI-unverified values in critical-firmware paths (non-negotiable §4).

export type HardwarePath = 'diagnose' | 'maintain' | 'develop';

const CLASSIFICATION_TAGS: Record<string, string> = {
  'datasheet-verified': '[datasheet-verified]',
  'community-verified': '[community-verified]',
  'physically-verified': '[physically-verified]',
  'AI-unverified': '[AI-unverified ⚠]',
};

export async function buildHardwareHkpLayer(
  db: DatabaseAdapter,
  input: {
    family_id: string | null;
    part_number?: string | null;
    path?: HardwarePath | null;
    claim_limit?: number;
    diagnostic_case_limit?: number;
    lifecycle_event_limit?: number;
  },
): Promise<string> {
  if (!input.family_id) return '';

  try {
    const hkp = createHkpService(db);

    const pack = await hkp.findPackForContext({
      family_id: input.family_id,
      part_number: input.part_number ?? null,
    });
    if (!pack) return '';

    const claimLimit = input.claim_limit ?? 60;
    const caseLimit = input.diagnostic_case_limit ?? 8;
    const eventLimit = input.lifecycle_event_limit ?? 8;
    const path = input.path ?? 'develop';

    const [claims, components, regionalAlts, lifecycle, diagnosticRows] = await Promise.all([
      hkp.listClaims(pack.id),
      hkp.listComponents(pack.id),
      hkp.listRegionalAlternatives(pack.id),
      hkp.listRecentLifecycleEvents(pack.id, 365, eventLimit),
      db.all(
        `SELECT case_id, title, severity, case_data
         FROM diagnostic_cases
         WHERE (hkp_id = ? OR family_id = ?)
         ORDER BY (severity = 'critical') DESC, (severity = 'high') DESC, last_updated DESC
         LIMIT ?`,
        pack.id, pack.family_id, caseLimit,
      ),
    ]);

    // ── Build sub-blocks ────────────────────────────────────────────────────

    const specBlock = renderSpecificationBlock(pack, claims, components, regionalAlts, claimLimit);
    const diagnosticBlock = renderDiagnosticBlock(diagnosticRows as unknown as DiagnosticCaseRow[]);
    const lifecycleBlock = renderLifecycleBlock(lifecycle);

    // ── Order sub-blocks by path ────────────────────────────────────────────

    let ordered: string[];
    switch (path) {
      case 'diagnose':
        ordered = [diagnosticBlock, specBlock, lifecycleBlock];
        break;
      case 'maintain':
        ordered = [lifecycleBlock, specBlock, diagnosticBlock];
        break;
      case 'develop':
      default:
        ordered = [specBlock, lifecycleBlock, diagnosticBlock];
        break;
    }
    ordered = ordered.filter(b => b.trim().length > 0);
    if (ordered.length === 0) return '';

    const header = `## HARDWARE KNOWLEDGE PACK — ${pack.manufacturer} ${pack.part_number}` +
      (pack.revision ? ` (rev ${pack.revision})` : '') +
      ` · path=${path}` +
      `\n\nPack version ${pack.hkp_version} · primary source: ${pack.primary_source}` +
      (pack.signing_verified ? ` · signed by ${pack.signed_by}` : '') +
      `. Treat the **classification tag on each claim as load-bearing**: when a value drives a critical firmware path (interrupt timing, power calculations, secure-storage addresses), surface the tag in your output. Any \`[AI-unverified ⚠]\` value used critically must produce an explicit warning. Regional sourcing entries with counterfeit_risk ≥ high should never be silently accepted for Tier 2 / Tier 3 builds.`;

    return [header, ...ordered].join('\n\n');
  } catch (err) {
    console.warn('[buildHardwareHkpLayer] failed:', err instanceof Error ? err.message : err);
    return '';
  }
}

interface DiagnosticCaseRow {
  case_id: string;
  title: string;
  severity: string | null;
  case_data: unknown;
}

function renderSpecificationBlock(
  pack: { manufacturer: string; part_number: string },
  claims: Array<{ claim_path: string; claim_value: string; classification: string; notes: string | null }>,
  components: Array<{ component_type: string; name: string; metadata: Record<string, unknown> }>,
  regionalAlts: Array<{ region: string; alternative_part: string; distributor: string | null;
                        typical_price_local: number | null; typical_price_currency: string | null;
                        counterfeit_risk: string | null; notes: string | null }>,
  claimLimit: number,
): string {
  if (claims.length === 0 && components.length === 0 && regionalAlts.length === 0) return '';

  const lines: string[] = ['### Specification layer'];

  if (claims.length > 0) {
    lines.push('', '**Datasheet & community claims** (showing up to ' + claimLimit + ' most relevant):');
    const ordered = [...claims].sort((a, b) => {
      const order = ['datasheet-verified', 'physically-verified', 'community-verified', 'AI-unverified'];
      return order.indexOf(a.classification) - order.indexOf(b.classification)
        || a.claim_path.localeCompare(b.claim_path);
    });
    for (const c of ordered.slice(0, claimLimit)) {
      const tag = CLASSIFICATION_TAGS[c.classification] ?? `[${c.classification}]`;
      const notes = c.notes ? ` _(${c.notes})_` : '';
      lines.push(`- \`${c.claim_path}\` = **${c.claim_value}** ${tag}${notes}`);
    }
    if (claims.length > claimLimit) {
      lines.push(`- _… ${claims.length - claimLimit} more claims not shown_`);
    }
  }

  if (components.length > 0) {
    lines.push('', '**Components & peripherals:**');
    for (const c of components) {
      lines.push(`- _${c.component_type}_ — **${c.name}** ${summariseMetadata(c.metadata)}`);
    }
  }

  if (regionalAlts.length > 0) {
    lines.push('', '**Regional sourcing alternatives** (verify counterfeit signals before procurement):');
    const byRegion: Record<string, typeof regionalAlts> = {};
    for (const a of regionalAlts) (byRegion[a.region] ??= []).push(a);
    for (const region of Object.keys(byRegion).sort()) {
      lines.push(`- _${region}_:`);
      for (const a of byRegion[region]) {
        const price = a.typical_price_local !== null
          ? `${a.typical_price_local} ${a.typical_price_currency ?? ''}`.trim()
          : 'price n/a';
        const risk = a.counterfeit_risk ? ` · counterfeit risk: **${a.counterfeit_risk}**` : '';
        const dist = a.distributor ? ` via ${a.distributor}` : '';
        lines.push(`  - **${a.alternative_part}**${dist} — ${price}${risk}`);
        if (a.notes) lines.push(`    > ${a.notes}`);
      }
    }
  }

  return lines.join('\n');
}

function summariseMetadata(meta: Record<string, unknown>): string {
  if (!meta || Object.keys(meta).length === 0) return '';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(meta)) {
    if (Array.isArray(v)) parts.push(`${k}=[${v.join(',')}]`);
    else if (typeof v === 'object' && v !== null) continue;
    else parts.push(`${k}=${String(v)}`);
    if (parts.length >= 6) { parts.push('…'); break; }
  }
  return parts.length ? `(${parts.join(', ')})` : '';
}

function renderDiagnosticBlock(rows: DiagnosticCaseRow[]): string {
  if (rows.length === 0) return '';
  const lines: string[] = ['### Diagnostic layer (community-curated cases)'];
  for (const r of rows) {
    const data = (typeof r.case_data === 'string' ? safeParse(r.case_data) : r.case_data) as Record<string, unknown> | null;
    const symptoms = (data?.symptoms as Array<{ description?: string; pattern?: string }> | undefined) ?? [];
    const causes = (data?.probable_causes as Array<{ description?: string; cause?: string; likelihood?: string }> | undefined) ?? [];
    const sevTag = r.severity ? ` _(${r.severity})_` : '';
    lines.push(`- **${r.case_id}** — ${r.title}${sevTag}`);
    if (symptoms.length > 0) {
      const top = symptoms.slice(0, 2).map(s => s.description ?? s.pattern ?? '').filter(Boolean).join(' · ');
      if (top) lines.push(`  - symptoms: ${top}`);
    }
    if (causes.length > 0) {
      const top = causes.slice(0, 2).map(c => c.description ?? c.cause ?? '').filter(Boolean).join(' · ');
      if (top) lines.push(`  - causes: ${top}`);
    }
  }
  return lines.join('\n');
}

function renderLifecycleBlock(events: Array<{
  event_id: string; event_type: string; title: string; severity: string | null;
  cvss_score: number | null; published_at: string; source: string;
}>): string {
  if (events.length === 0) return '';
  const lines: string[] = ['### Lifecycle layer (active advisories & events, last 365d)'];
  for (const e of events) {
    const sev = e.cvss_score ? `CVSS ${e.cvss_score}` : (e.severity ?? 'severity n/a');
    const published = e.published_at?.slice(0, 10) ?? 'date n/a';
    lines.push(`- _${e.event_type}_ · **${e.event_id}** — ${e.title} (${sev}, ${published}, source: ${e.source})`);
  }
  return lines.join('\n');
}

function safeParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}
