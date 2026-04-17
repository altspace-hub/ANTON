/**
 * QuickActionsFab — bottom-centre floating action button per spec §8.8.
 *
 * One tap opens a bottom-sheet menu with the user's most common verbs.
 * Context-aware: surfaces verbs that are useful for the current state
 * (e.g. "Switch instance" only appears when > 1 paired).
 */

import { useState } from 'react';
import BottomSheet from './BottomSheet';
import VoiceMode from './VoiceMode';
import { listInstances } from '../services/instances';
import { tick } from '../services/haptics';

interface Props {
  pendingApprovals: number;
  onAsk: () => void;
  onCapture: () => void;
  onApprovals: () => void;
  onSwitchInstance: () => void;
  /** Sends a transcript captured from VoiceMode to the chat layer.
   *  Returns the assistant reply (or null on error) for TTS playback. */
  onVoiceSubmit: (transcript: string) => Promise<{ reply: string } | null>;
}

export default function QuickActionsFab({ pendingApprovals, onAsk, onCapture, onApprovals, onSwitchInstance, onVoiceSubmit }: Props) {
  const [open, setOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const instanceCount = listInstances().length;

  function fire(action: () => void) {
    setOpen(false);
    void tick();
    setTimeout(action, 50);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { void tick(); setOpen(true); }}
        aria-label="Quick actions"
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+72px)] left-1/2 z-30 -translate-x-1/2 flex h-14 w-14 items-center justify-center rounded-full bg-adv-teal text-adv-dark shadow-2xl shadow-adv-teal/40 transition-all hover:bg-adv-teal-dark active:animate-fabPress"
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Quick actions" maxHeight="60dvh">
        <div className="grid grid-cols-2 gap-2">
          <ActionTile icon="🎙" label="Voice to ANTON" onClick={() => fire(() => setVoiceOpen(true))} />
          <ActionTile icon="📸" label="Capture document" onClick={() => fire(onCapture)} />
          <ActionTile icon="💬" label="Ask a question" onClick={() => fire(onAsk)} />
          <ActionTile icon="✅" label="Approvals" badge={pendingApprovals} onClick={() => fire(onApprovals)} />
          {instanceCount > 1 && (
            <ActionTile icon="🔀" label="Switch instance" onClick={() => fire(onSwitchInstance)} />
          )}
        </div>
      </BottomSheet>

      {voiceOpen && (
        <VoiceMode
          onSubmit={onVoiceSubmit}
          onClose={() => setVoiceOpen(false)}
        />
      )}
    </>
  );
}

function ActionTile({ icon, label, badge, onClick }: { icon: string; label: string; badge?: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex flex-col items-start justify-between rounded-xl border border-border bg-adv-card p-3 text-left transition hover:border-adv-teal/40 active:scale-[0.98]"
    >
      <span className="text-2xl">{icon}</span>
      <span className="mt-2 text-xs font-medium text-adv-off-white">{label}</span>
      {badge && badge > 0 && (
        <span className="absolute right-2 top-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-adv-red px-1.5 text-[10px] font-bold text-white">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
}
