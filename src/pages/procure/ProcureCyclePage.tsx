/**
 * ProcureCyclePage.tsx
 *
 * Main cycle page with a 5-phase pipeline view (Prepare, Source, Select, Contract, Manage).
 * Displays phase-specific content and allows navigation between phases.
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ShoppingCart,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  Circle,
  Plus,
  Loader2,
  FileText,
  Users,
  Search,
  Star,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  Trash2,
  DollarSign,
  Tag,
  Clock,
  Shield,
  BarChart2,
  RefreshCw,
  ClipboardList,
} from 'lucide-react';
import { getAuthHeader, fetchWithAuth } from '@/lib/api';

/* ---------- Types ---------- */

interface Cycle {
  id: string;
  title: string;
  description: string | null;
  phase: Phase;
  status: string;
  category: string | null;
  budget: number | null;
  currency: string;
  created_at: string;
  updated_at: string;
}

type Phase = 'prepare' | 'source' | 'select' | 'contract' | 'manage';

interface Requirement {
  id: string;
  title: string;
  description: string | null;
  priority: 'critical' | 'high' | 'medium' | 'low' | 'nice_to_have';
  category: string | null;
  created_at: string;
}

interface Vendor {
  id: string;
  name: string;
  contact_email: string | null;
  contact_name: string | null;
  website: string | null;
  status: 'invited' | 'responded' | 'shortlisted' | 'rejected' | 'selected';
  notes: string | null;
  created_at: string;
}

interface ProcureDocument {
  id: string;
  doc_type: 'rfi' | 'rfp' | 'rfq' | 'evaluation' | 'contract' | 'other';
  title: string;
  content: string | null;
  status: 'draft' | 'final' | 'sent';
  created_at: string;
}

interface Evaluation {
  id: string;
  vendor_id: string;
  vendor_name: string;
  criteria: string;
  score: number;
  max_score: number;
  notes: string | null;
}

interface Contract {
  id: string;
  vendor_id: string;
  vendor_name: string;
  title: string;
  value: number | null;
  currency: string;
  start_date: string | null;
  end_date: string | null;
  status: 'draft' | 'negotiation' | 'signed' | 'active' | 'expired';
  risk_flags: string[];
  terms_summary: string | null;
}

/* ---------- Constants ---------- */

const PHASES: { key: Phase; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'prepare',  label: 'Prepare',  icon: ClipboardList },
  { key: 'source',   label: 'Source',   icon: Search },
  { key: 'select',   label: 'Select',   icon: Star },
  { key: 'contract', label: 'Contract', icon: FileText },
  { key: 'manage',   label: 'Manage',   icon: BarChart2 },
];

const PHASE_INDEX: Record<Phase, number> = {
  prepare: 0, source: 1, select: 2, contract: 3, manage: 4,
};

const PRIORITY_COLORS: Record<string, string> = {
  must:   'text-adv-red bg-adv-red/10 border-adv-red/30',
  should: 'text-adv-gold bg-adv-gold/10 border-adv-gold/30',
  nice:   'text-adv-blue bg-adv-blue/10 border-adv-blue/30',
};

const VENDOR_STATUS_COLORS: Record<string, string> = {
  invited:     'text-adv-gray',
  responded:   'text-adv-blue',
  shortlisted: 'text-adv-gold',
  rejected:    'text-adv-red',
  selected:    'text-adv-green',
};

/* ---------- Component ---------- */

