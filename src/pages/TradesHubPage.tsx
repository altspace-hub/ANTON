/**
 * TradesHubPage.tsx
 *
 * Hub page for the Trades & Service Workers area.
 * - Shows setup status for "My Way of Working"
 * - Provides access to the setup wizard (business identity + template extraction)
 * - Lists modules with direct navigation
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wrench, FileText, ClipboardList, MessageSquare, Receipt, ShoppingCart,
  CheckCircle2, Circle, ChevronRight, ArrowRight, Upload, Sparkles,
  Building2, CreditCard, User, Star, AlertCircle, Loader2, Save,
  X, Plus, Brain, FileUp, RotateCcw
} from 'lucide-react';
import { getAuthHeader } from '@/lib/api';

// ── Types ──────────────────────────────────────────────────────────────────

interface SetupStatus {
  hasIdentity: boolean;
  templateCount: number;
  patternCount: number;
  setupComplete: boolean;
}

interface BusinessIdentity {
  businessName?: string;
  ownerName?: string;
  businessType?: string;
  tradeType?: string;
  country?: string;
  hourlyRate?: number;
  travelRate?: number;
  currency?: string;
  defaultPaymentTerms?: number;
  vatRegistered?: boolean;
  vatNumber?: string;
  orgNumber?: string;
  preferredPaymentMethods?: Array<{ type: string; details: string }>;
  invoicePrefix?: string;
  invoiceNumberFormat?: string;
  quotePrefix?: string;
  certifications?: string[];
  latePaymentText?: string;
  phone?: string;
  email?: string;
  address?: string;
}

interface DocumentTemplate {
  id: string;
  document_type: string;
  name: string;
  isDefault: boolean;
  created_at: string;
}

// ── Module registry ────────────────────────────────────────────────────────

const TRADES_MODULES = [
  {
    id: 'invoice-generator',
    label: 'Invoice Generator',
    shortLabel: 'Invoice',
    icon: FileText,
    description: 'Generate a professional invoice in seconds. Uses your template if set up.',
    myWayProcessType: 'invoicing',
  },
  {
    id: 'job-quote-builder',
    label: 'Job Quote Builder',
    shortLabel: 'Quote',
    icon: ClipboardList,
    description: 'Write a professional quote with scope, price, and exclusions.',
    myWayProcessType: 'quoting',
  },
  {
    id: 'customer-comms',
    label: 'Customer Message Writer',
    shortLabel: 'Customer Msg',
    icon: MessageSquare,
    description: 'Write a quick message to your customer that sounds like you.',
    myWayProcessType: 'communicating',
  },
  {
    id: 'tax-rot-rut-guide',
    label: 'ROT & RUT Tax Guide',
    shortLabel: 'ROT/RUT',
    icon: Receipt,
    description: 'Understand and calculate Swedish ROT and RUT deductions.',
    myWayProcessType: null,
  },
  {
    id: 'material-order-list',
    label: 'Material Order List',
    shortLabel: 'Materials',
    icon: ShoppingCart,
    description: 'Get a complete materials list for a job with quantities.',
    myWayProcessType: null,
  },
];

// ── Setup steps ────────────────────────────────────────────────────────────

type WizardStep = 'landing' | 'identity' | 'template' | 'patterns' | 'done';

// ── Main Page ──────────────────────────────────────────────────────────────

export default function TradesHubPage() {
  const navigate = useNavigate();
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [wizardStep, setWizardStep] = useState<WizardStep>('landing');
  const [showWizard, setShowWizard] = useState(false);

  useEffect(() => {
    loadStatus();
  }, []);

  async function loadStatus() {
    setLoadingStatus(true);
    try {
      const [statusRes, tmplRes] = await Promise.all([
        fetch('/api/trades/setup-status', { headers: getAuthHeader() }),
        fetch('/api/trades/templates', { headers: getAuthHeader() }),
      ]);
      if (statusRes.ok) setSetupStatus(await statusRes.json());
      if (tmplRes.ok) setTemplates(await tmplRes.json());
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
        <Loader2 className="h-6 w-6 animate-spin text-adv-teal" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-adv-gold/10">
            <Wrench className="h-5 w-5 text-adv-gold" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-adv-white">Trades & Service Workers</h1>
            <p className="text-sm text-adv-gray">Invoices, quotes, customer messages — done your way</p>
          </div>
        </div>
        {setupStatus?.setupComplete && (
          <button
            onClick={openSetup}
            className="flex items-center gap-2 rounded-lg border border-adv-gold/30 bg-adv-gold/5 px-3 py-2 text-sm text-adv-gold hover:bg-adv-gold/10 transition-colors"
          >
            <Building2 className="h-4 w-4" />
            Edit My Business
          </button>
        )}
      </div>

      {/* My Way of Working status banner */}
      <MyWayBanner
        status={setupStatus}
        templateCount={templates.length}
        onSetup={openSetup}
      />

      {/* Modules grid */}
      <div className="mt-8">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-adv-gray">
          Your tools
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TRADES_MODULES.map((mod) => {
            const hasTemplate = mod.myWayProcessType && templates.some(t => {
              const typeMap: Record<string, string> = { invoicing: 'invoice', quoting: 'quote', communicating: 'message' };
              return t.document_type === (typeMap[mod.myWayProcessType!] || mod.myWayProcessType);
            });
            return (
              <ModuleCard
                key={mod.id}
                mod={mod}
                hasTemplate={!!hasTemplate}
                hasIdentity={!!setupStatus?.hasIdentity}
                onClick={() => navigate(`/module/${mod.id}`, { state: { areaId: 'trades' } })}
              />
            );
          })}
        </div>
      </div>

      {/* Setup Wizard Modal */}
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

