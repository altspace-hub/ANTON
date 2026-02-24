import { BookOpen, Clock, List, FileText, CheckCircle } from 'lucide-react';

interface QualityIndicatorBarProps {
  content: string;
  moduleId?: string;
  outputFormatIds?: string[];
}

// Modules that deal with regulatory/FCP/legal/audit content
const REGULATORY_MODULES = new Set([
  'gap-analysis',
  'sanctions-advisory',
  'regulatory-monitor',
  'data-management',
  'risk-assessment',
  'investigation-support',
  'document-creation',
  'model-validation',
]);

/**
 * Maps each output format ID to a list of keyword phrases that should appear
 * in a complete, well-formed response for that format.
 * Matching is case-insensitive substring search against the full output text.
 */
const FORMAT_SECTIONS: Record<string, string[]> = {
  'executive-summary':        ['key finding', 'risk', 'recommend'],
  'decision-memo':            ['decision', 'option', 'recommendation'],
  'risk-appetite-statement':  ['appetite', 'tolerance', 'escalation'],
  'legal-brief':              ['issue', 'analysis', 'conclusion'],
  'board-pack':               ['background', 'recommendation', 'decision required'],
  'investment-memo':          ['thesis', 'market', 'risk'],
  'detailed-findings':        ['finding', 'severity', 'recommendation'],
  'regulatory-comparison':    ['current', 'new', 'delta'],
  'impact-assessment':        ['operational', 'financial', 'timeline'],
  'audit-report':             ['scope', 'finding', 'conclusion'],
  'pentest-report':           ['executive summary', 'finding', 'remediation'],
  'clinical-trial-summary':   ['endpoint', 'result', 'conclusion'],
  'project-plan':             ['phase', 'milestone', 'resource'],
  'action-plan':              ['action', 'priority', 'owner'],
  'mitigation-plan':          ['finding', 'remediation', 'timeline'],
  'policy-document':          ['purpose', 'scope', 'roles'],
  'scope-tracker':            ['scope item', 'status', 'next action'],
  'raci-matrix':              ['responsible', 'accountable', 'consulted'],
  'gap-scoring-matrix':       ['gap', 'priority', 'compliance score'],
  'maturity-assessment':      ['maturity', 'current level', 'target'],
  'data-readiness-scorecard': ['data point', 'availability', 'gap'],
  'quick-briefing':           ['what happened', 'so what', 'now what'],
  'problem-solution':         ['problem', 'root cause', 'solution'],
  'stakeholder-presentation': ['slide', 'key message', 'speaker'],
  'training-material':        ['learning objective', 'case stud', 'knowledge check'],
  'client-proposal':          ['approach', 'scope', 'timeline'],
  'proposal-response':        ['executive summary', 'methodology', 'team'],
  'management-presentation':  ['slide', 'agenda', 'recommendation'],
  'compliance-calendar':      ['date', 'deadline', 'action'],
  'monitoring-plan':          ['activity', 'frequency', 'escalation'],
  'budget-resource-estimate': ['resource', 'cost', 'assumption'],
};

/**
 * Computes a completeness score (0–100) by checking how many of the expected
 * section keywords for the given output format IDs appear in the text.
 *
 * When no format IDs are supplied, falls back to a legacy 3-signal heuristic.
 */
export function computeCompleteness(text: string, outputFormatIds?: string[]): number {
  if (!text || text.trim().length === 0) return 0;

  const lower = text.toLowerCase();

  if (!outputFormatIds || outputFormatIds.length === 0) {
    // Legacy fallback: generic structural signals
    const hasExecutiveSummary = /executive summary|key findings|summary/i.test(text);
    const hasRecommendations = /recommend|action|next step/i.test(text);
    const hasConclusion = /conclusion|summary|in conclusion/i.test(text);
    const found = [hasExecutiveSummary, hasRecommendations, hasConclusion].filter(Boolean).length;
    return Math.round((found / 3) * 100);
  }

  // Gather all expected keywords across selected formats (de-duplicated)
  const allKeywords: string[] = [];
  for (const id of outputFormatIds) {
    const keywords = FORMAT_SECTIONS[id];
    if (keywords) {
      for (const kw of keywords) {
        if (!allKeywords.includes(kw)) allKeywords.push(kw);
      }
    }
  }

  if (allKeywords.length === 0) return 100; // unknown format — assume complete

  const foundCount = allKeywords.filter((kw) => lower.includes(kw)).length;
  return Math.round((foundCount / allKeywords.length) * 100);
}