export default function ProcureCyclePage() {
  const { cycleId } = useParams<{ cycleId: string }>();
  const navigate = useNavigate();

  // Core state
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewPhase, setViewPhase] = useState<Phase>('prepare');

  // Phase data
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [documents, setDocuments] = useState<ProcureDocument[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);

  // UI state
  const [addingRequirement, setAddingRequirement] = useState(false);
  const [aiDiscovering, setAiDiscovering] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [rfpGenerating, setRfpGenerating] = useState(false);
  const [rfpResult, setRfpResult] = useState<string | null>(null);
  const [newReqTitle, setNewReqTitle] = useState('');
  const [newReqPriority, setNewReqPriority] = useState<'critical' | 'high' | 'medium' | 'low' | 'nice_to_have'>('medium');
  const [addingVendor, setAddingVendor] = useState(false);
  const [newVendorName, setNewVendorName] = useState('');
  const [newVendorEmail, setNewVendorEmail] = useState('');
  const [advancing, setAdvancing] = useState(false);

  const loadCycle = useCallback(async () => {
    if (!cycleId) return;
    try {
      const res = await fetch(`/api/procure/cycles/${cycleId}`, { headers: getAuthHeader() });
      if (res.ok) {
        const data = await res.json();
        setCycle(data);
        setViewPhase(data.phase);
      }
    } finally {
      setLoading(false);
    }
  }, [cycleId]);

  const loadRequirements = useCallback(async () => {
    if (!cycleId) return;
    const res = await fetch(`/api/procure/cycles/${cycleId}/requirements`, { headers: getAuthHeader() });
    if (res.ok) setRequirements(await res.json());
  }, [cycleId]);

  const loadVendors = useCallback(async () => {
    if (!cycleId) return;
    const res = await fetch(`/api/procure/cycles/${cycleId}/vendors`, { headers: getAuthHeader() });
    if (res.ok) setVendors(await res.json());
  }, [cycleId]);

  const loadDocuments = useCallback(async () => {
    if (!cycleId) return;
    const res = await fetch(`/api/procure/cycles/${cycleId}/documents`, { headers: getAuthHeader() });
    if (res.ok) setDocuments(await res.json());
  }, [cycleId]);

  const loadEvaluations = useCallback(async () => {
    if (!cycleId) return;
    const res = await fetch(`/api/procure/cycles/${cycleId}/evaluations`, { headers: getAuthHeader() });
    if (res.ok) setEvaluations(await res.json());
  }, [cycleId]);

  const loadContracts = useCallback(async () => {
    if (!cycleId) return;
    const res = await fetch(`/api/procure/cycles/${cycleId}/contracts`, { headers: getAuthHeader() });
    if (res.ok) setContracts(await res.json());
  }, [cycleId]);

  useEffect(() => {
    loadCycle();
    loadRequirements();
    loadVendors();
    loadDocuments();
    loadEvaluations();
    loadContracts();
  }, [loadCycle, loadRequirements, loadVendors, loadDocuments, loadEvaluations, loadContracts]);

  /* ---------- Actions ---------- */

  async function handleAiDiscover() {
    if (!cycle) return;
    setAiDiscovering(true);
    setAiResult(null);
    try {
      const context = `Procurement: ${cycle.title}\nDescription: ${cycle.description || 'Not specified'}\nCategory: ${cycle.category || 'General'}\n\nGenerate a comprehensive list of requirements for this procurement. Include functional, technical, compliance, and commercial requirements. Format as a numbered list with priority (critical/high/medium/low) for each.`;
      const res = await fetchWithAuth('/api/procure/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promptType: 'prepare', context }),
      });
      if (res.ok) {
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            for (const line of chunk.split('\n')) {
              if (line.startsWith('data: ')) {
                try {
                  const evt = JSON.parse(line.slice(6));
                  if (evt.delta?.text) fullText += evt.delta.text;
                } catch {}
              }
            }
            setAiResult(fullText);
          }
        }
      }
    } finally {
      setAiDiscovering(false);
    }
  }

  async function handleGenerateRFP() {
    if (!cycle) return;
    setRfpGenerating(true);
    setRfpResult(null);
    try {
      const reqList = requirements.map(r => `- [${r.priority}] ${r.title}`).join('\n');
      const context = `Procurement: ${cycle.title}\nDescription: ${cycle.description || 'N/A'}\nCategory: ${cycle.category || 'General'}\n\nRequirements:\n${reqList || 'None defined yet'}\n\nVendors invited: ${vendors.length}\n\nGenerate a professional RFP (Request for Proposal) document based on these requirements. Include: executive summary, scope of work, requirements, evaluation criteria, timeline, and submission instructions.`;
      const res = await fetchWithAuth('/api/procure/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promptType: 'source', context }),
      });
      if (res.ok) {
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let text = '';
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            for (const line of decoder.decode(value, { stream: true }).split('\n')) {
              if (line.startsWith('data: ')) {
                try { const e = JSON.parse(line.slice(6)); if (e.delta?.text) text += e.delta.text; } catch {}
              }
            }
            setRfpResult(text);
          }
        }
      }
    } finally { setRfpGenerating(false); }
  }

  async function addRequirement() {
    if (!newReqTitle.trim() || !cycleId) return;
    await fetchWithAuth(`/api/procure/cycles/${cycleId}/requirements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newReqTitle, priority: newReqPriority }),
    });
    setNewReqTitle('');
    setAddingRequirement(false);
    loadRequirements();
  }

  async function removeRequirement(reqId: string) {
    if (!cycleId) return;
    // Server registers DELETE /procure/requirements/:id (flat, not nested under
    // the cycle) — the old nested URL 404'd silently (fixed 2026-07-17).
    await fetchWithAuth(`/api/procure/requirements/${reqId}`, { method: 'DELETE' });
    loadRequirements();
  }

  async function addVendor() {
    if (!newVendorName.trim() || !cycleId) return;
    await fetchWithAuth(`/api/procure/cycles/${cycleId}/vendors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newVendorName, contact_email: newVendorEmail || null }),
    });
    setNewVendorName('');
    setNewVendorEmail('');
    setAddingVendor(false);
    loadVendors();
  }

  async function advancePhase() {
    if (!cycleId || !cycle) return;
    const currentIdx = PHASE_INDEX[cycle.phase];
    if (currentIdx >= 4) return;
    setAdvancing(true);
    try {
      const nextPhase = PHASES[currentIdx + 1].key;
      const res = await fetchWithAuth(`/api/procure/cycles/${cycleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase: nextPhase }),
      });
      if (res.ok) {
        const updated = await res.json();
        setCycle(updated);
        setViewPhase(nextPhase);
      }
    } finally {
      setAdvancing(false);
    }
  }

  /* ---------- Render helpers ---------- */

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-adv-dark">
        <Loader2 className="h-8 w-8 animate-spin text-adv-teal" />
      </div>
    );
  }

  if (!cycle) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-adv-dark">
        <p className="text-adv-gray">Cycle not found.</p>
        <button onClick={() => navigate('/procure')} className="mt-4 text-sm text-adv-teal hover:underline">
          Back to Procure
        </button>
      </div>
    );
  }

  const currentPhaseIdx = PHASE_INDEX[cycle.phase];
  const viewPhaseIdx = PHASE_INDEX[viewPhase];

  return (
    <div className="flex h-full overflow-hidden bg-adv-dark">
      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-y-auto">
        {/* Header */}
        <div className="border-b border-border bg-adv-dark-2 px-6 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/procure')}
              className="flex items-center gap-1 text-sm text-adv-gray hover:text-adv-teal transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              Procure
            </button>
            <span className="text-adv-gray/40">/</span>
            <h1 className="text-lg font-semibold text-adv-off-white truncate">
              {cycle.title}
            </h1>
          </div>
        </div>

        {/* Phase Stepper */}
        <div className="border-b border-border bg-adv-dark-2 px-6 py-4">
          <div className="flex items-center gap-1">
            {PHASES.map((phase, idx) => {
              const isCompleted = idx < currentPhaseIdx;
              const isCurrent = idx === currentPhaseIdx;
              const isViewing = idx === viewPhaseIdx;
              const PhaseIcon = phase.icon;

              return (
                <div key={phase.key} className="flex items-center flex-1">
                  <button
                    onClick={() => setViewPhase(phase.key)}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors w-full
                      ${isViewing
                        ? 'bg-adv-teal/10 border border-adv-teal/40 text-adv-teal'
                        : isCompleted
                          ? 'text-adv-green hover:bg-adv-green/5'
                          : isCurrent
                            ? 'text-adv-off-white hover:bg-white/5'
                            : 'text-adv-gray/50 hover:bg-white/5'
                      }`}
                  >
                    {isCompleted ? (
                      <CheckCircle className="h-4 w-4 shrink-0 text-adv-green" />
                    ) : isCurrent ? (
                      <PhaseIcon className="h-4 w-4 shrink-0 text-adv-teal" />
                    ) : (
                      <Circle className="h-4 w-4 shrink-0" />
                    )}
                    <span className="hidden sm:inline">{phase.label}</span>
                  </button>
                  {idx < PHASES.length - 1 && (
                    <ArrowRight className={`mx-1 h-3 w-3 shrink-0 ${idx < currentPhaseIdx ? 'text-adv-green/50' : 'text-adv-gray/30'}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Phase Content */}
        <div className="flex-1 p-6">
          {viewPhase === 'prepare' && (
            <PreparePhase
              requirements={requirements}
              addingRequirement={addingRequirement}
              setAddingRequirement={setAddingRequirement}
              newReqTitle={newReqTitle}
              setNewReqTitle={setNewReqTitle}
              newReqPriority={newReqPriority}
              setNewReqPriority={setNewReqPriority}
              addRequirement={addRequirement}
              removeRequirement={removeRequirement}
              handleAiDiscover={handleAiDiscover}
              aiDiscovering={aiDiscovering}
              aiResult={aiResult}
            />
          )}
          {viewPhase === 'source' && (
            <SourcePhase
              vendors={vendors}
              documents={documents}
              addingVendor={addingVendor}
              setAddingVendor={setAddingVendor}
              newVendorName={newVendorName}
              setNewVendorName={setNewVendorName}
              newVendorEmail={newVendorEmail}
              setNewVendorEmail={setNewVendorEmail}
              addVendor={addVendor}
              onGenerateRFP={handleGenerateRFP}
              rfpGenerating={rfpGenerating}
              rfpResult={rfpResult}
            />
          )}
          {viewPhase === 'select' && (
            <SelectPhase
              vendors={vendors}
              evaluations={evaluations}
              requirements={requirements}
            />
          )}
          {viewPhase === 'contract' && (
            <ContractPhase contracts={contracts} />
          )}
          {viewPhase === 'manage' && (
            <ManagePhase contracts={contracts} vendors={vendors} />
          )}

          {/* Phase Navigation */}
          <div className="mt-8 flex items-center justify-between border-t border-border pt-6">
            <button
              onClick={() => viewPhaseIdx > 0 && setViewPhase(PHASES[viewPhaseIdx - 1].key)}
              disabled={viewPhaseIdx === 0}
              className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-adv-gray transition-colors hover:text-adv-off-white disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous Phase
            </button>

            <div className="flex items-center gap-3">
              {viewPhaseIdx === currentPhaseIdx && currentPhaseIdx < 4 && (
                <button
                  onClick={advancePhase}
                  disabled={advancing}
                  className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark transition-colors hover:bg-adv-teal-dark disabled:opacity-50"
                >
                  {advancing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="h-4 w-4" />
                  )}
                  Advance Phase
                </button>
              )}

              <button
                onClick={() => viewPhaseIdx < 4 && setViewPhase(PHASES[viewPhaseIdx + 1].key)}
                disabled={viewPhaseIdx === 4}
                className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-adv-gray transition-colors hover:text-adv-off-white disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Next Phase
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <div className="hidden w-72 shrink-0 border-l border-border bg-adv-dark-2 p-5 lg:block overflow-y-auto">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-adv-gray">
          Cycle Info
        </h2>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-adv-gray">Title</label>
            <p className="text-sm text-adv-off-white">{cycle.title}</p>
          </div>

          {cycle.description && (
            <div>
              <label className="text-xs text-adv-gray">Description</label>
              <p className="text-sm text-adv-off-white">{cycle.description}</p>
            </div>
          )}

          <div>
            <label className="text-xs text-adv-gray">Status</label>
            <p className="text-sm text-adv-off-white capitalize">{cycle.status}</p>
          </div>

          <div>
            <label className="text-xs text-adv-gray">Current Phase</label>
            <p className="text-sm text-adv-teal capitalize">{cycle.phase}</p>
          </div>

          {cycle.budget !== null && (
            <div>
              <label className="text-xs text-adv-gray">Budget</label>
              <p className="flex items-center gap-1 text-sm text-adv-off-white">
                <DollarSign className="h-3 w-3 text-adv-gray" />
                {cycle.budget.toLocaleString()} {cycle.currency}
              </p>
            </div>
          )}

          {cycle.category && (
            <div>
              <label className="text-xs text-adv-gray">Category</label>
              <p className="flex items-center gap-1 text-sm text-adv-off-white">
                <Tag className="h-3 w-3 text-adv-gray" />
                {cycle.category}
              </p>
            </div>
          )}

          <div>
            <label className="text-xs text-adv-gray">Created</label>
            <p className="flex items-center gap-1 text-sm text-adv-off-white">
              <Clock className="h-3 w-3 text-adv-gray" />
              {new Date(cycle.created_at).toLocaleDateString()}
            </p>
          </div>

          <div className="border-t border-border pt-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-adv-gray">
              Summary
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-adv-gray">Requirements</span>
                <span className="text-adv-off-white">{requirements.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-adv-gray">Vendors</span>
                <span className="text-adv-off-white">{vendors.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-adv-gray">Documents</span>
                <span className="text-adv-off-white">{documents.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-adv-gray">Contracts</span>
                <span className="text-adv-off-white">{contracts.length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ========== Phase Components ========== */

/* --- Prepare Phase --- */

interface PreparePhaseProps {
  requirements: Requirement[];
  addingRequirement: boolean;
  setAddingRequirement: (v: boolean) => void;
  newReqTitle: string;
  setNewReqTitle: (v: string) => void;
  newReqPriority: 'critical' | 'high' | 'medium' | 'low' | 'nice_to_have';
  setNewReqPriority: (v: 'critical' | 'high' | 'medium' | 'low' | 'nice_to_have') => void;
  addRequirement: () => void;
  removeRequirement: (id: string) => void;
  handleAiDiscover: () => void;
  aiDiscovering: boolean;
  aiResult: string | null;
}

function PreparePhase({
  requirements, addingRequirement, setAddingRequirement,
  newReqTitle, setNewReqTitle, newReqPriority, setNewReqPriority,
  addRequirement, removeRequirement, handleAiDiscover, aiDiscovering, aiResult,
}: PreparePhaseProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-adv-off-white">Requirements</h2>
          <p className="text-sm text-adv-gray">Define what you need from this procurement.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleAiDiscover}
            disabled={aiDiscovering}
            className="flex items-center gap-2 rounded-lg border border-adv-teal/30 px-3 py-2 text-sm text-adv-teal transition-colors hover:bg-adv-teal/10 disabled:opacity-50"
            title="AI-assisted requirements discovery"
          >
            {aiDiscovering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {aiDiscovering ? 'Discovering...' : 'AI Discover'}
          </button>
          <button
            onClick={() => setAddingRequirement(true)}
            className="flex items-center gap-2 rounded-lg bg-adv-teal px-3 py-2 text-sm font-medium text-adv-dark transition-colors hover:bg-adv-teal-dark"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>
      </div>

      {/* Add form */}
      {addingRequirement && (
        <div className="rounded-xl border border-adv-teal/30 bg-adv-card p-4 space-y-3">
          <input
            type="text"
            value={newReqTitle}
            onChange={e => setNewReqTitle(e.target.value)}
            placeholder="Requirement title..."
            className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray/50 focus:border-adv-teal focus:outline-none"
            autoFocus
            onKeyDown={e => e.key === 'Enter' && addRequirement()}
          />
          <div className="flex items-center gap-3">
            <label className="text-xs text-adv-gray">Priority:</label>
            {(['critical', 'high', 'medium', 'low', 'nice_to_have'] as const).map(p => (
              <button
                key={p}
                onClick={() => setNewReqPriority(p)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  newReqPriority === p ? PRIORITY_COLORS[p] : 'border-border text-adv-gray hover:text-adv-off-white'
                }`}
              >
                {p === 'nice_to_have' ? 'Nice to have' : p.charAt(0).toUpperCase() + p.slice(1).replace('_', ' ')}
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setAddingRequirement(false); setNewReqTitle(''); }}
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:text-adv-off-white"
            >
              Cancel
            </button>
            <button
              onClick={addRequirement}
              disabled={!newReqTitle.trim()}
              className="rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark disabled:opacity-50"
            >
              Add Requirement
            </button>
          </div>
        </div>
      )}

      {/* Requirements list */}
      {requirements.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-adv-card/50 py-12 text-center">
          <ClipboardList className="mx-auto mb-3 h-8 w-8 text-adv-gray/40" />
          <p className="text-sm text-adv-gray">No requirements yet. Add your first requirement or use AI Discover.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {requirements.map(req => (
            <div
              key={req.id}
              className="flex items-center justify-between rounded-lg border border-border bg-adv-card px-4 py-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${PRIORITY_COLORS[req.priority] ?? PRIORITY_COLORS.should}`}>
                  {req.priority}
                </span>
                <span className="truncate text-sm text-adv-off-white">{req.title}</span>
              </div>
              <button
                onClick={() => removeRequirement(req.id)}
                className="shrink-0 p-1 text-adv-gray/50 hover:text-adv-red transition-colors"
                title="Remove requirement"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {aiResult && (
        <div className="mt-4 rounded-lg border border-adv-teal/30 bg-adv-dark p-4">
          <h3 className="text-xs font-semibold uppercase text-adv-teal mb-2">AI-Discovered Requirements</h3>
          <div className="text-sm text-adv-off-white whitespace-pre-wrap leading-relaxed">{aiResult}</div>
        </div>
      )}
    </div>
  );
}

/* --- Source Phase --- */

interface SourcePhaseProps {
  vendors: Vendor[];
  documents: ProcureDocument[];
  addingVendor: boolean;
  setAddingVendor: (v: boolean) => void;
  newVendorName: string;
  setNewVendorName: (v: string) => void;
  newVendorEmail: string;
  setNewVendorEmail: (v: string) => void;
  addVendor: () => void;
  onGenerateRFP: () => void;
  rfpGenerating: boolean;
  rfpResult: string | null;
}

function SourcePhase({
  vendors, documents, addingVendor, setAddingVendor,
  newVendorName, setNewVendorName, newVendorEmail, setNewVendorEmail,
  addVendor, onGenerateRFP, rfpGenerating, rfpResult,
}: SourcePhaseProps) {
  return (
    <div className="space-y-8">
      {/* Vendors Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-adv-off-white">Vendors</h2>
            <p className="text-sm text-adv-gray">Identify and invite potential suppliers.</p>
          </div>
          <button
            onClick={() => setAddingVendor(true)}
            className="flex items-center gap-2 rounded-lg bg-adv-teal px-3 py-2 text-sm font-medium text-adv-dark transition-colors hover:bg-adv-teal-dark"
          >
            <Plus className="h-4 w-4" />
            Add Vendor
          </button>
        </div>

        {addingVendor && (
          <div className="rounded-xl border border-adv-teal/30 bg-adv-card p-4 mb-4 space-y-3">
            <input
              type="text"
              value={newVendorName}
              onChange={e => setNewVendorName(e.target.value)}
              placeholder="Vendor name..."
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray/50 focus:border-adv-teal focus:outline-none"
              autoFocus
            />
            <input
              type="email"
              value={newVendorEmail}
              onChange={e => setNewVendorEmail(e.target.value)}
              placeholder="Contact email (optional)..."
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray/50 focus:border-adv-teal focus:outline-none"
              onKeyDown={e => e.key === 'Enter' && addVendor()}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setAddingVendor(false); setNewVendorName(''); setNewVendorEmail(''); }}
                className="rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:text-adv-off-white"
              >
                Cancel
              </button>
              <button
                onClick={addVendor}
                disabled={!newVendorName.trim()}
                className="rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark disabled:opacity-50"
              >
                Add Vendor
              </button>
            </div>
          </div>
        )}

        {vendors.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-adv-card/50 py-10 text-center">
            <Users className="mx-auto mb-3 h-8 w-8 text-adv-gray/40" />
            <p className="text-sm text-adv-gray">No vendors added yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {vendors.map(v => (
              <div key={v.id} className="flex items-center justify-between rounded-lg border border-border bg-adv-card px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-adv-off-white">{v.name}</span>
                    <span className={`text-xs capitalize ${VENDOR_STATUS_COLORS[v.status] ?? 'text-adv-gray'}`}>
                      {v.status}
                    </span>
                  </div>
                  {v.contact_email && (
                    <p className="text-xs text-adv-gray">{v.contact_email}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Documents Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-adv-off-white">Documents</h2>
            <p className="text-sm text-adv-gray">RFI, RFP, and other procurement documents.</p>
          </div>
          <button
            onClick={onGenerateRFP}
            disabled={rfpGenerating}
            className="flex items-center gap-2 rounded-lg border border-adv-teal/30 px-3 py-2 text-sm text-adv-teal transition-colors hover:bg-adv-teal/10 disabled:opacity-50"
            title="AI-generate RFP/RFI"
          >
            {rfpGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {rfpGenerating ? 'Generating...' : 'Generate RFP'}
          </button>
        </div>

        {documents.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-adv-card/50 py-10 text-center">
            <FileText className="mx-auto mb-3 h-8 w-8 text-adv-gray/40" />
            <p className="text-sm text-adv-gray">No documents yet. Use AI to generate RFP/RFI documents.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {documents.map(doc => (
              <div key={doc.id} className="flex items-center justify-between rounded-lg border border-border bg-adv-card px-4 py-3">
                <div className="flex items-center gap-3">
                  <FileText className="h-4 w-4 text-adv-gray" />
                  <div>
                    <span className="text-sm text-adv-off-white">{doc.title}</span>
                    <div className="flex items-center gap-2 text-xs text-adv-gray">
                      <span className="uppercase">{doc.doc_type}</span>
                      <span className="capitalize">{doc.status}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {rfpResult && (
          <div className="mt-4 rounded-lg border border-adv-teal/30 bg-adv-dark p-4">
            <h3 className="text-xs font-semibold uppercase text-adv-teal mb-2">Generated RFP</h3>
            <div className="text-sm text-adv-off-white whitespace-pre-wrap leading-relaxed">{rfpResult}</div>
          </div>
        )}
      </div>
    </div>
  );
}

/* --- Select Phase --- */

interface SelectPhaseProps {
  vendors: Vendor[];
  evaluations: Evaluation[];
  requirements: Requirement[];
}

function SelectPhase({ vendors, evaluations, requirements }: SelectPhaseProps) {
  // Group evaluations by vendor
  const vendorScores: Record<string, { name: string; total: number; max: number; scores: Evaluation[] }> = {};
  for (const ev of evaluations) {
    if (!vendorScores[ev.vendor_id]) {
      vendorScores[ev.vendor_id] = { name: ev.vendor_name, total: 0, max: 0, scores: [] };
    }
    vendorScores[ev.vendor_id].total += ev.score;
    vendorScores[ev.vendor_id].max += ev.max_score;
    vendorScores[ev.vendor_id].scores.push(ev);
  }

  // Unique criteria from evaluations
  const criteria = [...new Set(evaluations.map(e => e.criteria))];

  // Sort vendors by total score descending
  const ranked = Object.entries(vendorScores).sort(([, a], [, b]) => {
    const pctA = a.max > 0 ? a.total / a.max : 0;
    const pctB = b.max > 0 ? b.total / b.max : 0;
    return pctB - pctA;
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-adv-off-white">Evaluation Matrix</h2>
        <p className="text-sm text-adv-gray">Compare vendors across evaluation criteria.</p>
      </div>

      {evaluations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-adv-card/50 py-12 text-center">
          <BarChart2 className="mx-auto mb-3 h-8 w-8 text-adv-gray/40" />
          <p className="text-sm text-adv-gray">No evaluations yet. Score vendors against your criteria to build the matrix.</p>
          <button
            className="mt-4 flex items-center gap-2 mx-auto rounded-lg border border-adv-teal/30 px-3 py-2 text-sm text-adv-teal transition-colors hover:bg-adv-teal/10"
          >
            <Sparkles className="h-4 w-4" />
            AI-Assisted Evaluation
          </button>
        </div>
      ) : (
        <>
          {/* Evaluation grid */}
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-adv-card">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-adv-gray">
                    Vendor
                  </th>
                  {criteria.map(c => (
                    <th key={c} className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-adv-gray">
                      {c}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-adv-teal">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {ranked.map(([vendorId, data], idx) => (
                  <tr key={vendorId} className={`border-b border-border ${idx === 0 ? 'bg-adv-teal/5' : 'bg-adv-dark'}`}>
                    <td className="px-4 py-3 text-adv-off-white font-medium">
                      {idx === 0 && <Star className="inline h-3 w-3 text-adv-gold mr-1" />}
                      {data.name}
                    </td>
                    {criteria.map(c => {
                      const ev = data.scores.find(s => s.criteria === c);
                      return (
                        <td key={c} className="px-4 py-3 text-center text-adv-off-white">
                          {ev ? `${ev.score}/${ev.max_score}` : '-'}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-center font-semibold text-adv-teal">
                      {data.max > 0 ? `${Math.round((data.total / data.max) * 100)}%` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Ranking summary */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-adv-off-white">Overall Ranking</h3>
            <div className="space-y-2">
              {ranked.map(([vendorId, data], idx) => {
                const pct = data.max > 0 ? Math.round((data.total / data.max) * 100) : 0;
                return (
                  <div key={vendorId} className="flex items-center gap-3 rounded-lg border border-border bg-adv-card px-4 py-2">
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${idx === 0 ? 'bg-adv-teal text-adv-dark' : 'bg-adv-dark text-adv-gray'}`}>
                      {idx + 1}
                    </span>
                    <span className="flex-1 text-sm text-adv-off-white">{data.name}</span>
                    <div className="w-32 h-2 rounded-full bg-adv-dark overflow-hidden">
                      <div className="h-full rounded-full bg-adv-teal" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-sm font-medium text-adv-teal w-12 text-right">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* --- Contract Phase --- */

interface ContractPhaseProps {
  contracts: Contract[];
}

function ContractPhase({ contracts }: ContractPhaseProps) {
  const CONTRACT_STATUS_COLORS: Record<string, string> = {
    draft:       'text-adv-gray bg-adv-dark border-border',
    negotiation: 'text-adv-gold bg-adv-gold/10 border-adv-gold/30',
    signed:      'text-adv-green bg-adv-green/10 border-adv-green/30',
    active:      'text-adv-teal bg-adv-teal-dim border-adv-teal/30',
    expired:     'text-adv-red bg-adv-red/10 border-adv-red/30',
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-adv-off-white">Contracts</h2>
        <p className="text-sm text-adv-gray">Contract details, terms, and risk assessment.</p>
      </div>

      {contracts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-adv-card/50 py-12 text-center">
          <FileText className="mx-auto mb-3 h-8 w-8 text-adv-gray/40" />
          <p className="text-sm text-adv-gray">No contracts yet. Contracts are created after vendor selection.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {contracts.map(contract => (
            <div key={contract.id} className="rounded-xl border border-border bg-adv-card p-5 space-y-4">
              {/* Contract header */}
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-base font-medium text-adv-off-white">{contract.title}</h3>
                  <p className="text-sm text-adv-gray">Vendor: {contract.vendor_name}</p>
                </div>
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${CONTRACT_STATUS_COLORS[contract.status] ?? CONTRACT_STATUS_COLORS.draft}`}>
                  {contract.status}
                </span>
              </div>

              {/* Contract details */}
              <div className="grid grid-cols-3 gap-4 text-sm">
                {contract.value !== null && (
                  <div>
                    <label className="text-xs text-adv-gray">Value</label>
                    <p className="text-adv-off-white">{contract.value.toLocaleString()} {contract.currency}</p>
                  </div>
                )}
                {contract.start_date && (
                  <div>
                    <label className="text-xs text-adv-gray">Start</label>
                    <p className="text-adv-off-white">{new Date(contract.start_date).toLocaleDateString()}</p>
                  </div>
                )}
                {contract.end_date && (
                  <div>
                    <label className="text-xs text-adv-gray">End</label>
                    <p className="text-adv-off-white">{new Date(contract.end_date).toLocaleDateString()}</p>
                  </div>
                )}
              </div>

              {/* Terms summary */}
              {contract.terms_summary && (
                <div>
                  <label className="text-xs text-adv-gray">Terms Summary</label>
                  <p className="mt-1 text-sm text-adv-off-white whitespace-pre-line">{contract.terms_summary}</p>
                </div>
              )}

              {/* Risk flags */}
              {contract.risk_flags.length > 0 && (
                <div>
                  <label className="flex items-center gap-1 text-xs text-adv-gold mb-2">
                    <AlertTriangle className="h-3 w-3" />
                    Risk Flags
                  </label>
                  <div className="space-y-1">
                    {contract.risk_flags.map((flag, i) => (
                      <div key={i} className="flex items-start gap-2 rounded-lg bg-adv-gold/5 border border-adv-gold/20 px-3 py-2">
                        <Shield className="mt-0.5 h-3 w-3 shrink-0 text-adv-gold" />
                        <span className="text-xs text-adv-off-white">{flag}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* --- Manage Phase --- */

interface ManagePhaseProps {
  contracts: Contract[];
  vendors: Vendor[];
}

function ManagePhase({ contracts, vendors }: ManagePhaseProps) {
  const activeContracts = contracts.filter(c => c.status === 'active' || c.status === 'signed');
  const expiringContracts = contracts.filter(c => {
    if (!c.end_date) return false;
    const daysUntilEnd = (new Date(c.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return daysUntilEnd > 0 && daysUntilEnd <= 90;
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-adv-off-white">Contract Management</h2>
        <p className="text-sm text-adv-gray">Track performance and manage ongoing vendor relationships.</p>
      </div>

      {/* Renewal Alerts */}
      {expiringContracts.length > 0 && (
        <div className="rounded-xl border border-adv-gold/30 bg-adv-gold/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <RefreshCw className="h-4 w-4 text-adv-gold" />
            <h3 className="text-sm font-semibold text-adv-gold">Renewal Alerts</h3>
          </div>
          <div className="space-y-2">
            {expiringContracts.map(c => {
              const daysLeft = Math.ceil((new Date(c.end_date!).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
              return (
                <div key={c.id} className="flex items-center justify-between rounded-lg bg-adv-card/50 px-3 py-2 text-sm">
                  <span className="text-adv-off-white">{c.title} ({c.vendor_name})</span>
                  <span className={`text-xs font-medium ${daysLeft <= 30 ? 'text-adv-red' : 'text-adv-gold'}`}>
                    {daysLeft} days remaining
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Active Contracts Performance */}
      {activeContracts.length === 0 && expiringContracts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-adv-card/50 py-12 text-center">
          <BarChart2 className="mx-auto mb-3 h-8 w-8 text-adv-gray/40" />
          <p className="text-sm text-adv-gray">No active contracts to manage yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-adv-off-white">Active Contracts</h3>
          {activeContracts.map(c => (
            <div key={c.id} className="rounded-xl border border-border bg-adv-card p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="text-sm font-medium text-adv-off-white">{c.title}</h4>
                  <p className="text-xs text-adv-gray">{c.vendor_name}</p>
                </div>
                <span className="inline-flex rounded-full border border-adv-teal/30 bg-adv-teal-dim px-2 py-0.5 text-xs font-medium text-adv-teal">
                  {c.status}
                </span>
              </div>
              {c.value !== null && (
                <div className="flex items-center gap-4 text-xs text-adv-gray">
                  <span className="flex items-center gap-1">
                    <DollarSign className="h-3 w-3" />
                    {c.value.toLocaleString()} {c.currency}
                  </span>
                  {c.end_date && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Ends {new Date(c.end_date).toLocaleDateString()}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Vendor Summary */}
      {vendors.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-adv-off-white">Vendor Summary</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border bg-adv-card px-4 py-3 text-center">
              <div className="text-xl font-bold text-adv-off-white">{vendors.length}</div>
              <div className="text-xs text-adv-gray">Total Vendors</div>
            </div>
            <div className="rounded-xl border border-border bg-adv-card px-4 py-3 text-center">
              <div className="text-xl font-bold text-adv-green">
                {vendors.filter(v => v.status === 'selected').length}
              </div>
              <div className="text-xs text-adv-gray">Selected</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
