/**
 * settings-ipc.ts — registers ipcMain handlers for the Settings window.
 *
 * Why a separate module: tests can exercise the handler functions
 * directly (without Electron's ipcMain) by calling them as plain
 * functions, and main.ts stays free of dispatcher boilerplate.
 *
 * Spec: docs/ANTON_AGENT_PAY_SPEC.md §10 (renderer/settings/)
 */
import type { PairingStore } from './pairing.js';
import type { Wallet } from './wallet/index.js';
import {
  BadPassphraseError, NoWalletError, PassphraseRequiredError,
  WalletAlreadyExistsError,
} from './wallet/index.js';
import { IPC_SETTINGS } from '../shared/ipc-types.js';
import type { PairedAgent } from '../shared/ipc-types.js';

/** Settings-window IPC handlers. Each handler is a pure async function
 *  taking a known payload and returning a success object OR an
 *  `{ error: string }` envelope. Errors are mapped from the wallet/
 *  pairing modules' typed exceptions to user-readable messages —
 *  raw `Error.message` strings can leak internals; we want clean UX. */
export interface SettingsHandlersDeps {
  wallet: Wallet;
  pairings: PairingStore;
  /** Provides boot info (port, pid, discoveryFile, endpoint) at call
   *  time — main.ts captures these in a closure. */
  getBootInfo: () => { port: number; pid: number; discoveryFile: string; endpoint: string };
}

export function makeSettingsHandlers(deps: SettingsHandlersDeps) {
  const { wallet, pairings, getBootInfo } = deps;

  return {
    // ── Wallet info ────────────────────────────────────────────

    async walletInfo() {
      const exists = await wallet.exists();
      if (!exists) return { exists: false };
      const info = await wallet.publicInfo();
      return {
        exists: true,
        address: info.address,
        hasPassphrase: info.hasPassphrase,
      };
    },

    // ── Wallet creation ───────────────────────────────────────

    async walletCreate() {
      try {
        return await wallet.create();
      } catch (e) {
        if (e instanceof WalletAlreadyExistsError) {
          return { error: 'A wallet already exists on this install. Delete it first if you really want to start over.' };
        }
        return { error: friendly(e) };
      }
    },

    async walletImport(args: { mnemonic: string }) {
      if (typeof args?.mnemonic !== 'string' || args.mnemonic.trim().length === 0) {
        return { error: 'Paste your 24-word recovery phrase.' };
      }
      const words = args.mnemonic.trim().split(/\s+/);
      if (words.length !== 24) {
        return { error: `Recovery phrase must be exactly 24 words (got ${words.length}).` };
      }
      try {
        return await wallet.importFromMnemonic(args.mnemonic);
      } catch (e) {
        if (e instanceof WalletAlreadyExistsError) {
          return { error: 'A wallet already exists on this install. Delete it first to restore from a different phrase.' };
        }
        return { error: friendly(e) };
      }
    },

    // ── Reveal recovery phrase ────────────────────────────────

    async walletRevealMnemonic(args: { passphrase?: string }) {
      try {
        const mnemonic = await wallet.revealMnemonic(args?.passphrase);
        return { mnemonic };
      } catch (e) {
        if (e instanceof PassphraseRequiredError) {
          return { error: 'Wallet passphrase is required to show the recovery phrase.' };
        }
        if (e instanceof BadPassphraseError) {
          return { error: 'Wallet passphrase is incorrect.' };
        }
        if (e instanceof NoWalletError) {
          return { error: 'No wallet on this install yet.' };
        }
        return { error: friendly(e) };
      }
    },

    // ── Wallet delete ─────────────────────────────────────────

    async walletDelete(args: { confirm: string }) {
      // Cheap second factor against accidental destruction — the user
      // must type the exact word DELETE. UI handles capturing this
      // verbatim; main side double-checks.
      if (args?.confirm !== 'DELETE') {
        return { error: 'Type DELETE (uppercase) to confirm wallet deletion.' };
      }
      await wallet.wipe();
      return { ok: true as const };
    },

    // ── Passphrase management ─────────────────────────────────

    async walletEnablePassphrase(args: { passphrase: string }) {
      const v = validatePassphraseStrength(args?.passphrase);
      if (v) return { error: v };
      try {
        await wallet.enablePassphrase(args.passphrase);
        return { ok: true as const };
      } catch (e) {
        if (e instanceof NoWalletError) return { error: 'No wallet to protect.' };
        return { error: friendly(e) };
      }
    },

    async walletChangePassphrase(args: { oldPassphrase: string; newPassphrase: string }) {
      const v = validatePassphraseStrength(args?.newPassphrase);
      if (v) return { error: v };
      try {
        await wallet.changePassphrase(args.oldPassphrase, args.newPassphrase);
        return { ok: true as const };
      } catch (e) {
        if (e instanceof BadPassphraseError) return { error: 'Current passphrase is incorrect.' };
        return { error: friendly(e) };
      }
    },

    async walletRemovePassphrase(args: { passphrase: string }) {
      try {
        await wallet.removePassphrase(args?.passphrase);
        return { ok: true as const };
      } catch (e) {
        if (e instanceof BadPassphraseError) return { error: 'Passphrase is incorrect.' };
        return { error: friendly(e) };
      }
    },

    // ── Pairing ───────────────────────────────────────────────

    async pairingNewCode() {
      const code = pairings.newCode();
      return { code, expiresInMs: 60_000 };
    },

    async pairingList(): Promise<{ agents: PairedAgent[] }> {
      return { agents: pairings.list() };
    },

    async pairingRevoke(args: { agentId: string }) {
      if (typeof args?.agentId !== 'string') return { ok: false };
      return { ok: pairings.revoke(args.agentId) };
    },

    // ── Boot info / network display ───────────────────────────

    async bootInfo() {
      return getBootInfo();
    },
  };
}

