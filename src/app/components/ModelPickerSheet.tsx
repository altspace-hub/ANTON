/**
 * ModelPickerSheet — bottom sheet for picking the LLM the chat composer
 * routes to. Used by ChatPage (free chat + module chat both flow through
 * the same composer, so one picker covers both).
 *
 * Loads /api/app/org/:orgId/models on open, groups by tier, marks the
 * org default, persists the user's pick via setSelectedModel().
 */

import { useEffect, useState } from 'react';
import BottomSheet from './BottomSheet';
import { Spinner, Ico } from './ui';
import { listModels, type ModelOption } from '../services/models';

interface Props {
  open: boolean;
  orgId: string;
  selectedModelId: string | null;
  onClose: () => void;
  onSelect: (modelId: string | null, label: string) => void;
}

const TIER_LABELS: Record<'fast' | 'balanced' | 'top', string> = {
  fast: 'Fast',
  balanced: 'Balanced',
  top: 'Most capable',
};

const PROVIDER_BADGE: Record<string, string> = {
  anthropic: 'Anthropic',
  openai:    'OpenAI',
  mistral:   'Mistral',
  google:    'Google',
};

export default function ModelPickerSheet({ open, orgId, selectedModelId, onClose, onSelect }: Props): JSX.Element {
  const [models, setModels] = useState<ModelOption[]>([]);
  const [defaultModel, setDefaultModel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setErrMsg(null);
    listModels(orgId)
      .then(r => {
        if (cancelled) return;
        setModels(r.models);
        setDefaultModel(r.defaultModel);
      })
      .catch(e => { if (!cancelled) setErrMsg(e instanceof Error ? e.message : 'Failed to load models'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, orgId]);

  // Group models by tier so the sheet has a meaningful structure even
  // when several providers are configured at once.
  const grouped = (() => {
    const groups: Record<'fast' | 'balanced' | 'top', ModelOption[]> = { fast: [], balanced: [], top: [] };
    for (const m of models) groups[m.tier]?.push(m);
    return groups;
  })();

  return (
    <BottomSheet open={open} onClose={onClose} title="Choose model" maxHeight="80dvh">
      {loading && (
        <div className="flex justify-center py-10">
          <Spinner size="lg" />
        </div>
      )}
      {errMsg && (
        <div
          role="alert"
          className="rounded-[var(--radius-r2)] px-3 py-2 text-[0.75rem]"
          style={{ background: 'var(--color-red-dim)', color: 'var(--color-red)' }}
        >
          {errMsg}
        </div>
      )}
      {!loading && !errMsg && models.length === 0 && (
        <p className="px-1 py-6 text-center text-[0.8125rem]" style={{ color: 'var(--color-text-muted)' }}>
          No model providers configured on this instance. Add an API key
          (Anthropic, OpenAI, Mistral, or Google) in the desktop ANTON's
          Settings → Models.
        </p>
      )}
      {!loading && !errMsg && models.length > 0 && (
        <div className="flex flex-col gap-3">
          {(['top', 'balanced', 'fast'] as const).map(tier => {
            const items = grouped[tier];
            if (items.length === 0) return null;
            return (
              <div key={tier}>
                <div
                  className="mb-1.5 font-mono uppercase"
                  style={{ fontSize: '0.625rem', letterSpacing: '0.5px', color: 'var(--color-text-muted)' }}
                >
                  {TIER_LABELS[tier]}
                </div>
                <div
                  className="overflow-hidden rounded-[var(--radius-r2)]"
                  style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                >
                  {items.map((m, i) => {
                    const selected = selectedModelId === m.id || (!selectedModelId && defaultModel === m.id);
                    const isDefault = defaultModel === m.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => onSelect(m.id, m.label)}
                        className="flex w-full items-start text-left transition active:bg-[var(--color-surface-alt)]"
                        style={{
                          gap: 12,
                          padding: '12px 14px',
                          borderTop: i > 0 ? '1px solid var(--color-border-soft)' : 'none',
                          background: selected ? 'var(--color-accent-soft)' : 'transparent',
                        }}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              style={{
                                fontSize: '0.875rem',
                                fontWeight: 600,
                                color: 'var(--color-text)',
                                letterSpacing: '-0.1px',
                              }}
                            >
                              {m.label}
                            </span>
                            {isDefault && (
                              <span
                                className="rounded-full px-1.5 py-0.5 font-mono uppercase"
                                style={{
                                  fontSize: '0.5625rem',
                                  letterSpacing: '0.4px',
                                  background: 'var(--color-text-faint)',
                                  color: 'var(--color-surface)',
                                }}
                              >
                                Default
                              </span>
                            )}
                          </div>
                          <div
                            className="mt-0.5 text-[11.5px]"
                            style={{ color: 'var(--color-text-muted)' }}
                          >
                            {PROVIDER_BADGE[m.provider] ?? m.provider} · {m.description}
                          </div>
                        </div>
                        {selected && (
                          <span
                            className="mt-0.5 flex-shrink-0"
                            style={{ color: 'var(--color-accent)' }}
                          >
                            <Ico name="check" size={16} />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Reset to org default — useful when the user wants to stop
              overriding and let the instance owner's choice take effect. */}
          {selectedModelId && (
            <button
              onClick={() => onSelect(null, 'Default')}
              className="mt-1 self-start text-[0.75rem] underline"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Use org default ({defaultModel || '—'})
            </button>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
