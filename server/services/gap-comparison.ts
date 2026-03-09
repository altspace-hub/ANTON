/**
 * gap-comparison.ts
 * Compares two gap assessment iteration snapshots to show progress.
 */

interface FindingSnapshot {
  articleId: string;
  articleTitle?: string;
  framework: string;
  score: string;
  numericScore: number;
  priority: string;
  notes?: string;
  currentState?: string;
  requirement?: string;
}

interface CapabilitySnapshot {
  id: string;
  name: string;
  maturityScore: number;
  gapSeverity: string;
}

export interface IterationComparison {
  overallDelta: { before: number; after: number; change: number };
  scoreCounts: {
    before: { red: number; amber: number; yellow: number; green: number };
    after: { red: number; amber: number; yellow: number; green: number };
  };
  improved: Array<{ articleId: string; articleTitle?: string; framework: string; beforeScore: number; afterScore: number; delta: number }>;
  worsened: Array<{ articleId: string; articleTitle?: string; framework: string; beforeScore: number; afterScore: number; delta: number }>;
  unchanged: Array<{ articleId: string; framework: string; score: number }>;
  newArticles: Array<{ articleId: string; framework: string; score: number }>;
  removedArticles: Array<{ articleId: string; framework: string; score: number }>;
  capabilityDeltas: Array<{ id: string; name: string; beforeMaturity: number; afterMaturity: number; delta: number }>;
  totalImproved: number;
  totalWorsened: number;
  totalUnchanged: number;
}

function countScores(findings: FindingSnapshot[]) {
  return {
    red: findings.filter(f => f.score === 'red').length,
    amber: findings.filter(f => f.score === 'amber').length,
    yellow: findings.filter(f => f.score === 'yellow').length,
    green: findings.filter(f => f.score === 'green').length,
  };
}

function avgScore(findings: FindingSnapshot[]): number {
  if (findings.length === 0) return 0;
  return Math.round(findings.reduce((sum, f) => sum + (f.numericScore || 0), 0) / findings.length);
}

export function compareIterations(
  beforeFindings: FindingSnapshot[],
  afterFindings: FindingSnapshot[],
  beforeCapabilities?: CapabilitySnapshot[],
  afterCapabilities?: CapabilitySnapshot[],
): IterationComparison {
  const beforeMap = new Map<string, FindingSnapshot>();
  for (const f of beforeFindings) beforeMap.set(`${f.framework}::${f.articleId}`, f);

  const afterMap = new Map<string, FindingSnapshot>();
  for (const f of afterFindings) afterMap.set(`${f.framework}::${f.articleId}`, f);

  const improved: IterationComparison['improved'] = [];
  const worsened: IterationComparison['worsened'] = [];
  const unchanged: IterationComparison['unchanged'] = [];
  const newArticles: IterationComparison['newArticles'] = [];
  const removedArticles: IterationComparison['removedArticles'] = [];

  for (const [key, after] of afterMap) {
    const before = beforeMap.get(key);
    if (!before) {
      newArticles.push({ articleId: after.articleId, framework: after.framework, score: after.numericScore || 0 });
      continue;
    }
    const bScore = before.numericScore || 0;
    const aScore = after.numericScore || 0;
    const delta = aScore - bScore;
    if (delta > 0) {
      improved.push({ articleId: after.articleId, articleTitle: after.articleTitle, framework: after.framework, beforeScore: bScore, afterScore: aScore, delta });
    } else if (delta < 0) {
      worsened.push({ articleId: after.articleId, articleTitle: after.articleTitle, framework: after.framework, beforeScore: bScore, afterScore: aScore, delta });
    } else {
      unchanged.push({ articleId: after.articleId, framework: after.framework, score: aScore });
    }
  }

  for (const [key, before] of beforeMap) {
    if (!afterMap.has(key)) {
      removedArticles.push({ articleId: before.articleId, framework: before.framework, score: before.numericScore || 0 });
    }
  }

  // Capability deltas
  const capabilityDeltas: IterationComparison['capabilityDeltas'] = [];
  if (beforeCapabilities && afterCapabilities) {
    const beforeCapMap = new Map(beforeCapabilities.map(c => [c.id, c]));
    for (const ac of afterCapabilities) {
      const bc = beforeCapMap.get(ac.id);
      capabilityDeltas.push({
        id: ac.id,
        name: ac.name,
        beforeMaturity: bc?.maturityScore ?? 0,
        afterMaturity: ac.maturityScore,
        delta: ac.maturityScore - (bc?.maturityScore ?? 0),
      });
    }
  }

  // Sort by delta magnitude
  improved.sort((a, b) => b.delta - a.delta);
  worsened.sort((a, b) => a.delta - b.delta);

  return {
    overallDelta: { before: avgScore(beforeFindings), after: avgScore(afterFindings), change: avgScore(afterFindings) - avgScore(beforeFindings) },
    scoreCounts: { before: countScores(beforeFindings), after: countScores(afterFindings) },
    improved,
    worsened,
    unchanged,
    newArticles,
    removedArticles,
    capabilityDeltas,
    totalImproved: improved.length,
    totalWorsened: worsened.length,
    totalUnchanged: unchanged.length,
  };
}
