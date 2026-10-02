/**
 * useDemoStore — the public-demo settings from /api/config (DEMO_MODE=true on
 * the server). App.tsx hands in the answer it already fetches at start-up;
 * anything that renders before that (the login page, the privacy page, the
 * About page) can call load(), which fetches once. The same answer carries the
 * server's version on every server, demo or not; the About page shows it.
 */
import { create } from 'zustand';
import { DEMO_OFF, parseDemoConfig, parseServerVersion, type DemoConfig } from '@/lib/demo-config';

interface DemoState {
  config: DemoConfig;
  /** The running ANTON version the server reports ('' when it did not say). */
  version: string;
  loaded: boolean;
  /** Take a /api/config answer that was fetched elsewhere. */
  applyConfig: (json: unknown) => void;
  /** Fetch /api/config unless it is already known. Never throws. */
  load: () => Promise<void>;
}

let inflight: Promise<void> | null = null;

export const useDemoStore = create<DemoState>()((set, get) => ({
  config: DEMO_OFF,
  version: '',
  loaded: false,

  applyConfig: (json: unknown) => set({ config: parseDemoConfig(json), version: parseServerVersion(json), loaded: true }),

  load: async () => {
    if (get().loaded) return;
    if (!inflight) {
      // /api/config is public and read before sign-in, so no auth helper is involved.
      inflight = fetch('/api/config')
        .then((r) => (r.ok ? r.json() : null))
        .then((json: unknown) => { get().applyConfig(json); })
        .catch(() => { set({ loaded: true }); })
        .finally(() => { inflight = null; });
    }
    await inflight;
  },
}));
