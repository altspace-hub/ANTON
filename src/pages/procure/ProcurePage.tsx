/**
 * ProcurePage.tsx
 *
 * Dashboard page for the Procure pillar.
 * Shows active procurement cycles with phase badges, stats, and navigation.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShoppingCart,
  Plus,
  ChevronRight,
  Package,
  Users,
  FileText,
  CheckCircle,
  Loader2,
  Search,
  Building2,
  BarChart3,
} from 'lucide-react';
import { getAuthHeader, fetchWithAuth } from '@/lib/api';

interface ProcureCycle {
  id: string;
  title: string;
  description: string | null;
  phase: 'prepare' | 'source' | 'select' | 'contract' | 'manage';
  status: 'draft' | 'active' | 'completed' | 'cancelled';
  category: string | null;
  budget: number | null;
  currency: string;
  requirement_count: number;
  vendor_count: number;
  created_at: string;
  updated_at: string;
}

const PHASE_CONFIG: Record<string, { label: string; color: string }> = {
  prepare:  { label: 'Prepare',  color: 'text-adv-blue bg-adv-blue/10 border-adv-blue/30' },
  source:   { label: 'Source',   color: 'text-adv-gold bg-adv-gold/10 border-adv-gold/30' },
  select:   { label: 'Select',   color: 'text-purple-400 bg-purple-500/10 border-purple-500/30' },
  contract: { label: 'Contract', color: 'text-adv-teal bg-adv-teal-dim border-adv-teal/30' },
  manage:   { label: 'Manage',   color: 'text-adv-green bg-adv-green/10 border-adv-green/30' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft:     { label: 'Draft',     color: 'text-adv-gray' },
  active:    { label: 'Active',    color: 'text-adv-teal' },
  completed: { label: 'Completed', color: 'text-adv-green' },
  cancelled: { label: 'Cancelled', color: 'text-adv-red' },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function ProcurePage() {
  const navigate = useNavigate();
  const [cycles, setCycles] = useState<ProcureCycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadCycles();
  }, []);

  // Prefill from Pathfinder's "start_procure" smart action — consume the
  // sessionStorage handoff once and open the new-cycle modal.
  useEffect(() => {
    const raw = sessionStorage.getItem('procure-prefill');
    if (!raw) return;
    sessionStorage.removeItem('procure-prefill');
    try {
      const prefill = JSON.parse(raw) as { title?: string; description?: string; category?: string };
      if (prefill.title) setNewTitle(prefill.title);
      if (prefill.description) setNewDescription(prefill.description);
      if (prefill.category) setNewCategory(prefill.category);
      setShowNewModal(true);
    } catch { /* malformed prefill — ignore */ }
  }, []);

  async function loadCycles() {
    try {
      const res = await fetch('/api/procure/cycles', { headers: getAuthHeader() });
      if (res.ok) {
        const data = await res.json();
        setCycles(data);
      }
    } finally {
      setLoading(false);
    }
  }

  async function createCycle() {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const res = await fetchWithAuth('/api/procure/cycles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle,
          description: newDescription || null,
          category: newCategory || null,
        }),
      });
      if (res.ok) {
        const cycle = await res.json();
        navigate(`/procure/cycle/${cycle.id}`);
      }
    } finally {
      setCreating(false);
    }
  }

  const filtered = cycles.filter(c =>
    c.title.toLowerCase().includes(search.toLowerCase()) ||
    (c.category ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const totalCycles = cycles.length;
  const activeCycles = cycles.filter(c => c.status === 'active').length;
  const completedCycles = cycles.filter(c => c.status === 'completed').length;

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-adv-dark">
      {/* Header */}
      <div className="border-b border-border bg-adv-dark-2 px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-adv-teal-dim">
              <ShoppingCart className="h-5 w-5 text-adv-teal" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-adv-off-white">Procure</h1>
              <p className="text-sm text-adv-gray">
                Phased procurement pipeline
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark transition-colors hover:bg-adv-teal-dark"
          >
            <Plus className="h-4 w-4" />
            New Cycle
          </button>
        </div>
      </div>

      <div className="flex-1 px-6 py-6 space-y-6">
        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-border bg-adv-card px-4 py-3">
            <div className="text-2xl font-bold text-adv-off-white">{totalCycles}</div>
            <div className="text-xs text-adv-gray">Total Cycles</div>
          </div>
          <div className="rounded-xl border border-border bg-adv-card px-4 py-3">
            <div className="text-2xl font-bold text-adv-teal">{activeCycles}</div>
            <div className="text-xs text-adv-gray">Active</div>
          </div>
          <div className="rounded-xl border border-border bg-adv-card px-4 py-3">
            <div className="text-2xl font-bold text-adv-green">{completedCycles}</div>
            <div className="text-xs text-adv-gray">Completed</div>
          </div>
        </div>

        {/* Catalogue & reference tiles */}
        <div className="grid grid-cols-3 gap-4">
          <button
            onClick={() => navigate('/procure/vendors')}
            className="flex items-center gap-3 rounded-xl border border-border bg-adv-card px-4 py-3 text-left transition-colors hover:border-adv-teal/40 hover:bg-adv-card/80"
          >
            <Building2 className="h-5 w-5 text-adv-teal shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-adv-off-white">Vendor directory</div>
              <div className="text-xs text-adv-gray">Searchable catalogue with trust scores</div>
            </div>
          </button>
          <button
            onClick={() => navigate('/procure/benchmarks')}
            className="flex items-center gap-3 rounded-xl border border-border bg-adv-card px-4 py-3 text-left transition-colors hover:border-adv-teal/40 hover:bg-adv-card/80"
          >
            <BarChart3 className="h-5 w-5 text-adv-teal shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-adv-off-white">Benchmarks</div>
              <div className="text-xs text-adv-gray">Validate quotes against the market</div>
            </div>
          </button>
          <button
            onClick={() => navigate('/procure/rfq-templates')}
            className="flex items-center gap-3 rounded-xl border border-border bg-adv-card px-4 py-3 text-left transition-colors hover:border-adv-teal/40 hover:bg-adv-card/80"
          >
            <FileText className="h-5 w-5 text-adv-teal shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-adv-off-white">RFQ templates</div>
              <div className="text-xs text-adv-gray">Per-category RFQ scaffolds</div>
            </div>
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-adv-gray" />
          <input
            type="text"
            placeholder="Search cycles..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border bg-adv-card py-2 pl-10 pr-4 text-sm text-adv-off-white placeholder:text-adv-gray/50 focus:border-adv-teal focus:outline-none"
          />
        </div>

        {/* Cycle Cards */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-adv-teal" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Package className="mb-4 h-12 w-12 text-adv-gray/40" />
            <h3 className="text-lg font-medium text-adv-off-white">
              {cycles.length === 0 ? 'No procurement cycles yet' : 'No matching cycles'}
            </h3>
            <p className="mt-1 text-sm text-adv-gray">
              {cycles.length === 0
                ? 'Create your first cycle to start the procurement pipeline.'
                : 'Try adjusting your search terms.'}
            </p>
            {cycles.length === 0 && (
              <button
                onClick={() => setShowNewModal(true)}
                className="mt-4 flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark transition-colors hover:bg-adv-teal-dark"
              >
                <Plus className="h-4 w-4" />
                New Cycle
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(cycle => {
              const phase = PHASE_CONFIG[cycle.phase] ?? PHASE_CONFIG.prepare;
              const status = STATUS_CONFIG[cycle.status] ?? STATUS_CONFIG.draft;

              return (
                <button
                  key={cycle.id}
                  onClick={() => navigate(`/procure/cycle/${cycle.id}`)}
                  className="flex w-full items-center gap-4 rounded-xl border border-border bg-adv-card px-5 py-4 text-left transition-colors hover:border-adv-teal/40 hover:bg-adv-card/80"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="truncate text-base font-medium text-adv-off-white">
                        {cycle.title}
                      </h3>
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${phase.color}`}>
                        {phase.label}
                      </span>
                      <span className={`text-xs font-medium ${status.color}`}>
                        {status.label}
                      </span>
                    </div>

                    {cycle.description && (
                      <p className="truncate text-sm text-adv-gray mb-2">
                        {cycle.description}
                      </p>
                    )}

                    <div className="flex items-center gap-4 text-xs text-adv-gray">
                      <span className="flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        {cycle.requirement_count} requirements
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {cycle.vendor_count} vendors
                      </span>
                      {cycle.category && (
                        <span className="flex items-center gap-1">
                          <Package className="h-3 w-3" />
                          {cycle.category}
                        </span>
                      )}
                      <span>{timeAgo(cycle.created_at)}</span>
                    </div>
                  </div>

                  <ChevronRight className="h-5 w-5 shrink-0 text-adv-gray" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* New Cycle Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-xl border border-border bg-adv-dark-2 p-6">
            <h2 className="mb-4 text-lg font-semibold text-adv-off-white">
              New Procurement Cycle
            </h2>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-adv-gray">
                  Title <span className="text-adv-red">*</span>
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  placeholder="e.g., Cloud Infrastructure RFP 2026"
                  className="w-full rounded-lg border border-border bg-adv-card px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray/50 focus:border-adv-teal focus:outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-adv-gray">
                  Description
                </label>
                <textarea
                  value={newDescription}
                  onChange={e => setNewDescription(e.target.value)}
                  placeholder="Brief description of the procurement..."
                  rows={3}
                  className="w-full rounded-lg border border-border bg-adv-card px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray/50 focus:border-adv-teal focus:outline-none resize-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-adv-gray">
                  Category
                </label>
                <input
                  type="text"
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value)}
                  placeholder="e.g., IT, Facilities, Professional Services"
                  className="w-full rounded-lg border border-border bg-adv-card px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray/50 focus:border-adv-teal focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setShowNewModal(false);
                  setNewTitle('');
                  setNewDescription('');
                  setNewCategory('');
                }}
                className="rounded-lg border border-border px-4 py-2 text-sm text-adv-gray transition-colors hover:text-adv-off-white"
              >
                Cancel
              </button>
              <button
                onClick={createCycle}
                disabled={!newTitle.trim() || creating}
                className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark transition-colors hover:bg-adv-teal-dark disabled:opacity-50"
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Create Cycle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
