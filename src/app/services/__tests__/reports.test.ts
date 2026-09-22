/**
 * reports.test.ts — reporting AI output, without turning the report into a
 * back-door for the conversation.
 *
 * Play requires apps that generate content with an LLM to give the user an
 * in-app way to report what came out. The Companion app generates content on
 * every screen that reaches ChatPage — free chat, Work modules, and School
 * mode, which navigates into the same page — and had no reporting affordance
 * at all. That is a rejection on its own.
 *
 * The store is the easy half. The hard half is that Companion conversations
 * routinely carry the user's confidential work, so a reporting flow that
 * quietly attached the offending turn would be an exfiltration path wearing a
 * safety badge. The rule: response text is carried ONLY when the reporter
 * ticked the box, the user's own prompt never at all. Most of these tests
 * exist to pin that rule rather than the happy path.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  saveReport, listReports, reportCountFor, formatReportForSharing,
  REPORT_CATEGORIES, type AiContentReport,
} from '../reports';
import { REPORT_STRINGS, reportStrings, type ReportStrings } from '../report-strings';

const MSG = 'msg-abc-123';
const RESPONSE = 'the model said something it should not have said';
const PROMPT = 'my confidential client matter, which is none of anyone else business';

const base = {
  modelId: 'claude-opus-4-8',
  modelLabel: 'Claude Opus 4.8',
  sessionId: 'sess-1',
  messageId: MSG,
  category: 'harmful' as const,
};

beforeEach(() => localStorage.clear());

describe('AI content reports — the store', () => {
  it('records a report and finds it again', () => {
    const r = saveReport({ ...base, note: 'told me to mix the two cleaners' });
    expect(r.id).toBeTruthy();
    const all = listReports();
    expect(all).toHaveLength(1);
    expect(all[0].category).toBe('harmful');
    expect(all[0].modelLabel).toBe('Claude Opus 4.8');
    expect(reportCountFor(MSG)).toBe(1);
  });

  it('refuses a report with no turn to point at', () => {
    // A report that cannot be tied back to a response is not actionable, and
    // silently storing one would make the affordance look like it worked.
    expect(() => saveReport({ ...base, messageId: '' })).toThrow(/messageId/);
  });

  it('keeps reports newest-first', () => {
    saveReport({ ...base, note: 'first' }, 1_000);
    saveReport({ ...base, note: 'second' }, 2_000);
    expect(listReports().map((r) => r.note)).toEqual(['second', 'first']);
  });

  it('survives a corrupt store rather than taking the chat down with it', () => {
    localStorage.setItem('anton-companion-reports', '{not json');
    expect(listReports()).toEqual([]);
    expect(() => saveReport({ ...base })).not.toThrow();
  });

  it('offers every category the sheet shows, with no duplicates', () => {
    expect(REPORT_CATEGORIES).toContain('harmful');
    expect(REPORT_CATEGORIES).toContain('sexual');
    expect(REPORT_CATEGORIES).toContain('inaccurate');
    expect(new Set(REPORT_CATEGORIES).size).toBe(REPORT_CATEGORIES.length);
  });
});

describe('the escalation text — what may leave the device', () => {
  const report = (over: Partial<AiContentReport> = {}): AiContentReport => ({
    id: 'r1', modelId: 'claude-opus-4-8', modelLabel: 'Claude Opus 4.8',
    sessionId: 'sess-1', messageId: MSG, category: 'harmful',
    createdAt: 1_700_000_000_000, ...over,
  });

  it('does NOT contain the response by default', () => {
    // The whole point. A report the user did not attach the response to must
    // carry none of it — not in a preview, not in a truncated summary.
    const text = formatReportForSharing(report({ note: 'dangerous advice' }));
    expect(text).not.toContain(RESPONSE);
    expect(text).toContain('No response text is included');
  });

  it('includes the response only when the user chose to attach it', () => {
    const text = formatReportForSharing(report({ includedResponseText: RESPONSE }));
    expect(text).toContain(RESPONSE);
    expect(text).toContain('Response text I chose to include');
  });

  it('emits an explicit allowlist of lines, not whatever the record holds', () => {
    // The prompt is the half of the exchange most likely to hold the user's
    // confidential material and is not what is being reported, so there is no
    // field for it. This pins the stronger property that makes that safe: the
    // formatter names every line it writes. If it were ever swapped for a
    // JSON.stringify of the record, a field added later — a cached prompt, a
    // debug blob — would start riding along silently. This fails if it is.
    const smuggled = {
      ...report({ includedResponseText: RESPONSE }),
      prompt: PROMPT,
    } as AiContentReport;
    const text = formatReportForSharing(smuggled);
    expect(text).toContain(RESPONSE);   // what the user did attach
    expect(text).not.toContain(PROMPT); // and nothing else the record happens to carry
  });

  it('carries the identifiers whoever receives it can act on', () => {
    const text = formatReportForSharing(report({ moduleId: 'aml-risk', note: 'context' }));
    expect(text).toContain('Claude Opus 4.8');  // which model answered
    expect(text).toContain('claude-opus-4-8');  // and its exact id
    expect(text).toContain('aml-risk');         // under which module's prompt
    expect(text).toContain(MSG);                // which turn
    expect(text).toContain('harmful');          // why
    expect(text).toContain('context');          // the reporter's own words
  });

  it('says so when the instance default answered, rather than leaving it blank', () => {
    // "the default did this" and "the model I picked did this" are different
    // bug reports; a blank model line loses that distinction.
    const text = formatReportForSharing(report({ modelId: null, modelLabel: 'Default' }));
    expect(text).toContain('instance default');
  });

  it('never invents a note the user did not write', () => {
    expect(formatReportForSharing(report())).not.toContain('What was wrong:');
  });
});

describe('the copy exists in both languages the devices run in', () => {
  it('has identical key sets for en and sv', () => {
    expect(Object.keys(REPORT_STRINGS.sv).sort()).toEqual(Object.keys(REPORT_STRINGS.en).sort());
  });

  it('has real Swedish, not the English string copied across', () => {
    for (const k of Object.keys(REPORT_STRINGS.en) as (keyof ReportStrings)[]) {
      expect(REPORT_STRINGS.sv[k], `sv.${k} missing`).toBeTruthy();
      expect(REPORT_STRINGS.sv[k], `sv.${k} is untranslated English`)
        .not.toBe(REPORT_STRINGS.en[k]);
    }
  });

  it('resolves sv-SE to Swedish and anything untranslated to English', () => {
    expect(reportStrings('sv-SE')).toBe(REPORT_STRINGS.sv);
    expect(reportStrings('sv')).toBe(REPORT_STRINGS.sv);
    expect(reportStrings('de')).toBe(REPORT_STRINGS.en);
    expect(reportStrings(null)).toBe(REPORT_STRINGS.en);
  });

  it('keeps the model placeholder the sheet substitutes', () => {
    // The sheet does answeredBy.replace('{{model}}', label); a translation that
    // drops the token silently hides which model answered.
    expect(REPORT_STRINGS.en.answeredBy).toContain('{{model}}');
    expect(REPORT_STRINGS.sv.answeredBy).toContain('{{model}}');
  });
});

/**
 * These read source rather than rendering, deliberately. The failure being
 * guarded is "the reporting route is not reachable from the screen that
 * generates the content" — a render test with the sheet mounted directly would
 * pass while the affordance was gone from the chat.
 */
