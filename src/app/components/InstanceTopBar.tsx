/**
 * InstanceTopBar — minimal top strip showing the active instance name
 * and a coloured status dot. Tap opens the InstanceSwitcher bottom sheet.
 *
 * Spec §9.2 — top bar is intentionally minimal (instance name + status
 * indicator only). All actions live in the bottom region.
 */

import { useEffect, useState } from 'react';
import { getActiveInstance, listInstances, onActiveInstanceChange, markSeen } from '../services/instances';
import InstanceSwitcher from './InstanceSwitcher';

export default function InstanceTopBar({ onAddInstance }: { onAddInstance?: () => void }) {
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const active = getActiveInstance();
  const totalInstances = listInstances().length;

  // Re-render when the active instance changes (e.g., user picked another)
  useEffect(() => onActiveInstanceChange(() => setTick(t => t + 1)), []);

  // Cheap reachability ping — every 30s, against /api/app/discover
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    async function ping() {
      try {
        const res = await fetch(`${active!.server_base.replace(/\/$/, '')}/api/app/discover`, { signal: AbortSignal.timeout(3000) });
        if (!cancelled) markSeen(active!.id, res.ok ? 'online' : 'offline');
      } catch {
        if (!cancelled) markSeen(active!.id, 'offline');
      }
      if (!cancelled) setTick(t => t + 1);
    }
    void ping();
    const id = window.setInterval(ping, 30_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [active?.id]);

  if (!active) return null;

  const status = active.last_status;
  const dot = status === 'online' ? 'bg-adv-green' : status === 'offline' ? 'bg-adv-red' : 'bg-adv-gray';

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 border-b border-border bg-adv-dark-2 px-4 py-2 text-left transition active:bg-adv-card"
        aria-label={`Active instance: ${active.display_name}. Tap to switch.`}
      >
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        <span className="flex-1 truncate text-xs font-medium text-adv-off-white">{active.display_name}</span>
        {totalInstances > 1 && (
          <span className="text-[10px] text-adv-gray">{totalInstances} instances</span>
        )}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-adv-gray" aria-hidden="true">
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </button>
      <InstanceSwitcher key={tick} open={open} onClose={() => setOpen(false)} onAddInstance={onAddInstance} />
    </>
  );
}
