import { useTranslation } from 'react-i18next';

type AssistanceLevel = 'L1' | 'L2' | 'L3' | 'L4';

const LEVEL_COLORS: Record<AssistanceLevel, string> = {
  L1: 'bg-adv-teal/10 text-adv-teal border-adv-teal/20',
  L2: 'bg-adv-blue/10 text-adv-blue border-adv-blue/20',
  L3: 'bg-adv-gold/10 text-adv-gold border-adv-gold/20',
  L4: 'bg-adv-gray-med/10 text-adv-gray border-adv-gray-med/20',
};

interface AssistanceLevelBadgeProps {
  level: AssistanceLevel;
  showLabel?: boolean;
  className?: string;
}

export default function AssistanceLevelBadge({
  level,
  showLabel = true,
  className = '',
}: AssistanceLevelBadgeProps) {
  const { t } = useTranslation('school');

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${LEVEL_COLORS[level]} ${className}`}
      title={t(`chat.assistanceLevel.${level}`)}
    >
      {level}
      {showLabel && (
        <span className="hidden sm:inline">{t(`chat.assistanceLevel.${level}`)}</span>
      )}
    </span>
  );
}
