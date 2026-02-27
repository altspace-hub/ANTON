/**
 * EngagementClientIntelligence.tsx
 * Phase 2a: Client Intelligence
 * Build a structured profile of who the client is.
 */

import { useState, useEffect } from 'react';
import { Users, ChevronRight, Plus, Trash2, Building, Globe, Shield, AlertTriangle } from 'lucide-react';
import { getAuthHeader } from '@/lib/api';
import type { EngagementData, ClientIntelligence } from '@/pages/EngagementWorkspacePage';

interface Props {
  engagement: EngagementData;
  onUpdate: (updates: Partial<EngagementData>) => void;
  onNext: () => void;
  onReload: () => void;
}

const ENGAGEMENT_TRIGGERS = ['New regulation', 'Audit finding', 'Strategic initiative', 'Incident response', 'Regulatory enquiry', 'Board directive', 'Internal review'];
const MATURITY_SIGNALS = ['Proactive — ahead of requirement', 'Reactive — responding to finding', 'Compliance-driven', 'Risk-driven', 'Unknown'];

export default function EngagementClientIntelligence({ engagement, onUpdate, onNext, onReload }: Props) {
  const existing = engagement.client_intelligence;

  const [form, setForm] = useState({
    client_name: existing?.client_name || engagement.client_name || '',
    division_department: existing?.division_department || '',
    region_jurisdiction: existing?.region_jurisdiction || '',
    products_in_scope: existing ? tryParse(existing.products_in_scope, []) : [],
    regulatory_supervisors: existing ? tryParse(existing.regulatory_supervisors, []) : [],
    recent_regulatory_history: existing ? tryParse(existing.recent_regulatory_history, []) : [],
    business_model_description: existing?.business_model_description || '',
    organisational_context: (existing as Record<string, string> | null)?.organisational_context || '',
    engagement_trigger: existing?.engagement_trigger || '',
    client_maturity_signal: existing?.client_maturity_signal || '',
    sensitivities: existing?.sensitivities || '',
  });

  const [saving, setSaving] = useState(false);
  const [newSupervisor, setNewSupervisor] = useState('');
  const [newProduct, setNewProduct] = useState('');
  const [newHistoryItem, setNewHistoryItem] = useState('');

  function update(key: string, value: unknown) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function save() {
    setSaving(true);
    try {
      await fetch(`/api/engagements/${engagement.id}/client-intelligence`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ ...form, source_channels: ['user_input'] }),
      });
      onReload();
    } finally {
      setSaving(false);
    }
  }

  async function saveAndContinue() {
    await save();
    onNext();
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-adv-teal mb-1">Phase 2a</p>
        <h2 className="text-xl font-bold text-adv-white">Client Intelligence</h2>
        <p className="mt-1 text-sm text-adv-gray">
          Build a structured understanding of who the client is. This context is injected into every execution step so ANTON's outputs reflect the client's actual business, not generic assumptions.
        </p>
      </div>

      {/* Entity & Structure */}
      <Section title="Entity & Structure" icon={Building}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Client name" value={form.client_name} onChange={v => update('client_name', v)} placeholder="e.g. Nordea Bank Abp" />
          <Field label="Division / Department" value={form.division_department} onChange={v => update('division_department', v)} placeholder="e.g. Group Compliance" />
        </div>
        <Field label="Business model description" value={form.business_model_description} onChange={v => update('business_model_description', v)} placeholder="e.g. Universal bank serving retail, corporate, and private banking customers across Nordics and Baltics" multiline />
        <Field label="Organisational context" value={form.organisational_context} onChange={v => update('organisational_context', v)} placeholder="e.g. New Chief Compliance Officer appointed Q1 2026, ongoing restructuring in compliance function" multiline />
      </Section>

      {/* Jurisdiction & Regulatory */}
      <Section title="Jurisdiction & Regulatory" icon={Globe}>
        <Field label="Region / Jurisdiction" value={form.region_jurisdiction} onChange={v => update('region_jurisdiction', v)} placeholder="e.g. Headquartered in Finland, operates across Nordics and Baltics, supervised by ECB/SSM" />

        {/* Supervisory authorities */}
        <div>
          <label className="block text-xs text-adv-gray mb-2">Supervisory authorities</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {(form.regulatory_supervisors as string[]).map((s, i) => (
              <span key={i} className="flex items-center gap-1 text-xs bg-adv-card border border-border rounded-full px-2 py-1 text-adv-off-white">
                {s}
                <button onClick={() => update('regulatory_supervisors', (form.regulatory_supervisors as string[]).filter((_, j) => j !== i))} className="text-adv-gray-med hover:text-adv-red transition-colors">
                  <Trash2 className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={newSupervisor}
              onChange={e => setNewSupervisor(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && newSupervisor.trim()) { update('regulatory_supervisors', [...(form.regulatory_supervisors as string[]), newSupervisor.trim()]); setNewSupervisor(''); }}}
              placeholder="Add supervisor (e.g. ECB/SSM, Finansinspektionen SE)"
              className="flex-1 bg-adv-dark-2 border border-border rounded-lg px-3 py-1.5 text-sm text-adv-off-white placeholder-adv-gray-med focus:outline-none focus:border-adv-teal"
            />
            <button
              onClick={() => { if (newSupervisor.trim()) { update('regulatory_supervisors', [...(form.regulatory_supervisors as string[]), newSupervisor.trim()]); setNewSupervisor(''); }}}
              className="px-3 py-1.5 rounded-lg bg-adv-card border border-border text-xs text-adv-gray hover:text-adv-teal hover:border-adv-teal transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Products in scope */}
        <div>
          <label className="block text-xs text-adv-gray mb-2">Products / Services in scope</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {(form.products_in_scope as string[]).map((p, i) => (
              <span key={i} className="flex items-center gap-1 text-xs bg-adv-card border border-border rounded-full px-2 py-1 text-adv-off-white">
                {p}
                <button onClick={() => update('products_in_scope', (form.products_in_scope as string[]).filter((_, j) => j !== i))} className="text-adv-gray-med hover:text-adv-red transition-colors">
                  <Trash2 className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={newProduct}
              onChange={e => setNewProduct(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && newProduct.trim()) { update('products_in_scope', [...(form.products_in_scope as string[]), newProduct.trim()]); setNewProduct(''); }}}
              placeholder="Add product (e.g. Retail deposits, Consumer lending)"
              className="flex-1 bg-adv-dark-2 border border-border rounded-lg px-3 py-1.5 text-sm text-adv-off-white placeholder-adv-gray-med focus:outline-none focus:border-adv-teal"
            />
            <button
              onClick={() => { if (newProduct.trim()) { update('products_in_scope', [...(form.products_in_scope as string[]), newProduct.trim()]); setNewProduct(''); }}}
              className="px-3 py-1.5 rounded-lg bg-adv-card border border-border text-xs text-adv-gray hover:text-adv-teal hover:border-adv-teal transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </Section>

      {/* Engagement Context */}
      <Section title="Engagement Context" icon={AlertTriangle}>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-adv-gray mb-1">Engagement trigger</label>
            <select
              value={form.engagement_trigger}
              onChange={e => update('engagement_trigger', e.target.value)}
              className="w-full bg-adv-dark-2 border border-border rounded-lg px-3 py-2 text-sm text-adv-off-white focus:outline-none focus:border-adv-teal"
            >
              <option value="">Select trigger...</option>
              {ENGAGEMENT_TRIGGERS.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-adv-gray mb-1">Client maturity signal</label>
            <select
              value={form.client_maturity_signal}
              onChange={e => update('client_maturity_signal', e.target.value)}
              className="w-full bg-adv-dark-2 border border-border rounded-lg px-3 py-2 text-sm text-adv-off-white focus:outline-none focus:border-adv-teal"
            >
              <option value="">Select signal...</option>
              {MATURITY_SIGNALS.map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
        </div>
        <Field label="Known sensitivities" value={form.sensitivities} onChange={v => update('sensitivities', v)} placeholder="e.g. Baltic operations historically scrutinised, Danske Bank fallout increased Nordic AML focus" multiline />

        {/* Recent regulatory history */}
        <div>
          <label className="block text-xs text-adv-gray mb-2">Recent regulatory history</label>
          <div className="space-y-1 mb-2">
            {(form.recent_regulatory_history as string[]).map((h, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-adv-gray bg-adv-card border border-border rounded px-3 py-2">
                <span className="flex-1">{h}</span>
                <button onClick={() => update('recent_regulatory_history', (form.recent_regulatory_history as string[]).filter((_, j) => j !== i))} className="text-adv-gray-med hover:text-adv-red shrink-0">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={newHistoryItem}
              onChange={e => setNewHistoryItem(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && newHistoryItem.trim()) { update('recent_regulatory_history', [...(form.recent_regulatory_history as string[]), newHistoryItem.trim()]); setNewHistoryItem(''); }}}
              placeholder="e.g. ECB thematic AML review 2024, Danish FSA inspection Q3 2025"
              className="flex-1 bg-adv-dark-2 border border-border rounded-lg px-3 py-1.5 text-sm text-adv-off-white placeholder-adv-gray-med focus:outline-none focus:border-adv-teal"
            />
            <button
              onClick={() => { if (newHistoryItem.trim()) { update('recent_regulatory_history', [...(form.recent_regulatory_history as string[]), newHistoryItem.trim()]); setNewHistoryItem(''); }}}
              className="px-3 py-1.5 rounded-lg bg-adv-card border border-border text-xs text-adv-gray hover:text-adv-teal hover:border-adv-teal transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </Section>

      {/* Action buttons */}
      <div className="flex justify-end gap-3 pt-2">
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 rounded-lg border border-border text-sm text-adv-gray hover:text-adv-off-white transition-colors"
        >
          Save draft
        </button>
        <button
          onClick={saveAndContinue}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-adv-teal text-adv-dark text-sm font-medium hover:bg-adv-teal-dark disabled:opacity-50 transition-colors"
        >
          Save & Continue
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function tryParse(val: string | undefined | null, fallback: unknown) {
  try { return val ? JSON.parse(val) : fallback; } catch { return fallback; }
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="bg-adv-card border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2 pb-1 border-b border-border">
        <Icon className="h-4 w-4 text-adv-teal" />
        <h3 className="text-sm font-semibold text-adv-off-white">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Field({ label, value, onChange, placeholder, multiline = false }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean;
}) {
  const cls = "w-full bg-adv-dark-2 border border-border rounded-lg px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray-med focus:outline-none focus:border-adv-teal";
  return (
    <div>
      <label className="block text-xs text-adv-gray mb-1">{label}</label>
      {multiline ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={2} className={`${cls} resize-none`} />
      ) : (
        <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={cls} />
      )}
    </div>
  );
}
