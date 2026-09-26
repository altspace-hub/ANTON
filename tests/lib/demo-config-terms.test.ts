/**
 * demo-config-terms.test.ts — the web client's reading of the /api/config
 * fields the demo's privacy review added (2026-09-26): the demo terms page and
 * version, sent back at sign-up, and who operates the demo.
 *
 * Every value becomes a link or text on the login page, so a malformed one
 * falls back rather than being shown; an ordinary server has none of it.
 */
import { describe, it, expect } from 'vitest';
import { parseDemoConfig, DEMO_OFF } from '../../src/lib/demo-config';

const DEMO = { demoMode: true, privacyPath: '/privacy', termsPath: '/terms', termsVersion: '2026-09-26', operatorName: 'Example Demo AB' };

describe('the demo terms and the operator', () => {
  it('reads the terms page, the terms version and the operator name', () => {
    expect(parseDemoConfig(DEMO)).toMatchObject({ termsPath: '/terms', termsVersion: '2026-09-26', operatorName: 'Example Demo AB' });
  });

  it('an ordinary server has the defaults and no version or operator (negative control)', () => {
    expect(DEMO_OFF).toMatchObject({ termsPath: '/terms', termsVersion: '', operatorName: '' });
    expect(parseDemoConfig({ ...DEMO, demoMode: false })).toEqual(DEMO_OFF);
  });

  it('never links the terms, or the privacy notice, off-site', () => {
    for (const bad of ['https://evil.example/terms', '//evil', '//evil/terms', 'terms', '/terms?x=1', 7]) {
      expect(parseDemoConfig({ ...DEMO, termsPath: bad }).termsPath, String(bad)).toBe('/terms');
      expect(parseDemoConfig({ ...DEMO, privacyPath: bad }).privacyPath, String(bad)).toBe('/privacy');
    }
    expect(parseDemoConfig({ ...DEMO, termsPath: '/demo-terms' }).termsPath).toBe('/demo-terms');
  });

  it('drops a malformed terms version, so sign-up is refused rather than sent a strange value', () => {
    for (const bad of ['2026 09 26', 'x'.repeat(41), '', '<b>', 20260926]) {
      expect(parseDemoConfig({ ...DEMO, termsVersion: bad }).termsVersion, String(bad)).toBe('');
    }
    expect(parseDemoConfig({ ...DEMO, termsVersion: 'v2.1_rc-1' }).termsVersion).toBe('v2.1_rc-1');
  });

  it('shows the operator name as plain text: control characters and excess length are dropped', () => {
    expect(parseDemoConfig({ ...DEMO, operatorName: ' Example\u0000 Demo\n AB ' }).operatorName).toBe('Example Demo AB');
    expect(parseDemoConfig({ ...DEMO, operatorName: 'y'.repeat(300) }).operatorName).toHaveLength(200);
    expect(parseDemoConfig({ ...DEMO, operatorName: { name: 'x' } }).operatorName).toBe('');
  });
});
