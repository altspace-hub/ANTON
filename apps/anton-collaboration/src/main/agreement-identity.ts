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
      const raw = await this.storage.get(KEY).catch(() => null);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Partial<AgreementKeypair>;
          if (typeof parsed.privHex === 'string' && /^[0-9a-f]{64}$/.test(parsed.privHex)) {
            // Re-derive the pub from the seed so a tampered/missing pubHex can't
            // make us sign under a key that doesn't match what we publish.
            const pubHex = await publicKeyOf(parsed.privHex);
            return { privHex: parsed.privHex, pubHex };
          }
        } catch { /* fall through to regenerate */ }
      }
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
