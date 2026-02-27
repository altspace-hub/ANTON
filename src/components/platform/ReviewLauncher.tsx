import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Users, Scale, Eye, CheckCircle, Swords, AlignLeft,
  ChevronDown, ChevronRight, Square, Sparkles, RefreshCw,
  Landmark, Briefcase, Search, Handshake,
} from 'lucide-react';
import { DOMAIN_REVIEWERS } from '@/lib/domain-reviewers';
import { streamReviewDirect, fetchReviewModes } from '@/lib/api';

interface ReviewMode {
  id: string;
  label: string;
  icon: string;
  description: string;
  color: string;
}

interface ReviewLauncherProps {
  content: string;
  model: string;
  sessionId?: string;
  /** When true, skip outer card + accordion toggle (used when embedded in OutputToolbar) */
  embedded?: boolean;
  /** Called when user wants to rewrite the output incorporating review feedback */
  onApplyReview?: (reviewText: string) => void;
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Users, Scale, Eye, CheckCircle, Swords, AlignLeft,
  Landmark, Briefcase, Search, Handshake,
};

const DOMAIN_REVIEWER_IDS = new Set(DOMAIN_REVIEWERS.map((r) => r.id));

const COLOR_MAP: Record<string, string> = {
  teal:  'border-adv-teal/30 bg-adv-teal/5 text-adv-teal',
  blue:  'border-adv-blue/30 bg-adv-blue/5 text-adv-blue',
  green: 'border-adv-green/30 bg-adv-green/5 text-adv-green',
  gold:  'border-adv-gold/30 bg-adv-gold/5 text-adv-gold',
  red:   'border-adv-red/30 bg-adv-red/5 text-adv-red',
};

export default function ReviewLauncher({ content, model, sessionId, embedded, onApplyReview }: ReviewLauncherProps) {
  const [expanded, setExpanded] = useState(!!embedded);
  const [modes, setModes] = useState<ReviewMode[]>([]);
  const [selectedMode, setSelectedMode] = useState<string | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewText, setReviewText] = useState('');
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  useEffect(() => {
    fetchReviewModes().then(setModes).catch(() => {});
  }, []);

  const handleRunReview = async () => {
    if (!selectedMode || isReviewing || !content) return;
    setIsReviewing(true);
    setReviewText('');

    const ctrl = new AbortController();
    setAbortController(ctrl);

    try {
      const stream = streamReviewDirect(selectedMode, content, model, sessionId, ctrl.signal);
      for await (const event of stream) {
        if (event.type === 'text_delta') setReviewText((t) => t + event.content);
        if (event.type === 'error' || event.type === 'stream_end') break;
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setReviewText('Review failed. Please try again.');
      }
    } finally {
      setIsReviewing(false);
      setAbortController(null);
    }
  };

  const handleStop = () => {
    abortController?.abort();
    setIsReviewing(false);
  };

  const innerContent = (
    <div className={embedded ? '' : 'border-t border-border px-4 pb-4 pt-3'}>
      {/* Mode selector */}
      <p className="mb-3 text-xs text-adv-gray-med">Select a review mode to get a structured critique of the output above.</p>

      {/* Standard review modes */}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {modes.filter((m) => !DOMAIN_REVIEWER_IDS.has(m.id)).map((mode) => {
          const Icon = ICON_MAP[mode.icon] || Sparkles;
          const colorClass = COLOR_MAP[mode.color] || COLOR_MAP['teal'];
          const isSelected = selectedMode === mode.id;
          return (
            <button
              key={mode.id}
              onClick={() => setSelectedMode(isSelected ? null : mode.id)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-all ${
                isSelected
                  ? `${colorClass} ring-1 ring-current/50`
                  : 'border-border bg-adv-dark text-adv-gray hover:border-adv-gray-med hover:text-adv-off-white'
              }`}
              title={mode.description}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="font-medium">{mode.label}</span>
            </button>
          );
        })}
      </div>

      {/* Domain Reviewers */}
      {modes.some((m) => DOMAIN_REVIEWER_IDS.has(m.id)) && (
        <>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-adv-gray-med">
            Domain Reviewers
          </p>
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {modes.filter((m) => DOMAIN_REVIEWER_IDS.has(m.id)).map((mode) => {
              const domainReviewer = DOMAIN_REVIEWERS.find((r) => r.id === mode.id);
              const Icon = ICON_MAP[mode.icon] || Sparkles;
              const colorClass = COLOR_MAP[mode.color] || COLOR_MAP['teal'];
              const isSelected = selectedMode === mode.id;
              return (
                <button
                  key={mode.id}
                  onClick={() => setSelectedMode(isSelected ? null : mode.id)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-all ${
                    isSelected
                      ? `${colorClass} ring-1 ring-current/50`
                      : 'border-border bg-adv-dark text-adv-gray hover:border-adv-gray-med hover:text-adv-off-white'
                  }`}
                  title={mode.description}
                >
                  <span className="shrink-0 text-sm leading-none">{domainReviewer?.icon}</span>
                  <span className="font-medium">{mode.label}</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {selectedMode && (
        <div className="mb-3 rounded-lg bg-adv-dark px-3 py-2 text-xs text-adv-gray-med">
          {modes.find((m) => m.id === selectedMode)?.description}
        </div>
      )}

      {/* Run / Stop */}
      <div className="flex gap-2">
        {isReviewing ? (
          <button
            onClick={handleStop}
            className="flex items-center gap-1.5 rounded-lg bg-adv-red px-4 py-2 text-xs font-medium text-white hover:bg-adv-red/80 transition-colors"
          >
            <Square className="h-3 w-3" />
            Stop
          </button>
        ) : (
          <button
            onClick={handleRunReview}
            disabled={!selectedMode}
            className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-2 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Sparkles className="h-3 w-3" />
            Run Review
          </button>
        )}
      </div>

      {/* Review output */}
      {(reviewText || isReviewing) && (
        <div className="mt-4 rounded-xl border border-border bg-adv-dark p-4">
          <div className="mb-2 flex items-center gap-1.5">
            <Sparkles className={`h-3.5 w-3.5 text-adv-teal ${isReviewing ? 'animate-pulse' : ''}`} />
            <span className="text-xs font-medium text-adv-teal">
              {modes.find((m) => m.id === selectedMode)?.label} Review
              {isReviewing && ' — generating...'}
            </span>
          </div>
          <div className="prose-output max-w-none text-adv-off-white">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{reviewText}</ReactMarkdown>
          </div>
          {/* Apply Review button — shown when review is complete */}
          {reviewText && !isReviewing && onApplyReview && (
            <button
              onClick={() => onApplyReview(reviewText)}
              className="mt-3 flex items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-2 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
              Apply Review &amp; Rewrite
            </button>
          )}
        </div>
      )}
    </div>
  );

  if (embedded) return innerContent;

  return (
    <div className="rounded-xl border border-border bg-adv-card">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-adv-teal" />
          <span className="text-sm font-medium text-adv-off-white">Review & Quality Check</span>
          {reviewText && !isReviewing && (
            <span className="rounded-full bg-adv-teal/20 px-2 py-0.5 text-[10px] text-adv-teal">Done</span>
          )}
        </div>
        {expanded ? <ChevronDown className="h-3.5 w-3.5 text-adv-gray" /> : <ChevronRight className="h-3.5 w-3.5 text-adv-gray" />}
      </button>
      {expanded && innerContent}
    </div>
  );
}
