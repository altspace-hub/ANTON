/**
 * gap-comparison.ts
 * Compares two gap assessment iteration snapshots to show progress.
 * Deterministic — pure functions over snapshots (Wave 1.7 adds ATTRIBUTED
 * deltas: every moved score is either evidence-driven, with the LLM's
 * required changeReason, or flagged unexplained).
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
  /** Wave 1.7 — re-assessment attribution */
  changeReason?: string | null;
  carriedForward?: boolean;
  /** Wave 1.2 — assessor override marker */
  overrideKind?: string | null;
  overrideReason?: string | null;
}

interface CapabilitySnapshot {
  id: string;
  name: string;
  maturityScore: number;
  gapSeverity: string;
}

export interface ComparisonDelta {
  articleId: string;
  articleTitle?: string;
  framework: string;
  beforeScore: number;
  afterScore: number;
  delta: number;
  /** Required explanation captured in re-assessment mode (Wave 1.7); null = unexplained */
  changeReason?: string | null;
  /** true when the movement carries a changeReason or an assessor-override reason */
  attributed?: boolean;
  /** 'reassessment' | 'override' | null — what produced the attribution */
  attributionSource?: 'reassessment' | 'override' | null;
}

export interface IterationComparison {
  overallDelta: { before: number; after: number; change: number };
  scoreCounts: {
    before: { red: number; amber: number; yellow: number; green: number };
    after: { red: number; amber: number; yellow: number; green: number };
  };
  improved: ComparisonDelta[];
  worsened: ComparisonDelta[];
  unchanged: Array<{ articleId: string; framework: string; score: number; carriedForward?: boolean }>;
  newArticles: Array<{ articleId: string; framework: string; score: number }>;
  removedArticles: Array<{ articleId: string; framework: string; score: number }>;
  capabilityDeltas: Array<{ id: string; name: string; beforeMaturity: number; afterMaturity: number; delta: number }>;
  totalImproved: number;
  totalWorsened: number;
  totalUnchanged: number;
  /** Wave 1.7 — how many moved scores are explained vs not */
  attribution: { evidenceDriven: number; unexplained: number; carriedForward: number };
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

  let carriedForwardCount = 0;

  for (const [key, after] of afterMap) {
    const before = beforeMap.get(key);
    if (!before) {
      newArticles.push({ articleId: after.articleId, framework: after.framework, score: after.numericScore || 0 });
      continue;
    }
    const bScore = before.numericScore || 0;
    const aScore = after.numericScore || 0;
    const delta = aScore - bScore;
    if (delta !== 0) {
      const changeReason = typeof after.changeReason === 'string' && after.changeReason.trim() ? after.changeReason.trim() : null;
      const overrideReason = typeof after.overrideReason === 'string' && after.overrideReason.trim() ? after.overrideReason.trim() : null;
      const attributionSource: ComparisonDelta['attributionSource'] = changeReason ? 'reassessment' : overrideReason ? 'override' : null;
      const entry: ComparisonDelta = {
        articleId: after.articleId,
        articleTitle: after.articleTitle,
        framework: after.framework,
        beforeScore: bScore,
        afterScore: aScore,
        delta,
        changeReason: changeReason ?? overrideReason,
        attributed: attributionSource !== null,
        attributionSource,
      };
      if (delta > 0) improved.push(entry); else worsened.push(entry);
    } else {
      if (after.carriedForward) carriedForwardCount++;
      unchanged.push({ articleId: after.articleId, framework: after.framework, score: aScore, carriedForward: after.carriedForward === true });
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
    attribution: {
      evidenceDriven: [...improved, ...worsened].filter(d => d.attributed).length,
      unexplained: [...improved, ...worsened].filter(d => !d.attributed).length,
      carriedForward: carriedForwardCount,
    },
  };
}

/**
 * Deterministic "Since Last Assessment" board section (Wave 1.7).
 * Rendered from the comparison — no LLM involved, so the numbers in the
 * board pack are exactly the numbers in the database.
 */
export function buildSinceLastAssessmentSection(cmp: IterationComparison): string {
  const lines: string[] = [];
  lines.push('### Since Last Assessment');
  lines.push('');
  lines.push('*This section is computed deterministically from the prior iteration snapshot — not AI-generated.*');
  lines.push('');
  lines.push(`| Improved | Regressed | Unchanged | Avg. score |`);
  lines.push(`|---|---|---|---|`);
  lines.push(`| ${cmp.totalImproved} | ${cmp.totalWorsened} | ${cmp.totalUnchanged} | ${cmp.overallDelta.before} → ${cmp.overallDelta.after} (${cmp.overallDelta.change >= 0 ? '+' : ''}${cmp.overallDelta.change}) |`);
  lines.push('');

  const moved = [...cmp.improved, ...cmp.worsened];
  if (moved.length > 0) {
    lines.push(`Attribution: ${cmp.attribution.evidenceDriven} change(s) evidence-driven with stated reasons, ${cmp.attribution.unexplained} unexplained.`);
    lines.push('');
    lines.push('| Article | Direction | Score | Reason |');
    lines.push('|---|---|---|---|');
    const sorted = moved.slice().sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    for (const d of sorted.slice(0, 25)) {
      const dir = d.delta > 0 ? '▲ improved' : '▼ regressed';
      const reason = d.changeReason ? d.changeReason.replace(/\|/g, '\\|').slice(0, 220) : '*unexplained — review*';
      lines.push(`| ${d.framework} ${d.articleId} | ${dir} | ${d.beforeScore} → ${d.afterScore} | ${reason} |`);
    }
    if (sorted.length > 25) lines.push(`| … | | | ${sorted.length - 25} further changed article(s) omitted |`);
  } else {
    lines.push('No article scores moved since the last assessment.');
  }
  if (cmp.attribution.carriedForward > 0) {
    lines.push('');
    lines.push(`${cmp.attribution.carriedForward} article(s) were carried forward unchanged from the prior iteration.`);
  }
  return lines.join('\n');
}
