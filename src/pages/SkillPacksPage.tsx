import { useState, useEffect } from 'react';
import {
  Package,
  ChevronDown,
  ChevronRight,
  Download,
  Zap,
  Users,
  Briefcase,
  BarChart3,
  BookOpen,
  Plus,
  X,
  Check,
} from 'lucide-react';
import { getSkillPacks, createSkillPack } from '@/lib/api';
import type { SkillPack } from '@/lib/api';

// ── Role icon mapping ──────────────────────────────────────────────────────

const ROLE_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  'MLRO / Compliance Officer': BookOpen,
  'Startup Founder / CEO': Zap,
  'HR Business Partner / CHRO': Users,
  'Internal / External Auditor': BarChart3,
  'Project Manager / Programme Lead': Briefcase,
};

function getRoleIcon(role: string): React.ComponentType<{ className?: string }> {
  return ROLE_ICON_MAP[role] || Package;
}

const INDUSTRY_COLOR_MAP: Record<string, string> = {
  'Financial Services': 'text-adv-teal',
  'Technology / Startup': 'text-adv-blue',
  'Human Resources': 'text-adv-green',
  'Audit & Assurance': 'text-adv-gold',
  'Regulatory Change / Transformation': 'text-adv-blue',
};

function getIndustryColor(industry: string): string {
  return INDUSTRY_COLOR_MAP[industry] || 'text-adv-gray';
}

// ── Toast notification ─────────────────────────────────────────────────────

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl border border-adv-teal/40 bg-adv-card px-4 py-3 shadow-xl">
      <Check className="h-4 w-4 shrink-0 text-adv-teal" />
      <span className="text-sm text-adv-off-white">{message}</span>
      <button onClick={onClose} className="text-adv-gray hover:text-adv-off-white transition-colors">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── Create Pack Modal ──────────────────────────────────────────────────────

interface CreatePackModalProps {
  onClose: () => void;
  onCreated: (pack: SkillPack) => void;
}

const INDUSTRY_OPTIONS = [
  'Financial Services',
  'Technology / Startup',
  'Human Resources',
  'Audit & Assurance',
  'Regulatory Change / Transformation',
  'Legal',
  'Insurance',
  'Asset Management',
  'Other',
];

