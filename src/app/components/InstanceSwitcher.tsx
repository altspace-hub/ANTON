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

import { useEffect, useMemo, useState } from 'react';
import {
  listInstances, getActiveInstance, setActiveInstance, removeInstance,
  type Instance,
} from '../services/instances';
import { tick, light } from '../services/haptics';

interface Props {
  open: boolean;
  onClose: () => void;
  onAddInstance?: () => void;
}

export default function InstanceSwitcher({ open, onClose, onAddInstance }: Props) {
  const [tick_, setTick] = useState(0);   // bump to re-render after mutations
  const instances = useMemo(() => listInstances(), [tick_]);
  const active = useMemo(() => getActiveInstance(), [tick_]);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  function pick(id: string) {
    if (id === active?.id) { onClose(); return; }
    setActiveInstance(id);
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
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label="Instance switcher">
      {/* Backdrop */}
      <button onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-label="Close" />

      {/* Sheet */}
      <div className="relative w-full max-w-2xl rounded-t-2xl border-t border-border bg-adv-dark-2 pb-[env(safe-area-inset-bottom)] shadow-2xl animate-slideUp">
        <div className="mx-auto h-1 w-10 rounded-full bg-adv-gray/40 mt-2 mb-3" />
        <div className="px-4 pb-1 pt-1">
          <h2 className="text-sm font-semibold text-adv-off-white">Instances</h2>
          <p className="mt-0.5 text-[11px] text-adv-gray">Tap to switch which ANTON the app talks to.</p>
        </div>
        <div className="max-h-[60dvh] overflow-y-auto px-3 py-3 space-y-2">
          {instances.length === 0 && (
            <div className="rounded-xl border border-dashed border-border bg-adv-card/40 px-4 py-6 text-center text-[12px] text-adv-gray">
              No instances paired yet.
            </div>
          )}
          {instances.map(i => (
            <InstanceCard
              key={i.id} instance={i} active={i.id === active?.id}
              onPick={() => pick(i.id)} onUnpair={() => unpair(i.id)}
            />
          ))}
        </div>
        <div className="flex items-center gap-2 border-t border-border px-3 py-3">
          <button
            onClick={() => { onClose(); onAddInstance?.(); }}
            className="flex-1 rounded-lg bg-adv-teal px-4 py-2.5 text-xs font-semibold text-adv-dark hover:bg-adv-teal-dark active:scale-[0.98]"
          >
            + Pair new instance
          </button>
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2.5 text-xs text-adv-gray hover:text-adv-off-white">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function InstanceCard({ instance, active, onPick, onUnpair }: { instance: Instance; active: boolean; onPick: () => void; onUnpair: () => void }) {
  const dot = instance.last_status === 'online' ? 'bg-adv-green' : instance.last_status === 'offline' ? 'bg-adv-red' : 'bg-adv-gray';
  return (
    <div className={`rounded-xl border p-3 transition ${active ? 'border-adv-teal bg-adv-teal/5' : 'border-border bg-adv-card hover:border-adv-gray'}`}>
      <div className="flex items-start gap-3">
        <button onClick={onPick} className="flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${dot}`} />
            <span className="text-sm font-medium text-adv-off-white">{instance.display_name}</span>
            {active && <span className="text-[10px] uppercase tracking-wider text-adv-teal">Active</span>}
          </div>
          <div className="mt-1 text-[11px] text-adv-gray break-all">{instance.server_base}</div>
          {instance.org && (
            <div className="mt-1 text-[11px] text-adv-gray">
              {instance.org.name} · {instance.org.role}
            </div>
          )}
          {instance.contact_hash && (
            <div className="mt-1 font-mono text-[10px] text-adv-gray/70">{instance.contact_hash}</div>
          )}
        </button>
        <button onClick={onUnpair} aria-label="Unpair" className="rounded-lg p-1.5 text-adv-gray hover:bg-adv-dark hover:text-adv-red">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6l-12 12"/></svg>
        </button>
      </div>
    </div>
  );
}
