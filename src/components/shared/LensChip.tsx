/**
 * LensChip — "Answering as: Sanctions Advisory — change".
 *
 * Open chat's one visible sign of the module catalogue: the expert lens the
 * router picked for this conversation, changeable in place. Picking a lens
 * sends that module's id and area with each turn so its system prompt, area
 * context and skills shape the answer; the session stays an open chat.
 */
import { useEffect, useRef, useState } from 'react';
import { Sparkles, X, Loader2 } from 'lucide-react';
import { suggestModuleLens, type ModuleLensSuggestion } from '@/lib/api';
import type { OpenChatLens } from '@/stores/useConfigStore';

interface Props {
  lens: OpenChatLens | null;
  /** The router is choosing a lens for the first turn. */
  busy: boolean;
  disabled?: boolean;
  onPick: (lens: OpenChatLens) => void;
  /** Answer without any module lens. */
  onClear: () => void;
}

export default function LensChip({ lens, busy, disabled, onPick, onClear }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<ModuleLensSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Debounced search over the catalogue while the picker is open.
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 3) { setMatches([]); return; }
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setSearching(true);
      try {
        setMatches(await suggestModuleLens(q, ac.signal));
      } catch {
        // aborted or offline — leave the list as it is
      } finally {
        if (abortRef.current === ac) setSearching(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [query, open]);

  const close = () => { setOpen(false); setQuery(''); setMatches([]); };

  return (
    <div className="relative mb-2 flex items-center gap-2 text-xs">
      <Sparkles className="h-3.5 w-3.5 shrink-0 text-adv-teal" />
      {busy ? (
        <span className="flex items-center gap-1.5 text-adv-gray">
          <Loader2 className="h-3 w-3 animate-spin" /> Choosing an expert lens…
        </span>
      ) : lens ? (
        <span className="text-adv-gray">
          Answering as{' '}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            disabled={disabled}
            title={lens.reason || 'Change the expert lens'}
            className="font-medium text-adv-off-white underline-offset-2 hover:text-adv-teal hover:underline disabled:opacity-60"
          >
            {lens.label}
          </button>
        </span>
      ) : (
        <span className="text-adv-gray">
          No expert lens —{' '}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            disabled={disabled}
            className="text-adv-teal underline-offset-2 hover:underline disabled:opacity-60"
          >
            choose one
          </button>
        </span>
      )}
      {lens && !busy && (
        <button
          type="button"
          onClick={onClear}
          disabled={disabled}
          title="Answer without a module lens"
          className="text-adv-gray hover:text-adv-off-white disabled:opacity-60"
        >
          <X className="h-3 w-3" />
        </button>
      )}

      {open && (
        <div className="absolute left-0 top-6 z-20 w-96 max-w-[90vw] rounded-xl border border-border bg-adv-card p-3 shadow-lg">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') close(); }}
            placeholder="Describe the work — e.g. review a contract clause"
            className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none"
          />
          <div className="mt-2 max-h-56 overflow-y-auto">
            {searching && (
              <div className="flex items-center gap-2 px-1 py-2 text-adv-gray">
                <Loader2 className="h-3 w-3 animate-spin" /> Searching the module catalogue…
              </div>
            )}
            {!searching && matches.map((m) => (
              <button
                key={m.moduleId}
                type="button"
                onClick={() => { onPick({ moduleId: m.moduleId, areaId: m.areaId, label: m.label, reason: m.reason }); close(); }}
                className="block w-full rounded-lg px-2 py-2 text-left hover:bg-adv-dark-2"
              >
                <div className="font-medium text-adv-off-white">{m.label}</div>
                {m.reason && <div className="text-adv-gray">{m.reason}</div>}
              </button>
            ))}
            {!searching && query.trim().length >= 3 && matches.length === 0 && (
              <div className="px-1 py-2 text-adv-gray">No matching module — try other words.</div>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
            <button type="button" onClick={() => { onClear(); close(); }} className="text-adv-gray hover:text-adv-off-white">
              Answer without a lens
            </button>
            <button type="button" onClick={close} className="text-adv-gray hover:text-adv-off-white">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
