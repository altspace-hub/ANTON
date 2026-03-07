import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Zap, Search, X, ChevronDown, ChevronRight, BookOpen, Globe, BarChart3, MessageSquare, Code, Plus, Check, Users, Brain, Loader2, ExternalLink, Package } from 'lucide-react';
import { fetchSkills, fetchCommunitySkills, submitCommunitySkill } from '@/lib/api';

interface Skill {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  category: string;
  tags: string[];
  prompt?: string;
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  language:      { label: 'Language',      icon: Globe,          color: 'text-adv-blue' },
  communication: { label: 'Communication', icon: MessageSquare,  color: 'text-adv-green' },
  methodology:   { label: 'Methodology',   icon: BarChart3,      color: 'text-adv-gold' },
  domain:        { label: 'Domain',        icon: BookOpen,       color: 'text-adv-teal' },
  style:         { label: 'Style',         icon: Code,           color: 'text-adv-blue' },
};

interface CommunitySkill {
  id: string;
  name: string;
  description: string;
  category: string;
  prompt_instruction: string;
  tags: string[];
  submitted_at: string;
}

const COMMUNITY_CATEGORIES = ['Analysis', 'Document', 'Communication', 'Research', 'Technical'];

// Maps skill tags → relevant module route (for "Open in module" quick-action)
const TAG_TO_MODULE: Record<string, { label: string; path: string }> = {
  'gap-analysis':      { label: 'Gap Analysis', path: '/module/gap-analysis' },
  'amlr':              { label: 'Gap Analysis', path: '/module/gap-analysis' },
  'risk-assessment':   { label: 'Risk Assessment', path: '/module/risk-assessment' },
  'bwra':              { label: 'Risk Assessment', path: '/module/risk-assessment' },
  'sanctions':         { label: 'Sanctions Advisory', path: '/module/sanctions-advisory' },
  'screening':         { label: 'Sanctions Advisory', path: '/module/sanctions-advisory' },
  'document-creation': { label: 'Document Creation', path: '/module/document-creation' },
  'policy':            { label: 'Document Creation', path: '/module/document-creation' },
  'sar':               { label: 'Investigation Support', path: '/module/investigation-support' },
  'str':               { label: 'Investigation Support', path: '/module/investigation-support' },
  'investigation':     { label: 'Investigation Support', path: '/module/investigation-support' },
  'edd':               { label: 'Gap Analysis', path: '/module/gap-analysis' },
  'data-management':   { label: 'Data Management', path: '/module/data-management' },
  'amla':              { label: 'Data Management', path: '/module/data-management' },
  'regulatory':        { label: 'Regulatory Monitor', path: '/module/regulatory-monitor' },
  'training':          { label: 'Training Content', path: '/module/training-content' },
};

// Maps skill tags → knowledge packs that work well with this skill
const TAG_TO_PACKS: Record<string, Array<{ id: string; label: string }>> = {
  'amlr':        [{ id: 'amlr-2024', label: 'AMLR 2024' }, { id: 'amla-amld6', label: 'AMLA / AMLD6' }],
  'gap-analysis': [{ id: 'amlr-2024', label: 'AMLR 2024' }, { id: 'eba-aml-guidelines', label: 'EBA AML Guidelines' }],
  'sanctions':   [{ id: 'eu-sanctions', label: 'EU Sanctions' }, { id: 'unscr-sanctions', label: 'UNSCR Sanctions' }],
  'screening':   [{ id: 'eu-sanctions', label: 'EU Sanctions' }],
  'amla':        [{ id: 'amla-amld6', label: 'AMLA / AMLD6' }, { id: 'amla-rts-tracker', label: 'AMLA RTS Tracker' }],
  'edd':         [{ id: 'wolfsberg-principles', label: 'Wolfsberg Principles' }, { id: 'eba-aml-guidelines', label: 'EBA AML Guidelines' }],
  'sar':         [{ id: 'wolfsberg-principles', label: 'Wolfsberg Principles' }],
  'policy':      [{ id: 'amlr-2024', label: 'AMLR 2024' }, { id: 'eba-aml-guidelines', label: 'EBA AML Guidelines' }],
  'bwra':        [{ id: 'fatf-recommendations', label: 'FATF Recommendations' }],
  'regulatory':  [{ id: 'amla-rts-tracker', label: 'AMLA RTS Tracker' }],
};

