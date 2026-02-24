import { useState } from 'react';
import { Check } from 'lucide-react';
import { submitOutputFeedback } from '@/lib/api';

interface FeedbackWidgetProps {
  sessionId?: string;
  moduleId?: string;
  areaId?: string;
  qualityScoreId?: string;
  /** Called after feedback is successfully submitted */
  onSubmitted?: () => void;
}

type WidgetState = 'idle' | 'rating' | 'submitted';

export default function FeedbackWidget({ sessionId, moduleId, areaId, qualityScoreId, onSubmitted }: FeedbackWidgetProps) {
  const [state, setState] = useState<WidgetState>('idle');
  const [hovered, setHovered] = useState(0);
  const [selected, setSelected] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // No module context — nothing to rate
  if (!moduleId) return null;

  const handleStarClick = (star: number) => {
    setSelected(star);
    setState('rating');
  };

  const handleSubmit = async () => {
    if (selected === 0) return;
    setSubmitting(true);
    try {
      await submitOutputFeedback({
        sessionId,
        moduleId,
        areaId,
        qualityScoreId,
        rating: selected,
        comment: comment.trim() || undefined,
      });
      setState('submitted');
      onSubmitted?.();
    } catch {
      // fail silently — feedback is non-critical
      setState('submitted');
      onSubmitted?.();
    } finally {
      setSubmitting(false);
    }
  };

  if (state === 'submitted') {
    return (
      <div className="flex items-center gap-2 text-xs text-adv-green">
        <Check className="h-3.5 w-3.5" />
        <span>Thanks — feedback recorded</span>
      </div>
    );
  }

  const displayStars = hovered > 0 ? hovered : selected;

  return (
    <div className="space-y-2">
      {/* Star row */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-adv-gray">Rate this output:</span>
        <div className="flex items-center gap-0.5">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onClick={() => handleStarClick(star)}
              onMouseEnter={() => setHovered(star)}
              onMouseLeave={() => setHovered(0)}
              className="text-base leading-none transition-colors"
              aria-label={`Rate ${star} star${star !== 1 ? 's' : ''}`}
            >
              <span className={star <= displayStars ? 'text-adv-teal' : 'text-adv-gray-med'}>
                {star <= displayStars ? '★' : '☆'}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Comment + submit — shown after star selected */}
      {state === 'rating' && (
        <div className="space-y-2">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Any comments? (optional)"
            rows={2}
            className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-xs text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none resize-none"
          />
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : 'Submit feedback'}
          </button>
        </div>
      )}
    </div>
  );
}
