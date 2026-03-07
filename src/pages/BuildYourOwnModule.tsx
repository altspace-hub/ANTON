import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Puzzle, Trash2, ChevronRight, Wand2, BookMarked, Check, Download, Sparkles, Send, Bot, User, RefreshCw, Plus, GripVertical, X, Pencil } from 'lucide-react';
import { fetchCustomModules, createCustomModule, patchCustomModule, deleteCustomModule, shareModuleWithCommunity, getAuthHeader, type CustomModuleData } from '@/lib/api';
import { EXPERT_ROLES } from '@/lib/expert-roles';
import { AREAS } from '@/lib/constants';
import { useSessionStore } from '@/stores/useSessionStore';

interface SkillDef {
  id: string;
  name: string;
  description: string;
  category: string;
}

interface GeneratedModuleConfig {
  name: string;
  short_name: string;
  description: string;
  icon: string;
  area: string;
  system_prompt: string;
  thinking: string;
  creativity: string;
  personas: string[];
  skills: string[];
  output_formats: string[];
}

// ── Guided Input Field Types ─────────────────────────────────────────────────

export interface GuidedInputField {
  id: string;
  type: 'text' | 'textarea' | 'select' | 'multi-select' | 'chips' | 'boolean' | 'number';
  label: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  defaultValue?: unknown;
}

const FIELD_TYPES: { value: GuidedInputField['type']; label: string; hint: string }[] = [
  { value: 'text',         label: 'Short text',    hint: 'Single line answer' },
  { value: 'textarea',     label: 'Long text',     hint: 'Multi-line answer' },
  { value: 'select',       label: 'Dropdown',      hint: 'Pick one from a list' },
  { value: 'multi-select', label: 'Multi-select',  hint: 'Pick several from a list' },
  { value: 'chips',        label: 'Chips',         hint: 'Toggle multiple options' },
  { value: 'boolean',      label: 'Yes / No',      hint: 'On/off toggle' },
  { value: 'number',       label: 'Number',        hint: 'Numeric value' },
];

const ICON_OPTIONS = [
  'Puzzle', 'Star', 'Zap', 'Shield', 'BookOpen', 'FileText', 'Search', 'Target',
  'Lightbulb', 'Globe', 'Lock', 'BarChart3', 'Users', 'Briefcase', 'Award',
];

