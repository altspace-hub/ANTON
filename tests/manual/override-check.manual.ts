import { it, expect } from 'vitest';
import { readFileSync } from 'fs';
for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
it('SCHOOL_AI_SCREEN_MODEL makes layer 2 actually run on Mistral', async () => {
  const { aiScreenStudentMessage } = await import('../../server/services/school-safety-ai.js');
  const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
  const db = new PostgresAdapter({ connectionString: process.env.DATABASE_URL! });

  // 1. WITHOUT the override: follows DEFAULT_MODEL (claude, no credit) -> fails open.
  delete process.env.SCHOOL_AI_SCREEN_MODEL;
  const before = await aiScreenStudentMessage(db as never, 'i dont see the point in any of this anymore');
  console.log('OVR without override ->', JSON.stringify(before));

  // 2. WITH it: routes to Mistral, which has credit.
  process.env.SCHOOL_AI_SCREEN_MODEL = 'mistral-medium-latest';
  const after = await aiScreenStudentMessage(db as never, 'i dont see the point in any of this anymore');
  console.log('OVR with override    ->', JSON.stringify(after));

  const course = await aiScreenStudentMessage(db as never, 'why does Macbeth kill Duncan in act 2');
  console.log('OVR coursework       ->', JSON.stringify(course));
  delete process.env.SCHOOL_AI_SCREEN_MODEL;
  expect(after).toBeDefined();
}, 120000);
