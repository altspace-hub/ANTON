import { CheckCircle, XCircle, AlertCircle } from 'lucide-react';

interface ComparisonRow {
  dimension: string;
  anton: { value: string; positive: boolean };
  competitor: { value: string; positive: boolean };
  whyItMatters: string;
}

interface CompetitorCard {
  name: string;
  tagline: string;
  color: string;
  rows: ComparisonRow[];
}

const COMPETITORS: CompetitorCard[] = [
  {
    name: 'Claude Cowork',
    tagline: 'Anthropic\'s new enterprise plugin platform (launched Feb 24, 2026)',
    color: 'border-adv-blue',
    rows: [
      {
        dimension: 'Approach',
        anton: { value: 'Professional methodology + seven-layer prompt architecture', positive: true },
        competitor: { value: 'Task execution via enterprise plugins', positive: false },
        whyItMatters: 'ANTON\'s methodology produces audit-grade outputs, not just task completion.',
      },
      {
        dimension: 'AI Providers',
        anton: { value: 'Claude, GPT-4, Mistral, Gemini, Ollama (any model)', positive: true },
        competitor: { value: 'Claude only', positive: false },
        whyItMatters: 'Model independence protects against vendor lock-in and price changes.',
      },
      {
        dimension: 'Data Residency',
        anton: { value: 'Local-first: all data stays on your machine', positive: true },
        competitor: { value: 'Cloud-dependent: data sent to Anthropic + partner systems', positive: false },
        whyItMatters: 'Critical for regulated industries. Your client data never leaves your network.',
      },
      {
        dimension: 'Governance',
        anton: { value: 'Full audit trail, compliance rules, quality scoring on every output', positive: true },
        competitor: { value: 'No in-built governance framework', positive: false },
        whyItMatters: 'Regulators increasingly expect AI governance documentation.',
      },
      {
        dimension: 'Cost Model',
        anton: { value: 'Open source + your own API key (pay API costs only)', positive: true },
        competitor: { value: 'Enterprise subscription pricing (announced ~$30–50/user/month)', positive: false },
        whyItMatters: 'For a 10-person team: ANTON ~€200/month vs Cowork ~€300–500/month.',
      },
      {
        dimension: 'Domain Depth',
        anton: { value: '238+ modules across 29 professional domains', positive: true },
        competitor: { value: '10 industry plugins (finance ×5, HR, engineering, ops, design, brand)', positive: false },
        whyItMatters: 'ANTON covers compliance, legal, audit, risk, consulting, coding, and more.',
      },
    ],
  },
  {
    name: 'ChatGPT / Microsoft Copilot',
    tagline: 'General-purpose AI assistants — widely used but not domain-trained',
    color: 'border-adv-green',
    rows: [
      {
        dimension: 'Domain Expertise',
        anton: { value: '238 modules with area-specific methodology and expert personas', positive: true },
        competitor: { value: 'General AI — no domain training or methodology enforcement', positive: false },
        whyItMatters: 'A senior MLRO persona + AMLR methodology produces fundamentally better compliance outputs.',
      },
      {
        dimension: 'Output Quality',
        anton: { value: 'Trust Score on every output with multi-dimensional quality check', positive: true },
        competitor: { value: 'No quality scoring — user must judge output quality manually', positive: false },
        whyItMatters: 'Quality ratchet catches regressions. Clients can see the Trust Score on deliverables.',
      },
      {
        dimension: 'Workflow Governance',
        anton: { value: 'Checkpoint decisions, human review integration, version history', positive: true },
        competitor: { value: 'No governance layer — outputs are unmanaged', positive: false },
        whyItMatters: 'Professional services require review trails, not just AI outputs.',
      },
      {
        dimension: 'Knowledge Sources',
        anton: { value: 'Local folders, direct URL ingestion, RAG retrieval, web search', positive: true },
        competitor: { value: 'File upload only (Copilot: SharePoint integration); no local folder access', positive: false },
        whyItMatters: 'ANTON reads your entire document library — regulation texts, client docs, templates.',
      },
      {
        dimension: 'Privacy',
        anton: { value: 'Fully local — no data sent anywhere except API calls', positive: true },
        competitor: { value: 'All conversations stored in Microsoft/OpenAI cloud', positive: false },
        whyItMatters: 'Client confidentiality requirements prohibit cloud storage of case details.',
      },
    ],
  },
  {
    name: 'Harvey / Legal AI',
    tagline: 'Specialised legal AI — closed source, subscription, cloud-only',
    color: 'border-adv-gold',
    rows: [
      {
        dimension: 'Domain Coverage',
        anton: { value: '29 professional domains including Legal, FCP, Audit, Consulting, HR, and more', positive: true },
        competitor: { value: 'Legal domain only', positive: false },
        whyItMatters: 'Modern compliance work spans legal, FCP, risk, and advisory — all in one tool.',
      },
      {
        dimension: 'Source Model',
        anton: { value: 'Open source (MIT licence) — inspect, modify, self-host', positive: true },
        competitor: { value: 'Closed source — black box, no inspection', positive: false },
        whyItMatters: 'Open source enables firm-specific customisation and independent audit of AI behaviour.',
      },
      {
        dimension: 'Cost Structure',
        anton: { value: 'API cost only (~€0.10–3.00 per analysis depending on depth)', positive: true },
        competitor: { value: 'Subscription: ~$200–500/user/month (enterprise)', positive: false },
        whyItMatters: 'For a 5-person team: ANTON ~€500/month vs Harvey ~€1,000–2,500/month.',
      },
      {
        dimension: 'Data Sovereignty',
        anton: { value: 'Local-first, self-hosted database, no cloud dependency', positive: true },
        competitor: { value: 'Cloud-only — data processed and stored on Harvey\'s servers', positive: false },
        whyItMatters: 'Nordic data protection requirements may prohibit cloud processing of client data.',
      },
      {
        dimension: 'Customisation',
        anton: { value: 'Build custom modules, skills, personas, workflows per client', positive: true },
        competitor: { value: 'Template-based with limited customisation', positive: false },
        whyItMatters: 'Every client engagement has unique context — ANTON adapts, Harvey doesn\'t.',
      },
    ],
  },
  {
    name: 'Cursor / Coding AI Tools',
    tagline: 'AI-powered coding assistants — great at code, limited outside it',
    color: 'border-adv-red',
    rows: [
      {
        dimension: 'Scope',
        anton: { value: 'Full professional delivery platform: compliance, legal, finance, coding, presentations', positive: true },
        competitor: { value: 'Code generation only', positive: false },
        whyItMatters: 'Compliance teams need regulatory analysis, not just code review.',
      },
      {
        dimension: 'Expert Governance',
        anton: { value: 'Expert panel review: regulator\'s eye, board member, auditor perspectives', positive: true },
        competitor: { value: 'No governance, review, or domain expertise layer', positive: false },
        whyItMatters: 'ANTON\'s review engine catches issues a pure coding tool never would.',
      },
      {
        dimension: 'Domain Context',
        anton: { value: '29 domain areas with pre-built regulatory and professional knowledge', positive: true },
        competitor: { value: 'No domain context outside software engineering', positive: false },
        whyItMatters: 'AML, GDPR, and financial regulations require deep domain knowledge beyond code.',
      },
      {
        dimension: 'Output Formats',
        anton: { value: '20+ output formats: executive summary, gap matrix, policy document, PPTX, and more', positive: true },
        competitor: { value: 'Code files and markdown only', positive: false },
        whyItMatters: 'Professional deliverables require board PDFs, Excel trackers, and DOCX reports.',
      },
    ],
  },
];

