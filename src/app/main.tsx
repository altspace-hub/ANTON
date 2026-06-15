// Apply personalization (accent + mode) BEFORE React renders to prevent flash
import './services/personalization';
import '../fonts';

import { createRoot } from 'react-dom/client';
import App from './App';
import { PersonalizationProvider } from './components/ui/PersonalizationContext';
import './app.css';

createRoot(document.getElementById('app')!).render(
  <PersonalizationProvider>
    <App />
  </PersonalizationProvider>
);

// Native init — hide splash + paint status bar to match the warm-linen
// canvas as soon as React has mounted. Without an explicit StatusBar.setStyle
// call some Android builds keep the previous activity's bar styling and the
// status icons end up white-on-warm-linen (invisible).
if (typeof window !== 'undefined'
    && (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()) {
  void import('@capacitor/splash-screen').then(({ SplashScreen }) => {
    SplashScreen.hide().catch(() => { /* splash plugin unavailable; harmless */ });
  }).catch(() => { /* plugin not bundled; skip */ });

  void import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
    // Style.Light = LIGHT content (dark icons) — correct for warm-linen bg
    StatusBar.setStyle({ style: Style.Light }).catch(() => {});
    StatusBar.setBackgroundColor({ color: '#F5F3EF' }).catch(() => {});
  }).catch(() => {});
}
