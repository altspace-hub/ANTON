import { useEffect, useState } from 'react';
import { GraduationCap, Eye, UserCheck, Crown, ArrowRight, Brain, Loader2, ChevronDown, HelpCircle, CheckCircle, XCircle, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { MODULES } from '@/lib/constants';

interface ApprenticeProfile {
  id: string;
  user_id: string;
  module_id: string;
  area_id: string | null;
  stage: string;
  sessions_completed: number;
  quality_avg: number | null;
  last_session: string;
}

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('openexpert-token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const stageInfo = {
  observer: { label: 'Observer', icon: Eye, color: 'text-adv-gray', bg: 'bg-adv-gray/10', nextAt: 3 },
  guided: { label: 'Guided', icon: GraduationCap, color: 'text-adv-blue', bg: 'bg-adv-blue/10', nextAt: 8 },
  supervised: { label: 'Supervised', icon: UserCheck, color: 'text-adv-teal', bg: 'bg-adv-teal/10', nextAt: 20 },
  autonomous: { label: 'Autonomous', icon: Crown, color: 'text-adv-gold', bg: 'bg-adv-gold/10', nextAt: null },
};

interface NextStepsData {
  nextActions: string[];
  focusArea: string;
  encouragement: string;
}

interface ProgressionData {
  profile: ApprenticeProfile | null;
  timeline: Array<{ stage: string; promoted_at: string | null }>;
  thresholds: {
    guided: { sessions: number; qualityAvg: number };
    supervised: { sessions: number; qualityAvg: number };
    autonomous: { sessions: number; qualityAvg: number };
  };
  nextStageRequirements: { sessionsNeeded: number; qualityNeeded: number | null } | null;
}

export default function ApprenticePage() {
  const [profiles, setProfiles] = useState<ApprenticeProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextStepsMap, setNextStepsMap] = useState<Record<string, { data: NextStepsData | null; loading: boolean; open: boolean }>>({});
  const [progressionMap, setProgressionMap] = useState<Record<string, { data: ProgressionData | null; loading: boolean; open: boolean }>>({});
  const navigate = useNavigate();

  useEffect(() => {
    fetch('/api/apprentice/profiles', { headers: getAuthHeader() })
      .then((r) => r.json() as Promise<ApprenticeProfile[]>)
      .then((data) => {
        setProfiles(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function fetchNextSteps(profile: ApprenticeProfile) {
    const key = profile.id;
    // Toggle open if already loaded
    setNextStepsMap((prev) => {
      const existing = prev[key];
      if (existing?.data) return { ...prev, [key]: { ...existing, open: !existing.open } };
      return { ...prev, [key]: { data: null, loading: true, open: true } };
    });
    // If already loaded, just toggled — no fetch needed
    if (nextStepsMap[key]?.data) return;
    try {
      const r = await fetch('/api/ai-assist/apprentice-next-steps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ moduleId: profile.module_id, stage: profile.stage, sessionsCompleted: profile.sessions_completed, qualityAvg: profile.quality_avg }),
      });
      if (r.ok) {
        const data = await r.json() as NextStepsData;
        setNextStepsMap((prev) => ({ ...prev, [key]: { data, loading: false, open: true } }));
      } else {
        setNextStepsMap((prev) => ({ ...prev, [key]: { data: null, loading: false, open: false } }));
      }
    } catch {
      setNextStepsMap((prev) => ({ ...prev, [key]: { data: null, loading: false, open: false } }));
    }
  }

  async function fetchProgression(profile: ApprenticeProfile) {
    const key = profile.id;
    setProgressionMap((prev) => {
      const existing = prev[key];
      if (existing?.data) return { ...prev, [key]: { ...existing, open: !existing.open } };
      return { ...prev, [key]: { data: null, loading: true, open: true } };
    });
    if (progressionMap[key]?.data) return;
    try {
      const r = await fetch(`/api/apprentice/progression/${profile.module_id}`, {
        headers: getAuthHeader(),
      });
      if (r.ok) {
        const data = await r.json() as ProgressionData;
        setProgressionMap((prev) => ({ ...prev, [key]: { data, loading: false, open: true } }));
      } else {
        setProgressionMap((prev) => ({ ...prev, [key]: { data: null, loading: false, open: false } }));
      }
    } catch {
      setProgressionMap((prev) => ({ ...prev, [key]: { data: null, loading: false, open: false } }));
    }
  }

  const getModuleName = (moduleId: string) => {
    return MODULES.find((m) => m.id === moduleId)?.label ?? moduleId;
  };

  const getProgressToNext = (profile: ApprenticeProfile) => {
    const stage = stageInfo[profile.stage as keyof typeof stageInfo];
    if (!stage || stage.nextAt === null) return { percent: 100, text: 'Max level' };
    const percent = Math.min(100, (profile.sessions_completed / stage.nextAt) * 100);
    const needed = stage.nextAt - profile.sessions_completed;
    return { percent, text: needed > 0 ? `${needed} sessions to next stage` : 'Ready to promote' };
  };

  const stageCounts = {
    observer: profiles.filter((p) => p.stage === 'observer').length,
    guided: profiles.filter((p) => p.stage === 'guided').length,
    supervised: profiles.filter((p) => p.stage === 'supervised').length,
    autonomous: profiles.filter((p) => p.stage === 'autonomous').length,
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-sm text-adv-gray">Loading apprentice journey...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-adv-teal/10">
          <GraduationCap className="h-5 w-5 text-adv-teal" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-adv-white">Your Expert Journey</h1>
          <p className="text-sm text-adv-gray">Track your progression from observer to autonomous expert</p>
        </div>
      </div>

      {/* Summary stats */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-adv-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Eye className="h-4 w-4 text-adv-gray" />
            <div className="text-xs text-adv-gray">Observer</div>
          </div>
          <div className="text-2xl font-bold text-adv-white">{stageCounts.observer}</div>
        </div>
        <div className="rounded-lg border border-border bg-adv-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <GraduationCap className="h-4 w-4 text-adv-blue" />
            <div className="text-xs text-adv-gray">Guided</div>
          </div>
          <div className="text-2xl font-bold text-adv-blue">{stageCounts.guided}</div>
        </div>
        <div className="rounded-lg border border-border bg-adv-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <UserCheck className="h-4 w-4 text-adv-teal" />
            <div className="text-xs text-adv-gray">Supervised</div>
          </div>
          <div className="text-2xl font-bold text-adv-teal">{stageCounts.supervised}</div>
        </div>
        <div className="rounded-lg border border-border bg-adv-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Crown className="h-4 w-4 text-adv-gold" />
            <div className="text-xs text-adv-gray">Autonomous</div>
          </div>
          <div className="text-2xl font-bold text-adv-gold">{stageCounts.autonomous}</div>
        </div>
      </div>

      {/* Module progress cards */}
      {profiles.length === 0 ? (
        <div className="rounded-lg border border-border bg-adv-card p-12 text-center">
          <GraduationCap className="mx-auto h-12 w-12 text-adv-gray mb-4" />
          <h3 className="text-lg font-semibold text-adv-white mb-2">Start Your Expert Journey</h3>
          <p className="text-sm text-adv-gray mb-6">
            Begin using modules to track your progression from observer to autonomous expert
          </p>
          <button
            onClick={() => navigate('/')}
            className="rounded-lg bg-adv-teal px-6 py-2 text-sm font-medium text-adv-dark transition-colors hover:bg-adv-teal-dark"
          >
            Explore Modules
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {profiles.map((profile) => {
            const stage = stageInfo[profile.stage as keyof typeof stageInfo];
            const StageIcon = stage.icon;
            const progress = getProgressToNext(profile);

            return (
              <div
                key={profile.id}
                className="rounded-lg border border-border bg-adv-card p-5 transition-colors hover:bg-adv-dark-2"
              >
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-adv-white mb-1">
                      {getModuleName(profile.module_id)}
                    </h3>
                    {profile.area_id && (
                      <div className="text-xs text-adv-gray mb-2">{profile.area_id.toUpperCase()}</div>
                    )}
                  </div>
                  <div className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 ${stage.bg} border-${stage.color.replace('text-', '')}/30`}>
                    <StageIcon className={`h-4 w-4 ${stage.color}`} />
                    <span className={`text-xs font-medium ${stage.color}`}>{stage.label}</span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mb-4">
                  <div className="mb-1 flex items-center justify-between text-xs text-adv-gray">
                    <span>Progress</span>
                    <span>{progress.text}</span>
                  </div>
                  <div className="h-2 rounded-full bg-adv-dark-2 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-adv-teal transition-all duration-300"
                      style={{ width: `${progress.percent}%` }}
                    />
                  </div>
                </div>

                {/* Stats */}
                <div className="mb-4 flex items-center gap-4 text-xs">
                  <div>
                    <span className="text-adv-gray">Sessions:</span>{' '}
                    <span className="font-medium text-adv-white">{profile.sessions_completed}</span>
                  </div>
                  {profile.quality_avg && (
                    <div>
                      <span className="text-adv-gray">Quality:</span>{' '}
                      <span
                        className={`font-medium ${
                          profile.quality_avg >= 8
                            ? 'text-adv-green'
                            : profile.quality_avg >= 6
                            ? 'text-adv-gold'
                            : 'text-adv-red'
                        }`}
                      >
                        {profile.quality_avg.toFixed(1)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => navigate(`/module/${profile.module_id}`)}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-adv-dark-2 px-4 py-2 text-sm text-adv-teal transition-colors hover:bg-adv-card"
                  >
                    Continue Learning
                    <ArrowRight className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => void fetchNextSteps(profile)}
                    disabled={nextStepsMap[profile.id]?.loading}
                    className="flex items-center gap-1.5 rounded-lg border border-adv-teal/40 bg-adv-teal/10 px-3 py-2 text-xs text-adv-teal hover:bg-adv-teal/20 disabled:opacity-40 transition-colors"
                    title="AI coaching: what to work on next"
                  >
                    {nextStepsMap[profile.id]?.loading
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Brain className="h-3.5 w-3.5" />}
                    What&apos;s next?
                  </button>
                  <button
                    onClick={() => void fetchProgression(profile)}
                    disabled={progressionMap[profile.id]?.loading}
                    className="flex items-center gap-1.5 rounded-lg border border-adv-blue/40 bg-adv-blue/10 px-3 py-2 text-xs text-adv-blue hover:bg-adv-blue/20 disabled:opacity-40 transition-colors"
                    title="Why is ANTON at this autonomy level?"
                  >
                    {progressionMap[profile.id]?.loading
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <HelpCircle className="h-3.5 w-3.5" />}
                    Why this stage?
                  </button>
                </div>

                {/* AI next steps panel */}
                {nextStepsMap[profile.id]?.open && nextStepsMap[profile.id]?.data && (
                  <div className="mt-3 rounded-lg border border-adv-teal/20 bg-adv-teal-soft p-3 space-y-2">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Brain className="h-3.5 w-3.5 text-adv-teal" />
                      <span className="text-xs font-semibold text-adv-teal">AI Coaching</span>
                      <button onClick={() => setNextStepsMap((prev) => ({ ...prev, [profile.id]: { ...prev[profile.id], open: false } }))} className="ml-auto text-adv-gray hover:text-adv-off-white">
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <p className="text-xs font-medium text-adv-off-white">{nextStepsMap[profile.id].data!.focusArea}</p>
                    {nextStepsMap[profile.id].data!.nextActions.length > 0 && (
                      <ul className="space-y-1">
                        {nextStepsMap[profile.id].data!.nextActions.map((a, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-adv-off-white">
                            <span className="text-adv-teal mt-0.5 shrink-0">→</span>{a}
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="text-xs text-adv-gray italic">{nextStepsMap[profile.id].data!.encouragement}</p>
                  </div>
                )}

                {/* Why this stage? panel */}
                {progressionMap[profile.id]?.open && progressionMap[profile.id]?.data && (() => {
                  const prog = progressionMap[profile.id].data!;
                  const p = prog.profile;
                  const reqs = prog.nextStageRequirements;
                  const th = prog.thresholds;
                  const nextStage = p?.stage === 'observer' ? 'guided' : p?.stage === 'guided' ? 'supervised' : p?.stage === 'supervised' ? 'autonomous' : null;
                  const nextThreshold = nextStage ? th[nextStage as keyof typeof th] : null;
                  return (
                    <div className="mt-3 rounded-lg border border-adv-blue/20 bg-adv-blue/5 p-3 space-y-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <HelpCircle className="h-3.5 w-3.5 text-adv-blue" />
                        <span className="text-xs font-semibold text-adv-blue">Why This Stage?</span>
                        <button onClick={() => setProgressionMap((prev) => ({ ...prev, [profile.id]: { ...prev[profile.id], open: false } }))} className="ml-auto text-adv-gray hover:text-adv-off-white">
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* Requirements table */}
                      {nextThreshold && p && (
                        <div className="space-y-1.5">
                          <div className="text-xs font-medium text-adv-off-white">Requirements for {nextStage}</div>
                          <div className="grid grid-cols-2 gap-1.5">
                            <div className="flex items-center gap-1.5 rounded bg-adv-dark-2 px-2 py-1.5 text-xs">
                              {(p.sessions_completed ?? 0) >= nextThreshold.sessions
                                ? <CheckCircle className="h-3 w-3 text-adv-green shrink-0" />
                                : <XCircle className="h-3 w-3 text-adv-red shrink-0" />}
                              <span className="text-adv-gray">Sessions:</span>
                              <span className="font-medium text-adv-off-white">{p.sessions_completed ?? 0}/{nextThreshold.sessions}</span>
                            </div>
                            {nextThreshold.qualityAvg > 0 && (
                              <div className="flex items-center gap-1.5 rounded bg-adv-dark-2 px-2 py-1.5 text-xs">
                                {(p.quality_avg ?? 0) >= nextThreshold.qualityAvg
                                  ? <CheckCircle className="h-3 w-3 text-adv-green shrink-0" />
                                  : <XCircle className="h-3 w-3 text-adv-red shrink-0" />}
                                <span className="text-adv-gray">Quality:</span>
                                <span className="font-medium text-adv-off-white">{(p.quality_avg ?? 0).toFixed(1)}/{nextThreshold.qualityAvg}</span>
                              </div>
                            )}
                          </div>
                          {reqs && reqs.sessionsNeeded > 0 && (
                            <p className="text-xs text-adv-gray">{reqs.sessionsNeeded} more session{reqs.sessionsNeeded !== 1 ? 's' : ''} needed{reqs.qualityNeeded && (p.quality_avg ?? 0) < reqs.qualityNeeded ? ` and quality must reach ${reqs.qualityNeeded}` : ''}</p>
                          )}
                        </div>
                      )}
                      {p?.stage === 'autonomous' && (
                        <p className="text-xs text-adv-gold font-medium">Maximum autonomy level reached.</p>
                      )}

                      {/* Timeline */}
                      {prog.timeline.length > 0 && (
                        <div>
                          <div className="text-xs font-medium text-adv-off-white mb-1.5">Promotion Timeline</div>
                          <div className="space-y-1">
                            {prog.timeline.map((t, i) => {
                              const info = stageInfo[t.stage as keyof typeof stageInfo];
                              return (
                                <div key={i} className="flex items-center gap-2 text-xs">
                                  <Clock className={`h-3 w-3 shrink-0 ${info?.color ?? 'text-adv-gray'}`} />
                                  <span className={`font-medium ${info?.color ?? 'text-adv-gray'}`}>{info?.label ?? t.stage}</span>
                                  {t.promoted_at && (
                                    <span className="text-adv-gray">
                                      {new Date(t.promoted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
