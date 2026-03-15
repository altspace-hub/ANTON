import { useState, useRef } from 'react';
import { Send, Loader2 } from 'lucide-react';

interface FollowUpInputProps {
  onSubmit: (question: string) => void;
  isLoading: boolean;
  suggestions?: string[];
}

export default function FollowUpInput({ onSubmit, isLoading, suggestions = [] }: FollowUpInputProps) {
  const [question, setQuestion] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim() || isLoading) return;
    onSubmit(question.trim());
    setQuestion('');
  }

  return (
    <div className="space-y-2">
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => { setQuestion(s); inputRef.current?.focus(); }}
              className="rounded-full border border-adv-teal/20 bg-adv-teal/5 px-3 py-1 text-xs text-adv-teal hover:bg-adv-teal/10 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={question}
          onChange={e => setQuestion(e.target.value)}
          placeholder="Ask a follow-up question..."
          disabled={isLoading}
          className="flex-1 rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray/50 focus:border-adv-teal focus:outline-none"
        />
        <button
          type="submit"
          disabled={!question.trim() || isLoading}
          className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-3 py-2 text-sm font-medium text-adv-dark transition-colors hover:bg-adv-teal-dark disabled:opacity-40"
        >
          {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        </button>
      </form>
    </div>
  );
}
