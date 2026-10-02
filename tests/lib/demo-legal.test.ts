/**
 * demo-legal.test.ts — how the public demo's privacy notice and demo terms
 * are filled in (src/lib/demo-legal.ts; privacy review G7, G10):
 *
 *   - the owner's facts go in where set, and an empty one stays visible as
 *     [[NAME]]; the retention period comes from the server, the controller's
 *     name from DEMO_OPERATOR_NAME when the owner has not set one;
 *   - a value cannot change the Markdown around it;
 *   - the DRAFT box stays until every field is filled and counsel has
 *     signed off;
 *   - every [[NAME]] in the two texts is one the page knows how to fill (a
 *     misspelt name would stay on the page for good);
 *   - [[SCORING_SENTENCE]] says which model makes the Trust Score and what it
 *     reads, or that the demo scores nothing (/api/config answersScored and
 *     scorerModel);
 *   - the terms version on the page is the one the server stores.
 */
import { describe, it, expect } from 'vitest';
import {
  DEMO_LEGAL_FIELDS,
  DEMO_TERMS_TEXT_VERSION,
  demoLegalValues,
  fillLegalText,
  legalTextIsDraft,
  unfilledFields,
} from '../../src/lib/demo-legal';
import { DEMO_OFF, parseDemoConfig } from '../../src/lib/demo-config';
import { PRIVACY_NOTICE_MD } from '../../src/pages/PrivacyNoticePage';
import { DEMO_TERMS_MD } from '../../src/pages/DemoTermsPage';
import { DEMO_TERMS_VERSION } from '../../server/middleware/demo-mode';

const demo = (extra: Record<string, unknown> = {}) => parseDemoConfig({ demoMode: true, retentionDays: 21, ...extra });

describe('fillLegalText', () => {
  it('puts in the values it has and leaves the others as [[NAME]]', () => {
    const out = fillLegalText('Run by [[CONTROLLER_NAME]] at [[DEMO_URL]] for [[ACCOUNT_TTL_DAYS]] days.', {
      CONTROLLER_NAME: 'Example Consulting AB', DEMO_URL: '  ', ACCOUNT_TTL_DAYS: '21',
    });
    expect(out).toBe('Run by Example Consulting AB at [[DEMO_URL]] for 21 days.');
    expect(unfilledFields(out)).toEqual(['DEMO_URL']);
  });

  it('escapes a value so it cannot become a link, emphasis or a table cell', () => {
    const out = fillLegalText('| [[CONTROLLER_NAME]] |', { CONTROLLER_NAME: 'A*B* [x](javascript:alert(1)) | <b>' });
    expect(out).toBe('| A\\*B\\* \\[x\\](javascript:alert(1)) \\| \\<b\\> |');
  });
});

describe('demoLegalValues', () => {
  it('reads the retention period from the server, and 30 days when this is not a demo', () => {
    expect(demoLegalValues(demo()).ACCOUNT_TTL_DAYS).toBe('21');
    expect(demoLegalValues(DEMO_OFF).ACCOUNT_TTL_DAYS).toBe('30');
  });

  it('takes the controller\'s name from DEMO_OPERATOR_NAME while the owner has not set one', () => {
    expect(DEMO_LEGAL_FIELDS.CONTROLLER_NAME).toBe('');
    expect(demoLegalValues(demo({ operatorName: 'Example Consulting AB' })).CONTROLLER_NAME).toBe('Example Consulting AB');
    expect(demoLegalValues(demo()).CONTROLLER_NAME).toBe('');
  });
});

describe('legalTextIsDraft', () => {
  it('stays a draft until every field is filled and counsel has signed off', () => {
    expect(legalTextIsDraft(['PRIVACY_EMAIL'], false)).toBe(true);
    expect(legalTextIsDraft([], false)).toBe(true);
    expect(legalTextIsDraft(['PRIVACY_EMAIL'], true)).toBe(true);
    expect(legalTextIsDraft([], true)).toBe(false);
  });
});

