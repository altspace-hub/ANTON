/**
 * EngagementQualityGate.tsx
 * Phase 8: Quality Gate
 * Six automated checks that validate the engagement output before release.
 * Streams SSE progress in real time. Shows scorecard and blockers.
 */

import React, { useState, useRef } from 'react';
import {
  ShieldCheck, Play, Loader2, CheckCircle, AlertCircle, XCircle,
  ChevronDown, ChevronUp, Download, FileText, BarChart2, RefreshCw,
  ListChecks, Star, Layers, BookOpen, Zap, Users, GitBranch, SkipForward
} from 'lucide-react';
import { getAuthHeader } from '@/lib/api';
import type { EngagementData, QualityGate } from '@/pages/EngagementWorkspacePage';

interface Props {
  engagement: EngagementData;
  onUpdate: (updates: Partial<EngagementData>) => void;
  onReload: () => void;
}

// Map backend check codes to UI info
interface CheckDef {
  code: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const CHECKS: CheckDef[] = [
  { code: '8A', label: 'Scope Completeness',       description: 'All confirmed scope items are addressed with adequate depth.',             icon: ListChecks },
  { code: '8B', label: 'Blueprint Alignment',       description: 'Output structure and quality matches the quality blueprint.',              icon: Star },
  { code: '8C', label: 'Cross-Consistency',         description: 'Findings and risk ratings are internally consistent throughout.',         icon: Layers },
  { code: '8D', label: 'Assumptions & Limitations', description: 'Formal assumptions and exclusions section generated from the boundaries register.', icon: BookOpen },
  { code: '8E', label: 'Executive Summary',         description: 'Professional executive summary generated for senior management.',          icon: Zap },
  { code: '8F', label: 'Expert Panel Review',       description: 'Four expert lenses review the deliverable for critical gaps.',             icon: Users },
];

interface CheckProgress {
  code: string;
  status: 'pending' | 'running' | 'done' | 'skipped' | 'error';
  result?: Record<string, unknown>;
  subChecks?: { code: string; label: string; result: Record<string, unknown> }[];
}

function scoreColor(score: number | null | undefined) {
  if (score == null) return 'text-adv-gray-med';
  if (score >= 80) return 'text-adv-green';
  if (score >= 60) return 'text-adv-gold';
  return 'text-adv-red';
}

function scoreBg(score: number | null | undefined) {
  if (score == null) return 'bg-adv-dark';
  if (score >= 80) return 'bg-adv-green';
  if (score >= 60) return 'bg-adv-gold';
  return 'bg-adv-red';
}

function parseJson(raw: string | null | undefined, fallback: unknown = {}) {
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

export default function EngagementQualityGate({ engagement, onUpdate, onReload }: Props) {
  const [running, setRunning] = useState(false);
  const [checks, setChecks] = useState<Record<string, CheckProgress>>({});
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const latestGate = engagement.quality_gate;

  async function runQualityGate() {
    setRunning(true);
    setError(null);

    const initial: Record<string, CheckProgress> = {};
    CHECKS.forEach(c => { initial[c.code] = { code: c.code, status: 'pending' }; });
    setChecks(initial);

    abortRef.current = new AbortController();

    try {
      const res = await fetch(`/api/engagements/${engagement.id}/quality-gate/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({}),
        signal: abortRef.current.signal,
      });

      if (!res.ok) throw new Error(await res.text());
      if (!res.body) throw new Error('No response stream');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const evt = JSON.parse(line.slice(6));

            if (evt.type === 'check_start') {
              // Get parent code (e.g. '8F-devil_advocate' → '8F')
              const parentCode = evt.check.split('-')[0];
              setChecks(p => ({
                ...p,
                [parentCode]: { ...p[parentCode], code: parentCode, status: 'running' },
              }));
            }

            if (evt.type === 'check_done') {
              const parentCode = evt.check.split('-')[0];
              const isSubCheck = evt.check.includes('-');

              setChecks(p => {
                const current = p[parentCode] || { code: parentCode, status: 'running' };
                if (isSubCheck) {
                  const subChecks = [...(current.subChecks || []), { code: evt.check, label: evt.label, result: evt.result }];
                  return { ...p, [parentCode]: { ...current, subChecks, status: 'running' } };
                }
                return { ...p, [parentCode]: { ...current, status: 'done', result: evt.result } };
              });
            }

            if (evt.type === 'check_skip') {
              const parentCode = evt.check.split('-')[0];
              setChecks(p => ({ ...p, [parentCode]: { code: parentCode, status: 'skipped', result: { reason: evt.reason } } }));
            }

            if (evt.type === 'done') {
              // Mark any remaining running/pending 8F check as done
              setChecks(p => {
                const next = { ...p };
                Object.keys(next).forEach(k => {
                  if (next[k].status === 'running') next[k] = { ...next[k], status: 'done' };
                });
                return next;
              });
              onReload();
            }

            if (evt.type === 'error') setError(evt.error);
          } catch { /**/ }
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(String(e));
    } finally {
      setRunning(false);
    }
  }

  async function exportEngagement(format: 'docx' | 'xlsx' | 'pdf') {
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

  const hasStarted = Object.keys(checks).length > 0 || latestGate !== null;
  const overallScore = latestGate?.overall_score ?? null;
  const releaseReady = latestGate ? !!latestGate.release_ready : false;
  const blockers: string[] = parseJson(latestGate?.blockers, []);

  // Build display data from latest gate or live progress
  function getCheckDisplayData(def: CheckDef) {
    // Live progress during run
    if (Object.keys(checks).length > 0) {
      return checks[def.code] || { code: def.code, status: 'pending' as const };
    }
    // Stored result from DB
    if (latestGate) {
      const dbKey = {
        '8A': 'scope_completeness',
        '8B': 'blueprint_alignment',
        '8C': 'cross_consistency',
        '8D': 'assumptions_section',
        '8E': 'executive_summary',
        '8F': 'expert_reviews',
      }[def.code] as keyof QualityGate;

      const raw = latestGate[dbKey];
      if (!raw) return { code: def.code, status: 'pending' as const };

      // 8D and 8E are text
      if (def.code === '8D' || def.code === '8E') {
        return { code: def.code, status: 'done' as const, result: { generated: true, text: String(raw) } };
      }
      // 8F is JSON with per-lens sub-results
      if (def.code === '8F') {
        const parsed = parseJson(String(raw), {}) as Record<string, unknown>;
        const subChecks = Object.entries(parsed).map(([k, v]) => ({
          code: `8F-${k}`, label: k.replace(/_/g, ' '), result: v as Record<string, unknown>
        }));
        return { code: def.code, status: 'done' as const, subChecks };
      }
      // 8A, 8B, 8C are JSON with score
      const parsed = parseJson(String(raw), {}) as Record<string, unknown>;
      return { code: def.code, status: 'done' as const, result: parsed };
    }
    return { code: def.code, status: 'pending' as const };
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-adv-teal mb-1">Phase 8</p>
        <h2 className="text-xl font-bold text-adv-white">Quality Gate</h2>
        <p className="mt-1 text-sm text-adv-gray">
          Six automated checks validate the engagement output against scope, blueprint, regulatory accuracy, and expert standards before final release.
        </p>
      </div>

      {/* Overall score (after running) */}
      {latestGate && (
        <div className={`rounded-xl p-5 border flex items-center gap-5 ${
          releaseReady ? 'bg-adv-green/5 border-adv-green/20' : 'bg-adv-red/5 border-adv-red/20'
        }`}>
          <div className={`w-16 h-16 rounded-full flex items-center justify-center shrink-0 ${releaseReady ? 'bg-adv-green/10' : 'bg-adv-red/10'}`}>
            {releaseReady ? <ShieldCheck className="h-7 w-7 text-adv-green" /> : <XCircle className="h-7 w-7 text-adv-red" />}
          </div>
          <div className="flex-1">
            <p className={`text-lg font-bold ${releaseReady ? 'text-adv-green' : 'text-adv-red'}`}>
              {releaseReady ? 'Release Ready' : 'Not Release Ready'}
            </p>
            <p className="text-sm text-adv-gray mt-0.5">
              Overall quality score: <span className={`font-semibold ${scoreColor(overallScore)}`}>{overallScore != null ? Math.round(overallScore) : '—'}/100</span>
            </p>
            {blockers.length > 0 && (
              <ul className="mt-2 space-y-0.5">
                {blockers.slice(0, 3).map((b, i) => (
                  <li key={i} className="text-xs text-adv-red flex items-start gap-1.5">
                    <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
                    {b}
                  </li>
                ))}
                {blockers.length > 3 && <li className="text-xs text-adv-red">+{blockers.length - 3} more</li>}
              </ul>
            )}
          </div>
          <button
            onClick={runQualityGate}
            disabled={running}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-adv-gray hover:text-adv-teal hover:border-adv-teal/40 transition-colors shrink-0 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${running ? 'animate-spin' : ''}`} />
            Re-run
          </button>
        </div>
      )}

      {/* Check panels */}
      <div className="space-y-2">
        {CHECKS.map(def => {
          const data = getCheckDisplayData(def);
          const score = (data.result as Record<string, unknown> | undefined)?.score as number | undefined;
          return (
            <CheckPanel
              key={def.code}
              def={def}
              data={data}
              score={score ?? null}
            />
          );
        })}
      </div>

      {/* Run button */}
      {!hasStarted && !running && (
        <div className="text-center py-6">
          <button
            onClick={runQualityGate}
            className="flex items-center gap-2 px-8 py-3 rounded-xl bg-adv-teal text-adv-dark text-sm font-semibold hover:bg-adv-teal-dark transition-colors mx-auto"
          >
            <Play className="h-4 w-4" />
            Run Quality Gate
          </button>
          <p className="text-xs text-adv-gray-med mt-2">Runs 6 checks — approximately 60–90 seconds</p>
        </div>
      )}

      {/* Running progress bar */}
      {running && (
        <div className="bg-adv-teal-soft border border-adv-teal/20 rounded-xl px-5 py-4 flex items-center gap-3">
          <Loader2 className="h-5 w-5 text-adv-teal animate-spin shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-adv-teal">Quality gate running…</p>
            <div className="mt-2 h-1.5 bg-adv-dark rounded-full overflow-hidden">
              <div
                className="h-full bg-adv-teal rounded-full transition-all duration-500"
                style={{ width: `${(Object.values(checks).filter(c => c.status === 'done' || c.status === 'skipped').length / CHECKS.length) * 100}%` }}
              />
            </div>
            <p className="text-[10px] text-adv-gray mt-1">
              {Object.values(checks).filter(c => c.status === 'done' || c.status === 'skipped').length} / {CHECKS.length} checks complete
            </p>
          </div>
          <button onClick={() => { abortRef.current?.abort(); setRunning(false); }}
            className="text-xs text-adv-gray hover:text-adv-red transition-colors">
            Cancel
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 bg-adv-red/10 border border-adv-red/30 rounded-xl px-4 py-3 text-sm text-adv-red">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Export */}
      {latestGate && (
        <div className="bg-adv-card border border-border rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-adv-off-white flex items-center gap-2">
            <Download className="h-4 w-4 text-adv-teal" />
            Export Deliverable
          </h3>
          <div className="flex gap-2 flex-wrap">
            {[
              { format: 'docx', label: 'Word (.docx)', icon: FileText },
              { format: 'xlsx', label: 'Excel (.xlsx)', icon: BarChart2 },
              { format: 'pdf',  label: 'PDF (.pdf)',   icon: FileText },
            ].map(({ format, label, icon: Icon }) => (
              <button
                key={format}
                onClick={() => exportEngagement(format as 'docx' | 'xlsx' | 'pdf')}
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
    </div>
  );
}

// ── CheckPanelDetails ─────────────────────────────────────────────────────────

type CheckPanelData = {
  code: string;
  status: string;
  result?: Record<string, unknown>;
  subChecks?: { code: string; label: string; result: Record<string, unknown> }[];
};

function CheckPanelDetails({ def, data }: { def: CheckDef; data: CheckPanelData }): React.ReactElement {
  const result = data.result;
  const addressed: string[] | undefined = result ? (result.addressed as string[] | undefined) : undefined;
  const missing: string[] | undefined = result ? (result.missing as string[] | undefined) : undefined;
  const partial: string[] | undefined = result ? (result.partial as string[] | undefined) : undefined;
  const deviations: string[] | undefined = result ? (result.deviations as string[] | undefined) : undefined;
  const conflicts: string[] | undefined = result ? (result.conflicts as string[] | undefined) : undefined;
  const textContent: string | undefined = result ? (result.text as string | undefined) : undefined;

  return (
    <div className="border-t border-border px-4 py-3 space-y-2">
      {def.code === '8A' && result ? (
        <div className="space-y-2">
          {addressed?.length ? (
            <div>
              <p className="text-[10px] text-adv-green uppercase tracking-wider mb-1">Addressed ({addressed.length})</p>
              {addressed.slice(0, 3).map((s, i) => <p key={i} className="text-xs text-adv-gray">✓ {s}</p>)}
              {addressed.length > 3 ? <p className="text-xs text-adv-gray-med">+{addressed.length - 3} more</p> : null}
            </div>
          ) : null}
          {missing?.length ? (
            <div>
              <p className="text-[10px] text-adv-red uppercase tracking-wider mb-1">Missing ({missing.length})</p>
              {missing.map((s, i) => <p key={i} className="text-xs text-adv-red">✗ {s}</p>)}
            </div>
          ) : null}
          {partial?.length ? (
            <div>
              <p className="text-[10px] text-adv-gold uppercase tracking-wider mb-1">Partial ({partial.length})</p>
              {partial.map((s, i) => <p key={i} className="text-xs text-adv-gold">~ {s}</p>)}
            </div>
          ) : null}
        </div>
      ) : null}
      {def.code === '8B' && deviations ? (
        <div className="space-y-1">
          {deviations.map((d, i) => <p key={i} className="text-xs text-adv-gold">⚠ {d}</p>)}
        </div>
      ) : null}
      {def.code === '8C' && conflicts ? (
        <div className="space-y-1">
          {conflicts.map((c, i) => <p key={i} className="text-xs text-adv-red">✗ {c}</p>)}
        </div>
      ) : null}
      {def.code === '8D' && textContent ? (
        <pre className="text-xs text-adv-gray whitespace-pre-wrap max-h-40 overflow-y-auto">{textContent.slice(0, 800)}</pre>
      ) : null}
      {def.code === '8E' && textContent ? (
        <p className="text-xs text-adv-gray leading-relaxed">{textContent.slice(0, 600)}{textContent.length > 600 ? '…' : ''}</p>
      ) : null}
      {def.code === '8F' && data.subChecks && data.subChecks.length > 0 ? (
        <div className="space-y-2">
          {data.subChecks.map(sc => {
            const r = sc.result as { verdict?: string; key_points?: string[]; top_concern?: string };
            const verdictColor = r.verdict === 'positive' ? 'text-adv-green' : r.verdict === 'concerns' ? 'text-adv-red' : 'text-adv-gold';
            return (
              <div key={sc.code} className="bg-adv-dark-2 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-xs font-medium text-adv-off-white capitalize">{sc.label}</p>
                  {r.verdict ? <span className={`text-[10px] font-medium ${verdictColor}`}>{r.verdict}</span> : null}
                </div>
                {r.top_concern ? <p className="text-xs text-adv-gold">⚠ {r.top_concern}</p> : null}
                {r.key_points && r.key_points.length > 0 ? r.key_points.slice(0, 2).map((kp, i) => (
                  <p key={i} className="text-xs text-adv-gray">· {kp}</p>
                )) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

// ── CheckPanel ────────────────────────────────────────────────────────────────

function CheckPanel({
  def, data, score
}: {
  def: CheckDef;
  data: CheckPanelData;
  score: number | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const Icon = def.icon;

  const statusIcon = {
    pending:  <div className="w-4 h-4 rounded-full border border-border shrink-0" />,
    running:  <Loader2 className="h-4 w-4 text-adv-teal animate-spin shrink-0" />,
    done:     score != null
      ? (score >= 60 ? <CheckCircle className="h-4 w-4 text-adv-green shrink-0" /> : <AlertCircle className="h-4 w-4 text-adv-gold shrink-0" />)
      : <CheckCircle className="h-4 w-4 text-adv-green shrink-0" />,
    skipped:  <SkipForward className="h-4 w-4 text-adv-gray-med shrink-0" />,
    error:    <XCircle className="h-4 w-4 text-adv-red shrink-0" />,
  }[data.status] || <div className="w-4 h-4 rounded-full border border-border shrink-0" />;

  const hasDetails = data.result || (data.subChecks && data.subChecks.length > 0);

  return (
    <div className={`bg-adv-card border rounded-xl overflow-hidden transition-colors ${data.status === 'running' ? 'border-adv-teal/40' : 'border-border'}`}>
      <div
        className={`flex items-center gap-3 px-4 py-3 ${hasDetails ? 'cursor-pointer hover:bg-adv-dark-2/30' : ''}`}
        onClick={() => hasDetails && setExpanded(p => !p)}
      >
        <span className="text-[10px] font-bold text-adv-teal bg-adv-teal-dim border border-adv-teal/20 rounded px-1.5 py-0.5 shrink-0">
          {def.code}
        </span>
        <Icon className={`h-3.5 w-3.5 shrink-0 ${data.status === 'running' ? 'text-adv-teal' : 'text-adv-gray-med'}`} />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${data.status === 'running' ? 'text-adv-teal' : 'text-adv-off-white'}`}>{def.label}</p>
          {data.status === 'pending' && <p className="text-xs text-adv-gray-med truncate">{def.description}</p>}
          {data.status === 'running' && <p className="text-xs text-adv-teal animate-pulse">Analysing…</p>}
          {data.status === 'skipped' && <p className="text-xs text-adv-gray-med">{(data.result as { reason?: string } | undefined)?.reason || 'Skipped'}</p>}
          {data.status === 'done' && score == null && def.code !== '8A' && def.code !== '8B' && def.code !== '8C' && (
            <p className="text-xs text-adv-green">Generated successfully</p>
          )}
          {data.status === 'done' && (data.result as { notes?: string } | undefined)?.notes && (
            <p className="text-xs text-adv-gray truncate">{(data.result as { notes?: string }).notes}</p>
          )}
        </div>

        {/* Score bar */}
        {data.status === 'done' && score != null && (
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-20 h-1.5 bg-adv-dark rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${scoreBg(score)}`} style={{ width: `${score}%` }} />
            </div>
            <span className={`text-sm font-bold w-8 text-right ${scoreColor(score)}`}>{Math.round(score)}</span>
          </div>
        )}

        {statusIcon}

        {hasDetails && (
          <span className="text-adv-gray-med ml-1">
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </span>
        )}
      </div>

      {expanded ? <CheckPanelDetails def={def} data={data} /> : null}
    </div>
  );
}
