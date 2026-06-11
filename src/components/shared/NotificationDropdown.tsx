import { useState, useEffect, useRef } from 'react';
import { Bell, Check, CheckCheck, ExternalLink, ThumbsUp, ThumbsDown, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getAuthHeader as getApiAuthHeader } from '@/lib/api';

interface Notification {
  id: string;
  type: 'scheduled_workflow' | 'radar_scan' | 'system';
  title: string;
  message?: string;
  link?: string;
  read_at: string | null;
  created_at: string;
}

interface BriefingProposal {
  id: string;
  proposed_action: string;
  signal_source: string;
  human_rating: string | null;
}

/** Extract the briefing id from an orchestrator notification link, if any. */
function briefingIdFromLink(link?: string): string | null {
  if (!link) return null;
  const m = link.match(/\/orchestrator\?briefing=([0-9a-fA-F-]+)/);
  return m ? m[1] : null;
}

/**
 * Wave 3.6b — 1-click rating INSIDE the briefing notification card.
 * Fetches the briefing's proposals on expand and writes ratings through the
 * canonical path: PATCH /api/orchestrator/proposals/:id { human_rating } —
 * the same write the trust ladder (orchestrator_stage) reads. Rating also
 * re-opens the spend gate automatically.
 */
function InlineProposalRating({ briefingId }: { briefingId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [proposals, setProposals] = useState<BriefingProposal[] | null>(null);
  const [loading, setLoading] = useState(false);

  const loadProposals = async () => {
    if (proposals || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/orchestrator/briefings/${briefingId}`, { headers: getApiAuthHeader() });
      if (res.ok) {
        const data = await res.json() as { proposals?: BriefingProposal[] };
        setProposals((data.proposals ?? []).slice(0, 3));
      } else {
        setProposals([]);
      }
    } catch {
      setProposals([]);
    } finally {
      setLoading(false);
    }
  };

  const rate = async (proposalId: string, rating: 'relevant' | 'irrelevant') => {
    try {
      await fetch(`/api/orchestrator/proposals/${proposalId}`, {
        method: 'PATCH',
        headers: { ...getApiAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ human_rating: rating }),
      });
      setProposals(prev => prev ? prev.map(p => p.id === proposalId ? { ...p, human_rating: rating } : p) : prev);
    } catch { /* ignore */ }
  };

  return (
    <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => { setExpanded(v => !v); if (!expanded) loadProposals(); }}
        className="flex items-center gap-1 text-[11px] text-adv-teal hover:underline"
      >
        <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        Rate proposals
      </button>
      {expanded && (
        <div className="mt-1.5 space-y-1.5">
          {loading && <p className="text-[11px] text-adv-gray animate-pulse">Loading proposals…</p>}
          {proposals && proposals.length === 0 && !loading && (
            <p className="text-[11px] text-adv-gray">No proposals in this briefing</p>
          )}
          {proposals?.map(p => (
            <div key={p.id} className="rounded-lg bg-adv-dark-2 px-2 py-1.5">
              <p className="text-[11px] text-adv-off-white line-clamp-2">{p.proposed_action}</p>
              {p.human_rating ? (
                <p className="mt-1 text-[11px] text-adv-teal capitalize flex items-center gap-1">
                  <Check className="h-3 w-3" /> Rated: {p.human_rating.replace(/_/g, ' ')}
                </p>
              ) : (
                <div className="mt-1 flex items-center gap-1.5">
                  <button
                    onClick={() => rate(p.id, 'relevant')}
                    className="flex items-center gap-1 rounded border border-adv-teal/30 bg-adv-teal/10 px-1.5 py-0.5 text-[11px] text-adv-teal hover:bg-adv-teal/20 transition-colors"
                  >
                    <ThumbsUp className="h-3 w-3" /> Relevant
                  </button>
                  <button
                    onClick={() => rate(p.id, 'irrelevant')}
                    className="flex items-center gap-1 rounded border border-red-400/20 bg-adv-red/10 px-1.5 py-0.5 text-[11px] text-red-400 hover:bg-adv-red/20 transition-colors"
                  >
                    <ThumbsDown className="h-3 w-3" /> Irrelevant
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

export function NotificationDropdown() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const fetchCount = async () => {
    try {
      const res = await fetch('/api/notifications/count', { headers: getAuthHeader() });
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.unread || 0);
      }
    } catch { /* network error, ignore */ }
  };

  const fetchNotifications = async () => {
    try {
      const res = await fetch('/api/notifications', { headers: getAuthHeader() });
      if (res.ok) {
        const data = await res.json();
        setNotifications(Array.isArray(data) ? data : []);
      }
    } catch { /* ignore */ }
  };

  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (open) fetchNotifications();
  }, [open]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const markRead = async (id: string) => {
    try {
      await fetch(`/api/notifications/${id}/read`, {
        method: 'PATCH',
        headers: getAuthHeader(),
      });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch { /* ignore */ }
  };

  const markAllRead = async () => {
    try {
      await fetch('/api/notifications/read-all', {
        method: 'POST',
        headers: getAuthHeader(),
      });
      setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
      setUnreadCount(0);
    } catch { /* ignore */ }
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read_at) markRead(notification.id);
    if (notification.link) {
      navigate(notification.link);
      setOpen(false);
    }
  };

  const typeIcon = (type: string) => {
    if (type === 'scheduled_workflow') return '\u2699\uFE0F';
    if (type === 'radar_scan') return '\uD83D\uDCE1';
    return '\uD83D\uDD14';
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg hover:bg-adv-card hover:text-adv-off-white text-adv-gray transition-colors"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4 w-4 bg-adv-red text-white text-xs font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-adv-card rounded-xl shadow-lg border border-border z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="font-semibold text-sm text-adv-off-white">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-adv-teal hover:underline flex items-center gap-1"
              >
                <CheckCheck className="h-3 w-3" />
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-8 text-center text-sm text-adv-gray">
                No notifications yet
              </div>
            ) : (
              notifications.slice(0, 10).map(notification => (
                <div
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`px-4 py-3 flex gap-3 cursor-pointer hover:bg-adv-dark-2 transition-colors border-b border-border last:border-0 ${
                    !notification.read_at ? 'bg-adv-teal-dim/30' : ''
                  }`}
                >
                  <span className="text-lg mt-0.5 flex-shrink-0">{typeIcon(notification.type)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-1">
                      <span className="text-sm font-medium text-adv-off-white line-clamp-1">
                        {notification.title}
                      </span>
                      {!notification.read_at && (
                        <span className="h-2 w-2 rounded-full bg-adv-teal flex-shrink-0 mt-1" />
                      )}
                    </div>
                    {notification.message && (
                      <p className="text-xs text-adv-gray mt-0.5 line-clamp-1">
                        {notification.message}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[11px] text-adv-gray">{formatRelativeTime(notification.created_at)}</span>
                      {notification.link && <ExternalLink className="h-3 w-3 text-adv-gray" />}
                    </div>
                    {briefingIdFromLink(notification.link) && (
                      <InlineProposalRating briefingId={briefingIdFromLink(notification.link)!} />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {notifications.length > 0 && unreadCount === 0 && (
            <div className="px-4 py-2 border-t border-border text-center">
              <span className="text-xs text-adv-gray flex items-center justify-center gap-1">
                <Check className="h-3 w-3" />
                All caught up
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
