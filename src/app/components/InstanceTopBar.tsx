/**
 * InstanceTopBar — Top strip showing the active ANTON instance.
 *
 * Claude-Design pattern (May-3 IRE deep pass):
 *   ┌────────────────────────────────────────────────┐
 *   │ [FC] FutureChain AB ⌄                       🔔 │
 *   │      ● Connected · LAN                          │
 *   └────────────────────────────────────────────────┘
 *      ↑ Avatar tile        ↑ chevron     ↑ notifications
 *
 * Tapping the name area opens the InstanceSwitcher. Tapping the bell
 * opens Approvals (badge bound from prop).
 */

import { useEffect, useState } from 'react';
import { getActiveInstance, listInstances, onActiveInstanceChange, markSeen } from '../services/instances';
import InstanceSwitcher from './InstanceSwitcher';
import { Ico } from './ui';

interface Props {
  onAddInstance?: () => void;
  onOpenApprovals?: () => void;
  pendingApprovals?: number;
}

function avatarFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function InstanceTopBar({ onAddInstance, onOpenApprovals, pendingApprovals = 0 }: Props) {
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const active = getActiveInstance();
  const totalInstances = listInstances().length;

  useEffect(() => onActiveInstanceChange(() => setTick(t => t + 1)), []);

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
  const dotColor =
    status === 'online'  ? 'var(--color-green)' :
    status === 'offline' ? 'var(--color-red)' :
                           'var(--color-text-muted)';
  const statusLabel =
    status === 'online'  ? `Connected · ${(transport ?? 'net').toUpperCase()}` :
    status === 'offline' ? 'Offline' :
                           'Connecting…';

  const avatar = avatarFromName(active.display_name);

  return (
    <>
      <div
        className="flex w-full items-center gap-2.5 px-3 py-2"
        style={{
          background: 'var(--color-surface)',
          borderBottom: '1px solid var(--color-border-soft)',
        }}
      >
        <button
          onClick={() => setOpen(true)}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left transition active:opacity-70"
          aria-label={`Active instance: ${active.display_name}. Tap to switch.`}
        >
          <span
            className="flex flex-shrink-0 items-center justify-center font-semibold"
            style={{
              width: 32, height: 32,
              borderRadius: 8,
              background: 'var(--color-accent)',
              color: 'var(--color-accent-fg)',
              fontSize: '0.75rem',
              letterSpacing: '-0.2px',
              lineHeight: 1,
            }}
          >
            {avatar}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <span
                className="truncate"
                style={{
                  fontSize: '0.84375rem',
                  fontWeight: 700,
                  color: 'var(--color-text)',
                  letterSpacing: '-0.15px',
                  lineHeight: 1.2,
                }}
              >
                {active.display_name}
              </span>
              <span style={{ color: 'var(--color-text-faint)' }}>
                <Ico name="chevronDown" size={12} />
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span
                className="block rounded-full"
                style={{ width: 6, height: 6, background: dotColor }}
              />
              <span
                className="truncate"
                style={{
                  fontSize: '0.6875rem',
                  color: 'var(--color-text-muted)',
                  letterSpacing: '-0.05px',
                }}
              >
                {statusLabel}
                {totalInstances > 1 && ` · ${totalInstances} instances`}
              </span>
            </div>
          </div>
        </button>

        {onOpenApprovals && (
          <button
            onClick={onOpenApprovals}
            aria-label={pendingApprovals > 0 ? `${pendingApprovals} pending approvals` : 'Notifications'}
            className="relative flex flex-shrink-0 items-center justify-center transition active:opacity-50"
            style={{
              width: 40, height: 40,
              color: 'var(--color-text)',
            }}
          >
            <Ico name="bell" size={20} />
            {pendingApprovals > 0 && (
              <span
                className="absolute inline-flex items-center justify-center rounded-full font-bold text-white"
                style={{
                  background: 'var(--color-red)',
                  border: '1.5px solid var(--color-surface)',
                  top: 6,
                  right: 6,
                  minWidth: 16,
                  height: 16,
                  padding: '0 4px',
                  fontSize: '0.5625rem',
                  lineHeight: 1,
                }}
              >
                {pendingApprovals > 99 ? '99+' : pendingApprovals}
              </span>
            )}
          </button>
        )}
      </div>
      {/* No `key={tick}` — the switcher reads instances on each render of
          its own state; remounting on every status-tick was discarding
          local state (open animation, scroll position) unnecessarily. */}
      <InstanceSwitcher open={open} onClose={() => setOpen(false)} onAddInstance={onAddInstance} />
    </>
  );
}
