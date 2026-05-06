/**
 * AppGatewayPage.tsx
 * Admin UI for the Companion App Gateway.
 * Tabs: Organisations, Intent Categories, Invitations, Connected Users, Analytics
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Building2, Plus, Trash2, Edit2, Users, BarChart2, Key, Copy, Check,
  QrCode, Tag, Settings, Shield, Smartphone, ChevronDown,
} from 'lucide-react';
import { getAuthHeader } from '@/lib/api';

// ── Types ────────────────────────────────────────────────────────────────────

interface OrgProfile {
  id: string;
  name: string;
  org_type: string;
  description: string | null;
  welcome_message: string | null;
  branding: Record<string, unknown>;
  default_model: string;
  default_thinking: string;
  max_thinking_level: string;
  allow_reasoning_view: boolean;
  allow_file_upload: boolean;
  allow_voice_input: boolean;
  max_tokens_per_query: number;
  max_queries_per_day: number;
  default_output_language: string;
  supported_languages: string[];
  force_output_language: boolean;
  is_active: boolean;
  created_at: string;
}

interface IntentCategory {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  allowed_areas: string[];
  allowed_modules: string[];
  default_module_id: string | null;
  system_prompt_addon: string | null;
  persona_id: string | null;
  priority: number;
  is_active: boolean;
}

interface Invitation {
  id: string;
  org_id: string;
  token: string;
  invitation_type: string;
  max_uses: number;
  used_count: number;
  label: string | null;
  expires_at: string | null;
  created_at: string;
}

interface ConnectedUser {
  id: string;
  contact_hash: string;
  display_name: string | null;
  status: string;
  role: string;
  last_seen_at: string | null;
  joined_at: string;
}

interface AnalyticsSummary {
  total_queries: number;
  total_users: number;
  total_input_tokens: number;
  total_output_tokens: number;
  connected_users: number;
}

// ── API helpers ──────────────────────────────────────────────────────────────

const api = {
  async get(path: string) {
    const res = await fetch(`/api/admin/app${path}`, { headers: { ...getAuthHeader() } });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  async post(path: string, body: unknown) {
    const res = await fetch(`/api/admin/app${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  async put(path: string, body: unknown) {
    const res = await fetch(`/api/admin/app${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  async del(path: string) {
    const res = await fetch(`/api/admin/app${path}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
};

// ── Org Type options ─────────────────────────────────────────────────────────
const ORG_TYPES = [
  { value: 'school', label: 'School' },
  { value: 'ngo', label: 'NGO' },
  { value: 'sports_club', label: 'Sports Club' },
  { value: 'consulting', label: 'Consulting' },
  { value: 'consulting_firm', label: 'Consulting Firm' },
  { value: 'company', label: 'Company' },
  { value: 'community', label: 'Community' },
  { value: 'government', label: 'Government' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'other', label: 'Other' },
];

const TABS = ['Organisations', 'Intents', 'Pair Device', 'Invitations', 'Users', 'Analytics'] as const;

export default function AppGatewayPage() {
  const [tab, setTab] = useState<typeof TABS[number]>('Organisations');
  const [orgs, setOrgs] = useState<OrgProfile[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadOrgs = useCallback(async () => {
    try {
      const data = await api.get('/orgs');
      setOrgs(data);
      if (data.length > 0 && !selectedOrgId) setSelectedOrgId(data[0].id);
    } catch (err) {
      console.error('Failed to load orgs:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId]);

  useEffect(() => { loadOrgs(); }, [loadOrgs]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <span className="text-adv-gray text-sm">Loading App Gateway...</span>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Smartphone className="h-6 w-6 text-adv-teal" />
        <div>
          <h1 className="text-xl font-bold text-adv-off-white">App Gateway</h1>
          <p className="text-sm text-adv-gray">
            Manage companion app connections — organisations, intents, invitations, and users
          </p>
        </div>
      </div>

      {/* Org Selector */}
      {orgs.length > 0 && (
        <div className="flex items-center gap-3">
          <label className="text-xs text-adv-gray">Organisation:</label>
          <select
            value={selectedOrgId || ''}
            onChange={(e) => setSelectedOrgId(e.target.value)}
            className="rounded-lg border border-border bg-adv-card px-3 py-1.5 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
          >
            {orgs.map(o => (
              <option key={o.id} value={o.id}>{o.name} ({o.org_type})</option>
            ))}
          </select>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
              tab === t
                ? 'border-adv-teal text-adv-teal'
                : 'border-transparent text-adv-gray hover:text-adv-off-white'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'Organisations' && <OrgsTab orgs={orgs} onRefresh={loadOrgs} />}
      {tab === 'Intents' && selectedOrgId && <IntentsTab orgId={selectedOrgId} />}
      {tab === 'Pair Device' && selectedOrgId && <PairDeviceTab orgId={selectedOrgId} />}
      {tab === 'Invitations' && selectedOrgId && <InvitationsTab orgId={selectedOrgId} />}
      {tab === 'Users' && selectedOrgId && <UsersTab orgId={selectedOrgId} />}
      {tab === 'Analytics' && selectedOrgId && <AnalyticsTab orgId={selectedOrgId} />}

      {!selectedOrgId && tab !== 'Organisations' && (
        <div className="text-center py-12 text-adv-gray">
          Create an organisation first to manage intents, invitations, and users.
        </div>
      )}
    </div>
  );
}