const THINKING_OPTIONS = ['quick', 'think', 'think_hard', 'investigate', 'plan_first'];
const CREATIVITY_OPTIONS = ['strict', 'balanced', 'creative'];
const MODEL_OPTIONS = [
  { value: 'claude-opus-4-6', label: 'Opus 4.6 (most capable)' },
  { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6 (fast)' },
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5 (budget)' },
];

// ── Save As Dialog ──────────────────────────────────────────────────────────

function SaveAsDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { systemPrompt, selectedOutputFormats, selectedPersonas, selectedSkills, thinking, creativity, model, knowledgeSources } = useSessionStore();
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('Puzzle');
  const [area, setArea] = useState('my-modules');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [shareWithCommunity, setShareWithCommunity] = useState(false);

  async function handleSave() {
    if (!name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    try {
      const created = await createCustomModule({
        name: name.trim(),
        short_name: (shortName || name).trim().slice(0, 20),
        description: description.trim(),
        icon,
        area,
        system_prompt: systemPrompt,
        config: {
          outputFormats: selectedOutputFormats,
          personas: selectedPersonas,
          skills: selectedSkills,
          thinking,
          creativity,
          model,
          knowledgeSources,
        },
      });
      if (shareWithCommunity && created.id) {
        await shareModuleWithCommunity(created.id);
      }
      // Save initial version snapshot
      if (created.id) {
        fetch(`/api/versions/module/${created.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: JSON.stringify({
              system_prompt: systemPrompt,
              config: { outputFormats: selectedOutputFormats, personas: selectedPersonas, skills: selectedSkills, thinking, creativity, model, knowledgeSources },
            }),
            label: `Saved ${new Date().toLocaleDateString()}`,
          }),
        }).catch(() => {});
      }
      onSaved();
      onClose();
    } catch {
      setError('Failed to save module');
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none';
  const labelCls = 'block text-xs font-medium text-adv-off-white mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-adv-card p-6 shadow-xl">
        <h2 className="mb-1 text-base font-semibold text-adv-white">Save As Custom Module</h2>
        <p className="mb-5 text-xs text-adv-gray-med">
          Saves the current session's system prompt, personas, skills, output formats, and config as a reusable module.
        </p>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={labelCls}>Module name</label>
              <input className={inputCls} placeholder="e.g., Nordic Bank AMLR Checker" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Short name (sidebar)</label>
              <input className={inputCls} placeholder="e.g., AMLR Checker" maxLength={20} value={shortName} onChange={(e) => setShortName(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Icon</label>
              <select className={inputCls} value={icon} onChange={(e) => setIcon(e.target.value)}>
                {ICON_OPTIONS.map((ic) => <option key={ic} value={ic}>{ic}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Description</label>
              <textarea className={`${inputCls} resize-none`} rows={2} placeholder="What does this module do?" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Add to area (optional)</label>
              <select className={inputCls} value={area} onChange={(e) => setArea(e.target.value)}>
                <option value="my-modules">⭐ My Modules (default)</option>
                <optgroup label="────────────">
                  {AREAS.map((a) => (
                    <option key={a.id} value={a.id}>{a.label}</option>
                  ))}
                </optgroup>
              </select>
              <p className="mt-1 text-[11px] text-adv-gray-med">The module will appear in this area's section in the sidebar and home page.</p>
            </div>
          </div>

          {/* Config summary */}
          <div className="rounded-lg bg-adv-dark-2 p-3 text-xs text-adv-gray-med space-y-1">
            <div className="text-adv-off-white text-[11px] font-medium mb-2">Will save:</div>
            <div>System prompt: {systemPrompt ? `${systemPrompt.slice(0, 60)}...` : '(empty)'}</div>
            <div>Thinking: {thinking} · Creativity: {creativity} · Model: {model.split('-')[1] || model}</div>
            <div>Output formats: {selectedOutputFormats.length || 0} selected</div>
            <div>Personas: {selectedPersonas.map(id => EXPERT_ROLES.find(r => r.id === id)?.label || id).join(', ') || 'none'}</div>
            <div>Skills: {selectedSkills.join(', ') || 'none'}</div>
          </div>

          {/* Share with Community toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={shareWithCommunity}
              onChange={(e) => setShareWithCommunity(e.target.checked)}
              className="h-4 w-4 rounded border-border bg-adv-dark text-adv-teal focus:ring-adv-teal accent-[#2DD4A8]"
            />
            <div>
              <span className="text-xs font-medium text-adv-off-white">Share with Community</span>
              <p className="text-[11px] text-adv-gray-med">Shared modules are visible to other openEXPERT users on this device</p>
            </div>
          </label>

          {error && <p className="text-xs text-adv-red">{error}</p>}
        </div>

        <div className="mt-5 flex gap-3">
          <button onClick={handleSave} disabled={saving} className="flex-1 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Module'}
          </button>
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm text-adv-gray hover:text-adv-off-white transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Build From Scratch Wizard ───────────────────────────────────────────────

const WIZARD_STEPS = [
  { id: 'basics', label: 'Basics', description: 'Name and describe your module' },
  { id: 'prompt', label: 'System Prompt', description: 'Core instructions for Claude' },
  { id: 'personas', label: 'Personas', description: 'Choose expert roles' },
  { id: 'skills', label: 'Skills', description: 'Attach specialized capabilities' },
  { id: 'outputs', label: 'Output Formats', description: 'Default deliverables' },
  { id: 'knowledge', label: 'Knowledge Setup', description: 'Default knowledge sources' },
  { id: 'quality', label: 'Quality Reference', description: 'Example output for formatting' },
  { id: 'settings', label: 'Module Settings', description: 'Questions asked before each run' },
  { id: 'testrun', label: 'Test Run', description: 'Preview before saving' },
  { id: 'review', label: 'Review & Save', description: 'Confirm and save' },
];

interface WizardData {
  name: string;
  short_name: string;
  description: string;
  icon: string;
  area: string;
  system_prompt: string;
  thinking: string;
  creativity: string;
  model: string;
  transparencyLevel: 0 | 1 | 2;
  personas: string[];
  skills: string[];
  output_formats: string[];
  defaultKnowledgeLibraryIds: string[];
  defaultWebSearch: boolean;
  defaultReferenceUrls: string[];
  referenceOutput: string;
  referenceOutputLabel: string;
  guidedInputs: GuidedInputField[];
  testQuery: string;
}

// ── Guided Input Field Editor ────────────────────────────────────────────────

function GuidedInputEditor({ fields, onChange }: { fields: GuidedInputField[]; onChange: (f: GuidedInputField[]) => void }) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  function addField() {
    const newField: GuidedInputField = {
      id: `field_${Date.now()}`,
      type: 'text',
      label: '',
    };
    const updated = [...fields, newField];
    onChange(updated);
    setEditingIdx(updated.length - 1);
  }

  function removeField(idx: number) {
    const updated = fields.filter((_, i) => i !== idx);
    onChange(updated);
    if (editingIdx === idx) setEditingIdx(null);
    else if (editingIdx !== null && editingIdx > idx) setEditingIdx(editingIdx - 1);
  }

  function updateField(idx: number, patch: Partial<GuidedInputField>) {
    const updated = fields.map((f, i) => i === idx ? { ...f, ...patch } : f);
    // Auto-generate id from label if id is still the timestamp default
    if (patch.label !== undefined && updated[idx].id.startsWith('field_')) {
      updated[idx].id = patch.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || `field_${idx}`;
    }
    onChange(updated);
  }

  function addOption(idx: number) {
    const existing = fields[idx].options || [];
    updateField(idx, { options: [...existing, { value: '', label: '' }] });
  }

  function updateOption(fieldIdx: number, optIdx: number, text: string) {
    const existing = fields[fieldIdx].options || [];
    const updated = existing.map((o, i) => i === optIdx ? { value: text.toLowerCase().replace(/\s+/g, '_'), label: text } : o);
    updateField(fieldIdx, { options: updated });
  }

  function removeOption(fieldIdx: number, optIdx: number) {
    const existing = fields[fieldIdx].options || [];
    updateField(fieldIdx, { options: existing.filter((_, i) => i !== optIdx) });
  }

  const needsOptions = (type: GuidedInputField['type']) => ['select', 'multi-select', 'chips'].includes(type);

  return (
    <div className="space-y-3">
      {fields.length === 0 && (
        <div className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-adv-gray-med">
          No questions yet — add one below
        </div>
      )}

      {fields.map((field, idx) => (
        <div key={field.id} className="rounded-lg border border-border bg-adv-dark-2">
          {/* Collapsed header */}
          <div
            className="flex items-center gap-2 px-3 py-2.5 cursor-pointer"
            onClick={() => setEditingIdx(editingIdx === idx ? null : idx)}
          >
            <GripVertical className="h-3.5 w-3.5 text-adv-gray-med shrink-0" />
            <span className="flex-1 text-sm text-adv-off-white truncate">
              {field.label || <span className="text-adv-gray-med italic">Untitled question</span>}
            </span>
            <span className="rounded bg-adv-dark px-1.5 py-0.5 text-[10px] text-adv-gray-med">
              {FIELD_TYPES.find(t => t.value === field.type)?.label ?? field.type}
            </span>
            {field.required && <span className="text-[10px] text-adv-teal">required</span>}
            <button onClick={(e) => { e.stopPropagation(); removeField(idx); }} className="p-0.5 text-adv-gray-med hover:text-adv-red transition-colors">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Expanded editor */}
          {editingIdx === idx && (
            <div className="border-t border-border px-3 pb-3 pt-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-adv-gray mb-1">Label <span className="text-adv-red">*</span></label>
                  <input
                    value={field.label}
                    onChange={e => updateField(idx, { label: e.target.value })}
                    placeholder="e.g. Institution Type"
                    className="w-full rounded border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-adv-gray mb-1">Field type</label>
                  <select
                    value={field.type}
                    onChange={e => updateField(idx, { type: e.target.value as GuidedInputField['type'], options: needsOptions(e.target.value as GuidedInputField['type']) ? (field.options || []) : undefined })}
                    className="w-full rounded border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none"
                  >
                    {FIELD_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label} — {t.hint}</option>
                    ))}
                  </select>
                </div>
              </div>

              {(field.type === 'text' || field.type === 'textarea' || field.type === 'number') && (
                <div>
                  <label className="block text-[11px] text-adv-gray mb-1">Placeholder text</label>
                  <input
                    value={field.placeholder || ''}
                    onChange={e => updateField(idx, { placeholder: e.target.value })}
                    placeholder="e.g. e.g. Bank / Credit Institution"
                    className="w-full rounded border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label className="block text-[11px] text-adv-gray mb-1">Help text (optional)</label>
                <input
                  value={field.description || ''}
                  onChange={e => updateField(idx, { description: e.target.value })}
                  placeholder="Short explanation shown below the field"
                  className="w-full rounded border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
                />
              </div>

              {needsOptions(field.type) && (
                <div>
                  <label className="block text-[11px] text-adv-gray mb-1.5">Options</label>
                  <div className="space-y-1.5">
                    {(field.options || []).map((opt, oIdx) => (
                      <div key={oIdx} className="flex items-center gap-2">
                        <input
                          value={opt.label}
                          onChange={e => updateOption(idx, oIdx, e.target.value)}
                          placeholder={`Option ${oIdx + 1}`}
                          className="flex-1 rounded border border-border bg-adv-dark px-2.5 py-1 text-xs text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
                        />
                        <button onClick={() => removeOption(idx, oIdx)} className="text-adv-gray-med hover:text-adv-red transition-colors">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => addOption(idx)}
                      className="flex items-center gap-1 text-[11px] text-adv-teal hover:text-adv-teal-dark transition-colors"
                    >
                      <Plus className="h-3 w-3" /> Add option
                    </button>
                  </div>
                </div>
              )}

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!field.required}
                  onChange={e => updateField(idx, { required: e.target.checked })}
                  className="h-3.5 w-3.5 rounded border-border bg-adv-dark accent-[#2DD4A8]"
                />
                <span className="text-[11px] text-adv-gray">Required (user must fill this before running)</span>
              </label>
            </div>
          )}
        </div>
      ))}

      <button
        onClick={addField}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-adv-teal/40 py-2.5 text-xs text-adv-teal hover:border-adv-teal hover:bg-adv-teal/5 transition-colors"
      >
        <Plus className="h-3.5 w-3.5" /> Add a question
      </button>
    </div>
  );
}

// ── AI assist mini-components ────────────────────────────────────────────────

interface GuidedInputFieldSuggested {
  id: string; type: string; label: string; description?: string; placeholder?: string; required?: boolean;
  options?: { value: string; label: string }[];
}

function AiDraftPromptButton({ name, description, area, thinking, creativity, onDraft, disabled }: {
  name: string; description: string; area: string; thinking: string; creativity: string;
  onDraft: (prompt: string) => void; disabled?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  async function draft() {
    setLoading(true);
    try {
      const r = await fetch('/api/ai-assist/module-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ name, description, area, thinking, creativity }),
      });
      if (r.ok) { const { prompt } = await r.json(); onDraft(prompt as string); }
    } catch { /* ignore */ } finally { setLoading(false); }
  }
  return (
    <button
      onClick={draft}
      disabled={disabled || loading}
      className="flex items-center gap-1.5 rounded-lg border border-adv-teal/40 bg-adv-teal/10 px-2.5 py-1 text-xs text-adv-teal hover:bg-adv-teal/20 disabled:opacity-40 transition-colors shrink-0"
      title={disabled ? 'Enter a module name first' : 'Let AI draft the system prompt'}
    >
      {loading ? <span className="h-3 w-3 animate-spin rounded-full border border-adv-teal border-t-transparent" /> : <Sparkles className="h-3 w-3" />}
      {loading ? 'Drafting…' : 'Draft with AI'}
    </button>
  );
}

function AiSuggestInputsButton({ name, description, systemPrompt, onSuggest }: {
  name: string; description: string; systemPrompt: string;
  onSuggest: (fields: GuidedInputField[]) => void;
}) {
  const [loading, setLoading] = useState(false);
  async function suggest() {
    setLoading(true);
    try {
      const r = await fetch('/api/ai-assist/module-inputs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ name, description, systemPrompt }),
      });
      if (r.ok) {
        const { fields } = await r.json() as { fields: GuidedInputFieldSuggested[] };
        if (Array.isArray(fields)) {
          const typed = fields.map(f => ({
            id: f.id || `field_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            type: f.type as GuidedInputField['type'],
            label: f.label || 'Untitled',
            description: f.description,
            placeholder: f.placeholder,
            required: f.required ?? false,
            options: f.options,
          }));
          onSuggest(typed);
        }
      }
    } catch { /* ignore */ } finally { setLoading(false); }
  }
  return (
    <button
      onClick={suggest}
      disabled={!name.trim() || loading}
      className="flex items-center gap-1.5 rounded-lg border border-adv-teal/40 bg-adv-teal/10 px-2.5 py-1 text-xs text-adv-teal hover:bg-adv-teal/20 disabled:opacity-40 transition-colors shrink-0"
      title="Let AI suggest guided input questions for this module"
    >
      {loading ? <span className="h-3 w-3 animate-spin rounded-full border border-adv-teal border-t-transparent" /> : <Sparkles className="h-3 w-3" />}
      {loading ? 'Suggesting…' : 'AI Suggest'}
    </button>
  );
}

