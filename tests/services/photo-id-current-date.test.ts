/**
 * photo-id-current-date.test.ts — the hardware photo identifier tells the model the date.
 *
 * It calls the Anthropic API directly (a vision request, outside both routers), so it
 * adds the date itself — and here the date is load-bearing rather than hygiene: the
 * model reads chip DATE CODES to score counterfeit risk, and a date code later than
 * today is itself a counterfeit indicator. Without the date the model cannot tell a
 * future code from a recent one.
 *
 * The API client is faked at @anthropic-ai/sdk and the request it receives is inspected.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const sent = vi.hoisted(() => ({ params: [] as Array<Record<string, unknown>> }));

vi.mock('@anthropic-ai/sdk', () => {
  class FakeAnthropic {
    messages = {
      create: async (params: Record<string, unknown>) => {
        sent.params.push(params);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              best_match_part_number: 'ESP32-WROOM-32E',
              confidence: 'moderate',
              read_markings: ['ESP32-WROOM-32E', 'date code 2619'],
              counterfeit_risk: 'low',
            }),
          }],
          usage: { input_tokens: 1, output_tokens: 1 },
        };
      },
    };
  }
  return { default: FakeAnthropic };
});

import { createPhotoIdService } from '../../server/services/photo-id-service.js';
import type { DatabaseAdapter } from '../../server/db/database.js';

/** One hardware_knowledge_packs row, in the shape loadHkpContext SELECTs. */
const fakeDb = {
  get: async () => ({
    id: 'hkp-esp32',
    manufacturer: 'Espressif',
    part_number: 'ESP32-WROOM-32E',
    metadata: JSON.stringify({ fcc_id: '2AC7Z-ESPWROOM32E', package: 'SMD module', antenna: 'PCB' }),
  }),
  all: async () => [],
  run: async () => ({ changes: 0 }),
} as unknown as DatabaseAdapter;

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

let savedKey: string | undefined;
beforeEach(() => {
  savedKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  sent.params.length = 0;
});
afterEach(() => {
  if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = savedKey;
});

describe('hardware photo identifier', () => {
  it('sends today\'s date with the vision request, so a future date code can be recognised', async () => {
    const svc = createPhotoIdService(fakeDb);
    await svc.identify({
      family_id: 'mcu-wifi',
      hkp_id: 'hkp-esp32',
      photos: [{ bytes: Buffer.from('fake-jpeg-bytes'), mimeType: 'image/jpeg' }],
      model: 'claude-sonnet-4-6',
    });
    expect(sent.params).toHaveLength(1);
    const system = String(sent.params[0].system);
    expect(system).toContain('## CURRENT DATE');
    expect(system).toContain(`(${todayIso()})`);
    // appended after the identifier's own instructions, not in front of them
    expect(system.startsWith('You are the hardware photo identifier')).toBe(true);
  });
});
