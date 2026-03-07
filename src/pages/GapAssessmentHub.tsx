/**
 * GapAssessmentHub.tsx
 * Landing page for the Compliance Gap Assessor.
 * Shows available frameworks and recent assessments.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardCheck, Plus, ChevronRight, FileSearch, Shield,
  Lock, Globe, CheckSquare, RefreshCw, BarChart3,
} from 'lucide-react';
import { getAuthHeader } from '@/lib/api';

interface Framework {
  id: string;
  name: string;
  shortName: string;
  reference: string;
  applicationDate: string;
  articleCount: number;
  themes: string[];
}

interface Assessment {
  id: string;
  title: string;
  frameworks: string;
  status: string;
  current_step: number;
  created_at: string;
  updated_at: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft:        { label: 'Draft',        color: 'text-adv-gray' },
  assessing:    { label: 'Assessing',    color: 'text-adv-gold' },
  scoring:      { label: 'Scoring',      color: 'text-adv-blue' },
  synthesising: { label: 'Synthesising', color: 'text-adv-teal' },
  complete:     { label: 'Complete',     color: 'text-adv-green' },
  paused:       { label: 'Paused',       color: 'text-adv-gray-med' },
};

const STEP_LABELS = [
  '', 'Framework Selection', 'Scope', 'Context', 'Assessment',
  'Article Scoring', 'Capability View', 'Board Summary', 'Roadmap',
];

const FRAMEWORK_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  'amlr-2024': Shield,
  'dora-2022': Lock,
  'iso27001-2022': CheckSquare,
  'wolfsberg-cbddq': Globe,
};

// Knowledge packs that complement each framework — shown as a suggestion when framework is selected
const FRAMEWORK_PACK_SUGGESTIONS: Record<string, Array<{ id: string; label: string }>> = {
  'amlr-2024':       [{ id: 'amlr-2024', label: 'AMLR 2024' }, { id: 'amla-amld6', label: 'AMLA / AMLD6' }, { id: 'eba-aml-guidelines', label: 'EBA AML Guidelines' }],
  'dora-2022':       [{ id: 'dora-nis2', label: 'DORA / NIS2' }],
  'iso27001-2022':   [],
  'iso37001-2016':   [{ id: 'abc-anti-bribery', label: 'ABC Pack' }],
  'wolfsberg-cbddq': [{ id: 'wolfsberg-principles', label: 'Wolfsberg Principles' }],
  'nist-csf-2':      [],
};

export default function GapAssessmentHub() {
  const navigate = useNavigate();
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedFrameworks, setSelectedFrameworks] = useState<string[]>([]);
  const [newTitle, setNewTitle] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [fwRes, assRes] = await Promise.all([
        fetch('/api/gap-assessments/frameworks', { headers: getAuthHeader() }),
        fetch('/api/gap-assessments', { headers: getAuthHeader() }),
      ]);
      if (fwRes.ok) setFrameworks(await fwRes.json().then(d => d.frameworks));
      if (assRes.ok) setAssessments(await assRes.json().then(d => d.assessments));
    } catch { /* ignore */ }
    setLoading(false);
  };

  const toggleFramework = (id: string) => {
    setSelectedFrameworks(prev =>
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    );
  };

  const createAssessment = async () => {
    if (selectedFrameworks.length === 0 || !newTitle.trim() || submitting) return;
    setSubmitting(true);
    try {
      const r = await fetch('/api/gap-assessments', {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle, frameworks: selectedFrameworks }),
      });
      if (!r.ok) { setSubmitting(false); return; }
      const { assessment } = await r.json();
      navigate(`/gap-assessment/${assessment.id}`);
    } catch { setSubmitting(false); }
  };

  return (
    <div className="flex flex-col h-full bg-adv-dark overflow-auto">
      {/* Header */}
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-adv-teal-dim">
              <ClipboardCheck className="h-5 w-5 text-adv-teal" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-adv-off-white">Compliance Gap Assessor</h1>
              <p className="text-xs text-adv-gray">Wizard-driven, framework-by-framework structured assessment</p>
            </div>
          </div>
          <button
            onClick={() => setCreating(!creating)}
            className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Assessment
          </button>
        </div>
      </div>

      <div className="flex-1 p-6 space-y-8">
        {/* New assessment panel */}
        {creating && (
          <div className="rounded-xl border border-adv-teal/40 bg-adv-card p-5">
            <h2 className="mb-1 text-sm font-semibold text-adv-off-white">New Gap Assessment</h2>
            <p className="mb-5 text-xs text-adv-gray">Select one or more frameworks to assess. You'll define scope and context in the next steps.</p>

            <div className="mb-5">
              <label className="mb-2 block text-xs font-medium text-adv-gray">Assessment title</label>
              <input
                className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none"
                placeholder="e.g. Nordea — AMLR Gap Assessment 2027"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value.slice(0, 200))}
                maxLength={200}
                autoFocus
              />
            </div>

            <div className="mb-5">
              <label className="mb-3 block text-xs font-medium text-adv-gray">Select frameworks</label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {frameworks.map(fw => {
                  const Icon = FRAMEWORK_ICONS[fw.id] || FileSearch;
                  const selected = selectedFrameworks.includes(fw.id);
                  return (
                    <button
                      key={fw.id}
                      onClick={() => toggleFramework(fw.id)}
                      className={`text-left rounded-xl border p-4 transition-all ${selected ? 'border-adv-teal bg-adv-teal-dim' : 'border-border bg-adv-dark-2 hover:border-adv-teal/30'}`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Icon className={`h-4 w-4 ${selected ? 'text-adv-teal' : 'text-adv-gray'}`} />
                        <span className={`text-sm font-semibold ${selected ? 'text-adv-teal' : 'text-adv-off-white'}`}>{fw.shortName}</span>
                        {selected && <CheckSquare className="ml-auto h-4 w-4 text-adv-teal" />}
                      </div>
                      <p className="text-xs text-adv-gray mb-1 line-clamp-1">{fw.name}</p>
                      <div className="flex items-center gap-2 text-[11px] text-adv-gray-med">
                        <span>{fw.articleCount} articles/controls</span>
                        <span>·</span>
                        <span>{fw.themes.length} themes</span>
                      </div>
                    </button>
                  );
                })}
                {frameworks.length === 0 && !loading && (
                  <div className="col-span-3 py-8 text-center text-sm text-adv-gray">
                    No frameworks found. Framework data files may be missing from <code className="text-adv-teal">data/frameworks/</code>
                  </div>
                )}
              </div>
            </div>

            {/* Knowledge pack suggestions */}
            {selectedFrameworks.length > 0 && (() => {
              const suggestions = selectedFrameworks
                .flatMap(fwId => FRAMEWORK_PACK_SUGGESTIONS[fwId] ?? [])
                .filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i);
              if (suggestions.length === 0) return null;
              return (
                <div className="rounded-lg border border-adv-teal/20 bg-adv-teal-soft px-4 py-3">
                  <p className="text-xs font-medium text-adv-teal mb-1.5">Recommended knowledge packs for this assessment:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {suggestions.map(p => (
                      <span key={p.id} className="rounded-full border border-adv-teal/30 bg-adv-teal/10 px-2.5 py-0.5 text-[11px] text-adv-teal">{p.label}</span>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[11px] text-adv-gray">Activate these in <a href="/knowledge-base" className="text-adv-teal hover:underline">Knowledge Base → Regulatory Packs</a> to enrich Claude's assessment with structured regulatory entity data.</p>
                </div>
              );
            })()}

            <div className="flex gap-2">
              <button
                onClick={createAssessment}
                disabled={selectedFrameworks.length === 0 || !newTitle.trim() || submitting}
                className="rounded-lg bg-adv-teal px-5 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Creating…' : <>Start Assessment <ChevronRight className="inline h-4 w-4 ml-1" /></>}
              </button>
              <button onClick={() => setCreating(false)} className="rounded-lg border border-border px-4 py-2 text-sm text-adv-gray hover:text-adv-off-white transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Available frameworks */}
        <div>
          <h2 className="mb-3 text-sm font-semibold text-adv-off-white">Supported Frameworks</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-32 rounded-xl border border-border bg-adv-card animate-pulse" />
              ))
            ) : frameworks.map(fw => {
              const Icon = FRAMEWORK_ICONS[fw.id] || FileSearch;
              return (
                <div key={fw.id} className="rounded-xl border border-border bg-adv-card p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Icon className="h-4 w-4 text-adv-teal" />
                    <span className="text-sm font-semibold text-adv-off-white">{fw.shortName}</span>
                  </div>
                  <p className="mb-1 text-xs text-adv-gray line-clamp-2">{fw.name}</p>
                  <p className="text-[11px] text-adv-gray-med">{fw.reference}</p>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {fw.themes.slice(0, 3).map(t => (
                      <span key={t} className="rounded-full bg-adv-dark px-2 py-0.5 text-[10px] text-adv-gray">{t}</span>
                    ))}
                    {fw.themes.length > 3 && (
                      <span className="rounded-full bg-adv-dark px-2 py-0.5 text-[10px] text-adv-gray-med">+{fw.themes.length - 3}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent assessments */}
        {assessments.length > 0 && (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-adv-off-white">Recent Assessments</h2>
              <button onClick={loadData} className="text-adv-gray hover:text-adv-teal transition-colors" title="Refresh">
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2">
              {assessments.map(a => {
                const statusInfo = STATUS_LABELS[a.status] || { label: a.status, color: 'text-adv-gray' };
                const fwIds = JSON.parse(a.frameworks || '[]') as string[];
                const step = a.current_step || 1;
                return (
                  <button
                    key={a.id}
                    onClick={() => navigate(`/gap-assessment/${a.id}`)}
                    className="group flex w-full items-center gap-4 rounded-xl border border-border bg-adv-card px-4 py-3 text-left hover:border-adv-teal/40 transition-all"
                  >
                    <BarChart3 className="h-5 w-5 text-adv-teal shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-adv-off-white group-hover:text-adv-teal transition-colors truncate">{a.title}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-xs text-adv-gray-med">{fwIds.join(', ')}</span>
                        <span className="text-adv-gray-med">·</span>
                        <span className="text-xs text-adv-gray-med">Step {step}: {STEP_LABELS[step] || 'Unknown'}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`text-xs font-medium ${statusInfo.color}`}>{statusInfo.label}</span>
                      <span className="text-[11px] text-adv-gray-med">{new Date(a.updated_at).toLocaleDateString()}</span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-adv-gray shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {!loading && assessments.length === 0 && !creating && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <ClipboardCheck className="mb-4 h-12 w-12 text-adv-gray-med" />
            <h3 className="mb-2 text-base font-semibold text-adv-off-white">No assessments yet</h3>
            <p className="mb-6 max-w-sm text-sm text-adv-gray">
              Run a structured gap assessment across AMLR, DORA, ISO 27001, and Wolfsberg CBDDQ.
              Produces article-level scoring, capability view, board summary, and project roadmap.
            </p>
            <button
              onClick={() => setCreating(true)}
              className="flex items-center gap-2 rounded-lg bg-adv-teal px-5 py-2.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
            >
              <Plus className="h-4 w-4" /> Start First Assessment
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
