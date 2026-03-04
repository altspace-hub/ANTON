import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Briefcase, GraduationCap } from 'lucide-react';
import { useSettingsStore } from '@/stores/useSettingsStore';
import type { AppMode } from '@/stores/useSettingsStore';

interface ModeToggleProps {
  className?: string;
}

export default function ModeToggle({ className = '' }: ModeToggleProps) {
  const { t } = useTranslation('school');
  const { appMode, setAppMode } = useSettingsStore();
  const navigate = useNavigate();

  function handleToggle(mode: AppMode) {
    if (mode === appMode) return;
    setAppMode(mode);
    if (mode === 'school') navigate('/school');
    else navigate('/');
  }

  return (
    <div
      className={`inline-flex items-center rounded-lg border border-border bg-adv-dark p-0.5 ${className}`}
      role="group"
      aria-label={t('modeToggle.ariaLabel', 'Switch between Work and School mode')}
    >
      <button
        type="button"
        onClick={() => handleToggle('work')}
        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-adv-teal focus:ring-offset-1 focus:ring-offset-adv-dark ${
          appMode === 'work'
            ? 'bg-adv-teal text-adv-dark'
            : 'text-adv-gray hover:text-adv-off-white'
        }`}
        aria-pressed={appMode === 'work'}
      >
        <Briefcase className="h-3.5 w-3.5" aria-hidden="true" />
        {t('modeToggle.work', 'Work')}
      </button>

      <button
        type="button"
        onClick={() => handleToggle('school')}
        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-adv-teal focus:ring-offset-1 focus:ring-offset-adv-dark ${
          appMode === 'school'
            ? 'bg-adv-teal text-adv-dark'
            : 'text-adv-gray hover:text-adv-off-white'
        }`}
        aria-pressed={appMode === 'school'}
      >
        <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
        {t('modeToggle.school', 'School')}
      </button>
    </div>
  );
}