describe('the two texts', () => {
  const known = new Set([...Object.keys(DEMO_LEGAL_FIELDS), 'ACCOUNT_TTL_DAYS', 'DEFAULT_MODEL', 'OTHER_MODELS', 'MODEL_MAKERS', 'SCORING_SENTENCE']);

  it('use only placeholders the page fills in', () => {
    for (const [name, text] of [['notice', PRIVACY_NOTICE_MD], ['terms', DEMO_TERMS_MD]] as const) {
      const unknown = unfilledFields(text).filter((f) => !known.has(f));
      expect(unknown, name).toEqual([]);
    }
  });

  it('have no retention period left to fill once the server has answered', () => {
    const values = demoLegalValues(demo({ operatorName: 'Example Consulting AB' }));
    for (const text of [PRIVACY_NOTICE_MD, DEMO_TERMS_MD]) {
      const left = unfilledFields(fillLegalText(text, values));
      expect(left).not.toContain('ACCOUNT_TTL_DAYS');
      expect(left).not.toContain('CONTROLLER_NAME');
    }
  });

  it('name the models from the server: its default first, then the others it offers, and their makers', () => {
    const values = demoLegalValues(demo({
      offeredModels: ['compat:openrouter:deepseek/deepseek-v4-flash-0731', 'compat:openrouter:z-ai/glm-5.3', 'compat:openrouter:moonshotai/kimi-k2.6'],
      defaultModel: 'compat:openrouter:z-ai/glm-5.3',
    }));
    expect(values.DEFAULT_MODEL).toBe('GLM 5.3');
    expect(values.OTHER_MODELS).toBe('DeepSeek V4 Flash or Kimi K2.6');
    expect(values.MODEL_MAKERS).toBe('Z.ai (GLM), DeepSeek and Moonshot AI (Kimi)');
    const notice = fillLegalText(PRIVACY_NOTICE_MD, values);
    expect(notice).toContain('The model is **GLM 5.3** unless you choose another in the model list: DeepSeek V4 Flash or Kimi K2.6.');
    expect(notice).not.toContain('GLM 5.3 Flash');
    for (const text of [PRIVACY_NOTICE_MD, DEMO_TERMS_MD]) {
      const left = unfilledFields(fillLegalText(text, values));
      for (const f of ['DEFAULT_MODEL', 'OTHER_MODELS', 'MODEL_MAKERS']) expect(left).not.toContain(f);
    }
  });

  it('take the first offered model when the default is not offered (negative control: the default is not invented)', () => {
    const values = demoLegalValues(demo({ offeredModels: ['compat:openrouter:z-ai/glm-5.3'], defaultModel: 'claude-opus-5-5' }));
    expect(values.DEFAULT_MODEL).toBe('GLM 5.3');
    expect(values.OTHER_MODELS).toBe('another model, when one is offered');
    expect(demoLegalValues(demo()).DEFAULT_MODEL).toBe('');
  });

  it('say which model makes the Trust Score, and what it reads, when the demo scores answers', () => {
    const values = demoLegalValues(demo({
      offeredModels: ['compat:openrouter:z-ai/glm-5.3', 'compat:openrouter:moonshotai/kimi-k2.6'],
      defaultModel: 'compat:openrouter:z-ai/glm-5.3',
      answersScored: true,
      scorerModel: 'compat:openrouter:deepseek/deepseek-v4-flash-0731',
    }));
    expect(values.SCORING_SENTENCE).toBe(
      'After each answer longer than 200 characters, the model DeepSeek V4 Flash rates its quality '
      + '(the Trust Score shown under the answer). This request carries the first 3,000 characters of the answer.',
    );
    const notice = fillLegalText(PRIVACY_NOTICE_MD, values);
    expect(notice).toContain('**The Trust Score:** After each answer longer than 200 characters, the model DeepSeek V4 Flash rates its quality');
    expect(unfilledFields(notice)).not.toContain('SCORING_SENTENCE');
  });

  it('say that nothing is scored when the demo makes no score (negative control: no scorer is named)', () => {
    const values = demoLegalValues(demo({ answersScored: false, scorerModel: 'compat:openrouter:deepseek/deepseek-v4-flash-0731' }));
    expect(values.SCORING_SENTENCE).toBe('This demo does not score answers.');
    const notice = fillLegalText(PRIVACY_NOTICE_MD, values);
    expect(notice).toContain('**The Trust Score:** This demo does not score answers.');
    expect(notice).not.toContain('DeepSeek V4 Flash rates');
  });

  it('leave the Trust Score sentence marked when answers are scored but the server names no scorer', () => {
    const values = demoLegalValues(demo({ answersScored: true }));
    expect(values.SCORING_SENTENCE).toBe('');
    expect(unfilledFields(fillLegalText(PRIVACY_NOTICE_MD, values))).toContain('SCORING_SENTENCE');
  });

  it('state the terms version the server stores at sign-up', () => {
    expect(DEMO_TERMS_TEXT_VERSION).toBe(DEMO_TERMS_VERSION);
    expect(DEMO_TERMS_MD).toContain(`**Version:** ${DEMO_TERMS_VERSION}`);
  });
});
