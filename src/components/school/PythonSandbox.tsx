import { useState, useRef } from 'react';
import { Play, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Props {
  code: string;
}

let workerInstance: Worker | null = null;
let workerReady = false;

function getWorker(): Worker {
  if (!workerInstance) {
    workerInstance = new Worker(new URL('../../workers/pyodide-worker.ts', import.meta.url), { type: 'module' });
    workerReady = false;
  }
  return workerInstance;
}

export default function PythonSandbox({ code }: Props) {
  const { t } = useTranslation('school');
  const [output, setOutput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function runCode() {
    setLoading(true);
    setOutput(null);
    setError(null);

    const worker = getWorker();

    const handleMessage = (e: MessageEvent<{ ok: boolean; output?: string; error?: string }>) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setLoading(false);
      worker.removeEventListener('message', handleMessage);
      if (e.data.ok) {
        setOutput(e.data.output ?? '(no output)');
      } else {
        setError(e.data.error ?? 'Unknown error');
      }
    };

    worker.addEventListener('message', handleMessage);

    // 10-second timeout
    timeoutRef.current = setTimeout(() => {
      worker.removeEventListener('message', handleMessage);
      setLoading(false);
      setError('Execution timed out (10s). Try a shorter snippet.');
      // Restart worker
      worker.terminate();
      workerInstance = null;
    }, 10000);

    worker.postMessage({ code });
  }

  return (
    <div className="mt-2 rounded-lg border border-adv-teal/20 bg-adv-dark overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs text-adv-teal font-medium">🐍 Python {t('coding.sandbox', 'Sandbox')}</span>
        <button
          type="button"
          onClick={runCode}
          disabled={loading}
          className="flex items-center gap-1.5 rounded bg-adv-teal px-3 py-1 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-40 transition-colors"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
          {loading ? t('coding.runningPython', 'Running...') : t('coding.runPython', 'Run Python')}
        </button>
      </div>
      {loading && !output && !error && (
        <div className="px-3 py-2 text-xs text-adv-gray-med">
          {!workerReady ? t('coding.loadingPyodide', 'Loading Python environment (first run)...') : t('coding.runningPython', 'Running...')}
        </div>
      )}
      {output !== null && (
        <pre className="px-3 py-2 text-xs text-adv-off-white font-mono whitespace-pre-wrap">{output}</pre>
      )}
      {error && (
        <pre className="px-3 py-2 text-xs text-adv-red font-mono whitespace-pre-wrap">{error}</pre>
      )}
    </div>
  );
}
