/**
 * InsightsBell.tsx
 * Notification bell for proactive intelligence insights.
 * Shows unread count badge; clicking opens the insights panel.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Bell, X, Lightbulb, AlertTriangle, TrendingUp, Search, AlertCircle, Zap } from 'lucide-react';

interface Insight {
  id: string;
  insight_type: 'pattern' | 'gap' | 'conflict' | 'opportunity' | 'risk' | 'trend';
  title: string;
  body: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  area_id: string | null;
  dismissed: boolean;
  read: boolean;
  created_at: string;
}

const INSIGHT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  pattern: Lightbulb,
  gap: Search,
  conflict: AlertTriangle,
  opportunity: Zap,
  risk: AlertCircle,
  trend: TrendingUp,
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'text-red-400 border-red-400/20 bg-red-400/5',
  high: 'text-adv-gold border-adv-gold/20 bg-adv-gold/5',
  medium: 'text-adv-teal border-adv-teal/20 bg-adv-teal/5',
  low: 'text-adv-gray border-white/10 bg-white/3',
  info: 'text-adv-blue border-adv-blue/20 bg-adv-blue/5',
};

const BADGE_COLORS: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-adv-gold',
  medium: 'bg-adv-teal',
  low: 'bg-adv-gray',
  info: 'bg-adv-blue',
};

export function InsightsBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchUnreadCount();
    // Poll every 2 minutes
    const interval = setInterval(fetchUnreadCount, 120_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  async function fetchUnreadCount() {
    try {
      const res = await fetch('/api/insights/unread-count');
      if (res.ok) {
        const data = await res.json() as { count: number };
        setUnreadCount(data.count);
      }
    } catch { /* non-fatal */ }
  }

  async function handleOpen() {
    setOpen(!open);
    if (!open) {
      setLoading(true);
      try {
        const res = await fetch('/api/insights?dismissed=false&limit=20');
        if (res.ok) {
          const data = await res.json() as { insights: Insight[]; unread_count: number };
          setInsights(data.insights);
          setUnreadCount(data.unread_count);
        }
      } finally {
        setLoading(false);
      }
    }
  }

  async function handleMarkRead(insightId: string) {
    await fetch(`/api/insights/${insightId}/read`, { method: 'PATCH' });
    setInsights((prev) => prev.map((i) => i.id === insightId ? { ...i, read: true } : i));
    setUnreadCount((c) => Math.max(0, c - 1));
  }

  async function handleDismiss(insightId: string) {
    // Capture wasUnread BEFORE removing from state (stale-closure fix)
    const wasUnread = insights.find((i) => i.id === insightId)?.read === false;
    await fetch(`/api/insights/${insightId}/dismiss`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    setInsights((prev) => prev.filter((i) => i.id !== insightId));
    if (wasUnread) setUnreadCount((c) => Math.max(0, c - 1));
  }

  // Determine badge color from highest severity unread insight
  const highestSeverity = insights
    .filter((i) => !i.read)
    .map((i) => i.severity)
    .sort((a, b) => ['critical','high','medium','low','info'].indexOf(a) - ['critical','high','medium','low','info'].indexOf(b))[0] ?? 'info';

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={handleOpen}
        className="relative p-2 rounded-lg text-adv-gray hover:text-adv-off-white hover:bg-white/5 transition-colors"
        aria-label={`${unreadCount} proactive insights`}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className={`absolute top-0.5 right-0.5 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold text-adv-dark rounded-full px-1 ${BADGE_COLORS[highestSeverity] || 'bg-adv-teal'}`}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          role="region"
          aria-label="Proactive insights panel"
          className="absolute right-0 top-full mt-2 w-96 max-h-[480px] overflow-y-auto bg-adv-card border border-white/10 rounded-xl shadow-2xl z-50"
        >
          <div className="sticky top-0 bg-adv-card border-b border-white/10 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-adv-teal" />
              <span className="font-medium text-adv-off-white text-sm">Proactive Insights</span>
              {unreadCount > 0 && (
                <span className="text-xs bg-adv-teal/20 text-adv-teal px-2 py-0.5 rounded-full">{unreadCount} new</span>
              )}
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close insights panel" className="text-adv-gray hover:text-adv-off-white">
              <X className="w-4 h-4" />
            </button>
          </div>

          {loading && (
            <div className="p-4 space-y-3">
              {[0,1,2].map((i) => (
                <div key={i} className="animate-pulse bg-white/5 rounded-lg h-16" />
              ))}
            </div>
          )}

          {!loading && insights.length === 0 && (
            <div className="p-6 text-center">
              <Lightbulb className="w-8 h-8 text-adv-gray mx-auto mb-2 opacity-50" />
              <p className="text-sm text-adv-gray">No active insights</p>
              <p className="text-xs text-adv-gray/60 mt-1">ANTON will surface patterns and gaps as you work</p>
            </div>
          )}

          {!loading && insights.map((insight) => {
            const Icon = INSIGHT_ICONS[insight.insight_type] || Lightbulb;
            const colorClass = SEVERITY_COLORS[insight.severity] || SEVERITY_COLORS.info;

            return (
              <div
                key={insight.id}
                className={`border-b border-white/5 last:border-0 p-3 transition-colors ${!insight.read ? 'bg-white/[0.02]' : ''}`}
                onClick={() => !insight.read && handleMarkRead(insight.id)}
              >
                <div className={`border rounded-lg p-3 ${colorClass}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      <Icon className="w-4 h-4 mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium leading-snug">{insight.title}</p>
                        {!insight.read && (
                          <span className="inline-block text-[10px] bg-current/20 px-1.5 py-0.5 rounded mt-0.5 opacity-70">NEW</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDismiss(insight.id); }}
                      className="shrink-0 opacity-50 hover:opacity-100 transition-opacity"
                      aria-label={`Dismiss: ${insight.title}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-xs mt-2 opacity-80 leading-relaxed line-clamp-3">{insight.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
