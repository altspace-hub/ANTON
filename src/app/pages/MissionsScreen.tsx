/**
 * MissionsScreen — companion-app Missions tile.
 *
 * The desktop Missions pillar runs multi-step automation jobs (research,
 * outreach, monitoring) with credential vault + service packs. The
 * companion app surfaces the missions you have running so you can:
 *   - see status at a glance (active / paused / review / draft)
 *   - see task progress (5 of 10 done)
 *   - pause / resume / abort without opening Pro
 *
 * LLM-heavy actions (decompose, advance to next task) stay in the
 * desktop Pro UI — those need the Anthropic API and a real keyboard.
 */

import { useEffect, useState } from 'react';
import {
  Btn, Ico, PageHeader, Pill, Spinner, ErrorPill, SectionLabel,
} from '../components/ui';
import { getOrgMissions, missionAction, type MissionSummary } from '../services/api';

interface Props {
  orgId: string;
  onBack: () => void;
}

function statusTone(status: string): 'green' | 'gold' | 'red' | 'neutral' {
  if (status === 'active')   return 'green';
  if (status === 'paused' || status === 'review' || status === 'briefed')  return 'gold';
  if (status === 'aborted')  return 'red';
  return 'neutral';
}

function progressPct(m: MissionSummary): number {
  if (!m.task_total) return 0;
  return Math.round((m.task_done / m.task_total) * 100);
}

export default function MissionsScreen({ orgId, onBack }: Props): JSX.Element {
  const [missions, setMissions] = useState<MissionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getOrgMissions(orgId)
      .then(d => { if (!cancelled) setMissions(Array.isArray(d.missions) ? d.missions : []); })
      .catch(() => { if (!cancelled) setError('Couldn\'t load missions.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [orgId, reloadTick]);

  const active   = missions.filter(m => m.status === 'active' || m.status === 'paused' || m.status === 'briefed' || m.status === 'review');
  const archived = missions.filter(m => m.status === 'completed' || m.status === 'aborted' || m.status === 'draft');

  return (
    <div className="flex flex-1 flex-col overflow-hidden" style={{ background: 'var(--color-bg)', minHeight: 0 }}>
      <PageHeader title="Missions" subtitle="Multi-step automation jobs" onBack={onBack} />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-4 px-4 pb-10 pt-4">
          {error && (
            <ErrorPill message={error} onRetry={() => setReloadTick(t => t + 1)} />
          )}

          {loading ? (
            <div className="flex justify-center py-12">
              <Spinner size="lg" />
            </div>
          ) : missions.length === 0 ? (
            <div
              className="rounded-[var(--radius-r3)] px-5 py-12 text-center"
              style={{ background: 'var(--color-surface)', border: '1px dashed var(--color-border)' }}
            >
              <span className="mb-3 inline-flex" style={{ color: 'var(--color-text-faint)' }}>
                <Ico name="sparkles" size={28} />
              </span>
              <p className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>
                No missions yet
              </p>
              <p
                className="mx-auto mt-1 max-w-[280px] text-sm leading-relaxed"
                style={{ color: 'var(--color-text-muted)' }}
              >
                Create a mission in the Pro UI on your desktop ANTON. They'll
                appear here so you can monitor + pause / resume on the run.
              </p>
            </div>
          ) : (
            <>
              {active.length > 0 && (
                <section className="space-y-2">
                  <SectionLabel className="px-1">
                    {active.length} in progress
                  </SectionLabel>
                  {active.map(m => (
                    <MissionRow
                      key={m.id}
                      m={m}
                      orgId={orgId}
                      onChanged={() => setReloadTick(t => t + 1)}
                    />
                  ))}
                </section>
              )}

              {archived.length > 0 && (
                <section className="space-y-2">
                  <SectionLabel className="px-1">
                    {archived.length} archived
                  </SectionLabel>
                  {archived.map(m => (
                    <MissionRow
                      key={m.id}
                      m={m}
                      orgId={orgId}
                      onChanged={() => setReloadTick(t => t + 1)}
                    />
                  ))}
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MissionRow({ m, orgId, onChanged }: {
  m: MissionSummary; orgId: string; onChanged: () => void;
}): JSX.Element {
  const [busy, setBusy] = useState(false);
  const tone = statusTone(m.status);
  const pct = progressPct(m);
  const canPause  = m.status === 'active';
  const canResume = m.status === 'paused';

  async function act(action: 'pause' | 'resume' | 'abort') {
    setBusy(true);
    try {
      await missionAction(orgId, m.id, action);
      onChanged();
    } catch { /* swallow — UI stays put */ }
    setBusy(false);
  }

  return (
    <div
      className="rounded-[var(--radius-r2)] p-3.5"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
      }}
    >
      <div className="flex items-start gap-2.5">
        <div className="min-w-0 flex-1">
          <div
            className="text-sm font-semibold"
            style={{ color: 'var(--color-text)', letterSpacing: '-0.15px' }}
          >
            {m.title}
          </div>
          {m.description && (
            <p
              className="mt-1 line-clamp-2 text-xs leading-relaxed"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {m.description}
            </p>
          )}
        </div>
        <Pill tone={tone}>{m.status}</Pill>
      </div>

      {/* Progress */}
      {m.task_total > 0 && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[0.6875rem]" style={{ color: 'var(--color-text-muted)' }}>
            <span>{m.task_done} of {m.task_total} task{m.task_total === 1 ? '' : 's'}</span>
            <span className="font-mono">{pct}%</span>
          </div>
          <div
            className="mt-1 h-1.5 overflow-hidden rounded-full"
            style={{ background: 'var(--color-border-soft)' }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${pct}%`,
                background: tone === 'green' ? 'var(--color-green)' :
                            tone === 'gold'  ? 'var(--color-gold)'  :
                            tone === 'red'   ? 'var(--color-red)'   :
                                               'var(--color-text-faint)',
              }}
            />
          </div>
        </div>
      )}

      {/* Actions */}
      {(canPause || canResume) && (
        <div className="mt-3 flex gap-2">
          {canPause && (
            <Btn variant="ghost" size="sm" onClick={() => void act('pause')} disabled={busy}>
              Pause
            </Btn>
          )}
          {canResume && (
            <Btn variant="primary" size="sm" onClick={() => void act('resume')} disabled={busy}>
              Resume
            </Btn>
          )}
          {(m.status === 'active' || m.status === 'paused') && (
            <Btn variant="ghost" size="sm" onClick={() => void act('abort')} disabled={busy}>
              Abort
            </Btn>
          )}
        </div>
      )}
    </div>
  );
}