// ── My Way Banner ──────────────────────────────────────────────────────────

function MyWayBanner({ status, templateCount, onSetup }: {
  status: SetupStatus | null;
  templateCount: number;
  onSetup: () => void;
}) {
  if (!status) return null;

  if (status.setupComplete) {
    return (
      <div className="rounded-xl border border-adv-gold/20 bg-adv-gold/5 px-5 py-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-adv-gold" />
          <div className="flex-1">
            <p className="font-semibold text-adv-white">My Way of Working is set up</p>
            <p className="mt-1 text-sm text-adv-gray">
              Your business identity is saved.
              {templateCount > 0 ? ` ${templateCount} document template${templateCount > 1 ? 's' : ''} learned.` : ''}
              {' '}Outputs will match your style.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-adv-gold">
            <Star className="h-3 w-3" />
            Active
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-adv-gold/30 bg-adv-card p-5">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-adv-gold/10">
          <Sparkles className="h-5 w-5 text-adv-gold" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-adv-white">Set up "My Way of Working"</h3>
          <p className="mt-1 text-sm text-adv-gray leading-relaxed">
            Teach ANTON how your business works — your rates, your invoice layout, your words.
            After setup (15 minutes), every invoice and quote looks like <em>you</em> made it.
          </p>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-adv-gray">
            <span className="flex items-center gap-1.5">
              {status.hasIdentity ? <CheckCircle2 className="h-3.5 w-3.5 text-adv-green" /> : <Circle className="h-3.5 w-3.5" />}
              Business identity
            </span>
            <span className="flex items-center gap-1.5">
              {templateCount > 0 ? <CheckCircle2 className="h-3.5 w-3.5 text-adv-green" /> : <Circle className="h-3.5 w-3.5" />}
              Document template
            </span>
          </div>
        </div>
        <button
          onClick={onSetup}
          className="shrink-0 flex items-center gap-2 rounded-xl bg-adv-gold px-4 py-2 text-sm font-medium text-adv-dark hover:bg-amber-400 transition-colors"
        >
          {status.hasIdentity ? 'Continue setup' : 'Start setup'}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ── Module Card ────────────────────────────────────────────────────────────

function ModuleCard({ mod, hasTemplate, hasIdentity, onClick }: {
  mod: typeof TRADES_MODULES[number];
  hasTemplate: boolean;
  hasIdentity: boolean;
  onClick: () => void;
}) {
  const Icon = mod.icon;
  const showMyWayBadge = mod.myWayProcessType && hasIdentity;

  return (
    <button
      onClick={onClick}
      className="group flex flex-col gap-3 rounded-xl border border-border bg-adv-card p-4 text-left hover:border-adv-gold/40 hover:shadow-md transition-all"
    >
      <div className="flex items-center justify-between">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-adv-gold/10">
          <Icon className="h-4 w-4 text-adv-gold" />
        </div>
        {showMyWayBadge && (
          <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
            hasTemplate ? 'bg-adv-green/10 text-adv-green' : 'bg-adv-gold/10 text-adv-gold'
          }`}>
            {hasTemplate ? (
              <><CheckCircle2 className="h-2.5 w-2.5" /> My way</>
            ) : (
              <><Star className="h-2.5 w-2.5" /> Identity set</>
            )}
          </span>
        )}
      </div>
      <div>
        <p className="text-sm font-semibold text-adv-white">{mod.label}</p>
        <p className="mt-1 text-xs leading-relaxed text-adv-gray">{mod.description}</p>
      </div>
      <div className="mt-auto flex items-center gap-1 text-xs font-medium text-adv-gold group-hover:underline">
        Open <ChevronRight className="h-3 w-3" />
      </div>
    </button>
  );
}

// ── Setup Wizard ───────────────────────────────────────────────────────────

function SetupWizard({ step, onStepChange, onComplete, onClose }: {
  step: WizardStep;
  onStepChange: (s: WizardStep) => void;
  onComplete: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="relative w-full max-w-2xl rounded-2xl border border-border bg-adv-dark-2 shadow-2xl">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-adv-gray hover:bg-adv-card hover:text-adv-white transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Progress */}
        <div className="flex items-center gap-2 border-b border-border px-6 py-4">
          <WizardProgressStep active={step === 'identity'} done={step === 'template' || step === 'patterns' || step === 'done'} label="1. Your Business" />
          <div className="h-px flex-1 bg-border" />
          <WizardProgressStep active={step === 'template'} done={step === 'patterns' || step === 'done'} label="2. Your Template" />
          <div className="h-px flex-1 bg-border" />
          <WizardProgressStep active={step === 'patterns'} done={step === 'done'} label="3. How You Work" />
          <div className="h-px flex-1 bg-border" />
          <WizardProgressStep active={step === 'done'} done={false} label="Done" />
        </div>

        <div className="p-6">
          {step === 'identity' && (
            <IdentityStep onNext={() => onStepChange('template')} />
          )}
          {step === 'template' && (
            <TemplateStep onNext={() => onStepChange('patterns')} onSkip={() => onStepChange('patterns')} />
          )}
          {step === 'patterns' && (
            <PatternStep onNext={() => onStepChange('done')} onSkip={() => onStepChange('done')} />
          )}
          {step === 'done' && (
            <DoneStep onFinish={onComplete} />
          )}
        </div>
      </div>
    </div>
  );
}

function WizardProgressStep({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-1.5 text-xs ${
      done ? 'text-adv-green' : active ? 'text-adv-gold' : 'text-adv-gray'
    }`}>
      {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
      {label}
    </div>
  );
}

// ── Step 1: Business Identity ──────────────────────────────────────────────

// Extraction result shape returned by /api/trades/identity/extract
interface IdentityExtraction {
  businessName?: string | null;
  ownerName?: string | null;
  tradeType?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  hourlyRate?: number | null;
  travelRate?: number | null;
  currency?: string | null;
  defaultPaymentTerms?: number | null;
  vatRegistered?: boolean | null;
  vatNumber?: string | null;
  invoicePrefix?: string | null;
  latePaymentText?: string | null;
  paymentDetails?: string | null;
  confidence?: 'high' | 'medium' | 'low';
  foundFields?: string[];
  notes?: string | null;
}

type IdentityPhase = 'source' | 'upload' | 'preview' | 'form';

function IdentityStep({ onNext }: { onNext: () => void }) {
  const [phase, setPhase] = useState<IdentityPhase>('source');
  const [identity, setIdentity] = useState<BusinessIdentity>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Upload/extract state
  const [pasteText, setPasteText] = useState('');
  const [uploadMode, setUploadMode] = useState<'paste' | 'file'>('paste');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState('');
  const [extraction, setExtraction] = useState<IdentityExtraction | null>(null);
  const [extractedFrom, setExtractedFrom] = useState('');

  useEffect(() => {
    fetch('/api/trades/identity', { headers: getAuthHeader() })
      .then(r => r.json())
      .then((data: { profile?: BusinessIdentity } | null) => {
        if (data?.profile) setIdentity(data.profile);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    try {
      await fetch('/api/trades/identity', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(identity),
      });
      onNext();
    } finally {
      setSaving(false);
    }
  }

  async function runExtract() {
    setExtracting(true);
    setExtractError('');
    try {
      let res: Response;
      if (uploadMode === 'file' && selectedFile) {
        const fd = new FormData();
        fd.append('file', selectedFile);
        res = await fetch('/api/trades/identity/extract', {
          method: 'POST',
          headers: getAuthHeader(),
          body: fd,
        });
        setExtractedFrom(selectedFile.name);
      } else {
        if (!pasteText.trim()) { setExtractError('Please paste some text first.'); return; }
        res = await fetch('/api/trades/identity/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          body: JSON.stringify({ text: pasteText }),
        });
        setExtractedFrom('pasted text');
      }
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error || 'Extraction failed');
      }
      const data = await res.json() as IdentityExtraction;
      setExtraction(data);
      setPhase('preview');
    } catch (e) {
      setExtractError((e as Error).message || 'Could not extract. Try pasting instead.');
    } finally {
      setExtracting(false);
    }
  }

  function applyExtraction() {
    if (!extraction) return;
    setIdentity(prev => ({
      ...prev,
      ...(extraction.businessName ? { businessName: extraction.businessName! } : {}),
      ...(extraction.ownerName ? { ownerName: extraction.ownerName! } : {}),
      ...(extraction.tradeType ? { tradeType: extraction.tradeType! } : {}),
      ...(extraction.country ? { country: extraction.country! } : {}),
      ...(extraction.phone ? { phone: extraction.phone! } : {}),
      ...(extraction.email ? { email: extraction.email! } : {}),
      ...(extraction.address ? { address: extraction.address! } : {}),
      ...(extraction.hourlyRate != null ? { hourlyRate: extraction.hourlyRate! } : {}),
      ...(extraction.travelRate != null ? { travelRate: extraction.travelRate! } : {}),
      ...(extraction.defaultPaymentTerms != null ? { defaultPaymentTerms: extraction.defaultPaymentTerms! } : {}),
      ...(extraction.vatRegistered != null ? { vatRegistered: extraction.vatRegistered! } : {}),
      ...(extraction.vatNumber ? { vatNumber: extraction.vatNumber! } : {}),
      ...(extraction.invoicePrefix ? { invoicePrefix: extraction.invoicePrefix! } : {}),
      ...(extraction.latePaymentText ? { latePaymentText: extraction.latePaymentText! } : {}),
      ...(extraction.paymentDetails ? { preferredPaymentMethods: [{ type: 'bankgiro', details: extraction.paymentDetails! }] } : {}),
    }));
    setPhase('form');
  }

  function field(key: keyof BusinessIdentity, label: string, placeholder: string, type = 'text') {
    const wasExtracted = extraction && extraction.foundFields?.includes(key);
    return (
      <div>
        <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-adv-gray">
          {label}
          {wasExtracted && <span className="rounded-full bg-adv-gold/10 px-1.5 py-0.5 text-xs text-adv-gold">from your doc</span>}
        </label>
        <input
          type={type}
          value={(identity[key] as string | number) || ''}
          onChange={e => setIdentity(prev => ({
            ...prev,
            [key]: type === 'number' ? (e.target.value ? Number(e.target.value) : undefined) : e.target.value,
          }))}
          placeholder={placeholder}
          className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:ring-1 focus:ring-adv-gold"
        />
      </div>
    );
  }

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-adv-gold" /></div>;

  // ── Phase: source selection ──
  if (phase === 'source') {
    return (
      <div>
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-adv-white">Tell me about your business</h2>
          <p className="mt-1 text-sm text-adv-gray">
            ANTON uses this to make everything you produce look like it came from you.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            onClick={() => setPhase('upload')}
            className="group flex flex-col gap-3 rounded-xl border border-adv-gold/30 bg-adv-gold/5 p-5 text-left hover:border-adv-gold/60 hover:bg-adv-gold/10 transition-all"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-adv-gold/15">
              <Brain className="h-5 w-5 text-adv-gold" />
            </div>
            <div>
              <p className="font-semibold text-adv-white">Read one of my documents</p>
              <p className="mt-1 text-xs leading-relaxed text-adv-gray">
                Upload or paste an invoice, quote, letterhead, or email footer.
                ANTON will read it and fill in what it finds — you just check and confirm.
              </p>
            </div>
            <span className="mt-auto text-xs font-medium text-adv-gold group-hover:underline">
              Fastest option →
            </span>
          </button>

          <button
            onClick={() => setPhase('form')}
            className="group flex flex-col gap-3 rounded-xl border border-border bg-adv-card p-5 text-left hover:border-adv-gold/30 transition-all"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-adv-dark">
              <Building2 className="h-5 w-5 text-adv-gray" />
            </div>
            <div>
              <p className="font-semibold text-adv-white">I'll fill it in myself</p>
              <p className="mt-1 text-xs leading-relaxed text-adv-gray">
                Type in your business details directly. Takes about 2-3 minutes.
              </p>
            </div>
            <span className="mt-auto text-xs text-adv-gray group-hover:text-adv-gold transition-colors">
              Manual entry →
            </span>
          </button>
        </div>
      </div>
    );
  }

  // ── Phase: upload / paste ──
  if (phase === 'upload') {
    const canExtract = uploadMode === 'paste' ? pasteText.trim().length > 20 : !!selectedFile;
    return (
      <div>
        <div className="mb-4 flex items-center gap-2">
          <button onClick={() => setPhase('source')} className="text-adv-gray hover:text-adv-off-white transition-colors">
            <X className="h-4 w-4" />
          </button>
          <div>
            <h2 className="text-lg font-semibold text-adv-white">Read one of your documents</h2>
            <p className="text-xs text-adv-gray">Upload a file or paste text — ANTON will extract your business details.</p>
          </div>
        </div>

        {/* Mode toggle */}
        <div className="mb-4 flex gap-2">
          {(['paste', 'file'] as const).map(m => (
            <button
              key={m}
              onClick={() => setUploadMode(m)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                uploadMode === m
                  ? 'bg-adv-gold text-adv-dark'
                  : 'border border-border bg-adv-dark text-adv-gray hover:border-adv-gold/30 hover:text-adv-gold'
              }`}
            >
              {m === 'paste' ? 'Paste text' : 'Upload file'}
            </button>
          ))}
        </div>

        {uploadMode === 'paste' ? (
          <textarea
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
            placeholder="Paste the text from an invoice, quote, email footer, or letterhead here. The more detail, the better the result."
            rows={8}
            className="w-full resize-none rounded-xl border border-border bg-adv-dark px-4 py-3 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:ring-1 focus:ring-adv-gold"
          />
        ) : (
          <label className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
            selectedFile ? 'border-adv-gold/50 bg-adv-gold/5' : 'border-border hover:border-adv-gold/30'
          }`}>
            <input
              type="file"
              accept=".pdf,.docx,.doc,.txt,.md,.xlsx,.html"
              className="sr-only"
              onChange={e => setSelectedFile(e.target.files?.[0] ?? null)}
            />
            {selectedFile ? (
              <>
                <CheckCircle2 className="h-7 w-7 text-adv-gold" />
                <p className="font-medium text-adv-white">{selectedFile.name}</p>
                <p className="text-xs text-adv-gray">{(selectedFile.size / 1024).toFixed(0)} KB · Click to change</p>
              </>
            ) : (
              <>
                <FileUp className="h-7 w-7 text-adv-gray" />
                <p className="text-sm text-adv-gray">Drop a file here or click to browse</p>
                <p className="text-xs text-adv-gray">PDF · DOCX · TXT · MD — up to 20 MB</p>
              </>
            )}
          </label>
        )}

        {extractError && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-adv-red/30 bg-adv-red/5 px-3 py-2">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-adv-red" />
            <p className="text-xs text-adv-red">{extractError}</p>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between">
          <button onClick={() => setPhase('form')} className="text-sm text-adv-gray hover:text-adv-teal transition-colors">
            Skip — fill in manually →
          </button>
          <button
            onClick={runExtract}
            disabled={!canExtract || extracting}
            className="flex items-center gap-2 rounded-xl bg-adv-gold px-5 py-2.5 text-sm font-medium text-adv-dark hover:bg-amber-400 disabled:opacity-40 transition-colors"
          >
            {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {extracting ? 'Reading your document…' : 'Extract with ANTON'}
          </button>
        </div>
      </div>
    );
  }

  // ── Phase: preview extraction result ──
  if (phase === 'preview' && extraction) {
    const found = extraction.foundFields ?? [];
    const FIELD_LABELS: Record<string, string> = {
      businessName: 'Business name', ownerName: 'Your name', tradeType: 'Trade',
      country: 'Country', phone: 'Phone', email: 'Email', address: 'Address',
      hourlyRate: 'Hourly rate', travelRate: 'Travel rate', currency: 'Currency',
      defaultPaymentTerms: 'Payment terms', vatRegistered: 'VAT', vatNumber: 'VAT number',
      invoicePrefix: 'Invoice prefix', latePaymentText: 'Late payment', paymentDetails: 'Payment details',
    };
    const getValue = (k: string) => {
      const v = (extraction as Record<string, unknown>)[k];
      if (v == null) return null;
      if (k === 'vatRegistered') return (v as boolean) ? 'Yes' : 'No';
      if (k === 'hourlyRate' || k === 'travelRate') return `${v} ${extraction.currency ?? ''}`.trim();
      if (k === 'defaultPaymentTerms') return `${v} days`;
      return String(v);
    };

    const confidenceColor = extraction.confidence === 'high' ? 'text-adv-green' : extraction.confidence === 'low' ? 'text-adv-gold' : 'text-adv-blue';

    return (
      <div>
        <div className="mb-4 flex items-center gap-2">
          <button onClick={() => setPhase('upload')} className="text-adv-gray hover:text-adv-off-white transition-colors">
            <RotateCcw className="h-4 w-4" />
          </button>
          <div>
            <h2 className="text-lg font-semibold text-adv-white">Here's what I found</h2>
            <p className="text-xs text-adv-gray">From {extractedFrom}. Check it looks right, then apply to the form.</p>
          </div>
        </div>

        {/* Confidence badge */}
        <div className="mb-3 flex items-center gap-2">
          <span className={`text-xs font-medium ${confidenceColor}`}>
            {extraction.confidence === 'high' ? '✓ High confidence' : extraction.confidence === 'low' ? '⚠ Low confidence' : '~ Medium confidence'}
          </span>
          {found.length > 0 && (
            <span className="text-xs text-adv-gray">· {found.length} fields found</span>
          )}
        </div>

        {/* Found fields */}
        {found.length > 0 ? (
          <div className="mb-4 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {found.map(k => {
              const v = getValue(k);
              if (!v) return null;
              return (
                <div key={k} className="flex items-start gap-2 rounded-lg bg-adv-dark px-3 py-2">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-adv-green" />
                  <div className="min-w-0">
                    <p className="text-xs text-adv-gray">{FIELD_LABELS[k] ?? k}</p>
                    <p className="truncate text-xs text-adv-off-white">{v}</p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mb-4 rounded-lg border border-adv-gold/20 bg-adv-gold/5 px-3 py-3">
            <p className="text-sm text-adv-gold">I couldn't find much in that document.</p>
            <p className="mt-1 text-xs text-adv-gray">Try uploading an invoice or quote that has your business name and contact details on it.</p>
          </div>
        )}

        {/* Notes from extraction */}
        {extraction.notes && (
          <div className="mb-4 rounded-lg border border-adv-gold/20 bg-adv-gold/5 px-3 py-2">
            <p className="flex items-start gap-1.5 text-xs text-adv-gold">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {extraction.notes}
            </p>
          </div>
        )}

        <div className="flex items-center justify-between">
          <button onClick={() => setPhase('upload')} className="flex items-center gap-1 text-sm text-adv-gray hover:text-adv-teal transition-colors">
            <RotateCcw className="h-3.5 w-3.5" /> Try a different document
          </button>
          <button
            onClick={applyExtraction}
            className="flex items-center gap-2 rounded-xl bg-adv-gold px-5 py-2.5 text-sm font-medium text-adv-dark hover:bg-amber-400 transition-colors"
          >
            <CheckCircle2 className="h-4 w-4" />
            {found.length > 0 ? "Apply to form \u2014 I'll check it" : 'Continue to form'}
          </button>
        </div>
      </div>
    );
  }

  // ── Phase: form (edit + save) ──
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-adv-white">
            {extraction ? 'Check your details' : 'Your business details'}
          </h2>
          <p className="mt-0.5 text-xs text-adv-gray">
            {extraction
              ? "I've pre-filled what I found. Edit anything that's wrong or missing, then save."
              : 'Takes 2-3 minutes. ANTON uses this to produce outputs that look like they came from you.'}
          </p>
        </div>
        {extraction && (
          <button
            onClick={() => setPhase('upload')}
            className="flex items-center gap-1 text-xs text-adv-gray hover:text-adv-teal transition-colors"
          >
            <RotateCcw className="h-3 w-3" /> Re-read doc
          </button>
        )}
      </div>

      {extraction && (extraction.foundFields?.length ?? 0) > 0 && (
        <div className="mb-4 rounded-lg border border-adv-gold/20 bg-adv-gold/5 px-3 py-2">
          <p className="text-xs text-adv-gold">
            Fields marked <span className="inline-block rounded-full bg-adv-gold/15 px-1.5 py-0.5 text-xs">from your doc</span> were filled automatically — review them before saving.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {field('businessName', 'Business name', 'Erik Lindström VVS')}
        {field('ownerName', 'Your name', 'Erik Lindström')}
        {field('tradeType', 'Your trade', 'Plumbing / VVS')}
        {field('country', 'Country', 'SE')}
        {field('hourlyRate', 'Hourly rate', '650', 'number')}
        {field('travelRate', 'Travel rate (per hour)', '450', 'number')}
        {field('defaultPaymentTerms', 'Payment terms (days)', '20', 'number')}
        <div>
          <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-adv-gray">
            VAT registered?
            {extraction?.foundFields?.includes('vatRegistered') && (
              <span className="rounded-full bg-adv-gold/10 px-1.5 py-0.5 text-xs text-adv-gold">from your doc</span>
            )}
          </label>
          <select
            value={identity.vatRegistered ? 'yes' : 'no'}
            onChange={e => setIdentity(prev => ({ ...prev, vatRegistered: e.target.value === 'yes' }))}
            className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
          >
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>
        {field('invoicePrefix', 'Invoice prefix', 'E-')}
        {field('address', 'Business address', 'Kungsgatan 12, Stockholm')}
        {field('phone', 'Phone', '070-123 45 67')}
        {field('email', 'Email', 'erik@lindstromvvs.se')}
        <div className="sm:col-span-2">
          {field('latePaymentText', 'Late payment text', 'Vid försenad betalning tillkommer dröjsmålsränta...')}
        </div>
      </div>

      {/* Payment details */}
      <div className="mt-4">
        <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-adv-gray">
          Payment details
          {extraction?.foundFields?.includes('paymentDetails') && (
            <span className="rounded-full bg-adv-gold/10 px-1.5 py-0.5 text-xs text-adv-gold">from your doc</span>
          )}
        </label>
        <input
          type="text"
          value={identity.preferredPaymentMethods?.[0]?.details || ''}
          onChange={e => setIdentity(prev => ({
            ...prev,
            preferredPaymentMethods: [{ type: 'bankgiro', details: e.target.value }],
          }))}
          placeholder="Bankgiro: 123-4567"
          className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:ring-1 focus:ring-adv-gold"
        />
      </div>

      <div className="mt-6 flex items-center justify-between">
        {phase === 'form' && !extraction && (
          <button
            onClick={() => setPhase('source')}
            className="text-sm text-adv-gray hover:text-adv-teal transition-colors"
          >
            ← Back
          </button>
        )}
        <div className="ml-auto">
          <button
            onClick={save}
            disabled={saving || !identity.businessName}
            className="flex items-center gap-2 rounded-xl bg-adv-gold px-5 py-2.5 text-sm font-medium text-adv-dark hover:bg-amber-400 disabled:opacity-40 transition-colors"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save & Continue
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Step 2: Template ───────────────────────────────────────────────────────

function TemplateStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const [mode, setMode] = useState<'paste' | 'upload'>('paste');
  const [pastedText, setPastedText] = useState('');
  const [docType, setDocType] = useState<'invoice' | 'quote' | 'message'>('invoice');
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState<Record<string, unknown> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function extract() {
    if (!pastedText.trim()) return;
    setExtracting(true);
    setError('');
    try {
      const res = await fetch('/api/trades/templates/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ text: pastedText, documentType: docType }),
      });
      if (!res.ok) throw new Error('Extraction failed');
      const data = await res.json();
      setExtracted(data);
    } catch (e) {
      setError('Could not extract template. Try pasting more text.');
    } finally {
      setExtracting(false);
    }
  }

  async function saveTemplate() {
    if (!extracted) return;
    setSaving(true);
    try {
      await fetch('/api/trades/templates/new', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          documentType: docType,
          name: `My ${docType} template`,
          templateData: extracted,
          isDefault: true,
          sourceExamples: [{ rawText: pastedText, extractedAt: new Date().toISOString() }],
        }),
      });
      onNext();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-adv-white">Show me an example</h2>
        <p className="mt-1 text-sm text-adv-gray">
          Paste one of your existing invoices or quotes. ANTON will learn your layout, vocabulary, and format.
          <strong className="text-adv-off-white"> This step is optional</strong> — you can skip and add examples later.
        </p>
      </div>

      {/* Doc type selector */}
      <div className="mb-4 flex gap-2">
        {(['invoice', 'quote', 'message'] as const).map(t => (
          <button
            key={t}
            onClick={() => setDocType(t)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              docType === t
                ? 'bg-adv-gold text-adv-dark'
                : 'border border-border bg-adv-dark text-adv-gray hover:border-adv-gold/30 hover:text-adv-gold'
            }`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {!extracted ? (
        <>
          <textarea
            value={pastedText}
            onChange={e => setPastedText(e.target.value)}
            placeholder={`Paste the text of one of your ${docType}s here. The more detail the better.`}
            rows={8}
            className="w-full resize-none rounded-xl border border-border bg-adv-dark px-4 py-3 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:ring-1 focus:ring-adv-gold"
          />
          {error && <p className="mt-2 text-xs text-adv-red">{error}</p>}
          <div className="mt-4 flex items-center justify-between">
            <button onClick={onSkip} className="text-sm text-adv-gray hover:text-adv-teal transition-colors">
              Skip for now →
            </button>
            <button
              onClick={extract}
              disabled={!pastedText.trim() || extracting}
              className="flex items-center gap-2 rounded-xl bg-adv-gold px-5 py-2.5 text-sm font-medium text-adv-dark hover:bg-amber-400 disabled:opacity-40 transition-colors"
            >
              {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {extracting ? 'Analysing…' : 'Analyse my example'}
            </button>
          </div>
        </>
      ) : (
        <ExtractionResult
          extracted={extracted}
          docType={docType}
          onConfirm={saveTemplate}
          onRedo={() => setExtracted(null)}
          saving={saving}
        />
      )}
    </div>
  );
}

function ExtractionResult({ extracted, docType, onConfirm, onRedo, saving }: {
  extracted: Record<string, unknown>;
  docType: string;
  onConfirm: () => void;
  onRedo: () => void;
  saving: boolean;
}) {
  const vocab = extracted.vocabulary as Record<string, string> | undefined;
  const formatting = extracted.formatting as Record<string, unknown> | undefined;
  const rules = (extracted.businessRules as string[]) || [];
  const notes = extracted.notes as string | undefined;

  return (
    <div>
      <div className="mb-4 rounded-xl border border-adv-gold/20 bg-adv-gold/5 px-4 py-3">
        <p className="mb-2 text-sm font-medium text-adv-white">Here's what I learned from your {docType}:</p>
        <ul className="space-y-1 text-xs text-adv-gray">
          {vocab?.documentTitle && <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-adv-green shrink-0" />You call it "{vocab.documentTitle}"</li>}
          {vocab?.labourLabel && <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-adv-green shrink-0" />Labour called "{vocab.labourLabel}"</li>}
          {vocab?.materialsLabel && <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-adv-green shrink-0" />Materials called "{vocab.materialsLabel}"</li>}
          {!!formatting?.lineItemStyle && <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-adv-green shrink-0" />Line items: {String(formatting.lineItemStyle)}</li>}
          {!!formatting?.currencyFormat && <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-adv-green shrink-0" />Currency format: {String(formatting.currencyFormat)}</li>}
          {rules.slice(0, 3).map((rule, i) => (
            <li key={i} className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-adv-green shrink-0" />{rule}</li>
          ))}
        </ul>
        {notes && (
          <p className="mt-3 rounded-lg bg-adv-dark px-3 py-2 text-xs text-adv-gray">
            <AlertCircle className="mr-1 inline h-3 w-3 text-adv-gold" />
            {notes}
          </p>
        )}
      </div>
      <p className="mb-4 text-xs text-adv-gray">Does this look right? If not, click "Try again" and paste more detail.</p>
      <div className="flex items-center justify-between">
        <button onClick={onRedo} className="text-sm text-adv-gray hover:text-adv-teal transition-colors">
          ← Try again
        </button>
        <button
          onClick={onConfirm}
          disabled={saving}
          className="flex items-center gap-2 rounded-xl bg-adv-gold px-5 py-2.5 text-sm font-medium text-adv-dark hover:bg-amber-400 disabled:opacity-40 transition-colors"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Yes, save this template
        </button>
      </div>
    </div>
  );
}

// ── Step 3: How You Work (Process Patterns) ────────────────────────────────

interface WorkStyle {
  commChannel: string;
  visitSite: string;
  paymentApproach: string;
  standardNotes: string;
}

function PatternStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const [style, setStyle] = useState<WorkStyle>({
    commChannel: 'WhatsApp',
    visitSite: 'Always',
    paymentApproach: 'Full on completion',
    standardNotes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/trades/patterns/default-work-style', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          processType: 'general',
          name: 'My Work Style',
          patternData: style,
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      onNext();
    } catch {
      setError('Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function selectField(key: keyof WorkStyle, label: string, options: string[]) {
    return (
      <div>
        <label className="mb-1 block text-xs font-medium text-adv-gray">{label}</label>
        <select
          value={style[key]}
          onChange={e => setStyle(prev => ({ ...prev, [key]: e.target.value }))}
          className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
        >
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-adv-white">How do you work?</h2>
        <p className="mt-1 text-sm text-adv-gray">
          A few quick questions about your habits. ANTON will use these to make messages and documents
          sound natural — not like a template. <strong className="text-adv-off-white">Optional</strong> — skip if you prefer.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {selectField('commChannel', 'Preferred communication channel', ['WhatsApp', 'Call', 'Email', 'SMS'])}
        {selectField('visitSite', 'Do you visit the job site before quoting?', ['Always', 'Usually', 'Rarely', 'Never'])}
        <div className="sm:col-span-2">
          {selectField('paymentApproach', 'Standard payment approach', [
            'Full on completion',
            '50% deposit + 50% on completion',
            'Invoice after 30 days',
            'Other',
          ])}
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-adv-gray">
            Standard notes or disclaimers to always include <span className="text-adv-gray">(optional)</span>
          </label>
          <textarea
            value={style.standardNotes}
            onChange={e => setStyle(prev => ({ ...prev, standardNotes: e.target.value }))}
            placeholder="e.g. All prices include VAT. Work guaranteed for 2 years."
            rows={3}
            className="w-full resize-none rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:ring-1 focus:ring-adv-gold"
          />
        </div>
      </div>

      {error && <p className="mt-2 text-xs text-adv-red">{error}</p>}

      <div className="mt-6 flex items-center justify-between">
        <button onClick={onSkip} className="text-sm text-adv-gray hover:text-adv-teal transition-colors">
          Skip for now →
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 rounded-xl bg-adv-gold px-5 py-2.5 text-sm font-medium text-adv-dark hover:bg-amber-400 disabled:opacity-40 transition-colors"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save & Finish
        </button>
      </div>
    </div>
  );
}

// ── Step 4: Done ───────────────────────────────────────────────────────────

function DoneStep({ onFinish }: { onFinish: () => void }) {
  const navigate = useNavigate();

  return (
    <div className="py-4 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-adv-green/10">
        <CheckCircle2 className="h-7 w-7 text-adv-green" />
      </div>
      <h2 className="text-lg font-semibold text-adv-white">You're set up!</h2>
      <p className="mt-2 text-sm text-adv-gray leading-relaxed">
        ANTON now knows how your business works. Every invoice and quote will be generated in your style.
        The more you use it, the better it gets.
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <button
          onClick={() => { onFinish(); navigate('/module/invoice-generator', { state: { areaId: 'trades' } }); }}
          className="flex items-center justify-center gap-2 rounded-xl bg-adv-gold px-5 py-2.5 text-sm font-medium text-adv-dark hover:bg-amber-400 transition-colors"
        >
          <FileText className="h-4 w-4" />
          Create my first invoice
        </button>
        <button
          onClick={onFinish}
          className="flex items-center justify-center gap-2 rounded-xl border border-border px-5 py-2.5 text-sm text-adv-gray hover:border-adv-gold/30 hover:text-adv-gold transition-colors"
        >
          Go to dashboard
        </button>
      </div>
    </div>
  );
}
