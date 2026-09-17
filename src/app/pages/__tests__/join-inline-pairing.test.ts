/**
 * join-inline-pairing.test.ts — an inline-package pairing link must never pair
 * the device by itself.
 *
 * `anton://enroll?pkg=<base64url>` carries a COMPLETE enrollment package, so
 * nothing further is needed from the user to finish pairing — which is exactly
 * why finishing must not happen automatically. MainActivity is exported and the
 * anton:// scheme is BROWSABLE, so any app or web page on the device can fire
 * such a link (and parsePairingLink also accepts it over http/https from any
 * host, path merely containing "enroll"). JoinPage's deep-link handler used to
 * call doPair() the moment it saw an inline package: one tap on a hostile link
 * silently bound the phone to the attacker's instance, made it the ACTIVE
 * instance, and reported "Connected ✓". validateMeshPackage does not help — it
 * only proves the package's own (ed_pk, x_pk, binding_sig) triple is
 * self-consistent, which whoever generated it trivially satisfies.
 *
 * These tests drive the real component through react-dom, because the defect is
 * the wiring, not a helper: a test of the helper alone would still pass with
 * doPair() wired back into the deep-link handler.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { encodeBase64UrlJson } from '../../services/pairing-url';

// Hoisted so the vi.mock factories below (which run before imports) can see them.
const mocks = vi.hoisted(() => ({
  completeEnrollment: vi.fn(),
  fetchEnrollment: vi.fn(),
  addInstance: vi.fn(),
  setActiveInstanceAsync: vi.fn(),
  saveSessionToken: vi.fn(),
}));

vi.mock('../../services/enrollment', async () => {
  // parsePairingLink / validateServerUrl stay REAL — they are the parsing under
  // test. Only the network-touching half is stubbed.
  const real = await vi.importActual<typeof import('../../services/pairing-url')>(
    '../../services/pairing-url',
  );
  return {
    parsePairingLink: real.parsePairingLink,
    validateServerUrl: real.validateServerUrl,
    fetchEnrollment: mocks.fetchEnrollment,
    completeEnrollment: mocks.completeEnrollment,
  };
});
vi.mock('../../services/identity', () => ({
  getIdentity: () => null,
  signNonce: vi.fn(),
  ensureDeviceKeypair: vi.fn(async () => 'ab'.repeat(32)),
  getDeviceX25519Keypair: vi.fn(async () => ({ publicKey: new Uint8Array(32), privateKey: new Uint8Array(32) })),
}));
vi.mock('../../services/api', () => ({
  joinOrg: vi.fn(), authChallenge: vi.fn(), authVerify: vi.fn(),
  saveSessionToken: mocks.saveSessionToken, getSessionToken: () => null, registerSimple: vi.fn(),
}));
vi.mock('../../services/discovery', () => ({
  saveServer: vi.fn(), testServer: vi.fn(async () => ({ ok: true, name: 'ANTON' })),
}));
vi.mock('../../services/transports/mesh', () => ({ createMeshTransport: vi.fn() }));
vi.mock('../../services/instances', () => ({
  addInstance: mocks.addInstance,
  listInstances: () => [],
  setActiveInstanceAsync: mocks.setActiveInstanceAsync,
}));
vi.mock('../../services/haptics', () => ({ tick: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock('../../services/biometric', () => ({
  isBiometricAvailable: vi.fn(async () => false), verifyBiometric: vi.fn(),
}));

// Imported after the mocks so JoinPage picks them up.
const { default: JoinPage } = await import('../JoinPage');

/** A package that names an instance the user never asked for. */
const HOSTILE_PKG = {
  token: 'tok-attacker', nonce: 'nonce-attacker',
  instance_pubkey: 'aa'.repeat(44),
  instance_cert_fp: null,
  endpoints: { wan: 'https://evil.example.com' },
  intended_user_id: null, org_id: null, intended_role: 'member',
  display_name_hint: null, language_hint: null,
  expires_at: new Date(Date.now() + 60_000).toISOString(),
  instance_contact_hash: 'ANTON-EVIL-EVIL-EVIL-EVIL',
  instance_display_name: "Someone Else's ANTON",
  requires_confirmation_code: false,
  // No transport field: exercises the plain inline path without dragging in the
  // mesh validator / Noise draft session, which are not what this test is about.
};

let container: HTMLDivElement;
let root: Root;
const onJoined = vi.fn();

