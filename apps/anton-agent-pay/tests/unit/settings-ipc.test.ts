/**
 * settings-ipc.test.ts — tests the IPC handler dispatch directly
 * (without Electron's ipcMain). Each handler is a pure async function
 * over Wallet + PairingStore; tests cover wallet create/import/delete +
 * passphrase enable/change/remove + pairing new-code/list/revoke +
 * the friendly error mapping.
 */
import { describe, expect, it } from 'vitest';
import { makeSettingsHandlers } from '../../src/main/settings-ipc.js';
import { Wallet, InMemoryStorageBackend } from '../../src/main/wallet/index.js';
import { PairingStore } from '../../src/main/pairing.js';

const TEST_BOOT = {
  port: 49250,
  pid: 12345,
  discoveryFile: '/tmp/test/server.json',
  endpoint: 'http://test.local',
};

function setup() {
  const wallet = new Wallet(new InMemoryStorageBackend());
  const pairings = new PairingStore();
  const handlers = makeSettingsHandlers({
    wallet, pairings, getBootInfo: () => TEST_BOOT,
  });
  return { wallet, pairings, handlers };
}

describe('settings-ipc handlers', () => {
  describe('walletInfo', () => {
    it('returns exists=false on fresh install', async () => {
      const { handlers } = setup();
      expect(await handlers.walletInfo()).toEqual({ exists: false });
    });

    it('returns address + hasPassphrase=false after create', async () => {
      const { wallet, handlers } = setup();
      await wallet.create();
      const info = await handlers.walletInfo();
      expect(info.exists).toBe(true);
      expect(info.address).toMatch(/^fc_/);
      expect(info.hasPassphrase).toBe(false);
    });

    it('reflects hasPassphrase=true after enablePassphrase', async () => {
      const { wallet, handlers } = setup();
      await wallet.create();
      await wallet.enablePassphrase('a-strong-passphrase-12chars');
      const info = await handlers.walletInfo();
      expect(info.hasPassphrase).toBe(true);
    });
  });

  describe('walletCreate', () => {
    it('returns address + mnemonic on first call', async () => {
      const { handlers } = setup();
      const r = await handlers.walletCreate();
      expect('error' in r).toBe(false);
      if ('error' in r) throw new Error('unreachable'); // narrowing
      expect(r.address).toMatch(/^fc_/);
      expect(r.mnemonic.split(' ').length).toBe(24);
    });

    it('returns friendly error on second call', async () => {
      const { handlers } = setup();
      await handlers.walletCreate();
      const r = await handlers.walletCreate();
      expect('error' in r).toBe(true);
      if ('error' in r) expect(r.error).toMatch(/already exists/i);
    });
  });

  describe('walletImport', () => {
    const MNEMONIC =
      'abandon abandon abandon abandon abandon abandon abandon abandon '
      + 'abandon abandon abandon abandon abandon abandon abandon abandon '
      + 'abandon abandon abandon abandon abandon abandon abandon art';

    it('imports a valid 24-word mnemonic', async () => {
      const { handlers } = setup();
      const r = await handlers.walletImport({ mnemonic: MNEMONIC });
      expect('error' in r).toBe(false);
      if ('error' in r) throw new Error('unreachable');
      expect(r.address).toMatch(/^fc_/);
    });

    it('rejects empty input', async () => {
      const { handlers } = setup();
      const r = await handlers.walletImport({ mnemonic: '' });
      if (!('error' in r)) throw new Error('expected error');
      expect(r.error).toMatch(/24-word/i);
    });

    it('rejects wrong word count with a clear message', async () => {
      const { handlers } = setup();
      const r = await handlers.walletImport({ mnemonic: 'only three words' });
      if (!('error' in r)) throw new Error('expected error');
      expect(r.error).toMatch(/24 words/i);
      expect(r.error).toMatch(/got 3/);
    });

    it('rejects when a wallet already exists', async () => {
      const { wallet, handlers } = setup();
      await wallet.create();
      const r = await handlers.walletImport({ mnemonic: MNEMONIC });
      if (!('error' in r)) throw new Error('expected error');
      expect(r.error).toMatch(/already exists/i);
    });
  });

  describe('walletRevealMnemonic', () => {
    it('returns the mnemonic when no passphrase is set', async () => {
      const { wallet, handlers } = setup();
      const created = await wallet.create();
      const r = await handlers.walletRevealMnemonic({});
      if ('error' in r) throw new Error('unreachable');
      expect(r.mnemonic).toBe(created.mnemonic);
    });

    it('demands a passphrase when one is set', async () => {
      const { wallet, handlers } = setup();
      await wallet.create();
      await wallet.enablePassphrase('strong-pass-12chars');
      const r = await handlers.walletRevealMnemonic({});
      if (!('error' in r)) throw new Error('expected error');
      expect(r.error).toMatch(/passphrase is required/i);
    });

    it('rejects wrong passphrase with a clean message', async () => {
      const { wallet, handlers } = setup();
      await wallet.create();
      await wallet.enablePassphrase('strong-pass-12chars');
      const r = await handlers.walletRevealMnemonic({ passphrase: 'wrong' });
      if (!('error' in r)) throw new Error('expected error');
      expect(r.error).toMatch(/incorrect/i);
    });
  });

  describe('walletDelete', () => {
    it('refuses without the literal DELETE confirmation', async () => {
      const { wallet, handlers } = setup();
      await wallet.create();
      const r = await handlers.walletDelete({ confirm: 'delete' }); // lowercase!
      if (!('error' in r)) throw new Error('expected error');
      expect(r.error).toMatch(/DELETE/);
      expect(await wallet.exists()).toBe(true); // unchanged
    });

    it('wipes the wallet on confirmed delete', async () => {
      const { wallet, handlers } = setup();
      await wallet.create();
      const r = await handlers.walletDelete({ confirm: 'DELETE' });
      expect(r).toEqual({ ok: true });
      expect(await wallet.exists()).toBe(false);
    });
  });

  describe('walletEnablePassphrase', () => {
    it('requires a 12+ char passphrase', async () => {
      const { wallet, handlers } = setup();
      await wallet.create();
      const r = await handlers.walletEnablePassphrase({ passphrase: 'short' });
      if (!('error' in r)) throw new Error('expected error');
      expect(r.error).toMatch(/12 characters/i);
    });

    it('accepts a good passphrase', async () => {
      const { wallet, handlers } = setup();
      await wallet.create();
      const r = await handlers.walletEnablePassphrase({ passphrase: 'good-12-chars' });
      expect(r).toEqual({ ok: true });
      expect(await wallet.hasPassphrase()).toBe(true);
    });
  });

  describe('walletChangePassphrase', () => {
    it('rejects wrong current passphrase', async () => {
      const { wallet, handlers } = setup();
      await wallet.create();
      await wallet.enablePassphrase('old-pass-12chars');
      const r = await handlers.walletChangePassphrase({
        oldPassphrase: 'wrong', newPassphrase: 'new-pass-12chars',
      });
      if (!('error' in r)) throw new Error('expected error');
      expect(r.error).toMatch(/incorrect/i);
    });

    it('rotates on valid input', async () => {
      const { wallet, handlers } = setup();
      await wallet.create();
      await wallet.enablePassphrase('old-pass-12chars');
      const r = await handlers.walletChangePassphrase({
        oldPassphrase: 'old-pass-12chars', newPassphrase: 'new-pass-12chars',
      });
      expect(r).toEqual({ ok: true });
    });
  });

  describe('pairing', () => {
    it('pairingNewCode returns a 6-digit code + 60s expiry', async () => {
      const { handlers } = setup();
      const r = await handlers.pairingNewCode();
      expect(r.code).toMatch(/^\d{6}$/);
      expect(r.expiresInMs).toBe(60_000);
    });

    it('pairingList reports paired agents', async () => {
      const { handlers, pairings } = setup();
      // Pair one directly via PairingStore
      const code = pairings.newCode();
      pairings.redeemCode({ name: 'test-agent', code });
      const r = await handlers.pairingList();
      expect(r.agents).toHaveLength(1);
      expect(r.agents[0]!.name).toBe('test-agent');
    });

    it('pairingRevoke removes a known agent', async () => {
      const { handlers, pairings } = setup();
      const code = pairings.newCode();
      const issued = pairings.redeemCode({ name: 'x', code });
      const r = await handlers.pairingRevoke({ agentId: issued.agent.id });
      expect(r).toEqual({ ok: true });
      expect((await handlers.pairingList()).agents).toHaveLength(0);
    });

    it('pairingRevoke on unknown returns ok=false', async () => {
      const { handlers } = setup();
      const r = await handlers.pairingRevoke({ agentId: 'a_unknown' });
      expect(r).toEqual({ ok: false });
    });
  });

  describe('bootInfo', () => {
    it('returns the closure-captured boot info', async () => {
      const { handlers } = setup();
      const r = await handlers.bootInfo();
      expect(r).toEqual(TEST_BOOT);
    });
  });
});
