/**
 * SuggestionChips — Follow-up suggestion buttons after AI response.
 * Light-theme tokens (May 3 IRE — was using legacy adv-teal classes).
 */

interface Props {
  suggestions: string[];
  onSelect: (suggestion: string) => void;
}

export default function SuggestionChips({ suggestions, onSelect }: Props) {
  if (!suggestions.length) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {suggestions.map((s, i) => (
        <button
          key={i}
          onClick={() => onSelect(s)}
          className="rounded-full px-3 py-1.5 text-[12px] font-medium transition active:scale-95"
          style={{
            background: 'var(--color-accent-soft)',
            color: 'var(--color-accent)',
            border: '1px solid var(--color-accent-dim)',
          }}
        >
          {s}
        </button>
      ))}
    </div>
  );
}
