import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search, Loader2, CheckCircle, XCircle, Command, Star, Trash2, AlertTriangle } from 'lucide-react';

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
  reasoning?: string;
  clarification?: string;
}

// Commands that require confirmation before execution
const REQUIRES_CONFIRM = new Set(['rebuild_graph', 'run_pattern_detection']);

// Context-aware suggestions per page
const CONTEXT_SUGGESTIONS: Record<string, { cmd: string; label: string }[]> = {
  '/': [
    { cmd: 'Create gap analysis for [client]', label: 'New gap analysis' },
    { cmd: 'Go to workflows', label: 'Open workflows' },
    { cmd: 'Rebuild knowledge graph', label: 'Rebuild graph' },
  ],
  '/radar': [
    { cmd: 'Go to deadlines', label: 'View deadlines' },
    { cmd: 'Show me all sessions about sanctions', label: 'Sanctions search' },
    { cmd: 'Go to radar', label: 'Refresh radar' },
  ],
  '/quality': [
    { cmd: 'Run quality check on gap-analysis', label: 'Check gap analysis' },
    { cmd: 'Run quality check on document-creation', label: 'Check doc creation' },
    { cmd: 'Go to quality', label: 'Refresh quality' },
  ],
  '/workflows': [
    { cmd: 'Create gap analysis for [client]', label: 'New gap analysis' },
    { cmd: 'Create sanctions advisory session', label: 'New sanctions session' },
    { cmd: 'Go to projects', label: 'View projects' },
  ],
  '/graph': [
    { cmd: 'Rebuild knowledge graph', label: 'Rebuild graph' },
    { cmd: 'Go to intelligence', label: 'Open intelligence' },
  ],
  '/projects': [
    { cmd: 'Search for AMLR sessions', label: 'Search AMLR' },
    { cmd: 'Search for compliance sessions', label: 'Search compliance' },
    { cmd: 'Create gap analysis for [client]', label: 'New gap analysis' },
  ],
};

const DEFAULT_SUGGESTIONS = [
  { cmd: 'Create gap analysis for [client]', label: 'New gap analysis' },
  { cmd: 'Go to workflows', label: 'Open workflows' },
  { cmd: 'Show me all sessions about AMLR', label: 'Search AMLR' },
  { cmd: 'Rebuild knowledge graph', label: 'Rebuild graph' },
];

