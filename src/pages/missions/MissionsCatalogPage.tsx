/**
 * MissionsCatalogPage — public-facing browseable mission catalogue.
 *
 * Shipped per Addendum 1 §D.6 part B (closure):
 * - Filterable by category, complexity, status (seeded vs preview)
 * - Each card shows the mission's premise + links to its use-case doc
 * - "Start this mission" CTA pre-fills the Mission Creator with the template id
 *
 * The catalogue is seeded from a static manifest (the 9 use-case docs in
 * docs/missions/use-cases/) — not from /api/mission-templates — because the
 * preview missions aren't in the DB yet. Seeded missions hit /api/mission-templates
 * to enrich the card with live template metadata.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Target, ChevronLeft, BookOpen, PlayCircle, Clock, Sparkles, Filter } from 'lucide-react';
import { fetchWithAuth, getAuthHeader } from '../../lib/api';

// ── Static mission manifest (mirrors docs/missions/use-cases/) ────────────

interface CatalogueEntry {
  slug: string;
  name: string;
  category: 'research' | 'compliance' | 'marketing' | 'sales' | 'commerce' | 'finance' | 'agency' | 'real-estate' | 'intelligence';
  pillar: string;
  premise: string;
  complexity: 'starter' | 'standard' | 'programme';   // starter = quick / 1 sit; standard = days; programme = weeks
  trustPhase: 1 | 2 | 3 | 4;
  templateId: string | null;                          // null = preview, not yet seeded
  emoji: string;
}

const CATALOGUE: CatalogueEntry[] = [
  {
    slug: 'knowledge-synthesis',
    name: 'Knowledge Synthesis',
    category: 'research',
    pillar: 'Work',
    premise: 'Generic research → analysis → synthesis flow. Brief ANTON on a topic, get a structured deliverable.',
    complexity: 'starter',
    trustPhase: 2,
    templateId: 'tmpl_knowledge_synthesis_v1',
    emoji: '📚',
  },
  {
    slug: 'amlr-readiness',
    name: 'AMLR Readiness Programme',
    category: 'compliance',
    pillar: 'Work',
    premise: 'End-to-end programme: FCP scope → Risk Atlas → BWRA → gap analysis → policies → training → audit.',
    complexity: 'programme',
    trustPhase: 3,
    templateId: 'tmpl_amlr_readiness_v1',
    emoji: '🛡️',
  },
  {
    slug: 'content-factory',
    name: 'Content Factory',
    category: 'marketing',
    pillar: 'Work',
    premise: 'Generate, schedule, and publish content across channels with brand-voice consistency.',
    complexity: 'standard',
    trustPhase: 3,
    templateId: 'tmpl_content_factory_v1',
    emoji: '✍️',
  },
  {
    slug: 'outbound-sales-machine',
    name: 'Outbound Sales Machine',
    category: 'sales',
    pillar: 'Work',
    premise: 'Identify accounts, research, draft outreach, follow up, route warm replies — autonomous SDR.',
    complexity: 'programme',
    trustPhase: 4,
    templateId: 'tmpl_outbound_sales_machine_v1',
    emoji: '📈',
  },
  {
    slug: 'ecommerce-autopilot',
    name: 'E-Commerce Autopilot',
    category: 'commerce',
    pillar: 'Work',
    premise: 'Listing optimization, ad management, inventory + order ops across stores and marketplaces.',
    complexity: 'programme',
    trustPhase: 4,
    templateId: 'tmpl_ecommerce_autopilot_v1',
    emoji: '🛒',
  },
  {
    slug: 'financial-analyst',
    name: 'Financial Analyst',
    category: 'finance',
    pillar: 'Work',
    premise: 'Daily / weekly markets digest with thesis tracking, position monitoring, and risk flags.',
    complexity: 'standard',
    trustPhase: 2,
    templateId: 'tmpl_financial_analyst_v1',
    emoji: '📊',
  },
  {
    slug: 'ai-agency',
    name: 'AI Agency',
    category: 'agency',
    pillar: 'Work',
    premise: 'Run a productized AI service offering: client intake → delivery → invoicing — multi-client, multi-deliverable.',
    complexity: 'programme',
    trustPhase: 3,
    templateId: 'tmpl_ai_agency_v1',
    emoji: '🏢',
  },
  {
    slug: 'property-manager',
    name: 'Property Manager',
    category: 'real-estate',
    pillar: 'Work',
    premise: 'Listings, tenant comms, maintenance triage, rent collection across a portfolio of units.',
    complexity: 'programme',
    trustPhase: 4,
    templateId: 'tmpl_property_manager_v1',
    emoji: '🏠',
  },
  {
    slug: 'trend-scout',
    name: 'Trend Scout',
    category: 'intelligence',
    pillar: 'Work',
    premise: 'Watch sources, surface emerging signals, score significance, brief you when patterns cross thresholds.',
    complexity: 'standard',
    trustPhase: 2,
    templateId: 'tmpl_trend_scout_v1',
    emoji: '🔭',
  },
];

const CATEGORIES = ['all', 'research', 'compliance', 'marketing', 'sales', 'commerce', 'finance', 'agency', 'real-estate', 'intelligence'] as const;
const COMPLEXITIES = ['all', 'starter', 'standard', 'programme'] as const;
const STATUSES = ['all', 'seeded', 'preview'] as const;

const COMPLEXITY_META: Record<CatalogueEntry['complexity'], { label: string; classes: string }> = {
  starter:   { label: 'Starter (single sitting)', classes: 'text-adv-blue border-adv-blue/40 bg-adv-blue/10' },
  standard:  { label: 'Standard (days)',          classes: 'text-adv-teal border-adv-teal/40 bg-adv-teal/10' },
  programme: { label: 'Programme (weeks)',        classes: 'text-adv-gold border-adv-gold/40 bg-adv-gold/10' },
};

interface LiveTemplate {
  id: string;
  times_used: number;
  avg_quality_score: number | null;
}

export default function MissionsCatalogPage() {
  const navigate = useNavigate();
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterComplexity, setFilterComplexity] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [liveTemplates, setLiveTemplates] = useState<Record<string, LiveTemplate>>({});

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetchWithAuth('/api/mission-templates', { headers: getAuthHeader() });
        const data = await res.json();
        const map: Record<string, LiveTemplate> = {};
        for (const t of data.templates ?? []) {
          map[t.id] = { id: t.id, times_used: t.times_used ?? 0, avg_quality_score: t.avg_quality_score };
        }
        setLiveTemplates(map);
      } catch { /* silent — catalogue still works without live data */ }
    })();
  }, []);

  const filtered = useMemo(() => {
    return CATALOGUE.filter(m => {
      if (filterCategory !== 'all' && m.category !== filterCategory) return false;
      if (filterComplexity !== 'all' && m.complexity !== filterComplexity) return false;
      if (filterStatus === 'seeded' && !m.templateId) return false;
      if (filterStatus === 'preview' && m.templateId) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!m.name.toLowerCase().includes(q) && !m.premise.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [filterCategory, filterComplexity, filterStatus, search]);

  const seededCount = CATALOGUE.filter(m => m.templateId).length;
  const previewCount = CATALOGUE.length - seededCount;

  function startMission(entry: CatalogueEntry) {
    if (!entry.templateId) return;
    navigate(`/missions/create?template=${encodeURIComponent(entry.templateId)}`);
  }

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-2">
          <Link to="/missions" className="text-adv-gray hover:text-adv-teal" aria-label="Back to my missions">
            <ChevronLeft size={20} />
          </Link>
          <Target className="text-adv-teal" size={24} />
          <h1 className="text-2xl font-semibold">Mission catalogue</h1>
        </div>
        <p className="text-adv-gray text-sm mb-6 max-w-3xl">
          Templated missions ANTON can run for you — from quick research synthesis to multi-week
          compliance programmes. <span className="text-adv-teal">Seeded</span> missions can be
          started right now; <span className="text-adv-gray">previews</span> document the
          intended scope and ship over time.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-adv-card rounded-lg p-3">
            <div className="text-xs text-adv-gray">Total missions</div>
            <div className="text-2xl font-bold text-adv-off-white mt-1">{CATALOGUE.length}</div>
          </div>
          <div className="bg-adv-card rounded-lg p-3">
            <div className="text-xs text-adv-gray">Seeded</div>
            <div className="text-2xl font-bold text-adv-teal mt-1">{seededCount}</div>
          </div>
          <div className="bg-adv-card rounded-lg p-3">
            <div className="text-xs text-adv-gray">Preview</div>
            <div className="text-2xl font-bold text-adv-gray mt-1">{previewCount}</div>
          </div>
          <div className="bg-adv-card rounded-lg p-3">
            <div className="text-xs text-adv-gray">Showing</div>
            <div className="text-2xl font-bold text-adv-blue mt-1">{filtered.length}</div>
          </div>
        </div>

        <div className="flex gap-2 mb-4 flex-wrap items-center">
          <Filter size={14} className="text-adv-gray" />
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
            className="bg-adv-card border border-adv-card px-3 py-2 rounded text-sm">
            {CATEGORIES.map(c => <option key={c} value={c}>{c === 'all' ? 'All categories' : c}</option>)}
          </select>
          <select value={filterComplexity} onChange={e => setFilterComplexity(e.target.value)}
            className="bg-adv-card border border-adv-card px-3 py-2 rounded text-sm">
            {COMPLEXITIES.map(c => <option key={c} value={c}>{c === 'all' ? 'All complexity' : c}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="bg-adv-card border border-adv-card px-3 py-2 rounded text-sm">
            {STATUSES.map(s => <option key={s} value={s}>{s === 'all' ? 'All status' : s}</option>)}
          </select>
          <input
            type="search"
            placeholder="Search missions…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-adv-card border border-adv-card px-3 py-2 rounded text-sm flex-1 min-w-48"
          />
        </div>

        {filtered.length === 0 ? (
          <div className="bg-adv-card rounded-lg p-8 text-center text-adv-gray">
            <Target className="mx-auto mb-2 text-adv-gray/40" size={32} />
            No missions match the current filters.
          </div>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map(m => {
              const live = m.templateId ? liveTemplates[m.templateId] : undefined;
              const cm = COMPLEXITY_META[m.complexity];
              return (
                <li key={m.slug} className="bg-adv-card rounded-lg p-4 flex flex-col gap-3">
                  <div className="flex items-start gap-3">
                    <div className="text-3xl shrink-0">{m.emoji}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h2 className="font-semibold text-base">{m.name}</h2>
                        {m.templateId ? (
                          <span className="text-xs text-adv-teal flex items-center gap-1">
                            <Sparkles size={11} /> seeded
                          </span>
                        ) : (
                          <span className="text-xs text-adv-gray">preview</span>
                        )}
                      </div>
                      <p className="text-sm text-adv-gray">{m.premise}</p>
                      <div className="flex items-center gap-2 flex-wrap mt-2">
                        <code className="text-xs text-adv-teal">{m.category}</code>
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cm.classes}`}>
                          <Clock size={10} className="mr-1" />{cm.label}
                        </span>
                        <span className="text-xs text-adv-gray">Trust phase ≥ {m.trustPhase}</span>
                      </div>
                      {live && (
                        <div className="text-xs text-adv-gray mt-1">
                          Used {live.times_used}× · avg quality {live.avg_quality_score?.toFixed(1) ?? '—'}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-auto">
                    <a
                      href={`/docs/missions/use-cases/${m.slug}.md`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-adv-dark text-adv-off-white hover:bg-adv-dark-2"
                    >
                      <BookOpen size={12} /> Use-case doc
                    </a>
                    {m.templateId ? (
                      <button
                        onClick={() => startMission(m)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-adv-teal text-adv-dark hover:bg-adv-teal-dark font-medium ml-auto"
                      >
                        <PlayCircle size={12} /> Start this mission
                      </button>
                    ) : (
                      <span className="text-xs text-adv-gray ml-auto italic">Not yet seeded</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
