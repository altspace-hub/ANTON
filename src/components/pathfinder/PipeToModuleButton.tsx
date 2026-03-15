import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { pipeSearchToModule } from '@/lib/pathfinder-api';

const PIPE_TARGETS = [
  { label: 'Open Chat', path: '/prompt', param: 'prefill' },
  { label: 'Brief Me', path: '/brief', param: 'topic' },
  { label: 'Challenge This', path: '/challenge', param: 'statement' },
  { label: 'Review Engine', path: '/review', param: 'content' },
  { label: 'Sounding Board', path: '/sounding-board', param: 'topic' },
] as const;

interface PipeToModuleButtonProps {
  text: string;
  searchId?: string | null;
}

export default function PipeToModuleButton({ text, searchId }: PipeToModuleButtonProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function handlePipe(target: typeof PIPE_TARGETS[number]) {
    let contextText = text.slice(0, 4000);

    // If we have a searchId, use the proper API to get formatted context
    if (searchId) {
      try {
        const result = await pipeSearchToModule(searchId);
        contextText = result.contextText.slice(0, 4000);
      } catch {
        // Fall back to raw text
      }
    }

    sessionStorage.setItem('pathfinder-pipe-text', contextText);
    navigate(`${target.path}?from=pathfinder`);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 rounded-lg border border-border bg-adv-card px-2.5 py-1.5 text-xs text-adv-gray hover:text-adv-off-white hover:border-adv-teal/30 transition-colors"
      >
        <ArrowRight className="h-3 w-3" />
        Use in...
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-44 rounded-lg border border-border bg-adv-dark-2 shadow-xl">
          {PIPE_TARGETS.map(t => (
            <button
              key={t.path}
              onClick={() => handlePipe(t)}
              className="flex w-full items-center gap-2 px-3 py-2 text-xs text-adv-off-white hover:bg-adv-card transition-colors first:rounded-t-lg last:rounded-b-lg"
            >
              <ArrowRight className="h-3 w-3 text-adv-teal" />
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
