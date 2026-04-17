// Ambient type stubs for Capacitor / @noble packages that ship with the
// companion app. These are minimal — sufficient to make `pnpm typecheck`
// pass before the real packages are pulled in via `pnpm install`. The
// real types come along after install and overlay these.

// ── @noble/ed25519 ───────────────────────────────────────────────────────
declare module '@noble/ed25519' {
  export function getPublicKeyAsync(privateKey: Uint8Array): Promise<Uint8Array>;
  export function signAsync(message: Uint8Array, privateKey: Uint8Array): Promise<Uint8Array>;
  export function verifyAsync(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): Promise<boolean>;
  export const utils: {
    randomPrivateKey(): Uint8Array;
  };
  export const etc: {
    sha512Sync: ((...m: Uint8Array[]) => Uint8Array) | undefined;
    concatBytes(...arrs: Uint8Array[]): Uint8Array;
  };
}

// ── @noble/hashes ────────────────────────────────────────────────────────
declare module '@noble/hashes/sha512' {
  export function sha512(input: Uint8Array | string): Uint8Array;
}
declare module '@noble/hashes/sha256' {
  export function sha256(input: Uint8Array | string): Uint8Array;
}

// ── @aparajita/capacitor-secure-storage ──────────────────────────────────
declare module '@aparajita/capacitor-secure-storage' {
  export const SecureStorage: {
    set(key: string, value: string): Promise<void>;
    get(key: string): Promise<string | null>;
    remove(key: string): Promise<boolean>;
    keys(): Promise<string[]>;
    clear(): Promise<boolean>;
  };
}

// ── @capgo/capacitor-native-biometric ────────────────────────────────────
declare module '@capgo/capacitor-native-biometric' {
  export const NativeBiometric: {
    isAvailable(): Promise<{ isAvailable: boolean; biometryType?: number; errorCode?: number }>;
    verifyIdentity(opts: {
      reason: string;
      title?: string;
      subtitle?: string;
      description?: string;
      negativeButtonText?: string;
      useFallback?: boolean;
      maxAttempts?: number;
    }): Promise<void>;
    setCredentials(opts: { username: string; password: string; server: string }): Promise<void>;
    getCredentials(opts: { server: string }): Promise<{ username: string; password: string }>;
    deleteCredentials(opts: { server: string }): Promise<void>;
  };
}

// ── @capacitor/haptics ───────────────────────────────────────────────────
declare module '@capacitor/haptics' {
  export const Haptics: {
    impact(opts: { style: 'HEAVY' | 'MEDIUM' | 'LIGHT' | string }): Promise<void>;
    notification(opts: { type: 'SUCCESS' | 'WARNING' | 'ERROR' | string }): Promise<void>;
    vibrate(opts?: { duration?: number }): Promise<void>;
    selectionStart(): Promise<void>;
    selectionChanged(): Promise<void>;
    selectionEnd(): Promise<void>;
  };
  export enum ImpactStyle { Heavy = 'HEAVY', Medium = 'MEDIUM', Light = 'LIGHT' }
  export enum NotificationType { Success = 'SUCCESS', Warning = 'WARNING', Error = 'ERROR' }
}

// ── @capacitor/push-notifications ────────────────────────────────────────
declare module '@capacitor/push-notifications' {
  export interface PushNotificationToken { value: string }
  export interface PushNotification {
    title?: string;
    subtitle?: string;
    body?: string;
    id?: string;
    badge?: number;
    notification?: { data?: Record<string, string> };
    data?: Record<string, string>;
  }
  export interface PluginListenerHandle { remove(): Promise<void> }
  export const PushNotifications: {
    register(): Promise<void>;
    checkPermissions(): Promise<{ receive: 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied' }>;
    requestPermissions(): Promise<{ receive: 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied' }>;
    addListener(eventName: 'registration', callback: (token: PushNotificationToken) => void): Promise<PluginListenerHandle>;
    addListener(eventName: 'registrationError', callback: (error: { error?: string } | string) => void): Promise<PluginListenerHandle>;
    addListener(eventName: 'pushNotificationReceived', callback: (notification: PushNotification) => void): Promise<PluginListenerHandle>;
    addListener(eventName: 'pushNotificationActionPerformed', callback: (action: { actionId: string; notification: PushNotification }) => void): Promise<PluginListenerHandle>;
    removeAllListeners(): Promise<void>;
  };
}

// ── @capacitor-mlkit/barcode-scanning ────────────────────────────────────
declare module '@capacitor-mlkit/barcode-scanning' {
  export interface Barcode { rawValue: string; format: string }
  export const BarcodeScanner: {
    isSupported(): Promise<{ supported: boolean }>;
    requestPermissions(): Promise<{ camera: 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale' | 'limited' }>;
    scan(opts?: { formats?: string[] }): Promise<{ barcodes: Barcode[] }>;
  };
}
