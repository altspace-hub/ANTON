/**
 * EngagementGoodExample.tsx
 * Phase 3a: Good Example Extraction (Quality Blueprint)
 * Upload a previous engagement deliverable and extract quality patterns.
 */

import { useState, useRef } from 'react';
import { Star, Upload, Loader2, RefreshCw, ChevronRight, CheckCircle, FileText, AlertCircle } from 'lucide-react';
import { getAuthHeader } from '@/lib/api';
import type { EngagementData, EngagementDocument } from '@/pages/EngagementWorkspacePage';

interface Props {
  engagement: EngagementData;
  onUpdate: (updates: Partial<EngagementData>) => void;
  onNext: () => void;
  onReload: () => void;
}

interface QualityBlueprint {
  document_structure?: { sections?: string[]; heading_hierarchy?: string; executive_summary_approach?: string };
  language_tone?: { formality_level?: string; confidence_language?: string; technical_jargon_level?: string };
  finding_format?: { structure?: string; severity_scale?: string; detail_level?: string; root_cause_included?: boolean };
  recommendation_style?: { specificity?: string; prioritisation?: string; includes_timeline?: boolean };
  citation_depth?: { regulatory_citation_style?: string; citation_frequency?: string };
  quality_instructions?: string[];
}

export default function EngagementGoodExample({ engagement, onUpdate, onNext, onReload }: Props) {
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const goodExampleDocs = engagement.documents.filter(d => d.document_type === 'good_example');
  const hasBlueprint = engagement.quality_blueprint && engagement.quality_blueprint !== '{}';

  let blueprint: QualityBlueprint = {};
  try { blueprint = hasBlueprint ? JSON.parse(engagement.quality_blueprint) : {}; } catch { /**/ }

  async function uploadGoodExample(file: File) {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('document_type', 'good_example');
      const res = await fetch(`/api/engagements/${engagement.id}/documents`, {
        method: 'POST',
        headers: getAuthHeader(),
        body: fd,
      });
      if (!res.ok) throw new Error(await res.text());
      onReload();
    } catch (e) {
      setError(String(e));
    } finally {
      setUploading(false);
    }
  }

  async function extractBlueprint(docId: string) {
    setExtracting(true);
    setError(null);
    try {
      const res = await fetch(`/api/engagements/${engagement.id}/documents/${docId}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(await res.text());
      onReload();
    } catch (e) {
      setError(`Blueprint extraction failed: ${String(e)}`);
    } finally {
      setExtracting(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-adv-teal mb-1">Phase 3a</p>
        <h2 className="text-xl font-bold text-adv-white">Good Example — Quality Blueprint</h2>
        <p className="mt-1 text-sm text-adv-gray">
          Upload a deliverable from a previous, similar engagement. ANTON will deconstruct it: structure, tone, finding format, citation style, recommendation approach. This becomes the quality standard for the current engagement.
        </p>
        <p className="mt-2 text-xs text-adv-gold bg-adv-gold/10 border border-adv-gold/20 rounded-lg px-3 py-2 inline-block">
          Optional but highly recommended — this is the single most differentiating feature.
        </p>
      </div>

      {/* Upload zone */}
      {goodExampleDocs.length === 0 ? (
        <div
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed border-adv-teal/30 hover:border-adv-teal/60 rounded-xl p-10 text-center cursor-pointer transition-colors"
        >
          {uploading ? (
            <Loader2 className="h-8 w-8 animate-spin text-adv-teal mx-auto" />
          ) : (
            <>
              <Star className="h-10 w-10 text-adv-teal/40 mx-auto mb-3" />
              <p className="text-sm font-medium text-adv-off-white mb-1">Upload a good example deliverable</p>
              <p className="text-xs text-adv-gray">A report, gap analysis, or policy document from a previous engagement</p>
              <p className="text-xs text-adv-gray-med mt-2">PDF, DOCX, TXT</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {goodExampleDocs.map(doc => (
            <GoodExampleDocCard
              key={doc.id}
              doc={doc}
              extracting={extracting}
              onExtract={() => extractBlueprint(doc.id)}
            />
          ))}
          <button
            onClick={() => inputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-border hover:border-adv-teal/50 rounded-xl py-3 text-sm text-adv-gray hover:text-adv-teal transition-colors"
          >
            <Upload className="h-4 w-4" />
            Add another example
          </button>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".pdf,.docx,.doc,.txt,.md"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) uploadGoodExample(f);
          e.target.value = '';
        }}
      />

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-adv-red/10 border border-adv-red/30 px-4 py-3 text-sm text-adv-red">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Blueprint display */}
      {hasBlueprint && Object.keys(blueprint).length > 0 && (
        <div className="bg-adv-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
            <CheckCircle className="h-4 w-4 text-adv-teal" />
            <h3 className="text-sm font-semibold text-adv-teal">Quality Blueprint Extracted</h3>
          </div>
          <div className="p-5 grid grid-cols-2 gap-4">
            {blueprint.language_tone && (
              <BlueprintCard title="Language & Tone">
                <p>Formality: <span className="text-adv-off-white">{blueprint.language_tone.formality_level || '—'}</span></p>
                <p>Confidence language: <span className="text-adv-off-white">{blueprint.language_tone.confidence_language || '—'}</span></p>
                <p>Jargon level: <span className="text-adv-off-white">{blueprint.language_tone.technical_jargon_level || '—'}</span></p>
              </BlueprintCard>
            )}
            {blueprint.finding_format && (
              <BlueprintCard title="Finding Format">
                <p>Structure: <span className="text-adv-off-white">{blueprint.finding_format.structure || '—'}</span></p>
                <p>Severity scale: <span className="text-adv-off-white">{blueprint.finding_format.severity_scale || '—'}</span></p>
                <p>Root cause: <span className="text-adv-off-white">{blueprint.finding_format.root_cause_included ? 'Included' : 'Not included'}</span></p>
              </BlueprintCard>
            )}
            {blueprint.recommendation_style && (
              <BlueprintCard title="Recommendations">
                <p>Specificity: <span className="text-adv-off-white">{blueprint.recommendation_style.specificity || '—'}</span></p>
                <p>Prioritisation: <span className="text-adv-off-white">{blueprint.recommendation_style.prioritisation || '—'}</span></p>
                <p>Timelines: <span className="text-adv-off-white">{blueprint.recommendation_style.includes_timeline ? 'Included' : 'Not included'}</span></p>
              </BlueprintCard>
            )}
            {blueprint.citation_depth && (
              <BlueprintCard title="Citation Depth">
                <p>Style: <span className="text-adv-off-white">{blueprint.citation_depth.regulatory_citation_style || '—'}</span></p>
                <p>Frequency: <span className="text-adv-off-white">{blueprint.citation_depth.citation_frequency || '—'}</span></p>
              </BlueprintCard>
            )}
          </div>
          {blueprint.quality_instructions && blueprint.quality_instructions.length > 0 && (
            <div className="border-t border-border px-5 py-4">
              <p className="text-xs font-semibold text-adv-off-white mb-2">Quality Instructions ({blueprint.quality_instructions.length})</p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {blueprint.quality_instructions.map((qi, i) => (
                  <p key={i} className="text-xs text-adv-gray flex items-start gap-1.5">
                    <span className="text-adv-teal shrink-0">·</span>{qi}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Skip option */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={onNext}
          className="text-sm text-adv-gray hover:text-adv-off-white transition-colors"
        >
          Skip — proceed without a blueprint
        </button>
        <button
          onClick={onNext}
          className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-adv-teal text-adv-dark text-sm font-medium hover:bg-adv-teal-dark transition-colors"
        >
          {hasBlueprint ? 'Blueprint Ready — Continue' : 'Continue to Execution'}
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function GoodExampleDocCard({ doc, extracting, onExtract }: { doc: EngagementDocument; extracting: boolean; onExtract: () => void }) {
  const extracted = doc.extraction_summary && doc.extraction_summary !== '{}';
  return (
    <div className="bg-adv-card border border-border rounded-xl p-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <FileText className="h-4 w-4 text-adv-teal shrink-0" />
        <span className="text-sm text-adv-off-white truncate">{doc.file_name}</span>
        {extracted && (
          <span className="flex items-center gap-1 text-[10px] text-adv-green bg-adv-green/10 border border-adv-green/30 rounded-full px-2 py-0.5 shrink-0">
            <CheckCircle className="h-2.5 w-2.5" />Blueprint
          </span>
        )}
      </div>
      {!extracted ? (
        <button
          onClick={onExtract}
          disabled={extracting}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-adv-teal text-adv-dark text-xs font-medium hover:bg-adv-teal-dark disabled:opacity-60 transition-colors shrink-0"
        >
          {extracting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Star className="h-3 w-3" />}
          Extract Blueprint
        </button>
      ) : (
        <button
          onClick={onExtract}
          disabled={extracting}
          className="flex items-center gap-1 text-xs text-adv-gray hover:text-adv-teal transition-colors shrink-0"
        >
          {extracting ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Re-extract
        </button>
      )}
    </div>
  );
}

function BlueprintCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-adv-dark-2 rounded-lg p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-adv-teal mb-2">{title}</p>
      <div className="space-y-1 text-xs text-adv-gray">{children}</div>
    </div>
  );
}
