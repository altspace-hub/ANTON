/**
 * SystemCardsPage.tsx
 * EUAI-03: EU AI Act Art. 13 — Transparency documentation.
 * Plain-language system cards per module: capabilities, limitations, failure modes.
 *
 * Route: /system-cards
 * Route: /system-cards/:moduleId
 */

import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ShieldAlert, FileText, Search, ExternalLink, AlertTriangle,
  CheckCircle2, XCircle, Info, ChevronRight, ChevronLeft, Scale,
} from 'lucide-react';

interface SystemCard {
  moduleId: string;
  label: string;
  area: string;
  riskLevel: 'high' | 'medium' | 'low';
  purposeStatement: string;
  capabilities: string[];
  limitations: string[];
  failureModes: string[];
  humanOversightRequired: boolean;
  notIntendedFor: string[];
  dataUsed: string[];
  knowledgeCutoff: string;
  version: string;
  lastUpdated: string;
}

const SYSTEM_CARDS: SystemCard[] = [
  {
    moduleId: 'gap-analysis',
    label: 'AMLR Gap Analysis',
    area: 'Financial Crime Prevention',
    riskLevel: 'high',
    purposeStatement:
      'Assists compliance professionals in identifying gaps between an organisation\'s current AML/CFT controls and the requirements of the EU Anti-Money Laundering Regulation (AMLR 2024/1624).',
    capabilities: [
      'Identifies potential gaps between submitted documents and AMLR requirements',
      'Produces structured gap scoring matrices (RAG-rated) for internal planning purposes',
      'Generates suggested remediation actions with priority rankings',
      'Cross-references uploaded documents against regulatory knowledge packs when provided',
      'Produces executive summaries and action plans as advisory outputs',
    ],
    limitations: [
      'Does NOT constitute a legal or regulatory compliance opinion',
      'Analysis quality depends entirely on the completeness of documents provided by the user',
      'Knowledge of regulations is limited to the model\'s training cut-off and any loaded knowledge packs',
      'Cannot assess implementation quality — only reviews what is documented',
      'May miss jurisdiction-specific national transposition nuances',
      'Cannot access the organisation\'s live systems, transaction data, or operational controls',
    ],
    failureModes: [
      'If documents are incomplete, gaps may be under-identified (false confidence)',
      'If regulation text has been updated after the knowledge cut-off, analysis may be outdated',
      'Ambiguous regulatory language may lead to over- or under-reporting of gaps',
      'Very large document volumes may exceed context limits, causing silent truncation',
      'The model may hallucinate specific article references — always verify citations against source text',
    ],
    humanOversightRequired: true,
    notIntendedFor: [
      'Making final compliance determinations',
      'Replacing qualified legal or regulatory counsel',
      'Use without professional review of AI-generated outputs',
      'Automated submission to regulatory authorities',
    ],
    dataUsed: [
      'Documents uploaded by the user (processed locally — not retained by Anthropic)',
      'Regulatory knowledge packs loaded by the user',
      'Claude\'s training data (knowledge cut-off: August 2025)',
    ],
    knowledgeCutoff: 'August 2025',
    version: '1.0',
    lastUpdated: '2026-03-08',
  },
  {
    moduleId: 'sanctions-advisory',
    label: 'Sanctions Advisory',
    area: 'Financial Crime Prevention',
    riskLevel: 'high',
    purposeStatement:
      'Provides advisory assistance to compliance professionals reviewing sanctions regimes, screening policies, and sanctions-related compliance questions. Does not perform real-time sanctions screening.',
    capabilities: [
      'Explains sanctions regimes (OFAC, EU, UK OFSI, UN) based on training knowledge',
      'Reviews sanctions screening policies and procedures against best practice frameworks',
      'Assists with sanctions gap analysis and policy drafting',
      'Provides guidance on EBA Guidelines on sanctions screening implementation',
      'Flags common false-positive scenarios and mitigation approaches',
    ],
    limitations: [
      'Does NOT access live sanctions lists — cannot screen individuals or entities in real time',
      'Sanctions lists change daily — any specific list content may be outdated',
      'Cannot provide legal advice on specific transactions or de-risking decisions',
      'Name-matching guidance is advisory only — cannot replace dedicated screening technology',
      'Does not cover all national sanctions regimes',
    ],
    failureModes: [
      'May cite specific sanctions designations that have since been added, removed, or amended',
      'Guidance on deconfliction between regimes may not reflect the latest supervisory position',
      'False-positive analysis may not account for latest name-normalisation technology',
      'The model may over-apply US OFAC standards in non-US contexts',
    ],
    humanOversightRequired: true,
    notIntendedFor: [
      'Real-time individual or entity sanctions screening',
      'Final determination of whether a transaction is prohibited',
      'Replacing dedicated sanctions screening technology',
      'Legal advice on specific transactions',
    ],
    dataUsed: [
      'User-provided policy documents and context',
      'Claude\'s training data on public sanctions regimes (cut-off: August 2025)',
      'Web search results (if enabled by user)',
    ],
    knowledgeCutoff: 'August 2025',
    version: '1.0',
    lastUpdated: '2026-03-08',
  },
  {
    moduleId: 'investigation-support',
    label: 'Investigation & Case Support',
    area: 'Financial Crime Prevention',
    riskLevel: 'high',
    purposeStatement:
      'Assists compliance analysts in structuring financial crime investigations, organising evidence, and drafting SAR narratives. Does not make compliance decisions.',
    capabilities: [
      'Structures investigation notes using a 5-phase framework (detection → triage → investigation → decision → reporting)',
      'Identifies typology patterns from provided transaction or case information',
      'Assists with counter-hypothesis analysis to avoid confirmation bias',
      'Helps draft SAR narrative structures (not final SARs)',
      'Produces network mapping guides for complex entity structures',
    ],
    limitations: [
      'Does NOT make the determination that a SAR must be filed — that is a human legal decision',
      'Cannot access live transaction data, core banking systems, or law enforcement databases',
      'Analysis is based only on information provided in the session — cannot independently verify facts',
      'Typology matching is pattern-based and probabilistic — not deterministic',
      'Cannot assess credibility of witnesses or informants',
    ],
    failureModes: [
      'May identify typology matches that are coincidental rather than indicative',
      'Counter-hypothesis analysis may miss important alternative explanations',
      'SAR narrative drafts may require significant professional editing',
      'Complex corporate structures may exceed the model\'s ability to track all entity relationships accurately',
    ],
    humanOversightRequired: true,
    notIntendedFor: [
      'Making the legal decision to file or not file a SAR',
      'Replacing qualified financial crime investigators',
      'Automated case closure decisions',
      'Accessing or processing personal data in ways not permitted under GDPR',
    ],
    dataUsed: [
      'Case information provided by the user in the session',
      'Uploaded documents (processed locally)',
      'Claude\'s training data on financial crime typologies (cut-off: August 2025)',
    ],
    knowledgeCutoff: 'August 2025',
    version: '1.0',
    lastUpdated: '2026-03-08',
  },
  {
    moduleId: 'document-creation',
    label: 'Document Creation',
    area: 'Financial Crime Prevention',
    riskLevel: 'medium',
    purposeStatement:
      'Assists compliance professionals in drafting AML/CFT policy documents, procedures, and governance frameworks as starting-point drafts for professional review.',
    capabilities: [
      'Drafts AML policies, KYC procedures, TM policies, SAR procedures, and sanctions policies',
      'Structures documents according to EBA-aligned frameworks and best practice',
      'Adapts content to specified organisation type, jurisdiction, and customer segments',
      'Produces governance-ready document templates with version control sections',
      'Generates training material outlines and board report structures',
    ],
    limitations: [
      'Drafts require professional legal and compliance review before adoption',
      'May not reflect latest national supervisory guidance without loaded knowledge packs',
      'Organisation-specific risk appetite, culture, and operational context must be added by humans',
      'Cannot include confidential information about specific clients, transactions, or investigations',
    ],
    failureModes: [
      'Generic drafts may not adequately address organisation-specific risks',
      'Procedures may inadvertently include references to outdated regulatory versions',
      'Document structure may not match internal governance requirements',
    ],
    humanOversightRequired: false,
    notIntendedFor: [
      'Final adoption without professional review',
      'Replacing qualified legal counsel for policy sign-off',
    ],
    dataUsed: [
      'User-provided context and existing documents',
      'Claude\'s training data on regulatory frameworks (cut-off: August 2025)',
    ],
    knowledgeCutoff: 'August 2025',
    version: '1.0',
    lastUpdated: '2026-03-08',
  },
  {
    moduleId: 'regulatory-monitor',
    label: 'Regulatory Monitor',
    area: 'Financial Crime Prevention',
    riskLevel: 'low',
    purposeStatement:
      'Assists compliance teams in understanding recent regulatory developments, assessing their impact, and preparing briefings for internal stakeholders.',
    capabilities: [
      'Summarises regulatory publications and consultations',
      'Assesses impact across regulatory, operational, technology, and timeline dimensions',
      'Produces quick briefings and impact assessment structures',
      'Tracks Level 1/2/3 instruments and soft-law guidance',
    ],
    limitations: [
      'Web search results depend on what is publicly indexed at time of query',
      'Does not provide legal advice on compliance obligations',
      'Regulatory interpretation may differ from supervisory authority positions',
    ],
    failureModes: [
      'May mischaracterise the binding vs advisory status of a document',
      'Impact assessment may miss institution-specific implications',
    ],
    humanOversightRequired: false,
    notIntendedFor: [
      'Final legal interpretation of regulatory requirements',
      'Replacing regulatory intelligence subscription services',
    ],
    dataUsed: [
      'User-provided regulatory text and URLs',
      'Web search results (if enabled)',
      'Claude\'s training data (cut-off: August 2025)',
    ],
    knowledgeCutoff: 'August 2025',
    version: '1.0',
    lastUpdated: '2026-03-08',
  },
];

