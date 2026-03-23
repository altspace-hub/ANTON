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
  options?: { sessionId?: string; outputLanguage?: string }
): Promise<void> {
  const token = getSessionToken();
  if (!token) { callbacks.onError?.('Not authenticated'); return; }

  try {
    callbacks.onStart?.();

    const serverBase = localStorage.getItem('anton-companion-server') || '';
    const res = await fetch(`${serverBase}/api/app/org/${orgId}/query-sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-session': token,
      },
      body: JSON.stringify({
        message,
        sessionId: options?.sessionId,
        outputLanguage: options?.outputLanguage,
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
