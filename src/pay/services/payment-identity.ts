/**
 * payment-identity.ts — the customer's ISO 20022 debtor party.
 *
 * Every PACS.008 the customer originates names them as the *debtor*.
 * The QR carries the creditor (merchant) party; this is the other
 * half, saved once by the customer in Settings → Payment details.
 *
 * The wallet address is NOT stored here — it lives in the wallet
 * service and is read in when a PACS.008 draft is assembled.
 *
 * Held in the tier-aware secure-store; never transmitted by this app.
 */
import { getSecure, removeSecure, setSecure } from './secure-store';

const KEY = 'fc.pay.identity';

/** The customer as a PACS.008 debtor party — minus the wallet address,
 *  which is sourced from the wallet service at draft-assembly time. */
export interface PayerIdentity {
  /** Full legal name. */
  name: string;
  /** ISO 3166-1 alpha-2 country code (e.g. 'SE'). */
  country: string;
  city: string;
  street: string;
  postcode: string;
}

/** A blank identity — the form's starting point. */
export function emptyPayerIdentity(): PayerIdentity {
  return { name: '', country: 'SE', city: '', street: '', postcode: '' };
}

export async function loadPayerIdentity(): Promise<PayerIdentity | null> {
  const raw = await getSecure(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PayerIdentity>;
    return {
      name: parsed.name ?? '',
      country: parsed.country ?? 'SE',
      city: parsed.city ?? '',
      street: parsed.street ?? '',
      postcode: parsed.postcode ?? '',
    };
  } catch {
    return null;
  }
}

export async function savePayerIdentity(identity: PayerIdentity): Promise<void> {
  await setSecure(KEY, JSON.stringify(identity));
}

/** True once the customer has saved a name — enough to populate the
 *  PACS.008 debtor with something other than the bare wallet address. */
export async function hasPayerIdentity(): Promise<boolean> {
  const id = await loadPayerIdentity();
  return id !== null && id.name.trim().length > 0;
}

export async function wipePayerIdentity(): Promise<void> {
  await removeSecure(KEY);
}
