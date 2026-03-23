// Apply theme BEFORE React renders (prevents flash)
import './services/theme';

import { createRoot } from 'react-dom/client';
import App from './App';
import './app.css';

createRoot(document.getElementById('app')!).render(<App />);
