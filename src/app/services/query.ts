/**
 * REST query client — simple JSON request/response.
 * Uses /query-sync endpoint which returns complete response as JSON.
 */

import { getSessionToken } from './api';

export interface StreamCallbacks {
  onStart?: () => void;
  onChunk?: (text: string) => void;
  onComplete?: (data: { sessionId: string; messageId: string; suggestions?: string[] }) => void;
  onError?: (error: string) => void;
}

export async function sendQueryREST(
  orgId: string,
  message: string,
  callbacks: StreamCallbacks,
  options?: { sessionId?: string; outputLanguage?: string; moduleId?: string; model?: string }
): Promise<void> {
  // Hydrate first. getSessionToken() is synchronous and returns null until the
  // token is loaded from the secure store, so reading it straight away would
  // report "Not authenticated" on a cold start to a user who IS authenticated.
  const { ensureSession: ensure } = await import('./api');
  await ensure();
  const token = getSessionToken();
  if (!token) { callbacks.onError?.('Not authenticated'); return; }

  try {
    callbacks.onStart?.();

    const { clientFetch } = await import('./api');
    const res = await clientFetch(`/org/${orgId}/query-sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-session': token,
      },
      body: JSON.stringify({
        message,
        sessionId: options?.sessionId,
        outputLanguage: options?.outputLanguage,
        moduleId: options?.moduleId,
        model: options?.model,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Query failed' }));
      callbacks.onError?.(body.error || `HTTP ${res.status}`);
      return;
    }

    const data = await res.json();
    if (data.text) {
      callbacks.onChunk?.(data.text);
    }
    callbacks.onComplete?.({
      sessionId: data.sessionId || '',
      messageId: data.messageId || '',
      suggestions: data.suggestions || [],
    });
  } catch (err) {
    callbacks.onError?.(err instanceof Error ? err.message : 'Query failed');
  }
}
