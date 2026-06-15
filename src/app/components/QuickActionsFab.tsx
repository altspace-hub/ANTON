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
import { Ico, type IcoName } from './ui';

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
        className="fixed right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full transition-all active:animate-fabPress"
        style={{
          bottom: 'calc(env(safe-area-inset-bottom) + 80px)',
          background: 'var(--color-accent)',
          color: 'var(--color-accent-fg)',
          boxShadow: '0 4px 16px -4px color-mix(in srgb, var(--color-accent) 50%, transparent), 0 2px 4px -1px rgba(0,0,0,0.12)',
        }}
      >
        <Ico name="plus" size={22} />
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Quick actions" maxHeight="60dvh">
        <div className="grid grid-cols-2 gap-2.5">
          <ActionTile icon="mic"          tint="var(--color-accent)" label="Voice to ANTON"   onClick={() => fire(() => setVoiceOpen(true))} />
          <ActionTile icon="camera"       tint="var(--color-text)"   label="Capture document" onClick={() => fire(onCapture)} />
          <ActionTile icon="message"      tint="var(--color-blue)"   label="Ask a question"   onClick={() => fire(onAsk)} />
          <ActionTile icon="shieldCheck"  tint="var(--color-green)"  label="Approvals" badge={pendingApprovals} onClick={() => fire(onApprovals)} />
          {instanceCount > 1 && (
            <ActionTile icon="switchOrg"  tint="var(--color-text-body)" label="Switch instance" onClick={() => fire(onSwitchInstance)} />
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

function ActionTile({ icon, tint, label, badge, onClick }: {
  icon: IcoName;
  tint: string;
  label: string;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex flex-col items-start gap-2.5 rounded-[var(--radius-r2)] p-3.5 text-left transition hover:shadow-sm active:scale-[0.98]"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        minHeight: 86,
      }}
    >
      <span
        className="flex items-center justify-center rounded-[var(--radius-r1)]"
        style={{
          width: 36, height: 36,
          background: 'var(--color-surface-alt)',
          color: tint,
        }}
      >
        <Ico name={icon} size={20} />
      </span>
      <span className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>
        {label}
      </span>
      {badge != null && badge > 0 && (
        <span
          className="absolute inline-flex items-center justify-center rounded-full font-bold text-white"
          style={{
            top: 8, right: 8,
            background: 'var(--color-red)',
            border: '1.5px solid var(--color-surface)',
            minWidth: 20, height: 20, padding: '0 6px',
            fontSize: '0.6875rem',
          }}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
}
