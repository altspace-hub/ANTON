import { useEffect, useState } from 'react';
import { Eye, GraduationCap, UserCheck, Crown } from 'lucide-react';

interface StageLabel {
  label: string;
  description: string;
  icon: string;
  color: string;
}

interface ApprenticeData {
  profile: any;
  stageLabel: StageLabel;
  suggestions: string[];
  nextStageRequirements: { sessionsNeeded: number; qualityNeeded: number | null } | null;
}

interface ApprenticeStageIndicatorProps {
  moduleId: string;
}

const iconMap = {
  Eye: Eye,
  GraduationCap: GraduationCap,
  UserCheck: UserCheck,
  Crown: Crown,
};

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('openexpert-token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function ApprenticeStageIndicator({ moduleId }: ApprenticeStageIndicatorProps) {
  const [data, setData] = useState<ApprenticeData | null>(null);
  const [showPromotion, setShowPromotion] = useState(false);

  useEffect(() => {
    fetch(`/api/apprentice/modules/${moduleId}`, { headers: getAuthHeader() })
      .then((r) => r.json() as Promise<ApprenticeData>)
      .then((d) => setData(d))
      .catch(() => {});
  }, [moduleId]);

  if (!data) return null;

  const { stageLabel, nextStageRequirements } = data;
  const Icon = iconMap[stageLabel.icon as keyof typeof iconMap] || Eye;

  const colorClasses: Record<string, { bg: string; text: string; border: string }> = {
    'adv-gray': { bg: 'bg-adv-gray/10', text: 'text-adv-gray', border: 'border-adv-gray/30' },
    'adv-blue': { bg: 'bg-adv-blue/10', text: 'text-adv-blue', border: 'border-adv-blue/30' },
    'adv-teal': { bg: 'bg-adv-teal/10', text: 'text-adv-teal', border: 'border-adv-teal/30' },
    'adv-gold': { bg: 'bg-adv-gold/10', text: 'text-adv-gold', border: 'border-adv-gold/30' },
  };

  const colors = colorClasses[stageLabel.color] || colorClasses['adv-gray'];

  return (
    <div className="group relative">
      <div
        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 ${colors.bg} ${colors.border}`}
      >
        <Icon className={`h-4 w-4 ${colors.text}`} />
        <span className={`text-xs font-medium ${colors.text}`}>{stageLabel.label}</span>
      </div>

      {/* Hover tooltip */}
      <div className="pointer-events-none absolute left-0 top-full z-10 mt-2 hidden w-64 rounded-lg border border-border bg-adv-card p-3 shadow-lg group-hover:block">
        <div className="mb-2 text-xs font-semibold text-adv-white">{stageLabel.label}</div>
        <div className="mb-3 text-xs text-adv-gray">{stageLabel.description}</div>
        {nextStageRequirements && nextStageRequirements.sessionsNeeded > 0 && (
          <div className="text-xs text-adv-gray-med">
            <span className="font-medium text-adv-teal">{nextStageRequirements.sessionsNeeded}</span> more
            sessions to next stage
            {nextStageRequirements.qualityNeeded && (
              <>
                {' '}
                (quality {nextStageRequirements.qualityNeeded.toFixed(1)}+ required)
              </>
            )}
          </div>
        )}
      </div>

      {/* Promotion toast */}
      {showPromotion && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-lg border border-adv-teal bg-adv-card p-4 shadow-lg">
          <GraduationCap className="h-5 w-5 text-adv-teal" />
          <div>
            <div className="text-sm font-semibold text-adv-white">Promoted to {stageLabel.label}!</div>
            <div className="text-xs text-adv-gray">Keep up the great work</div>
          </div>
          <button
            onClick={() => setShowPromotion(false)}
            className="ml-2 text-xs text-adv-gray hover:text-adv-off-white"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
