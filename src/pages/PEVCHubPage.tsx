/**
 * PEVCHubPage.tsx
 *
 * Hub page for the Private Equity & Venture Capital area.
 * - Quick access to all 12 PE/VC modules
 * - Innovation & Market Radar shortcut
 * - "My Way of Working" setup for IC memo templates (fund identity + memo style)
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, Filter, Globe, SearchCheck, Calculator, Scale,
  FileText, LayoutDashboard, Rocket, DoorOpen, PieChart,
  Handshake, Users, Satellite, ChevronRight, ArrowRight,
  CheckCircle2, Circle, Loader2, Save, X, Plus, Brain,
  FileUp, Building2, Star, AlertCircle
} from 'lucide-react';
import { getAuthHeader, fetchWithAuth } from '@/lib/api';

// ── Types ───────────────────────────────────────────────────────────────────

interface SetupStatus {
  hasIdentity: boolean;
  hasTemplates: boolean;
  templateCount: number;
}

interface FundIdentity {
  fund_name?: string;
  fund_type?: string;
  geography_focus?: string;
  sector_focus?: string;
  typical_check_size?: string;
  investment_style_notes?: string;
  partner_name?: string;
  firm_website?: string;
  currency?: string;
}

// ── Module registry ─────────────────────────────────────────────────────────

const PE_VC_MODULES = [
  // Deal Flow
  { id: 'deal-screening',    label: 'Deal Screening',          shortLabel: 'Screen',   icon: Filter,          group: 'Deal Flow',         description: 'Rapid first-look — pass or explore further?' },
  { id: 'market-intelligence', label: 'Market Intelligence',   shortLabel: 'Market',   icon: Globe,           group: 'Deal Flow',         description: 'Market sizing, competitive landscape, sector thesis' },
  { id: 'due-diligence',     label: 'Due Diligence',           shortLabel: 'Diligence',icon: SearchCheck,     group: 'Deal Flow',         description: 'Workbench for commercial, financial, and operational DD' },
  // Analysis
  { id: 'financial-analysis', label: 'Financial Analysis',     shortLabel: 'Financials',icon: Calculator,     group: 'Analysis',          description: 'Unit economics, quality of earnings, LBO returns' },
  { id: 'valuation-framework', label: 'Valuation',             shortLabel: 'Valuation',icon: Scale,           group: 'Analysis',          description: 'DCF, comps, precedent transactions, LBO' },
  // IC & Decision
  { id: 'ic-memo',           label: 'IC Memo',                 shortLabel: 'IC Memo',  icon: FileText,        group: 'IC & Decision',     description: 'Full investment committee memorandum', myWay: true },
  { id: 'deal-structure',    label: 'Deal Structure',          shortLabel: 'Structure',icon: Handshake,       group: 'IC & Decision',     description: 'Term sheet analysis, drafting, and negotiation' },
  { id: 'team-assessment',   label: 'Team Assessment',         shortLabel: 'Team',     icon: Users,           group: 'IC & Decision',     description: 'Founder and management assessment framework' },
  // Portfolio
  { id: 'portfolio-monitoring', label: 'Portfolio Monitoring', shortLabel: 'Monitor',  icon: LayoutDashboard, group: 'Portfolio',          description: 'KPI tracking, board pack summaries, early warnings' },
  { id: 'value-creation',    label: 'Value Creation',          shortLabel: 'Value',    icon: Rocket,          group: 'Portfolio',          description: '100-day plans and operational improvement' },
  { id: 'exit-planning',     label: 'Exit Planning',           shortLabel: 'Exit',     icon: DoorOpen,        group: 'Portfolio',          description: 'Exit readiness, buyer universe, CIM preparation' },
  // Fund
  { id: 'fund-reporting',    label: 'Fund Reporting',          shortLabel: 'Reporting',icon: PieChart,        group: 'Fund Management',   description: 'LP updates, IRR/TVPI/DPI, AGM materials' },
];

const MODULE_GROUPS = ['Deal Flow', 'Analysis', 'IC & Decision', 'Portfolio', 'Fund Management'];

// ── Wizard step type ────────────────────────────────────────────────────────
type WizardStep = 'landing' | 'identity' | 'ic-style' | 'done';

// ── Main Page ───────────────────────────────────────────────────────────────

export default function PEVCHubPage() {
  const navigate = useNavigate();
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>('landing');

  useEffect(() => { loadStatus(); }, []);

  async function loadStatus() {
    setLoadingStatus(true);
    try {
      const res = await fetch('/api/pe-vc/setup-status', { headers: getAuthHeader() });
      if (res.ok) setSetupStatus(await res.json() as SetupStatus);
    } catch { /* non-fatal */ }
    setLoadingStatus(false);
  }

  function openSetup() {
    setWizardStep('identity');
    setShowWizard(true);
  }

  function onSetupComplete() {
    setShowWizard(false);
    loadStatus();
  }

  if (loadingStatus) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-adv-blue" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-adv-blue/10">
            <TrendingUp className="h-5 w-5 text-adv-blue" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-adv-white">Private Equity & Venture Capital</h1>
            <p className="text-sm text-adv-gray">Sourcing → Diligence → IC → Portfolio → Exit</p>
          </div>
        </div>
        {setupStatus?.hasIdentity && (
          <button
            onClick={openSetup}
            className="flex items-center gap-2 rounded-lg border border-adv-gold/30 bg-adv-gold/5 px-3 py-2 text-sm text-adv-gold hover:bg-adv-gold/10 transition-colors"
          >
            <Building2 className="h-4 w-4" />
            Edit Fund Profile
          </button>
        )}
      </div>

      {/* My Way Banner */}
      <MyWayBanner status={setupStatus} onSetup={openSetup} />

      {/* Quick Actions */}
      <div className="mt-8 mb-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-adv-gray">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <QuickAction label="Screen a Deal" icon={Filter} color="adv-blue" onClick={() => navigate('/module/deal-screening')} />
          <QuickAction label="Start Diligence" icon={SearchCheck} color="adv-teal" onClick={() => navigate('/module/due-diligence')} />
          <QuickAction label="Write IC Memo" icon={FileText} color="adv-gold" onClick={() => navigate('/module/ic-memo')} />
          <QuickAction label="Innovation Radar" icon={Satellite} color="adv-green" onClick={() => navigate('/innovation-radar')} />
        </div>
      </div>

      {/* Module grid by group */}
      {MODULE_GROUPS.map(group => {
        const groupModules = PE_VC_MODULES.filter(m => m.group === group);
        return (
          <div key={group} className="mb-6">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-adv-gray">{group}</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {groupModules.map(mod => {
                const Icon = mod.icon;
                const hasMyWay = mod.myWay && setupStatus?.hasTemplates;
                return (
                  <button
                    key={mod.id}
                    onClick={() => navigate(`/module/${mod.id}`)}
                    className="group text-left rounded-xl border border-adv-card bg-adv-card/60 hover:border-adv-blue/40 hover:bg-adv-card p-4 transition-all"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-adv-blue/10">
                        <Icon className="h-4 w-4 text-adv-blue" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold text-adv-white group-hover:text-adv-blue transition-colors">{mod.label}</span>
                          {hasMyWay && (
                            <span className="rounded-full bg-adv-gold/20 border border-adv-gold/30 px-1.5 py-0.5 text-xs font-medium text-adv-gold">MY WAY</span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-adv-gray leading-relaxed line-clamp-2">{mod.description}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-adv-gray/40 group-hover:text-adv-blue transition-colors shrink-0 mt-0.5" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Wizard overlay */}
      {showWizard && (
        <SetupWizard
          step={wizardStep}
          onStepChange={setWizardStep}
          onComplete={onSetupComplete}
          onClose={() => setShowWizard(false)}
        />
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function QuickAction({ label, icon: Icon, color, onClick }: { label: string; icon: typeof Filter; color: string; onClick: () => void }) {
  const colorMap: Record<string, string> = {
    'adv-blue': 'bg-adv-blue/10 text-adv-blue border-adv-blue/20 hover:bg-adv-blue/20',
    'adv-teal': 'bg-adv-teal/10 text-adv-teal border-adv-teal/20 hover:bg-adv-teal/20',
    'adv-gold': 'bg-adv-gold/10 text-adv-gold border-adv-gold/20 hover:bg-adv-gold/20',
    'adv-green': 'bg-adv-green/10 text-adv-green border-adv-green/20 hover:bg-adv-green/20',
  };
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-xl border p-3 text-sm font-medium transition-colors ${colorMap[color] ?? colorMap['adv-blue']}`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span>{label}</span>
      <ArrowRight className="h-3.5 w-3.5 ml-auto shrink-0 opacity-60" />
    </button>
  );
}

function MyWayBanner({ status, onSetup }: { status: SetupStatus | null; onSetup: () => void }) {
  const isSetupComplete = status?.hasIdentity && status?.hasTemplates;

  if (isSetupComplete) {
    return (
      <div className="rounded-xl border border-adv-gold/30 bg-adv-gold/5 p-4">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-adv-gold shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-adv-white">My Way Active</p>
            <p className="text-xs text-adv-gray mt-0.5">
              Fund profile and IC memo template configured. ANTON will produce memos that match your firm's format.
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="flex h-2 w-2 rounded-full bg-adv-gold animate-pulse" />
            <span className="text-xs text-adv-gold">{status.templateCount} template{status.templateCount !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>
    );
  }

  if (status?.hasIdentity) {
    return (
      <div className="rounded-xl border border-adv-gold/30 bg-adv-gold/5 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Circle className="h-5 w-5 text-adv-gold shrink-0" />
            <div>
              <p className="text-sm font-semibold text-adv-white">Fund Profile Set — Add IC Memo Template</p>
              <p className="text-xs text-adv-gray mt-0.5">Upload 1-2 past IC memos to teach ANTON your firm's format</p>
            </div>
          </div>
          <button onClick={onSetup} className="shrink-0 rounded-lg bg-adv-gold/20 hover:bg-adv-gold/30 border border-adv-gold/40 px-3 py-1.5 text-xs font-medium text-adv-gold transition-colors">
            Add Template
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-adv-gold/30 bg-adv-gold/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Star className="h-5 w-5 text-adv-gold shrink-0" />
          <div>
            <p className="text-sm font-semibold text-adv-white">Train ANTON on your IC memo format</p>
            <p className="text-xs text-adv-gray mt-0.5">
              Every firm has their own IC memo style. Set up your fund profile and upload a past memo — ANTON learns your format.
            </p>
          </div>
        </div>
        <button onClick={onSetup} className="shrink-0 rounded-lg bg-adv-gold hover:bg-adv-gold/80 px-4 py-2 text-sm font-semibold text-adv-dark transition-colors whitespace-nowrap">
          Set up My Way
        </button>
      </div>
    </div>
  );
}

// ── Setup Wizard ─────────────────────────────────────────────────────────────

function SetupWizard({
  step,
  onStepChange,
  onComplete,
  onClose,
}: {
  step: WizardStep;
  onStepChange: (s: WizardStep) => void;
  onComplete: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-xl rounded-2xl border border-adv-card bg-adv-dark-2 shadow-2xl">
        {/* Wizard header */}
        <div className="flex items-center justify-between border-b border-adv-card px-6 py-4">
          <div className="flex items-center gap-2">
            <Star className="h-4 w-4 text-adv-gold" />
            <span className="text-sm font-semibold text-adv-white">My Way — IC Memo Setup</span>
          </div>
          <button onClick={onClose} className="text-adv-gray hover:text-adv-white"><X className="h-4 w-4" /></button>
        </div>

        {/* Step progress */}
        <div className="flex items-center gap-1 px-6 py-3 border-b border-adv-card">
          {(['identity', 'ic-style', 'done'] as WizardStep[]).map((s, i) => (
            <div key={s} className="flex items-center gap-1">
              <div className={`h-2 w-2 rounded-full ${step === s ? 'bg-adv-gold' : (i < ['identity', 'ic-style', 'done'].indexOf(step) ? 'bg-adv-green' : 'bg-adv-card')}`} />
              {i < 2 && <div className="h-px w-6 bg-adv-card" />}
            </div>
          ))}
          <span className="ml-2 text-xs text-adv-gray">
            {step === 'identity' ? 'Step 1 of 2: Fund Profile' : step === 'ic-style' ? 'Step 2 of 2: IC Memo Style' : 'Complete'}
          </span>
        </div>

        {/* Step content */}
        <div className="p-6">
          {step === 'identity' && <FundIdentityStep onNext={() => onStepChange('ic-style')} onSkip={() => onStepChange('ic-style')} />}
          {step === 'ic-style' && <IcStyleStep onDone={() => onStepChange('done')} onBack={() => onStepChange('identity')} />}
          {step === 'done' && <DoneStep onComplete={onComplete} />}
        </div>
      </div>
    </div>
  );
}

// ── Wizard Step 1: Fund Identity ─────────────────────────────────────────────

function FundIdentityStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const [identity, setIdentity] = useState<FundIdentity>({});
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Pre-load existing identity if any
    fetch('/api/pe-vc/identity', { headers: getAuthHeader() })
      .then(r => r.ok ? r.json() as Promise<{ fund_name?: string; fund_type?: string; geography_focus?: string; sector_focus?: string; typical_check_size?: string; investment_style_notes?: string; partner_name?: string; firm_website?: string; currency?: string } | null> : null)
      .then(data => { if (data) setIdentity(data); })
      .catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const res = await fetchWithAuth('/api/pe-vc/identity', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(identity),
      });
      if (!res.ok) throw new Error('Save failed');
      onNext();
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleFileExtract(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setExtracting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetchWithAuth('/api/pe-vc/identity/extract', { method: 'POST', body: formData });
      if (res.ok) {
        const extracted = await res.json() as FundIdentity;
        setIdentity(prev => ({ ...prev, ...extracted }));
      }
    } catch { /* non-fatal */ }
    setExtracting(false);
    e.target.value = '';
  }

  const field = (key: keyof FundIdentity, label: string, placeholder: string, type: 'text' | 'select' = 'text', options?: string[]) => (
    <div>
      <label className="mb-1 block text-xs text-adv-gray">{label}</label>
      {type === 'select' && options ? (
        <select
          value={identity[key] ?? ''}
          onChange={e => setIdentity(p => ({ ...p, [key]: e.target.value }))}
          className="w-full rounded-lg bg-adv-dark border border-adv-card px-3 py-2 text-sm text-adv-off-white focus:border-adv-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
        >
          <option value="">Select…</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input
          value={identity[key] ?? ''}
          onChange={e => setIdentity(p => ({ ...p, [key]: e.target.value }))}
          placeholder={placeholder}
          className="w-full rounded-lg bg-adv-dark border border-adv-card px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray/50 focus:border-adv-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
        />
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-adv-white">Fund Profile</h3>
        <p className="text-xs text-adv-gray mt-1">Tell ANTON about your fund so IC memos are calibrated to your style and context.</p>
      </div>

      {/* Quick extract from document */}
      <div className="rounded-lg border border-dashed border-adv-card p-3 flex items-center gap-3">
        <FileUp className="h-4 w-4 text-adv-gray shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-adv-gray">Upload a pitch deck or company document — ANTON will pre-fill fund details</p>
        </div>
        <label className={`shrink-0 cursor-pointer rounded-md bg-adv-card hover:bg-adv-card/80 border border-adv-card/50 px-2.5 py-1 text-xs text-adv-gray hover:text-adv-white transition-colors ${extracting ? 'opacity-50 pointer-events-none' : ''}`}>
          {extracting ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Upload'}
          <input type="file" accept=".pdf,.docx,.txt,.md" className="sr-only" onChange={handleFileExtract} />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {field('fund_name', 'Fund name', 'Nordic Growth Fund III')}
        {field('fund_type', 'Fund type', '', 'select', ['VC Early Stage', 'VC Growth', 'PE Growth Equity', 'PE Buyout', 'PE Turnaround', 'Corporate Venture', 'Family Office', 'Fund-of-Funds'])}
        {field('partner_name', 'Your name', 'Anna Lindqvist')}
        {field('currency', 'Currency', 'EUR', 'select', ['EUR', 'USD', 'GBP', 'SEK', 'NOK', 'DKK', 'CHF'])}
        {field('geography_focus', 'Geography focus', 'Nordics, Europe')}
        {field('typical_check_size', 'Typical check size', 'e.g., €5–25M')}
        {field('sector_focus', 'Sector focus', 'e.g., B2B SaaS, Fintech, Climate')}
        {field('firm_website', 'Firm website', 'https://...')}
      </div>
      <div>
        <label className="mb-1 block text-xs text-adv-gray">Investment style notes (optional)</label>
        <textarea
          value={identity.investment_style_notes ?? ''}
          onChange={e => setIdentity(p => ({ ...p, investment_style_notes: e.target.value }))}
          placeholder="e.g., We focus on capital-efficient SaaS with NRR >110%. We lead Series A-B rounds. We value operational founders."
          rows={2}
          className="w-full rounded-lg bg-adv-dark border border-adv-card px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray/50 focus:border-adv-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 resize-none"
        />
      </div>

      {error && <p className="text-xs text-adv-red flex items-center gap-1"><AlertCircle className="h-3 w-3" />{error}</p>}

      <div className="flex gap-2 justify-end pt-2">
        <button onClick={onSkip} className="px-3 py-1.5 rounded-lg text-sm text-adv-gray hover:text-adv-white">Skip for now</button>
        <button onClick={handleSave} disabled={saving || !identity.fund_name} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-adv-gold hover:bg-adv-gold/80 disabled:opacity-50 text-sm font-semibold text-adv-dark transition-colors">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save & Continue
        </button>
      </div>
    </div>
  );
}

// ── Wizard Step 2: IC Memo Style ─────────────────────────────────────────────

function IcStyleStep({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const [pastedText, setPastedText] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState<{ sections?: string[]; style_notes?: string; template_content?: string } | null>(null);
  const [templateName, setTemplateName] = useState('My IC Memo Template');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleFileExtract(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setExtracting(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('memoType', 'full-ic-memo');
      const res = await fetchWithAuth('/api/pe-vc/templates/extract', { method: 'POST', body: formData });
      if (res.ok) setExtracted(await res.json() as { sections?: string[]; style_notes?: string; template_content?: string });
      else setError('Could not extract from this file. Try pasting text instead.');
    } catch {
      setError('Extraction failed. Try pasting text instead.');
    }
    setExtracting(false);
    e.target.value = '';
  }

  async function handleTextExtract() {
    if (!pastedText.trim()) return;
    setExtracting(true);
    setError('');
    try {
      const res = await fetchWithAuth('/api/pe-vc/templates/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: pastedText, memoType: 'full-ic-memo' }),
      });
      if (res.ok) setExtracted(await res.json() as { sections?: string[]; style_notes?: string; template_content?: string });
      else setError('Extraction failed. Please try again.');
    } catch {
      setError('Extraction failed.');
    }
    setExtracting(false);
  }

  async function handleSaveTemplate() {
    if (!extracted) { onDone(); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: templateName,
        memoType: 'full-ic-memo',
        templateContent: extracted.template_content || JSON.stringify(extracted),
        sectionOrder: JSON.stringify(extracted.sections || []),
        styleNotes: extracted.style_notes || '',
        isDefault: true,
      };
      const res = await fetchWithAuth('/api/pe-vc/templates/new', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Save failed');
      onDone();
    } catch {
      setError('Failed to save template. Please try again.');
    }
    setSaving(false);
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-adv-white">IC Memo Style</h3>
        <p className="text-xs text-adv-gray mt-1">Upload or paste a past IC memo to teach ANTON your firm's structure and style.</p>
      </div>

      {!extracted ? (
        <>
          {/* File upload */}
          <div className="rounded-lg border border-dashed border-adv-card p-4 text-center">
            <Brain className="mx-auto h-6 w-6 text-adv-blue/60 mb-2" />
            <p className="text-xs text-adv-gray mb-2">Upload a past IC memo (PDF or DOCX)</p>
            <label className={`cursor-pointer inline-flex items-center gap-1.5 rounded-md bg-adv-blue/20 hover:bg-adv-blue/30 border border-adv-blue/30 px-3 py-1.5 text-xs text-adv-blue transition-colors ${extracting ? 'opacity-50 pointer-events-none' : ''}`}>
              {extracting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Upload IC Memo
              <input type="file" accept=".pdf,.docx,.txt" className="sr-only" onChange={handleFileExtract} />
            </label>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-adv-card" /></div>
            <div className="relative flex justify-center"><span className="bg-adv-dark-2 px-3 text-xs text-adv-gray/60">or paste text</span></div>
          </div>

          <textarea
            value={pastedText}
            onChange={e => setPastedText(e.target.value)}
            placeholder="Paste the text of a past IC memo here…"
            rows={6}
            className="w-full rounded-lg bg-adv-dark border border-adv-card px-3 py-2 text-xs text-adv-off-white placeholder-adv-gray/50 focus:border-adv-blue focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 resize-none"
          />
          {pastedText.trim() && (
            <button onClick={handleTextExtract} disabled={extracting} className="flex items-center gap-1.5 rounded-md bg-adv-blue/20 hover:bg-adv-blue/30 border border-adv-blue/30 px-3 py-1.5 text-xs text-adv-blue transition-colors disabled:opacity-50">
              {extracting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Brain className="h-3.5 w-3.5" />}
              Analyse Memo Style
            </button>
          )}
        </>
      ) : (
        <>
          <div className="rounded-lg border border-adv-teal/30 bg-adv-teal/5 p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-adv-teal text-xs font-semibold">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Style extracted
            </div>
            {extracted.sections && extracted.sections.length > 0 && (
              <div>
                <p className="text-xs text-adv-gray mb-1">Sections detected:</p>
                <div className="flex flex-wrap gap-1">
                  {extracted.sections.map((s, i) => (
                    <span key={i} className="rounded bg-adv-card px-1.5 py-0.5 text-xs text-adv-off-white">{s}</span>
                  ))}
                </div>
              </div>
            )}
            {extracted.style_notes && <p className="text-xs text-adv-gray italic">{extracted.style_notes}</p>}
          </div>
          <div>
            <label className="mb-1 block text-xs text-adv-gray">Template name</label>
            <input value={templateName} onChange={e => setTemplateName(e.target.value)} className="w-full rounded-lg bg-adv-dark border border-adv-card px-3 py-2 text-sm text-adv-off-white focus:border-adv-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1" />
          </div>
          <button onClick={() => setExtracted(null)} className="text-xs text-adv-gray hover:text-adv-white">← Upload different memo</button>
        </>
      )}

      {error && <p className="text-xs text-adv-red flex items-center gap-1"><AlertCircle className="h-3 w-3" />{error}</p>}

      <div className="flex gap-2 justify-end pt-2">
        <button onClick={onBack} className="px-3 py-1.5 rounded-lg text-sm text-adv-gray hover:text-adv-white">Back</button>
        <button onClick={() => onDone()} className="px-3 py-1.5 rounded-lg text-sm text-adv-gray hover:text-adv-white">Skip</button>
        {extracted && (
          <button onClick={handleSaveTemplate} disabled={saving} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-adv-gold hover:bg-adv-gold/80 disabled:opacity-50 text-sm font-semibold text-adv-dark transition-colors">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save Template
          </button>
        )}
      </div>
    </div>
  );
}

// ── Wizard Done ───────────────────────────────────────────────────────────────

function DoneStep({ onComplete }: { onComplete: () => void }) {
  return (
    <div className="text-center space-y-4 py-4">
      <div className="flex justify-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-adv-gold/20 border border-adv-gold/40">
          <Star className="h-7 w-7 text-adv-gold" />
        </div>
      </div>
      <div>
        <h3 className="text-base font-semibold text-adv-white">My Way is Active</h3>
        <p className="text-xs text-adv-gray mt-2 max-w-xs mx-auto">
          The IC Memo module now uses your fund's profile and memo format. ANTON will produce memos that look like they came from your firm.
        </p>
      </div>
      <button onClick={onComplete} className="inline-flex items-center gap-1.5 rounded-lg bg-adv-blue hover:bg-adv-blue/80 px-5 py-2 text-sm font-semibold text-white transition-colors">
        Go to IC Memo
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
