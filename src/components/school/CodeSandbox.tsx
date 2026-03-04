import { useState, useRef } from 'react';
import { Play, Copy, Maximize2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Props {
  code: string;
  language: 'html' | 'css' | 'js';
}

function buildSandboxDoc(code: string, language: 'html' | 'css' | 'js'): string {
  if (language === 'html') return code;
  if (language === 'css') return `<!DOCTYPE html><html><head><style>${code}</style></head><body><div id="preview"></div></body></html>`;
  // js
  return `<!DOCTYPE html><html><head></head><body><div id="output" style="font-family:monospace;padding:8px;"></div><script>
const _log = console.log;
console.log = (...args) => { document.getElementById('output').innerHTML += args.join(' ') + '<br>'; _log(...args); };
try { ${code} } catch(e) { document.getElementById('output').innerHTML = '<span style="color:red">Error: ' + e.message + '</span>'; }
<\/script></body></html>`;
}

export default function CodeSandbox({ code, language }: Props) {
  const { t } = useTranslation('school');
  const [sandboxDoc, setSandboxDoc] = useState('');
  const [copied, setCopied] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  function runCode() {
    setSandboxDoc(buildSandboxDoc(code, language));
  }

  function handleCopy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className={`rounded-lg border border-adv-teal/20 bg-adv-dark overflow-hidden ${fullscreen ? 'fixed inset-4 z-50' : ''}`}>
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs text-adv-teal font-medium uppercase tracking-wide">
          {language.toUpperCase()} {t('coding.sandbox', 'Sandbox')}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-adv-gray hover:text-adv-off-white transition-colors"
          >
            <Copy className="h-3 w-3" />
            {copied ? t('coding.copied', 'Copied!') : t('coding.copy', 'Copy')}
          </button>
          <button
            type="button"
            onClick={() => setFullscreen(f => !f)}
            className="rounded p-1 text-adv-gray hover:text-adv-off-white transition-colors"
            aria-label="Toggle fullscreen"
          >
            <Maximize2 className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={runCode}
            className="flex items-center gap-1.5 rounded bg-adv-teal px-3 py-1 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
          >
            <Play className="h-3 w-3" />
            {t('coding.run', 'Run')}
          </button>
        </div>
      </div>
      {sandboxDoc ? (
        <iframe
          ref={iframeRef}
          srcDoc={sandboxDoc}
          sandbox="allow-scripts allow-same-origin"
          className="w-full bg-white"
          style={{ height: fullscreen ? 'calc(100% - 2.5rem)' : '280px' }}
          title="Code output"
        />
      ) : (
        <div className="flex items-center justify-center h-16 text-xs text-adv-gray-med">
          {t('coding.clickRun', 'Click Run to preview')}
        </div>
      )}
    </div>
  );
}