function analyzeQuality(content: string, moduleId?: string, outputFormatIds?: string[]) {
  const wordCount = content.split(/\s+/).filter(Boolean).length;
  const readingTimeMin = Math.ceil(wordCount / 200);

  // Count markdown sections (# and ## headers)
  const sectionCount = (content.match(/^#{1,2} /gm) || []).length;

  // Count regulatory citations
  const citationPatterns =
    /\b(Article\s+\d+|AMLR|6AMLD|5AMLD|MLD\s*\d|EBA\s+(GL|RTS|ITS)|Directive\s+\d{4}\/\d+|Regulation\s+\d{4}\/\d+|FATF|Basel|DORA|NIS2|GDPR|PSD2|MiCA)\b/gi;
  const citations = (content.match(citationPatterns) || []).length;

  // Show citations only for regulatory/FCP modules
  const showCitations = moduleId ? REGULATORY_MODULES.has(moduleId) : false;

  const completenessScore = computeCompleteness(content, outputFormatIds);

  return { wordCount, readingTimeMin, sectionCount, citations, showCitations, completenessScore };
}

interface CompletenessBadgeProps {
  score: number;
}

function CompletenessBadge({ score }: CompletenessBadgeProps) {
  let colorClass: string;
  let label: string;

  if (score >= 90) {
    colorClass = 'bg-adv-green/20 text-adv-green border-adv-green/30';
    label = 'Complete';
  } else if (score >= 60) {
    colorClass = 'bg-adv-gold/20 text-adv-gold border-adv-gold/30';
    label = 'Partial';
  } else {
    colorClass = 'bg-adv-red/20 text-adv-red border-adv-red/30';
    label = 'Incomplete';
  }

  return (
    <span
      title={`Completeness: ${score}% of expected sections found`}
      className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${colorClass}`}
    >
      <CheckCircle className="h-3 w-3" />
      {score}% {label}
    </span>
  );
}

export default function QualityIndicatorBar({ content, moduleId, outputFormatIds }: QualityIndicatorBarProps) {
  if (!content || content.trim().length === 0) return null;

  const { wordCount, readingTimeMin, sectionCount, citations, showCitations, completenessScore } =
    analyzeQuality(content, moduleId, outputFormatIds);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-2 mt-2 text-[11px] text-adv-gray-med">
      {/* Word count */}
      <span className="flex items-center gap-1">
        <BookOpen className="h-3 w-3" />
        {wordCount.toLocaleString()} words
      </span>

      {/* Reading time */}
      <span className="flex items-center gap-1">
        <Clock className="h-3 w-3" />
        {readingTimeMin} min read
      </span>

      {/* Sections — only if > 0 */}
      {sectionCount > 0 && (
        <span className="flex items-center gap-1">
          <List className="h-3 w-3" />
          {sectionCount} {sectionCount === 1 ? 'section' : 'sections'}
        </span>
      )}

      {/* Citations — only if > 0 and regulatory module */}
      {showCitations && citations > 0 && (
        <span className="flex items-center gap-1 text-adv-teal">
          <FileText className="h-3 w-3" />
          {citations} {citations === 1 ? 'citation' : 'citations'}
        </span>
      )}

      {/* Completeness badge */}
      <CompletenessBadge score={completenessScore} />
    </div>
  );
}