describe('the route is actually wired into the chat', () => {
  const chat = readFileSync(join(process.cwd(), 'src/app/pages/ChatPage.tsx'), 'utf8');
  const sheet = readFileSync(join(process.cwd(), 'src/app/components/ReportSheet.tsx'), 'utf8');

  it('ChatPage renders the sheet and saves through the store', () => {
    expect(chat).toContain('<ReportSheet');
    expect(chat).toContain('saveReport(');
  });

  it('the affordance sits on assistant turns only', () => {
    // Not on the user's own messages (not AI content) and not on our error
    // bubbles (our failure, not the model's).
    expect(chat).toMatch(/msg\.role === 'assistant' && !msg\.isError[\s\S]{0,600}setReportTarget\(msg\)/);
  });

  it('response text reaches the record only via the opt-in', () => {
    // Guards the shape of the fix: if someone drops the conditional and passes
    // target.content unconditionally, this fails.
    expect(chat).toMatch(/includedResponseText: sub\.includeResponse \? target\.content : undefined/);
  });

  it('the attach checkbox starts unticked and resets between reports', () => {
    expect(sheet).toContain('useState(false)');
    expect(sheet).toMatch(/if \(!open\) return;[\s\S]{0,200}setIncludeResponse\(false\)/);
  });
});