function StatusIcon({ positive }: { positive: boolean }) {
  if (positive) return <CheckCircle className="h-4 w-4 shrink-0 text-adv-green" />;
  return <XCircle className="h-4 w-4 shrink-0 text-adv-red" />;
}

export default function ComparisonPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      {/* Header */}
      <div className="rounded-xl border border-border bg-adv-card p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-adv-teal">
            <span className="text-lg font-bold text-adv-dark">A</span>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-adv-white">How ANTON Compares</h1>
            <p className="mt-1 text-sm text-adv-gray">
              ANTON is an open-source, local-first professional AI platform built for compliance, legal, and consulting work.
              Here's how it positions against the tools your clients and competitors are evaluating.
            </p>
          </div>
        </div>

        {/* Summary chips */}
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            '🔒 Local-first — your data stays on your machine',
            '🌐 Any AI model — Claude, GPT, Mistral, Ollama',
            '📊 Trust Score on every output',
            '⚖️ Open source (MIT licence)',
            '🏛️ Full governance & audit trail',
          ].map((chip) => (
            <span key={chip} className="rounded-full border border-adv-teal/30 bg-adv-teal/10 px-3 py-1 text-xs text-adv-teal">
              {chip}
            </span>
          ))}
        </div>
      </div>

      {/* Competitor comparison cards */}
      {COMPETITORS.map((competitor) => (
        <div key={competitor.name} className={`rounded-xl border-2 ${competitor.color} bg-adv-card overflow-hidden`}>
          {/* Card header */}
          <div className="border-b border-border px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-adv-white">ANTON vs. {competitor.name}</h2>
                <p className="mt-0.5 text-xs text-adv-gray">{competitor.tagline}</p>
              </div>
              <AlertCircle className="h-5 w-5 shrink-0 text-adv-gray" />
            </div>
          </div>

          {/* Comparison table */}
          <div className="divide-y divide-border">
            {/* Column headers */}
            <div className="grid grid-cols-4 gap-4 px-6 py-2 text-[11px] font-medium uppercase tracking-wider text-adv-gray">
              <span>Dimension</span>
              <span>ANTON</span>
              <span>{competitor.name}</span>
              <span>Why It Matters</span>
            </div>

            {competitor.rows.map((row, i) => (
              <div key={i} className="grid grid-cols-4 gap-4 px-6 py-3.5">
                <div className="text-sm font-medium text-adv-off-white">{row.dimension}</div>
                <div className="flex items-start gap-1.5">
                  <StatusIcon positive={row.anton.positive} />
                  <span className="text-xs text-adv-off-white leading-relaxed">{row.anton.value}</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <StatusIcon positive={row.competitor.positive} />
                  <span className="text-xs text-adv-gray leading-relaxed">{row.competitor.value}</span>
                </div>
                <div className="text-xs text-adv-gray leading-relaxed italic">{row.whyItMatters}</div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Bottom note */}
      <div className="rounded-xl border border-border bg-adv-card p-4 text-center">
        <p className="text-xs text-adv-gray">
          Comparison data as of February 2026. Competitor pricing and features change frequently.
          ANTON is open source — <span className="text-adv-teal">fork it, customise it, own it.</span>
        </p>
      </div>
    </div>
  );
}
