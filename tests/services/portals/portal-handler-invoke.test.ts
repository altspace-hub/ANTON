/**
 * Unit tests for portal-handler invoke trust bits (Wave-3 plan 3.7):
 *
 *   - handleInvoke validates visitor input against the capability's
 *     inputSchema via ajv: malformed input → invoke_validation_failed,
 *     conforming input → invoke_accepted with a verb-prefixed responseId
 *   - trustRequirements.visitorIdentityRequired rejects anonymous invokes
 *   - unknown capability / inactive portal are refused
 *   - handleInvocationStatus exposes ONLY lifecycle fields + the owner's
 *     response — never the visitor's input or contact hash (handler-level
 *     complement to tests/routes/portal-invocation-status.test.ts which
 *     pins the same property end-to-end over HTTP)
 *
 * Uses a SQL-pattern DB stub — the handler is pure logic + parameterised
 * queries, so stubbing the five queries it issues is sufficient and keeps
 * this a unit test (no Postgres, no Gateway).
 */

import { describe, it, expect } from 'vitest';

import { createPortalHandler } from '../../../server/services/portals/portal-handler.js';
import { getVerbBaseline } from '../../../server/services/capability-descriptor/verbs/index.js';
import type { DatabaseAdapter, RunResult } from '../../../server/db/database.js';

const ADDRESS = 'cake-shop.futurechain.portal';
const SECRET_INPUT = 'secret visitor input — must never surface';
const VISITOR_HASH = 'ANTON-VSTR-VSTR-VSTR-VSTR';

// Descriptor as cached in portal_descriptor_cache (the body the handler reads).
const descriptor: Record<string, unknown> = {
  portal: { displayTitle: 'The Cake Shop', category: 'commerce' },
  capabilities: [
    {
      id: 'say-hello',
      verb: 'contact',
      title: 'Send a message',
      description: 'Free-form message.',
      aapEndpoint: 'messages',
      inputSchema: getVerbBaseline('contact').inputSchema,
    },
    {
      id: 'members-only',
      verb: 'join',
      title: 'Apply to join',
      description: 'Membership application.',
      aapEndpoint: 'applications',
      trustRequirements: { visitorIdentityRequired: true },
    },
  ],
};

interface StubState {
  portalStatus: string;
  invocationRow?: Record<string, unknown>;
}

