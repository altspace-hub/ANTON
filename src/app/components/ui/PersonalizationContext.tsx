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
  type AccentKey, type AppMode,
  getAccent, getMode, setAccent, setMode,
  onPersonalizationChange,
} from '../../services/personalization';

interface PersonalizationValue {
  accent: AccentKey;
  mode: AppMode;
  setAccent: (a: AccentKey) => void;
  setMode: (m: AppMode) => void;
}

const Ctx = createContext<PersonalizationValue | null>(null);

export function PersonalizationProvider({ children }: { children: ReactNode }) {
  const [accent, setAccentState] = useState<AccentKey>(() => getAccent());
  const [mode, setModeState]     = useState<AppMode>(() => getMode());

  useEffect(() => onPersonalizationChange(() => {
    setAccentState(getAccent());
    setModeState(getMode());
  }), []);

  const value = useMemo<PersonalizationValue>(() => ({
    accent, mode,
    setAccent: (a) => setAccent(a),
    setMode:   (m) => setMode(m),
  }), [accent, mode]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePersonalization(): PersonalizationValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePersonalization must be used inside <PersonalizationProvider>');
  return v;
}
