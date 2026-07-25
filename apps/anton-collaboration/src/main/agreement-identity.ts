/**
 * agreement-identity.ts — the standalone's persistent Ed25519 signing identity
 * for agreements. Separate from any wallet key (the wallet lives in Agent Pay);
 * the proposalHash, not the key, is what bridges an agreement to its on-chain
 * settlement. This key IS the proposerPubkey / acceptorPubkey the seller's
 * ANTON verifies against.
 *
 * Persisted as {privHex, pubHex} under `identity.agreement.v1` in the pluggable
 * StorageBackend (file-backed, mode 0600, in production). The private seed never
 * leaves this module — callers get the pubkey + signing methods only.
 */
import type { StorageBackend } from './storage.js';
import {
  generateAgreementKeypair, publicKeyOf, signProposal, signResponse, signMessage,
  type AgreementKeypair,
} from './agreement-crypto.js';
import { withdrawSigningString } from './agreement-core.js';

const KEY = 'identity.agreement.v1';

export class AgreementIdentity {
  /** Cache the load/create so two concurrent callers can't each generate a
   *  keypair and race to persist (which would orphan one and break already-
   *  signed agreements). First call wins; the rest await it. */
  private cached: Promise<AgreementKeypair> | null = null;

  constructor(
    private readonly storage: StorageBackend,
    private readonly generate: () => Promise<AgreementKeypair> = generateAgreementKeypair,
  ) {}

  private async loadOrCreate(): Promise<AgreementKeypair> {
    if (this.cached) return this.cached;
    this.cached = (async () => {
      // "Cannot read the row" and "there is no row" are NOT the same thing, and
      // conflating them here destroys keys.
      //
      // EncryptedKeyStorage.get() deliberately THROWS when a row is sealed and
      // ANTON_COLLAB_KEY_ENCRYPTION_KEY is absent or wrong (there is a test named
      // "refuses to serve an encrypted row without the key (no silent
      // lockout-bypass)"). Swallowing that with `.catch(() => null)` fell straight
      // through to generate() + set() — and with no key held, set() writes
      // PLAINTEXT OVER THE CIPHERTEXT. One boot from the wrong shell, a roamed
      // profile, or an unsynced key file would therefore: permanently destroy the
      // signing identity, orphan every already-signed agreement (their
      // proposerPubkey/acceptorPubkey no longer match), change the agent's
      // contactHash so the paired phone can never reach it again, and silently
      // downgrade the store to plaintext. Loudly refusing is the only safe
      // response — a human can restore a backup or fix the env var, but nobody
      // can recover a key that was overwritten.
      let raw: string | null;
      try {
        raw = await this.storage.get(KEY);
      } catch (e) {
        throw new Error(
          'agreement identity exists but could not be read — refusing to mint a new one. '
          + 'Minting would overwrite the stored key, invalidating every signed agreement and '
          + 'changing this agent\'s contactHash. Check ANTON_COLLAB_KEY_ENCRYPTION_KEY '
          + `(or restore the wallet directory from backup). Cause: ${e instanceof Error ? e.message : String(e)}`,
        );
      }

      if (raw) {
        // A row that exists but does not parse is corruption, not absence — same
        // reasoning as above, so surface it instead of overwriting.
        let parsed: Partial<AgreementKeypair>;
        try {
          parsed = JSON.parse(raw) as Partial<AgreementKeypair>;
        } catch (e) {
          throw new Error(
            'agreement identity row is present but unparseable — refusing to overwrite it. '
            + `Back it up and remove it deliberately if you intend to re-key. Cause: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
        if (typeof parsed.privHex === 'string' && /^[0-9a-f]{64}$/.test(parsed.privHex)) {
          // Re-derive the pub from the seed so a tampered/missing pubHex can't
          // make us sign under a key that doesn't match what we publish.
          const pubHex = await publicKeyOf(parsed.privHex);
          return { privHex: parsed.privHex, pubHex };
        }
        throw new Error(
          'agreement identity row is malformed (no valid privHex) — refusing to overwrite it. '
          + 'Back it up and remove it deliberately if you intend to re-key.',
        );
      }

      // Genuinely absent — first run. This is the ONLY path that may mint.
      const kp = await this.generate();
      await this.storage.set(KEY, JSON.stringify(kp));
      return kp;
    })();
    return this.cached;
  }

  /** The public key (proposerPubkey / acceptorPubkey). Creates the identity on
   *  first use. */
  async pubkey(): Promise<string> {
    return (await this.loadOrCreate()).pubHex;
  }

  /** Sign a proposalHash (domain-tagged) — the proposerSig / counterProposerSig. */
  async signProposalHash(proposalHash: string): Promise<string> {
    return signProposal(proposalHash, (await this.loadOrCreate()).privHex);
  }

  /** Sign a response digest (domain-tagged) — the responderSig (accept/decline/counter). */
  async signResponseDigest(responseDigest: string): Promise<string> {
    return signResponse(responseDigest, (await this.loadOrCreate()).privHex);
  }

  /** Sign a withdraw of an outstanding proposal — the withdrawSig. */
  async signWithdraw(proposalHash: string): Promise<string> {
    return signMessage(withdrawSigningString(proposalHash), (await this.loadOrCreate()).privHex);
  }

  /** Sign an arbitrary domain-tagged message with the instance identity (used by
   *  the fulfilment leg for shipment / delivery signing strings). */
  async signString(message: string): Promise<string> {
    return signMessage(message, (await this.loadOrCreate()).privHex);
  }
}
