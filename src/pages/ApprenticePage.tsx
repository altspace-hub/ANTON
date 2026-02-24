import { useEffect, useState } from 'react';
import { GraduationCap, Eye, UserCheck, Crown, ArrowRight } from 'lucide-react';
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

export default function ApprenticePage() {
  const [profiles, setProfiles] = useState<ApprenticeProfile[]>([]);
  const [loading, setLoading] = useState(true);
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
          <GraduationCap className="mx-auto h-12 w-12 text-adv-gray-med mb-4" />
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

                {/* Continue button */}
                <button
                  onClick={() => navigate(`/module/${profile.module_id}`)}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-adv-dark-2 px-4 py-2 text-sm text-adv-teal transition-colors hover:bg-adv-card"
                >
                  Continue Learning
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
