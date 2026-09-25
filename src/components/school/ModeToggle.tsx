import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import { Briefcase, GraduationCap, Globe2, Compass, TrendingUp, Users, Wallet, Globe, Target } from 'lucide-react';
import { useSettingsStore } from '@/stores/useSettingsStore';
import type { AppMode } from '@/stores/useSettingsStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { useDemoStore } from '@/stores/useDemoStore';
import { demoRestricted, pillarVisible } from '@/lib/demo-config';

interface ModeToggleProps {
  className?: string;
}

const LIFE_ROUTES = ['/life', '/news', '/finance', '/travel'];
const PATHFINDER_ROUTES = ['/pathfinder'];
const MARKETS_ROUTES = ['/markets'];
const COMMUNITY_ROUTES = ['/community'];
const PAYMENTS_ROUTES = ['/futurechain'];
const PORTALS_ROUTES = ['/portals'];
const MISSIONS_ROUTES = ['/missions'];

export default function ModeToggle({ className = '' }: ModeToggleProps) {
  // The pillar labels live in the main locale files (modeToggle.*), which all
  // 30 languages carry. The School namespace has files for six languages only
  // and falls back to English, so reading from it left the toggle English in
  // German, Japanese, … (found 2026-09-23).
  const { t } = useTranslation();
  const { appMode, setAppMode } = useSettingsStore();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // Public demo (DEMO_MODE=true): a visitor sees only the enabled pillars; with
  // Work alone there is nothing to switch between, so no switch.
  const role = useAuthStore((st) => st.user?.role);
  const demo = useDemoStore((st) => st.config);
  const show = (mode: AppMode) => pillarVisible(demo, role, mode);

  // Treat route-based pillars as active visually, regardless of stored mode
  const activeMode: AppMode = MARKETS_ROUTES.some(r => pathname.startsWith(r))
    ? 'markets'
    : COMMUNITY_ROUTES.some(r => pathname.startsWith(r))
      ? 'community'
      : PAYMENTS_ROUTES.some(r => pathname.startsWith(r))
        ? 'payments'
        : PORTALS_ROUTES.some(r => pathname.startsWith(r))
          ? 'portals'
          : MISSIONS_ROUTES.some(r => pathname.startsWith(r))
            ? 'missions'
            : PATHFINDER_ROUTES.some(r => pathname.startsWith(r))
              ? 'pathfinder'
              : LIFE_ROUTES.some(r => pathname.startsWith(r))
                ? 'life'
                : appMode === 'school'
                  ? 'school'
                  : 'work';

  function handleToggle(mode: AppMode) {
    setAppMode(mode);
    if (mode === 'markets') navigate('/markets');
    else if (mode === 'community') navigate('/community');
    else if (mode === 'payments') navigate('/futurechain');
    else if (mode === 'portals') navigate('/portals');
    else if (mode === 'missions') navigate('/missions');
    else if (mode === 'pathfinder') navigate('/pathfinder');
    else if (mode === 'school') navigate('/school');
    else if (mode === 'life') navigate('/life');
    else navigate('/');
  }

  if (demoRestricted(demo, role) && demo.enabledPillars.length <= 1) return null;

  return (
    <div
      className={`inline-flex items-center rounded-lg border border-border bg-adv-dark p-0.5 ${className}`}
      role="group"
      aria-label="Switch mode"
    >
      <button
        type="button"
        title={t('modeToggle.work', 'Work')}
        onClick={() => handleToggle('work')}
        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:ring-2 focus:ring-adv-teal focus:ring-offset-1 focus:ring-offset-adv-dark ${
          activeMode === 'work'
            ? 'bg-adv-teal text-adv-dark'
            : 'text-adv-gray hover:text-adv-off-white'
        }`}
        aria-pressed={activeMode === 'work'}
      >
        <Briefcase className="h-3.5 w-3.5" aria-hidden="true" />
        <span className={activeMode === 'work' ? '' : 'sr-only 2xl:not-sr-only'}>{t('modeToggle.work', 'Work')}</span>
      </button>

      {show('school') && (
        <button
          type="button"
          title={t('modeToggle.school', 'School')}
          onClick={() => handleToggle('school')}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:ring-2 focus:ring-adv-teal focus:ring-offset-1 focus:ring-offset-adv-dark ${
            activeMode === 'school'
              ? 'bg-adv-teal text-adv-dark'
              : 'text-adv-gray hover:text-adv-off-white'
          }`}
          aria-pressed={activeMode === 'school'}
        >
          <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
          <span className={activeMode === 'school' ? '' : 'sr-only 2xl:not-sr-only'}>{t('modeToggle.school', 'School')}</span>
        </button>
      )}

      {show('life') && (
        <button
          type="button"
          title={t('modeToggle.life', 'Life')}
          onClick={() => handleToggle('life')}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:ring-2 focus:ring-adv-teal focus:ring-offset-1 focus:ring-offset-adv-dark ${
            activeMode === 'life'
              ? 'bg-adv-teal text-adv-dark'
              : 'text-adv-gray hover:text-adv-off-white'
          }`}
          aria-pressed={activeMode === 'life'}
        >
          <Globe2 className="h-3.5 w-3.5" aria-hidden="true" />
          <span className={activeMode === 'life' ? '' : 'sr-only 2xl:not-sr-only'}>{t('modeToggle.life', 'Life')}</span>
        </button>
      )}

      {show('community') && (
        <button
          type="button"
          title={t('modeToggle.community', 'Collaboration')}
          onClick={() => handleToggle('community')}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:ring-2 focus:ring-adv-teal focus:ring-offset-1 focus:ring-offset-adv-dark ${
            activeMode === 'community'
              ? 'bg-adv-teal text-adv-dark'
              : 'text-adv-gray hover:text-adv-off-white'
          }`}
          aria-pressed={activeMode === 'community'}
        >
          <Users className="h-3.5 w-3.5" aria-hidden="true" />
          <span className={activeMode === 'community' ? '' : 'sr-only 2xl:not-sr-only'}>{t('modeToggle.community', 'Collaboration')}</span>
        </button>
      )}

      {show('markets') && (
        <button
          type="button"
          title={t('modeToggle.markets', 'Markets')}
          onClick={() => handleToggle('markets')}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:ring-2 focus:ring-adv-teal focus:ring-offset-1 focus:ring-offset-adv-dark ${
            activeMode === 'markets'
              ? 'bg-adv-teal text-adv-dark'
              : 'text-adv-gray hover:text-adv-off-white'
          }`}
          aria-pressed={activeMode === 'markets'}
        >
          <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
          <span className={activeMode === 'markets' ? '' : 'sr-only 2xl:not-sr-only'}>{t('modeToggle.markets', 'Markets')}</span>
        </button>
      )}

      {show('payments') && (
        <button
          type="button"
          title={t('modeToggle.payments', 'Payments')}
          onClick={() => handleToggle('payments')}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:ring-2 focus:ring-adv-teal focus:ring-offset-1 focus:ring-offset-adv-dark ${
            activeMode === 'payments'
              ? 'bg-adv-teal text-adv-dark'
              : 'text-adv-gray hover:text-adv-off-white'
          }`}
          aria-pressed={activeMode === 'payments'}
        >
          <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
          <span className={activeMode === 'payments' ? '' : 'sr-only 2xl:not-sr-only'}>{t('modeToggle.payments', 'Payments')}</span>
        </button>
      )}

      {show('pathfinder') && (
        <button
          type="button"
          title={t('modeToggle.pathfinder', 'Pathfinder')}
          onClick={() => handleToggle('pathfinder')}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:ring-2 focus:ring-adv-teal focus:ring-offset-1 focus:ring-offset-adv-dark ${
            activeMode === 'pathfinder'
              ? 'bg-adv-teal text-adv-dark'
              : 'text-adv-gray hover:text-adv-off-white'
          }`}
          aria-pressed={activeMode === 'pathfinder'}
        >
          <Compass className="h-3.5 w-3.5" aria-hidden="true" />
          <span className={activeMode === 'pathfinder' ? '' : 'sr-only 2xl:not-sr-only'}>{t('modeToggle.pathfinder', 'Pathfinder')}</span>
        </button>
      )}

      {show('portals') && (
        <button
          type="button"
          title={t('modeToggle.portals', 'Portals')}
          onClick={() => handleToggle('portals')}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:ring-2 focus:ring-adv-teal focus:ring-offset-1 focus:ring-offset-adv-dark ${
            activeMode === 'portals'
              ? 'bg-adv-teal text-adv-dark'
              : 'text-adv-gray hover:text-adv-off-white'
          }`}
          aria-pressed={activeMode === 'portals'}
        >
          <Globe className="h-3.5 w-3.5" aria-hidden="true" />
          <span className={activeMode === 'portals' ? '' : 'sr-only 2xl:not-sr-only'}>{t('modeToggle.portals', 'Portals')}</span>
        </button>
      )}

      {show('missions') && (
        <button
          type="button"
          title={t('modeToggle.missions', 'Missions')}
          onClick={() => handleToggle('missions')}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:ring-2 focus:ring-adv-teal focus:ring-offset-1 focus:ring-offset-adv-dark ${
            activeMode === 'missions'
              ? 'bg-adv-teal text-adv-dark'
              : 'text-adv-gray hover:text-adv-off-white'
          }`}
          aria-pressed={activeMode === 'missions'}
        >
          <Target className="h-3.5 w-3.5" aria-hidden="true" />
          <span className={activeMode === 'missions' ? '' : 'sr-only 2xl:not-sr-only'}>{t('modeToggle.missions', 'Missions')}</span>
        </button>
      )}
    </div>
  );
}
