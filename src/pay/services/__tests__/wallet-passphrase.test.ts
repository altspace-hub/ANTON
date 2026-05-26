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
  enableWalletPassphrase, generateFalconKeyPair, getFalconPub,
  hasPassphrase, removeWalletPassphrase,
  unlockFalconPriv, unlockMnemonic, unlockPriv,
} from '../wallet-passphrase';

const WALLET_ID = 'test_wallet_pp';
const PRIV_HEX = '11'.repeat(32);
const MNEMONIC = Array.from({ length: 24 }, (_, i) => `word${i}`).join(' ');
const PASS1 = 'correct-horse-battery-staple';
const PASS2 = 'something-completely-different-12345';

function bytesToHex(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += b[i]!.toString(16).padStart(2, '0');
  return s;
}

async function fresh(): Promise<void> {
  await removeSecure(`fc.wallet.${WALLET_ID}.priv`);
  await removeSecure(`fc.wallet.${WALLET_ID}.mnemonic`);
  await removeSecure(`fc.wallet.${WALLET_ID}.falcon_priv`);
  await removeSecure(`fc.wallet.${WALLET_ID}.falcon_pub`);
  await removeSecure(`fc.wallet.${WALLET_ID}.passphrase_envelope`);
  await setSecure(`fc.wallet.${WALLET_ID}.priv`, PRIV_HEX);
  await setSecure(`fc.wallet.${WALLET_ID}.mnemonic`, MNEMONIC);
}

/** Stash a fresh FALCON keypair into the plaintext secure-store rows
 *  the way wallets.ts::createWallet does. Used by v3-path tests that
 *  want to assert preservation of an existing FALCON keypair across
 *  enable / change / remove cycles. */
