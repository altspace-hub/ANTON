import { useSettingsStore } from '@/stores/useSettingsStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { safeStorage } from '@/lib/safe-storage';
import type { ModelId } from '@/lib/types';

/**
 * Adopt the instance default model on this browser at boot.
 *
 * The Settings picker writes the default through to the server
 * (app_settings 'default_model'), but every other browser — a second laptop,
 * a cleared profile, a colleague's machine — still boots from localStorage,
 * whose fallback is a bare API id. The server honours whatever the client
 * sends, so on a subscription-only instance those browsers sent every chat
 * to the unfunded API key and got "add ANTHROPIC_API_KEY to your .env".
 *
 * The persisted server value wins over a stale local one: it is the choice
 * the owner made last, on whichever machine. A per-session model the user
 * has already picked in the composer is left alone.
 */
/** Waits between attempts when the server refuses (rate limit, restart). */
const RETRY_DELAYS_MS = [2000, 5000, 15000];

async function fetchDefaultModel(): Promise<Response | null> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch('/api/settings/default-model');
      // A refused answer is not "no default": a rate-limited boot that gave up
      // here kept the bare API fallback and sent runs to the API key.
      if (res.ok) return res;
      if (res.status !== 429 && res.status < 500) return null;
    } catch {
      // Network error — fall through to the retry.
    }
    if (attempt >= RETRY_DELAYS_MS.length) return null;
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
  }
}

export async function syncDefaultModelFromServer(): Promise<void> {
  try {
    const res = await fetchDefaultModel();
    if (!res) return;
    const data = (await res.json()) as { model?: string | null; source?: 'settings' | 'env' | null };
    if (!data.model || data.source !== 'settings') return;
    const serverModel = data.model as ModelId;

    const settings = useSettingsStore.getState();
    if (settings.defaultModel === serverModel) return;
    const previousDefault = settings.defaultModel;
    safeStorage.setItem('openexpert-default-model', serverModel);
    useSettingsStore.setState({ defaultModel: serverModel });

    // The session config store copied the old default when it loaded; move it
    // too, unless the user has already chosen another model for this session.
    const config = useConfigStore.getState();
    if (config.model === previousDefault) config.setModel(serverModel);
  } catch {
    // Offline or server down — keep the local value; nothing to do.
  }
}
