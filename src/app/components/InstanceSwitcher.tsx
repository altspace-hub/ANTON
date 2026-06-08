/**
 * InstanceSwitcher — bottom-sheet card list of paired ANTON instances.
 *
 * Spec §4.2 + §8.9: a consultant pairs with their firm + their client's
 * instance; an NGO worker pairs with the classroom + the regional admin
 * server. The switcher must be unambiguous about which instance the
 * next action will hit.
 *
 * Visual model: Apple-Wallet-style stack of cards (spec §9.6 inspiration
 * list). Active card sits at the top, others stacked below.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  listInstances, getActiveInstance, setActiveInstanceAsync, removeInstance,
  type Instance,
} from '../services/instances';
import { tick, light } from '../services/haptics';
import { registerBackHandler } from '../services/back-stack';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { Ico } from './ui';

interface Props {
  open: boolean;
  onClose: () => void;
  onAddInstance?: () => void;
}

export default function InstanceSwitcher({ open, onClose, onAddInstance }: Props) {
  const [tick_, setTick] = useState(0);   // bump to re-render after mutations
  const instances = useMemo(() => listInstances(), [tick_]);
  const active = useMemo(() => getActiveInstance(), [tick_]);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Android hardware back closes the sheet instead of triggering the
  // App-level exit prompt. (BottomSheet auto-registers; this component
  // is a custom sheet, so it must register manually.)
  useEffect(() => {
    if (!open) return;
    return registerBackHandler(onClose);
  }, [open, onClose]);

  if (!open) return null;

  async function pick(id: string) {
    if (id === active?.id) { onClose(); return; }
    // Race-free: await the secure-store read so the next API call uses
    // the new instance's session token (Phase H fix Arch 2).
    await setActiveInstanceAsync(id);
    void light();
    setTick(t => t + 1);
    setTimeout(onClose, 200);
  }

  async function unpair(id: string) {
    if (!confirm('Unpair this instance? Your local cache + credentials will be wiped. (The instance itself is unaffected.)')) return;
    await removeInstance(id);
    void tick();
    setTick(t => t + 1);
  }

  return (
    <div ref={dialogRef} className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label="Instance switcher">
      {/* Backdrop */}
      <button
        onClick={onClose}
        className="absolute inset-0 backdrop-blur-sm"
        style={{ background: 'var(--color-scrim-strong)' }}
        aria-label="Close"
      />

      {/* Sheet */}
      <div
        className="relative w-full max-w-2xl rounded-t-2xl pb-[env(safe-area-inset-bottom)] shadow-2xl animate-slideUp"
        style={{
          background: 'var(--color-surface)',
          borderTop: '1px solid var(--color-border)',
        }}
      >
        <div
          className="mx-auto h-1 w-10 rounded-full mt-2 mb-3"
          style={{ background: 'var(--color-border)' }}
        />
        <div className="px-4 pb-1 pt-1">
          <h2 className="text-[0.9375rem] font-semibold" style={{ color: 'var(--color-text)' }}>Instances</h2>
          <p className="mt-0.5 text-[0.75rem]" style={{ color: 'var(--color-text-muted)' }}>
            Tap to switch which ANTON the app talks to.
          </p>
        </div>
        <div className="max-h-[60dvh] overflow-y-auto px-3 py-3 space-y-2">
          {instances.length === 0 && (
            <div
              className="rounded-[var(--radius-r2)] px-4 py-6 text-center text-[0.75rem]"
              style={{
                border: '1px dashed var(--color-border)',
                background: 'var(--color-bg)',
                color: 'var(--color-text-muted)',
              }}
            >
              No instances paired yet.
            </div>
          )}
          {instances.map(i => (
            <InstanceCard
              key={i.id} instance={i} active={i.id === active?.id}
              onPick={() => void pick(i.id)} onUnpair={() => unpair(i.id)}
            />
          ))}
        </div>
        <div
          className="flex items-center gap-2 px-3 py-3"
          style={{ borderTop: '1px solid var(--color-border-soft)' }}
        >
          <button
            onClick={() => { onClose(); onAddInstance?.(); }}
            className="flex-1 rounded-[var(--radius-r2)] px-4 py-2.5 text-[0.8125rem] font-semibold transition active:scale-[0.98]"
            style={{
              background: 'var(--color-accent)',
              color: 'var(--color-accent-fg)',
              minHeight: 44,
            }}
          >
            + Pair new instance
          </button>
          <button
            onClick={onClose}
            className="rounded-[var(--radius-r2)] px-4 py-2.5 text-[0.8125rem]"
            style={{
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-muted)',
              minHeight: 44,
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function InstanceCard({ instance, active, onPick, onUnpair }: { instance: Instance; active: boolean; onPick: () => void; onUnpair: () => void }) {
  const dotColor =
    instance.last_status === 'online' ? 'var(--color-green)' :
    instance.last_status === 'offline' ? 'var(--color-red)' :
    'var(--color-text-faint)';
  return (
    <div
      className="rounded-[var(--radius-r2)] p-3 transition"
      style={{
        border: active ? '1.5px solid var(--color-accent)' : '1px solid var(--color-border)',
        background: active ? 'var(--color-accent-soft)' : 'var(--color-bg)',
      }}
    >
      <div className="flex items-start gap-3">
        <button onClick={onPick} className="flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: dotColor }} />
            <span className="text-[0.875rem] font-semibold" style={{ color: 'var(--color-text)' }}>
              {instance.display_name}
            </span>
            {active && (
              <span
                className="font-mono text-[0.625rem] uppercase"
                style={{ color: 'var(--color-accent)', letterSpacing: '0.6px' }}
              >
                Active
              </span>
            )}
          </div>
          <div className="mt-1 text-[11.5px] break-all" style={{ color: 'var(--color-text-muted)' }}>
            {instance.server_base}
          </div>
          {instance.org && (
            <div className="mt-1 text-[11.5px]" style={{ color: 'var(--color-text-muted)' }}>
              {instance.org.name} · {instance.org.role}
            </div>
          )}
          {instance.contact_hash && (
            <div className="mt-1 font-mono text-[0.625rem]" style={{ color: 'var(--color-text-faint)' }}>
              {instance.contact_hash}
            </div>
          )}
        </button>
        <button
          onClick={onUnpair}
          aria-label="Unpair instance"
          className="flex flex-shrink-0 items-center justify-center rounded-[var(--radius-r2)] transition active:scale-[0.95]"
          style={{
            width: 44, height: 44,
            color: 'var(--color-text-muted)',
          }}
        >
          <Ico name="x" size={18} />
        </button>
      </div>
    </div>
  );
}
