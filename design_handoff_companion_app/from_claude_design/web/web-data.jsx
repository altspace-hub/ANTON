// web-data.jsx — fake-but-realistic content for the ANTON web prototype.
// Pulled from the current screenshots + module list.

const WEB_DATA = {
  user: {
    name: 'Daniel Bardun',
    role: 'Founder',
    org: 'openEXPERT',
    initials: 'DB',
    antonVersion: 'v0.7.5',
  },

  // The 7 top-of-web pillars (from your screenshots' top bar)
  pillars: [
    { id: 'work', label: 'Work', icon: 'briefcase' },
    { id: 'school', label: 'School', icon: 'academic' },
    { id: 'life', label: 'Life', icon: 'heart' },
    { id: 'collab', label: 'Collaboration', icon: 'users' },
    { id: 'markets', label: 'Markets', icon: 'chart' },
    { id: 'payments', label: 'Payments', icon: 'wallet' },
    { id: 'pathfinder', label: 'Pathfinder', icon: 'compass' },
  ],

  // Sidebar favorites (starred)
  favorites: [
    { id: 'home', label: 'Home', icon: 'home' },
    { id: 'engagement', label: 'Engagement Tasks', icon: 'checklist', badge: 3 },
    { id: 'discover', label: 'Discover', icon: 'sparkles' },
    { id: 'open-chat', label: 'Open Chat', icon: 'message' },
    { id: 'task-agent', label: 'ANTON Task Agent', icon: 'terminal' },
    { id: 'orchestrator', label: 'ANTON Orchestrator', icon: 'grid' },
    { id: 'counsel', label: 'Counsel’s Desk', icon: 'scale' },
    { id: 'gap', label: 'Gap Assessor', icon: 'shield' },
    { id: 'ngo', label: 'NGO & Social Impact', icon: 'heart' },
    { id: 'trades', label: 'Trades & Service Workers', icon: 'briefcase' },
    { id: 'coding', label: 'Coding', icon: 'terminal' },
    { id: 'my-work', label: 'My Work', icon: 'folder' },
    { id: 'workflows', label: 'Workflows', icon: 'checklist' },
    { id: 'build', label: 'Build Module', icon: 'plus' },
    { id: 'kb', label: 'Knowledge Base', icon: 'book' },
    { id: 'intel', label: 'Intelligence', icon: 'chart' },
    { id: 'radar', label: 'Radar', icon: 'radar' },
  ],

  // Top-level sidebar section headers (below favorites)
  sidebarSections: [
    { id: 'modes', label: 'Interactive Modes' },
    { id: 'tools', label: 'Tools & Features' },
    { id: 'modules', label: 'Modules' },
  ],

  // Today's brief (replaces the loud stat cards)
  brief: {
    greeting: 'Good afternoon',
    date: 'Wednesday, 18 March 2026',
    summary: 'Three items need you today. ANTON saved 37.5h this month — about 8.7h per €1 of API spend.',
    stats: [
      { label: 'Sessions', value: '20', delta: '+3 this week' },
      { label: 'AI responses', value: '19', delta: '+5 this week' },
      { label: 'Output tokens', value: '57,720', delta: 'kept fresh' },
      { label: 'This month', value: '15', delta: '8.7h / €1 ROI' },
    ],
    atRisk: [
      { title: 'PTD Presentation', hint: 'Started 6h of 40h (24%)', due: 'This week', sev: 'red' },
      { title: 'Sanctions policy v4 review', hint: 'Board sign-off due Friday', due: 'Fri 20 Mar', sev: 'gold' },
      { title: 'Q1 evidence pack', hint: 'Re-run Pathfinder to refresh', due: 'Mon 23 Mar', sev: 'gold' },
    ],
  },

  // Continue your work
  continueWork: [
    { id: 1, label: 'Futurechain Session Open Ready to Assist', module: 'open-chat', when: '29 Mar', tokens: '15.4k', accent: 'gold' },
    { id: 2, label: 'Assess Orion Sanctions Policy Against…', module: 'Sanctions', when: '29 Mar', tokens: '6.9k', accent: 'emerald' },
    { id: 3, label: 'Analyze Order Book Trends for Forecasting', module: 'Script Lite', when: '29 Mar', tokens: '5.4k', accent: 'blue' },
    { id: 4, label: 'Establish ANTON Session with Daniel Ba…', module: 'open-chat', when: '28 Mar', tokens: '331 tok', accent: 'gold' },
  ],

  // Custom modules to route from Home
  findModuleSuggestions: [
    'Review a contract for hidden risks',
    'Identify gaps in our AML policy',
    'Create a training deck for new staff',
    'Analyse ESG risks in our supply chain',
    'Build a cash flow forecast for my market stall',
  ],

  // Module grid — first category from screenshot
  moduleCategories: [
    {
      id: 'fincrime',
      label: 'Financial crime prevention',
      accent: 'emerald',
      count: 24,
      modules: [
        { id: 'amlr-gap', name: 'AMLR Gap Analysis', icon: 'search', desc: 'Analyse compliance gaps against AMLR and other regulatory frameworks. Upload client documents, point to regulations, and get structured gap assessments.', tone: 'accent' },
        { id: 'doc-creation', name: 'Document Creation', icon: 'folder', desc: 'Create AML policies, SWRAs, KYC procedures, training programmes, and other compliance documents from templates or from scratch.', tone: 'blue' },
        { id: 'sanctions', name: 'Sanctions Advisory', icon: 'shield', desc: 'Sanctions regime briefings, screening assessments, policy reviews, de-risking analysis, and incident response guidance.', tone: 'gold' },
        { id: 'reg-monitor', name: 'Regulatory Monitor', icon: 'radar', desc: 'Analyse new regulatory developments, consultation papers, and guideline updates. Get impact assessments and implementation briefings.', tone: 'accent' },
        { id: 'training', name: 'Training Content', icon: 'book', desc: 'Generate training materials for different audiences: Board, Compliance, Front-line staff, Relationship managers, Operations/IT.', tone: 'blue' },
        { id: 'data-mgmt', name: 'AMLA Data Management', icon: 'grid', desc: 'AMLA data readiness assessments, data quality scoring, gap identification, and implementation planning for data management requirements.', tone: 'blue' },
        { id: 'risk-assess', name: 'Risk Assessment', icon: 'chart', desc: 'ML/TF risk assessment support: maturity scoring, risk factor analysis, inherent/residual risk evaluation, control effectiveness.', tone: 'gold' },
        { id: 'investigation', name: 'Investigation Support', icon: 'search', desc: 'Structure investigation analysis, case documentation, and suspicious-activity reporting. Does NOT make compliance decisions — structured analysis only.', tone: 'red' },
      ],
    },
  ],

  // Sanctions Advisory working state (from the dense screenshot)
  sanctionsRun: {
    title: 'Sanctions Advisory',
    subtitle: 'Sanctions regime briefings, screening assessments, policy reviews, de-risking analysis, incident response guidance.',
    depth: [
      { id: 'quick', label: 'Quick' },
      { id: 'think', label: 'Think' },
      { id: 'think-hard', label: 'Think Hard', selected: true },
      { id: 'invest', label: 'Investigate' },
      { id: 'plan', label: 'Plan First' },
      { id: 'deep', label: 'Deep', badge: 'BETA' },
    ],
    model: 'Claude Haiku 4.5',
    precision: ['Strict', 'Precise', 'Balanced', 'Creative', 'Exploratory'],
    precisionSelected: 2,
    writing: ['Strict', 'Balanced', 'Creative'],
    writingSelected: 0,
    writingDesc: 'Precise, factual, formal regulatory language.',
    output: {
      title: 'Sanctions policy v4 — Board submission',
      meta: '3,523 words · 18 min read · 10 sections · 3 citations · 33% incomplete',
      body: `**Summary.** ICA's current sanctions framework meets minimum supervisory expectations but lags Nordic peers on real-time screening, fuzzy matching, and 2nd-line oversight. The gap is material — board-level decision required this quarter.

**Recommendation.** Approve a three-phase uplift over 2026:
 · Phase 1 (Q2) — Governance & appointments. Sanctions Compliance Officer in post by end-March; revised governance framework documented.
 · Phase 2 (Q3) — Operational procedures. SREA completed by end-May; all operational procedures designed, tested, and documented by end-August.
 · Phase 3 (Q4) — Policy and training. Policy v4.0 approved by Board by end-September; staff training completed. Full compliance achieved by end-December; supervisory file prepared.

**Reputational risk — MEDIUM.** In an environment of heightened geopolitical sanctions (Russia, Iran, Venezuela, North Korea), regulators and media scrutiny are high. A sanctions breach at a Swedish bank would have significant reputational and financial consequences.

**Competitive risk — MEDIUM.** Peer institutions are likely investing in EBA compliance now. Delayed implementation may reduce ICA's ability to partner with international correspondents or access certain customer segments if compliance readiness is questioned.

Document prepared: 27 March 2026 · Status: Ready for Board Submission`,
    },
    reviewRequired: true,
    transform: [
      { id: 'exec', label: 'Executive one-pager', badge: 'BETA', active: true },
      { id: 'plain', label: 'Plain language (CEFR B1)', badge: 'BETA', active: true },
    ],
    nextSteps: [
      { title: 'Run Sanctions Gap Analysis', desc: 'Analyse sanctions framework for gaps' },
      { title: 'Update Sanctions Policy', desc: 'Revise your sanctions policy to reflect findings' },
    ],
  },

  // Pathfinder state
  pathfinder: {
    query: 'What are the latest RTS within AMLR from AMLA',
    depth: [{ id: 'quick', label: 'Quick' }, { id: 'through', label: 'Thorough', selected: true }, { id: 'deep', label: 'Deep' }],
    sources: [
      { title: 'Regulatory Technical Standards package on compliance of institutions…', type: 'Web', host: 'eba.europa.eu', trust: 'high' },
      { title: 'Consultation on the draft RTS on Customer Due Diligence — AMLA', type: 'Web', host: 'amla.europa.eu', trust: 'high' },
      { title: 'The EBA consults on new rules on the anti-money laundering / CTF…', type: 'Web', host: 'eba.europa.eu', trust: 'high' },
      { title: 'Regulatory Instruments — AMLA', type: 'Web', host: 'amla.europa.eu', trust: 'high' },
      { title: 'Final Report — AMLA', type: 'Web', host: 'amla.europa.eu', trust: 'high' },
      { title: 'EBA advises the Commission on the foundations of the new AML/CFT regime', type: 'Web', host: 'globalbanking.com', trust: 'medium' },
      { title: 'AMLA publishes Final Report on Draft Regulatory Technical Standards…', type: 'Web', host: 'jurnal.eu', trust: 'medium' },
      { title: 'Two New EU AML Regulatory Technical Standards — Anti-Money Laundering', type: 'Web', host: 'money-laundering-news.com', trust: 'medium' },
      { title: 'AMLA proposes rules to strengthen AML/CFT framework in EU', type: 'Web', host: 'compliancetoday.eu', trust: 'medium' },
      { title: 'The EU\'s Regulatory Technical Standards: 4 key changes', type: 'Web', host: 'napier.ai', trust: 'medium' },
    ],
    answer: {
      title: 'Overview of AMLA\'s RTS Activity Under the EU AML Package',
      body: `AMLA (the Authority for Anti-Money Laundering and Countering the Financing of Terrorism) is currently developing and finalising Regulatory Technical Standards across the EU AML legislative package, which comprises three instruments: the Anti-Money Laundering Regulation (AMLR, Regulation (EU) 2024/1624), the Sixth Anti-Money Laundering Directive (AMLD6, Directive (EU) 2024/1640), and the AMLA Regulation (Regulation (EU) 2024/1620). The two most advanced RTS are set out below.

**RTS 1 — Customer Due Diligence (Article 28(1) AMLR).** This is the primary RTS of the AMLR and the most current regulatory activity.
· Legal basis: Article 28(1) of Regulation (EU) 2024/1624 (AMLR)
· Status: Consultation launched 9 February 2026 and open for stakeholder input; AMLA must submit the final draft to the European Commission by 10 July 2026
· Scope: Specifies the information and documents to be collected when performing standard, simplified, and enhanced customer due diligence on customers and beneficial owners
· Primary source: AMLA Consultation on Draft RTS on Customer Due Diligence

**RTS 2 — Risk Assessment Methodology (Article 40(2) AMLD6 and Article 12(7) AMLAR).** This is the most recently completed regulatory output from AMLA, though it is technically grounded in AMLD6 and AMLAR rather than AMLR itself. It is directly relevant to how supervisors — including AMLA in its direct supervisory role — will assess and select firms for direct supervision by AMLA.
· Legal basis: Article 40(2) of Directive (EU) 2024/1640 (AMLD6) and Article 12(7) of Regulation (EU) 2024/1620
· Status: Final Report submitted to the European Commission 30 October 2025; Final Report published 16 December 2025
· Scope: Two interconnected elements…`,
    },
    why: 'The AMLA official consultation page and the AMLA Final Report PDF are direct regulatory outputs from the primary authority — they are the highest-authority sources available and are contemporaneous with the regulatory process. Secondary corroboration from the FIAU (a national supervisory authority) and the EBA\'s own pages confirms factual…',
  },

  // Open Chat (conversation list + current thread)
  chatHistory: [
    { id: 1, title: 'Futurechain Session Open Ready to A…', when: '2026-03-29' },
    { id: 2, title: 'Establish ANTON Session with Daniel…', when: '2026-03-29' },
    { id: 3, title: 'Explain EBA De-Risking Guidelines Pr…', when: '2026-03-28' },
    { id: 4, title: 'Draft a CDD procedure outline', when: '2026-03-28' },
    { id: 5, title: 'Greeting and Assistance Offer', when: '2026-03-28' },
    { id: 6, title: 'Explain EBA guidelines on de-risking', when: '2026-03-27' },
    { id: 7, title: 'Compare FATF vs EU approach to bu…', when: '2026-03-27' },
    { id: 8, title: 'Draft Customer Due Diligence Proced…', when: '2026-03-26' },
    { id: 9, title: 'Beneficial Ownership Transparency f…', when: '2026-03-26' },
    { id: 10, title: 'Explain EBA De-Risking Guidelines Pr…', when: '2026-03-25' },
    { id: 11, title: 'General Compliance Consultation O…', when: '2026-03-25' },
    { id: 12, title: 'Clarifying Futurechain regulatory sup…', when: '2026-03-24' },
    { id: 13, title: 'ANTON Session Initialized Awaiting In…', when: '2026-03-20' },
    { id: 14, title: 'Welcome Greeting and Task Offer', when: '2026-03-17' },
  ],

  // Engagement tasks (for Direction C sample)
  engagement: {
    title: 'ICA Eng 2 · ICA',
    phase: 'Phase 2A · Client Intelligence',
    progress: 29,
    phases: [
      { id: 'setup', label: 'Setup', status: 'done', icon: 'grid' },
      { id: 'team', label: 'Team', status: 'done', icon: 'users' },
      { id: 'scope', label: 'Scope', status: 'done', icon: 'filter' },
      { id: 'intel', label: 'Intelligence', status: 'active', icon: 'book' },
      { id: 'expert', label: 'Expert Config', status: 'todo', icon: 'settings' },
      { id: 'resources', label: 'Resources', status: 'todo', icon: 'folder' },
      { id: 'blueprint', label: 'Blueprint', status: 'todo', icon: 'grid' },
      { id: 'plan', label: 'Plan', status: 'todo', icon: 'checklist' },
      { id: 'execute', label: 'Execute', status: 'todo', icon: 'send' },
      { id: 'review', label: 'Review', status: 'todo', icon: 'check' },
      { id: 'quality', label: 'Quality', status: 'todo', icon: 'star' },
    ],
  },
};

Object.assign(window, { WEB_DATA });
