/**
 * TemplatesPickerScreen — pick an industry template and bulk-load its
 * items into the catalogue.
 *
 *   Step 1 (this screen, list mode): show the 40 templates grouped by
 *     6 buckets (Food & Drink, Beauty & Wellness, …). Tap one to
 *     drill into its preview.
 *
 *   Step 2 (this screen, preview mode): show the template's segments
 *     and items. Buttons:
 *       — "Add to my catalogue" (append; existing items kept)
 *       — "Replace my catalogue" (wipe + load template)
 *     Replace prompts for confirmation because it's destructive.
 *
 * After load, the caller (App.tsx) navigates back to ItemsManageScreen
 * so the merchant can curate from there.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import PrimaryButton from '../../components/PrimaryButton';
import type {
  IndustryTemplate,
} from '../../data/industry-templates';
import { loadIndustryTemplate } from '../../services/items';

// Mirror of the data file's TEMPLATE_GROUPS export — kept here as a lite
// constant so the 585-item template blob can stay in its own chunk.
const TEMPLATE_GROUPS_LITE: Array<{
  id: IndustryTemplate['group'];
  label: string;
  emoji: string;
}> = [
  { id: 'food-drink',       label: 'Food & Drink',      emoji: '🍽️' },
  { id: 'beauty-wellness',  label: 'Beauty & Wellness', emoji: '💆' },
  { id: 'trades',           label: 'Trades',            emoji: '🔧' },
  { id: 'auto-mobility',    label: 'Auto & Mobility',   emoji: '🚗' },
  { id: 'retail',           label: 'Retail',            emoji: '🛍️' },
  { id: 'professional',     label: 'Professional',      emoji: '💼' },
];

interface Props {
  onBack: () => void;
  /** Called after the merchant successfully loaded a template — the
   *  parent navigates them back to the Items management screen. */
  onLoaded: () => void;
}

