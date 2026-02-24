import { useEffect, useState } from 'react';
import { Search, Loader2, CheckCircle, XCircle, Command } from 'lucide-react';

interface CommandResult {
  success: boolean;
  message: string;
  redirect?: string;
  data?: any;
}

interface ParsedCommand {
  commandType: string;
  action: string;
  parameters: Record<string, any>;
  confidence: number;
  clarification?: string;
}

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CommandResult | null>(null);
  const [parsed, setParsed] = useState<ParsedCommand | null>(null);

  // Load recent commands from localStorage
  const [recentCommands, setRecentCommands] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('recent-commands');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
        setResult(null);
        setParsed(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const addToRecentCommands = (command: string) => {
    const updated = [command, ...recentCommands.filter(c => c !== command)].slice(0, 5);
    setRecentCommands(updated);
    localStorage.setItem('recent-commands', JSON.stringify(updated));
  };

  const handleExecute = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setResult(null);
    setParsed(null);

    try {
      const response = await fetch('/api/commands/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      setResult(data.result);
      setParsed(data.parsed);

      if (data.result.success) {
        addToRecentCommands(input);
      }

      if (data.result.success && data.result.redirect) {
        setTimeout(() => {
          window.location.href = data.result.redirect;
        }, 800);
      }
    } catch (error: any) {
      setResult({
        success: false,
        message: error.message || 'Command execution failed.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRecentClick = (command: string) => {
    setInput(command);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-32 bg-black/60"
      onClick={() => {
        setIsOpen(false);
        setResult(null);
        setParsed(null);
      }}
    >
      <div
        className="bg-adv-card border border-adv-gray-med rounded-lg shadow-2xl w-full max-w-2xl animate-in fade-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-adv-gray-med">
          <Search className="w-5 h-5 text-adv-teal flex-shrink-0" />
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleExecute()}
            placeholder="Type a command... (e.g., Create gap analysis for Nordea)"
            className="flex-1 bg-transparent text-white text-lg outline-none placeholder-adv-gray"
            autoFocus
          />
          {loading && <Loader2 className="w-5 h-5 animate-spin text-adv-teal flex-shrink-0" />}
          <button
            onClick={handleExecute}
            disabled={loading || !input.trim()}
            className="px-3 py-1.5 bg-adv-teal hover:bg-adv-teal-dark disabled:bg-adv-gray-med disabled:cursor-not-allowed text-white rounded text-sm font-medium transition-colors"
          >
            Execute
          </button>
        </div>

        {/* Parsed command preview */}
        {parsed && !result && (
          <div className="p-3 bg-adv-teal-soft border-b border-adv-gray-med">
            <p className="text-adv-off-white text-sm">
              <span className="text-adv-teal font-semibold">Interpreted as:</span>{' '}
              {parsed.action.replace(/_/g, ' ')}
              {parsed.parameters && Object.keys(parsed.parameters).length > 0 && (
                <span className="text-adv-gray ml-2">
                  ({Object.entries(parsed.parameters)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(', ')})
                </span>
              )}
            </p>
            {parsed.confidence < 0.7 && (
              <p className="text-adv-gold text-xs mt-1">⚠ Low confidence — please verify</p>
            )}
          </div>
        )}

        {/* Result */}
        {result && (
          <div
            className={`p-4 flex items-start gap-3 border-b border-adv-gray-med ${
              result.success ? 'bg-green-900/20' : 'bg-red-900/20'
            }`}
          >
            {result.success ? (
              <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
            ) : (
              <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <p className="text-white">{result.message}</p>
              {result.redirect && (
                <p className="text-adv-teal text-sm mt-1">Redirecting to {result.redirect}...</p>
              )}
            </div>
          </div>
        )}

        {/* Examples and recent commands */}
        <div className="p-4 text-sm text-adv-gray max-h-80 overflow-y-auto">
          {recentCommands.length > 0 && (
            <div className="mb-4">
              <p className="text-adv-off-white font-medium mb-2 flex items-center gap-2">
                <Command className="w-4 h-4" />
                Recent commands:
              </p>
              <div className="space-y-1">
                {recentCommands.map((cmd, i) => (
                  <button
                    key={i}
                    onClick={() => handleRecentClick(cmd)}
                    className="block w-full text-left px-3 py-2 rounded hover:bg-adv-dark-2 text-adv-off-white transition-colors"
                  >
                    {cmd}
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="text-adv-off-white font-medium mb-2">Try commands like:</p>
          <ul className="space-y-1.5">
            <li className="flex items-start gap-2">
              <span className="text-adv-teal">•</span>
              <span>Create a gap analysis workflow for [client]</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-adv-teal">•</span>
              <span>Show me all sessions about AMLR</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-adv-teal">•</span>
              <span>Go to workflows / projects / quality / radar</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-adv-teal">•</span>
              <span>Rebuild knowledge graph</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-adv-teal">•</span>
              <span>Run quality check on [module]</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-adv-teal">•</span>
              <span>Create sanctions advisory session</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-adv-teal">•</span>
              <span>Search for compliance sessions</span>
            </li>
          </ul>

          <div className="mt-4 pt-3 border-t border-adv-gray-med text-xs text-adv-gray-med">
            <p className="flex items-center gap-2">
              <Command className="w-3 h-3" />
              Press <kbd className="px-1.5 py-0.5 bg-adv-dark-2 rounded">Cmd+K</kbd> or{' '}
              <kbd className="px-1.5 py-0.5 bg-adv-dark-2 rounded">Ctrl+K</kbd> to open anytime
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