function stubDb(state: StubState): DatabaseAdapter {
  const ok: RunResult = { changes: 1, lastInsertRowid: 0 };
  return {
    dialect: 'postgresql',
    async get<T>(sql: string): Promise<T | undefined> {
      if (sql.includes('SELECT origin_endpoint')) return undefined; // local portal, no proxy
      if (sql.includes('SELECT descriptor FROM portal_descriptor_cache')) {
        return { descriptor } as T;
      }
      if (sql.includes('SELECT metadata FROM portals')) {
        return { metadata: null } as T; // no ownerId → push notification skipped
      }
      if (sql.includes('FROM portals WHERE namespace')) {
        return {
          id: 'portal-1',
          name: 'cake-shop',
          namespace: 'futurechain',
          category: 'commerce',
          display_title: 'The Cake Shop',
          status: state.portalStatus,
        } as T;
      }
      if (sql.includes('INSERT INTO portal_capability_invocations')) {
        return { id: 'invocation-1' } as T;
      }
      if (sql.includes('FROM portal_capability_invocations')) {
        return state.invocationRow as T | undefined;
      }
      return undefined;
    },
    async all<T>(): Promise<T[]> { return []; },
    async run(): Promise<RunResult> { return ok; },
    async exec(): Promise<void> { /* noop */ },
    async transaction<T>(fn: (db: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(this); },
    async close(): Promise<void> { /* noop */ },
  };
}

// ── handleInvoke ────────────────────────────────────────────────────────────

describe('handleInvoke — ajv input gate', () => {
  it('accepts conforming input and returns a verb-prefixed responseId', async () => {
    const handler = createPortalHandler(stubDb({ portalStatus: 'active' }));
    const r = await handler.handleInvoke({
      portalAddress: ADDRESS,
      capabilityId: 'say-hello',
      input: { message: 'Hello, do you deliver on Sundays?' },
    });
    expect(r.kind).toBe('invoke_accepted');
    if (r.kind === 'invoke_accepted') {
      // CON-YYYYMMDD-<10 chars Crockford-ish base32, no I/L/O/U>
      expect(r.responseId).toMatch(/^CON-\d{8}-[0-9A-HJKMNP-TV-Z]{10}$/);
      expect(r.verb).toBe('contact');
      expect(r.invocationId).toBe('invocation-1');
      expect(r.output.messageId).toBe(r.responseId);
    }
  });

  it('rejects input missing the schema-required field', async () => {
    const handler = createPortalHandler(stubDb({ portalStatus: 'active' }));
    const r = await handler.handleInvoke({
      portalAddress: ADDRESS,
      capabilityId: 'say-hello',
      input: { subject: 'no message field' },
    });
    expect(r.kind).toBe('invoke_validation_failed');
    if (r.kind === 'invoke_validation_failed') {
      expect(r.errors.length).toBeGreaterThan(0);
      expect(r.errors.map((e) => e.message).join(' ')).toContain('message');
    }
  });

  it('rejects wrong-typed input (message as number)', async () => {
    const handler = createPortalHandler(stubDb({ portalStatus: 'active' }));
    const r = await handler.handleInvoke({
      portalAddress: ADDRESS,
      capabilityId: 'say-hello',
      input: { message: 42 },
    });
    expect(r.kind).toBe('invoke_validation_failed');
  });

  it('rejects an over-length message (maxLength 5000)', async () => {
    const handler = createPortalHandler(stubDb({ portalStatus: 'active' }));
    const r = await handler.handleInvoke({
      portalAddress: ADDRESS,
      capabilityId: 'say-hello',
      input: { message: 'x'.repeat(5001) },
    });
    expect(r.kind).toBe('invoke_validation_failed');
  });
});

describe('handleInvoke — trust + existence gates', () => {
  it('requires a visitor identity when trustRequirements demand one', async () => {
    const handler = createPortalHandler(stubDb({ portalStatus: 'active' }));
    const anonymous = await handler.handleInvoke({
      portalAddress: ADDRESS,
      capabilityId: 'members-only',
      input: {},
    });
    expect(anonymous.kind).toBe('trust_required');

    const identified = await handler.handleInvoke({
      portalAddress: ADDRESS,
      capabilityId: 'members-only',
      input: {},
      visitorContactHash: VISITOR_HASH,
    });
    expect(identified.kind).toBe('invoke_accepted');
  });

  it('returns capability_not_found for an undeclared capability', async () => {
    const handler = createPortalHandler(stubDb({ portalStatus: 'active' }));
    const r = await handler.handleInvoke({
      portalAddress: ADDRESS,
      capabilityId: 'not-declared',
      input: {},
    });
    expect(r.kind).toBe('capability_not_found');
  });

  it('refuses to invoke on a non-active portal', async () => {
    const handler = createPortalHandler(stubDb({ portalStatus: 'draft' }));
    const r = await handler.handleInvoke({
      portalAddress: ADDRESS,
      capabilityId: 'say-hello',
      input: { message: 'hi' },
    });
    expect(r.kind).toBe('portal_offline');
  });
});

// ── handleInvocationStatus — no-leak contract ───────────────────────────────

describe('handleInvocationStatus — lifecycle only, never visitor data', () => {
  const RESPONSE_ID = 'CON-20260610-TESTTOKEN1';

  function rowWithSecrets(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    // The DB row carries the visitor's input + hash in real life; even if a
    // future SELECT over-fetches, the handler must not pass them through.
    return {
      status: 'pending',
      received_at: '2026-06-10T08:00:00.000Z',
      responded_at: null,
      output: JSON.stringify({ messageId: RESPONSE_ID }),
      rejection_reason: null,
      input: JSON.stringify({ message: SECRET_INPUT }),
      visitor_contact_hash: VISITOR_HASH,
      ...overrides,
    };
  }

  it('returns only lifecycle fields while pending (no output, no input, no hash)', async () => {
    const handler = createPortalHandler(stubDb({
      portalStatus: 'active',
      invocationRow: rowWithSecrets(),
    }));
    const r = await handler.handleInvocationStatus({ portalAddress: ADDRESS, responseId: RESPONSE_ID });
    expect(r.kind).toBe('invocation_status');
    if (r.kind === 'invocation_status') {
      expect(r.status).toBe('pending');
      expect(r.output).toBeNull(); // acceptance receipt is withheld pre-response
      expect(r.respondedAt).toBeNull();
      expect(Object.keys(r).sort()).toEqual(
        ['kind', 'output', 'receivedAt', 'rejectionReason', 'respondedAt', 'responseId', 'status'],
      );
    }
    const serialized = JSON.stringify(r);
    expect(serialized).not.toContain(SECRET_INPUT);
    expect(serialized).not.toContain(VISITOR_HASH);
  });

  it("surfaces the owner's response once responded — still no visitor data", async () => {
    const handler = createPortalHandler(stubDb({
      portalStatus: 'active',
      invocationRow: rowWithSecrets({
        status: 'responded',
        responded_at: '2026-06-10T09:00:00.000Z',
        output: JSON.stringify({ answer: 'Yes — Sundays too.' }),
      }),
    }));
    const r = await handler.handleInvocationStatus({ portalAddress: ADDRESS, responseId: RESPONSE_ID });
    expect(r.kind).toBe('invocation_status');
    if (r.kind === 'invocation_status') {
      expect(r.status).toBe('responded');
      expect((r.output as { answer?: string })?.answer).toBe('Yes — Sundays too.');
      expect(r.respondedAt).toBe('2026-06-10T09:00:00.000Z');
    }
    const serialized = JSON.stringify(r);
    expect(serialized).not.toContain(SECRET_INPUT);
    expect(serialized).not.toContain(VISITOR_HASH);
  });

  it('surfaces the rejection reason once rejected, withholding output', async () => {
    const handler = createPortalHandler(stubDb({
      portalStatus: 'active',
      invocationRow: rowWithSecrets({
        status: 'rejected',
        responded_at: '2026-06-10T09:00:00.000Z',
        rejection_reason: 'Fully booked.',
      }),
    }));
    const r = await handler.handleInvocationStatus({ portalAddress: ADDRESS, responseId: RESPONSE_ID });
    if (r.kind === 'invocation_status') {
      expect(r.status).toBe('rejected');
      expect(r.rejectionReason).toBe('Fully booked.');
      expect(r.output).toBeNull();
    } else {
      expect.fail(`expected invocation_status, got ${r.kind}`);
    }
  });

  it('returns not_found for an unknown responseId', async () => {
    const handler = createPortalHandler(stubDb({ portalStatus: 'active', invocationRow: undefined }));
    const r = await handler.handleInvocationStatus({
      portalAddress: ADDRESS,
      responseId: 'CON-20260610-DOESNOTEXIST',
    });
    expect(r.kind).toBe('not_found');
  });
});
