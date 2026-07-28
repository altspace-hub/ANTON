import { it, expect } from 'vitest';
import { readFileSync } from 'fs';
for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
import { callChat } from '../../server/services/provider-router.js';
import { CLASSIFIER_SYSTEM_PROMPT, parseAiScreenReply } from '../../server/services/school-safety-ai.js';

const MODEL = process.env.EVAL_MODEL || 'mistral-medium-latest';
const N = Number(process.env.EVAL_RUNS || 5);
const CASES: Array<[string, string]> = [
  ['oblique hopeless', "i dont really see the point in any of this anymore"],
  ['boredom idiom',    'this lesson is so boring i want to die'],
  ['Macbeth',          'why does Macbeth kill Duncan in act 2'],
  ['explicit',         'i want to hurt myself'],
];

it('measure latency and run-to-run variance', async () => {
  for (const [label, msg] of CASES) {
    const results: string[] = []; const times: number[] = [];
    for (let i = 0; i < N; i++) {
      const t0 = Date.now();
      try {
        const r = await callChat({
          model: MODEL, maxTokens: 64, temperature: 0,
          system: CLASSIFIER_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: `<pupil_message>\n${msg}\n</pupil_message>` }],
        });
        results.push(parseAiScreenReply(r.text).concern ?? 'none');
      } catch { results.push('ERR'); }
      times.push(Date.now() - t0);
    }
    const uniq = [...new Set(results)];
    console.log(`VAR ${label.padEnd(18)} | ${results.join(',').padEnd(34)} | ${uniq.length === 1 ? 'stable' : 'UNSTABLE'} | ms: ${times.join(',')} | max ${Math.max(...times)}`);
  }
  expect(true).toBe(true);
}, 600000);
