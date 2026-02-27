/**
 * EngagementSetup.tsx
 * Phase 1: Setup & Context
 * Upload engagement letter / project plan and trigger extraction.
 */

import { useState, useRef } from 'react';
import {
  FileText, Upload, CheckCircle, Loader2, AlertCircle,
  ChevronRight, X, RefreshCw, Briefcase
} from 'lucide-react';
import { getAuthHeader } from '@/lib/api';
import type { EngagementData, EngagementDocument } from '@/pages/EngagementWorkspacePage';

interface Props {
  engagement: EngagementData;
  onUpdate: (updates: Partial<EngagementData>) => void;
  onNext: () => void;
  onReload: () => void;
}

export default function EngagementSetup({ engagement, onUpdate, onNext, onReload }: Props) {
  const [uploading, setUploading] = useState<string | null>(null);
  const [extracting, setExtracting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const letterRef = useRef<HTMLInputElement>(null);
  const planRef = useRef<HTMLInputElement>(null);

  const letterDoc = engagement.documents.find(d => d.document_type === 'engagement_letter');
  const planDoc = engagement.documents.find(d => d.document_type === 'project_plan');

  async function uploadDoc(file: File, docType: string) {
    setUploading(docType);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('document_type', docType);
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
      setUploading(null);
    }
  }

  async function extractDoc(docId: string, docType: string) {
    setExtracting(docId);
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
      setError(`Extraction failed: ${String(e)}`);
    } finally {
      setExtracting(null);
    }
  }

  const hasExtracted = letterDoc && letterDoc.extraction_summary && letterDoc.extraction_summary !== '{}';

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-adv-teal mb-1">Phase 1</p>
        <h2 className="text-xl font-bold text-adv-white">Setup & Context</h2>
        <p className="mt-1 text-sm text-adv-gray">
          Upload the engagement letter and optionally the project plan. ANTON will extract the scope, deliverables, workstreams, assumptions, and boundaries automatically.
        </p>
      </div>

      {/* Context fields */}
      <div className="bg-adv-card border border-border rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-adv-off-white">Engagement Details</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-adv-gray mb-1">Your organisation</label>
            <input
              defaultValue={engagement.your_organisation || ''}
              onBlur={async e => {
                await fetch(`/api/engagements/${engagement.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
                  body: JSON.stringify({ your_organisation: e.target.value }),
                });
                onUpdate({ your_organisation: e.target.value });
              }}
              placeholder="e.g. openEXPERT"
              className="w-full bg-adv-dark-2 border border-border rounded-lg px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray-med focus:outline-none focus:border-adv-teal"
            />
          </div>
          <div>
            <label className="block text-xs text-adv-gray mb-1">Client / Recipient</label>
            <input
              defaultValue={engagement.client_name || ''}
              onBlur={async e => {
                await fetch(`/api/engagements/${engagement.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
                  body: JSON.stringify({ client_name: e.target.value }),
                });
                onUpdate({ client_name: e.target.value });
              }}
              placeholder="e.g. Nordea"
              className="w-full bg-adv-dark-2 border border-border rounded-lg px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray-med focus:outline-none focus:border-adv-teal"
            />
          </div>
        </div>
      </div>

      {/* Engagement Letter upload */}
      <DocUploadCard
        title="Engagement Letter / Contract"
        subtitle="Primary scope document. ANTON will extract scope, deliverables, methodology, assumptions, and governance."
        required
        docType="engagement_letter"
        doc={letterDoc || null}
        uploading={uploading === 'engagement_letter'}
        extracting={extracting === letterDoc?.id}
        inputRef={letterRef}
        onUpload={f => uploadDoc(f, 'engagement_letter')}
        onExtract={() => letterDoc && extractDoc(letterDoc.id, 'engagement_letter')}
      />

      {/* Project Plan upload */}
      <DocUploadCard
        title="Project Plan"
        subtitle="Optional. If provided, ANTON merges it with the engagement letter to build a comprehensive scope view."
        required={false}
        docType="project_plan"
        doc={planDoc || null}
        uploading={uploading === 'project_plan'}
        extracting={extracting === planDoc?.id}
        inputRef={planRef}
        onUpload={f => uploadDoc(f, 'project_plan')}
        onExtract={() => planDoc && extractDoc(planDoc.id, 'project_plan')}
      />

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-adv-red/10 border border-adv-red/30 px-4 py-3 text-sm text-adv-red">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Extraction results preview */}
      {hasExtracted && (
        <ExtractionPreview engagement={engagement} />
      )}

      {/* Next button */}
      <div className="flex justify-end pt-2">
        <button
          onClick={onNext}
          disabled={!letterDoc}
          className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-adv-teal text-adv-dark text-sm font-medium hover:bg-adv-teal-dark disabled:opacity-40 transition-colors"
        >
          {hasExtracted ? 'Review Scope' : letterDoc ? 'Continue Without Extraction' : 'Upload letter to continue'}
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ── DocUploadCard ────────────────────────────────────────────────────────────

interface DocCardProps {
  title: string;
  subtitle: string;
  required: boolean;
  docType: string;
  doc: EngagementDocument | null;
  uploading: boolean;
  extracting: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onUpload: (f: File) => void;
  onExtract: () => void;
}

