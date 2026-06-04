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
  /** R7 — opens the PollComposeScreen flow. */
  onPickPoll: () => void;
  /** R13 — opens the LocationPickerSheet flow. */
  onPickLocation: () => void;
  /** R12 — opens the StickerPickerSheet flow. */
  onPickSticker: () => void;
  /** #91 — pick a generic file / document to attach. */
  onPickFile: () => void;
  /** R6 — current view-once state, owned by the parent. */
  viewOnce: boolean;
  onToggleViewOnce: () => void;
}

export default function AttachmentSheet({
  open, onClose, onPickImageCamera, onPickImageLibrary, onPickVideoCamera, onPickVideoLibrary,
  onPickPoll, onPickLocation, onPickSticker, onPickFile, viewOnce, onToggleViewOnce,
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
        <div className="w-10 h-1 rounded-full bg-[var(--color-border)] mx-auto mb-3" />

        {/* R6 — View-once pill, sticks above the tiles */}
        <div className="px-5 mb-3">
          <button
            onClick={onToggleViewOnce}
            aria-pressed={viewOnce}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl border text-left"
            style={{
              borderColor: viewOnce ? 'var(--color-accent)' : 'var(--color-border-soft)',
              backgroundColor: viewOnce ? 'var(--color-accent-dim)' : 'var(--color-surface-alt)',
            }}
          >
            <span
              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
              style={{
                backgroundColor: viewOnce ? 'var(--color-accent)' : 'var(--color-surface)',
                color: viewOnce ? 'var(--color-accent-fg)' : 'var(--color-accent-dark)',
              }}
            >
              <Ico name="clock" size={18} />
            </span>
            <span className="flex-1">
              <span className="block text-[14px] font-medium text-[var(--color-text)]">View once</span>
              <span className="block text-[11px] text-[var(--color-text-muted)]">
                {viewOnce ? 'Will disappear after they view it.' : 'Recipient can save your media. Tap to limit it.'}
              </span>
            </span>
            <span
              className="w-10 h-6 rounded-full p-0.5 transition-colors flex-shrink-0"
              style={{ backgroundColor: viewOnce ? 'var(--color-accent)' : 'var(--color-border)' }}
            >
              <span
                className="block w-5 h-5 rounded-full bg-white transition-transform"
                style={{ transform: viewOnce ? 'translateX(16px)' : 'translateX(0)' }}
              />
            </span>
          </button>
        </div>

        <div className="px-5 grid grid-cols-2 gap-3">
          <Tile icon="camera" label="Camera"  onClick={() => { onClose(); onPickImageCamera(); }} />
          <Tile icon="image"  label="Photos"  onClick={() => { onClose(); onPickImageLibrary(); }} />
          <Tile icon="video"  label="Record video" onClick={() => { onClose(); onPickVideoCamera(); }} />
          <Tile icon="video"  label="Video library" onClick={() => { onClose(); onPickVideoLibrary(); }} />
          <Tile icon="grid"   label="Poll"    onClick={() => { onClose(); onPickPoll(); }} />
          <Tile icon="mapPin" label="Location" onClick={() => { onClose(); onPickLocation(); }} />
          <Tile icon="smile"  label="Stickers" onClick={() => { onClose(); onPickSticker(); }} />
          <Tile icon="paperclip" label="File" onClick={() => { onClose(); onPickFile(); }} />
        </div>
      </div>
    </div>
  );
}

function Tile({ icon, label, onClick }: { icon: 'camera' | 'image' | 'video' | 'grid' | 'mapPin' | 'smile' | 'paperclip'; label: string; onClick: () => void }) {
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
