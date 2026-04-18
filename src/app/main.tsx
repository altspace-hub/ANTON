// Apply personalization (accent + mode) BEFORE React renders to prevent flash
import './services/personalization';

import { createRoot } from 'react-dom/client';
import App from './App';
import { PersonalizationProvider } from './components/ui/PersonalizationContext';
import './app.css';

createRoot(document.getElementById('app')!).render(
  <PersonalizationProvider>
    <App />
  </PersonalizationProvider>
);
