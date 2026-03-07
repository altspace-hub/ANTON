import { useEffect, useState, useCallback } from 'react';
import { Calendar, Plus, AlertTriangle, Search, Brain, Loader2, X } from 'lucide-react';
import type { Deadline, DeadlineLabel, Project, ViewType, FilterType } from '../components/deadlines/types';
import { apiGet, apiPost, apiDelete } from '../components/deadlines/types';
import ViewSwitcher from '../components/deadlines/ViewSwitcher';
import DeadlineListView from '../components/deadlines/DeadlineListView';
import DeadlineKanbanView from '../components/deadlines/DeadlineKanbanView';
import DeadlineWeekView from '../components/deadlines/DeadlineWeekView';
import DeadlineMonthView from '../components/deadlines/DeadlineMonthView';
import DeadlineYearView from '../components/deadlines/DeadlineYearView';
import DeadlineForm from '../components/deadlines/DeadlineForm';
import DeadlineDetailPanel from '../components/deadlines/DeadlineDetailPanel';
import CapacityPlanner from '../components/deadlines/CapacityPlanner';
import WorkRhythmsSection from '../components/deadlines/WorkRhythmsSection';

export default function DeadlinesPage() {
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [labels, setLabels] = useState<DeadlineLabel[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewType>('list');
  const [filter, setFilter] = useState<FilterType>('all');
  const [showForm, setShowForm] = useState(false);
  const [selectedDeadline, setSelectedDeadline] = useState<Deadline | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dls, lbls, projs] = await Promise.all([
        apiGet<Deadline[]>('/api/deadlines'),
        apiGet<DeadlineLabel[]>('/api/deadline-labels').catch(() => [] as DeadlineLabel[]),
        apiGet<Project[]>('/api/projects').catch(() => [] as Project[]),
      ]);
      setDeadlines(dls);
      setLabels(lbls);
      setProjects(projs);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleComplete(id: string) {
    try {
      await apiPost<Deadline>(`/api/deadlines/${id}/complete`, {});
      setDeadlines((prev) =>
        prev.map((d) =>
          d.id === id
            ? { ...d, status: 'completed' as const, completed_at: new Date().toISOString() }
            : d
        )
      );
      if (selectedDeadline?.id === id) {
        setSelectedDeadline(prev =>
          prev ? { ...prev, status: 'completed' as const, completed_at: new Date().toISOString() } : null
        );
      }
    } catch {
      // ignore
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this deadline?')) return;
    try {
      await apiDelete(`/api/deadlines/${id}`);
      setDeadlines((prev) => prev.filter((d) => d.id !== id));
      if (selectedDeadline?.id === id) {
        setSelectedDeadline(null);
      }
    } catch {
      // ignore
    }
  }

  function handleAdded(d: Deadline) {
    setDeadlines((prev) => [d, ...prev]);
    setShowForm(false);
  }

  function handleUpdate(updated: Deadline) {
    setDeadlines((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
    if (selectedDeadline?.id === updated.id) {
      setSelectedDeadline(updated);
    }
  }

  function handleSelect(d: Deadline) {
    setSelectedDeadline(d);
  }

  function handleSelectMonth(_year: number, _month: number) {
    // Switch to month view when clicking a month in year view
    setView('month');
  }

  // Search filtering
  const searchFiltered = searchQuery.trim()
    ? deadlines.filter(d =>
        d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (d.description && d.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        d.category.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : deadlines;

  const overdueCount = deadlines.filter(d => d.status === 'overdue').length;
  const atRiskCount = deadlines.filter(d => d.status === 'at_risk').length;
  const urgentCount = overdueCount + atRiskCount;

  // AI Priority Review state
  const [aiReview, setAiReview] = useState<{ summary: string; orderedIds: string[]; flags: { id: string; flag: string; message: string }[]; recommendations: string[] } | null>(null);
  const [aiReviewLoading, setAiReviewLoading] = useState(false);
  const [showAiReview, setShowAiReview] = useState(false);

  async function runAiPriorityReview() {
    setAiReviewLoading(true);
    setShowAiReview(true);
    try {
      const pending = deadlines.filter(d => d.status !== 'completed').slice(0, 30);
      const r = await fetch('/api/ai-assist/deadline-prioritise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deadlines: pending.map(d => ({ id: d.id, title: d.title, due_date: d.due_date, priority: d.priority, status: d.status, description: d.description })) }),
      });
      if (r.ok) setAiReview(await r.json());
    } catch { /* ignore */ } finally { setAiReviewLoading(false); }
  }

  return (
    <div className="mx-auto max-w-5xl">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-adv-white flex items-center gap-2">
            <Calendar className="h-6 w-6 text-adv-teal" />
            Deadlines &amp; Schedule
          </h1>
          <p className="mt-1 text-sm text-adv-gray">
            Track regulatory and project deadlines with automatic start-date calculation.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-adv-gray-med" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search deadlines..."
              className="w-56 rounded-lg border border-border bg-adv-dark pl-9 pr-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
            />
          </div>

          {/* View Switcher */}
          <ViewSwitcher active={view} onChange={setView} />

          {/* AI Priority Review */}
          <button
            onClick={runAiPriorityReview}
            disabled={aiReviewLoading || deadlines.length === 0}
            className="flex items-center gap-2 rounded-lg border border-adv-teal/40 bg-adv-teal/10 px-3 py-2 text-sm text-adv-teal hover:bg-adv-teal/20 disabled:opacity-40 transition-colors"
            title="Let AI prioritise and flag your current deadlines"
          >
            {aiReviewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
            AI Priority Review
          </button>

          {/* Add button */}
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2.5 text-sm font-semibold text-adv-dark transition-colors hover:bg-adv-teal-dark"
          >
            <Plus className="h-4 w-4" />
            Add Task
          </button>
        </div>
      </div>

      {/* AI Priority Review panel */}
      {showAiReview && (
        <div className="mb-4 rounded-xl border border-adv-teal/30 bg-adv-teal-soft p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-adv-teal shrink-0" />
              <span className="text-sm font-semibold text-adv-off-white">AI Priority Review</span>
            </div>
            <button onClick={() => setShowAiReview(false)} className="text-adv-gray hover:text-adv-off-white"><X className="h-4 w-4" /></button>
          </div>
          {aiReviewLoading && <p className="text-sm text-adv-gray animate-pulse">Analysing your deadlines…</p>}
          {aiReview && !aiReviewLoading && (
            <div className="space-y-3">
              <p className="text-sm text-adv-off-white">{aiReview.summary}</p>
              {aiReview.flags.length > 0 && (
                <div className="space-y-1">
                  {aiReview.flags.map((f, i) => {
                    const dl = deadlines.find(d => d.id === f.id);
                    return (
                      <div key={i} className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${f.flag === 'warning' ? 'bg-adv-gold/10 text-adv-gold' : 'bg-adv-blue/10 text-adv-blue'}`}>
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <span><strong>{dl?.title ?? f.id}:</strong> {f.message}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {aiReview.recommendations.length > 0 && (
                <ul className="space-y-1">
                  {aiReview.recommendations.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-adv-off-white">
                      <span className="text-adv-teal mt-0.5">→</span>{r}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* Urgent summary bar */}
      {urgentCount > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-adv-red/30 bg-adv-red/5 px-4 py-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-adv-red" />
          <span className="text-sm text-adv-off-white">
            <strong className="text-adv-red">{urgentCount} urgent</strong>:
            {overdueCount > 0 && <> {overdueCount} overdue</>}
            {overdueCount > 0 && atRiskCount > 0 && ','}
            {atRiskCount > 0 && <> {atRiskCount} at risk</>}
          </span>
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <DeadlineForm
          onAdded={handleAdded}
          onCancel={() => setShowForm(false)}
          projects={projects}
          labels={labels}
        />
      )}

      {/* Loading / Error states */}
      {loading ? (
        <div className="rounded-xl border border-border bg-adv-card p-8 text-center">
          <p className="text-sm text-adv-gray-med">Loading deadlines...</p>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-adv-red/30 bg-adv-red/5 p-6">
          <p className="text-sm text-adv-red">{error}</p>
        </div>
      ) : (
        <>
          {/* Active view */}
          {view === 'list' && (
            <DeadlineListView
              deadlines={searchFiltered}
              labels={labels}
              filter={filter}
              onFilterChange={setFilter}
              onComplete={handleComplete}
              onDelete={handleDelete}
              onSelect={handleSelect}
              onRefresh={loadData}
            />
          )}
          {view === 'kanban' && (
            <DeadlineKanbanView
              deadlines={searchFiltered}
              labels={labels}
              onSelect={handleSelect}
              onUpdate={handleUpdate}
              onRefresh={loadData}
            />
          )}
          {view === 'week' && (
            <DeadlineWeekView
              deadlines={searchFiltered}
              labels={labels}
              onSelect={handleSelect}
            />
          )}
          {view === 'month' && (
            <DeadlineMonthView
              deadlines={searchFiltered}
              labels={labels}
              onSelect={handleSelect}
            />
          )}
          {view === 'year' && (
            <DeadlineYearView
              deadlines={searchFiltered}
              onSelectMonth={handleSelectMonth}
            />
          )}
        </>
      )}

      {/* Capacity planner (collapsible) */}
      <CapacityPlanner />

      {/* Work rhythms (collapsible) */}
      <WorkRhythmsSection />

      {/* Detail panel (slide-out) */}
      {selectedDeadline && (
        <DeadlineDetailPanel
          deadline={selectedDeadline}
          labels={labels}
          projects={projects}
          onClose={() => setSelectedDeadline(null)}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