// ── Organisations Tab ────────────────────────────────────────────────────────

const THINKING_LEVELS = [
  { value: 'quick', label: 'Quick' },
  { value: 'think', label: 'Think' },
  { value: 'think_hard', label: 'Think Hard' },
  { value: 'investigate', label: 'Investigate' },
  { value: 'plan_first', label: 'Plan First' },
];

const MODEL_OPTIONS = [
  { value: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' },
  { value: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
];

const LANGUAGES = [
  { value: 'en', label: 'English' }, { value: 'sv', label: 'Svenska' }, { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' }, { value: 'it', label: 'Italiano' }, { value: 'es', label: 'Español' },
  { value: 'hi', label: 'हिंदी' }, { value: 'pt', label: 'Português' }, { value: 'pl', label: 'Polski' },
  { value: 'ur', label: 'اردو' }, { value: 'zh', label: '简体中文' }, { value: 'ar', label: 'العربية' },
  { value: 'bn', label: 'বাংলা' }, { value: 'uk', label: 'Українська' }, { value: 'id', label: 'Bahasa Indonesia' },
  { value: 'ja', label: '日本語' }, { value: 'tr', label: 'Türkçe' }, { value: 'vi', label: 'Tiếng Việt' },
  { value: 'ko', label: '한국어' }, { value: 'th', label: 'ไทย' }, { value: 'fa', label: 'فارسی' },
  { value: 'nl', label: 'Nederlands' }, { value: 'ro', label: 'Română' }, { value: 'el', label: 'Ελληνικά' },
  { value: 'cs', label: 'Čeština' }, { value: 'hu', label: 'Magyar' }, { value: 'he', label: 'עברית' },
  { value: 'fi', label: 'Suomi' }, { value: 'no', label: 'Norsk' }, { value: 'da', label: 'Dansk' },
];

const defaultOrgForm = {
  name: '', org_type: 'company', description: '', welcome_message: '',
  default_model: 'claude-sonnet-4-5-20250929', default_thinking: 'think', max_thinking_level: 'think_hard',
  allow_reasoning_view: false, allow_file_upload: false, allow_voice_input: false,
  max_tokens_per_query: 4096, max_queries_per_day: 100,
  default_output_language: 'en', supported_languages: ['en'] as string[], force_output_language: false,
};

function OrgsTab({ orgs, onRefresh }: { orgs: OrgProfile[]; onRefresh: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [editOrg, setEditOrg] = useState<OrgProfile | null>(null);
  const [form, setForm] = useState(defaultOrgForm);
  const [showAdvanced, setShowAdvanced] = useState(false);

  function openCreate() {
    setEditOrg(null);
    setForm(defaultOrgForm);
    setShowForm(true);
    setShowAdvanced(false);
  }

  function openEdit(org: OrgProfile) {
    setEditOrg(org);
    setForm({
      name: org.name, org_type: org.org_type,
      description: org.description || '', welcome_message: org.welcome_message || '',
      default_model: org.default_model, default_thinking: org.default_thinking, max_thinking_level: org.max_thinking_level,
      allow_reasoning_view: org.allow_reasoning_view, allow_file_upload: org.allow_file_upload, allow_voice_input: org.allow_voice_input,
      max_tokens_per_query: org.max_tokens_per_query, max_queries_per_day: org.max_queries_per_day,
      default_output_language: org.default_output_language || 'en',
      supported_languages: Array.isArray(org.supported_languages) ? org.supported_languages : ['en'],
      force_output_language: org.force_output_language || false,
    });
    setShowForm(true);
    setShowAdvanced(false);
  }

  async function handleSave() {
    try {
      if (editOrg) { await api.put(`/orgs/${editOrg.id}`, form); }
      else { await api.post('/orgs', form); }
      setShowForm(false);
      setEditOrg(null);
      onRefresh();
    } catch (err) { console.error('Save failed:', err); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this organisation and all associated data?')) return;
    await api.del(`/orgs/${id}`);
    onRefresh();
  }

  const inputCls = "w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none";
  const selectCls = inputCls;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-sm font-semibold text-adv-off-white flex items-center gap-2">
          <Building2 className="h-4 w-4 text-adv-teal" />
          Organisations ({orgs.length})
        </h2>
        <button onClick={openCreate} className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors">
          <Plus className="h-3.5 w-3.5" /> New Organisation
        </button>
      </div>

      {showForm && (
        <div className="rounded-lg border border-adv-teal/30 bg-adv-card p-4 space-y-3">
          <input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Organisation name" className={inputCls} />
          <select value={form.org_type} onChange={(e) => setForm(f => ({ ...f, org_type: e.target.value }))} className={selectCls}>
            {ORG_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Description" rows={2} className={inputCls + ' resize-none'} />
          <textarea value={form.welcome_message} onChange={(e) => setForm(f => ({ ...f, welcome_message: e.target.value }))} placeholder="Welcome message for app users" rows={2} className={inputCls + ' resize-none'} />

          {/* M13: Advanced Settings */}
          <button onClick={() => setShowAdvanced(!showAdvanced)} className="flex items-center gap-1.5 text-xs text-adv-teal hover:text-adv-teal-dark transition-colors">
            <Settings className="h-3 w-3" />
            {showAdvanced ? 'Hide' : 'Show'} Advanced Settings
          </button>

          {showAdvanced && (
            <div className="space-y-3 rounded-lg border border-border bg-adv-dark p-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-adv-gray mb-1">Default Model</label>
                  <select value={form.default_model} onChange={(e) => setForm(f => ({ ...f, default_model: e.target.value }))} className={selectCls}>
                    {MODEL_OPTIONS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-adv-gray mb-1">Default Thinking</label>
                  <select value={form.default_thinking} onChange={(e) => setForm(f => ({ ...f, default_thinking: e.target.value }))} className={selectCls}>
                    {THINKING_LEVELS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-adv-gray mb-1">Max Thinking Level</label>
                  <select value={form.max_thinking_level} onChange={(e) => setForm(f => ({ ...f, max_thinking_level: e.target.value }))} className={selectCls}>
                    {THINKING_LEVELS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-adv-gray mb-1">Max Tokens / Query</label>
                  <input type="number" value={form.max_tokens_per_query} onChange={(e) => setForm(f => ({ ...f, max_tokens_per_query: parseInt(e.target.value) || 4096 }))} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs text-adv-gray mb-1">Max Queries / Day</label>
                  <input type="number" value={form.max_queries_per_day} onChange={(e) => setForm(f => ({ ...f, max_queries_per_day: parseInt(e.target.value) || 100 }))} className={inputCls} />
                </div>
              </div>
              <div className="flex flex-wrap gap-4 pt-1">
                <label className="flex items-center gap-2 text-xs text-adv-off-white cursor-pointer">
                  <input type="checkbox" checked={form.allow_reasoning_view} onChange={(e) => setForm(f => ({ ...f, allow_reasoning_view: e.target.checked }))} className="rounded border-border bg-adv-dark text-adv-teal focus:ring-adv-teal" />
                  Show reasoning
                </label>
                <label className="flex items-center gap-2 text-xs text-adv-off-white cursor-pointer">
                  <input type="checkbox" checked={form.allow_file_upload} onChange={(e) => setForm(f => ({ ...f, allow_file_upload: e.target.checked }))} className="rounded border-border bg-adv-dark text-adv-teal focus:ring-adv-teal" />
                  File upload
                </label>
                <label className="flex items-center gap-2 text-xs text-adv-off-white cursor-pointer">
                  <input type="checkbox" checked={form.allow_voice_input} onChange={(e) => setForm(f => ({ ...f, allow_voice_input: e.target.checked }))} className="rounded border-border bg-adv-dark text-adv-teal focus:ring-adv-teal" />
                  Voice input
                </label>
                <label className="flex items-center gap-2 text-xs text-adv-off-white cursor-pointer">
                  <input type="checkbox" checked={form.force_output_language} onChange={(e) => setForm(f => ({ ...f, force_output_language: e.target.checked }))} className="rounded border-border bg-adv-dark text-adv-teal focus:ring-adv-teal" />
                  Force single language
                </label>
              </div>

              {/* Language Configuration */}
              <div className="pt-2 border-t border-border/50">
                <div className="text-xs font-medium text-adv-gray mb-2">Language</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-adv-gray mb-1">Default Output Language</label>
                    <select value={form.default_output_language} onChange={(e) => setForm(f => ({ ...f, default_output_language: e.target.value }))} className={selectCls}>
                      {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-adv-gray mb-1">Supported Languages</label>
                    <div className="max-h-32 overflow-y-auto rounded-lg border border-border bg-adv-dark p-2 space-y-1">
                      {LANGUAGES.map(l => (
                        <label key={l.value} className="flex items-center gap-2 text-xs text-adv-off-white cursor-pointer">
                          <input
                            type="checkbox"
                            checked={form.supported_languages.includes(l.value)}
                            onChange={(e) => {
                              setForm(f => ({
                                ...f,
                                supported_languages: e.target.checked
                                  ? [...f.supported_languages, l.value]
                                  : f.supported_languages.filter(v => v !== l.value),
                              }));
                            }}
                            className="rounded border-border bg-adv-dark text-adv-teal focus:ring-adv-teal"
                          />
                          {l.label}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={handleSave} className="rounded-lg bg-adv-teal px-4 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors">
              {editOrg ? 'Update' : 'Create'}
            </button>
            <button onClick={() => { setShowForm(false); setEditOrg(null); }} className="rounded-lg bg-adv-dark px-4 py-1.5 text-xs text-adv-gray hover:text-adv-off-white transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {orgs.map(org => (
          <div key={org.id} className="flex items-center justify-between rounded-lg border border-border bg-adv-card px-4 py-3">
            <div className="flex items-center gap-3">
              <div className={`h-2 w-2 rounded-full ${org.is_active ? 'bg-adv-green' : 'bg-adv-gray'}`} />
              <div>
                <div className="text-sm font-medium text-adv-off-white">{org.name}</div>
                <div className="text-xs text-adv-gray">{org.org_type} — {org.default_model} — {org.default_thinking}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => openEdit(org)} className="p-1.5 rounded text-adv-gray hover:text-adv-teal transition-colors">
                <Edit2 className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => handleDelete(org.id)} className="p-1.5 rounded text-adv-gray hover:text-adv-red transition-colors">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
        {orgs.length === 0 && (
          <p className="text-center py-8 text-adv-gray text-sm">No organisations yet. Create one to get started.</p>
        )}
      </div>
    </div>
  );
}

// ── Intents Tab ──────────────────────────────────────────────────────────────

const defaultIntentForm = {
  name: '', description: '', system_prompt_addon: '', priority: 0,
  default_module_id: '', persona_id: '', max_thinking_level: '',
  allowed_areas: '', allowed_modules: '', required_output_language: '',
};

function IntentsTab({ orgId }: { orgId: string }) {
  const [intents, setIntents] = useState<IntentCategory[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultIntentForm);

  const load = useCallback(async () => {
    try { setIntents(await api.get(`/orgs/${orgId}/intents`)); } catch {}
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditId(null);
    setForm(defaultIntentForm);
    setShowForm(true);
  }

  function openEdit(intent: IntentCategory) {
    setEditId(intent.id);
    setForm({
      name: intent.name,
      description: intent.description || '',
      system_prompt_addon: intent.system_prompt_addon || '',
      priority: intent.priority,
      default_module_id: intent.default_module_id || '',
      persona_id: intent.persona_id || '',
      max_thinking_level: '',
      allowed_areas: Array.isArray(intent.allowed_areas) ? intent.allowed_areas.join(', ') : '',
      allowed_modules: Array.isArray(intent.allowed_modules) ? intent.allowed_modules.join(', ') : '',
      required_output_language: '',
    });
    setShowForm(true);
  }

  async function handleSave() {
    try {
      const payload = {
        ...form,
        allowed_areas: form.allowed_areas ? form.allowed_areas.split(',').map(s => s.trim()).filter(Boolean) : [],
        allowed_modules: form.allowed_modules ? form.allowed_modules.split(',').map(s => s.trim()).filter(Boolean) : [],
        default_module_id: form.default_module_id || null,
        persona_id: form.persona_id || null,
        max_thinking_level: form.max_thinking_level || null,
        required_output_language: form.required_output_language || null,
      };
      if (editId) { await api.put(`/intents/${editId}`, payload); }
      else { await api.post(`/orgs/${orgId}/intents`, payload); }
      setShowForm(false);
      setEditId(null);
      load();
    } catch {}
  }

  async function handleDelete(id: string) {
    await api.del(`/intents/${id}`);
    load();
  }

  const inputCls = "w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none";

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-sm font-semibold text-adv-off-white flex items-center gap-2">
          <Tag className="h-4 w-4 text-adv-teal" />
          Intent Categories ({intents.length})
        </h2>
        <button onClick={openCreate} className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors">
          <Plus className="h-3.5 w-3.5" /> New Intent
        </button>
      </div>

      {showForm && (
        <div className="rounded-lg border border-adv-teal/30 bg-adv-card p-4 space-y-3">
          <input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Intent name (e.g. Homework Help, Benefits Query)" className={inputCls} />
          <textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Description" rows={2} className={inputCls + ' resize-none'} />
          <textarea value={form.system_prompt_addon} onChange={(e) => setForm(f => ({ ...f, system_prompt_addon: e.target.value }))} placeholder="System prompt addon (additional instructions for AI)" rows={3} className={inputCls + ' resize-none'} />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-adv-gray mb-1">Allowed Areas (comma-separated)</label>
              <input value={form.allowed_areas} onChange={(e) => setForm(f => ({ ...f, allowed_areas: e.target.value }))} placeholder="e.g. fcp, legal, education" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-adv-gray mb-1">Allowed Modules (comma-separated)</label>
              <input value={form.allowed_modules} onChange={(e) => setForm(f => ({ ...f, allowed_modules: e.target.value }))} placeholder="e.g. fcp-compliance, legal-analysis" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-adv-gray mb-1">Default Module ID</label>
              <input value={form.default_module_id} onChange={(e) => setForm(f => ({ ...f, default_module_id: e.target.value }))} placeholder="e.g. education-tutor" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-adv-gray mb-1">Persona ID</label>
              <input value={form.persona_id} onChange={(e) => setForm(f => ({ ...f, persona_id: e.target.value }))} placeholder="e.g. daniel-fcp, amanda-legal" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-adv-gray mb-1">Max Thinking Level</label>
              <select value={form.max_thinking_level} onChange={(e) => setForm(f => ({ ...f, max_thinking_level: e.target.value }))} className={inputCls}>
                <option value="">Use org default</option>
                {THINKING_LEVELS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-adv-gray mb-1">Priority</label>
              <input type="number" value={form.priority} onChange={(e) => setForm(f => ({ ...f, priority: parseInt(e.target.value) || 0 }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-adv-gray mb-1">Required Language</label>
              <select value={form.required_output_language} onChange={(e) => setForm(f => ({ ...f, required_output_language: e.target.value }))} className={inputCls}>
                <option value="">User's choice</option>
                {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={handleSave} className="rounded-lg bg-adv-teal px-4 py-1.5 text-xs font-medium text-adv-dark">{editId ? 'Update' : 'Create'}</button>
            <button onClick={() => { setShowForm(false); setEditId(null); }} className="rounded-lg bg-adv-dark px-4 py-1.5 text-xs text-adv-gray">Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {intents.map(intent => (
          <div key={intent.id} className="flex items-center justify-between rounded-lg border border-border bg-adv-card px-4 py-3">
            <div>
              <div className="text-sm font-medium text-adv-off-white">{intent.name}</div>
              <div className="text-xs text-adv-gray">
                {intent.description || 'No description'} — Priority: {intent.priority}
                {intent.default_module_id && <span className="ml-2 text-adv-teal">Module: {intent.default_module_id}</span>}
                {intent.persona_id && <span className="ml-2 text-adv-blue">Persona: {intent.persona_id}</span>}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => openEdit(intent)} className="p-1.5 rounded text-adv-gray hover:text-adv-teal transition-colors">
                <Edit2 className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => handleDelete(intent.id)} className="p-1.5 rounded text-adv-gray hover:text-adv-red transition-colors">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
        {intents.length === 0 && <p className="text-center py-8 text-adv-gray text-sm">No intent categories configured.</p>}
      </div>
    </div>
  );
}

// ── Pair Device Tab ──────────────────────────────────────────────────────────
// Modern Ed25519 enrollment per docs/ANTON_MESH_SPEC.md. Generates a single-
// use enrollment package with transport='mesh', renders the resulting
// anton://enroll?... URL as a QR. The phone scans, the JoinPage validates
// the binding_sig + relay URLs cryptographically, then signs a completion
// challenge. Tokens expire in 60s — generate fresh per pair attempt.

interface EnrollmentPackage {
  token: string;
  nonce: string;
  expires_at: string;
  transport?: 'public_https' | 'mesh';
  relay_endpoints?: string[];
  instance_ed_pk?: string;
  instance_x_pk?: string;
  binding_sig?: string;
  instance_contact_hash: string | null;
  instance_display_name: string | null;
  requires_confirmation_code: boolean;
  confirmation_code?: string | null;
}

function PairDeviceTab({ orgId }: { orgId: string }) {
  const [transport, setTransport] = useState<'mesh' | 'public_https'>('mesh');
  const [requireCode, setRequireCode] = useState(false);
  const [pkg, setPkg] = useState<EnrollmentPackage | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [pairingUrl, setPairingUrl] = useState<string>('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'url' | 'token' | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  // Countdown to expiry — refreshes every second so the admin sees the
  // token age in real time.
  useEffect(() => {
    if (!pkg) return;
    const expiresAtMs = new Date(pkg.expires_at).getTime();
    const tick = (): void => {
      const left = Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000));
      setSecondsLeft(left);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [pkg]);

  async function generate(): Promise<void> {
    setGenerating(true);
    setError(null);
    setPkg(null);
    setQrDataUrl(null);
    try {
      const body = {
        org_id: orgId,
        intended_role: 'member',
        transport,
        require_confirmation_code: requireCode,
      };
      const result = await api.post('/enrollment/start', body) as EnrollmentPackage;
      setPkg(result);

      const serverUrl = window.location.origin;
      const url = `anton://enroll?server=${encodeURIComponent(serverUrl)}&token=${encodeURIComponent(result.token)}`;
      setPairingUrl(url);

      const QRCode = await import('qrcode');
      const dataUrl = await QRCode.toDataURL(url, {
        width: 320,
        margin: 1,
        color: { dark: '#0B1426', light: '#FFFFFF' },
      });
      setQrDataUrl(dataUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate enrollment');
    } finally {
      setGenerating(false);
    }
  }

  function copy(value: string, kind: 'url' | 'token'): void {
    navigator.clipboard.writeText(value);
    setCopied(kind);
    setTimeout(() => setCopied(null), 2000);
  }

  const expired = pkg && secondsLeft === 0;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-adv-off-white flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-adv-teal" />
          Pair a Companion App device
        </h2>
        <p className="mt-1 text-xs text-adv-gray">
          Generates a single-use Ed25519 enrollment QR. The phone scans, the app validates the
          relay binding cryptographically, the device cert is issued. Token expires in 60 seconds.
        </p>
      </div>

      {/* Config */}
      <div className="rounded-lg border border-border bg-adv-card p-4 space-y-3">
        <div className="flex flex-wrap gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wider text-adv-gray">Transport</label>
            <select
              value={transport}
              onChange={(e) => setTransport(e.target.value as 'mesh' | 'public_https')}
              className="rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
            >
              <option value="mesh">Mesh (relay, E2E encrypted)</option>
              <option value="public_https">Public HTTPS (direct to instance)</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wider text-adv-gray">Confirmation code</label>
            <label className="flex items-center gap-2 px-3 py-2 text-sm text-adv-off-white">
              <input
                type="checkbox"
                checked={requireCode}
                onChange={(e) => setRequireCode(e.target.checked)}
                className="h-4 w-4 accent-adv-teal"
              />
              Require 6-digit code (read aloud)
            </label>
          </div>
        </div>
        <button
          onClick={generate}
          disabled={generating}
          className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50"
        >
          <QrCode className="h-4 w-4" />
          {generating ? 'Generating…' : pkg ? 'Generate New QR' : 'Generate Pairing QR'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-adv-red/40 bg-adv-red/10 p-3 text-xs text-adv-red">
          {error}
          {error.toLowerCase().includes('relay') && (
            <div className="mt-1 text-adv-gray">
              Hint: ANTON_MESH_RELAYS env var is empty. Set it to your relay URLs (e.g.
              <code className="mx-1 px-1 bg-adv-dark rounded">wss://relay.futurechain.eu</code>)
              and restart the server.
            </div>
          )}
        </div>
      )}

      {/* QR + token panel */}
      {pkg && qrDataUrl && (
        <div className="rounded-lg border border-adv-teal/30 bg-adv-card p-5 space-y-4">
          <div className="flex flex-col items-center gap-3">
            <img
              src={qrDataUrl}
              alt="Pairing QR"
              className="h-[260px] w-[260px] rounded-lg bg-white p-2"
              style={{ filter: expired ? 'grayscale(1) opacity(0.4)' : 'none' }}
            />
            <div className="text-center">
              {expired ? (
                <div className="text-sm text-adv-red font-semibold">⏱ Expired — generate a new QR</div>
              ) : (
                <div className="text-sm text-adv-teal font-semibold">
                  ⏱ Expires in {secondsLeft}s
                </div>
              )}
              <p className="mt-1 text-[11px] text-adv-gray">
                Have the phone user open the Companion App → Join → scan
              </p>
            </div>
          </div>

          {/* Pairing details */}
          <div className="space-y-2 border-t border-border pt-4">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-adv-gray">Pairing URL</span>
              <button
                onClick={() => copy(pairingUrl, 'url')}
                className="flex items-center gap-1 text-adv-teal hover:text-adv-teal-dark"
              >
                {copied === 'url' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied === 'url' ? 'Copied' : 'Copy'}
              </button>
            </div>
            <code className="block break-all rounded bg-adv-dark p-2 text-[10px] text-adv-off-white">
              {pairingUrl}
            </code>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <div className="text-adv-gray text-[10px] uppercase tracking-wider">Transport</div>
              <div className="mt-1 text-adv-off-white font-mono">{pkg.transport ?? 'public_https'}</div>
            </div>
            <div>
              <div className="text-adv-gray text-[10px] uppercase tracking-wider">Token (single-use)</div>
              <div className="mt-1 flex items-center gap-2">
                <code className="text-[10px] text-adv-off-white">{pkg.token.slice(0, 16)}…</code>
                <button onClick={() => copy(pkg.token, 'token')} className="text-adv-teal">
                  {copied === 'token' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                </button>
              </div>
            </div>
          </div>

          {pkg.transport === 'mesh' && pkg.relay_endpoints && pkg.relay_endpoints.length > 0 && (
            <div className="text-xs">
              <div className="text-adv-gray text-[10px] uppercase tracking-wider">Relay endpoints baked into QR</div>
              <ul className="mt-1 space-y-0.5">
                {pkg.relay_endpoints.map(r => (
                  <li key={r} className="font-mono text-[11px] text-adv-off-white">{r}</li>
                ))}
              </ul>
            </div>
          )}

          {pkg.transport === 'mesh' && pkg.instance_ed_pk && (
            <div className="text-xs">
              <div className="text-adv-gray text-[10px] uppercase tracking-wider">
                Instance identity pinned by phone
              </div>
              <div className="mt-1 space-y-1 font-mono text-[10px] text-adv-gray">
                <div>ed_pk: {pkg.instance_ed_pk.slice(0, 32)}…</div>
                <div>x_pk:  {pkg.instance_x_pk?.slice(0, 32)}…</div>
                <div>sig:   {pkg.binding_sig?.slice(0, 32)}…</div>
              </div>
            </div>
          )}

          {pkg.confirmation_code && (
            <div className="rounded-lg border border-adv-gold/40 bg-adv-gold/10 p-3 text-center">
              <div className="text-[10px] uppercase tracking-wider text-adv-gold">
                Confirmation code (read aloud)
              </div>
              <div className="mt-1 font-mono text-2xl font-bold tracking-widest text-adv-gold">
                {pkg.confirmation_code}
              </div>
              <div className="mt-1 text-[11px] text-adv-gray">
                Phone user types this code after scanning
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Invitations Tab ──────────────────────────────────────────────────────────

function InvitationsTab({ orgId }: { orgId: string }) {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ label: '', invitation_type: 'multi', max_uses: 50, expires_in_hours: 168 });
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [qrId, setQrId] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setInvitations(await api.get(`/orgs/${orgId}/invitations`));
    } catch {}
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    try {
      await api.post(`/orgs/${orgId}/invitations`, form);
      setShowForm(false);
      setForm({ label: '', invitation_type: 'multi', max_uses: 50, expires_in_hours: 168 });
      load();
    } catch {}
  }

  function copyToken(id: string, token: string) {
    navigator.clipboard.writeText(token);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  // L1: Generate QR code data URL on demand
  async function toggleQr(id: string, token: string) {
    if (qrId === id) { setQrId(null); setQrDataUrl(null); return; }
    try {
      const QRCode = await import('qrcode');
      // Deep link format: anton://join?server=<origin>&token=<code>
      // Also works as HTTPS fallback: <origin>/app/?join=<token>
      const serverUrl = window.location.origin;
      const deepLink = `anton://join?server=${encodeURIComponent(serverUrl)}&token=${token}`;
      const dataUrl = await QRCode.toDataURL(deepLink, { width: 250, margin: 1, color: { dark: '#2DD4A8', light: '#0B1426' } });
      setQrId(id);
      setQrDataUrl(dataUrl);
    } catch {
      setQrId(null);
      setQrDataUrl(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-sm font-semibold text-adv-off-white flex items-center gap-2">
          <Key className="h-4 w-4 text-adv-teal" />
          Invitations ({invitations.length})
        </h2>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Generate Invitation
        </button>
      </div>

      {showForm && (
        <div className="rounded-lg border border-adv-teal/30 bg-adv-card p-4 space-y-3">
          <input
            value={form.label}
            onChange={(e) => setForm(f => ({ ...f, label: e.target.value }))}
            placeholder="Label (e.g. Spring 2026 intake)"
            className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none"
          />
          <div className="grid grid-cols-3 gap-3">
            <select
              value={form.invitation_type}
              onChange={(e) => setForm(f => ({ ...f, invitation_type: e.target.value }))}
              className="rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
            >
              <option value="single">Single Use</option>
              <option value="multi">Multi Use</option>
              <option value="permanent">Permanent</option>
            </select>
            <input
              type="number"
              value={form.max_uses}
              onChange={(e) => setForm(f => ({ ...f, max_uses: parseInt(e.target.value) || 1 }))}
              placeholder="Max uses"
              className="rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
            />
            <input
              type="number"
              value={form.expires_in_hours}
              onChange={(e) => setForm(f => ({ ...f, expires_in_hours: parseInt(e.target.value) || 168 }))}
              placeholder="Expires in hours"
              className="rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} className="rounded-lg bg-adv-teal px-4 py-1.5 text-xs font-medium text-adv-dark">Generate</button>
            <button onClick={() => setShowForm(false)} className="rounded-lg bg-adv-dark px-4 py-1.5 text-xs text-adv-gray">Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {invitations.map(inv => {
          const expired = inv.expires_at && new Date(inv.expires_at) < new Date();
          const exhausted = inv.invitation_type !== 'permanent' && inv.used_count >= inv.max_uses;
          return (
            <div key={inv.id} className="flex items-center justify-between rounded-lg border border-border bg-adv-card px-4 py-3">
              <div className="flex items-center gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-mono font-bold text-adv-teal">{inv.token}</code>
                    <button onClick={() => copyToken(inv.id, inv.token)} className="text-adv-gray hover:text-adv-teal transition-colors">
                      {copiedId === inv.id ? <Check className="h-3.5 w-3.5 text-adv-green" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <div className="text-xs text-adv-gray mt-0.5">
                    {inv.label || 'No label'} — {inv.invitation_type} — {inv.used_count}/{inv.max_uses} used
                    {expired && <span className="text-adv-red ml-2">Expired</span>}
                    {exhausted && <span className="text-adv-gold ml-2">Exhausted</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => toggleQr(inv.id, inv.token)} className="p-1.5 rounded text-adv-gray hover:text-adv-teal transition-colors" title="Show QR Code">
                  <QrCode className="h-3.5 w-3.5" />
                </button>
                <button onClick={async () => { await api.del(`/invitations/${inv.id}`); load(); }}
                  className="p-1.5 rounded text-adv-gray hover:text-adv-red transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {qrId === inv.id && qrDataUrl && (
                <div className="col-span-full mt-3 flex flex-col items-center gap-3 rounded-xl border border-border bg-adv-dark p-4">
                  <img src={qrDataUrl} alt={`QR code for ${inv.token}`} className="rounded-lg" width={250} height={250} />
                  <p className="text-xs text-adv-gray text-center">Scan this QR code with the ANTON Companion app</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        const link = `anton://join?server=${encodeURIComponent(window.location.origin)}&token=${inv.token}`;
                        navigator.clipboard.writeText(link);
                      }}
                      className="rounded-lg bg-adv-card px-3 py-1.5 text-xs text-adv-gray hover:text-adv-teal transition"
                    >
                      Copy Link
                    </button>
                    <button
                      onClick={() => {
                        const link = `anton://join?server=${encodeURIComponent(window.location.origin)}&token=${inv.token}`;
                        if (navigator.share) navigator.share({ title: 'Join ANTON', text: `Join our organisation on ANTON`, url: link });
                        else navigator.clipboard.writeText(link);
                      }}
                      className="rounded-lg bg-adv-teal/10 px-3 py-1.5 text-xs text-adv-teal hover:bg-adv-teal/20 transition"
                    >
                      Share
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {invitations.length === 0 && <p className="text-center py-8 text-adv-gray text-sm">No invitations generated.</p>}
      </div>
    </div>
  );
}

// ── Users Tab ────────────────────────────────────────────────────────────────

function UsersTab({ orgId }: { orgId: string }) {
  const [users, setUsers] = useState<ConnectedUser[]>([]);

  const load = useCallback(async () => {
    try {
      setUsers(await api.get(`/orgs/${orgId}/users`));
    } catch {}
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  async function handleRemove(userId: string) {
    if (!confirm('Remove this user from the organisation?')) return;
    await api.del(`/orgs/${orgId}/users/${userId}`);
    load();
  }

  async function handleToggleStatus(userId: string, currentStatus: string) {
    const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
    await api.put(`/orgs/${orgId}/users/${userId}`, { status: newStatus });
    load();
  }

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-adv-off-white flex items-center gap-2">
        <Users className="h-4 w-4 text-adv-teal" />
        Connected Users ({users.length})
      </h2>

      {users.length === 0 ? (
        <p className="text-center py-8 text-adv-gray text-sm">No users connected to this organisation yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="pb-2 text-xs font-medium text-adv-gray">User</th>
                <th className="pb-2 text-xs font-medium text-adv-gray">Contact Hash</th>
                <th className="pb-2 text-xs font-medium text-adv-gray">Role</th>
                <th className="pb-2 text-xs font-medium text-adv-gray">Status</th>
                <th className="pb-2 text-xs font-medium text-adv-gray">Last Seen</th>
                <th className="pb-2 text-xs font-medium text-adv-gray">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b border-border/50">
                  <td className="py-2.5 text-adv-off-white">{u.display_name || 'Anonymous'}</td>
                  <td className="py-2.5 font-mono text-xs text-adv-gray">{u.contact_hash}</td>
                  <td className="py-2.5 text-adv-gray">{u.role}</td>
                  <td className="py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${
                      u.status === 'active' ? 'bg-adv-green/10 text-adv-green' : 'bg-adv-red/10 text-adv-red'
                    }`}>
                      {u.status}
                    </span>
                  </td>
                  <td className="py-2.5 text-xs text-adv-gray">
                    {u.last_seen_at ? new Date(u.last_seen_at).toLocaleDateString() : 'Never'}
                  </td>
                  <td className="py-2.5 flex gap-1">
                    <button
                      onClick={() => handleToggleStatus(u.id, u.status)}
                      className="p-1 rounded text-adv-gray hover:text-adv-gold transition-colors"
                      title={u.status === 'active' ? 'Suspend' : 'Activate'}
                    >
                      <Shield className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleRemove(u.id)}
                      className="p-1 rounded text-adv-gray hover:text-adv-red transition-colors"
                      title="Remove"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Analytics Tab ────────────────────────────────────────────────────────────

function AnalyticsTab({ orgId }: { orgId: string }) {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [daily, setDaily] = useState<Array<{ date: string; total_queries: number; unique_users: number }>>([]);

  useEffect(() => {
    api.get(`/orgs/${orgId}/analytics/summary`).then(setSummary).catch(() => {});
    api.get(`/orgs/${orgId}/analytics?days=14`).then(setDaily).catch(() => {});
  }, [orgId]);

  return (
    <div className="space-y-6">
      <h2 className="text-sm font-semibold text-adv-off-white flex items-center gap-2">
        <BarChart2 className="h-4 w-4 text-adv-teal" />
        Analytics
      </h2>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Queries" value={summary.total_queries} />
          <StatCard label="Connected Users" value={summary.connected_users} />
          <StatCard label="Input Tokens" value={formatNumber(summary.total_input_tokens)} />
          <StatCard label="Output Tokens" value={formatNumber(summary.total_output_tokens)} />
        </div>
      )}

      {/* Daily breakdown */}
      {daily.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-adv-gray mb-3">Last 14 Days</h3>
          <div className="space-y-1">
            {daily.map(d => (
              <div key={d.date} className="flex items-center gap-3 text-xs">
                <span className="w-24 text-adv-gray">{d.date}</span>
                <div className="flex-1 h-4 bg-adv-dark rounded overflow-hidden">
                  <div
                    className="h-full bg-adv-teal/40 rounded"
                    style={{ width: `${Math.min(100, (d.total_queries / Math.max(...daily.map(x => x.total_queries), 1)) * 100)}%` }}
                  />
                </div>
                <span className="w-12 text-right text-adv-off-white font-mono">{d.total_queries}</span>
                <span className="w-8 text-right text-adv-gray">{d.unique_users}u</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!summary && daily.length === 0 && (
        <p className="text-center py-8 text-adv-gray text-sm">No analytics data yet. Usage will appear once companion app users start querying.</p>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-adv-card px-4 py-3">
      <div className="text-xs text-adv-gray">{label}</div>
      <div className="mt-1 text-lg font-bold text-adv-off-white">{value}</div>
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
