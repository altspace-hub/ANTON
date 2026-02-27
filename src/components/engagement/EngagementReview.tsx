/**
 * EngagementReview.tsx
 * Phase 7: Review & Iteration
 *
 * 7A — Draft Review: read the output, approve when ready
 * 7B — Gap Analysis: Claude identifies what's missing; consultant adds context
 *       (text notes, documents, URLs) then re-executes for the next iteration
 */

import { useState, useRef } from 'react';
import {
  CheckCircle, AlertTriangle, Loader2, ChevronDown, ChevronUp,
  Search, FileText, RotateCcw, ThumbsUp, List, Zap, AlertCircle,
  Download, BarChart2, Plus, Upload, Link, MessageSquare, ArrowRight,
  Trash2, RefreshCw, Sliders, Brain, Users2, Play, Square
} from 'lucide-react';
import { getAuthHeader, streamMessage } from '@/lib/api';
import type { ModelId, StreamEvent } from '@/lib/types';
import type { EngagementData, Iteration, Resource } from '@/pages/EngagementWorkspacePage';

// ── Review lens definitions ───────────────────────────────────────────────────

interface ReviewLens {
  id: string;
  label: string;
  description: string;
  icon: string;
}

const REVIEW_LENSES: ReviewLens[] = [
  { id: 'scope',            label: 'Scope Coverage',        description: 'Gaps against agreed scope items',                  icon: '🎯' },
  { id: 'engagement_letter',label: 'Engagement Letter',     description: 'Compare vs original engagement letter commitments', icon: '📄' },
  { id: 'quality_blueprint',label: 'Quality Blueprint',     description: 'Against internal quality standards',               icon: '🏗️' },
  { id: 'regulatory',       label: 'Regulatory Scrutiny',   description: 'Robustness under regulatory challenge',            icon: '⚖️' },
  { id: 'client',           label: 'Client Perspective',    description: 'Tailored to this client\'s context',               icon: '🏢' },
  { id: 'red_team',         label: 'Red Team',              description: 'Adversarial challenge of assumptions',             icon: '🔴' },
  { id: 'senior_partner',   label: 'Senior Partner',        description: 'Board-level quality check before delivery',        icon: '🎖️' },
  { id: 'custom',           label: 'Custom',                description: 'Write your own review instruction',                icon: '✏️' },
];

interface Props {
  engagement: EngagementData;
  onUpdate: (updates: Partial<EngagementData>) => void;
  onReload: () => void;
  onNext?: () => void;       // → Quality Gate
  onReExecute?: () => void;  // → Execution (re-run)
}