function CreatePackModal({ onClose, onCreated }: CreatePackModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [targetRole, setTargetRole] = useState('');
  const [targetIndustry, setTargetIndustry] = useState(INDUSTRY_OPTIONS[0]);
  const [modulesRaw, setModulesRaw] = useState('');
  const [gettingStarted, setGettingStarted] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const inputCls = 'w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1';
  const labelCls = 'block text-xs font-medium text-adv-off-white mb-1';

  async function handleSubmit() {
    if (!name.trim()) {
      setError('Pack name is required');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const modules = modulesRaw
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean);
      const created = await createSkillPack({
        name: name.trim(),
        description: description.trim() || undefined,
        target_role: targetRole.trim() || undefined,
        target_industry: targetIndustry,
        modules,
        getting_started: gettingStarted.trim() || undefined,
      });
      onCreated(created);
      onClose();
    } catch {
      setError('Failed to create skill pack. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-adv-card p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-adv-white flex items-center gap-2">
            <Plus className="h-4 w-4 text-adv-teal" />
            Create Custom Pack
          </h2>
          <button onClick={onClose} className="text-adv-gray hover:text-adv-off-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className={labelCls}>Pack Name *</label>
            <input
              className={inputCls}
              placeholder="e.g., Nordic Bank AML Pack"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <textarea
              className={`${inputCls} resize-none`}
              rows={2}
              placeholder="Briefly describe what this pack is optimised for..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Target Role</label>
              <input
                className={inputCls}
                placeholder="e.g., Head of Compliance"
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Industry</label>
              <select
                className={inputCls}
                value={targetIndustry}
                onChange={(e) => setTargetIndustry(e.target.value)}
              >
                {INDUSTRY_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>Included Modules (comma-separated IDs)</label>
            <input
              className={inputCls}
              placeholder="e.g., gap-analysis, policy-document, risk-assessment"
              value={modulesRaw}
              onChange={(e) => setModulesRaw(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Getting Started Guide</label>
            <textarea
              className={`${inputCls} resize-none`}
              rows={3}
              placeholder="Brief instructions for a new user activating this pack..."
              value={gettingStarted}
              onChange={(e) => setGettingStarted(e.target.value)}
            />
          </div>
          {error && <p className="text-xs text-adv-red">{error}</p>}
        </div>

        <div className="mt-5 flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50"
          >
            {submitting ? 'Creating...' : 'Create Pack'}
          </button>
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm text-adv-gray hover:text-adv-off-white transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Pack Card ──────────────────────────────────────────────────────────────

function PackCard({
  pack,
  onActivate,
  onExport,
}: {
  pack: SkillPack;
  onActivate: (pack: SkillPack) => void;
  onExport: (pack: SkillPack) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const Icon = getRoleIcon(pack.target_role);
  const industryColor = getIndustryColor(pack.target_industry);

  return (
    <div className="rounded-xl border border-border bg-adv-card overflow-hidden shadow-sm hover:border-adv-gray-med/40 transition-colors">
      {/* Card header */}
      <div className="flex items-start gap-4 p-5">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-adv-teal-dim">
          <Icon className="h-5 w-5 text-adv-teal" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-adv-white">{pack.name}</h3>
            {pack.is_default && (
              <span className="rounded-full border border-adv-teal/30 bg-adv-teal-dim px-2 py-0.5 text-xs font-medium text-adv-teal">
                Default
              </span>
            )}
          </div>

          {pack.description && (
            <p className="mt-1 text-xs text-adv-gray leading-relaxed line-clamp-2">{pack.description}</p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px]">
            {pack.target_role && (
              <span className="text-adv-off-white font-medium">{pack.target_role}</span>
            )}
            {pack.target_role && pack.target_industry && (
              <span className="text-adv-gray">·</span>
            )}
            {pack.target_industry && (
              <span className={industryColor}>{pack.target_industry}</span>
            )}
            {pack.modules.length > 0 && (
              <>
                <span className="text-adv-gray">·</span>
                <span className="text-adv-gray">
                  {pack.modules.length} module{pack.modules.length !== 1 ? 's' : ''}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => onExport(pack)}
            title="Export Pack"
            className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-adv-gray hover:border-adv-gray-med hover:text-adv-off-white transition-colors"
          >
            <Download className="h-3 w-3" />
            Export
          </button>
          <button
            onClick={() => onActivate(pack)}
            className="flex items-center gap-1 rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
          >
            <Zap className="h-3 w-3" />
            Activate
          </button>
        </div>
      </div>

      {/* Module chips row */}
      {pack.modules.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-border/50 px-5 py-3">
          {pack.modules.map((mod) => (
            <span
              key={mod}
              className="rounded-full border border-border bg-adv-dark px-2.5 py-0.5 text-xs text-adv-gray font-mono"
            >
              {mod}
            </span>
          ))}
        </div>
      )}

      {/* Getting started — collapsible */}
      {pack.getting_started && (
        <div className="border-t border-border/50">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex w-full items-center gap-2 px-5 py-2.5 text-left text-xs text-adv-gray hover:text-adv-off-white transition-colors"
          >
            {expanded
              ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-adv-gray" />
              : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-adv-gray" />}
            <span className="font-medium">Getting started guide</span>
          </button>
          {expanded && (
            <div className="bg-adv-dark-2 px-5 pb-4">
              <p className="text-xs text-adv-gray leading-relaxed whitespace-pre-wrap">
                {pack.getting_started}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function SkillPacksPage() {
  const [packs, setPacks] = useState<SkillPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    getSkillPacks()
      .then(setPacks)
      .catch(() => setPacks([]))
      .finally(() => setLoading(false));
  }, []);

  function handleActivate(pack: SkillPack) {
    // Placeholder — full module activation wired in a later sprint
    setToast(`Pack "${pack.name}" activated — check your module list`);
  }

  function handleExport(pack: SkillPack) {
    // Placeholder — export functionality wired in a later sprint
    setToast(`Export for "${pack.name}" — coming soon`);
  }

  function handlePackCreated(pack: SkillPack) {
    setPacks((prev) => [...prev, pack]);
    setToast(`Pack "${pack.name}" created successfully`);
  }

  const defaultPacks = packs.filter((p) => p.is_default);
  const customPacks = packs.filter((p) => !p.is_default);

  return (
    <div className="mx-auto max-w-4xl">
      {/* Page header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-adv-white">
            <Package className="h-6 w-6 text-adv-teal" />
            Skill Packs
          </h1>
          <p className="mt-1 text-sm text-adv-gray">
            Pre-configured module bundles tailored to professional roles and industries. Activate a pack
            to load the recommended modules, prompts, and default settings for your use case.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
        >
          <Plus className="h-4 w-4" />
          Create Pack
        </button>
      </div>

      {/* Info banner */}
      <div className="mb-6 rounded-xl border border-adv-teal/20 bg-adv-teal-soft p-4">
        <h3 className="mb-2 text-xs font-semibold text-adv-teal">What is a Skill Pack?</h3>
        <p className="text-xs text-adv-gray leading-relaxed">
          A Skill Pack bundles the right modules, personas, and default configurations for a specific
          professional role. Activating a pack pre-selects the modules most relevant to your work so
          you can start analysing immediately — no manual configuration needed. You can always override
          any setting within individual modules.
        </p>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-20 text-adv-gray">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-adv-teal border-t-transparent" />
          <span className="ml-3 text-sm">Loading packs...</span>
        </div>
      )}

      {/* Default packs */}
      {!loading && defaultPacks.length > 0 && (
        <section className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <Package className="h-4 w-4 text-adv-teal" />
            <h2 className="text-sm font-semibold text-adv-off-white">Default Packs</h2>
            <span className="text-xs text-adv-gray">{defaultPacks.length}</span>
          </div>
          <div className="space-y-3">
            {defaultPacks.map((pack) => (
              <PackCard
                key={pack.id}
                pack={pack}
                onActivate={handleActivate}
                onExport={handleExport}
              />
            ))}
          </div>
        </section>
      )}

      {/* Custom packs */}
      {!loading && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Users className="h-4 w-4 text-adv-gold" />
            <h2 className="text-sm font-semibold text-adv-off-white">Custom Packs</h2>
            <span className="text-xs text-adv-gray">{customPacks.length}</span>
          </div>

          {customPacks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-10 text-center">
              <Package className="mx-auto mb-3 h-8 w-8 text-adv-gray" />
              <p className="text-sm text-adv-gray">No custom packs yet.</p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="mt-2 text-xs text-adv-teal hover:underline"
              >
                Create your first custom pack
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {customPacks.map((pack) => (
                <PackCard
                  key={pack.id}
                  pack={pack}
                  onActivate={handleActivate}
                  onExport={handleExport}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Empty state (no packs at all) */}
      {!loading && packs.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-16 text-center">
          <Package className="mx-auto mb-4 h-10 w-10 text-adv-gray" />
          <p className="text-sm font-medium text-adv-gray">No skill packs found</p>
          <p className="mt-1 text-xs text-adv-gray">
            Default packs are seeded automatically on first launch.
          </p>
        </div>
      )}

      {/* Create modal */}
      {showCreateModal && (
        <CreatePackModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handlePackCreated}
        />
      )}

      {/* Toast */}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
