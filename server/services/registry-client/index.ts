/**
 * index.ts — public API of the registry client.
 *
 * Ties together: trust-store, cache, nonce-store, rate-limiter, audit-writer,
 * log-verifier, and transport. Exposes a small number of high-level methods
 * each portal-builder, portal-manager, and portal-viewer needs.
 *
 * Usage:
 *
 *   const client = createRegistryClient(db, {
 *     baseUrl: 'https://registry.anton.space/v1',
 *   });
 *
 *   const accepted = await client.register({
 *     name: 'daniel.bardun', namespace: 'futurechain', category: 'personal',
 *     actor: { contactHash, publicKeyHex }, privateKeyPem,
 *     publicIndex: true,
 *   });
 *
 *   const resolution = await client.resolve('daniel.bardun', 'futurechain');
 */

import type { DatabaseAdapter } from '../../db/database.js';
import { assertReplayWindow } from '../registry-protocol/envelope.js';
import { buildRegister, type PortalCategory } from '../registry-protocol/operations/register.js';

import { createAuditWriter, type AuditWriter } from './audit-writer.js';
import {
  createDescriptorCache,
  createResolutionCache,
  RESOLUTION_TTL_DEFAULT_SECS,
  RESOLUTION_TTL_NEGATIVE_SECS,
  RESOLUTION_TTL_REVOKED_SECS,
  type DescriptorCache,
  type ResolutionCache,
} from './cache.js';
import { createDbNonceStore, type DbNonceStore } from './nonce-store.js';
import { createRateLimiter, type RateLimiter } from './rate-limiter.js';
import { createTransport, type TransportClient } from './transport.js';
import { getTrustStore, type TrustStore } from './trust-store.js';
import {
  RegistryError,
  type OperationAcceptedResponse,
  type ResolutionResponse,
  type SignedSthEnvelope,
} from './types.js';

// ── Configuration ──────────────────────────────────────────────────────────

export interface RegistryClientConfig {
  baseUrl: string;
  timeoutMs?: number;
  maxRetries?: number;
  /** Inject a transport for tests (skips fetch). */
  transport?: TransportClient;
  /** Inject a trust store for tests. */
  trustStore?: TrustStore;
  /** Inject a fetch impl for tests. */
  fetchImpl?: typeof fetch;
}

// ── Public client surface ──────────────────────────────────────────────────

export interface RegistryClient {
  // Operations (all signed, all tracked, all rate-limited).
  register(args: RegisterArgs): Promise<OperationAcceptedResponse>;

  // Reads (cached by default).
  resolve(name: string, namespace: string, opts?: { skipCache?: boolean }): Promise<ResolutionResponse | null>;
  fetchLatestSth(): Promise<SignedSthEnvelope>;

  // Maintenance.
  pruneExpiredCaches(): Promise<{ resolution: number; descriptor: number; nonces: number }>;

  // Test helpers / introspection.
  readonly trustStore: TrustStore;
  readonly resolutionCache: ResolutionCache;
  readonly descriptorCache: DescriptorCache;
  readonly nonceStore: DbNonceStore;
  readonly rateLimiter: RateLimiter;
  readonly auditWriter: AuditWriter;
}

export interface RegisterArgs {
  name: string;
  namespace: string;
  category: PortalCategory;
  title?: string;
  description?: string;
  publicIndex?: boolean;
  actor: { contactHash: string; publicKeyHex: string };
  privateKeyPem: string;
}

// ── Factory ────────────────────────────────────────────────────────────────

