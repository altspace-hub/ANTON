/**
 * wallet-passphrase.test.ts — round-trip + failure modes for the
 * opt-in second factor.
 *
 * Spec: docs/PAY_WALLET_PASSPHRASE_SPEC.md
 *
 * Runs against the in-memory secure-store fallback (vitest has no
 * Capacitor + no IndexedDB) — the envelope logic itself is the same
 * on every tier.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { getSecure, removeSecure, setSecure } from '../secure-store';
import {
  BadPassphraseError, NoPassphraseError, changeWalletPassphrase,
  enableWalletPassphrase, hasPassphrase, removeWalletPassphrase,
  unlockMnemonic, unlockPriv,
} from '../wallet-passphrase';

const WALLET_ID = 'test_wallet_pp';
const PRIV_HEX = '11'.repeat(32);
const MNEMONIC = Array.from({ length: 24 }, (_, i) => `word${i}`).join(' ');
const PASS1 = 'correct-horse-battery-staple';
const PASS2 = 'something-completely-different-12345';

async function fresh(): Promise<void> {
  await removeSecure(`fc.wallet.${WALLET_ID}.priv`);
  await removeSecure(`fc.wallet.${WALLET_ID}.mnemonic`);
  await removeSecure(`fc.wallet.${WALLET_ID}.passphrase_envelope`);
  await setSecure(`fc.wallet.${WALLET_ID}.priv`, PRIV_HEX);
  await setSecure(`fc.wallet.${WALLET_ID}.mnemonic`, MNEMONIC);
}

describe('wallet-passphrase', () => {
  beforeEach(async () => {
    await fresh();
  });

  it('hasPassphrase is false before enable, true after', async () => {
    expect(await hasPassphrase(WALLET_ID)).toBe(false);
    await enableWalletPassphrase(WALLET_ID, PASS1);
    expect(await hasPassphrase(WALLET_ID)).toBe(true);
  });

  it('enable removes the plaintext priv + mnemonic rows', async () => {
    await enableWalletPassphrase(WALLET_ID, PASS1);
    expect(await getSecure(`fc.wallet.${WALLET_ID}.priv`)).toBeNull();
    expect(await getSecure(`fc.wallet.${WALLET_ID}.mnemonic`)).toBeNull();
    // envelope row is present
    expect(await getSecure(`fc.wallet.${WALLET_ID}.passphrase_envelope`)).toBeTruthy();
  });

  it('unlockPriv returns the original priv with the right passphrase', async () => {
    await enableWalletPassphrase(WALLET_ID, PASS1);
    const recovered = await unlockPriv(WALLET_ID, PASS1);
    expect(recovered).toBe(PRIV_HEX);
  });

  it('unlockMnemonic returns the original mnemonic with the right passphrase', async () => {
    await enableWalletPassphrase(WALLET_ID, PASS1);
    const recovered = await unlockMnemonic(WALLET_ID, PASS1);
    expect(recovered).toBe(MNEMONIC);
  });

  it('unlockPriv throws BadPassphraseError on a wrong passphrase', async () => {
    await enableWalletPassphrase(WALLET_ID, PASS1);
    await expect(unlockPriv(WALLET_ID, PASS2))
      .rejects.toBeInstanceOf(BadPassphraseError);
  });

  it('unlockPriv throws NoPassphraseError when none is set', async () => {
    await expect(unlockPriv(WALLET_ID, PASS1))
      .rejects.toBeInstanceOf(NoPassphraseError);
  });

  it('changeWalletPassphrase rotates the key', async () => {
    await enableWalletPassphrase(WALLET_ID, PASS1);
    await changeWalletPassphrase(WALLET_ID, PASS1, PASS2);
    await expect(unlockPriv(WALLET_ID, PASS1))
      .rejects.toBeInstanceOf(BadPassphraseError);
    expect(await unlockPriv(WALLET_ID, PASS2)).toBe(PRIV_HEX);
  });

  it('changeWalletPassphrase refuses without the old passphrase', async () => {
    await enableWalletPassphrase(WALLET_ID, PASS1);
    await expect(changeWalletPassphrase(WALLET_ID, 'wrong', PASS2))
      .rejects.toBeInstanceOf(BadPassphraseError);
    // original passphrase still works
    expect(await unlockPriv(WALLET_ID, PASS1)).toBe(PRIV_HEX);
  });

  it('removeWalletPassphrase puts the plaintext rows back', async () => {
    await enableWalletPassphrase(WALLET_ID, PASS1);
    await removeWalletPassphrase(WALLET_ID, PASS1);
    expect(await hasPassphrase(WALLET_ID)).toBe(false);
    expect(await getSecure(`fc.wallet.${WALLET_ID}.priv`)).toBe(PRIV_HEX);
    expect(await getSecure(`fc.wallet.${WALLET_ID}.mnemonic`)).toBe(MNEMONIC);
  });

  it('removeWalletPassphrase refuses without the current passphrase', async () => {
    await enableWalletPassphrase(WALLET_ID, PASS1);
    await expect(removeWalletPassphrase(WALLET_ID, 'wrong'))
      .rejects.toBeInstanceOf(BadPassphraseError);
    expect(await hasPassphrase(WALLET_ID)).toBe(true);
  });

  it('two enable calls per wallet are rejected (use change instead)', async () => {
    await enableWalletPassphrase(WALLET_ID, PASS1);
    await expect(enableWalletPassphrase(WALLET_ID, PASS2)).rejects.toThrow(
      /already has a passphrase/i,
    );
  });

  it('salt is fresh per enable — re-encrypting with the same passphrase yields a different ciphertext', async () => {
    await enableWalletPassphrase(WALLET_ID, PASS1);
    const env1 = await getSecure(`fc.wallet.${WALLET_ID}.passphrase_envelope`);
    await removeWalletPassphrase(WALLET_ID, PASS1);
    await enableWalletPassphrase(WALLET_ID, PASS1);
    const env2 = await getSecure(`fc.wallet.${WALLET_ID}.passphrase_envelope`);
    expect(env1).not.toBe(env2);
  });
});
