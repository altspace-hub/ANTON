/**
 * Theme management for the companion app.
 * Mirrors main ANTON's theme system: dark (default), light, corporate.
 */

export type AppTheme = 'dark' | 'light' | 'corporate';

const STORAGE_KEY = 'anton-companion-theme';

export function getTheme(): AppTheme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'corporate') return saved;
  } catch {}
  return 'light';
}

export function setTheme(theme: AppTheme): void {
  localStorage.setItem(STORAGE_KEY, theme);
  applyTheme(theme);
}

export function applyTheme(theme: AppTheme): void {
  const html = document.documentElement;
  html.classList.remove('light', 'corporate');
  if (theme === 'light') html.classList.add('light');
  else if (theme === 'corporate') html.classList.add('corporate');

  // Update meta theme-color for mobile browser chrome
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const colors: Record<AppTheme, string> = {
      dark: '#0B1426',
      light: '#F5F3EF',
      corporate: '#F3F5F9',
    };
    meta.setAttribute('content', colors[theme]);
  }
}

// Apply immediately on module load (prevents flash)
applyTheme(getTheme());