export type SettingsHandlers = ReturnType<typeof makeSettingsHandlers>;

/** Lightweight passphrase rule — matches PAY_WALLET_PASSPHRASE_SPEC
 *  guidance: 12-char floor, NFC-normalised. The Pay app uses zxcvbn;
 *  Agent Pay defers that until we have a real Settings UX cycle. */
function validatePassphraseStrength(p: string | undefined): string | null {
  if (typeof p !== 'string' || p.length === 0) return 'Passphrase cannot be empty.';
  if (p.length < 12) return 'Use at least 12 characters.';
  return null;
}

function friendly(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

/** Register every handler against the IPC channels. Called from main.ts
 *  after Electron's app.whenReady() resolves. */
export function registerSettingsIpc(
  ipcMain: { handle: (channel: string, fn: (event: unknown, ...args: unknown[]) => unknown) => void },
  handlers: SettingsHandlers,
): void {
  const wire = (channel: string, fn: (args?: unknown) => unknown) => {
    ipcMain.handle(channel, (_e, args) => fn(args));
  };
  wire(IPC_SETTINGS.WALLET_INFO, () => handlers.walletInfo());
  wire(IPC_SETTINGS.WALLET_CREATE, () => handlers.walletCreate());
  wire(IPC_SETTINGS.WALLET_IMPORT, (a) => handlers.walletImport(a as { mnemonic: string }));
  wire(IPC_SETTINGS.WALLET_REVEAL_MNEMONIC, (a) => handlers.walletRevealMnemonic(a as { passphrase?: string }));
  wire(IPC_SETTINGS.WALLET_DELETE, (a) => handlers.walletDelete(a as { confirm: string }));
  wire(IPC_SETTINGS.WALLET_ENABLE_PASSPHRASE, (a) => handlers.walletEnablePassphrase(a as { passphrase: string }));
  wire(IPC_SETTINGS.WALLET_CHANGE_PASSPHRASE, (a) => handlers.walletChangePassphrase(a as { oldPassphrase: string; newPassphrase: string }));
  wire(IPC_SETTINGS.WALLET_REMOVE_PASSPHRASE, (a) => handlers.walletRemovePassphrase(a as { passphrase: string }));
  wire(IPC_SETTINGS.PAIRING_NEW_CODE, () => handlers.pairingNewCode());
  wire(IPC_SETTINGS.PAIRING_LIST, () => handlers.pairingList());
  wire(IPC_SETTINGS.PAIRING_REVOKE, (a) => handlers.pairingRevoke(a as { agentId: string }));
  wire(IPC_SETTINGS.BOOT_INFO, () => handlers.bootInfo());
}
