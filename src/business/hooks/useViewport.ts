/**
 * useViewport — coarse phone-vs-tablet classification.
 *
 * The Business app was built phone-first. Wave 13 adds an adaptive
 * shell: on a tablet the app shows a persistent left navigation rail
 * and a wider content pane; on a phone it keeps the full-screen
 * stack with back-button navigation.
 *
 * Classification rule: a device is a "tablet" when the *shorter* CSS
 * dimension is at least TABLET_MIN_SHORT_SIDE. Using the short side
 * (rather than width) means the layout stays in tablet mode through
 * a portrait↔landscape rotation — a 10" tablet is a tablet whichever
 * way it's held, and a phone in landscape (wide but short) does NOT
 * get the rail (it would crush the content).
 *
 *   iPad mini portrait : 744 × 1133  → short 744  → tablet
 *   Lenovo Tab ~10"    : ~800 × 1280 → short 800  → tablet
 *   Pixel 8 landscape  : 915 × 412   → short 412  → phone  ✓
 *   iPhone 15 Pro Max  : 430 × 932   → short 430  → phone
 */
import { useEffect, useState } from 'react';

export type Viewport = 'phone' | 'tablet';

/** A device is a tablet when its shorter side is ≥ this many CSS px. */
export const TABLET_MIN_SHORT_SIDE = 600;

function classify(): Viewport {
  if (typeof window === 'undefined') return 'phone';
  const shortSide = Math.min(window.innerWidth, window.innerHeight);
  return shortSide >= TABLET_MIN_SHORT_SIDE ? 'tablet' : 'phone';
}

/**
 * Returns the current viewport class, re-evaluated on resize and
 * orientation change. Cheap — only triggers a re-render when the
 * class actually flips, not on every resize pixel.
 */
export function useViewport(): Viewport {
  const [viewport, setViewport] = useState<Viewport>(classify);

  useEffect(() => {
    const onResize = () => {
      const next = classify();
      setViewport((prev) => (prev === next ? prev : next));
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  return viewport;
}
