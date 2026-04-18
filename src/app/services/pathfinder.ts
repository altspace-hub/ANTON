/**
 * pathfinder.ts — typed companion-app client for /api/app/.../pathfinder.
 *
 * Single endpoint: POST /api/app/org/:orgId/pathfinder/query
 * Returns the question, a thinking trace (4-6 short steps), the answer
 * with [^n] citation markers, and a list of sources keyed n=1..N.
 */

import { activeServerBase, activeAuthHeaders } from './instances';

export type SourceType = 'private' | 'official' | 'news' | 'paper';

export interface PathfinderSource {
  n: number;
  title: string;
  domain: string;
  type: SourceType;
  snippet: string;
  score?: number;
}

export interface PathfinderResult {
  question: string;
  thoughts: string[];
  answer: string;
  sources: PathfinderSource[];
  org_id: string;
  took_ms: number;
  used_thinking: boolean;
  input_tokens: number;
  output_tokens: number;
}

export async function runPathfinderQuery(orgId: string, question: string): Promise<PathfinderResult> {
  const base = activeServerBase();
  const headers = await activeAuthHeaders();
  const r = await fetch(
    `${base}/api/app/org/${encodeURIComponent(orgId)}/pathfinder/query`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ question }),
    }
  );
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
  return r.json() as Promise<PathfinderResult>;
}

/**
 * Replace [^n] markers in the answer with React-friendly tokens you can
 * map to <sup> elements. Returns segments alternating between text and
 * citation numbers.
 */
export function splitAnswer(answer: string): Array<{ kind: 'text'; value: string } | { kind: 'cite'; n: number }> {
  const out: Array<{ kind: 'text'; value: string } | { kind: 'cite'; n: number }> = [];
  // Match [^1], [^2], ..., or bare [1], [2], ... so the LLM has some slack
  const re = /\[\^?(\d+)\]/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(answer)) !== null) {
    if (m.index > lastIdx) out.push({ kind: 'text', value: answer.slice(lastIdx, m.index) });
    out.push({ kind: 'cite', n: parseInt(m[1], 10) });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < answer.length) out.push({ kind: 'text', value: answer.slice(lastIdx) });
  return out;
}
