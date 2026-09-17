/**
 * ReportSheet — report one AI response for harmful or wrong content.
 *
 * Play requires an in-app reporting route for apps that generate content with
 * an LLM. The Companion app generates content on every screen that reaches
 * ChatPage — free chat, Work modules, and School mode — and had no such route.
 *
 * Two things here are deliberate and should not be "simplified":
 *
 *  1. Attaching the response is OFF by default, and the copy says where the
 *     report goes. Companion conversations routinely carry the user's
 *     confidential work; a reporting flow must not become a quieter way to
 *     ship it somewhere. The user decides, explicitly, each time.
 *
 *  2. The user's own prompt is never offered for attachment and never
 *     collected. It is the half of the exchange most likely to contain their
 *     material, and it is not what is being reported — the response is.
 *
 * Built on the app's own BottomSheet + Ico rather than importing Comm's
 * ReportSheet: these are separate Vite builds and Comm's sheet is bound to
 * i18next, which this build does not have.
 */

import { useEffect, useState } from 'react';
import BottomSheet from './BottomSheet';
import { Ico } from './ui';
import { REPORT_CATEGORIES, type ReportCategory } from '../services/reports';
import { reportStrings, type ReportStrings } from '../services/report-strings';

export interface ReportSubmission {
  category: ReportCategory;
  note: string;
  includeResponse: boolean;
}

interface Props {
  open: boolean;
  /** Model that produced the response, for the sub-heading. */
  modelLabel: string;
  /** The reported text, shown as a short preview so the user can confirm
   *  which turn they are flagging. Never leaves the device from here. */
  responsePreview?: string;
  /** BCP-47 tag from the paired identity; drives en/sv copy. */
  lang?: string | null;
  onCancel: () => void;
  onSubmit: (s: ReportSubmission) => void;
}

export default function ReportSheet({
  open, modelLabel, responsePreview, lang, onCancel, onSubmit,
}: Props): JSX.Element {
  const s = reportStrings(lang);
  const [category, setCategory] = useState<ReportCategory>('harmful');
  const [note, setNote] = useState('');
  const [includeResponse, setIncludeResponse] = useState(false);

  // Reset between openings. Without this, the "attach the response" tick
  // survives from the previous report and the NEXT report silently carries
  // text the user never agreed to attach for that turn.
  useEffect(() => {
    if (!open) return;
    setCategory('harmful');
    setNote('');
    setIncludeResponse(false);
  }, [open]);

  const label: Record<ReportCategory, keyof ReportStrings> = {
    harmful: 'catHarmful',
    hateful: 'catHateful',
    sexual: 'catSexual',
    inaccurate: 'catInaccurate',
    illegal: 'catIllegal',
    other: 'catOther',
  };

  return (
    <BottomSheet open={open} onClose={onCancel} title={s.title} maxHeight="88dvh">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          <Ico name="sparkles" size={12} color="var(--color-text-faint)" />
          <span>{s.answeredBy.replace('{{model}}', modelLabel)}</span>
        </div>

        {responsePreview && (
          <div
            className="max-h-24 overflow-y-auto rounded-[var(--radius-r2)] px-3 py-2 text-xs"
            style={{
              background: 'var(--color-surface-alt)',
              border: '1px solid var(--color-border-soft)',
              color: 'var(--color-text-muted)',
            }}
          >
            {responsePreview}
          </div>
        )}

        <div>
          <div
            className="mb-1.5 font-mono uppercase"
            style={{ fontSize: '0.6875rem', letterSpacing: '0.5px', color: 'var(--color-text-muted)' }}
          >
            {s.reason}
          </div>
          <div className="flex flex-col gap-1.5" role="radiogroup" aria-label={s.reason}>
            {REPORT_CATEGORIES.map((c) => {
              const selected = category === c;
              return (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setCategory(c)}
                  className="flex items-center gap-3 rounded-[var(--radius-r2)] px-3 text-left text-sm transition active:opacity-70"
                  style={{
                    minHeight: 44,
                    background: selected ? 'var(--color-accent-soft)' : 'var(--color-surface)',
                    border: `1px solid ${selected ? 'var(--color-accent)' : 'var(--color-border)'}`,
                    color: 'var(--color-text)',
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 14, height: 14, borderRadius: 7, flexShrink: 0,
                      border: `2px solid ${selected ? 'var(--color-accent)' : 'var(--color-border)'}`,
                      background: selected ? 'var(--color-accent)' : 'transparent',
                    }}
                  />
                  {s[label[c]]}
                </button>
              );
            })}
          </div>
        </div>

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={s.notePlaceholder}
          rows={3}
          className="w-full resize-none rounded-[var(--radius-r2)] px-3 py-2 text-sm focus:outline-none"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text)',
          }}
        />

        <label className="flex items-start gap-3 text-sm" style={{ color: 'var(--color-text)' }}>
          <input
            type="checkbox"
            checked={includeResponse}
            onChange={(e) => setIncludeResponse(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            {s.includeResponse}
            <span className="mt-0.5 block text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {s.includeResponseHint}
            </span>
          </span>
        </label>

        <p className="text-xs" style={{ color: 'var(--color-text-faint)' }}>
          {s.privacy}
        </p>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-[var(--radius-r2)] py-3 text-sm font-semibold transition active:opacity-70"
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-muted)',
            }}
          >
            {s.cancel}
          </button>
          <button
            type="button"
            onClick={() => onSubmit({ category, note: note.trim(), includeResponse })}
            className="flex-1 rounded-[var(--radius-r2)] py-3 text-sm font-bold transition active:opacity-70"
            style={{ background: 'var(--color-red)', color: '#fff' }}
          >
            {s.submit}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
