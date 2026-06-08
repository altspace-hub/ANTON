/**
 * display-size.test.ts — Companion app screen-size adaptation (auto-fit + override).
 * A Display size axis drives --app-scale / --app-max-width via <html data-display>,
 * orthogonal to the pro/standard data-mode (which sets the base font 14/16px).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { getDisplaySize, setDisplaySize, DISPLAY_SIZES } from '../personalization';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-display');
});

describe('Companion display size', () => {
  it('exposes the 5 presets in order', () => {
    expect(DISPLAY_SIZES.map((d) => d.id)).toEqual(['auto', 'compact', 'standard', 'large', 'tablet']);
  });

  it('defaults to auto (no attribute)', () => {
    expect(getDisplaySize()).toBe('auto');
  });

  it('setDisplaySize persists (anton-companion-display) + applies the attribute', () => {
    setDisplaySize('large');
    expect(getDisplaySize()).toBe('large');
    expect(document.documentElement.getAttribute('data-display')).toBe('large');
    expect(localStorage.getItem('anton-companion-display')).toBe('large');
  });

  it('auto removes the attribute (responsive default)', () => {
    setDisplaySize('tablet');
    expect(document.documentElement.getAttribute('data-display')).toBe('tablet');
    setDisplaySize('auto');
    expect(document.documentElement.getAttribute('data-display')).toBeNull();
  });

  it('an invalid stored value falls back to auto', () => {
    localStorage.setItem('anton-companion-display', 'bogus');
    expect(getDisplaySize()).toBe('auto');
  });
});
