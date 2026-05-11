import { createRoot } from 'react-dom/client';
import App from './App';
import './app.css';

createRoot(document.getElementById('app')!).render(<App />);

if (typeof window !== 'undefined'
    && (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()) {
  void import('@capacitor/splash-screen').then(({ SplashScreen }) => {
    SplashScreen.hide().catch(() => {});
  }).catch(() => {});

  void import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
    StatusBar.setStyle({ style: Style.Light }).catch(() => {});
    StatusBar.setBackgroundColor({ color: '#F5F3EF' }).catch(() => {});
  }).catch(() => {});
}
