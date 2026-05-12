/**
 * Client-side identity management.
 * Uses Capacitor SecureStorage when available (native app),
 * falls back to localStorage (PWA/browser).
 */

const STORAGE_KEY = 'anton-companion-identity';

export interface AppIdentity {
  publicKeyHex: string;
  privateKeyHex: string;
  contactHash: string;
  displayName: string;
  preferredLanguage: string;
}

// ── Secure storage abstraction ───────────────────────────────────────────────

let secureStorageAvailable: boolean | null = null;

async function getSecureStorage(): Promise<{ get: (key: string) => Promise<string | null>; set: (key: string, value: string) => Promise<void>; remove: (key: string) => Promise<void> } | null> {
  if (secureStorageAvailable === false) return null;
  try {
    const { SecureStoragePlugin } = await import('capacitor-secure-storage-plugin');
    // Test if it's available (native only)
    await SecureStoragePlugin.keys();
    secureStorageAvailable = true;
    return {
      get: async (key: string) => {
        try { const r = await SecureStoragePlugin.get({ key }); return r.value; } catch { return null; }
      },
      set: async (key: string, value: string) => { await SecureStoragePlugin.set({ key, value }); },
      remove: async (key: string) => { try { await SecureStoragePlugin.remove({ key }); } catch {} },
    };
  } catch {
    secureStorageAvailable = false;
    return null;
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export function getIdentity(): AppIdentity | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function saveIdentitySecure(identity: AppIdentity): Promise<void> {
  // Always save to localStorage for sync access
  localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  // Also save to secure storage if available (private key protected by OS keychain)
  const secure = await getSecureStorage();
  if (secure) {
    await secure.set('identity-private-key', identity.privateKeyHex);
    await secure.set('identity-contact-hash', identity.contactHash);
  }
}

export function saveIdentity(identity: AppIdentity): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  // Fire async secure save (non-blocking)
  saveIdentitySecure(identity).catch(() => {});
}

export async function clearIdentity(): Promise<void> {
  localStorage.removeItem(STORAGE_KEY);
  const secure = await getSecureStorage();
  if (secure) {
    await secure.remove('identity-private-key');
    await secure.remove('identity-contact-hash');
  }
}

// ── Ed25519 keypair generation (requires secure context / HTTPS) ─────────────

export async function generateKeypair(): Promise<{ publicKeyHex: string; privateKeyHex: string }> {
  const keyPair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
  const pubRaw = await crypto.subtle.exportKey('spki', keyPair.publicKey);
  const privRaw = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
  return {
    publicKeyHex: bufToHex(pubRaw),
    privateKeyHex: bufToHex(privRaw),
  };
}

export async function signNonce(nonce: string, privateKeyHex: string): Promise<string> {
  const keyData = hexToBuf(privateKeyHex);
  const privateKey = await crypto.subtle.importKey('pkcs8', keyData, 'Ed25519', false, ['sign']);
  const signature = await crypto.subtle.sign('Ed25519', privateKey, new TextEncoder().encode(nonce));
  return bufToHex(signature);
}

function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBuf(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes.buffer;
}
