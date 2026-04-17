/**
 * CapturePage — the camera + share-target capture surface per spec §8.5.
 *
 * Three sources funnel here: camera, photo library, and OS share intent.
 * The user previews, optionally adds a note describing what to do with
 * the capture, and sends it to ANTON via the chat layer.
 */

import { useEffect, useState } from 'react';
import { captureFromCamera, captureFromLibrary, readSharedFromUrl, type Capture } from '../services/capture';
import { fetchWithAuth } from '../services/api';
import { tick, success, error as hapticError } from '../services/haptics';

interface Props {
  orgId: string;
  onSent: (sessionId: string | null) => void;
  onBack: () => void;
}

const INTENTS = [
  { value: 'analyse',      label: 'Analyse this document' },
  { value: 'summarise',    label: 'Summarise this' },
  { value: 'extract',      label: 'Extract key data' },
  { value: 'translate',    label: 'Translate this' },
  { value: 'ask',          label: 'Answer my question' },
];

export default function CapturePage({ orgId, onSent, onBack }: Props) {
  const [capture, setCapture] = useState<Capture | null>(null);
  const [intent, setIntent] = useState<string>('analyse');
  const [note, setNote] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Pick up an OS share-intent payload on mount
  useEffect(() => {
    const s = readSharedFromUrl();
    if (s) setCapture(s);
  }, []);

  async function pick(source: 'camera' | 'library'): Promise<void> {
    void tick();
    setErr(null);
    try {
      const c = source === 'camera' ? await captureFromCamera() : await captureFromLibrary();
      if (c) setCapture(c);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      void hapticError();
    }
  }

  async function send(): Promise<void> {
    if (!capture) return;
    setBusy(true); setErr(null);
    try {
      // The chat sender's existing /query-sync endpoint accepts a free-text message.
      // For text/url shares, we send the note + the shared text inline.
      // For images, we send a marker + the base64 in a structured field the
      // server can hand off to a vision-aware module.
      const body: Record<string, unknown> = {
        message: note.trim() || INTENTS.find(i => i.value === intent)?.label || 'Please review this',
        intent,
        capture: capture.isText
          ? { kind: capture.kind, mimeType: capture.mimeType, text: capture.data, share_url: capture.shareUrl }
          : { kind: capture.kind, mimeType: capture.mimeType, filename: capture.filename, base64: capture.data },
      };
      const res = await fetchWithAuth(`/org/${orgId}/query-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Send failed (${res.status})`);
      void success();
      onSent(typeof data.sessionId === 'string' ? data.sessionId : null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      void hapticError();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col bg-adv-dark">
      <header className="border-b border-border bg-adv-dark-2 px-4 py-3 flex items-center gap-3">
        <button onClick={onBack} aria-label="Back" className="rounded-lg bg-adv-card p-2 text-adv-gray hover:text-adv-off-white">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <h1 className="text-base font-bold text-adv-off-white">Capture</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {!capture && (
          <div className="grid grid-cols-2 gap-3">
            <SourceTile icon="📷" label="Take photo" onClick={() => pick('camera')} />
            <SourceTile icon="🖼" label="Pick from library" onClick={() => pick('library')} />
          </div>
        )}

        {capture && (
          <>
            {/* Preview */}
            <div className="rounded-xl border border-border bg-adv-card p-3">
              {capture.isText ? (
                <div className="space-y-1">
                  <div className="text-[10px] uppercase tracking-wider text-adv-gray">Shared text</div>
                  <div className="whitespace-pre-wrap text-sm text-adv-off-white">{capture.data}</div>
                  {capture.shareUrl && (
                    <a href={capture.shareUrl} className="inline-block break-all text-[11px] text-adv-teal" target="_blank" rel="noreferrer">{capture.shareUrl}</a>
                  )}
                </div>
              ) : (
                <img
                  src={`data:${capture.mimeType};base64,${capture.data}`}
                  alt="Capture preview"
                  className="max-h-[40dvh] w-full rounded-lg object-contain"
                />
              )}
              <div className="mt-2 flex items-center gap-2 text-[11px] text-adv-gray">
                <span>{capture.filename}</span>
                <span>·</span>
                <span>{(capture.size / 1024).toFixed(1)} KB</span>
                <button onClick={() => setCapture(null)} className="ml-auto text-adv-red hover:underline">
                  Remove
                </button>
              </div>
            </div>

            {/* Intent picker */}
            <label className="block text-[11px] text-adv-gray">
              What should ANTON do with this?
              <select value={intent} onChange={e => setIntent(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-adv-dark px-3 py-2.5 text-sm text-adv-off-white">
                {INTENTS.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
              </select>
            </label>

            {/* Note */}
            <label className="block text-[11px] text-adv-gray">
              Additional note (optional)
              <textarea value={note} onChange={e => setNote(e.target.value)} maxLength={2000} rows={3}
                placeholder="e.g. extract the totals from this invoice"
                className="mt-1 w-full rounded-lg border border-border bg-adv-dark px-3 py-2.5 text-sm text-adv-off-white placeholder-adv-gray/40 focus:border-adv-teal focus:outline-none" />
            </label>

            {err && <div className="rounded-lg border border-adv-red/30 bg-adv-red/10 px-3 py-2 text-[11px] text-adv-red">{err}</div>}

            <button onClick={() => void send()} disabled={busy} className="w-full rounded-lg bg-adv-teal py-3 text-sm font-semibold text-adv-dark hover:bg-adv-teal-dark active:scale-[0.98] disabled:opacity-40">
              {busy ? 'Sending…' : 'Send to ANTON'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function SourceTile({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-adv-card p-8 transition hover:border-adv-teal/40 active:scale-[0.98]">
      <span className="text-4xl">{icon}</span>
      <span className="text-sm text-adv-off-white">{label}</span>
    </button>
  );
}