function resolveSkillModule(tags: string[]): { label: string; path: string } | null {
  for (const tag of tags) {
    const match = TAG_TO_MODULE[tag.toLowerCase()];
    if (match) return match;
  }
  return null;
}

function resolveSkillPacks(tags: string[]): Array<{ id: string; label: string }> {
  const seen = new Set<string>();
  const result: Array<{ id: string; label: string }> = [];
  for (const tag of tags) {
    for (const pack of TAG_TO_PACKS[tag.toLowerCase()] ?? []) {
      if (!seen.has(pack.id)) { seen.add(pack.id); result.push(pack); }
    }
  }
  return result.slice(0, 4);
}

function SubmitSkillModal({ onClose, onSubmitted }: { onClose: () => void; onSubmitted: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(COMMUNITY_CATEGORIES[0]);
  const [promptInstruction, setPromptInstruction] = useState('');
  const [tags, setTags] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [draftLoading, setDraftLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  async function draftWithAI() {
    if (!name.trim()) { setError('Enter a name first'); return; }
    setDraftLoading(true);
    setError('');
    try {
      const r = await fetch('/api/ai-assist/skill-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent: name.trim(), description: description.trim(), category }),
      });
      if (r.ok) {
        const data = await r.json() as { promptInstruction: string; description?: string };
        if (data.promptInstruction) setPromptInstruction(data.promptInstruction);
        if (data.description && !description.trim()) setDescription(data.description);
      }
    } catch { /* ignore */ } finally { setDraftLoading(false); }
  }

  async function handleSubmit() {
    if (!name.trim() || !description.trim() || !promptInstruction.trim()) {
      setError('Name, description, and prompt instruction are required');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await submitCommunitySkill({ name: name.trim(), description: description.trim(), category, promptInstruction: promptInstruction.trim(), tags: tags.trim() || undefined });
      setSuccess(true);
      setTimeout(() => { onSubmitted(); onClose(); }, 800);
    } catch {
      setError('Failed to submit skill');
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls = 'w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none';
  const labelCls = 'block text-xs font-medium text-adv-off-white mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-adv-card p-6 shadow-xl">
        <h2 className="mb-1 text-base font-semibold text-adv-white flex items-center gap-2">
          <Plus className="h-4 w-4 text-adv-teal" />
          Submit a Skill
        </h2>
        <p className="mb-5 text-xs text-adv-gray-med">
          Share a reusable skill with other openEXPERT users on this device.
        </p>

        {success ? (
          <div className="flex items-center justify-center gap-2 rounded-lg bg-adv-green/10 border border-adv-green/30 p-6 text-adv-green">
            <Check className="h-5 w-5" />
            <span className="text-sm font-medium">Skill submitted successfully</span>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Name *</label>
              <input className={inputCls} placeholder="e.g., Enhanced Due Diligence Checklist" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Description *</label>
              <textarea className={`${inputCls} resize-none`} rows={2} placeholder="What does this skill add to Claude's capabilities?" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Category *</label>
              <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
                {COMMUNITY_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className={labelCls}>Prompt Instruction *</label>
                <button
                  type="button"
                  onClick={draftWithAI}
                  disabled={draftLoading || !name.trim()}
                  className="flex items-center gap-1 rounded border border-adv-teal/40 bg-adv-teal/10 px-2 py-0.5 text-[11px] text-adv-teal hover:bg-adv-teal/20 disabled:opacity-40 transition-colors"
                >
                  {draftLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Brain className="h-3 w-3" />}
                  {draftLoading ? 'Drafting…' : 'Draft with AI'}
                </button>
              </div>
              <textarea className={`${inputCls} resize-none font-mono text-xs`} rows={5} placeholder="The actual prompt text that will be injected as a skill layer..." value={promptInstruction} onChange={(e) => setPromptInstruction(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Tags (comma-separated)</label>
              <input className={inputCls} placeholder="e.g., aml, kyc, due-diligence" value={tags} onChange={(e) => setTags(e.target.value)} />
            </div>
            {error && <p className="text-xs text-adv-red">{error}</p>}
          </div>
        )}

        {!success && (
          <div className="mt-5 flex gap-3">
            <button onClick={handleSubmit} disabled={submitting} className="flex-1 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50">
              {submitting ? 'Submitting...' : 'Submit Skill'}
            </button>
            <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm text-adv-gray hover:text-adv-off-white transition-colors">
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SkillsLibrary() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [communitySkills, setCommunitySkills] = useState<CommunitySkill[]>([]);
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  function loadCommunitySkills() {
    fetchCommunitySkills().then(setCommunitySkills).catch(() => {});
  }

  useEffect(() => {
    fetchSkills().then((data: Skill[]) => setSkills(data)).catch(() => {});
    loadCommunitySkills();
  }, []);

  const filtered = skills.filter((s) => {
    const matchesQuery = !query || s.name.toLowerCase().includes(query.toLowerCase()) || s.description.toLowerCase().includes(query.toLowerCase()) || s.tags?.some((t) => t.toLowerCase().includes(query.toLowerCase()));
    const matchesCat = !activeCategory || s.category === activeCategory;
    return matchesQuery && matchesCat;
  });

  const categories = [...new Set(skills.map((s) => s.category))].filter(Boolean);

  const grouped = categories.reduce<Record<string, Skill[]>>((acc, cat) => {
    acc[cat] = filtered.filter((s) => s.category === cat);
    return acc;
  }, {});

  const totalFiltered = filtered.length;

  return (
    <div className="mx-auto max-w-4xl">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-adv-white flex items-center gap-2">
            <Zap className="h-6 w-6 text-adv-teal" />
            Skills Library
          </h1>
          <p className="mt-1 text-sm text-adv-gray">
            Reusable expertise and communication layers. Attach skills to any module to enhance Claude's domain knowledge, analytical approach, or communication style.
          </p>
        </div>
        <button
          onClick={() => setShowSubmitModal(true)}
          className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors shrink-0"
        >
          <Plus className="h-4 w-4" />
          Submit a Skill
        </button>
      </div>

      {/* How skills work */}
      <div className="mb-6 rounded-xl border border-adv-teal/20 bg-adv-teal-soft p-4">
        <h3 className="text-xs font-semibold text-adv-teal mb-2">How skills work</h3>
        <p className="text-xs text-adv-gray leading-relaxed">
          Skills are injected as <strong className="text-adv-off-white">Layer 6</strong> in the prompt composition chain — after the module system prompt (Layer 4) and persona (Layer 5), but before output format instructions. They add specialised domain knowledge, analytical techniques, or communication styles without replacing the module's core behaviour.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-adv-gray-med">
          <span className="rounded-full border border-adv-gray-med/20 px-2 py-0.5">Layer 4: Module Prompt</span>
          <span className="text-adv-gray-med">→</span>
          <span className="rounded-full border border-adv-gray-med/20 px-2 py-0.5">Layer 5: Persona</span>
          <span className="text-adv-gray-med">→</span>
          <span className="rounded-full border border-adv-teal/40 bg-adv-teal/10 px-2 py-0.5 text-adv-teal">Layer 6: Skills ← You are here</span>
          <span className="text-adv-gray-med">→</span>
          <span className="rounded-full border border-adv-gray-med/20 px-2 py-0.5">Layer 7: Output Format</span>
        </div>
      </div>

      {/* Search + filter bar */}
      <div className="mb-5 flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-adv-gray-med" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search skills by name, description, or tag..."
            className="w-full rounded-lg border border-border bg-adv-dark pl-9 pr-9 py-2 text-sm text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
          />
          {query && (
            <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-adv-gray-med hover:text-adv-off-white transition-colors">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex gap-1.5">
          {categories.map((cat) => {
            const cfg = CATEGORY_CONFIG[cat];
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                className={`rounded-lg border px-2.5 py-2 text-xs transition-colors ${
                  activeCategory === cat
                    ? 'border-adv-teal bg-adv-teal-dim text-adv-teal'
                    : 'border-border bg-adv-dark text-adv-gray hover:border-adv-gray-med hover:text-adv-off-white'
                }`}
              >
                {cfg?.label || cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* Results summary */}
      <div className="mb-4 text-xs text-adv-gray-med">
        {totalFiltered} skill{totalFiltered !== 1 ? 's' : ''} {query || activeCategory ? '(filtered)' : 'available'}
      </div>

      {/* Skill cards grouped by category */}
      <div className="space-y-8">
        {categories.map((cat) => {
          const catSkills = grouped[cat] || [];
          if (catSkills.length === 0) return null;
          const cfg = CATEGORY_CONFIG[cat];
          const Icon = cfg?.icon || Zap;

          return (
            <div key={cat}>
              <div className="mb-3 flex items-center gap-2">
                <Icon className={`h-4 w-4 ${cfg?.color || 'text-adv-gray'}`} />
                <h2 className={`text-sm font-semibold ${cfg?.color || 'text-adv-gray'}`}>
                  {cfg?.label || cat}
                </h2>
                <span className="text-xs text-adv-gray-med">{catSkills.length}</span>
              </div>

              <div className="space-y-2">
                {catSkills.map((skill) => {
                  const isExpanded = expandedId === skill.id;
                  return (
                    <div key={skill.id} className="rounded-xl border border-border bg-adv-card overflow-hidden">
                      {/* Header row */}
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : skill.id)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-adv-dark-2 transition-colors"
                      >
                        <Zap className={`h-4 w-4 shrink-0 ${cfg?.color || 'text-adv-teal'}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-adv-off-white">{skill.name}</span>
                            <span className="text-[10px] text-adv-gray-med">v{skill.version}</span>
                            <span className="text-[10px] text-adv-gray-med">by {skill.author}</span>
                          </div>
                          <p className="text-xs text-adv-gray-med mt-0.5 truncate">{skill.description}</p>
                        </div>
                        {/* Tags */}
                        <div className="hidden sm:flex gap-1 shrink-0">
                          {(skill.tags || []).slice(0, 3).map((tag) => (
                            <span key={tag} className="rounded-full bg-adv-dark px-2 py-0.5 text-[10px] text-adv-gray-med">
                              {tag}
                            </span>
                          ))}
                        </div>
                        {isExpanded
                          ? <ChevronDown className="h-3.5 w-3.5 text-adv-gray-med shrink-0" />
                          : <ChevronRight className="h-3.5 w-3.5 text-adv-gray-med shrink-0" />}
                      </button>

                      {/* Expanded: prompt preview */}
                      {isExpanded && skill.prompt && (
                        <div className="border-t border-border px-4 py-4 bg-adv-dark-2">
                          <div className="text-[10px] font-medium uppercase tracking-wider text-adv-gray-med mb-2">
                            Prompt injection (Layer 6)
                          </div>
                          <pre className="text-xs text-adv-gray leading-relaxed whitespace-pre-wrap font-sans">
                            {skill.prompt}
                          </pre>
                          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-adv-gray-med">
                            <span>ID: <code className="text-adv-teal">{skill.id}</code></span>
                            <span>·</span>
                            <span>Use in SkillAttacher on any module or Open Chat session</span>
                            {resolveSkillModule(skill.tags || []) && (
                              <Link
                                to={resolveSkillModule(skill.tags || [])!.path}
                                className="ml-1 flex items-center gap-1 rounded-md border border-adv-teal/30 bg-adv-teal/10 px-2 py-0.5 text-adv-teal hover:bg-adv-teal/20 transition-colors"
                              >
                                <ExternalLink className="h-3 w-3" />
                                Open in {resolveSkillModule(skill.tags || [])!.label}
                              </Link>
                            )}
                          </div>
                          {resolveSkillPacks(skill.tags || []).length > 0 && (
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              <Package className="h-3 w-3 text-adv-gray-med shrink-0" />
                              <span className="text-[11px] text-adv-gray-med">Related packs:</span>
                              {resolveSkillPacks(skill.tags || []).map(p => (
                                <span key={p.id} className="rounded-full border border-adv-teal/20 bg-adv-teal/5 px-2 py-0.5 text-[10px] text-adv-teal">{p.label}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {totalFiltered === 0 && (
          <div className="rounded-xl border border-dashed border-border p-10 text-center">
            <Zap className="h-8 w-8 text-adv-gray-med mx-auto mb-3" />
            <p className="text-sm text-adv-gray">No skills match your search.</p>
            <button onClick={() => { setQuery(''); setActiveCategory(null); }} className="mt-2 text-xs text-adv-teal hover:underline">
              Clear filters
            </button>
          </div>
        )}
      </div>

      {/* Community Skills Section */}
      <div className="mt-10">
        <div className="mb-3 flex items-center gap-2">
          <Users className="h-4 w-4 text-adv-gold" />
          <h2 className="text-sm font-semibold text-adv-gold">Community Skills</h2>
          <span className="text-xs text-adv-gray-med">{communitySkills.length}</span>
        </div>

        {communitySkills.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <Users className="h-6 w-6 text-adv-gray-med mx-auto mb-2" />
            <p className="text-xs text-adv-gray-med">No community skills yet. Be the first to submit one.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {communitySkills.map((cs) => {
              const isExpanded = expandedId === cs.id;
              return (
                <div key={cs.id} className="rounded-xl border border-border bg-adv-card overflow-hidden">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : cs.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-adv-dark-2 transition-colors"
                  >
                    <Zap className="h-4 w-4 shrink-0 text-adv-gold" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-adv-off-white">{cs.name}</span>
                        <span className="rounded-full bg-adv-gold/10 border border-adv-gold/30 px-2 py-0.5 text-[10px] font-medium text-adv-gold">Community</span>
                        <span className="text-[10px] text-adv-gray-med">{cs.category}</span>
                      </div>
                      <p className="text-xs text-adv-gray-med mt-0.5 truncate">{cs.description}</p>
                    </div>
                    <div className="hidden sm:flex gap-1 shrink-0">
                      {(cs.tags || []).slice(0, 3).map((tag) => (
                        <span key={tag} className="rounded-full bg-adv-dark px-2 py-0.5 text-[10px] text-adv-gray-med">
                          {tag}
                        </span>
                      ))}
                    </div>
                    {isExpanded
                      ? <ChevronDown className="h-3.5 w-3.5 text-adv-gray-med shrink-0" />
                      : <ChevronRight className="h-3.5 w-3.5 text-adv-gray-med shrink-0" />}
                  </button>

                  {isExpanded && cs.prompt_instruction && (
                    <div className="border-t border-border px-4 py-4 bg-adv-dark-2">
                      <div className="text-[10px] font-medium uppercase tracking-wider text-adv-gray-med mb-2">
                        Prompt instruction
                      </div>
                      <pre className="text-xs text-adv-gray leading-relaxed whitespace-pre-wrap font-sans">
                        {cs.prompt_instruction}
                      </pre>
                      <div className="mt-3 text-[11px] text-adv-gray-med">
                        ID: <code className="text-adv-gold">{cs.id}</code>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Submit Skill Modal */}
      {showSubmitModal && (
        <SubmitSkillModal
          onClose={() => setShowSubmitModal(false)}
          onSubmitted={loadCommunitySkills}
        />
      )}
    </div>
  );
}
