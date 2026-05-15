import { createRoot } from 'react-dom/client';
import App from './App';
import './app.css';
// Side-effect import — applies the persisted accent + light/dark mode
// to <html> before React's first paint (no flash of default theme).
import { getMode } from './services/personalization';
// Side-effect import — initialises i18next synchronously so the first
// render is already in the user's language.
import './i18n';

createRoot(document.getElementById('app')!).render(<App />);

if (typeof window !== 'undefined'
    && (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()) {
  void import('@capacitor/splash-screen').then(({ SplashScreen }) => {
    SplashScreen.hide().catch(() => {});
  }).catch(() => {});

  void import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
    const dark = getMode() === 'dark';
    // Style.Light = light text (for dark backgrounds); Style.Dark =
    // dark text (for light backgrounds). Naming is the opposite of
    // intuition — pick by canvas.
    StatusBar.setStyle({ style: dark ? Style.Light : Style.Dark }).catch(() => {});
    StatusBar.setBackgroundColor({ color: dark ? '#0F1B2D' : '#F5F3EF' }).catch(() => {});
  }).catch(() => {});
}