export function CommandPalette() {
  const location = useLocation();
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CommandResult | null>(null);
  const [parsed, setParsed] = useState<ParsedCommand | null>(null);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [confirmPending, setConfirmPending] = useState<ParsedCommand | null>(null);

  // Macro state
  const [macros, setMacros] = useState<Record<string, string>>(() => {
    try {
      const stored = localStorage.getItem('command-macros');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });
  const [savingMacro, setSavingMacro] = useState(false);
  const [macroName, setMacroName] = useState('');
  const macroInputRef = useRef<HTMLInputElement>(null);

  // Recent commands from localStorage
  const [recentCommands, setRecentCommands] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('recent-commands');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const inputRef = useRef<HTMLInputElement>(null);

  // Global keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
      }
      if (e.key === 'Escape') {
        closePalette();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Focus macro input when shown
  useEffect(() => {
    if (savingMacro) {
      setTimeout(() => macroInputRef.current?.focus(), 50);
    }
  }, [savingMacro]);

  const closePalette = () => {
    setIsOpen(false);
    setResult(null);
    setParsed(null);
    setInput('');
    setHistoryIndex(-1);
    setConfirmPending(null);
    setSavingMacro(false);
    setMacroName('');
  };

  const addToRecentCommands = (command: string) => {
    const updated = [command, ...recentCommands.filter((c) => c !== command)].slice(0, 5);
    setRecentCommands(updated);
    localStorage.setItem('recent-commands', JSON.stringify(updated));
  };

  const saveMacros = (updated: Record<string, string>) => {
    setMacros(updated);
    localStorage.setItem('command-macros', JSON.stringify(updated));
  };

  const handleSaveMacro = () => {
    const name = macroName.trim();
    if (!name || !result?.success) return;
    const cmd = input.trim();
    const updated = { ...macros };
    const keys = Object.keys(updated);
    // Max 10 macros
    if (!updated[name] && keys.length >= 10) {
      // Remove oldest
      delete updated[keys[0]];
    }
    updated[name] = cmd;
    saveMacros(updated);
    setSavingMacro(false);
    setMacroName('');
  };

  const deleteMacro = (name: string) => {
    const updated = { ...macros };
    delete updated[name];
    saveMacros(updated);
  };

  // Arrow-key history navigation
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleExecute();
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (recentCommands.length === 0) return;
      const newIndex = Math.min(historyIndex + 1, recentCommands.length - 1);
      setHistoryIndex(newIndex);
      setInput(recentCommands[newIndex]);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex <= 0) {
        setHistoryIndex(-1);
        setInput('');
      } else {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInput(recentCommands[newIndex]);
      }
      return;
    }

    // Any other key resets history navigation
    setHistoryIndex(-1);
  };

  const executeWithParsed = async (cmd: ParsedCommand, rawInput: string) => {
    try {
      const response = await fetch('/api/commands/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: rawInput, parsed: cmd }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      setResult(data.result);
      setParsed(cmd);

      if (data.result.success) {
        addToRecentCommands(rawInput);
      }

      if (data.result.success && data.result.redirect) {
        setTimeout(() => {
          navigate(data.result.redirect);
          closePalette();
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

  const handleExecute = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setResult(null);
    setParsed(null);
    setConfirmPending(null);

    try {
      const response = await fetch('/api/commands/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();

      // Check if this command needs confirmation
      if (
        data.parsed &&
        REQUIRES_CONFIRM.has(data.parsed.action) &&
        data.parsed.confidence > 0.7
      ) {
        setConfirmPending(data.parsed);
        setParsed(data.parsed);
        setLoading(false);
        return;
      }

      setResult(data.result);
      setParsed(data.parsed);

      if (data.result.success) {
        addToRecentCommands(input);
      }

      if (data.result.success && data.result.redirect) {
        setTimeout(() => {
          navigate(data.result.redirect);
          closePalette();
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

  const handleQuickCommand = (cmd: string) => {
    setInput(cmd);
    inputRef.current?.focus();
  };

  // Page-aware suggestions
  const suggestions = CONTEXT_SUGGESTIONS[location.pathname] ?? DEFAULT_SUGGESTIONS;
  const macroEntries = Object.entries(macros);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-32 bg-black/60"
      onClick={closePalette}
    >
      <div
        className="bg-adv-card border border-border rounded-lg shadow-2xl w-full max-w-2xl animate-in fade-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input row */}
        <div className="flex items-center gap-3 p-4 border-b border-border">
          <Search className="w-5 h-5 text-adv-teal flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => { setInput(e.target.value); setHistoryIndex(-1); }}
            onKeyDown={handleInputKeyDown}
            placeholder="Type a command… (↑↓ history)"
            className="flex-1 bg-transparent text-adv-white text-lg outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 placeholder-adv-gray"
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

        {/* Confirmation step */}
        {confirmPending && !result && (
          <div className="p-4 bg-adv-gold/10 border-b border-border">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-adv-gold flex-shrink-0" />
              <span className="text-adv-gold text-sm font-semibold">
                Confirm: {confirmPending.action.replace(/_/g, ' ')}?
              </span>
            </div>
            {parsed?.reasoning && (
              <p className="text-adv-gray text-xs italic mb-3">{parsed.reasoning}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setConfirmPending(null);
                  setLoading(true);
                  executeWithParsed(confirmPending, input);
                }}
                className="px-4 py-1.5 bg-adv-teal hover:bg-adv-teal-dark text-white rounded text-sm font-medium transition-colors"
              >
                Yes, do it
              </button>
              <button
                onClick={() => { setConfirmPending(null); setParsed(null); }}
                className="px-4 py-1.5 bg-adv-dark-2 hover:bg-adv-card border border-border text-adv-off-white rounded text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Parsed command preview (before result) */}
        {parsed && !result && !confirmPending && (
          <div className="p-3 bg-adv-teal-soft border-b border-border">
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
            {parsed.reasoning && (
              <p className="text-adv-gray text-xs mt-0.5 italic">{parsed.reasoning}</p>
            )}
            {parsed.confidence < 0.7 && (
              <p className="text-adv-gold text-xs mt-1">⚠ Low confidence — please verify</p>
            )}
          </div>
        )}

        {/* Result */}
        {result && (
          <div
            className={`p-4 border-b border-border ${
              result.success ? 'bg-green-900/20' : 'bg-red-900/20'
            }`}
          >
            <div className="flex items-start gap-3">
              {result.success ? (
                <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <p className="text-adv-white">{result.message}</p>
                {parsed?.reasoning && (
                  <p className="text-adv-gray text-xs mt-0.5 italic">{parsed.reasoning}</p>
                )}
                {result.redirect && (
                  <p className="text-adv-teal text-sm mt-1">Redirecting to {result.redirect}…</p>
                )}
              </div>
            </div>

            {/* Save as macro */}
            {result.success && !savingMacro && (
              <button
                onClick={() => setSavingMacro(true)}
                className="mt-2 ml-8 flex items-center gap-1.5 text-xs text-adv-gray hover:text-adv-gold transition-colors"
              >
                <Star className="w-3 h-3" />
                Save as macro
              </button>
            )}
            {result.success && savingMacro && (
              <div className="mt-2 ml-8 flex items-center gap-2">
                <input
                  ref={macroInputRef}
                  type="text"
                  value={macroName}
                  onChange={(e) => setMacroName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveMacro();
                    if (e.key === 'Escape') { setSavingMacro(false); setMacroName(''); }
                  }}
                  placeholder="Macro name…"
                  className="rounded bg-adv-dark-2 border border-border px-2 py-1 text-xs text-adv-white outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:border-adv-teal w-40"
                />
                <button
                  onClick={handleSaveMacro}
                  disabled={!macroName.trim()}
                  className="px-2 py-1 bg-adv-teal hover:bg-adv-teal-dark disabled:opacity-50 text-white rounded text-xs transition-colors"
                >
                  Save
                </button>
                <button
                  onClick={() => { setSavingMacro(false); setMacroName(''); }}
                  className="text-xs text-adv-gray hover:text-adv-white transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {/* Body: macros + recent + suggestions */}
        <div className="p-4 text-sm text-adv-gray max-h-80 overflow-y-auto space-y-4">
          {/* My Macros */}
          {macroEntries.length > 0 && (
            <div>
              <p className="text-adv-off-white font-medium mb-2 flex items-center gap-2">
                <Star className="w-4 h-4 text-adv-gold" />
                My macros
              </p>
              <div className="flex flex-wrap gap-1.5">
                {macroEntries.map(([name, cmd]) => (
                  <div key={name} className="flex items-center gap-1 rounded-full bg-adv-dark-2 border border-border pl-3 pr-1 py-1">
                    <button
                      onClick={() => handleQuickCommand(cmd)}
                      className="text-xs text-adv-off-white hover:text-adv-teal transition-colors"
                    >
                      {name}
                    </button>
                    <button
                      onClick={() => deleteMacro(name)}
                      className="p-0.5 text-adv-gray hover:text-adv-red transition-colors rounded-full"
                      title="Delete macro"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent commands */}
          {recentCommands.length > 0 && (
            <div>
              <p className="text-adv-off-white font-medium mb-2 flex items-center gap-2">
                <Command className="w-4 h-4" />
                Recent commands
              </p>
              <div className="space-y-1">
                {recentCommands.map((cmd, i) => (
                  <button
                    key={i}
                    onClick={() => handleQuickCommand(cmd)}
                    className="block w-full text-left px-3 py-2 rounded hover:bg-adv-dark-2 text-adv-off-white transition-colors"
                  >
                    {cmd}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Context suggestions (shown when input is empty) */}
          {!input.trim() && (
            <div>
              <p className="text-adv-off-white font-medium mb-2">Suggestions for this page:</p>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => handleQuickCommand(s.cmd)}
                    className="rounded-full bg-adv-teal/10 border border-adv-teal/20 px-3 py-1 text-xs text-adv-teal hover:bg-adv-teal/20 transition-colors"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Static examples (always shown) */}
          <div>
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
            </ul>
          </div>

          <div className="pt-2 border-t border-border text-xs text-adv-gray">
            <p className="flex items-center gap-2">
              <Command className="w-3 h-3" />
              Press <kbd className="px-1.5 py-0.5 bg-adv-dark-2 rounded">Ctrl+K</kbd> to open
              anytime · <kbd className="px-1.5 py-0.5 bg-adv-dark-2 rounded">↑↓</kbd> history ·{' '}
              <kbd className="px-1.5 py-0.5 bg-adv-dark-2 rounded">Esc</kbd> to close
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
