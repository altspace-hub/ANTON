import { Lightbulb, X } from 'lucide-react';

interface SmartModelBannerProps {
  userInput: string;
  currentModel: string;
  onSwitchModel: (model: string) => void;
  onDismiss: () => void;
}

export function detectOptimalModel(
  userInput: string,
  currentModel: string
): { suggest: string | null; reason: string } {
  const words = userInput.trim().split(/\s+/).length;
  const isSimple =
    words < 30 &&
    !userInput.includes('analyse') &&
    !userInput.includes('analyze') &&
    !userInput.includes('compare') &&
    !userInput.includes('document') &&
    !userInput.includes('review') &&
    !userInput.includes('gap');
  const isMedium = words < 100;

  if (currentModel === 'claude-opus-4-7') {
    if (isSimple) {
      return {
        suggest: 'claude-haiku-4-5-20251001',
        reason: 'This looks like a quick question — Haiku is ~20× cheaper and fast.',
      };
    }
    if (isMedium) {
      return {
        suggest: 'claude-sonnet-4-6',
        reason: 'Standard query — Sonnet 4.6 delivers great results at ~5× lower cost.',
      };
    }
  }
  if ((currentModel === 'claude-sonnet-4-6' || currentModel === 'claude-sonnet-4-5-20250929') && isSimple) {
    return {
      suggest: 'claude-haiku-4-5-20251001',
      reason: 'This looks like a quick question — Haiku is ~4× cheaper.',
    };
  }
  return { suggest: null, reason: '' };
}

const MODEL_LABELS: Record<string, string> = {
  'claude-haiku-4-5-20251001': 'Haiku',
  'claude-sonnet-4-6': 'Sonnet 4.6',
  'claude-sonnet-4-5-20250929': 'Sonnet 4.5',
  'claude-opus-4-7': 'Opus',
};

export default function SmartModelBanner({
  userInput,
  currentModel,
  onSwitchModel,
  onDismiss,
}: SmartModelBannerProps) {
  const { suggest, reason } = detectOptimalModel(userInput, currentModel);

  if (!suggest) return null;

  const suggestLabel = MODEL_LABELS[suggest] ?? suggest;
  const currentLabel = MODEL_LABELS[currentModel] ?? currentModel;

  return (
    <div className="flex items-start gap-2 rounded-lg border border-adv-gold/30 bg-adv-gold/10 px-3 py-2">
      <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-adv-gold" />
      <p className="flex-1 text-xs text-adv-gold">{reason}</p>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          onClick={() => onSwitchModel(suggest)}
          className="rounded-md bg-adv-gold/20 px-2 py-0.5 text-xs font-medium text-adv-gold hover:bg-adv-gold/30 transition-colors"
        >
          Switch to {suggestLabel}
        </button>
        <button
          onClick={onDismiss}
          title={`Keep ${currentLabel}`}
          className="rounded-md border border-adv-gold/20 px-2 py-0.5 text-xs text-adv-gold/70 hover:text-adv-gold transition-colors"
        >
          Keep {currentLabel}
        </button>
        <button
          onClick={onDismiss}
          className="text-adv-gold/50 hover:text-adv-gold transition-colors"
          title="Dismiss"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
