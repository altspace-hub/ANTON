/**
 * CivicPage.tsx
 *
 * Dashboard for the Civic Pillar — lists active civic engagements,
 * shows upcoming deadlines, and provides a "New Engagement" entry point.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Landmark, Plus, AlertCircle, Clock, ChevronRight, Loader2 } from 'lucide-react';
import { getAuthHeader, fetchWithAuth } from '@/lib/api';

// ── Types ────────────────────────────────────────────────────────────

interface CivicEngagement {
  id: string;
  title: string;
  goal: string | null;
  jurisdiction: string | null;
  domain: string | null;
  phase: 'situation' | 'mapping' | 'eligibility' | 'gap' | 'complete' | 'track';
  urgency: 'low' | 'medium' | 'high' | 'critical';
  created_at: string;
  updated_at: string;
}

interface CivicDeadline {
  id: string;
  engagement_id: string;
  engagement_title: string;
  label: string;
  due_date: string;
  days_remaining: number;
}

// ── Constants ────────────────────────────────────────────────────────

const PHASE_LABELS: Record<string, { label: string; color: string }> = {
  situation:   { label: 'Situation',   color: 'text-adv-blue bg-adv-blue/10 border-adv-blue/30' },
  mapping:     { label: 'Mapping',     color: 'text-adv-gold bg-adv-gold/10 border-adv-gold/30' },
  eligibility: { label: 'Eligibility', color: 'text-purple-400 bg-purple-500/10 border-purple-500/30' },
  gap:         { label: 'Gap',         color: 'text-adv-red bg-adv-red/10 border-adv-red/30' },
  complete:    { label: 'Complete',    color: 'text-adv-teal bg-adv-teal-dim border-adv-teal/30' },
  track:       { label: 'Track',       color: 'text-adv-green bg-adv-green/10 border-adv-green/30' },
};

const URGENCY_INDICATOR: Record<string, { dot: string; label: string }> = {
  low:      { dot: 'bg-adv-gray',  label: 'Low' },
  medium:   { dot: 'bg-adv-blue',  label: 'Medium' },
  high:     { dot: 'bg-adv-gold',  label: 'High' },
  critical: { dot: 'bg-adv-red',   label: 'Critical' },
};

// ── Helpers ──────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatDeadlineDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ── Component ────────────────────────────────────────────────────────

export default function CivicPage() {
  const navigate = useNavigate();
  const [engagements, setEngagements] = useState<CivicEngagement[]>([]);
  const [deadlines, setDeadlines] = useState<CivicDeadline[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newGoal, setNewGoal] = useState('');
  const [newJurisdiction, setNewJurisdiction] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  // Prefill from Pathfinder's "start_civic" smart action — consume the
  // sessionStorage handoff once and open the new-engagement modal.
  useEffect(() => {
    const raw = sessionStorage.getItem('civic-prefill');
    if (!raw) return;
    sessionStorage.removeItem('civic-prefill');
    try {
      const prefill = JSON.parse(raw) as { title?: string; goal?: string; jurisdiction?: string };
      if (prefill.title) setNewTitle(prefill.title);
      if (prefill.goal) setNewGoal(prefill.goal);
      if (prefill.jurisdiction) setNewJurisdiction(prefill.jurisdiction);
      setShowNewModal(true);
    } catch { /* malformed prefill — ignore */ }
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [engRes, deadlineRes] = await Promise.all([
        fetch('/api/civic/engagements', { headers: getAuthHeader() }),
        fetch('/api/civic/deadlines?days=14', { headers: getAuthHeader() }),
      ]);
      if (engRes.ok) {
        const engData = await engRes.json();
        setEngagements(engData.engagements ?? engData ?? []);
      }
      if (deadlineRes.ok) {
        const dlData = await deadlineRes.json();
        setDeadlines(dlData.submissions ?? dlData ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  async function createEngagement() {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const res = await fetchWithAuth('/api/civic/engagements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim(),
          goal: newGoal.trim() || null,
          jurisdiction: newJurisdiction.trim() || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const eng = data.engagement ?? data;
        navigate(`/civic/engagement/${eng.id}`);
      }
    } finally {
      setCreating(false);
    }
  }

  // ── Derived stats ──────────────────────────────────────────────────

  const totalEngagements = engagements.length;
  const activeEngagements = engagements.filter(
    (e) => e.phase !== 'track' && e.phase !== 'complete',
  ).length;
  const withDeadlines = deadlines.length;

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-adv-white flex items-center gap-2">
            <Landmark className="h-6 w-6 text-adv-teal" />
            Civic
          </h1>
          <p className="mt-1 text-sm text-adv-gray">
            Navigate government processes and public institutions
          </p>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Engagement
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-adv-card border border-border rounded-xl p-4">
          <p className="text-xs text-adv-gray uppercase tracking-wider mb-1">Total</p>
          <p className="text-2xl font-bold text-adv-off-white">{totalEngagements}</p>
        </div>
        <div className="bg-adv-card border border-border rounded-xl p-4">
          <p className="text-xs text-adv-gray uppercase tracking-wider mb-1">Active</p>
          <p className="text-2xl font-bold text-adv-teal">{activeEngagements}</p>
        </div>
        <div className="bg-adv-card border border-border rounded-xl p-4">
          <p className="text-xs text-adv-gray uppercase tracking-wider mb-1">Upcoming Deadlines</p>
          <p className="text-2xl font-bold text-adv-gold">{withDeadlines}</p>
        </div>
      </div>

      {/* Upcoming deadlines alert */}
      {deadlines.length > 0 && (
        <div className="rounded-xl border border-adv-gold/30 bg-adv-gold/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-adv-gold" />
            <h2 className="text-sm font-semibold text-adv-gold">Upcoming Deadlines</h2>
          </div>
          <div className="space-y-2">
            {deadlines.map((dl) => (
              <div
                key={dl.id}
                onClick={() => navigate(`/civic/engagement/${dl.engagement_id}`)}
                className="flex items-center justify-between rounded-lg bg-adv-card border border-border px-4 py-3 cursor-pointer hover:border-adv-gold/40 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-adv-off-white">{dl.label}</p>
                  <p className="text-xs text-adv-gray">{dl.engagement_title}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-sm text-adv-off-white">{formatDeadlineDate(dl.due_date)}</p>
                    <p className={`text-xs ${dl.days_remaining <= 3 ? 'text-adv-red' : 'text-adv-gold'}`}>
                      {dl.days_remaining === 0
                        ? 'Today'
                        : dl.days_remaining === 1
                          ? 'Tomorrow'
                          : `${dl.days_remaining} days`}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-adv-gray" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Engagement list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-adv-teal" />
        </div>
      ) : engagements.length === 0 ? (
        <div className="text-center py-20">
          <Landmark className="h-12 w-12 text-adv-gray mx-auto mb-4" />
          <p className="text-adv-gray text-sm">
            No civic engagements yet. Click "New Engagement" to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {engagements.map((eng) => {
            const phase = PHASE_LABELS[eng.phase] || PHASE_LABELS.situation;
            const urgency = URGENCY_INDICATOR[eng.urgency] || URGENCY_INDICATOR.low;
            return (
              <div
                key={eng.id}
                onClick={() => navigate(`/civic/engagement/${eng.id}`)}
                className="bg-adv-card border border-border rounded-xl p-5 cursor-pointer hover:border-adv-teal/40 transition-all group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-adv-off-white text-base truncate">
                        {eng.title}
                      </h3>
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full border ${phase.color}`}
                      >
                        {phase.label}
                      </span>
                      {eng.domain && (
                        <span className="text-xs px-2 py-0.5 rounded-full border border-border text-adv-gray">
                          {eng.domain}
                        </span>
                      )}
                      {/* Urgency dot */}
                      <span className="flex items-center gap-1 text-xs text-adv-gray">
                        <span className={`inline-block h-2 w-2 rounded-full ${urgency.dot}`} />
                        {urgency.label}
                      </span>
                    </div>
                    {eng.goal && (
                      <p className="mt-1 text-sm text-adv-gray line-clamp-2">{eng.goal}</p>
                    )}
                    <div className="mt-3 flex items-center gap-4 text-xs text-adv-gray">
                      {eng.jurisdiction && <span>{eng.jurisdiction}</span>}
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {timeAgo(eng.updated_at)}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-adv-teal opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New Engagement Modal */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-adv-card border border-border rounded-2xl w-full max-w-lg p-6 space-y-5">
            <h2 className="text-lg font-semibold text-adv-white">New Civic Engagement</h2>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-adv-gray mb-1">Title *</label>
                <input
                  autoFocus
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && createEngagement()}
                  placeholder="e.g. Building Permit Application — Stockholm"
                  className="w-full bg-adv-dark-2 border border-border rounded-lg px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray-med focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:border-adv-teal"
                />
              </div>
              <div>
                <label className="block text-xs text-adv-gray mb-1">Goal</label>
                <textarea
                  value={newGoal}
                  onChange={(e) => setNewGoal(e.target.value)}
                  placeholder="What are you trying to accomplish?"
                  rows={3}
                  className="w-full bg-adv-dark-2 border border-border rounded-lg px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray-med focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:border-adv-teal resize-none"
                />
              </div>
              <div>
                <label className="block text-xs text-adv-gray mb-1">Jurisdiction</label>
                <input
                  value={newJurisdiction}
                  onChange={(e) => setNewJurisdiction(e.target.value)}
                  placeholder="e.g. Sweden, Stockholm Municipality"
                  className="w-full bg-adv-dark-2 border border-border rounded-lg px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray-med focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:border-adv-teal"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => {
                  setShowNewModal(false);
                  setNewTitle('');
                  setNewGoal('');
                  setNewJurisdiction('');
                }}
                className="px-4 py-2 rounded-lg border border-border text-sm text-adv-gray hover:text-adv-off-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createEngagement}
                disabled={!newTitle.trim() || creating}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-adv-teal text-adv-dark text-sm font-medium hover:bg-adv-teal-dark disabled:opacity-50 transition-colors"
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Create Engagement
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
