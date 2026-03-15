import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, Clock, ExternalLink, ArrowRight } from 'lucide-react';
import type { PathfinderModelResult } from '@/lib/pathfinder-api';

interface SourceCardProps {
  result: PathfinderModelResult;
}

export default function SourceCard({ result }: SourceCardProps) {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();

  function handleAnalyse() {
    // Pipe the model response into Open Chat for deeper analysis
    sessionStorage.setItem('pathfinder-pipe-text', result.response.slice(0, 4000));
    navigate('/prompt?from=pathfinder');
  }

  return (
    <div className={`rounded-lg border transition-colors ${
      result.status === 'complete'
        ? 'border-adv-green/20 bg-adv-card/50'
        : 'border-adv-red/20 bg-adv-red/5'
    }`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
      >
        {expanded ? <ChevronDown className="h-3.5 w-3.5 text-adv-gray shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-adv-gray shrink-0" />}
        <span className="font-medium text-adv-off-white">{result.role}</span>
        <span className="text-[10px] text-adv-gray">({result.modelId})</span>
        <span className="ml-auto flex items-center gap-1 text-[10px] text-adv-gray">
          <Clock className="h-2.5 w-2.5" />
          {(result.durationMs / 1000).toFixed(1)}s
        </span>
        {result.sourceCount > 0 && (
          <span className="rounded bg-adv-teal/10 px-1.5 py-0.5 text-[10px] text-adv-teal">
            {result.sourceCount} sources
          </span>
        )}
      </button>

      {expanded && (
        <div className="border-t border-border px-3 py-2">
          {result.status === 'error' ? (
            <p className="text-xs text-adv-red">{result.error || 'Unknown error'}</p>
          ) : (
            <>
              <div className="prose prose-invert prose-sm max-w-none text-xs text-adv-off-white/80 whitespace-pre-wrap">
                {result.response}
              </div>

              {/* Action buttons */}
              <div className="mt-2 flex items-center gap-2 border-t border-border/50 pt-2">
                <button
                  onClick={handleAnalyse}
                  className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-adv-teal hover:bg-adv-teal/10 transition-colors"
                >
                  <ArrowRight className="h-2.5 w-2.5" />
                  Analyse
                </button>
                {result.sourceCount > 0 && (
                  <button
                    onClick={() => {
                      // Copy response as markdown
                      navigator.clipboard.writeText(result.response);
                    }}
                    className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-adv-gray hover:bg-adv-card transition-colors"
                  >
                    <ExternalLink className="h-2.5 w-2.5" />
                    Copy
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
