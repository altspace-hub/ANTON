/**
 * OrgContextPanel.tsx
 * Panel for configuring persistent organisational context (prompt layer 2a).
 * Accessible from Settings and from the module sidebar.
 */

import React, { useState, useEffect } from 'react';
import { Building2, Save, ChevronDown, ChevronUp, Plus, X } from 'lucide-react';

interface OrgContext {
  org_name: string | null;
  org_type: string | null;
  jurisdiction: string | null;
  regulatory_perimeter: string[];
  risk_appetite: string | null;
  key_systems: string[];
  key_relationships: string[];
  current_priorities: string[];
  preferred_language: string;
  custom_context: string | null;
}

const ORG_TYPES = ['Bank', 'Payment Institution', 'Investment Firm', 'Insurance', 'Fund Manager', 'Crypto VASP', 'Fintech', 'Other'];

export function OrgContextPanel() {
  const [context, setContext] = useState<OrgContext>({
    org_name: null, org_type: null, jurisdiction: null,
    regulatory_perimeter: [], risk_appetite: null,
    key_systems: [], key_relationships: [], current_priorities: [],
    preferred_language: 'en', custom_context: null,
  });
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  // Temp input states for array fields
  const [newPerimeter, setNewPerimeter] = useState('');
  const [newSystem, setNewSystem] = useState('');
  const [newRelationship, setNewRelationship] = useState('');
  const [newPriority, setNewPriority] = useState('');

  useEffect(() => {
    loadContext();
  }, []);

  async function loadContext() {
    setLoading(true);
    try {
      const res = await fetch('/api/org-context');
      if (res.ok) {
        const data = await res.json() as { context: OrgContext };
        setContext(data.context);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await fetch('/api/org-context', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(context),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  function addToArray(field: keyof OrgContext, value: string, setValue: (v: string) => void) {
    if (!value.trim()) return;
    setContext((prev) => ({
      ...prev,
      [field]: [...(prev[field] as string[]), value.trim()],
    }));
    setValue('');
  }

  function removeFromArray(field: keyof OrgContext, index: number) {
    setContext((prev) => ({
      ...prev,
      [field]: (prev[field] as string[]).filter((_, i) => i !== index),
    }));
  }

  const hasContent = context.org_name || context.jurisdiction || context.current_priorities.length > 0;

  return (
    <div className="bg-adv-card border border-white/10 rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center justify-between p-3 text-left hover:bg-white/5 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-adv-teal" />
          <span className="text-sm font-medium text-adv-off-white">Organisation Context</span>
          {hasContent && (
            <span className="text-xs text-adv-teal bg-adv-teal/10 px-1.5 py-0.5 rounded">Active</span>
          )}
          {!hasContent && (
            <span className="text-xs text-adv-gray">Not configured</span>
          )}
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-adv-gray" /> : <ChevronDown className="w-4 h-4 text-adv-gray" />}
      </button>

      {expanded && (
        <div className="border-t border-white/10 p-4 space-y-4">
          <p className="text-xs text-adv-gray">
            This context is injected into every Claude prompt. It helps Claude tailor analysis to your specific organisation.
          </p>

          {loading ? (
            <div className="animate-pulse space-y-2">
              <div className="h-8 bg-white/10 rounded" />
              <div className="h-8 bg-white/10 rounded" />
            </div>
          ) : (
            <>
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-adv-gray mb-1">Organisation Name</label>
                  <input
                    type="text"
                    value={context.org_name ?? ''}
                    onChange={(e) => setContext((p) => ({ ...p, org_name: e.target.value || null }))}
                    placeholder="e.g. Nordea Bank AB"
                    className="w-full bg-adv-dark border border-white/10 rounded px-2.5 py-1.5 text-sm text-adv-off-white placeholder:text-adv-gray/50 focus:outline-none focus:border-adv-teal/50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-adv-gray mb-1">Organisation Type</label>
                  <select
                    value={context.org_type ?? ''}
                    onChange={(e) => setContext((p) => ({ ...p, org_type: e.target.value || null }))}
                    className="w-full bg-adv-dark border border-white/10 rounded px-2.5 py-1.5 text-sm text-adv-off-white focus:outline-none focus:border-adv-teal/50"
                  >
                    <option value="">Select type…</option>
                    {ORG_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-adv-gray mb-1">Jurisdiction(s)</label>
                <input
                  type="text"
                  value={context.jurisdiction ?? ''}
                  onChange={(e) => setContext((p) => ({ ...p, jurisdiction: e.target.value || null }))}
                  placeholder="e.g. Sweden, Finland, EU"
                  className="w-full bg-adv-dark border border-white/10 rounded px-2.5 py-1.5 text-sm text-adv-off-white placeholder:text-adv-gray/50 focus:outline-none focus:border-adv-teal/50"
                />
              </div>

              {/* Regulatory Perimeter */}
              <ArrayField
                label="Regulatory Perimeter"
                values={context.regulatory_perimeter}
                newValue={newPerimeter}
                placeholder="e.g. AMLR, MiCA, DORA, PSD2"
                onAdd={() => addToArray('regulatory_perimeter', newPerimeter, setNewPerimeter)}
                onRemove={(i) => removeFromArray('regulatory_perimeter', i)}
                onNewValueChange={setNewPerimeter}
              />

              {/* Risk Appetite */}
              <div>
                <label className="block text-xs text-adv-gray mb-1">Risk Appetite Statement</label>
                <textarea
                  value={context.risk_appetite ?? ''}
                  onChange={(e) => setContext((p) => ({ ...p, risk_appetite: e.target.value || null }))}
                  placeholder="e.g. Conservative — zero tolerance for sanctions violations, low tolerance for AML control gaps…"
                  rows={2}
                  className="w-full bg-adv-dark border border-white/10 rounded px-2.5 py-1.5 text-sm text-adv-off-white placeholder:text-adv-gray/50 focus:outline-none focus:border-adv-teal/50 resize-none"
                />
              </div>

              {/* Current Priorities */}
              <ArrayField
                label="Current Strategic Priorities"
                values={context.current_priorities}
                newValue={newPriority}
                placeholder="e.g. AMLR compliance programme by Q4 2026"
                onAdd={() => addToArray('current_priorities', newPriority, setNewPriority)}
                onRemove={(i) => removeFromArray('current_priorities', i)}
                onNewValueChange={setNewPriority}
              />

              {/* Key Systems */}
              <ArrayField
                label="Key Systems"
                values={context.key_systems}
                newValue={newSystem}
                placeholder="e.g. SAP, Finastra, Oracle FCCM, Temenos"
                onAdd={() => addToArray('key_systems', newSystem, setNewSystem)}
                onRemove={(i) => removeFromArray('key_systems', i)}
                onNewValueChange={setNewSystem}
              />

              {/* Key Relationships */}
              <ArrayField
                label="Key Relationships / Counterparties"
                values={context.key_relationships}
                newValue={newRelationship}
                placeholder="e.g. ECB, Finansinspektionen, PRA"
                onAdd={() => addToArray('key_relationships', newRelationship, setNewRelationship)}
                onRemove={(i) => removeFromArray('key_relationships', i)}
                onNewValueChange={setNewRelationship}
              />

              {/* Custom Context */}
              <div>
                <label className="block text-xs text-adv-gray mb-1">Additional Context</label>
                <textarea
                  value={context.custom_context ?? ''}
                  onChange={(e) => setContext((p) => ({ ...p, custom_context: e.target.value || null }))}
                  placeholder="Any other context that should inform Claude's analysis…"
                  rows={2}
                  className="w-full bg-adv-dark border border-white/10 rounded px-2.5 py-1.5 text-sm text-adv-off-white placeholder:text-adv-gray/50 focus:outline-none focus:border-adv-teal/50 resize-none"
                />
              </div>

              {/* Save button */}
              <button
                onClick={handleSave}
                disabled={saving}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  saved
                    ? 'bg-adv-green/20 text-adv-green'
                    : 'bg-adv-teal text-adv-dark hover:bg-adv-teal-dark'
                } disabled:opacity-50`}
              >
                <Save className="w-4 h-4" />
                {saved ? 'Saved!' : saving ? 'Saving…' : 'Save Organisation Context'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ArrayField({
  label, values, newValue, placeholder, onAdd, onRemove, onNewValueChange,
}: {
  label: string;
  values: string[];
  newValue: string;
  placeholder: string;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onNewValueChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs text-adv-gray mb-1">{label}</label>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {values.map((v, i) => (
            <span key={i} className="flex items-center gap-1 text-xs bg-white/5 border border-white/10 rounded px-2 py-1 text-adv-off-white">
              {v}
              <button onClick={() => onRemove(i)} className="text-adv-gray hover:text-adv-off-white ml-0.5">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          value={newValue}
          onChange={(e) => onNewValueChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onAdd()}
          placeholder={placeholder}
          className="flex-1 bg-adv-dark border border-white/10 rounded px-2.5 py-1.5 text-sm text-adv-off-white placeholder:text-adv-gray/50 focus:outline-none focus:border-adv-teal/50"
        />
        <button
          onClick={onAdd}
          className="p-1.5 bg-adv-teal/15 text-adv-teal rounded hover:bg-adv-teal/25 transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
