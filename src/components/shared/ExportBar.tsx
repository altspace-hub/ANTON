import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, FileSpreadsheet, FileDown, File, Presentation, Share2, Check, Copy, RefreshCw, ChevronDown, Layout } from 'lucide-react';
import ExplainFor from './ExplainFor';

interface BrandTemplate {
  id: string;
  name: string;
  type: 'docx' | 'pptx';
}

interface ExportBarProps {
  content: string;
  availableFormats: string[];
  onExport: (format: string) => void;
  isExporting: boolean;
  sessionId?: string;       // Optional — enables Share button when provided
  onReframe?: () => void;
  moduleContext?: string;   // Optional — module name for ExplainFor context
  entityId?: string;        // Optional — entity ID for saving explained versions
}

const formatConfig: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string }> = {
  md: { icon: FileText, label: '.md' },
  docx: { icon: File, label: '.docx' },
  xlsx: { icon: FileSpreadsheet, label: '.xlsx' },
  pdf: { icon: FileDown, label: '.pdf' },
  pptx: { icon: Presentation, label: '.pptx' },
};

export default function ExportBar({ content, availableFormats, onExport, isExporting, sessionId, onReframe, moduleContext, entityId }: ExportBarProps) {
  const { t } = useTranslation();
  const [shareState, setShareState] = useState<'idle' | 'loading' | 'copied'>('idle');
  const [templates, setTemplates] = useState<BrandTemplate[]>([]);
  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false);
  const [templateExporting, setTemplateExporting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch available brand templates once on mount
  useEffect(() => {
    fetch('/api/templates')
      .then((r) => r.json())
      .then((data) => setTemplates(data as BrandTemplate[]))
      .catch(() => {});
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowTemplateDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!content) return null;

  const handleShare = async () => {
    if (!sessionId || shareState !== 'idle') return;
    setShareState('loading');
    try {
      const res = await fetch(`/api/sessions/${sessionId}/share`, { method: 'POST' });
      if (res.ok) {
        const { token } = await res.json() as { token: string };
        const shareUrl = `${window.location.origin}/share/${token}`;
        await navigator.clipboard.writeText(shareUrl);
        setShareState('copied');
        setTimeout(() => setShareState('idle'), 2500);
      }
    } catch {
      setShareState('idle');
    }
  };

  const handleTemplateExport = async (template: BrandTemplate) => {
    setShowTemplateDropdown(false);
    setTemplateExporting(true);
    try {
      const res = await fetch('/api/export/with-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: template.id,
          content,
          format: template.type,
        }),
      });

      if (!res.ok) {
        const err = await res.json() as { error?: string };
        console.error('[ExportBar] Template export failed:', err.error);
        return;
      }

      // Trigger browser download
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${template.name}-export.${template.type}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[ExportBar] Template export error:', err);
    } finally {
      setTemplateExporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-adv-gray-med">{t('export.export')}</span>
      {availableFormats.map((fmt) => {
        const config = formatConfig[fmt];
        if (!config) return null;
        const Icon = config.icon;
        return (
          <button
            key={fmt}
            onClick={() => onExport(fmt)}
            disabled={isExporting}
            className="flex items-center gap-1.5 rounded-md border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-gray hover:border-adv-teal hover:text-adv-teal transition-colors disabled:opacity-50"
          >
            <Icon className="h-3 w-3" />
            {config.label}
          </button>
        );
      })}

      {/* Export with Template — only shown when at least one template exists */}
      {templates.length > 0 && (
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowTemplateDropdown((v) => !v)}
            disabled={templateExporting || isExporting}
            className="flex items-center gap-1.5 rounded-md border border-adv-teal/40 bg-adv-teal-dim px-2.5 py-1.5 text-xs text-adv-teal hover:border-adv-teal hover:bg-adv-teal/10 transition-colors disabled:opacity-50"
            {...{title: t('export.exportUsingBrandTemplate')}}
          >
            <Layout className="h-3 w-3" />
            {templateExporting ? t('export.exporting') : t('export.withTemplate')}
            <ChevronDown className={`h-3 w-3 transition-transform ${showTemplateDropdown ? 'rotate-180' : ''}`} />
          </button>

          {showTemplateDropdown && (
            <div className="absolute bottom-full left-0 mb-1 z-50 min-w-48 rounded-lg border border-border bg-adv-card shadow-xl">
              <div className="px-3 py-2 border-b border-border">
                <p className="text-xs font-medium text-adv-gray">{t('export.chooseBrandTemplate')}</p>
              </div>
              <div className="py-1">
                {templates.map((tpl) => (
                  <button
                    key={tpl.id}
                    onClick={() => handleTemplateExport(tpl)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-adv-off-white hover:bg-adv-dark-2 transition-colors"
                  >
                    <Layout className="h-3 w-3 text-adv-teal flex-shrink-0" />
                    <span className="flex-1 truncate">{tpl.name}</span>
                    <span className="text-adv-gray-med flex-shrink-0">.{tpl.type}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Share button — only shown when sessionId is provided */}
      {sessionId && (
        <button
          onClick={handleShare}
          disabled={shareState !== 'idle'}
          {...{title: t('export.copyShareableLink')}}
          className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors disabled:opacity-70 ${
            shareState === 'copied'
              ? 'border-adv-green/40 bg-adv-green/10 text-adv-green'
              : 'border-border bg-adv-dark text-adv-gray hover:border-adv-teal hover:text-adv-teal'
          }`}
        >
          {shareState === 'copied' ? (
            <>
              <Check className="h-3 w-3" />
              {t('export.linkCopied')}
            </>
          ) : shareState === 'loading' ? (
            <>
              <Copy className="h-3 w-3 animate-pulse" />
              {t('export.sharing')}
            </>
          ) : (
            <>
              <Share2 className="h-3 w-3" />
              {t('export.share')}
            </>
          )}
        </button>
      )}

      {/* {t('export.explainDifferently')} button (legacy quick-reframe) */}
      {onReframe && (
        <button
          onClick={onReframe}
          className="flex items-center gap-1.5 rounded-md border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-gray hover:border-adv-teal hover:text-adv-teal transition-colors"
        >
          <RefreshCw className="h-3 w-3" />
          Explain Differently
        </button>
      )}
    </div>

    {/* Explain-It-Different: trigger button + slide-out panel (renders below the button row) */}
    <ExplainFor
      content={content}
      moduleContext={moduleContext}
      entityId={entityId}
    />
    </div>
  );
}
