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

  // Reachability ping — tries LAN first (if defined), falls back to the
  // canonical server_base (usually WAN). Records WHICH transport succeeded
  // so the UI can tell the user why they're connected the way they are.
  //
  // Previously this was a single probe against server_base which silently
  // retried WAN when LAN went dark — the user had no way to tell LAN was
  // down (audit improvement #4).
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    async function probe(url: string): Promise<boolean> {
      try {
        const res = await fetch(`${url.replace(/\/$/, '')}/api/app/discover`, { signal: AbortSignal.timeout(3000) });
        return res.ok;
      } catch { return false; }
    }
    async function ping() {
      const lanUrl = active!.endpoints.lan;
      const wanUrl = active!.endpoints.wan ?? active!.server_base;
      let status: 'online' | 'offline' = 'offline';
      let transport: 'lan' | 'wan' | null = null;
      if (lanUrl && await probe(lanUrl)) { status = 'online'; transport = 'lan'; }
      else if (wanUrl && await probe(wanUrl)) { status = 'online'; transport = 'wan'; }
      if (!cancelled) markSeen(active!.id, status, transport);
      if (!cancelled) setTick(t => t + 1);
    }
    void ping();
    const id = window.setInterval(ping, 30_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [active?.id]);

  if (!active) return null;

  const status = active.last_status;
  const transport = active.last_transport;
  const dot = status === 'online' ? 'bg-adv-green' : status === 'offline' ? 'bg-adv-red' : 'bg-adv-gray';
  const badge = status === 'online' && transport
    ? transport.toUpperCase()
    : status === 'offline' ? 'offline' : 'connecting';

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 border-b border-border bg-adv-dark-2 px-4 py-2 text-left transition active:bg-adv-card"
        aria-label={`Active instance: ${active.display_name}. Status: ${badge}. Tap to switch.`}
      >
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        <span className="flex-1 truncate text-xs font-medium text-adv-off-white">{active.display_name}</span>
        <span className="text-[10px] uppercase tracking-wide text-adv-gray">{badge}</span>
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
