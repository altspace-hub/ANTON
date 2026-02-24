import { useState } from 'react';
import { Copy, Check, FileCode, ChevronDown, ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';

interface CodeViewerProps {
  code: string;
  language?: string;
  filename?: string;
  showLineNumbers?: boolean;
  maxHeight?: string;
  diffMode?: boolean;
  diffOld?: string;
  className?: string;
}

export default function CodeViewer({
  code,
  language = 'typescript',
  filename,
  showLineNumbers = true,
  maxHeight = '500px',
  diffMode = false,
  diffOld,
  className = '',
}: CodeViewerProps) {
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const lines = code.split('\n');

  return (
    <div className={`rounded-lg border border-border bg-adv-dark overflow-hidden ${className}`}>
      {/* Header */}
      {filename && (
        <div className="flex items-center justify-between border-b border-border bg-adv-dark-2 px-3 py-2">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center gap-2 text-sm text-adv-off-white hover:text-adv-teal transition-colors"
          >
            {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            <FileCode className="h-3.5 w-3.5 text-adv-gray" />
            <span className="font-mono text-xs">{filename}</span>
          </button>
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-adv-gray">{language}</span>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-adv-gray hover:text-adv-teal hover:bg-adv-card transition-colors"
            >
              {copied ? <Check className="h-3 w-3 text-adv-green" /> : <Copy className="h-3 w-3" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {/* Code Content */}
      {!collapsed && (
        <div className="overflow-auto" style={{ maxHeight }}>
          {diffMode && diffOld ? (
            <DiffView oldCode={diffOld} newCode={code} />
          ) : showLineNumbers ? (
            <table className="w-full font-mono text-xs">
              <tbody>
                {lines.map((line, i) => (
                  <tr key={i} className="hover:bg-adv-card/50">
                    <td className="w-10 select-none border-r border-border px-2 py-0.5 text-right text-adv-gray-med">
                      {i + 1}
                    </td>
                    <td className="px-3 py-0.5 whitespace-pre text-adv-off-white">{line}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-4">
              <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
                {`\`\`\`${language}\n${code}\n\`\`\``}
              </ReactMarkdown>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DiffView({ oldCode, newCode }: { oldCode: string; newCode: string }) {
  const oldLines = oldCode.split('\n');
  const newLines = newCode.split('\n');
  const maxLen = Math.max(oldLines.length, newLines.length);

  return (
    <table className="w-full font-mono text-xs">
      <tbody>
        {Array.from({ length: maxLen }, (_, i) => {
          const oldLine = oldLines[i] ?? '';
          const newLine = newLines[i] ?? '';
          const isAdded = i >= oldLines.length;
          const isRemoved = i >= newLines.length;
          const isChanged = !isAdded && !isRemoved && oldLine !== newLine;

          return (
            <tr
              key={i}
              className={
                isAdded ? 'bg-adv-green/10' :
                isRemoved ? 'bg-adv-red/10' :
                isChanged ? 'bg-adv-gold/10' : 'hover:bg-adv-card/50'
              }
            >
              <td className="w-8 select-none border-r border-border px-2 py-0.5 text-right text-adv-gray-med">
                {!isAdded ? i + 1 : ''}
              </td>
              <td className="w-8 select-none border-r border-border px-2 py-0.5 text-right text-adv-gray-med">
                {!isRemoved ? i + 1 : ''}
              </td>
              <td className="w-4 select-none px-1 py-0.5 text-center">
                {isAdded ? <span className="text-adv-green">+</span> :
                 isRemoved ? <span className="text-adv-red">-</span> :
                 isChanged ? <span className="text-adv-gold">~</span> : ''}
              </td>
              <td className="px-3 py-0.5 whitespace-pre text-adv-off-white">
                {isRemoved ? oldLine : newLine}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
