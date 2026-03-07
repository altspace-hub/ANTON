import { useState, useRef, useEffect } from 'react';
import { BookOpen, Clock, List, FileText, CheckCircle, CheckCircle2, XCircle, X } from 'lucide-react';

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

interface CompletenessResult {
  score: number;
  found: string[];
  missing: string[];
}

/**
 * Computes a completeness score (0–100) by checking how many of the expected
 * section keywords for the given output format IDs appear in the text.
 * Returns found and missing keyword lists for display.
 *
 * When no format IDs are supplied, falls back to a legacy 3-signal heuristic.
 */
export function computeCompleteness(text: string, outputFormatIds?: string[]): CompletenessResult {
  if (!text || text.trim().length === 0) return { score: 0, found: [], missing: [] };

  const lower = text.toLowerCase();

  if (!outputFormatIds || outputFormatIds.length === 0) {
    // Legacy fallback: generic structural signals
    const checks = [
      { label: 'Executive summary / key findings', match: /executive summary|key findings|summary/i.test(text) },
      { label: 'Recommendations / actions',        match: /recommend|action|next step/i.test(text) },
      { label: 'Conclusion',                       match: /conclusion|summary|in conclusion/i.test(text) },
    ];
    const found   = checks.filter((c) => c.match).map((c) => c.label);
    const missing = checks.filter((c) => !c.match).map((c) => c.label);
    return { score: Math.round((found.length / checks.length) * 100), found, missing };
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

  if (allKeywords.length === 0) return { score: 100, found: [], missing: [] };

  const found   = allKeywords.filter((kw) => lower.includes(kw));
  const missing = allKeywords.filter((kw) => !lower.includes(kw));
  return { score: Math.round((found.length / allKeywords.length) * 100), found, missing };
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

  const completeness = computeCompleteness(content, outputFormatIds);

  return { wordCount, readingTimeMin, sectionCount, citations, showCitations, completeness };
}

interface CompletenessBadgeProps {
  score: number;
  found: string[];
  missing: string[];
}

function CompletenessBadge({ score, found, missing }: CompletenessBadgeProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

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

  const hasDetail = found.length > 0 || missing.length > 0;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => hasDetail && setOpen((v) => !v)}
        title={hasDetail ? 'Click to see matched and missing sections' : `${score}% of expected sections found`}
        className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-opacity ${colorClass} ${hasDetail ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
      >
        <CheckCircle className="h-3 w-3" />
        {score}% {label}
      </button>

      {open && hasDetail && (
        <div className="absolute bottom-6 left-0 z-50 w-64 rounded-lg border border-border bg-adv-card shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-adv-teal">
              Expected sections
            </span>
            <button onClick={() => setOpen(false)} className="text-adv-gray hover:text-adv-off-white">
              <X className="h-3 w-3" />
            </button>
          </div>
          <div className="max-h-56 overflow-y-auto p-2 space-y-0.5">
            {found.map((kw) => (
              <div key={kw} className="flex items-center gap-2 rounded px-2 py-1">
                <CheckCircle2 className="h-3 w-3 shrink-0 text-adv-green" />
                <span className="text-[11px] text-adv-gray capitalize">{kw}</span>
              </div>
            ))}
            {missing.map((kw) => (
              <div key={kw} className="flex items-center gap-2 rounded px-2 py-1">
                <XCircle className="h-3 w-3 shrink-0 text-adv-red" />
                <span className="text-[11px] text-adv-gray capitalize">{kw}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-border px-3 py-2">
            <p className="text-xs text-adv-gray leading-relaxed">
              Checks whether the output covers the key topics expected for your selected output format.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function QualityIndicatorBar({ content, moduleId, outputFormatIds }: QualityIndicatorBarProps) {
  if (!content || content.trim().length === 0) return null;

  const { wordCount, readingTimeMin, sectionCount, citations, showCitations, completeness } =
    analyzeQuality(content, moduleId, outputFormatIds);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-2 mt-2 text-[11px] text-adv-gray">
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

      {/* Completeness badge — clickable to see matched/missing sections */}
      <CompletenessBadge score={completeness.score} found={completeness.found} missing={completeness.missing} />
    </div>
  );
}
