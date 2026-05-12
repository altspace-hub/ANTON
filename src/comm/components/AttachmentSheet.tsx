import { useEffect } from 'react';
import { Ico } from './Ico';
import { registerBackHandler } from '../services/back-stack';

interface Props {
  open: boolean;
  onClose: () => void;
  onPickImageCamera: () => void;
  onPickImageLibrary: () => void;
  onPickVideoCamera: () => void;
  onPickVideoLibrary: () => void;
}

export default function AttachmentSheet({
  open, onClose, onPickImageCamera, onPickImageLibrary, onPickVideoCamera, onPickVideoLibrary,
}: Props) {
  useEffect(() => {
    if (!open) return;
    return registerBackHandler(onClose);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ background: 'rgba(28, 26, 20, 0.55)' }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--color-surface)] rounded-t-3xl pt-2 pb-6 safe-bottom"
      >
        <div className="w-10 h-1 rounded-full bg-[var(--color-border)] mx-auto mb-4" />
        <div className="px-5 grid grid-cols-2 gap-3">
          <Tile icon="camera" label="Camera"  onClick={() => { onClose(); onPickImageCamera(); }} />
          <Tile icon="image"  label="Photos"  onClick={() => { onClose(); onPickImageLibrary(); }} />
          <Tile icon="video"  label="Record video" onClick={() => { onClose(); onPickVideoCamera(); }} />
          <Tile icon="video"  label="Video library" onClick={() => { onClose(); onPickVideoLibrary(); }} />
        </div>
      </div>
    </div>
  );
}

function Tile({ icon, label, onClick }: { icon: 'camera' | 'image' | 'video'; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-2 rounded-2xl py-5 border border-[var(--color-border-soft)] bg-[var(--color-surface-alt)] active:bg-[var(--color-surface-muted)]"
    >
      <div
        className="w-11 h-11 rounded-full flex items-center justify-center"
        style={{ backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-accent-dark)' }}
      >
        <Ico name={icon} size={22} />
      </div>
      <span className="text-sm font-medium text-[var(--color-text)]">{label}</span>
    </button>
  );
}
