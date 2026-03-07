import { useLocation, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Settings, Circle, Sun, Moon, Building2, Menu, Command } from 'lucide-react';
import { MODULES } from '@/lib/constants';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { BudgetIndicator } from '@/components/shared/BudgetIndicator';
import PrivacyIndicator from '@/components/shared/PrivacyIndicator';
import { NotificationDropdown } from '@/components/shared/NotificationDropdown';
import { InsightsBell } from '@/components/shared/InsightsBell';
import ModeToggle from '@/components/school/ModeToggle';

interface HeaderProps {
  onMenuClick?: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const { health, theme, toggleTheme } = useSettingsStore();
  const { user: authUser, isTeamMode } = useAuthStore();

  // Build breadcrumb
  const parts: Array<{ label: string; path: string }> = [{ label: t('header.appName'), path: '/' }];

  const moduleMatch = location.pathname.match(/^\/module\/(.+)$/);
  if (moduleMatch) {
    const mod = MODULES.find((m) => m.id === moduleMatch[1]);
    if (mod) {
      parts.push({ label: mod.label, path: location.pathname });
    }
  } else if (location.pathname === '/settings') {
    parts.push({ label: t('header.settings'), path: '/settings' });
  } else if (location.pathname === '/build-module') {
    parts.push({ label: t('header.buildModule'), path: '/build-module' });
  } else if (location.pathname === '/skills') {
    parts.push({ label: t('header.skillsLibrary'), path: '/skills' });
  } else if (location.pathname === '/projects') {
    parts.push({ label: t('header.projects'), path: '/projects' });
  } else if (location.pathname === '/workflows') {
    parts.push({ label: t('header.workflows'), path: '/workflows' });
  } else if (location.pathname === '/prompt') {
    parts.push({ label: t('header.openChat'), path: '/prompt' });
  } else if (location.pathname === '/governance') {
    parts.push({ label: t('nav.governance'), path: '/governance' });
  } else if (location.pathname === '/skill-packs') {
    parts.push({ label: t('nav.skillPacks'), path: '/skill-packs' });
  } else if (location.pathname === '/compare') {
    parts.push({ label: t('nav.compareAnton'), path: '/compare' });
  } else if (location.pathname === '/marketplace') {
    parts.push({ label: t('nav.marketplace'), path: '/marketplace' });
  }

  const apiOk = health?.apiKeyConfigured;

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-adv-dark-2 px-4 lg:px-6">
      {/* Hamburger menu — mobile only */}
      <button
        onClick={onMenuClick}
        className="mr-2 rounded-lg p-2 text-adv-gray hover:bg-adv-card hover:text-adv-off-white transition-colors lg:hidden"
        aria-label={t('nav.openSidebar')}
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Breadcrumb */}
      <nav className="flex flex-1 items-center gap-2 text-sm">
        {parts.map((part, i) => (
          <span key={part.path} className="flex items-center gap-2">
            {i > 0 && <span className="text-adv-gray">/</span>}
            {i === parts.length - 1 ? (
              <span className="text-adv-off-white">{part.label}</span>
            ) : (
              <Link to={part.path} className="text-adv-gray hover:text-adv-teal transition-colors">
                {part.label}
              </Link>
            )}
          </span>
        ))}
      </nav>

      {/* Right side */}
      <div className="flex items-center gap-4">
        {/* Work ↔ School mode toggle */}
        <ModeToggle className="hidden sm:flex" />
        {/* API Status */}
        <div className="flex items-center gap-2 text-xs">
          <Circle
            className={`h-2 w-2 ${apiOk ? 'fill-adv-green text-adv-green' : 'fill-adv-red text-adv-red'}`}
          />
          <span className="hidden text-adv-gray sm:inline">{apiOk ? t('header.apiConnected') : t('header.apiNotConfigured')}</span>
        </div>

        {/* Privacy / Data Sovereignty Indicator */}
        <PrivacyIndicator />

        {/* Budget Indicator */}
        <BudgetIndicator />

        {/* Role badge — shown in team mode or when a non-solo user is logged in */}
        {authUser && (isTeamMode || authUser.id !== 'solo') && (
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
              authUser.role === 'admin'
                ? 'bg-adv-blue/20 text-adv-blue'
                : authUser.role === 'analyst'
                  ? 'bg-adv-teal/20 text-adv-teal'
                  : 'bg-adv-gray-med/20 text-adv-gray'
            }`}
            title={`Logged in as ${authUser.display_name || authUser.username} (${authUser.role})`}
          >
            {authUser.role}
          </span>
        )}

        {/* Command Palette Hint */}
        <button
          onClick={() => {
            // Trigger Cmd+K programmatically
            const event = new KeyboardEvent('keydown', {
              key: 'k',
              metaKey: true,
              ctrlKey: true,
              bubbles: true,
            });
            window.dispatchEvent(event);
          }}
          className="hidden lg:flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-adv-gray hover:bg-adv-card hover:text-adv-off-white transition-colors border border-adv-gray-med/30"
          title={t('header.commandPaletteTooltip')}
        >
          <Command className="h-3.5 w-3.5" />
          <span className="hidden xl:inline">{t('header.commands')}</span>
          <kbd className="hidden xl:inline-block ml-1 px-1 py-0.5 text-xs bg-adv-dark rounded">⌘K</kbd>
        </button>

        {/* Notification Bell */}
        <InsightsBell />
        <NotificationDropdown />

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="rounded-lg p-2 text-adv-gray hover:bg-adv-card hover:text-adv-off-white transition-colors"
          aria-label={theme === 'dark' ? t('header.switchToLight') : theme === 'light' ? t('header.switchToCorporate') : t('header.switchToDark')}
          title={theme === 'dark' ? t('header.switchToLight') : theme === 'light' ? t('header.switchToCorporate') : t('header.switchToDark')}
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : theme === 'light' ? <Building2 className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        <Link
          to="/settings"
          className="rounded-lg p-2 text-adv-gray hover:bg-adv-card hover:text-adv-off-white transition-colors"
        >
          <Settings className="h-4 w-4" />
        </Link>
      </div>
    </header>
  );
}