const RISK_CONFIG = {
  high: { label: 'High Risk', className: 'border-adv-red/40 bg-adv-red/10 text-adv-red' },
  medium: { label: 'Medium Risk', className: 'border-adv-gold/40 bg-adv-gold/10 text-adv-gold' },
  low: { label: 'Lower Risk', className: 'border-adv-green/40 bg-adv-green/10 text-adv-green' },
};

function SystemCardDetail({ card }: { card: SystemCard }) {
  const navigate = useNavigate();
  const risk = RISK_CONFIG[card.riskLevel];

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <button
          onClick={() => navigate('/system-cards')}
          className="flex items-center gap-1 text-xs text-adv-gray hover:text-adv-teal transition-colors mt-0.5"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          All system cards
        </button>
      </div>

      <div className="rounded-lg border border-border bg-adv-card p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-adv-off-white">{card.label}</h1>
            <p className="text-xs text-adv-gray mt-0.5">{card.area} · Module ID: <code className="text-adv-teal">{card.moduleId}</code></p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`rounded border px-2.5 py-1 text-xs font-medium ${risk.className}`}>
              {risk.label}
            </span>
            {card.humanOversightRequired && (
              <span className="flex items-center gap-1 rounded border border-adv-gold/40 bg-adv-gold/10 px-2.5 py-1 text-xs text-adv-gold">
                <ShieldAlert className="h-3 w-3" />
                Human oversight required
              </span>
            )}
          </div>
        </div>

        <p className="mt-3 text-sm text-adv-off-white leading-relaxed">{card.purposeStatement}</p>

        <div className="mt-3 flex items-center gap-4 text-xs text-adv-gray">
          <span>Version: {card.version}</span>
          <span>Updated: {card.lastUpdated}</span>
          <span>Knowledge cut-off: {card.knowledgeCutoff}</span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Capabilities */}
        <div className="rounded-lg border border-border bg-adv-card p-4">
          <h2 className="flex items-center gap-2 text-sm font-medium text-adv-off-white mb-3">
            <CheckCircle2 className="h-4 w-4 text-adv-green" />
            What this module CAN do
          </h2>
          <ul className="space-y-1.5">
            {card.capabilities.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-adv-off-white">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-adv-green flex-shrink-0" />
                {c}
              </li>
            ))}
          </ul>
        </div>

        {/* Limitations */}
        <div className="rounded-lg border border-border bg-adv-card p-4">
          <h2 className="flex items-center gap-2 text-sm font-medium text-adv-off-white mb-3">
            <AlertTriangle className="h-4 w-4 text-adv-gold" />
            Known limitations
          </h2>
          <ul className="space-y-1.5">
            {card.limitations.map((l, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-adv-off-white">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-adv-gold flex-shrink-0" />
                {l}
              </li>
            ))}
          </ul>
        </div>

        {/* Failure modes */}
        <div className="rounded-lg border border-border bg-adv-card p-4">
          <h2 className="flex items-center gap-2 text-sm font-medium text-adv-off-white mb-3">
            <XCircle className="h-4 w-4 text-adv-red" />
            Known failure modes
          </h2>
          <ul className="space-y-1.5">
            {card.failureModes.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-adv-off-white">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-adv-red flex-shrink-0" />
                {f}
              </li>
            ))}
          </ul>
        </div>

        {/* Not intended for */}
        <div className="rounded-lg border border-border bg-adv-card p-4">
          <h2 className="flex items-center gap-2 text-sm font-medium text-adv-off-white mb-3">
            <Scale className="h-4 w-4 text-adv-blue" />
            NOT intended for
          </h2>
          <ul className="space-y-1.5">
            {card.notIntendedFor.map((n, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-adv-off-white">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-adv-blue flex-shrink-0" />
                {n}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Data used */}
      <div className="rounded-lg border border-border bg-adv-card p-4">
        <h2 className="flex items-center gap-2 text-sm font-medium text-adv-off-white mb-3">
          <Info className="h-4 w-4 text-adv-gray" />
          Data used by this module
        </h2>
        <ul className="space-y-1 flex flex-wrap gap-2">
          {card.dataUsed.map((d, i) => (
            <li key={i} className="rounded border border-border bg-adv-dark px-2.5 py-1 text-xs text-adv-gray">
              {d}
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-adv-gray text-center">
        This system card was produced in accordance with EU AI Act Art. 13 transparency requirements.
        For questions, contact the system administrator.
      </p>
    </div>
  );
}

export default function SystemCardsPage() {
  const { moduleId } = useParams<{ moduleId?: string }>();
  const [search, setSearch] = useState('');

  // Detail view
  if (moduleId) {
    const card = SYSTEM_CARDS.find((c) => c.moduleId === moduleId);
    if (!card) {
      return (
        <div className="flex flex-col items-center justify-center min-h-64 text-adv-gray">
          <p>System card not found for module: {moduleId}</p>
          <Link to="/system-cards" className="mt-2 text-adv-teal text-sm hover:underline">
            View all system cards
          </Link>
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-4xl p-6">
        <SystemCardDetail card={card} />
      </div>
    );
  }

  // List view
  const filtered = SYSTEM_CARDS.filter(
    (c) =>
      c.label.toLowerCase().includes(search.toLowerCase()) ||
      c.area.toLowerCase().includes(search.toLowerCase()) ||
      c.moduleId.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-5">
      {/* Header */}
      <div className="rounded-lg border border-border bg-adv-card p-5">
        <div className="flex items-start gap-3">
          <FileText className="h-6 w-6 text-adv-teal flex-shrink-0 mt-0.5" />
          <div>
            <h1 className="text-lg font-semibold text-adv-off-white">AI System Cards</h1>
            <p className="text-sm text-adv-gray mt-1">
              Transparency documentation for openEXPERT AI modules in accordance with{' '}
              <strong className="text-adv-off-white">EU AI Act Art. 13</strong> (Transparency and provision of information to deployers).
              Each card describes the module's capabilities, known limitations, failure modes, and appropriate use boundaries.
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 rounded border border-border bg-adv-dark px-3 py-1.5">
          <Search className="h-3.5 w-3.5 text-adv-gray flex-shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search modules..."
            className="flex-1 bg-transparent text-xs text-adv-off-white placeholder:text-adv-gray focus:outline-none"
          />
        </div>
      </div>

      {/* Card grid */}
      <div className="grid gap-3">
        {filtered.map((card) => {
          const risk = RISK_CONFIG[card.riskLevel];
          return (
            <Link
              key={card.moduleId}
              to={`/system-cards/${card.moduleId}`}
              className="flex items-start justify-between gap-4 rounded-lg border border-border bg-adv-card p-4 hover:border-adv-teal/40 transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-adv-off-white group-hover:text-adv-teal transition-colors">
                    {card.label}
                  </span>
                  <span className={`rounded border px-2 py-0.5 text-xs ${risk.className}`}>
                    {risk.label}
                  </span>
                  {card.humanOversightRequired && (
                    <span className="flex items-center gap-1 rounded border border-adv-gold/30 bg-adv-gold/10 px-2 py-0.5 text-xs text-adv-gold">
                      <ShieldAlert className="h-2.5 w-2.5" />
                      Oversight required
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-adv-gray line-clamp-2">{card.purposeStatement}</p>
                <p className="mt-1 text-xs text-adv-gray">
                  {card.capabilities.length} capabilities · {card.limitations.length} limitations · {card.failureModes.length} known failure modes
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-adv-gray group-hover:text-adv-teal transition-colors flex-shrink-0 mt-1" />
            </Link>
          );
        })}

        {filtered.length === 0 && (
          <div className="rounded-lg border border-border bg-adv-card p-8 text-center text-adv-gray text-sm">
            No system cards match your search.
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-adv-gray">
        <span>{SYSTEM_CARDS.length} modules documented · {SYSTEM_CARDS.filter(c => c.humanOversightRequired).length} require human oversight</span>
        <a
          href="https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-adv-teal hover:underline"
        >
          EU AI Act reference
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}
