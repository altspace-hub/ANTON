import { useState } from 'react';
import { ChevronDown, ChevronRight, Upload, FileText, X } from 'lucide-react';
import type { StructureReference as StructureReferenceType } from '@/stores/useSessionStore';

interface StructureReferenceProps {
  value: StructureReferenceType;
  onChange: (ref: StructureReferenceType) => void;
}

export default function StructureReference({ value, onChange }: StructureReferenceProps) {
  const [expanded, setExpanded] = useState(value.mode !== 'none');

  const handleModeChange = (mode: 'upload' | 'describe') => {
    if (value.mode === mode) {
      onChange({ mode: 'none', description: '' });
    } else {
      onChange({ ...value, mode });
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        onChange({
          mode: 'upload',
          description: reader.result as string,
          fileName: file.name,
        });
      };
      reader.readAsText(file);
    }
  };

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-sm text-adv-gray hover:text-adv-off-white transition-colors"
      >
        {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <span className="font-medium">Structure reference</span>
        <span className="text-[11px] text-adv-gray-med">(optional)</span>
      </button>

      {expanded && (
        <div className="mt-2 rounded-lg border border-border bg-adv-dark-2 p-3">
          <p className="mb-3 text-[11px] text-adv-gray-med">
            Provide an example document or describe the structure you want Claude to follow.
          </p>

          {/* Mode toggle buttons */}
          <div className="mb-3 flex gap-2">
            <button
              onClick={() => handleModeChange('upload')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                value.mode === 'upload'
                  ? 'bg-adv-teal text-adv-dark'
                  : 'border border-border text-adv-gray hover:border-adv-teal hover:text-adv-teal'
              }`}
            >
              <Upload className="h-3 w-3" />
              Upload example
            </button>
            <button
              onClick={() => handleModeChange('describe')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                value.mode === 'describe'
                  ? 'bg-adv-teal text-adv-dark'
                  : 'border border-border text-adv-gray hover:border-adv-teal hover:text-adv-teal'
              }`}
            >
              <FileText className="h-3 w-3" />
              Describe structure
            </button>
          </div>

          {/* Upload mode */}
          {value.mode === 'upload' && (
            <div>
              {value.fileName ? (
                <div className="flex items-center gap-2 rounded-lg border border-adv-teal/30 bg-adv-teal-dim px-3 py-2">
                  <FileText className="h-4 w-4 text-adv-teal" />
                  <span className="flex-1 text-xs text-adv-off-white truncate">{value.fileName}</span>
                  <button
                    onClick={() => onChange({ mode: 'upload', description: '' })}
                    className="text-adv-gray-med hover:text-adv-red transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border p-4 hover:border-adv-teal/30 transition-colors">
                  <Upload className="h-5 w-5 text-adv-gray-med" />
                  <span className="text-xs text-adv-gray-med">Click to upload a reference document</span>
                  <span className="text-[10px] text-adv-gray-med">.docx, .pdf, .md, .txt</span>
                  <input
                    type="file"
                    accept=".docx,.pdf,.md,.txt"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          )}

          {/* Describe mode */}
          {value.mode === 'describe' && (
            <textarea
              value={value.description}
              onChange={(e) => onChange({ ...value, description: e.target.value })}
              placeholder="Describe the document structure you want, e.g.:&#10;- Start with an executive summary (1 page)&#10;- Then a findings table with RAG scoring&#10;- Each finding should have: reference, gap description, severity, recommendation&#10;- End with an appendix of source documents"
              className="w-full rounded-lg border border-border bg-adv-dark p-2.5 text-xs text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none focus:ring-1 focus:ring-adv-teal"
              rows={5}
            />
          )}
        </div>
      )}
    </div>
  );
}