interface GapItem {
  priority: 'high' | 'medium' | 'low';
  area: string;
  gap: string;
  suggestion: string;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function EngagementReview({ engagement, onReload, onNext, onReExecute }: Props) {
  const [activeTab, setActiveTab] = useState<'review' | 'gap' | 'council'>('review');
  const [expandedIteration, setExpandedIteration] = useState<string | null>(
    engagement.iterations.find(it => it.status === 'draft')?.id || null
  );
  const [generatingGap, setGeneratingGap] = useState<string | null>(null);
  const [approvingIteration, setApprovingIteration] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Lens state
  const [selectedLens, setSelectedLens] = useState<string>('scope');
  const [customInstruction, setCustomInstruction] = useState<string>('');
  const [lensOpen, setLensOpen] = useState(false);

  const iterations = engagement.iterations.slice().sort((a, b) => b.iteration_number - a.iteration_number);
  const latestDraft = iterations.find(it => it.status === 'draft');
  const approvedIterations = iterations.filter(it => it.status === 'approved');

  // Resources added after the most recent iteration was created — these are the "supplements" for next run
  const latestIterationDate = latestDraft?.created_at || iterations[0]?.created_at;
  const supplementResources = latestIterationDate
    ? engagement.resources.filter(r => r.uploaded_at > latestIterationDate)
    : [];

  async function generateGapAnalysis(iterationId: string) {
    setGeneratingGap(iterationId);
    setError(null);
    try {
      const res = await fetch(`/api/engagements/${engagement.id}/iterations/${iterationId}/gap-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          lens: selectedLens,
          custom_instruction: selectedLens === 'custom' ? customInstruction : undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      onReload();
    } catch (e) {
      setError(`Gap analysis failed: ${String(e)}`);
    } finally {
      setGeneratingGap(null);
    }
  }

  async function approveIteration(iterationId: string) {
    setApprovingIteration(iterationId);
    try {
      await fetch(`/api/engagements/${engagement.id}/iterations/${iterationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ status: 'approved' }),
      });
      onReload();
    } finally {
      setApprovingIteration(null);
    }
  }

  async function exportDraft(format: 'docx' | 'xlsx' | 'pdf' | 'md') {
    setExporting(format);
    try {
      const res = await fetch(`/api/engagements/${engagement.id}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ format }),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${engagement.title.replace(/\s+/g, '_')}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(`Export failed: ${e}`);
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-adv-teal mb-1">Phase 7</p>
        <h2 className="text-xl font-bold text-adv-white">Review & Iteration</h2>
        <p className="mt-1 text-sm text-adv-gray">
          Review the draft deliverable, identify gaps, add missing context, and re-execute until the output is ready to approve.
        </p>
      </div>

      {/* Status summary */}
      <div className="grid grid-cols-3 gap-3">
        <StatusTile label="Iterations" value={iterations.length} />
        <StatusTile label="Drafts pending" value={iterations.filter(it => it.status === 'draft').length} />
        <StatusTile label="Approved" value={approvedIterations.length} ok={approvedIterations.length > 0} />
      </div>

      {iterations.length === 0 && (
        <div className="text-center py-12">
          <FileText className="h-10 w-10 text-adv-gray-med mx-auto mb-3" />
          <p className="text-sm text-adv-off-white font-medium mb-1">No iterations yet</p>
          <p className="text-xs text-adv-gray">Go to Execution and run the engagement to generate the first draft.</p>
        </div>
      )}

      {iterations.length > 0 && (
        <>
          {/* Tabs */}
          <div className="flex border-b border-border gap-1">
            <TabBtn active={activeTab === 'review'} onClick={() => setActiveTab('review')} icon={FileText} label="Draft Review" />
            <TabBtn active={activeTab === 'gap'} onClick={() => setActiveTab('gap')} icon={Search} label={`Gap Analysis${latestDraft?.gap_analysis && latestDraft.gap_analysis !== '{}' ? ' ●' : ''}`} />
            {latestDraft && (
              <TabBtn active={activeTab === 'council'} onClick={() => setActiveTab('council')} icon={Users2} label="AI Council" />
            )}
          </div>

          {/* ── 7A: Draft Review ── */}
          {activeTab === 'review' && (
            <div className="space-y-4">
              {iterations.map(it => (
                <IterationCard
                  key={it.id}
                  iteration={it}
                  expanded={expandedIteration === it.id}
                  onToggle={() => setExpandedIteration(prev => prev === it.id ? null : it.id)}
                  approving={approvingIteration === it.id}
                  onApprove={() => approveIteration(it.id)}
                />
              ))}
            </div>
          )}

          {/* ── 7B: Gap Analysis + Iteration Context ── */}
          {activeTab === 'gap' && (
            <div className="space-y-5">
              <p className="text-sm text-adv-gray">
                ANTON (Haiku) analyses the draft and identifies what is missing or needs strengthening.
                Choose a review lens to control the perspective, add missing context, then re-execute.
              </p>

              {/* Lens selector */}
              <ReviewLensSelector
                selectedLens={selectedLens}
                onSelect={setSelectedLens}
                customInstruction={customInstruction}
                onCustomChange={setCustomInstruction}
                open={lensOpen}
                onToggle={() => setLensOpen(p => !p)}
              />

              {/* Gap analysis for latest draft */}
              {latestDraft && (
                <div className="bg-adv-card border border-border rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-adv-off-white">Iteration #{latestDraft.iteration_number} — Gap Analysis</p>
                      <p className="text-xs text-adv-gray-med mt-0.5">{new Date(latestDraft.created_at).toLocaleString()}</p>
                    </div>
                    {(!latestDraft.gap_analysis || latestDraft.gap_analysis === '{}') ? (
                      <button
                        onClick={() => generateGapAnalysis(latestDraft.id)}
                        disabled={!!generatingGap || (selectedLens === 'custom' && !customInstruction.trim())}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-adv-teal text-adv-dark text-xs font-semibold hover:bg-adv-teal-dark disabled:opacity-60 transition-colors"
                      >
                        {generatingGap === latestDraft.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                        Run Gap Analysis
                      </button>
                    ) : (
                      <button
                        onClick={() => generateGapAnalysis(latestDraft.id)}
                        disabled={!!generatingGap || (selectedLens === 'custom' && !customInstruction.trim())}
                        className="flex items-center gap-1 text-xs text-adv-gray hover:text-adv-teal transition-colors"
                      >
                        {generatingGap === latestDraft.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                        Re-run
                      </button>
                    )}
                  </div>

                  {generatingGap === latestDraft.id && (
                    <div className="flex items-center gap-2 text-xs text-adv-teal">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Analysing draft through {REVIEW_LENSES.find(l => l.id === selectedLens)?.label} lens…
                    </div>
                  )}

                  {latestDraft.gap_analysis && latestDraft.gap_analysis !== '{}' && (
                    <GapAnalysisDisplay gapJson={latestDraft.gap_analysis} />
                  )}
                </div>
              )}

              {/* ── Iteration Context Panel ── */}
              <IterationContextPanel
                engagement={engagement}
                supplementResources={supplementResources}
                onReload={onReload}
                onReExecute={onReExecute}
                iterationNumber={(latestDraft?.iteration_number ?? 0) + 1}
              />

              {/* Older iterations gap analyses */}
              {iterations.filter(it => it.id !== latestDraft?.id && it.gap_analysis && it.gap_analysis !== '{}').map(it => (
                <div key={it.id} className="bg-adv-card border border-border rounded-xl p-5 space-y-3 opacity-60">
                  <p className="text-xs text-adv-gray-med">Iteration #{it.iteration_number} gap analysis (superseded)</p>
                  <GapAnalysisDisplay gapJson={it.gap_analysis} />
                </div>
              ))}
            </div>
          )}

          {/* ── 7C: AI Council ── */}
          {activeTab === 'council' && latestDraft && (
            <CouncilPanel
              engagement={engagement}
              iteration={latestDraft}
              onSaved={onReload}
            />
          )}
        </>
      )}

      {/* Export */}
      {approvedIterations.length > 0 && (
        <div className="bg-adv-card border border-border rounded-xl p-4 space-y-3">
          <p className="text-sm font-medium text-adv-off-white flex items-center gap-2">
            <Download className="h-4 w-4 text-adv-teal" />
            Export Approved Deliverable
          </p>
          <div className="flex gap-2 flex-wrap">
            {([['md','Markdown (.md)',FileText],['docx','Word (.docx)',FileText],['xlsx','Excel (.xlsx)',BarChart2],['pdf','PDF (.pdf)',FileText]] as [string,string,React.ComponentType<{className?:string}>][]).map(([format, label, Icon]) => (
              <button
                key={format}
                onClick={() => exportDraft(format as 'docx'|'xlsx'|'pdf'|'md')}
                disabled={!!exporting}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-sm text-adv-gray hover:text-adv-teal hover:border-adv-teal/40 transition-colors disabled:opacity-50"
              >
                {exporting === format ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Continue to Quality Gate */}
      {approvedIterations.length > 0 && onNext && (
        <div className="flex justify-end">
          <button
            onClick={onNext}
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-adv-teal text-adv-dark text-sm font-medium hover:bg-adv-teal-dark transition-colors"
          >
            Continue to Quality Gate
            <CheckCircle className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-adv-red/10 border border-adv-red/30 px-4 py-3 text-sm text-adv-red">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}
    </div>
  );
}

// ── IterationContextPanel ─────────────────────────────────────────────────────
// The "feed" panel where you add context to address gaps before re-executing.

type AddMode = 'note' | 'file' | 'url' | null;

function IterationContextPanel({
  engagement, supplementResources, onReload, onReExecute, iterationNumber
}: {
  engagement: EngagementData;
  supplementResources: Resource[];
  onReload: () => void;
  onReExecute?: () => void;
  iterationNumber: number;
}) {
  const [addMode, setAddMode] = useState<AddMode>(null);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteText, setNoteText] = useState('');
  const [noteCategory, setNoteCategory] = useState<'meetings' | 'documents' | 'other'>('meetings');
  const [urlInput, setUrlInput] = useState('');
  const [urlTitle, setUrlTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function saveNote() {
    if (!noteText.trim()) return;
    setSaving(true);
    try {
      await fetch(`/api/engagements/${engagement.id}/resources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          category: noteCategory,
          title: noteTitle.trim() || `Note — ${new Date().toLocaleDateString()}`,
          text_content: noteText.trim(),
        }),
      });
      setNoteTitle('');
      setNoteText('');
      setAddMode(null);
      onReload();
    } finally {
      setSaving(false);
    }
  }

  async function saveUrl() {
    if (!urlInput.trim()) return;
    setSaving(true);
    try {
      await fetch(`/api/engagements/${engagement.id}/resources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          category: 'documents',
          url: urlInput.trim(),
          title: urlTitle.trim() || urlInput.trim(),
        }),
      });
      setUrlInput('');
      setUrlTitle('');
      setAddMode(null);
      onReload();
    } finally {
      setSaving(false);
    }
  }

  async function uploadFile(file: File) {
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('category', 'documents');
      fd.append('title', file.name);
      await fetch(`/api/engagements/${engagement.id}/resources`, {
        method: 'POST',
        headers: getAuthHeader(),
        body: fd,
      });
      onReload();
    } finally {
      setSaving(false);
    }
  }

  async function removeResource(resourceId: string) {
    await fetch(`/api/engagements/${engagement.id}/resources/${resourceId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ status: 'not_available' }),
    });
    onReload();
  }

  const hasSupplement = supplementResources.length > 0;

  return (
    <div className="bg-adv-card border border-adv-teal/20 rounded-xl overflow-hidden">
      {/* Panel header */}
      <div className="px-5 py-4 border-b border-border flex items-center gap-3">
        <RefreshCw className="h-4 w-4 text-adv-teal shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-adv-off-white">Context for Iteration {iterationNumber}</p>
          <p className="text-xs text-adv-gray mt-0.5">
            Add missing information to address the gaps above — meeting notes, analyst comments, additional documents, or web links.
            Everything added here will be included in the next execution.
          </p>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* Already-added supplements */}
        {supplementResources.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] text-adv-teal uppercase tracking-wider font-medium">Added since last run ({supplementResources.length})</p>
            {supplementResources.map(r => (
              <div key={r.id} className="flex items-center gap-2.5 bg-adv-dark-2 rounded-lg px-3 py-2">
                {r.url && !r.file_path
                  ? <Link className="h-3.5 w-3.5 text-adv-blue shrink-0" />
                  : r.file_path
                    ? <FileText className="h-3.5 w-3.5 text-adv-teal shrink-0" />
                    : <MessageSquare className="h-3.5 w-3.5 text-adv-gold shrink-0" />
                }
                <span className="flex-1 text-xs text-adv-off-white truncate">{r.title}</span>
                <span className="text-[10px] text-adv-gray-med shrink-0 capitalize">{r.category}</span>
                <button onClick={() => removeResource(r.id)} className="text-adv-gray-med hover:text-adv-red transition-colors p-0.5 shrink-0">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add buttons */}
        {addMode === null && (
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setAddMode('note')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border-2 border-dashed border-border text-xs text-adv-gray hover:border-adv-teal/40 hover:text-adv-teal transition-colors"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Add text note
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border-2 border-dashed border-border text-xs text-adv-gray hover:border-adv-teal/40 hover:text-adv-teal transition-colors"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              Upload document
            </button>
            <button
              onClick={() => setAddMode('url')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border-2 border-dashed border-border text-xs text-adv-gray hover:border-adv-teal/40 hover:text-adv-teal transition-colors"
            >
              <Link className="h-3.5 w-3.5" />
              Add URL
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.docx,.doc,.txt,.md,.xlsx,.csv"
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ''; }}
            />
          </div>
        )}

        {/* Note form */}
        {addMode === 'note' && (
          <div className="bg-adv-dark-2 rounded-lg p-3 space-y-2 border border-adv-teal/20">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-3.5 w-3.5 text-adv-gold shrink-0" />
              <p className="text-xs font-medium text-adv-off-white">Add Text Note</p>
              <select
                value={noteCategory}
                onChange={e => setNoteCategory(e.target.value as 'meetings' | 'documents' | 'other')}
                className="ml-auto bg-adv-card border border-border rounded px-2 py-0.5 text-[10px] text-adv-gray focus:outline-none focus:border-adv-teal"
              >
                <option value="meetings">Meeting notes</option>
                <option value="documents">Analyst comment</option>
                <option value="other">Other</option>
              </select>
            </div>
            <input
              autoFocus
              value={noteTitle}
              onChange={e => setNoteTitle(e.target.value)}
              placeholder="Title (e.g. Post-call clarifications, Interview notes)"
              className="w-full bg-adv-card border border-border rounded-lg px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray-med focus:outline-none focus:border-adv-teal"
            />
            <textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              placeholder="Paste meeting notes, call outcomes, clarifications, additional analysis or context that addresses the gaps above…"
              rows={5}
              className="w-full bg-adv-card border border-border rounded-lg px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray-med focus:outline-none focus:border-adv-teal resize-none"
            />
            <p className="text-[10px] text-adv-gray-med">{noteText.length} characters · will be included verbatim in the next execution</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setAddMode(null); setNoteText(''); setNoteTitle(''); }} className="text-xs text-adv-gray hover:text-adv-off-white px-2 py-1">Cancel</button>
              <button
                onClick={saveNote}
                disabled={!noteText.trim() || saving}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-adv-teal text-adv-dark text-xs font-medium hover:bg-adv-teal-dark disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                Save note
              </button>
            </div>
          </div>
        )}

        {/* URL form */}
        {addMode === 'url' && (
          <div className="bg-adv-dark-2 rounded-lg p-3 space-y-2 border border-adv-teal/20">
            <div className="flex items-center gap-2 mb-1">
              <Link className="h-3.5 w-3.5 text-adv-blue shrink-0" />
              <p className="text-xs font-medium text-adv-off-white">Add Web Link</p>
            </div>
            <input
              autoFocus
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              placeholder="https://eur-lex.europa.eu/... or any web URL"
              className="w-full bg-adv-card border border-border rounded-lg px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray-med focus:outline-none focus:border-adv-teal"
            />
            <input
              value={urlTitle}
              onChange={e => setUrlTitle(e.target.value)}
              placeholder="Label (optional)"
              className="w-full bg-adv-card border border-border rounded-lg px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray-med focus:outline-none focus:border-adv-teal"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setAddMode(null); setUrlInput(''); setUrlTitle(''); }} className="text-xs text-adv-gray hover:text-adv-off-white px-2 py-1">Cancel</button>
              <button
                onClick={saveUrl}
                disabled={!urlInput.trim() || saving}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-adv-teal text-adv-dark text-xs font-medium hover:bg-adv-teal-dark disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                Add
              </button>
            </div>
          </div>
        )}

        {/* Re-execute CTA */}
        <div className={`rounded-xl p-4 flex items-center gap-4 ${hasSupplement ? 'bg-adv-teal-soft border border-adv-teal/30' : 'bg-adv-dark-2 border border-border'}`}>
          <div className="flex-1">
            {hasSupplement ? (
              <>
                <p className="text-sm font-semibold text-adv-teal">{supplementResources.length} item{supplementResources.length !== 1 ? 's' : ''} added — ready for Iteration {iterationNumber}</p>
                <p className="text-xs text-adv-gray mt-0.5">ANTON will incorporate all newly added context into the next execution.</p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-adv-off-white">Re-execute without new context</p>
                <p className="text-xs text-adv-gray mt-0.5">Or add text notes / documents above to give ANTON more to work with.</p>
              </>
            )}
          </div>
          {onReExecute && (
            <button
              onClick={onReExecute}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors shrink-0 ${
                hasSupplement
                  ? 'bg-adv-teal text-adv-dark hover:bg-adv-teal-dark'
                  : 'border border-border text-adv-gray hover:text-adv-teal hover:border-adv-teal/40'
              }`}
            >
              <ArrowRight className="h-4 w-4" />
              {hasSupplement ? `Run Iteration ${iterationNumber}` : 'Re-execute'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── IterationCard ─────────────────────────────────────────────────────────────

function IterationCard({ iteration, expanded, onToggle, approving, onApprove }: {
  iteration: Iteration;
  expanded: boolean;
  onToggle: () => void;
  approving: boolean;
  onApprove: () => void;
}) {
  const [thinkingOpen, setThinkingOpen] = useState(false);

  const statusColors: Record<string, string> = {
    draft:     'text-adv-gold bg-adv-gold/10 border-adv-gold/20',
    reviewed:  'text-adv-blue bg-adv-blue/10 border-adv-blue/20',
    approved:  'text-adv-green bg-adv-green/10 border-adv-green/20',
    superseded:'text-adv-gray-med bg-adv-dark border-border',
  };
  const sc = statusColors[iteration.status] || statusColors.draft;
  const wordCount = iteration.output_content?.split(/\s+/).length || 0;
  const thinkingWordCount = iteration.thinking_content?.split(/\s+/).length || 0;

  return (
    <div className="bg-adv-card border border-border rounded-xl overflow-hidden">
      <div
        className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-adv-dark-2/30 transition-colors"
        onClick={onToggle}
      >
        <FileText className="h-4 w-4 text-adv-teal shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-adv-off-white">Iteration #{iteration.iteration_number}</p>
          <p className="text-xs text-adv-gray-med mt-0.5">
            {new Date(iteration.created_at).toLocaleString()} · {wordCount.toLocaleString()} words
            {iteration.thinking_content && <span className="ml-2 text-adv-teal/60">· reasoning recorded</span>}
          </p>
        </div>
        <span className={`text-[10px] font-medium border rounded-full px-2 py-0.5 ${sc}`}>{iteration.status}</span>
        {expanded ? <ChevronUp className="h-4 w-4 text-adv-gray-med" /> : <ChevronDown className="h-4 w-4 text-adv-gray-med" />}
      </div>

      {expanded && (
        <div className="border-t border-border">
          {iteration.output_content ? (
            <div className="p-5 max-h-96 overflow-y-auto">
              <pre className="text-xs text-adv-off-white whitespace-pre-wrap font-mono leading-relaxed">
                {iteration.output_content}
              </pre>
            </div>
          ) : (
            <div className="px-5 py-6 text-center text-xs text-adv-gray">No output content</div>
          )}

          {/* Thinking accordion — only shown when thinking_content was captured */}
          {iteration.thinking_content && (
            <div className="border-t border-border">
              <button
                onClick={() => setThinkingOpen(p => !p)}
                className="w-full flex items-center gap-2 px-5 py-3 hover:bg-adv-dark-2/30 transition-colors text-left"
              >
                <Brain className="h-3.5 w-3.5 text-adv-teal/70 shrink-0" />
                <span className="text-xs font-medium text-adv-gray">How ANTON Thought</span>
                <span className="text-[10px] text-adv-gray-med ml-1">({thinkingWordCount.toLocaleString()} words)</span>
                <span className="ml-auto">
                  {thinkingOpen ? <ChevronUp className="h-3.5 w-3.5 text-adv-gray-med" /> : <ChevronDown className="h-3.5 w-3.5 text-adv-gray-med" />}
                </span>
              </button>
              {thinkingOpen && (
                <div className="px-5 pb-4 max-h-72 overflow-y-auto bg-adv-teal-soft/30 border-t border-adv-teal/10">
                  <pre className="text-[11px] text-adv-gray whitespace-pre-wrap font-mono leading-relaxed pt-4">
                    {iteration.thinking_content}
                  </pre>
                </div>
              )}
            </div>
          )}

          {iteration.status === 'draft' && (
            <div className="border-t border-border px-5 py-3 flex justify-end gap-3">
              <button
                onClick={onApprove}
                disabled={approving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-adv-green/10 border border-adv-green/30 text-adv-green text-xs font-semibold hover:bg-adv-green/20 disabled:opacity-60 transition-colors"
              >
                {approving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsUp className="h-3.5 w-3.5" />}
                Approve Draft
              </button>
            </div>
          )}
          {iteration.status === 'approved' && (
            <div className="border-t border-border px-5 py-3 flex items-center gap-2">
              <CheckCircle className="h-3.5 w-3.5 text-adv-green" />
              <span className="text-xs text-adv-green">Approved deliverable</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── ReviewLensSelector ────────────────────────────────────────────────────────

function ReviewLensSelector({
  selectedLens, onSelect, customInstruction, onCustomChange, open, onToggle
}: {
  selectedLens: string;
  onSelect: (id: string) => void;
  customInstruction: string;
  onCustomChange: (v: string) => void;
  open: boolean;
  onToggle: () => void;
}) {
  const current = REVIEW_LENSES.find(l => l.id === selectedLens) || REVIEW_LENSES[0];

  return (
    <div className="bg-adv-card border border-border rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-adv-dark-2/40 transition-colors"
      >
        <Sliders className="h-4 w-4 text-adv-teal shrink-0" />
        <div className="flex-1 text-left">
          <p className="text-xs font-medium text-adv-off-white">Review Lens: {current.icon} {current.label}</p>
          <p className="text-[10px] text-adv-gray-med mt-0.5">{current.description}</p>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-adv-gray-med shrink-0" /> : <ChevronDown className="h-4 w-4 text-adv-gray-med shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-border p-3 space-y-3">
          <p className="text-[10px] text-adv-gray-med uppercase tracking-wider">Choose how ANTON should review the draft</p>
          <div className="grid grid-cols-2 gap-2">
            {REVIEW_LENSES.map(lens => (
              <button
                key={lens.id}
                onClick={() => { onSelect(lens.id); if (lens.id !== 'custom') onToggle(); }}
                className={`flex items-start gap-2 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                  selectedLens === lens.id
                    ? 'border-adv-teal bg-adv-teal-soft text-adv-teal'
                    : 'border-border hover:border-adv-teal/30 hover:bg-adv-dark-2/40 text-adv-gray'
                }`}
              >
                <span className="text-base leading-none shrink-0 mt-0.5">{lens.icon}</span>
                <div>
                  <p className="text-xs font-medium leading-tight">{lens.label}</p>
                  <p className="text-[10px] mt-0.5 leading-tight opacity-80">{lens.description}</p>
                </div>
              </button>
            ))}
          </div>

          {selectedLens === 'custom' && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-adv-gray-med">Custom review instruction</p>
              <textarea
                autoFocus
                value={customInstruction}
                onChange={e => onCustomChange(e.target.value)}
                placeholder="e.g. Review this output through the lens of the FATF Mutual Evaluation methodology. Identify gaps in technical compliance across Recommendations 10, 11, 12, and 20."
                rows={4}
                className="w-full bg-adv-dark-2 border border-border rounded-lg px-3 py-2 text-xs text-adv-off-white placeholder-adv-gray-med focus:outline-none focus:border-adv-teal resize-none"
              />
            </div>
          )}

          {selectedLens !== 'custom' && (
            <button
              onClick={onToggle}
              className="w-full py-1.5 text-xs text-adv-gray hover:text-adv-teal transition-colors"
            >
              Done
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── GapAnalysisDisplay ────────────────────────────────────────────────────────

function GapAnalysisDisplay({ gapJson }: { gapJson: string }) {
  let gap: { gaps?: GapItem[]; overall_assessment?: string; confidence?: string; lens_used?: string } = {};
  try { gap = JSON.parse(gapJson); } catch { return <p className="text-xs text-adv-gray whitespace-pre-wrap">{gapJson}</p>; }

  const gaps = gap.gaps || [];
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  const sorted = [...gaps].sort((a, b) => (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2));

  const priorityColors = {
    high:   'text-adv-red bg-adv-red/10 border-adv-red/20',
    medium: 'text-adv-gold bg-adv-gold/10 border-adv-gold/20',
    low:    'text-adv-blue bg-adv-blue/10 border-adv-blue/20',
  };

  const lensLabel = gap.lens_used
    ? REVIEW_LENSES.find(l => l.id === gap.lens_used)
    : null;

  return (
    <div className="space-y-3">
      {lensLabel && (
        <div className="flex items-center gap-1.5 text-[10px] text-adv-gray-med">
          <span>{lensLabel.icon}</span>
          <span>Reviewed through <span className="text-adv-teal">{lensLabel.label}</span> lens</span>
        </div>
      )}
      {gap.overall_assessment && (
        <div className="text-xs text-adv-gray bg-adv-dark-2 rounded-lg px-3 py-2 leading-relaxed">
          {gap.overall_assessment}
        </div>
      )}
      {gap.confidence && (
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-adv-gold shrink-0" />
          <span className="text-xs text-adv-gray">Output confidence: <span className="text-adv-off-white">{gap.confidence}</span></span>
        </div>
      )}
      {sorted.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-adv-off-white flex items-center gap-1.5">
            <List className="h-3.5 w-3.5 text-adv-teal" />
            {sorted.length} improvement{sorted.length !== 1 ? 's' : ''} identified
          </p>
          {sorted.map((g, i) => (
            <div key={i} className="bg-adv-dark-2 rounded-lg px-3 py-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-medium border rounded-full px-2 py-0.5 ${priorityColors[g.priority] || priorityColors.low}`}>
                  {g.priority}
                </span>
                <span className="text-xs font-medium text-adv-off-white">{g.area}</span>
              </div>
              <p className="text-xs text-adv-gray">{g.gap}</p>
              {g.suggestion && (
                <p className="text-xs text-adv-teal border-l-2 border-adv-teal/40 pl-2">{g.suggestion}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── CouncilPanel ──────────────────────────────────────────────────────────────

const COUNCIL_ROLES: { id: string; label: string; icon: string; description: string; prompt: string; defaultModel: ModelId }[] = [
  {
    id: 'scope-checker',
    label: 'Scope Checker',
    icon: '🎯',
    description: 'Verifies all scope items are addressed',
    prompt: 'Review the draft against the confirmed engagement scope. Identify which scope items are well-addressed, which are partially addressed, and which are missing. Be specific about gaps and their severity.',
    defaultModel: 'claude-haiku-4-5-20251001',
  },
  {
    id: 'quality-auditor',
    label: 'Quality Auditor',
    icon: '🏗️',
    description: 'Assesses depth, evidence and structure',
    prompt: 'Audit the draft for professional quality. Assess: completeness, analytical depth, evidence quality, logical structure, and actionability of recommendations. Identify the 3 most important improvements needed.',
    defaultModel: 'claude-sonnet-4-6',
  },
  {
    id: 'regulatory',
    label: 'Regulatory Scrutiny',
    icon: '⚖️',
    description: 'Checks regulatory accuracy and robustness',
    prompt: 'Review the draft for regulatory accuracy. Flag any statements that could be challenged by a regulator, areas where regulatory citations are missing or weak, and recommendations that may be insufficient under applicable standards.',
    defaultModel: 'claude-opus-4-6',
  },
  {
    id: 'red-team',
    label: 'Red Team',
    icon: '🔴',
    description: 'Adversarially challenges assumptions',
    prompt: 'You are a red team attacker. Find every weakness, assumption gap, logical flaw, or unsupported conclusion. Think adversarially — what would a hostile reviewer, opposing counsel, or regulator use to challenge this output?',
    defaultModel: 'claude-sonnet-4-6',
  },
];

const EMPTY_KS_COUNCIL = {
  modes: {
    claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
    onlineReference: { enabled: false, urls: [] as string[], fetchDepth: 'summary' as const },
    localFolder: { enabled: false, folderPaths: [] as string[], fileFilter: undefined, recursive: false },
    combinedMode: { enabled: false, priority: 'merged' as const, instructions: '' },
  },
};

function CouncilPanel({ engagement, iteration, onSaved }: {
  engagement: EngagementData;
  iteration: Iteration;
  onSaved: () => void;
}) {
  const [enabled, setEnabled] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set(['scope-checker', 'quality-auditor']));
  const [roleModels, setRoleModels] = useState<Record<string, ModelId>>(() =>
    Object.fromEntries(COUNCIL_ROLES.map(r => [r.id, r.defaultModel]))
  );
  const [running, setRunning] = useState(false);
  const [activeRole, setActiveRole] = useState<string | null>(null);
  const [roleOutputs, setRoleOutputs] = useState<Record<string, string>>({});
  const [chairOutput, setChairOutput] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Parse existing expert_reviews if available
  const existingCouncil = (() => {
    try {
      const parsed = JSON.parse(iteration.expert_reviews || '{}');
      return parsed?.councilRun ? parsed : null;
    } catch { return null; }
  })();

  const scopeSummary = engagement.scope_items
    .filter(si => si.status !== 'removed')
    .map((si, i) => `${i + 1}. ${si.title}`)
    .join('\n');

  const draftContent = (iteration.output_content || '').slice(0, 8000);

  function buildMemberSystemPrompt(roleId: string) {
    const role = COUNCIL_ROLES.find(r => r.id === roleId)!;
    return `You are a ${role.label} reviewing a professional consulting engagement draft.

ENGAGEMENT: ${engagement.title}
CLIENT: ${engagement.client_name || 'Not specified'}

CONFIRMED SCOPE:
${scopeSummary || '(No scope items defined)'}

DRAFT CONTENT TO REVIEW:
${draftContent}
${draftContent.length >= 8000 ? '\n[Draft truncated for review — first 8,000 characters shown]' : ''}

YOUR REVIEW ROLE: ${role.prompt}

Provide a structured review in 3-5 paragraphs with clear headings. Be specific and cite examples from the draft.`;
  }

  async function runCouncil() {
    if (running || selectedRoles.size < 1) return;
    setRunning(true);
    setRoleOutputs({});
    setChairOutput('');
    setSaved(false);
    setError(null);

    const members = COUNCIL_ROLES.filter(r => selectedRoles.has(r.id));
    const allOutputs: Record<string, string> = {};

    try {
      // Run each council member sequentially
      for (const role of members) {
        setActiveRole(role.id);
        let text = '';
        setRoleOutputs(prev => ({ ...prev, [role.id]: '' }));

        const stream = streamMessage({
          model: roleModels[role.id] || role.defaultModel,
          thinking: 'think',
          creativity: 'strict',
          systemPrompt: buildMemberSystemPrompt(role.id),
          userMessage: `Please provide your ${role.label} review of this engagement draft.`,
          history: [],
          outputFormats: [],
          knowledgeSources: EMPTY_KS_COUNCIL,
        });

        for await (const ev of stream as AsyncGenerator<StreamEvent>) {
          if (ev.type === 'text_delta') {
            text += ev.content;
            setRoleOutputs(prev => ({ ...prev, [role.id]: text }));
          }
          if (ev.type === 'stream_end' || ev.type === 'error') break;
        }

        allOutputs[role.id] = text;
      }

      // Chair synthesis
      setActiveRole('chair');
      const councilContext = members
        .map(r => `## ${r.icon} ${r.label}\n${allOutputs[r.id] || '(No output)'}`)
        .join('\n\n---\n\n');

      let chairText = '';
      const chairStream = streamMessage({
        model: 'claude-opus-4-6',
        thinking: 'think_hard',
        creativity: 'balanced',
        systemPrompt: `You are the Chair of an AI Council reviewing a consulting engagement draft. Synthesise the council's reviews into a final assessment.

ENGAGEMENT: ${engagement.title}
CLIENT: ${engagement.client_name || 'Not specified'}

Produce: A clear executive summary of the council's findings, the top 3 improvements required before this draft can be approved, and an overall readiness assessment (Ready / Needs Work / Major Revision).`,
        userMessage: `COUNCIL REVIEWS:\n\n${councilContext}`,
        history: [],
        outputFormats: [],
        knowledgeSources: EMPTY_KS_COUNCIL,
      });

      for await (const ev of chairStream as AsyncGenerator<StreamEvent>) {
        if (ev.type === 'text_delta') {
          chairText += ev.content;
          setChairOutput(chairText);
        }
        if (ev.type === 'stream_end' || ev.type === 'error') break;
      }

      // Save results to iteration expert_reviews
      const councilData = {
        councilRun: true,
        runAt: new Date().toISOString(),
        members: members.map(r => ({
          role: r.id,
          label: r.label,
          model: roleModels[r.id] || r.defaultModel,
          output: allOutputs[r.id] || '',
        })),
        chairSynthesis: chairText,
      };

      await fetch(`/api/engagements/${engagement.id}/iterations/${iteration.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ expert_reviews: councilData }),
      });

      setSaved(true);
      onSaved();
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
      setActiveRole(null);
    }
  }

  // Show prior council run if available
  const displayOutputs = saved || Object.keys(roleOutputs).length > 0
    ? { roleOutputs, chairOutput }
    : existingCouncil
      ? {
          roleOutputs: Object.fromEntries((existingCouncil.members || []).map((m: { role: string; output: string }) => [m.role, m.output])),
          chairOutput: existingCouncil.chairSynthesis || '',
        }
      : null;

  return (
    <div className="space-y-5">
      <div className="bg-adv-gold/5 border border-adv-gold/20 rounded-xl px-4 py-3">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-adv-gold shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-adv-off-white">AI Council — Optional, Token-Intensive</p>
            <p className="text-xs text-adv-gray mt-0.5">
              Runs 2–4 specialist AI reviewers + a chair synthesis. Each reviewer calls the Claude/GPT/Gemini API independently.
              Estimated cost: 2–8 API calls × model cost. Best used on mature drafts before final approval.
            </p>
          </div>
          <button
            onClick={() => setEnabled(p => !p)}
            className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
              enabled ? 'bg-adv-teal' : 'bg-adv-card border border-border'
            }`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${enabled ? 'translate-x-4' : 'translate-x-0'}`} />
          </button>
        </div>
      </div>

      {enabled && (
        <>
          {/* Role selection */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-adv-gray-med mb-3">Select Reviewers</p>
            <div className="grid grid-cols-2 gap-3">
              {COUNCIL_ROLES.map(role => {
                const active = selectedRoles.has(role.id);
                return (
                  <div
                    key={role.id}
                    className={`rounded-xl border p-3 cursor-pointer transition-colors ${
                      active ? 'border-adv-teal bg-adv-teal-dim' : 'border-border bg-adv-card hover:border-adv-teal/30'
                    }`}
                    onClick={() => {
                      if (running) return;
                      setSelectedRoles(prev => {
                        const next = new Set(prev);
                        if (next.has(role.id)) next.delete(role.id);
                        else next.add(role.id);
                        return next;
                      });
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-base">{role.icon}</span>
                      <span className={`text-xs font-semibold ${active ? 'text-adv-teal' : 'text-adv-off-white'}`}>{role.label}</span>
                    </div>
                    <p className="text-[10px] text-adv-gray-med mb-2">{role.description}</p>
                    {active && (
                      <select
                        value={roleModels[role.id] || role.defaultModel}
                        onChange={(e) => setRoleModels(prev => ({ ...prev, [role.id]: e.target.value as ModelId }))}
                        onClick={e => e.stopPropagation()}
                        disabled={running}
                        className="w-full rounded border border-adv-teal/20 bg-adv-dark px-2 py-1 text-[10px] text-adv-off-white focus:outline-none disabled:opacity-60"
                      >
                        <optgroup label="Claude">
                          <option value="claude-opus-4-6">Claude Opus 4.6</option>
                          <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
                          <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5</option>
                        </optgroup>
                        <optgroup label="OpenAI">
                          <option value="gpt-4o">GPT-4o</option>
                          <option value="gpt-4o-mini">GPT-4o mini</option>
                        </optgroup>
                        <optgroup label="Google">
                          <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                        </optgroup>
                        <optgroup label="Mistral">
                          <option value="mistral-large-latest">Mistral Large</option>
                        </optgroup>
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Run button */}
          <div className="flex items-center gap-3">
            <button
              onClick={runCouncil}
              disabled={running || selectedRoles.size === 0}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-adv-teal text-adv-dark text-sm font-semibold hover:bg-adv-teal-dark disabled:opacity-60 transition-colors"
            >
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {running ? `Running ${activeRole === 'chair' ? 'Chair Synthesis' : activeRole || ''}…` : 'Run AI Council Review'}
            </button>
            {running && (
              <button
                onClick={() => { setRunning(false); setActiveRole(null); }}
                className="flex items-center gap-1.5 text-xs text-adv-gray hover:text-adv-red transition-colors"
              >
                <Square className="h-3 w-3" />
                Stop
              </button>
            )}
            {saved && (
              <span className="flex items-center gap-1.5 text-xs text-adv-green">
                <CheckCircle className="h-3.5 w-3.5" />
                Results saved
              </span>
            )}
          </div>
        </>
      )}

      {/* Show results (live or prior run) */}
      {displayOutputs && (
        <div className="space-y-4">
          {COUNCIL_ROLES.filter(r => displayOutputs.roleOutputs[r.id]).map(role => (
            <div key={role.id} className={`bg-adv-card border rounded-xl overflow-hidden ${activeRole === role.id ? 'border-adv-teal/50' : 'border-border'}`}>
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                <span className="text-base">{role.icon}</span>
                <span className="text-xs font-semibold text-adv-off-white">{role.label}</span>
                {activeRole === role.id && <Loader2 className="h-3 w-3 text-adv-teal animate-spin ml-1" />}
              </div>
              <div className="p-4 max-h-64 overflow-y-auto">
                <pre className="text-xs text-adv-off-white whitespace-pre-wrap font-mono leading-relaxed">
                  {displayOutputs.roleOutputs[role.id]}
                  {activeRole === role.id && <span className="inline-block w-1 h-3 bg-adv-teal animate-pulse ml-0.5 align-text-bottom" />}
                </pre>
              </div>
            </div>
          ))}

          {displayOutputs.chairOutput && (
            <div className={`border rounded-xl overflow-hidden ${activeRole === 'chair' ? 'border-adv-teal bg-adv-teal-soft' : 'border-adv-teal/30 bg-adv-teal-soft/50'}`}>
              <div className="flex items-center gap-2 px-4 py-3 border-b border-adv-teal/20">
                <Users2 className="h-3.5 w-3.5 text-adv-teal" />
                <span className="text-xs font-semibold text-adv-teal">Chair Synthesis (Claude Opus 4.6)</span>
                {activeRole === 'chair' && <Loader2 className="h-3 w-3 text-adv-teal animate-spin ml-1" />}
              </div>
              <div className="p-4 max-h-72 overflow-y-auto">
                <pre className="text-xs text-adv-off-white whitespace-pre-wrap font-mono leading-relaxed">
                  {displayOutputs.chairOutput}
                  {activeRole === 'chair' && <span className="inline-block w-1 h-3 bg-adv-teal animate-pulse ml-0.5 align-text-bottom" />}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}

      {existingCouncil && !displayOutputs && (
        <div className="text-xs text-adv-gray-med flex items-center gap-2 px-1">
          <CheckCircle className="h-3.5 w-3.5 text-adv-teal" />
          Previous council run: {new Date(existingCouncil.runAt).toLocaleString()} — enable to view or re-run
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-adv-red/10 border border-adv-red/30 px-4 py-3 text-sm text-adv-red">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}
    </div>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function TabBtn({ active, onClick, icon: Icon, label }: {
  active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
        active ? 'border-adv-teal text-adv-teal' : 'border-transparent text-adv-gray hover:text-adv-off-white'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function StatusTile({ label, value, ok }: { label: string; value: number; ok?: boolean }) {
  return (
    <div className={`rounded-xl p-4 border ${ok ? 'bg-adv-green/5 border-adv-green/20' : 'bg-adv-card border-border'}`}>
      <p className="text-[10px] text-adv-gray-med uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-bold ${ok ? 'text-adv-green' : 'text-adv-off-white'}`}>{value}</p>
    </div>
  );
}
