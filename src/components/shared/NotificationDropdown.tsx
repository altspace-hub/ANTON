import { useState, useEffect, useRef } from 'react';
import { Bell, Check, CheckCheck, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Notification {
  id: string;
  type: 'scheduled_workflow' | 'radar_scan' | 'system';
  title: string;
  message?: string;
  link?: string;
  read_at: string | null;
  created_at: string;
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
        setNotifications(data);
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
          <span className="absolute -top-0.5 -right-0.5 h-4 w-4 bg-adv-red text-white text-[10px] font-bold rounded-full flex items-center justify-center">
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
              <div className="py-8 text-center text-sm text-adv-gray-med">
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
                      <span className="text-[11px] text-adv-gray-med">{formatRelativeTime(notification.created_at)}</span>
                      {notification.link && <ExternalLink className="h-3 w-3 text-adv-gray-med" />}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {notifications.length > 0 && unreadCount === 0 && (
            <div className="px-4 py-2 border-t border-border text-center">
              <span className="text-xs text-adv-gray-med flex items-center justify-center gap-1">
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
