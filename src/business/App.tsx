/**
 * App shell — state-machine routing modelled after src/comm/App.tsx.
 * Phase 1 hello-world: plain inline styles to take Tailwind out of the
 * diagnostic loop while we get the toolchain confirmed.
 */
import { useEffect, useState } from 'react';

export default function App() {
  const [n, setN] = useState(0);

  useEffect(() => {
    // Forces re-render so we can see React is mounting.
    setN(1);
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      width: '100vw',
      background: '#0F1B2D',
      color: '#E0E0E0',
      padding: '40px 24px',
      fontFamily: 'system-ui, sans-serif',
      boxSizing: 'border-box',
    }}>
      <h1 style={{ color: '#2DD4A8', fontSize: 32, margin: 0, marginBottom: 8 }}>
        ANTON Business
      </h1>
      <p style={{ color: '#B0B0B0', fontSize: 14, lineHeight: 1.5, margin: 0 }}>
        Capacitor scaffold installed (state={n}).
      </p>
      <p style={{ color: '#B0B0B0', fontSize: 14, lineHeight: 1.5, marginTop: 16 }}>
        If you can see this, the build chain works.
      </p>
    </div>
  );
}