async function openWithLink(url: string): Promise<void> {
  // jsdom cannot navigate to anton://, but parsePairingLink accepts an
  // http(s) URL whose path contains "enroll" — which is the web-page half of
  // the same attack, and lands in exactly the same handler.
  window.history.replaceState({}, '', url);
  await act(async () => {
    root.render(createElement(JoinPage, { onJoined, onBack: vi.fn() }));
  });
}

const text = () => container.textContent ?? '';
const buttonSaying = (label: string): HTMLButtonElement | undefined =>
  [...container.querySelectorAll('button')].find((b) => (b.textContent ?? '').trim() === label);

beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  mocks.completeEnrollment.mockResolvedValue({
    device_id: 'dev-1', device_certificate: 'cert', session_token: 'sess',
    expires_at: new Date(Date.now() + 1000).toISOString(),
    user: { id: 'u1', contact_hash: 'ANTON-1111-2222-3333-4444', display_name: null },
    org: null,
  });
  mocks.addInstance.mockResolvedValue({ id: 'inst-1' });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  window.history.replaceState({}, '', '/');
});

describe('JoinPage — inline-package pairing link', () => {
  it('does not pair on its own when the link arrives as a deep link', async () => {
    await openWithLink(`/enroll?pkg=${encodeBase64UrlJson(HOSTILE_PKG)}`);

    expect(mocks.completeEnrollment, 'a link must not complete enrollment on its own').not.toHaveBeenCalled();
    expect(mocks.addInstance).not.toHaveBeenCalled();
    expect(mocks.setActiveInstanceAsync, 'and must not become the active instance').not.toHaveBeenCalled();
    expect(onJoined).not.toHaveBeenCalled();
    expect(text()).not.toContain('Connected');
  });

  it('shows WHO it would pair with, so the user can refuse', async () => {
    await openWithLink(`/enroll?pkg=${encodeBase64UrlJson(HOSTILE_PKG)}`);

    const card = container.querySelector('[data-testid="pair-confirm"]');
    expect(card, 'the confirmation card must be rendered').not.toBeNull();
    const shown = card?.textContent ?? '';
    expect(shown).toContain("Someone Else's ANTON");
    expect(shown).toContain('ANTON-EVIL-EVIL-EVIL-EVIL');
    expect(shown).toContain('evil.example.com');
  });

  it('pairs only after the human taps Pair', async () => {
    await openWithLink(`/enroll?pkg=${encodeBase64UrlJson(HOSTILE_PKG)}`);
    expect(mocks.completeEnrollment).not.toHaveBeenCalled();

    const pair = buttonSaying('Pair');
    expect(pair, 'the confirmation card must offer a Pair button').toBeDefined();
    await act(async () => { pair!.click(); });

    expect(mocks.completeEnrollment).toHaveBeenCalledTimes(1);
    expect(mocks.setActiveInstanceAsync).toHaveBeenCalledWith('inst-1');
  });

  it('Cancel drops the link without pairing', async () => {
    await openWithLink(`/enroll?pkg=${encodeBase64UrlJson(HOSTILE_PKG)}`);

    const cancel = buttonSaying('Cancel');
    expect(cancel).toBeDefined();
    await act(async () => { cancel!.click(); });

    expect(container.querySelector('[data-testid="pair-confirm"]')).toBeNull();
    expect(mocks.completeEnrollment).not.toHaveBeenCalled();
  });

  it('a package that demands the 6-digit code shows the code field on the card', async () => {
    // Regression: the code input rendered ONLY under mode === 'manual', so an
    // inline-package pair that required a code set the prompt flag and then had
    // nowhere to show the input — a dead end. Worse, doEnrollment's early return
    // still let the caller report "Connected ✓" and navigate away.
    await openWithLink(`/enroll?pkg=${encodeBase64UrlJson({ ...HOSTILE_PKG, requires_confirmation_code: true })}`);
    await act(async () => { buttonSaying('Pair')!.click(); });

    expect(mocks.completeEnrollment, 'must not complete without the OOB code').not.toHaveBeenCalled();
    const card = container.querySelector('[data-testid="pair-confirm"]');
    expect(card?.textContent ?? '').toContain('Confirmation code');
    expect(card?.querySelector('input'), 'the code input must be reachable').not.toBeNull();
    expect(onJoined, 'a paused pairing must not report success').not.toHaveBeenCalled();
    expect(text()).not.toContain('Connected');
  });
});
