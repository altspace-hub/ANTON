/**
 * LONE-10: Teacher Oversight Dashboard for School Mode.
 *
 * Shows:
 *  - Per-student AI usage (session counts, message counts, last active)
 *  - Flagged interactions (safety filter triggers, off-topic requests)
 *  - Class-level usage analytics (daily active, avg response quality)
 *  - Session drill-down (view full conversation transcript)
 */

import { useState, useEffect } from 'react';
import { getAuthHeader } from '@/lib/api';
import { Link } from 'react-router-dom';
import {
  Shield,
  Users,
  MessageSquare,
  AlertTriangle,
  Eye,
  Calendar,
  TrendingUp,
  ChevronDown,
  ChevronRight,
  Clock,
  Filter,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';
import SchoolLayout from '@/components/school/SchoolLayout';

// ── Types ──────────────────────────────────────────────────────

interface StudentUsageSummary {
  userId: string;
  displayName: string;
  classId: string;
  className: string;
  sessionCount: number;
  messageCount: number;
  lastActiveAt: string | null;
  flaggedCount: number;
  avgSessionMinutes: number;
}

interface FlaggedInteraction {
  id: string;
  userId: string;
  displayName: string;
  sessionId: string;
  flagType: 'safety' | 'off_topic' | 'personal_info' | 'inappropriate' | 'other';
  flagReason: string;
  messagePreview: string;
  flaggedAt: string;
  resolved: boolean;
}

interface OversightSummary {
  totalStudents: number;
  activeToday: number;
  totalSessionsToday: number;
  totalFlagged: number;
  unresolvedFlags: number;
  avgMessagesPerSession: number;
}

interface ClassOption {
  id: string;
  name: string;
}

// ── Constants ──────────────────────────────────────────────────

const FLAG_TYPE_LABELS: Record<string, string> = {
  safety: 'Safety concern',
  off_topic: 'Off-topic',
  personal_info: 'Personal info shared',
  inappropriate: 'Inappropriate content',
  other: 'Other',
};

const FLAG_TYPE_COLORS: Record<string, string> = {
  safety: 'text-adv-red bg-adv-red/10',
  off_topic: 'text-adv-gold bg-adv-gold/10',
  personal_info: 'text-orange-400 bg-orange-400/10',
  inappropriate: 'text-adv-red bg-adv-red/10',
  other: 'text-adv-gray bg-adv-gray/10',
};

// ── Component ──────────────────────────────────────────────────

export default function TeacherOversightPage() {
  const [summary, setSummary] = useState<OversightSummary | null>(null);
  const [students, setStudents] = useState<StudentUsageSummary[]>([]);
  const [flags, setFlags] = useState<FlaggedInteraction[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'overview' | 'students' | 'flags'>('overview');
  const [isLoading, setIsLoading] = useState(true);
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);
  const [resolvingFlag, setResolvingFlag] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<'today' | '7d' | '30d'>('7d');

  useEffect(() => {
    loadData();
  }, [selectedClass, dateRange]);

  async function loadData() {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedClass !== 'all') params.set('classId', selectedClass);
      params.set('range', dateRange);

      const [summaryRes, studentsRes, flagsRes, classesRes] = await Promise.all([
        fetch(`/api/school/oversight/summary?${params}`, { headers: getAuthHeader() }),
        fetch(`/api/school/oversight/students?${params}`, { headers: getAuthHeader() }),
        fetch(`/api/school/oversight/flags?${params}`, { headers: getAuthHeader() }),
        fetch('/api/school/classes', { headers: getAuthHeader() }),
      ]);

      if (summaryRes.ok) setSummary(await summaryRes.json());
      if (studentsRes.ok) setStudents(await studentsRes.json());
      if (flagsRes.ok) setFlags(await flagsRes.json());
      if (classesRes.ok) {
        const cls = await classesRes.json();
        setClasses(cls.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
      }
    } catch { /* non-fatal */ }
    finally { setIsLoading(false); }
  }

  async function resolveFlag(flagId: string) {
    setResolvingFlag(flagId);
    try {
      const res = await fetch(`/api/school/oversight/flags/${flagId}/resolve`, {
        method: 'POST',
        headers: getAuthHeader(),
      });
      if (res.ok) {
        setFlags(prev => prev.map(f => f.id === flagId ? { ...f, resolved: true } : f));
      }
    } catch { /* non-fatal */ }
    finally { setResolvingFlag(null); }
  }

  const unresolvedFlags = flags.filter(f => !f.resolved);
  const resolvedFlags = flags.filter(f => f.resolved);

  return (
    <SchoolLayout>
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-adv-teal/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-adv-teal" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-adv-white">AI Oversight Dashboard</h1>
              <p className="text-sm text-adv-gray">Monitor student AI usage and safety</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Date range filter */}
            <div className="flex items-center gap-1 bg-adv-card rounded-lg p-1">
              {(['today', '7d', '30d'] as const).map(r => (
                <button
                  key={r}
                  onClick={() => setDateRange(r)}
                  className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                    dateRange === r ? 'bg-adv-teal text-adv-dark font-medium' : 'text-adv-gray hover:text-adv-white'
                  }`}
                >
                  {r === 'today' ? 'Today' : r === '7d' ? '7 days' : '30 days'}
                </button>
              ))}
            </div>

            {/* Class filter */}
            <select
              value={selectedClass}
              onChange={e => setSelectedClass(e.target.value)}
              className="bg-adv-card border border-white/10 text-adv-off-white text-sm rounded-lg px-3 py-2"
            >
              <option value="all">All classes</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>

            <button
              onClick={loadData}
              className="p-2 text-adv-gray hover:text-adv-white bg-adv-card rounded-lg border border-white/10"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Summary cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
            <SummaryCard icon={<Users className="w-4 h-4" />} label="Total students" value={summary.totalStudents} color="text-adv-teal" />
            <SummaryCard icon={<TrendingUp className="w-4 h-4" />} label="Active today" value={summary.activeToday} color="text-adv-green" />
            <SummaryCard icon={<MessageSquare className="w-4 h-4" />} label="Sessions today" value={summary.totalSessionsToday} color="text-adv-blue" />
            <SummaryCard icon={<Calendar className="w-4 h-4" />} label="Avg msgs/session" value={summary.avgMessagesPerSession.toFixed(1)} color="text-adv-teal" />
            <SummaryCard icon={<AlertTriangle className="w-4 h-4" />} label="Total flagged" value={summary.totalFlagged} color="text-adv-gold" />
            <SummaryCard
              icon={<AlertTriangle className="w-4 h-4" />}
              label="Unresolved flags"
              value={summary.unresolvedFlags}
              color={summary.unresolvedFlags > 0 ? 'text-adv-red' : 'text-adv-green'}
              highlight={summary.unresolvedFlags > 0}
            />
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-adv-card/50 rounded-xl p-1 w-fit">
          {[
            { id: 'overview', label: 'Overview', icon: <Eye className="w-4 h-4" /> },
            { id: 'students', label: `Students (${students.length})`, icon: <Users className="w-4 h-4" /> },
            { id: 'flags', label: `Flags (${unresolvedFlags.length} unresolved)`, icon: <AlertTriangle className="w-4 h-4" /> },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-adv-teal text-adv-dark'
                  : 'text-adv-gray hover:text-adv-white'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="w-6 h-6 text-adv-teal animate-spin" />
          </div>
        ) : (
          <>
            {/* Overview tab */}
            {activeTab === 'overview' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Top active students */}
                <div className="bg-adv-card rounded-xl border border-white/10 p-5">
                  <h3 className="text-sm font-semibold text-adv-white mb-4 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-adv-teal" />
                    Most active students
                  </h3>
                  {students.length === 0 ? (
                    <p className="text-sm text-adv-gray">No usage data yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {[...students]
                        .sort((a, b) => b.messageCount - a.messageCount)
                        .slice(0, 5)
                        .map(s => (
                          <div key={s.userId} className="flex items-center justify-between text-sm">
                            <span className="text-adv-off-white">{s.displayName}</span>
                            <div className="flex items-center gap-3">
                              <span className="text-adv-gray">{s.className}</span>
                              <span className="text-adv-teal font-medium">{s.messageCount} msgs</span>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>

                {/* Recent unresolved flags */}
                <div className="bg-adv-card rounded-xl border border-white/10 p-5">
                  <h3 className="text-sm font-semibold text-adv-white mb-4 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-adv-gold" />
                    Unresolved flags
                  </h3>
                  {unresolvedFlags.length === 0 ? (
                    <div className="flex items-center gap-2 text-adv-green text-sm">
                      <CheckCircle2 className="w-4 h-4" />
                      No unresolved flags — all clear.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {unresolvedFlags.slice(0, 4).map(f => (
                        <div key={f.id} className="p-3 rounded-lg bg-adv-dark border border-white/10">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${FLAG_TYPE_COLORS[f.flagType]}`}>
                                  {FLAG_TYPE_LABELS[f.flagType]}
                                </span>
                                <span className="text-xs text-adv-gray">{f.displayName}</span>
                              </div>
                              <p className="text-xs text-adv-off-white truncate">{f.messagePreview}</p>
                            </div>
                            <button
                              onClick={() => resolveFlag(f.id)}
                              disabled={resolvingFlag === f.id}
                              className="text-xs text-adv-teal hover:text-adv-teal-dark whitespace-nowrap"
                            >
                              {resolvingFlag === f.id ? 'Resolving…' : 'Resolve'}
                            </button>
                          </div>
                        </div>
                      ))}
                      {unresolvedFlags.length > 4 && (
                        <button
                          onClick={() => setActiveTab('flags')}
                          className="text-xs text-adv-teal hover:underline"
                        >
                          View all {unresolvedFlags.length} flags →
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Students tab */}
            {activeTab === 'students' && (
              <div className="bg-adv-card rounded-xl border border-white/10 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 bg-adv-dark/50">
                      <th className="text-left px-4 py-3 text-adv-gray font-medium">Student</th>
                      <th className="text-left px-4 py-3 text-adv-gray font-medium">Class</th>
                      <th className="text-right px-4 py-3 text-adv-gray font-medium">Sessions</th>
                      <th className="text-right px-4 py-3 text-adv-gray font-medium">Messages</th>
                      <th className="text-right px-4 py-3 text-adv-gray font-medium">Avg time</th>
                      <th className="text-right px-4 py-3 text-adv-gray font-medium">Flags</th>
                      <th className="text-left px-4 py-3 text-adv-gray font-medium">Last active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-adv-gray text-sm">
                          No student usage data for this period.
                        </td>
                      </tr>
                    )}
                    {students.map(s => (
                      <tr key={s.userId} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3">
                          <Link
                            to={`/school/teacher/students/${s.userId}`}
                            className="text-adv-off-white hover:text-adv-teal font-medium"
                          >
                            {s.displayName}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-adv-gray">{s.className}</td>
                        <td className="px-4 py-3 text-right text-adv-off-white">{s.sessionCount}</td>
                        <td className="px-4 py-3 text-right text-adv-off-white">{s.messageCount}</td>
                        <td className="px-4 py-3 text-right text-adv-gray">
                          {s.avgSessionMinutes > 0 ? `${Math.round(s.avgSessionMinutes)}m` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {s.flaggedCount > 0 ? (
                            <span className="text-adv-gold font-medium">{s.flaggedCount}</span>
                          ) : (
                            <span className="text-adv-gray">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-adv-gray text-xs">
                          {s.lastActiveAt ? new Date(s.lastActiveAt).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Flags tab */}
            {activeTab === 'flags' && (
              <div className="space-y-4">
                {unresolvedFlags.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-adv-red mb-3 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" />
                      Unresolved ({unresolvedFlags.length})
                    </h3>
                    {unresolvedFlags.map(f => (
                      <FlagCard key={f.id} flag={f} onResolve={resolveFlag} resolving={resolvingFlag === f.id} />
                    ))}
                  </div>
                )}
                {resolvedFlags.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-adv-gray mb-3 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      Resolved ({resolvedFlags.length})
                    </h3>
                    {resolvedFlags.map(f => (
                      <FlagCard key={f.id} flag={f} onResolve={resolveFlag} resolving={false} />
                    ))}
                  </div>
                )}
                {flags.length === 0 && (
                  <div className="text-center py-12 text-adv-gray">
                    <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-adv-green" />
                    <p className="text-sm">No flagged interactions in this period.</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </SchoolLayout>
  );
}

// ── Sub-components ─────────────────────────────────────────────

function SummaryCard({ icon, label, value, color, highlight }: {
  icon: React.ReactNode; label: string; value: string | number; color: string; highlight?: boolean;
}) {
  return (
    <div className={`bg-adv-card rounded-xl p-4 border ${highlight ? 'border-adv-red/30' : 'border-white/10'}`}>
      <div className={`flex items-center gap-2 mb-2 ${color}`}>{icon}</div>
      <div className="text-xl font-semibold text-adv-white">{value}</div>
      <div className="text-xs text-adv-gray mt-0.5">{label}</div>
    </div>
  );
}

function FlagCard({ flag, onResolve, resolving }: {
  flag: FlaggedInteraction;
  onResolve: (id: string) => void;
  resolving: boolean;
}) {
  return (
    <div className={`bg-adv-card rounded-xl border p-4 mb-3 ${flag.resolved ? 'border-white/5 opacity-60' : 'border-white/10'}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${FLAG_TYPE_COLORS[flag.flagType]}`}>
              {FLAG_TYPE_LABELS[flag.flagType]}
            </span>
            <span className="text-sm font-medium text-adv-off-white">{flag.displayName}</span>
            <span className="text-xs text-adv-gray">{new Date(flag.flaggedAt).toLocaleString()}</span>
            {flag.resolved && (
              <span className="text-xs text-adv-green flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Resolved
              </span>
            )}
          </div>
          <p className="text-xs text-adv-gray mb-2">{flag.flagReason}</p>
          <div className="bg-adv-dark rounded-lg p-3 text-xs text-adv-off-white font-mono leading-relaxed">
            {flag.messagePreview}
          </div>
        </div>
        {!flag.resolved && (
          <div className="flex flex-col gap-2 shrink-0">
            <Link
              to={`/school/teacher/sessions/${flag.sessionId}`}
              className="text-xs text-adv-teal hover:underline whitespace-nowrap"
            >
              View session →
            </Link>
            <button
              onClick={() => onResolve(flag.id)}
              disabled={resolving}
              className="text-xs text-adv-green hover:text-adv-green/80 whitespace-nowrap"
            >
              {resolving ? 'Resolving…' : '✓ Mark resolved'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
