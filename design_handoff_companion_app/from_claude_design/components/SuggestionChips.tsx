/**
 * SuggestionChips — Follow-up suggestion buttons after AI response.
 */

interface Props {
  suggestions: string[];
  onSelect: (suggestion: string) => void;
}

export default function SuggestionChips({ suggestions, onSelect }: Props) {
  if (!suggestions.length) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {suggestions.map((s, i) => (
        <button
          key={i}
          onClick={() => onSelect(s)}
          className="rounded-full border border-adv-teal/30 bg-adv-teal/5 px-3 py-1.5 text-xs text-adv-teal transition hover:bg-adv-teal/15 active:scale-95"
        >
          {s}
        </button>
      ))}
    </div>
  );
}