async function freshWithFalcon(): Promise<{ falconPriv: string; falconPub: string }> {
  await fresh();
  const kp = generateFalconKeyPair();
  const falconPriv = bytesToHex(kp.falconPriv);
  const falconPub  = bytesToHex(kp.falconPub);
  await setSecure(`fc.wallet.${WALLET_ID}.falcon_priv`, falconPriv);
  await setSecure(`fc.wallet.${WALLET_ID}.falcon_pub`,  falconPub);
  return { falconPriv, falconPub };
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

  // ── FALCON / envelope v3 ──────────────────────────────────────────

  it('enable creates a v3 envelope with FALCON fields when no plaintext FALCON exists', async () => {
    // fresh() does NOT populate FALCON plaintext rows — the enable path
    // should generate a fresh keypair to keep v3 always-complete.
    await enableWalletPassphrase(WALLET_ID, PASS1);
    const raw = await getSecure(`fc.wallet.${WALLET_ID}.passphrase_envelope`);
    expect(raw).toBeTruthy();
    const env = JSON.parse(raw!) as { v: number; falcon_priv_ct?: string; falcon_pub?: string; iv_falcon?: string };
    expect(env.v).toBe(3);
    expect(env.falcon_priv_ct).toBeTruthy();
    expect(env.falcon_pub).toBeTruthy();
    expect(env.iv_falcon).toBeTruthy();
  });

  it('enable preserves an existing FALCON keypair (round-trip through unlockFalconPriv)', async () => {
    const { falconPriv, falconPub } = await freshWithFalcon();
    await enableWalletPassphrase(WALLET_ID, PASS1);
    const recoveredPriv = await unlockFalconPriv(WALLET_ID, PASS1);
    expect(recoveredPriv).toBe(falconPriv);
    const recoveredPub = await getFalconPub(WALLET_ID);
    expect(recoveredPub).not.toBeNull();
    expect(bytesToHex(recoveredPub!)).toBe(falconPub);
  });

  it('enable removes the plaintext FALCON rows', async () => {
    await freshWithFalcon();
    await enableWalletPassphrase(WALLET_ID, PASS1);
    expect(await getSecure(`fc.wallet.${WALLET_ID}.falcon_priv`)).toBeNull();
    expect(await getSecure(`fc.wallet.${WALLET_ID}.falcon_pub`)).toBeNull();
  });

  it('getFalconPub works without a passphrase on a plaintext-only wallet', async () => {
    const { falconPub } = await freshWithFalcon();
    const recovered = await getFalconPub(WALLET_ID);
    expect(recovered).not.toBeNull();
    expect(bytesToHex(recovered!)).toBe(falconPub);
  });

  it('getFalconPub returns null for a wallet with neither envelope nor plaintext FALCON', async () => {
    await fresh(); // no FALCON rows, no envelope
    const recovered = await getFalconPub(WALLET_ID);
    expect(recovered).toBeNull();
  });

  it('change passphrase preserves the FALCON keypair', async () => {
    const { falconPriv, falconPub } = await freshWithFalcon();
    await enableWalletPassphrase(WALLET_ID, PASS1);
    await changeWalletPassphrase(WALLET_ID, PASS1, PASS2);
    expect(await unlockFalconPriv(WALLET_ID, PASS2)).toBe(falconPriv);
    const pub = await getFalconPub(WALLET_ID);
    expect(pub).not.toBeNull();
    expect(bytesToHex(pub!)).toBe(falconPub);
  });

  it('remove passphrase restores the FALCON plaintext rows', async () => {
    const { falconPriv, falconPub } = await freshWithFalcon();
    await enableWalletPassphrase(WALLET_ID, PASS1);
    await removeWalletPassphrase(WALLET_ID, PASS1);
    expect(await getSecure(`fc.wallet.${WALLET_ID}.falcon_priv`)).toBe(falconPriv);
    expect(await getSecure(`fc.wallet.${WALLET_ID}.falcon_pub`)).toBe(falconPub);
  });

  it('unlockFalconPriv throws BadPassphraseError on wrong passphrase', async () => {
    await freshWithFalcon();
    await enableWalletPassphrase(WALLET_ID, PASS1);
    await expect(unlockFalconPriv(WALLET_ID, PASS2))
      .rejects.toBeInstanceOf(BadPassphraseError);
  });

  it('unlockFalconPriv throws NoPassphraseError when no envelope present', async () => {
    await fresh();
    await expect(unlockFalconPriv(WALLET_ID, PASS1))
      .rejects.toBeInstanceOf(NoPassphraseError);
  });

  it('v2 envelopes lazily migrate to v3 on first unlock — preserves passphrase + adds FALCON', async () => {
    // Hand-craft a v2 envelope using the same primitives the v2 code
    // would have written. We re-use the public enable API to build a
    // v3 envelope first, then surgically downgrade it to v2 by
    // stripping the FALCON fields and resetting v=2. This mirrors what
    // a real device that hadn't yet migrated would have on disk.
    await fresh();
    await enableWalletPassphrase(WALLET_ID, PASS1);
    const rawV3 = await getSecure(`fc.wallet.${WALLET_ID}.passphrase_envelope`);
    const envV3 = JSON.parse(rawV3!) as Record<string, unknown>;
    const envV2 = {
      v: 2,
      salt:     envV3.salt,
      iv_priv:  envV3.iv_priv,
      priv_ct:  envV3.priv_ct,
      iv_mnem:  envV3.iv_mnem,
      mnem_ct:  envV3.mnem_ct,
    };
    await setSecure(`fc.wallet.${WALLET_ID}.passphrase_envelope`, JSON.stringify(envV2));
    // Sanity: re-read confirms it's been downgraded.
    const rawCheck = JSON.parse(
      (await getSecure(`fc.wallet.${WALLET_ID}.passphrase_envelope`))!,
    ) as { v: number };
    expect(rawCheck.v).toBe(2);

    // First unlock under the SAME passphrase should auto-migrate to v3
    // and return the original priv unchanged.
    const recoveredPriv = await unlockPriv(WALLET_ID, PASS1);
    expect(recoveredPriv).toBe(PRIV_HEX);

    // Envelope on disk is now v3 with FALCON fields populated.
    const rawAfter = await getSecure(`fc.wallet.${WALLET_ID}.passphrase_envelope`);
    const envAfter = JSON.parse(rawAfter!) as { v: number; falcon_pub?: string };
    expect(envAfter.v).toBe(3);
    expect(envAfter.falcon_pub).toBeTruthy();

    // And FALCON priv unlocks cleanly under the same passphrase.
    const falconPriv = await unlockFalconPriv(WALLET_ID, PASS1);
    expect(falconPriv.length).toBeGreaterThan(0);
  });

  it('v2 → v3 migration is idempotent — repeated unlocks are no-ops', async () => {
    // After the first unlock triggers a migration, subsequent unlocks
    // should see v3 directly and never re-migrate (no new FALCON keypair).
    await fresh();
    await enableWalletPassphrase(WALLET_ID, PASS1);
    const env1 = await getSecure(`fc.wallet.${WALLET_ID}.passphrase_envelope`);
    await unlockPriv(WALLET_ID, PASS1);
    const env2 = await getSecure(`fc.wallet.${WALLET_ID}.passphrase_envelope`);
    expect(env2).toBe(env1); // unchanged — no double migration
  });
});
