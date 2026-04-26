/**
 * procure-rfq-templates.test.ts — render() {{var}} substitution test.
 *
 * The render function is intentionally simple (literal String.replaceAll)
 * to avoid arbitrary code execution from user-supplied templates. The
 * tests pin that contract.
 */

import { describe, it, expect } from 'vitest';
import { createProcureRfqTemplates, type RfqTemplate } from '../../../server/services/procure-rfq-templates.js';

// Minimal in-memory db stub — render() doesn't touch it.
const stubDb = {} as never;

const baseTemplate: RfqTemplate = {
  id: 't1',
  name: 'Cloud Infra RFQ',
  category: 'cloud-infra',
  jurisdiction: null,
  template_body: 'Hello {{vendor_name}},\nWe need {{service_type}} by {{deadline}}.\nBudget: {{budget}}.',
  required_sections: ['pricing', 'terms'],
  is_active: true,
};

describe('procure-rfq-templates render()', () => {
  it('substitutes a single variable', async () => {
    const svc = await createProcureRfqTemplates(stubDb);
    const out = svc.render(
      { ...baseTemplate, template_body: 'Hi {{name}}' },
      { name: 'Anthropic' },
    );
    expect(out).toBe('Hi Anthropic');
  });

  it('substitutes multiple variables in one body', async () => {
    const svc = await createProcureRfqTemplates(stubDb);
    const out = svc.render(baseTemplate, {
      vendor_name: 'AWS',
      service_type: 'managed Postgres',
      deadline: '2026-06-30',
      budget: 'EUR 5000/mo',
    });
    expect(out).toBe('Hello AWS,\nWe need managed Postgres by 2026-06-30.\nBudget: EUR 5000/mo.');
  });

  it('replaces every occurrence of a repeated variable', async () => {
    const svc = await createProcureRfqTemplates(stubDb);
    const out = svc.render(
      { ...baseTemplate, template_body: '{{x}} and {{x}} again, then {{x}}.' },
      { x: 'OK' },
    );
    expect(out).toBe('OK and OK again, then OK.');
  });

  it('leaves unmatched placeholders alone (no error)', async () => {
    const svc = await createProcureRfqTemplates(stubDb);
    const out = svc.render(
      { ...baseTemplate, template_body: 'Hi {{a}} and {{missing}}' },
      { a: '1' },
    );
    expect(out).toBe('Hi 1 and {{missing}}');
  });

  it('does NOT execute any embedded code in variable values', async () => {
    const svc = await createProcureRfqTemplates(stubDb);
    // Verify literal substitution — JS expressions in values stay as text.
    const out = svc.render(
      { ...baseTemplate, template_body: 'Value: {{x}}' },
      { x: '${process.env.SECRET}' },
    );
    expect(out).toBe('Value: ${process.env.SECRET}');
  });

  it('handles empty variable map (template returned untouched)', async () => {
    const svc = await createProcureRfqTemplates(stubDb);
    const out = svc.render(baseTemplate, {});
    expect(out).toBe(baseTemplate.template_body);
  });
});
