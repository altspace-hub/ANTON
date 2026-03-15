import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import { Briefcase, GraduationCap, Globe, Compass } from 'lucide-react';
import { useSettingsStore } from '@/stores/useSettingsStore';
import type { AppMode } from '@/stores/useSettingsStore';

interface ModeToggleProps {
  className?: string;
}

const LIFE_ROUTES = ['/life', '/news', '/finance', '/travel', '/community'];
const PATHFINDER_ROUTES = ['/pathfinder'];

export default function ModeToggle({ className = '' }: ModeToggleProps) {
  const { t } = useTranslation('school');
  const { appMode, setAppMode } = useSettingsStore();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // Treat any life-platform route as "life" mode visually, regardless of stored mode
  const activeMode: AppMode = PATHFINDER_ROUTES.some(r => pathname.startsWith(r))
    ? 'pathfinder'
    : LIFE_ROUTES.some(r => pathname.startsWith(r))
      ? 'life'
      : appMode === 'school'
        ? 'school'
        : 'work';

  function handleToggle(mode: AppMode) {
    setAppMode(mode);
    if (mode === 'pathfinder') navigate('/pathfinder');
    else if (mode === 'school') navigate('/school');
    else if (mode === 'life') navigate('/life');
    else navigate('/');
  }

  return (
    <div
      className={`inline-flex items-center rounded-lg border border-border bg-adv-dark p-0.5 ${className}`}
      role="group"
      aria-label="Switch mode"
    >
      <button
        type="button"
        onClick={() => handleToggle('work')}
        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:ring-2 focus:ring-adv-teal focus:ring-offset-1 focus:ring-offset-adv-dark ${
          activeMode === 'work'
            ? 'bg-adv-teal text-adv-dark'
            : 'text-adv-gray hover:text-adv-off-white'
        }`}
        aria-pressed={activeMode === 'work'}
      >
        <Briefcase className="h-3.5 w-3.5" aria-hidden="true" />
        {t('modeToggle.work', 'Work')}
      </button>

      <button
        type="button"
        onClick={() => handleToggle('school')}
        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:ring-2 focus:ring-adv-teal focus:ring-offset-1 focus:ring-offset-adv-dark ${
          activeMode === 'school'
            ? 'bg-adv-teal text-adv-dark'
            : 'text-adv-gray hover:text-adv-off-white'
        }`}
        aria-pressed={activeMode === 'school'}
      >
        <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
        {t('modeToggle.school', 'School')}
      </button>

      <button
        type="button"
        onClick={() => handleToggle('life')}
        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:ring-2 focus:ring-adv-teal focus:ring-offset-1 focus:ring-offset-adv-dark ${
          activeMode === 'life'
            ? 'bg-adv-teal text-adv-dark'
            : 'text-adv-gray hover:text-adv-off-white'
        }`}
        aria-pressed={activeMode === 'life'}
      >
        <Globe className="h-3.5 w-3.5" aria-hidden="true" />
        Life
      </button>

      <button
        type="button"
        onClick={() => handleToggle('pathfinder')}
        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:ring-2 focus:ring-adv-teal focus:ring-offset-1 focus:ring-offset-adv-dark ${
          activeMode === 'pathfinder'
            ? 'bg-adv-teal text-adv-dark'
            : 'text-adv-gray hover:text-adv-off-white'
        }`}
        aria-pressed={activeMode === 'pathfinder'}
      >
        <Compass className="h-3.5 w-3.5" aria-hidden="true" />
        Pathfinder
      </button>
    </div>
  );
}