export default function TemplatesPickerScreen({ onBack, onLoaded }: Props) {
  const { t } = useTranslation();
  const [templates, setTemplates] = useState<IndustryTemplate[]>([]);
  const [selected, setSelected] = useState<IndustryTemplate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dynamic-import the 585-item template blob on mount. Keeps the main
  // bundle slim — this 50 kB chunk only ships when the merchant opens
  // the picker.
  useEffect(() => {
    void import('../../data/industry-templates').then((mod) => {
      setTemplates(mod.INDUSTRY_TEMPLATES);
    });
  }, []);

  const byGroup = useMemo(() => {
    const m = new Map<string, IndustryTemplate[]>();
    for (const tpl of templates) {
      const arr = m.get(tpl.group) ?? [];
      arr.push(tpl);
      m.set(tpl.group, arr);
    }
    return m;
  }, [templates]);

  async function loadTemplate(mode: 'append' | 'replace') {
    if (!selected) return;
    if (mode === 'replace') {
      const confirmed = confirm(t('templates.confirmReplace',
        'Replace your current catalogue with the "{{name}}" template? Existing items will be removed.',
        { name: selected.label }));
      if (!confirmed) return;
    }
    setError(null);
    setBusy(true);
    try {
      await loadIndustryTemplate(selected.id, mode);
      onLoaded();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // ── Preview mode ───────────────────────────────────────────
  if (selected) {
    const itemCount = selected.segments.reduce((n, s) => n + s.items.length, 0);
    return (
      <div className="flex flex-col h-full overflow-y-auto safe-top safe-bottom"
           style={{ backgroundColor: 'var(--color-bg)' }}>
        <div className="flex flex-col flex-1 px-6 pb-6">
          <div className="flex items-center gap-3 -ml-2 mb-5">
            <button type="button" onClick={() => setSelected(null)}
                    className="p-2 rounded-lg"
                    aria-label={t('common.back', 'Back')}
                    style={{ color: 'var(--color-text-muted)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2"
                      strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <h2 className="text-xl font-bold flex items-center gap-2"
                style={{ color: 'var(--color-text)' }}>
              <span style={{ fontSize: 24 }}>{selected.emoji}</span>
              {selected.label}
            </h2>
          </div>

          <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>
            {selected.tagline}
          </p>

          <div className="rounded-xl p-3 mb-4 text-xs"
               style={{ backgroundColor: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text-muted)' }}>
            {t('templates.summary',
              '{{count}} items across {{segments}} segments. Every price and VAT rate is editable after loading.',
              { count: itemCount, segments: selected.segments.length })}
          </div>

          {/* Segment + item preview */}
          <div className="flex flex-col gap-3 mb-4">
            {selected.segments.map((seg) => (
              <div key={seg.label} className="rounded-xl p-3"
                   style={{ backgroundColor: 'var(--color-surface)',
                            border: '1px solid var(--color-border)' }}>
                <div className="text-xs font-bold uppercase tracking-wider mb-2"
                     style={{ color: 'var(--color-text-faint)' }}>
                  {seg.label} <span style={{ opacity: 0.6 }}>· {seg.items.length}</span>
                </div>
                <div className="flex flex-col gap-1">
                  {seg.items.map((item, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span style={{ color: 'var(--color-text)' }}>{item.name}</span>
                      <span style={{ color: 'var(--color-text-muted)' }}>
                        {item.priceSek} SEK · {item.vatRate}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {error && (
            <p className="text-xs mb-3" style={{ color: '#C0392B' }}>{error}</p>
          )}

          <PrimaryButton onClick={() => loadTemplate('append')}>
            {busy
              ? t('common.working', 'Working…')
              : t('templates.append', 'Add to my catalogue')}
          </PrimaryButton>
          <button type="button" onClick={() => loadTemplate('replace')} disabled={busy}
                  className="w-full py-3 mt-2 rounded-xl text-sm font-semibold"
                  style={{ backgroundColor: 'var(--color-surface)',
                           border: '1px solid var(--color-border)',
                           color: 'var(--color-text)',
                           opacity: busy ? 0.5 : 1 }}>
            {t('templates.replace', 'Replace my catalogue')}
          </button>
          <p className="text-xs mt-2 text-center"
             style={{ color: 'var(--color-text-faint)' }}>
            {t('templates.editAfterHint',
              'Edit, remove, or add to anything after loading.')}
          </p>
        </div>
      </div>
    );
  }

  // ── List mode (groups + templates) ──────────────────────────
  return (
    <div className="flex flex-col h-full overflow-y-auto safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="flex flex-col flex-1 px-6 pb-6">
        <div className="flex items-center gap-3 -ml-2 mb-5">
          <button type="button" onClick={onBack} className="p-2 rounded-lg"
                  aria-label={t('common.back', 'Back')}
                  style={{ color: 'var(--color-text-muted)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h2 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>
            {t('templates.title', 'Industry templates')}
          </h2>
        </div>

        <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>
          {t('templates.subtitle',
            'Pick a template close to what you sell. We load realistic items with sensible prices and VAT rates — then you edit them to match your business.')}
        </p>

        {templates.length === 0 && (
          <div className="rounded-xl p-6 text-center"
               style={{ backgroundColor: 'var(--color-surface)',
                        border: '1px solid var(--color-border)' }}>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              {t('common.loading', 'Loading…')}
            </p>
          </div>
        )}

        {TEMPLATE_GROUPS_LITE.map((group) => {
          const arr = byGroup.get(group.id) ?? [];
          if (arr.length === 0) return null;
          return (
            <div key={group.id} className="mb-4">
              <h3 className="text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2"
                  style={{ color: 'var(--color-text-faint)' }}>
                <span style={{ fontSize: 16 }}>{group.emoji}</span>
                {group.label}
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {arr.map((tpl) => (
                  <button key={tpl.id} type="button" onClick={() => setSelected(tpl)}
                          className="rounded-xl p-3 text-left flex flex-col gap-1"
                          style={{ backgroundColor: 'var(--color-surface)',
                                   border: '1px solid var(--color-border)',
                                   minHeight: 80 }}>
                    <span style={{ fontSize: 22 }}>{tpl.emoji}</span>
                    <div className="font-semibold text-sm"
                         style={{ color: 'var(--color-text)' }}>
                      {tpl.label}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}

        <p className="text-xs mt-2 text-center"
           style={{ color: 'var(--color-text-faint)' }}>
          {t('templates.footer', '40 templates · 585 starter items · all editable')}
        </p>
      </div>
    </div>
  );
}
