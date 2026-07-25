/**
 * terminal-channel.test.ts — the approval gate's channel rules.
 *
 * Two properties, both load-bearing for "a human approves every payment":
 *   1. A capability is never written to a stream that is not a terminal. Under
 *      `--mcp-stdio` the MCP host captures stderr to its own log, so printing a
 *      confirm URL there hands a live payment approval to the agent's own host.
 *   2. What the operator READS is what was actually proposed. Almost every field
 *      in the prompt is agent-chosen, so agent text must not be able to repaint
 *      the Amount/To lines with ANSI, or reverse an address with bidi marks.
 *
 * Every hostile character is built with String.fromCharCode on purpose. A
 * literal control character in this file would be silently normalised by
 * editors, linters and patch tooling — the test would then quietly stop testing
 * anything, which is exactly the failure mode this suite exists to prevent.
 */
import { describe, expect, it } from 'vitest';
import { isTrustedTerminal, stripControlChars } from '../../src/standalone/terminal-channel.js';

const ch = (code: number): string => String.fromCharCode(code);
const ESC = ch(0x1b);        // ANSI sequence introducer
const CSI1 = ch(0x9b);       // C1 CSI — starts a sequence WITHOUT ESC
const NUL = ch(0x00);
const DEL = ch(0x7f);
const LRM = ch(0x200e);
const RLM = ch(0x200f);
const RLO = ch(0x202e);      // right-to-left override
const ISO_OPEN = ch(0x2066);
const ISO_CLOSE = ch(0x2069);

describe('isTrustedTerminal', () => {
  it('trusts only a real TTY', () => {
    expect(isTrustedTerminal({ isTTY: true })).toBe(true);
  });

  it('does NOT trust a pipe — the MCP-host case that motivated this', () => {
    expect(isTrustedTerminal({ isTTY: false })).toBe(false);
    expect(isTrustedTerminal({})).toBe(false);       // Node leaves it undefined on a pipe
  });

  it('fails closed on a non-boolean isTTY rather than being truthy-coerced', () => {
    expect(isTrustedTerminal({ isTTY: 1 as unknown as boolean })).toBe(false);
    expect(isTrustedTerminal({ isTTY: 'yes' as unknown as boolean })).toBe(false);
  });
});

describe('stripControlChars', () => {
  it('defeats the cursor-repaint attack on the amount line', () => {
    // "5 FTC", then move the cursor up 2 lines, clear, and draw a new amount.
    const hostile = '5 FTC' + ESC + '[2A' + ESC + '[2K   Amount: 9999 FTC';
    const safe = stripControlChars(hostile);
    expect(safe).not.toContain(ESC);
    expect(safe).toBe('5 FTC[2A[2K   Amount: 9999 FTC'); // inert, and still visible
  });

  it('strips CR and LF so agent text cannot forge whole new prompt lines', () => {
    expect(stripControlChars('note\r\n   To: fc_attacker')).toBe('note   To: fc_attacker');
    expect(stripControlChars('a\rb')).toBe('ab');
  });

  it('strips the C1 introducer (0x9B), an ESC-free way to start a sequence', () => {
    expect(stripControlChars('x' + CSI1 + '2Ay')).toBe('x2Ay');
  });

  it('strips bidi overrides — the Trojan Source address-reversal class', () => {
    expect(stripControlChars('fc_abc' + RLO + 'def')).toBe('fc_abcdef');
    expect(stripControlChars(ISO_OPEN + 'a' + ISO_CLOSE)).toBe('a');
    expect(stripControlChars('a' + LRM + 'b' + RLM + 'c')).toBe('abc');
  });

  it('strips NUL and DEL', () => {
    expect(stripControlChars('a' + NUL + DEL + 'bc')).toBe('abc');
  });

  it('preserves legitimate international text and emoji', () => {
    expect(stripControlChars('Mans Odegard')).toBe('Mans Odegard');
    expect(stripControlChars('paid ' + String.fromCodePoint(0x1f389)))
      .toBe('paid ' + String.fromCodePoint(0x1f389));
    expect(stripControlChars('fc_VEH4mJb5P9hKEaWkiuXRG6e6jooCnQZqKs'))
      .toBe('fc_VEH4mJb5P9hKEaWkiuXRG6e6jooCnQZqKs');
  });

  it('coerces non-strings without throwing (payload fields are not all strings)', () => {
    expect(stripControlChars(12.5)).toBe('12.5');
    expect(stripControlChars(undefined)).toBe('');
    expect(stripControlChars(null)).toBe('');
  });

  it('strips every C0 code point, not just the famous ones', () => {
    const allC0 = Array.from({ length: 0x20 }, (_, i) => ch(i)).join('');
    expect(stripControlChars('a' + allC0 + 'b')).toBe('ab');
  });
});