function BuildWizard({ onSaved, initialData, editingModuleId }: { onSaved: () => void; initialData?: Partial<WizardData>; editingModuleId?: string }) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [shareWithCommunity, setShareWithCommunity] = useState(false);
  const [availableSkills, setAvailableSkills] = useState<SkillDef[]>([]);

  const [libraryEntries, setLibraryEntries] = useState<Array<{id: string; label: string; category: string; file_count: number; indexed_at: string | null}>>([]);
  const [testRunResult, setTestRunResult] = useState<string | null>(null);
  const [testRunTokens, setTestRunTokens] = useState<number | null>(null);
  const [testRunLoading, setTestRunLoading] = useState(false);
  const [testRunError, setTestRunError] = useState<string | null>(null);
  const [generatingExample, setGeneratingExample] = useState(false);

  const [data, setData] = useState<WizardData>({
    name: initialData?.name || '',
    short_name: initialData?.short_name || '',
    description: initialData?.description || '',
    icon: initialData?.icon || 'Puzzle',
    area: initialData?.area || 'my-modules',
    system_prompt: initialData?.system_prompt || '',
    thinking: initialData?.thinking || 'think_hard',
    creativity: initialData?.creativity || 'balanced',
    model: 'claude-opus-4-6',
    transparencyLevel: 1,
    personas: initialData?.personas || [],
    skills: initialData?.skills || [],
    output_formats: initialData?.output_formats || [],
    defaultKnowledgeLibraryIds: [],
    defaultWebSearch: false,
    defaultReferenceUrls: [],
    referenceOutput: '',
    referenceOutputLabel: '',
    guidedInputs: [],
    testQuery: '',
  });

  useEffect(() => {
    fetch('/api/skills', { headers: getAuthHeader() })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: SkillDef[]) => setAvailableSkills(list))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/knowledge-library')
      .then(r => r.ok ? r.json() : [])
      .then(data => setLibraryEntries(data))
      .catch(() => {});
  }, []);

  function set(key: string, value: unknown) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  function togglePersona(id: string) {
    set('personas', data.personas.includes(id) ? data.personas.filter((p) => p !== id) : [...data.personas, id]);
  }

  function toggleSkill(id: string) {
    set('skills', data.skills.includes(id) ? data.skills.filter((s) => s !== id) : [...data.skills, id]);
  }

  async function handleSave() {
    if (!data.name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: data.name.trim(),
        short_name: (data.short_name || data.name).trim().slice(0, 20),
        description: data.description.trim(),
        icon: data.icon,
        area: data.area,
        system_prompt: data.system_prompt,
        config: {
          thinking: data.thinking,
          creativity: data.creativity,
          model: data.model,
          transparencyLevel: data.transparencyLevel,
          outputFormats: data.output_formats,
          personas: data.personas,
          skills: data.skills,
          defaultKnowledgeLibraryIds: data.defaultKnowledgeLibraryIds,
          defaultWebSearch: data.defaultWebSearch,
          defaultReferenceUrls: data.defaultReferenceUrls.length > 0 ? data.defaultReferenceUrls : undefined,
          referenceOutput: data.referenceOutput || undefined,
          referenceOutputLabel: data.referenceOutputLabel || undefined,
          guidedInputs: data.guidedInputs.length > 0 ? data.guidedInputs : undefined,
          testQuery: data.testQuery || undefined,
        },
      };

      let savedId: string;
      if (editingModuleId) {
        // Edit mode — PATCH existing module
        const updated = await patchCustomModule(editingModuleId, payload);
        savedId = updated.id;
      } else {
        // Create mode — POST new module
        const created = await createCustomModule(payload);
        if (shareWithCommunity && created.id) {
          await shareModuleWithCommunity(created.id);
        }
        savedId = created.id;
      }

      // Save version snapshot
      if (savedId) {
        fetch(`/api/versions/module/${savedId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: JSON.stringify({ system_prompt: data.system_prompt, config: payload.config }),
            label: editingModuleId ? `Edited ${new Date().toLocaleDateString()}` : `Saved ${new Date().toLocaleDateString()}`,
          }),
        }).catch(() => {});
      }
      onSaved();
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none';
  const labelCls = 'block text-xs font-medium text-adv-off-white mb-1';
  const chipBase = 'rounded-lg border px-2.5 py-1 text-xs transition-colors cursor-pointer';
  const chipActive = 'border-adv-teal bg-adv-teal-dim text-adv-teal';
  const chipInactive = 'border-border bg-adv-dark text-adv-gray hover:border-adv-gray-med hover:text-adv-off-white';

  return (
    <div className="rounded-xl border border-border bg-adv-card">
      {/* Step progress */}
      <div className="flex border-b border-border px-6 pt-4 pb-0 gap-1">
        {WIZARD_STEPS.map((s, i) => (
          <button
            key={s.id}
            onClick={() => setStep(i)}
            className={`flex-1 pb-3 text-xs font-medium border-b-2 transition-colors ${
              i === step ? 'border-adv-teal text-adv-teal' : i < step ? 'border-adv-green/50 text-adv-gray' : 'border-transparent text-adv-gray-med'
            }`}
          >
            <span className={`${i < step ? 'line-through opacity-60' : ''}`}>{s.label}</span>
          </button>
        ))}
      </div>

      <div className="p-6">
        <p className="mb-4 text-xs text-adv-gray-med">{WIZARD_STEPS[step].description}</p>

        {/* Step: Basics */}
        {step === 0 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className={labelCls}>Module name *</label>
                <input className={inputCls} placeholder="e.g., GDPR Article 6 Checker" value={data.name} onChange={(e) => set('name', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Short name (sidebar)</label>
                <input className={inputCls} placeholder="e.g., GDPR Art.6" maxLength={20} value={data.short_name} onChange={(e) => set('short_name', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Icon</label>
                <select className={inputCls} value={data.icon} onChange={(e) => set('icon', e.target.value)}>
                  {ICON_OPTIONS.map((ic) => <option key={ic} value={ic}>{ic}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Description</label>
                <textarea className={`${inputCls} resize-none`} rows={3} placeholder="What problem does this module solve? Who uses it?" value={data.description} onChange={(e) => set('description', e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Default thinking</label>
                <select className={inputCls} value={data.thinking} onChange={(e) => set('thinking', e.target.value)}>
                  {THINKING_OPTIONS.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Default creativity</label>
                <select className={inputCls} value={data.creativity} onChange={(e) => set('creativity', e.target.value)}>
                  {CREATIVITY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Default model</label>
                <select className={inputCls} value={data.model} onChange={(e) => set('model', e.target.value)}>
                  {MODEL_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Thinking display</label>
                <div className="flex gap-3 mt-1.5">
                  {([0, 1, 2] as const).map((level) => (
                    <label key={level} className="flex items-center gap-1.5 cursor-pointer text-xs text-adv-gray">
                      <input
                        type="radio"
                        name="transparencyLevel"
                        value={level}
                        checked={data.transparencyLevel === level}
                        onChange={() => set('transparencyLevel', level)}
                        className="accent-adv-teal"
                      />
                      {level === 0 ? 'Off' : level === 1 ? 'Summary' : 'Full'}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <label className={labelCls}>Add to area</label>
              <select className={inputCls} value={data.area} onChange={(e) => set('area', e.target.value)}>
                <option value="my-modules">⭐ My Modules (default)</option>
                <optgroup label="────────────">
                  {AREAS.map((a) => (
                    <option key={a.id} value={a.id}>{a.label}</option>
                  ))}
                </optgroup>
              </select>
              <p className="mt-1 text-[11px] text-adv-gray-med">Module will appear under this area in the sidebar and home page.</p>
            </div>
          </div>
        )}

        {/* Step: System Prompt */}
        {step === 1 && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={labelCls}>System prompt — core instructions for Claude</label>
              <AiDraftPromptButton
                name={data.name}
                description={data.description}
                area={data.area}
                thinking={data.thinking}
                creativity={data.creativity}
                onDraft={(prompt) => set('system_prompt', prompt)}
                disabled={!data.name.trim()}
              />
            </div>
            <textarea
              className={`${inputCls} resize-none font-mono text-xs`}
              rows={14}
              placeholder={`## YOUR MODULE NAME\n\nYou are an expert in [domain]. Your role is to...\n\n## ANALYSIS FRAMEWORK\n1. First, review...\n2. Then assess...\n3. Produce...\n\n## OUTPUT REQUIREMENTS\n- Always include...\n- Format as...`}
              value={data.system_prompt}
              onChange={(e) => set('system_prompt', e.target.value)}
            />
            <p className="mt-2 text-[11px] text-adv-gray-med">
              Tip: Use ## headers to structure. This is injected as Layer 4 (Module System Prompt) in the prompt composition chain.
            </p>
          </div>
        )}

        {/* Step: Personas */}
        {step === 2 && (
          <div className="space-y-4">
            {(['domain', 'named', 'audience', 'analytical'] as const).map((cat) => {
              const roles = EXPERT_ROLES.filter((r) => r.category === cat);
              const catLabels = { domain: 'Domain Experts', named: 'Named Characters', audience: 'Write For', analytical: 'Analytical Styles' };
              return (
                <div key={cat}>
                  <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-adv-gray-med">{catLabels[cat]}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {roles.map((role) => (
                      <button key={role.id} type="button" onClick={() => togglePersona(role.id)} title={role.description}
                        className={`${chipBase} ${data.personas.includes(role.id) ? chipActive : chipInactive}`}>
                        {role.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Step: Skills */}
        {step === 3 && (
          <div className="space-y-4">
            {availableSkills.length === 0 ? (
              <p className="text-xs text-adv-gray-med">Loading skills...</p>
            ) : (
              (['methodology', 'domain', 'language', 'communication', 'style', 'jurisdiction'] as const).map((cat) => {
                const catSkills = availableSkills.filter((s) => s.category === cat);
                if (catSkills.length === 0) return null;
                const catLabels: Record<string, string> = {
                  methodology: 'Methodology', domain: 'Domain', language: 'Language',
                  communication: 'Communication', style: 'Style', jurisdiction: 'Jurisdiction',
                };
                return (
                  <div key={cat}>
                    <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-adv-gray-med">{catLabels[cat]}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {catSkills.map((skill) => (
                        <button key={skill.id} type="button" onClick={() => toggleSkill(skill.id)} title={skill.description}
                          className={`${chipBase} ${data.skills.includes(skill.id) ? chipActive : chipInactive}`}>
                          {skill.name}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
            <p className="text-[11px] text-adv-gray-med">Skills add specialized instructions to Claude's prompt. Pick 0-3 that fit your module's purpose.</p>
          </div>
        )}

        {/* Step: Output Formats */}
        {step === 4 && (
          <div>
            <p className="mb-3 text-xs text-adv-gray-med">Enter output format IDs (comma-separated). Common: executive-summary, action-plan, gap-scoring-matrix, detailed-findings, quick-briefing, policy-document</p>
            <input
              className={inputCls}
              placeholder="e.g., executive-summary, action-plan, gap-scoring-matrix"
              value={data.output_formats.join(', ')}
              onChange={(e) => set('output_formats', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
            />
            <div className="mt-3 flex flex-wrap gap-1.5">
              {['executive-summary', 'action-plan', 'gap-scoring-matrix', 'detailed-findings', 'quick-briefing', 'policy-document', 'regulatory-comparison', 'impact-assessment'].map((fmt) => (
                <button key={fmt} type="button"
                  onClick={() => {
                    const curr = data.output_formats;
                    set('output_formats', curr.includes(fmt) ? curr.filter((f) => f !== fmt) : [...curr, fmt]);
                  }}
                  className={`${chipBase} ${data.output_formats.includes(fmt) ? chipActive : chipInactive}`}>
                  {fmt.replace(/-/g, ' ')}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 5: Knowledge Setup */}
        {step === 5 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-adv-off-white">Default Knowledge Sources</h3>
              <p className="text-xs text-adv-gray mt-1">Select corpora from the Knowledge Library to pre-load when users open this module.</p>
            </div>

            {libraryEntries.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center">
                <p className="text-xs text-adv-gray">No corpora registered yet.</p>
                <p className="text-xs text-adv-gray-med mt-1">Go to Settings &rarr; Knowledge Library to add corpora first.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {libraryEntries.map(entry => {
                  const selected = data.defaultKnowledgeLibraryIds.includes(entry.id);
                  return (
                    <label key={entry.id} className={`flex items-start gap-2.5 rounded-lg border p-2.5 cursor-pointer transition-colors ${selected ? 'border-adv-teal bg-adv-teal-dim' : 'border-border hover:border-adv-gray-med'}`}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => {
                          const ids = selected
                            ? data.defaultKnowledgeLibraryIds.filter(id => id !== entry.id)
                            : [...data.defaultKnowledgeLibraryIds, entry.id];
                          setData(prev => ({ ...prev, defaultKnowledgeLibraryIds: ids }));
                        }}
                        className="mt-0.5 accent-adv-teal shrink-0"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-adv-off-white">{entry.label}</span>
                          <span className="text-[10px] text-adv-gray-med">{entry.category.replace('_', ' ')}</span>
                          {entry.indexed_at && <span className="text-[10px] text-adv-gray-med">{entry.file_count} files</span>}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}

            <label className="flex items-center gap-2 text-xs text-adv-gray cursor-pointer">
              <input
                type="checkbox"
                checked={data.defaultWebSearch}
                onChange={e => setData(prev => ({ ...prev, defaultWebSearch: e.target.checked }))}
                className="rounded border-adv-gray-med accent-adv-teal"
              />
              Enable web search by default
            </label>

            <div>
              <label className="block text-xs font-medium text-adv-off-white mb-1">Reference URLs (optional)</label>
              <textarea
                className={`${inputCls} resize-none font-mono text-xs`}
                rows={4}
                placeholder="https://eur-lex.europa.eu/eli/reg/2024/1624/oj&#10;https://www.eba.europa.eu/...&#10;One URL per line"
                value={data.defaultReferenceUrls.join('\n')}
                onChange={(e) => {
                  const urls = e.target.value.split('\n').map(s => s.trim()).filter(Boolean);
                  set('defaultReferenceUrls', urls);
                }}
              />
              <p className="mt-1 text-[11px] text-adv-gray-med">Paste URLs to regulations or online documents. Claude will read them when users open this module.</p>
            </div>

            <button
              onClick={() => setStep(step + 1)}
              className="text-xs text-adv-gray-med hover:text-adv-gray underline"
            >
              Skip this step &rarr;
            </button>
          </div>
        )}

        {/* Step 6: Quality Reference */}
        {step === 6 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-adv-off-white">Quality Reference (optional)</h3>
              <p className="text-xs text-adv-gray mt-1">Paste a golden example output. Claude will match its structure and depth.</p>
            </div>

            <div>
              <label className="text-xs text-adv-gray mb-1 block">Example label</label>
              <input
                value={data.referenceOutputLabel}
                onChange={e => setData(prev => ({ ...prev, referenceOutputLabel: e.target.value }))}
                placeholder="e.g., AMLR gap analysis for payment institution"
                className="w-full rounded border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs text-adv-gray mb-1 block">Reference output</label>
              <textarea
                value={data.referenceOutput}
                onChange={e => setData(prev => ({ ...prev, referenceOutput: e.target.value }))}
                placeholder="Paste a golden example output here..."
                rows={10}
                className="w-full rounded border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none font-mono resize-y"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={async () => {
                  if (!data.system_prompt) return;
                  setGeneratingExample(true);
                  try {
                    const msgs = [{ role: 'user' as const, content: `Generate a concise sample output for a module with this system prompt:\n\n${data.system_prompt}\n\nOutput formats: ${data.output_formats.join(', ') || 'general analysis'}\n\nProduce a realistic but brief (~300 word) example of what the final output should look like.` }];
                    const r = await fetch('/api/custom-modules/guide-message', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ messages: [], userMessage: msgs[0].content }),
                    });
                    if (r.ok) {
                      const { response } = await r.json();
                      setData(prev => ({ ...prev, referenceOutput: response, referenceOutputLabel: 'AI-generated example' }));
                    }
                  } catch { /* ignore */ }
                  finally { setGeneratingExample(false); }
                }}
                disabled={generatingExample || !data.system_prompt}
                className="rounded border border-border px-3 py-1.5 text-xs text-adv-gray hover:text-adv-off-white disabled:opacity-50 flex items-center gap-1.5"
              >
                {generatingExample ? (
                  <><span className="h-3 w-3 animate-spin rounded-full border border-adv-teal border-t-transparent inline-block" />Generating...</>
                ) : (
                  'Use AI-generated example'
                )}
              </button>
              <button
                onClick={() => setStep(step + 1)}
                className="text-xs text-adv-gray-med hover:text-adv-gray underline"
              >
                Skip &rarr;
              </button>
            </div>
          </div>
        )}

        {/* Step 7: Module Settings */}
        {step === 7 && (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-adv-off-white">Module Settings</h3>
                <p className="text-xs text-adv-gray mt-1">
                  Define questions that appear at the top of the module. Users fill them in before running — answers are sent to Claude as structured context.
                </p>
              </div>
              <AiSuggestInputsButton
                name={data.name}
                description={data.description}
                systemPrompt={data.system_prompt}
                onSuggest={(fields) => setData((prev) => ({ ...prev, guidedInputs: [...prev.guidedInputs, ...fields] }))}
              />
            </div>

            <GuidedInputEditor
              fields={data.guidedInputs}
              onChange={(fields) => setData((prev) => ({ ...prev, guidedInputs: fields }))}
            />

            <button
              onClick={() => setStep(step + 1)}
              className="text-xs text-adv-gray-med hover:text-adv-gray underline"
            >
              Skip &rarr;
            </button>
          </div>
        )}

        {/* Step 8: Test Run */}
        {step === 8 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-adv-off-white">Test Your Module</h3>
              <p className="text-xs text-adv-gray mt-1">Run a quick preview with Haiku (fast, cheap). Check the response format before saving.</p>
            </div>

            <div>
              <label className="text-xs text-adv-gray mb-1 block">Test query</label>
              <textarea
                value={data.testQuery}
                onChange={e => setData(prev => ({ ...prev, testQuery: e.target.value }))}
                placeholder="Enter a representative test query for this module..."
                rows={3}
                className="w-full rounded border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
              />
            </div>

            <button
              onClick={async () => {
                if (!data.testQuery.trim() || !data.system_prompt.trim()) return;
                setTestRunLoading(true); setTestRunError(null); setTestRunResult(null);
                try {
                  const r = await fetch('/api/custom-modules/test-run', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      systemPrompt: data.system_prompt,
                      referenceOutput: data.referenceOutput || undefined,
                      testQuery: data.testQuery,
                      knowledgeLibraryIds: data.defaultKnowledgeLibraryIds,
                    }),
                  });
                  if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Test run failed'); }
                  const result = await r.json();
                  setTestRunResult(result.response);
                  setTestRunTokens(result.tokens_used);
                } catch (e) {
                  setTestRunError(e instanceof Error ? e.message : 'Test run failed');
                } finally { setTestRunLoading(false); }
              }}
              disabled={testRunLoading || !data.testQuery.trim() || !data.system_prompt.trim()}
              className="rounded bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50 flex items-center gap-1.5"
            >
              {testRunLoading ? (
                <><span className="h-3 w-3 animate-spin rounded-full border border-adv-dark border-t-transparent inline-block" />Running...</>
              ) : 'Run Test'}
            </button>

            {testRunError && (
              <p className="text-xs text-adv-red">{testRunError}</p>
            )}

            {testRunResult && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-adv-gray">Response preview</span>
                  {testRunTokens !== null && (
                    <span className="rounded-full bg-adv-teal-dim px-2 py-0.5 text-[10px] text-adv-teal">
                      Haiku &middot; {testRunTokens.toLocaleString()} tokens
                    </span>
                  )}
                </div>
                <div className="rounded-lg border border-border bg-adv-dark p-3 max-h-64 overflow-y-auto">
                  <pre className="text-xs text-adv-off-white whitespace-pre-wrap font-sans">{testRunResult}</pre>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 9: Review */}
        {step === 9 && (
          <div className="space-y-3 text-sm">
            <div className="rounded-lg bg-adv-dark-2 p-4 space-y-2">
              <div className="text-adv-white font-medium">{data.name || '(unnamed)'}</div>
              <div className="text-xs text-adv-gray-med">{data.description || '(no description)'}</div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-adv-gray">
                <div>Thinking: <span className="text-adv-off-white">{data.thinking}</span></div>
                <div>Creativity: <span className="text-adv-off-white">{data.creativity}</span></div>
                <div>Personas: <span className="text-adv-off-white">{data.personas.length || 'none'}</span></div>
                <div>Skills: <span className="text-adv-off-white">{data.skills.length || 'none'}</span></div>
                <div>Output formats: <span className="text-adv-off-white">{data.output_formats.length || 'none'}</span></div>
                <div>Module Settings: <span className="text-adv-off-white">{data.guidedInputs.length ? `${data.guidedInputs.length} question${data.guidedInputs.length !== 1 ? 's' : ''}` : 'none'}</span></div>
              </div>
              <div className="mt-2 text-xs text-adv-gray">
                System prompt: {data.system_prompt ? `${data.system_prompt.slice(0, 80)}...` : '(empty)'}
              </div>
            </div>

            {/* Share with Community toggle */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={shareWithCommunity}
                onChange={(e) => setShareWithCommunity(e.target.checked)}
                className="h-4 w-4 rounded border-border bg-adv-dark text-adv-teal focus:ring-adv-teal accent-[#2DD4A8]"
              />
              <div>
                <span className="text-xs font-medium text-adv-off-white">Share with Community</span>
                <p className="text-[11px] text-adv-gray-med">Shared modules are visible to other openEXPERT users on this device</p>
              </div>
            </label>
          </div>
        )}

        {/* Navigation */}
        <div className="mt-6 flex gap-3">
          {step > 0 && (
            <button onClick={() => setStep(step - 1)} className="rounded-lg border border-border px-4 py-2 text-sm text-adv-gray hover:text-adv-off-white transition-colors">
              Back
            </button>
          )}
          {step < WIZARD_STEPS.length - 1 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={step === 0 && !data.name.trim()}
              className="flex-1 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button onClick={handleSave} disabled={saving || !data.name.trim()} className="flex-1 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50">
              {saving ? 'Saving...' : editingModuleId ? 'Save Changes' : 'Create Module'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── AI Guide Me ─────────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

function GuidedBuilder({ onModuleReady, onCancel }: {
  onModuleReady: (config: GeneratedModuleConfig) => void;
  onCancel: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedConfig, setGeneratedConfig] = useState<GeneratedModuleConfig | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Start conversation on mount
  useEffect(() => {
    sendMessage('Hello! I want to create a custom module.');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  async function sendMessage(userMsg: string) {
    if (!userMsg.trim() || isLoading) return;
    const userMsgTrimmed = userMsg.trim();
    setInput('');
    setError(null);

    const newMessages: ChatMessage[] = [...messages, { role: 'user', content: userMsgTrimmed }];
    // Don't show the synthetic first message in the chat
    const displayMessages = newMessages.filter((_, i) => !(i === 0 && userMsgTrimmed === 'Hello! I want to create a custom module.'));
    setMessages(displayMessages.length < newMessages.length ? [] : displayMessages);
    setIsLoading(true);

    try {
      const res = await fetch('/api/custom-modules/guide-message', {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, userMessage: userMsgTrimmed }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Error ${res.status}`);
      }
      const { response } = await res.json() as { response: string };
      const updatedMessages: ChatMessage[] = [
        ...newMessages,
        { role: 'assistant', content: response },
      ];
      // Filter the hidden init message
      setMessages(updatedMessages.filter((_, i) => !(i === 0 && updatedMessages[0].content === 'Hello! I want to create a custom module.')));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  async function generateModule() {
    setIsGenerating(true);
    setError(null);
    try {
      const allMessages: ChatMessage[] = [
        { role: 'user', content: 'Hello! I want to create a custom module.' },
        ...messages,
      ];
      const res = await fetch('/api/custom-modules/guide-generate', {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: allMessages }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Error ${res.status}`);
      }
      const { moduleConfig } = await res.json() as { moduleConfig: GeneratedModuleConfig };
      setGeneratedConfig(moduleConfig);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  }

  const canGenerate = messages.length >= 2 && !isLoading;

  return (
    <div className="rounded-xl border border-border bg-adv-card">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-adv-teal" />
          <h2 className="text-sm font-semibold text-adv-white">AI Module Builder</h2>
        </div>
        <button onClick={onCancel} className="text-xs text-adv-gray hover:text-adv-off-white transition-colors">
          ← Back
        </button>
      </div>

      {/* Generated Config Preview */}
      {generatedConfig && (
        <div className="mx-5 mt-4 rounded-lg border border-adv-teal/30 bg-adv-teal-soft p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <div className="text-sm font-semibold text-adv-white">{generatedConfig.name}</div>
              <div className="text-xs text-adv-gray-med mt-0.5">{generatedConfig.description}</div>
            </div>
            <span className="shrink-0 rounded-full bg-adv-teal/20 px-2 py-0.5 text-[10px] text-adv-teal font-medium">Generated</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-[11px] text-adv-gray mb-3">
            <div>Thinking: <span className="text-adv-off-white">{generatedConfig.thinking}</span></div>
            <div>Creativity: <span className="text-adv-off-white">{generatedConfig.creativity}</span></div>
            <div>Area: <span className="text-adv-off-white">{AREAS.find((a) => a.id === generatedConfig.area)?.shortLabel ?? generatedConfig.area}</span></div>
            <div>Personas: <span className="text-adv-off-white">{generatedConfig.personas?.length || 0}</span></div>
            <div>Skills: <span className="text-adv-off-white">{generatedConfig.skills?.length || 0}</span></div>
            <div>Formats: <span className="text-adv-off-white">{generatedConfig.output_formats?.length || 0}</span></div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onModuleReady(generatedConfig)}
              className="flex-1 rounded-lg bg-adv-teal px-3 py-2 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
            >
              Review & Edit in Wizard →
            </button>
            <button
              onClick={() => { setGeneratedConfig(null); setError(null); }}
              className="rounded-lg border border-border px-3 py-2 text-xs text-adv-gray hover:text-adv-off-white transition-colors"
              title="Regenerate"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Chat */}
      <div className="px-5 py-4 space-y-3 max-h-80 overflow-y-auto">
        {messages.length === 0 && isLoading && (
          <div className="flex items-start gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-adv-teal-dim">
              <Bot className="h-3.5 w-3.5 text-adv-teal" />
            </div>
            <div className="rounded-lg bg-adv-dark-2 px-3 py-2 text-xs text-adv-gray-med animate-pulse">
              Thinking...
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex items-start gap-2.5 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${m.role === 'user' ? 'bg-adv-teal/20' : 'bg-adv-teal-dim'}`}>
              {m.role === 'user'
                ? <User className="h-3.5 w-3.5 text-adv-teal" />
                : <Bot className="h-3.5 w-3.5 text-adv-teal" />
              }
            </div>
            <div className={`max-w-[80%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
              m.role === 'user'
                ? 'bg-adv-teal/10 border border-adv-teal/20 text-adv-off-white text-right'
                : 'bg-adv-dark-2 text-adv-off-white'
            }`}>
              {m.content}
            </div>
          </div>
        ))}
        {messages.length > 0 && isLoading && (
          <div className="flex items-start gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-adv-teal-dim">
              <Bot className="h-3.5 w-3.5 text-adv-teal" />
            </div>
            <div className="rounded-lg bg-adv-dark-2 px-3 py-2 text-xs text-adv-gray-med animate-pulse">
              Thinking...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Error */}
      {error && (
        <div className="mx-5 mb-3 rounded-lg border border-adv-red/30 bg-adv-red/10 px-3 py-2 text-xs text-adv-red">
          {error}
        </div>
      )}

      {/* Input */}
      <div className="px-5 pb-5 space-y-3">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
            placeholder={messages.length === 0 ? 'Waiting for AI...' : 'Describe what you want to build...'}
            disabled={isLoading || messages.length === 0}
            className="flex-1 rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none disabled:opacity-50"
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isLoading || messages.length === 0}
            className="rounded-lg bg-adv-teal px-3 py-2 text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>

        {canGenerate && !generatedConfig && (
          <button
            onClick={generateModule}
            disabled={isGenerating}
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-adv-teal/40 bg-adv-teal-dim px-4 py-2 text-sm text-adv-teal hover:bg-adv-teal hover:text-adv-dark transition-colors disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            {isGenerating ? 'Generating module...' : 'Generate Module from This Conversation'}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function BuildYourOwnModule() {
  const navigate = useNavigate();
  const [modules, setModules] = useState<CustomModuleData[]>([]);
  const [mode, setMode] = useState<'list' | 'save-as' | 'build' | 'guide' | 'edit'>('list');
  const [showSaveAs, setShowSaveAs] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [guidedConfig, setGuidedConfig] = useState<GeneratedModuleConfig | null>(null);
  const [editingModule, setEditingModule] = useState<CustomModuleData | null>(null);

  async function loadModules() {
    const list = await fetchCustomModules();
    setModules(list);
  }

  useEffect(() => { loadModules(); }, []);

  async function handleDelete(id: string) {
    setDeleting(id);
    await deleteCustomModule(id);
    await loadModules();
    setDeleting(null);
  }

  async function handleExportAnton(m: CustomModuleData) {
    setExporting(m.id);
    setExportError(null);
    try {
      // type=custom exports from database; auth header required
      const res = await fetch(`/api/exchange/export/${m.id}?type=custom`, {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(errData.error || 'Export failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${m.name.replace(/\s+/g, '-').toLowerCase()}.anton`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Delay revoke so browser has time to start the download
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed');
      setTimeout(() => setExportError(null), 4000);
    } finally {
      setExporting(null);
    }
  }

  function handleSaved() {
    loadModules();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    setMode('list');
  }

  return (
    <div className="mx-auto max-w-3xl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-adv-white flex items-center gap-2">
            <Puzzle className="h-6 w-6 text-adv-teal" />
            Build Your Own Module
          </h1>
          <p className="mt-1 text-sm text-adv-gray">Create custom AI modules tailored to your specific tasks and workflows.</p>
        </div>
        {saved && (
          <div className="flex items-center gap-1.5 rounded-lg bg-adv-green/10 border border-adv-green/30 px-3 py-1.5 text-xs text-adv-green">
            <Check className="h-3 w-3" />
            Module saved
          </div>
        )}
      </div>

      {/* Action cards */}
      {mode === 'list' && (
        <div className="grid grid-cols-3 gap-4 mb-8">
          <button
            onClick={() => setShowSaveAs(true)}
            className="rounded-xl border border-border bg-adv-card p-5 text-left hover:border-adv-teal/40 transition-colors group"
          >
            <BookMarked className="h-6 w-6 text-adv-teal mb-3" />
            <div className="font-medium text-adv-off-white">Save Current Session</div>
            <p className="mt-1 text-xs text-adv-gray-med">Extract the current module's configuration — prompt, personas, skills, output formats — and save as a reusable module.</p>
            <div className="mt-3 flex items-center gap-1 text-xs text-adv-teal group-hover:gap-2 transition-all">
              Save as module <ChevronRight className="h-3 w-3" />
            </div>
          </button>

          <button
            onClick={() => { setGuidedConfig(null); setMode('guide'); }}
            className="rounded-xl border border-adv-teal/20 bg-adv-card p-5 text-left hover:border-adv-teal/50 transition-colors group"
          >
            <Sparkles className="h-6 w-6 text-adv-teal mb-3" />
            <div className="font-medium text-adv-off-white">Guide Me</div>
            <p className="mt-1 text-xs text-adv-gray-med">Tell Claude what you're working on. It'll ask questions, then generate a professional system prompt, personas, and settings for you.</p>
            <div className="mt-3 flex items-center gap-1 text-xs text-adv-teal group-hover:gap-2 transition-all">
              Start AI conversation <ChevronRight className="h-3 w-3" />
            </div>
          </button>

          <button
            onClick={() => { setGuidedConfig(null); setMode('build'); }}
            className="rounded-xl border border-border bg-adv-card p-5 text-left hover:border-adv-teal/40 transition-colors group"
          >
            <Wand2 className="h-6 w-6 text-adv-gold mb-3" />
            <div className="font-medium text-adv-off-white">Build From Scratch</div>
            <p className="mt-1 text-xs text-adv-gray-med">Use the step-by-step wizard to design a new module from the ground up with custom prompts, personas, and output formats.</p>
            <div className="mt-3 flex items-center gap-1 text-xs text-adv-gold group-hover:gap-2 transition-all">
              Open wizard <ChevronRight className="h-3 w-3" />
            </div>
          </button>
        </div>
      )}

      {/* Guide Me mode */}
      {mode === 'guide' && (
        <div className="mb-8">
          <GuidedBuilder
            onModuleReady={(config) => {
              setGuidedConfig(config);
              setMode('build');
            }}
            onCancel={() => setMode('list')}
          />
        </div>
      )}

      {/* Build wizard */}
      {mode === 'build' && (
        <div className="mb-8">
          <div className="mb-4 flex items-center gap-3">
            <button onClick={() => setMode('list')} className="text-xs text-adv-gray hover:text-adv-off-white transition-colors">
              ← Back to My Modules
            </button>
            {guidedConfig && (
              <span className="text-[11px] text-adv-teal bg-adv-teal-dim rounded px-2 py-0.5">
                Pre-filled from AI Guide
              </span>
            )}
          </div>
          <BuildWizard onSaved={handleSaved} initialData={guidedConfig ?? undefined} />
        </div>
      )}

      {mode === 'edit' && editingModule && (
        <div className="mb-8">
          <div className="mb-4 flex items-center gap-3">
            <button onClick={() => { setMode('list'); setEditingModule(null); }} className="text-xs text-adv-gray hover:text-adv-off-white transition-colors">
              ← Back to My Modules
            </button>
            <span className="text-[11px] text-adv-gold bg-adv-gold/10 border border-adv-gold/20 rounded px-2 py-0.5">
              Editing: {editingModule.name}
            </span>
          </div>
          <BuildWizard
            onSaved={handleSaved}
            editingModuleId={editingModule.id}
            initialData={{
              name: editingModule.name,
              short_name: editingModule.short_name || editingModule.name,
              description: editingModule.description || '',
              icon: editingModule.icon || 'Puzzle',
              area: editingModule.area || 'my-modules',
              system_prompt: editingModule.system_prompt || '',
              thinking: (editingModule.config as Record<string, unknown>)?.thinking as string || 'think_hard',
              creativity: (editingModule.config as Record<string, unknown>)?.creativity as string || 'balanced',
              personas: (editingModule.config as Record<string, unknown>)?.personas as string[] || [],
              skills: (editingModule.config as Record<string, unknown>)?.skills as string[] || [],
              output_formats: (editingModule.config as Record<string, unknown>)?.outputFormats as string[] || [],
              guidedInputs: (editingModule.config as Record<string, unknown>)?.guidedInputs as GuidedInputField[] || [],
              referenceOutput: (editingModule.config as Record<string, unknown>)?.referenceOutput as string || '',
              referenceOutputLabel: (editingModule.config as Record<string, unknown>)?.referenceOutputLabel as string || '',
            }}
          />
        </div>
      )}

      {/* Export error banner */}
      {exportError && (
        <div className="mb-4 rounded-lg border border-adv-red/30 bg-adv-red/10 px-4 py-3 text-sm text-adv-red">
          Export failed: {exportError}
        </div>
      )}

      {/* My Modules list */}
      {mode === 'list' && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-adv-off-white flex items-center gap-2">
            My Modules
            <span className="rounded-full bg-adv-dark px-2 py-0.5 text-[10px] text-adv-gray-med">{modules.length}</span>
          </h2>

          {modules.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-10 text-center">
              <Puzzle className="h-8 w-8 text-adv-gray-med mx-auto mb-3" />
              <p className="text-sm text-adv-gray">No custom modules yet.</p>
              <p className="text-xs text-adv-gray-med mt-1">Save a session or build from scratch to get started.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {modules.map((m) => (
                <div key={m.id} className="rounded-xl border border-border bg-adv-card p-4 flex items-center gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-adv-teal-dim">
                    <Puzzle className="h-5 w-5 text-adv-teal" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-adv-off-white text-sm truncate">{m.name}</div>
                    <p className="text-xs text-adv-gray-med truncate mt-0.5">{m.description || 'No description'}</p>
                    <div className="mt-1 flex gap-3 text-[11px] text-adv-gray-med">
                      <span>{(m.config as { thinking?: string }).thinking || 'think_hard'}</span>
                      <span>{(m.config as { creativity?: string }).creativity || 'balanced'}</span>
                      <span>{((m.config as { outputFormats?: string[] }).outputFormats || []).length} formats</span>
                      <span className="text-adv-teal/70">
                        {m.area === 'my-modules' || m.area === 'custom' || !m.area
                          ? 'My Modules'
                          : (AREAS.find((a) => a.id === m.area)?.shortLabel ?? m.area)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => navigate(`/module/${m.id}`)}
                      className="rounded-lg border border-adv-teal/40 bg-adv-teal-dim px-3 py-1.5 text-xs text-adv-teal hover:bg-adv-teal hover:text-adv-dark transition-colors"
                    >
                      Open
                    </button>
                    <button
                      onClick={() => { setEditingModule(m); setMode('edit'); }}
                      title="Edit module"
                      className="rounded-lg border border-border p-1.5 text-adv-gray-med hover:border-adv-teal/40 hover:text-adv-teal transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleExportAnton(m)}
                      disabled={exporting === m.id}
                      title="Export as .anton"
                      className="rounded-lg border border-border p-1.5 text-adv-gray-med hover:border-adv-teal/40 hover:text-adv-teal transition-colors disabled:opacity-50"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(m.id)}
                      disabled={deleting === m.id}
                      className="rounded-lg border border-border p-1.5 text-adv-gray-med hover:border-adv-red/40 hover:text-adv-red transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Save As Dialog */}
      {showSaveAs && (
        <SaveAsDialog onClose={() => setShowSaveAs(false)} onSaved={handleSaved} />
      )}
    </div>
  );
}
