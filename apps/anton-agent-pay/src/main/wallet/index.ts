/**
 * wallet/index.ts — public re-exports.
 *
 * Consumers (main.ts, server.ts) import from this module only.
 */
export {
  type StorageBackend, InMemoryStorageBackend, FileStorageBackend,
} from './storage.js';
export {
  Wallet,
  BadPassphraseError, NoWalletError, WalletAlreadyExistsError,
  PassphraseRequiredError,
  type PublicWalletInfo, type UnlockedWallet,
} from './wallet.js';
export {
  type PassphraseEnvelopeV3, type OpenedEnvelope, type BuildEnvelopeInput,
  buildEnvelope, openEnvelope, rotateEnvelope, parseEnvelopeJSON,
  bytesToHex, hexToBytes, b64encode, b64decode,
} from './envelope.js';
