import { getFormatsByCategory, CATEGORY_LABELS, getRecommendedExportFormats } from '@/lib/output-format-definitions';
import HelpTooltip from './HelpTooltip';
import { FileText } from 'lucide-react';
import { useSessionStore } from '@/stores/useSessionStore';

interface OutputFormatSelectorProps {
  selected: string[];
  onChange: (selected: string[]) => void;
}

export default function OutputFormatSelector({ selected, onChange }: OutputFormatSelectorProps) {
  const plainTextMode = useSessionStore((state) => state.plainTextMode);
  const setPlainTextMode = useSessionStore((state) => state.setPlainTextMode);
  const grouped = getFormatsByCategory();
  const categoryOrder = ['strategic', 'analytical', 'operational', 'scoring', 'communication', 'planning'];

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  const recommendedExports = getRecommendedExportFormats(selected);

  // Estimate token savings when plain text mode is enabled
  const estimateTokenSavings = (formats: string[]): number => {
    // Each format adds ~250-400 tokens on average
    return formats.length * 300;
  };

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-medium text-adv-off-white">What should Claude produce?</span>
        <HelpTooltip text="Click to select. Multiple formats = multiple deliverables in one response." />
      </div>

      <div className="space-y-3 rounded-lg border border-border bg-adv-card p-3">
        {/* Plain Text Mode Toggle */}
        <div className="mb-3 rounded-lg border border-border bg-adv-dark-2 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-adv-teal" />
              <span className="text-sm font-medium text-adv-off-white">Plain Text Mode</span>
              <HelpTooltip text="Skip structured formatting and get natural Claude responses. Saves ~25-50% tokens." />
            </div>
            <button
              onClick={() => setPlainTextMode(!plainTextMode)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                plainTextMode ? 'bg-adv-teal' : 'bg-adv-gray-med/30'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  plainTextMode ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          {plainTextMode && (
            <p className="mt-2 text-xs text-adv-gray">
              Output formats disabled. Claude will respond naturally without structured formatting.
              Token savings: ~{estimateTokenSavings(selected)} tokens
            </p>
          )}
        </div>
        <div className={plainTextMode ? 'pointer-events-none opacity-40' : ''}>
          {categoryOrder.map((cat) => {
            const formats = grouped[cat];
            if (!formats) return null;

            return (
              <div key={cat}>
                <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-adv-gray-med">
                  {CATEGORY_LABELS[cat]}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {formats.map((fmt) => {
                    const isSelected = selected.includes(fmt.id);
                    return (
                      <button
                        key={fmt.id}
                        onClick={() => toggle(fmt.id)}
                        className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition-all ${
                          isSelected
                            ? 'border-adv-teal bg-adv-teal-dim text-adv-teal shadow-sm shadow-adv-teal/10'
                            : 'border-border bg-adv-dark text-adv-gray hover:border-adv-gray-med hover:text-adv-off-white'
                        }`}
                        title={fmt.description}
                      >
                        {fmt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        {selected.length > 0 && (
          <div className="border-t border-border pt-2 text-[11px] text-adv-gray-med">
            <span className="text-adv-off-white">{selected.length}</span> format{selected.length !== 1 ? 's' : ''} selected
            {recommendedExports.length > 0 && (
              <span className="ml-2">
                Best export: {recommendedExports.map((e) => `.${e}`).join(' ')}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
