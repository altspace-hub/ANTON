/**
 * PersonalizationContext — React glue around services/personalization.ts.
 *
 * Wrap the app in <PersonalizationProvider> and read accent/mode anywhere
 * with `usePersonalization()`. Updates re-render every consumer because
 * the service notifies on change and the provider re-reads + setState.
 */

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  type AccentKey, type AppMode, type DisplaySize,
  getAccent, getMode, setAccent, setMode,
  getDisplaySize, setDisplaySize,
  onPersonalizationChange,
} from '../../services/personalization';

interface PersonalizationValue {
  accent: AccentKey;
  mode: AppMode;
  display: DisplaySize;
  setAccent: (a: AccentKey) => void;
  setMode: (m: AppMode) => void;
  setDisplay: (d: DisplaySize) => void;
}

const Ctx = createContext<PersonalizationValue | null>(null);

export function PersonalizationProvider({ children }: { children: ReactNode }) {
  const [accent, setAccentState] = useState<AccentKey>(() => getAccent());
  const [mode, setModeState]     = useState<AppMode>(() => getMode());
  const [display, setDisplayState] = useState<DisplaySize>(() => getDisplaySize());

  useEffect(() => onPersonalizationChange(() => {
    setAccentState(getAccent());
    setModeState(getMode());
    setDisplayState(getDisplaySize());
  }), []);

  const value = useMemo<PersonalizationValue>(() => ({
    accent, mode, display,
    setAccent: (a) => setAccent(a),
    setMode:   (m) => setMode(m),
    setDisplay: (d) => setDisplaySize(d),
  }), [accent, mode, display]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePersonalization(): PersonalizationValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePersonalization must be used inside <PersonalizationProvider>');
  return v;
}
