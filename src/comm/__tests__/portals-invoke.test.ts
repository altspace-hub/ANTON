/**
 * portals-invoke.test.ts — coverage for the corrected `invokeCapability`
 * that points at `descriptor.portal.originEndpoint` instead of the
 * (wrongly-typed) `cap.aapEndpoint` slug.
 *
 * The full URL pattern is the existing server route in
 * server/routes/portals.ts line 1183:
 *   POST {origin}/api/portals/visit/{address}/capabilities/{capId}/invoke
 *
 * The server's 200 response uses `kind: 'invoke_accepted'`; the Comm App's
 * existing UI checks for `kind: 'invoke_response'`. The client translates
 * one to the other so the screen layer doesn't need to know about both.
 */
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import {
  invokeCapability,
  type PortalDescriptor,
  type CapabilitySpec,
} from '../services/portals';

function descriptor(over: {
  portal?: Partial<PortalDescriptor['portal']>;
  capabilities?: CapabilitySpec[];
} = {}): PortalDescriptor {
  return {
    portal: {
      name: 'dog-sitter-sthlm.global.portal',
      namespace: 'global',
      displayTitle: 'Dog Sitter STHLM',
      contactHash: 'ANTON-XXXX-XXXX-XXXX-XXXX',
      publicKey: 'a'.repeat(64),
      originEndpoint: 'https://publisher.example.com',
      ...over.portal,
    },
    capabilities: over.capabilities ?? [
      { id: 'cap-contact', verb: 'contact', title: 'Send a message' },
    ],
  };
}

beforeEach(() => {
  (globalThis.fetch as unknown as Mock | undefined)?.mockReset?.();
  globalThis.fetch = vi.fn() as unknown as typeof fetch;
});

describe('invokeCapability', () => {
  it('returns capability_not_found when the id is unknown', async () => {
    const out = await invokeCapability(descriptor(), 'nope', {});
    expect(out.kind).toBe('capability_not_found');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('returns not_supported when descriptor has no originEndpoint', async () => {
    const d = descriptor({ portal: { originEndpoint: undefined } });
    const out = await invokeCapability(d, 'cap-contact', {});
    expect(out.kind).toBe('not_supported');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('builds the right URL with address + capId encoded', async () => {
    (globalThis.fetch as Mock).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          kind: 'invoke_accepted',
          responseId: 'r-1',
          invocationId: 'inv-1',
          verb: 'contact',
          output: { ok: true },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    await invokeCapability(descriptor(), 'cap-contact', { message: 'hi' });
    const calls = (globalThis.fetch as Mock).mock.calls;
    expect(calls.length).toBe(1);
    expect(calls[0]?.[0]).toBe(
      'https://publisher.example.com/api/portals/visit/dog-sitter-sthlm.global.portal/capabilities/cap-contact/invoke',
    );
    expect(calls[0]?.[1]?.method).toBe('POST');
  });

  it('translates server invoke_accepted into Comm App invoke_response', async () => {
    (globalThis.fetch as Mock).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          kind: 'invoke_accepted',
          responseId: 'r-1',
          invocationId: 'inv-abc',
          verb: 'contact',
          output: { acknowledgement: 'thanks' },
        }),
        { status: 200 },
      ),
    );
    const out = await invokeCapability(descriptor(), 'cap-contact', { message: 'hi' });
    expect(out.kind).toBe('invoke_response');
    expect(out.inboxId).toBe('inv-abc');
    expect(out.output).toEqual({ acknowledgement: 'thanks' });
  });

  it('sends input in the request body with the right content-type', async () => {
    (globalThis.fetch as Mock).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ kind: 'invoke_accepted', responseId: 'x', invocationId: 'y', verb: 'contact', output: {} }),
        { status: 200 },
      ),
    );
    await invokeCapability(descriptor(), 'cap-contact', { message: 'hello' });
    const calls = (globalThis.fetch as Mock).mock.calls;
    const init = calls[0]?.[1];
    expect(init?.headers).toEqual({ 'content-type': 'application/json' });
    const body = JSON.parse(init?.body as string);
    expect(body.input).toEqual({ message: 'hello' });
    // visitorContactHash comes from getIdentity() and is omitted from the body
    // when no identity is set (anonymous visitor flow). JSON.stringify drops
    // undefined values, so we don't assert the field is present.
  });

  it('passes through 4xx structured responses (capability_not_found from server)', async () => {
    (globalThis.fetch as Mock).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ kind: 'capability_not_found', reason: 'removed' }),
        { status: 404 },
      ),
    );
    const out = await invokeCapability(descriptor(), 'cap-contact', {});
    expect(out.kind).toBe('capability_not_found');
  });

  it('passes through trust_required (401)', async () => {
    (globalThis.fetch as Mock).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ kind: 'trust_required', reason: 'login_required' }),
        { status: 401 },
      ),
    );
    const out = await invokeCapability(descriptor(), 'cap-contact', {});
    expect(out.kind).toBe('trust_required');
  });

  it('falls back to invalid_input when 4xx body has no kind field', async () => {
    (globalThis.fetch as Mock).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'malformed body' }), { status: 400 }),
    );
    const out = await invokeCapability(descriptor(), 'cap-contact', {});
    expect(out.kind).toBe('invalid_input');
    expect(out.message).toContain('400');
  });

  it('returns rate_limited on 429', async () => {
    (globalThis.fetch as Mock).mockResolvedValueOnce(new Response('', { status: 429 }));
    const out = await invokeCapability(descriptor(), 'cap-contact', {});
    expect(out.kind).toBe('rate_limited');
  });

  it('returns portal_offline on 503', async () => {
    (globalThis.fetch as Mock).mockResolvedValueOnce(new Response('', { status: 503 }));
    const out = await invokeCapability(descriptor(), 'cap-contact', {});
    expect(out.kind).toBe('portal_offline');
    expect(out.message).toContain('503');
  });

  it('returns portal_offline on 500', async () => {
    (globalThis.fetch as Mock).mockResolvedValueOnce(new Response('', { status: 500 }));
    const out = await invokeCapability(descriptor(), 'cap-contact', {});
    expect(out.kind).toBe('portal_offline');
  });

  it('returns portal_offline on network throw', async () => {
    (globalThis.fetch as Mock).mockRejectedValueOnce(new Error('connection refused'));
    const out = await invokeCapability(descriptor(), 'cap-contact', {});
    expect(out.kind).toBe('portal_offline');
    expect(out.message).toContain('connection refused');
  });

  it('strips trailing slashes from originEndpoint', async () => {
    (globalThis.fetch as Mock).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ kind: 'invoke_accepted', responseId: 'x', invocationId: 'y', verb: 'contact', output: {} }),
        { status: 200 },
      ),
    );
    const d = descriptor({ portal: { originEndpoint: 'https://publisher.example.com//' } });
    await invokeCapability(d, 'cap-contact', {});
    const calledUrl = (globalThis.fetch as Mock).mock.calls[0]?.[0] as string;
    expect(calledUrl.startsWith('https://publisher.example.com/api/portals/visit/')).toBe(true);
  });

  it('does not fetch when there are no capabilities at all', async () => {
    const d = descriptor({ capabilities: [] });
    const out = await invokeCapability(d, 'anything', {});
    expect(out.kind).toBe('capability_not_found');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