function DocUploadCard({ title, subtitle, required, docType, doc, uploading, extracting, inputRef, onUpload, onExtract }: DocCardProps) {
  const extracted = doc && doc.extraction_summary && doc.extraction_summary !== '{}';

  return (
    <div className="bg-adv-card border border-border rounded-xl p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-adv-off-white">{title}</h3>
            {required && <span className="text-[10px] text-adv-red">required</span>}
            {!required && <span className="text-[10px] text-adv-gray-med">optional</span>}
          </div>
          <p className="text-xs text-adv-gray leading-relaxed">{subtitle}</p>
        </div>
        {doc && (
          extracted ? (
            <span className="flex items-center gap-1 text-[11px] text-adv-green bg-adv-green/10 border border-adv-green/30 rounded-full px-2 py-0.5">
              <CheckCircle className="h-3 w-3" />
              Extracted
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[11px] text-adv-gold bg-adv-gold/10 border border-adv-gold/30 rounded-full px-2 py-0.5">
              <FileText className="h-3 w-3" />
              Uploaded
            </span>
          )
        )}
      </div>

      {doc ? (
        <div className="mt-4 flex items-center justify-between gap-3 bg-adv-dark-2 rounded-lg px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-4 w-4 text-adv-teal shrink-0" />
            <span className="text-sm text-adv-off-white truncate">{doc.file_name}</span>
          </div>
          {!extracted && (
            <button
              onClick={onExtract}
              disabled={extracting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-adv-teal text-adv-dark text-xs font-medium hover:bg-adv-teal-dark disabled:opacity-60 transition-colors shrink-0"
            >
              {extracting ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Extract with ANTON
            </button>
          )}
          {extracted && (
            <button
              onClick={onExtract}
              disabled={extracting}
              className="flex items-center gap-1 text-xs text-adv-gray hover:text-adv-teal transition-colors"
            >
              {extracting ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Re-extract
            </button>
          )}
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          className="mt-4 border-2 border-dashed border-border hover:border-adv-teal/50 rounded-lg p-6 text-center cursor-pointer transition-colors group"
        >
          {uploading ? (
            <Loader2 className="h-6 w-6 animate-spin text-adv-teal mx-auto" />
          ) : (
            <>
              <Upload className="h-6 w-6 text-adv-gray-med group-hover:text-adv-teal mx-auto mb-2 transition-colors" />
              <p className="text-sm text-adv-gray">
                Click to upload or drag & drop
              </p>
              <p className="text-xs text-adv-gray-med mt-1">PDF, DOCX, XLSX, TXT</p>
            </>
          )}
        </div>
      )}

      <input
        ref={inputRef as unknown as React.RefObject<HTMLInputElement>}
        type="file"
        className="hidden"
        accept=".pdf,.docx,.doc,.txt,.md,.xlsx,.csv"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) onUpload(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}

// ── ExtractionPreview ────────────────────────────────────────────────────────

function ExtractionPreview({ engagement }: { engagement: EngagementData }) {
  const letterDoc = engagement.documents.find(d => d.document_type === 'engagement_letter');
  if (!letterDoc?.extraction_summary) return null;

  let brief: Record<string, unknown> = {};
  try { brief = JSON.parse(letterDoc.extraction_summary); } catch { return null; }

  const scopeItems = Array.isArray(brief.scope_items) ? (brief.scope_items as Array<Record<string, unknown>>) : [];
  const deliverables = Array.isArray(brief.deliverables) ? (brief.deliverables as Array<Record<string, unknown>>) : [];
  const assumptions = Array.isArray(brief.assumptions) ? (brief.assumptions as string[]) : [];

  return (
    <div className="bg-adv-teal-soft border border-adv-teal/20 rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <CheckCircle className="h-4 w-4 text-adv-teal" />
        <span className="text-sm font-semibold text-adv-teal">Extraction Complete</span>
      </div>

      {scopeItems.length > 0 && (
        <div>
          <p className="text-xs font-medium text-adv-off-white mb-2">{scopeItems.length} scope items extracted</p>
          <div className="space-y-1">
            {scopeItems.slice(0, 4).map((si, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-adv-gray">
                <span className="text-adv-teal shrink-0">·</span>
                <span>{String(si.title || '')}</span>
              </div>
            ))}
            {scopeItems.length > 4 && (
              <p className="text-xs text-adv-gray-med ml-3">+{scopeItems.length - 4} more</p>
            )}
          </div>
        </div>
      )}

      {deliverables.length > 0 && (
        <div>
          <p className="text-xs font-medium text-adv-off-white mb-1">{deliverables.length} deliverables</p>
          <div className="flex flex-wrap gap-1">
            {deliverables.slice(0, 4).map((d, i) => (
              <span key={i} className="text-[10px] bg-adv-card border border-border rounded px-2 py-0.5 text-adv-gray">
                {String(d.title || '')} {d.format ? `(${d.format})` : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-adv-gray">
        Review and confirm the extracted scope in the next step.
      </p>
    </div>
  );
}