export function createRegistryClient(
  db: DatabaseAdapter,
  config: RegistryClientConfig,
): RegistryClient {
  const trustStore = config.trustStore ?? getTrustStore();
  const transport =
    config.transport ??
    createTransport({
      baseUrl: config.baseUrl,
      timeoutMs: config.timeoutMs,
      maxRetries: config.maxRetries,
      fetchImpl: config.fetchImpl,
    });
  const resolutionCache = createResolutionCache(db);
  const descriptorCache = createDescriptorCache(db);
  const nonceStore = createDbNonceStore(db);
  const rateLimiter = createRateLimiter();
  const auditWriter = createAuditWriter(db);

  return {
    async register(args) {
      const limit = rateLimiter.checkAndRecord('register', args.actor.contactHash);
      if (!limit.allowed) {
        throw new RegistryError(
          'E_RATE_LIMIT_EXCEEDED',
          `Local rate-limit hit for register; retry in ${Math.ceil(limit.retryAfterMs / 1000)}s`,
          429,
        );
      }

      const signed = buildRegister(args);

      // Pre-flight nonce check — we never want to submit a duplicate.
      await assertReplayWindow(signed.envelope, nonceStore);

      try {
        const accepted = await transport.postSignedEnvelope<OperationAcceptedResponse>(
          '/operations',
          signed,
        );
        await auditWriter.write({
          operation: 'register',
          portalId: accepted.portalId,
          portalName: args.name,
          namespace: args.namespace,
          actorContactHash: args.actor.contactHash,
          responseStatus: 'success',
          registryLogId: accepted.logId,
        });
        return accepted;
      } catch (err) {
        const code = err instanceof RegistryError ? err.code : 'E_UNKNOWN';
        const message = err instanceof Error ? err.message : String(err);
        if (err instanceof RegistryError && err.httpStatus === 429) {
          rateLimiter.applyRetryAfter(
            'register',
            args.actor.contactHash,
            (err.details?.retryAfterSeconds as number | undefined ?? 60) * 1000,
          );
        }
        await auditWriter.write({
          operation: 'register',
          portalName: args.name,
          namespace: args.namespace,
          actorContactHash: args.actor.contactHash,
          responseStatus: 'error',
          errorCode: code,
          errorMessage: message,
        });
        throw err;
      }
    },

    async resolve(name, namespace, opts) {
      if (!opts?.skipCache) {
        const cached = await resolutionCache.get(namespace, name);
        if (cached) return cached.resolution;
      }

      const limit = rateLimiter.checkAndRecord('resolve', `${namespace}/${name}`);
      if (!limit.allowed) {
        throw new RegistryError(
          'E_RATE_LIMIT_EXCEEDED',
          `Local resolve rate-limit hit; retry in ${Math.ceil(limit.retryAfterMs / 1000)}s`,
          429,
        );
      }

      try {
        const resolution = await transport.get<ResolutionResponse>(
          `/resolve/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`,
        );
        const ttl = resolution.revokedAt
          ? RESOLUTION_TTL_REVOKED_SECS
          : RESOLUTION_TTL_DEFAULT_SECS;
        await resolutionCache.put(namespace, name, resolution, ttl);
        return resolution;
      } catch (err) {
        if (err instanceof RegistryError && err.httpStatus === 404) {
          await resolutionCache.put(namespace, name, null, RESOLUTION_TTL_NEGATIVE_SECS);
          return null;
        }
        throw err;
      }
    },

    async fetchLatestSth() {
      const sth = await transport.get<SignedSthEnvelope>('/sth/latest');
      // Caller is expected to verify the signature with verifyStsSignature
      // before trusting it for inclusion proofs.
      return sth;
    },

    async pruneExpiredCaches() {
      const [resolution, descriptor, nonces] = await Promise.all([
        resolutionCache.pruneExpired(),
        descriptorCache.pruneExpired(),
        nonceStore.cleanupOldNonces(),
      ]);
      return { resolution, descriptor, nonces };
    },

    trustStore,
    resolutionCache,
    descriptorCache,
    nonceStore,
    rateLimiter,
    auditWriter,
  };
}

// ── Re-exports for convenience ─────────────────────────────────────────────

export { RegistryError } from './types.js';
export type {
  OperationAcceptedResponse,
  ResolutionResponse,
  SignedSthEnvelope,
} from './types.js';
export { verifyInclusion, verifyConsistency, verifyStsSignature } from './log-verifier.js';
