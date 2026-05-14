/**
 * api.ts — typed fetch wrapper for the merchant-backend.
 *
 * Endpoints match `merchant-backend/src/routes/`. The base URL comes
 * from EXPO_PUBLIC_API_BASE (set in .env / app config). For local dev
 * on a USB-tethered phone, run `adb reverse tcp:8787 tcp:8787` and use
 * http://localhost:8787.
 */
import type {
  RegisterMerchantRequest,
  RegisterMerchantResponse,
  Merchant,
  ApiError,
} from '@anton-business/shared-types';

const BASE = process.env.EXPO_PUBLIC_API_BASE ?? 'http://localhost:8787';

export class HttpError extends Error {
  constructor(public readonly status: number, public readonly body: ApiError) {
    super(`${status} ${body.code}: ${body.message}`);
    this.name = 'HttpError';
  }
}

async function send<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const parsed = text ? safeJson(text) : null;
  if (!res.ok) {
    throw new HttpError(res.status, (parsed as ApiError) ?? {
      code: 'unknown',
      message: `HTTP ${res.status}: ${text.slice(0, 200)}`,
    });
  }
  return parsed as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const api = {
  health: () => send<{ status: string; version: string }>('GET', '/health'),

  registerMerchant: (req: RegisterMerchantRequest) =>
    send<RegisterMerchantResponse>('POST', '/merchant/register', req),

  getMerchantById: (id: string) => send<Merchant>('GET', `/merchant/${encodeURIComponent(id)}`),

  getMerchantByAddress: (address: string) =>
    send<Merchant>('GET', `/merchant/by-address/${encodeURIComponent(address)}`),

  putDelegation: (address: string, env: unknown) =>
    send<unknown>('POST', `/merchant/${encodeURIComponent(address)}/delegate`, env),

  getDelegation: (address: string) =>
    send<unknown>('GET', `/merchant/${encodeURIComponent(address)}/delegate`),
};

export { BASE as API_BASE };
