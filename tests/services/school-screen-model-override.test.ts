/**
 * school-screen-model-override.test.ts — the safety classifier can be pointed at a
 * specific model without changing the instance default.
 *
 * Why this exists: the classifier follows the instance's routed utility model, which
 * follows DEFAULT_MODEL. On an instance whose main provider is out of credit — the case
 * that prompted this — that means the safety screen silently never runs, and the only
 * way to fix it was to change the default model for the whole product.
 *
 * The screen is a narrow, high-volume classification: one short JSON answer per pupil
 * message. There is no reason it must run on whatever the pupil-facing chat uses.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');
const AI = read('server/services/school-safety-ai.ts');
const ENV = read('.env.example');

describe('the override exists and is opt-in', () => {
  it('reads SCHOOL_AI_SCREEN_MODEL', () => {
    expect(AI).toMatch(/process\.env\.SCHOOL_AI_SCREEN_MODEL/);
  });

  it('falls back to the routed utility model when unset', () => {
    // Unset must mean "unchanged behaviour". An override that becomes mandatory is a
    // breaking change wearing a feature's clothes.
    expect(AI).toMatch(/override \|\| await getRoutedUtilityModel\(db\)/);
  });

  it('trims the value, so a stray space is not a model id', () => {
    expect(AI).toMatch(/SCHOOL_AI_SCREEN_MODEL\?\.trim\(\)/);
  });

  it('is documented in .env.example', () => {
    expect(ENV).toMatch(/SCHOOL_AI_SCREEN_MODEL/);
  });
});

describe('the collaboration brain override is honest about what it accepts', () => {
  const COLLAB = read('apps/anton-collaboration/src/standalone/index.ts');

  it('does not construct an Anthropic-only brain with a non-Claude model id', () => {
    // ClaudeNegotiationBrain talks to the Anthropic SDK with Anthropic-only request
    // shapes. Handing it 'mistral-large-latest' does not switch provider — it sends an
    // unknown model id to Anthropic and every negotiation fails at the API. The override
    // LOOKED provider-agnostic and was not, which is worse than not having one.
    expect(COLLAB).toMatch(/negModelIsClaude/);
    expect(COLLAB).toMatch(/anthropicKey && negModelIsClaude/);
  });

  it('warns rather than failing silently', () => {
    expect(COLLAB).toMatch(/is not a Claude id/);
    expect(COLLAB).toMatch(/ANTON_COLLAB_REVIEW_MODEL/);
  });

  it('the OFF status names the real cause', () => {
    // "OFF — set ANTHROPIC_API_KEY" is actively misleading when the key IS set and the
    // model id was the problem. An operator reading that would go and check the wrong
    // thing.
    expect(COLLAB).toMatch(/const negOff =/);
    expect(COLLAB).toMatch(/this brain is Anthropic-only/);
  });
});
