/**
 * SynthesisPanel — convergence + conclusion UI.
 *
 * Renders:
 *  • when status='converging':
 *      - Queen: "Generate synthesis draft" → preview → "Conclude" button
 *      - Participants: Approve / Dissent actions (dissent requires content)
 *  • when status='concluded':
 *      - Final synthesis text (Markdown rendered as <pre>)
 *      - Dissents list with attribution
 *      - Approval breakdown
 *      - "Export as .anton bundle" download button
 */

import { useState, useEffect, useCallback } from 'react';
import { Sparkles, Check, AlertOctagon, Download, RefreshCcw, AlertCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { fetchWithAuth, getAuthHeader } from '../../lib/api';

interface DissentRecord {
  contributor_hash: string;
  contributor_display_name: string;
  content: string;
  created_at: string;
}

interface HiveOutput {
  id: string;
  output_type: string;
  synthesis_text: string | null;
  dissents: DissentRecord[];
  participant_approvals: Record<string, 'approved' | 'dissented' | 'abstained'>;
  created_at: string;
}

interface SynthesisDraftResponse {
  synthesis: string;
  reasoning: string;
  dissents: DissentRecord[];
}

type HiveStatus = 'forming' | 'active' | 'converging' | 'concluded' | 'archived';

interface SynthesisPanelProps {
  hiveId: string;
  hiveStatus: HiveStatus;
  isQueen: boolean;
  isParticipantNonObserver: boolean;
  onChanged: () => void;
  participantsByHash: Record<string, { display_name: string; role: string }>;
}

export default function SynthesisPanel({ hiveId, hiveStatus, isQueen, isParticipantNonObserver, onChanged, participantsByHash }: SynthesisPanelProps) {
  const [output, setOutput] = useState<HiveOutput | null>(null);
  const [loadingOutput, setLoadingOutput] = useState(false);
  const [draft, setDraft] = useState<SynthesisDraftResponse | null>(null);
  const [draftEdited, setDraftEdited] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [concluding, setConcluding] = useState(false);
  const [actioning, setActioning] = useState(false);
  const [dissentText, setDissentText] = useState('');
  const [showDissent, setShowDissent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOutput = useCallback(async () => {
    if (hiveStatus !== 'concluded') { setOutput(null); return; }
    setLoadingOutput(true);
    try {
      const res = await fetchWithAuth(`/api/beehive/hives/${hiveId}/output`, { headers: getAuthHeader() });
      if (res.ok) {
        const data = await res.json();
        setOutput(data.output);
      }
    } catch { /* silent */ }
    finally { setLoadingOutput(false); }
  }, [hiveId, hiveStatus]);

  useEffect(() => { void loadOutput(); }, [loadOutput]);

  async function generateDraft() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/beehive/hives/${hiveId}/synthesis-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setDraft(data.draft);
      setDraftEdited(data.draft.synthesis);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }

  async function approve() {
    setActioning(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/beehive/hives/${hiveId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActioning(false);
    }
  }

  async function submitDissent() {
    if (!dissentText.trim()) return;
    setActioning(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/beehive/hives/${hiveId}/dissent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ content: dissentText.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setDissentText('');
      setShowDissent(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActioning(false);
    }
  }

  async function conclude() {
    if (!confirm('Conclude this hive? The synthesis becomes the final output and the hive is locked.')) return;
    setConcluding(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      if (draftEdited && draftEdited.trim() && draft && draftEdited !== draft.synthesis) {
        body.synthesis_override = draftEdited.trim();
      }
      const res = await fetchWithAuth(`/api/beehive/hives/${hiveId}/conclude`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setDraft(null);
      setDraftEdited(null);
      onChanged();
      void loadOutput();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setConcluding(false);
    }
  }

  function downloadBundle() {
    const url = `/api/beehive/hives/${hiveId}/output/export`;
    window.open(url, '_blank');
  }

  if (hiveStatus !== 'converging' && hiveStatus !== 'concluded') return null;

  return (
    <div className="rounded-xl border border-adv-teal/30 bg-adv-teal/5 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-adv-teal/20 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-adv-teal flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5" />
          {hiveStatus === 'concluded' ? 'Final synthesis' : 'Convergence'}
        </h3>
        {hiveStatus === 'concluded' && output && (
          <button
            onClick={downloadBundle}
            className="rounded border border-adv-teal/40 bg-adv-teal/10 px-2.5 py-1 text-[11px] text-adv-teal hover:bg-adv-teal/20 inline-flex items-center gap-1.5"
          >
            <Download className="h-3 w-3" />
            Download .anton
          </button>
        )}
      </div>

      {error && (
        <div className="mx-4 mt-3 rounded border border-adv-red/30 bg-adv-red/10 px-2 py-1.5 text-[11px] text-adv-red flex items-center gap-1.5">
          <AlertCircle className="h-3 w-3 shrink-0" />
          {error}
        </div>
      )}

      {/* CONVERGING state */}
      {hiveStatus === 'converging' && (
        <div className="px-4 py-3 space-y-3">
          {!draft && isQueen && (
            <button
              onClick={generateDraft}
              disabled={generating}
              className="w-full rounded-lg border border-adv-teal/40 px-3 py-2 text-xs text-adv-teal hover:bg-adv-teal/10 inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Sparkles className={`h-3.5 w-3.5 ${generating ? 'animate-pulse' : ''}`} />
              {generating ? 'Drafting synthesis with Opus 4.7…' : 'Generate synthesis draft'}
            </button>
          )}

          {!draft && !isQueen && (
            <p className="text-xs text-adv-gray italic">Waiting for the Queen to draft the synthesis.</p>
          )}

          {draft && (
            <>
              <div className="text-[10px] uppercase tracking-wider text-adv-teal font-semibold">Draft synthesis</div>
              <textarea
                value={draftEdited ?? ''}
                onChange={(e) => setDraftEdited(e.target.value)}
                rows={14}
                className="w-full rounded-lg border border-adv-teal/30 bg-adv-dark px-3 py-2 text-xs text-adv-off-white font-mono leading-relaxed focus:border-adv-teal focus:outline-none"
              />
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={generateDraft}
                  disabled={generating || concluding}
                  className="rounded border border-border px-2.5 py-1 text-[11px] text-adv-gray hover:text-adv-off-white disabled:opacity-50 inline-flex items-center gap-1"
                >
                  <RefreshCcw className={`h-3 w-3 ${generating ? 'animate-spin' : ''}`} />
                  Regenerate
                </button>
                {isQueen && (
                  <button
                    onClick={conclude}
                    disabled={concluding || generating}
                    className="rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50 inline-flex items-center gap-1.5"
                  >
                    <Check className="h-3.5 w-3.5" />
                    {concluding ? 'Concluding…' : 'Conclude hive'}
                  </button>
                )}
              </div>
              {draft.dissents.length > 0 && (
                <div className="text-[11px] text-adv-gray italic">
                  ⚠ {draft.dissents.length} formal dissent{draft.dissents.length === 1 ? '' : 's'} will be preserved in the final output.
                </div>
              )}
            </>
          )}

          {/* Approve / Dissent for participants */}
          {isParticipantNonObserver && (
            <div className="pt-3 border-t border-adv-teal/20 space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-adv-gray font-semibold">Your position on the synthesis</div>
              <div className="flex items-center gap-2">
                <button
                  onClick={approve}
                  disabled={actioning}
                  className="rounded border border-adv-green/40 bg-adv-green/10 px-2.5 py-1 text-[11px] text-adv-green hover:bg-adv-green/20 inline-flex items-center gap-1 disabled:opacity-50"
                >
                  <Check className="h-3 w-3" />
                  Approve
                </button>
                <button
                  onClick={() => setShowDissent(!showDissent)}
                  className="rounded border border-adv-red/40 bg-adv-red/10 px-2.5 py-1 text-[11px] text-adv-red hover:bg-adv-red/20 inline-flex items-center gap-1"
                >
                  <AlertOctagon className="h-3 w-3" />
                  {showDissent ? 'Cancel dissent' : 'Formally dissent'}
                </button>
              </div>
              {showDissent && (
                <div className="space-y-2 pt-2">
                  <textarea
                    value={dissentText}
                    onChange={(e) => setDissentText(e.target.value)}
                    placeholder="Explain your dissent — be specific. This will appear in the final output with full attribution and will not be averaged away."
                    rows={4}
                    maxLength={20000}
                    className="w-full rounded-lg border border-adv-red/30 bg-adv-dark px-3 py-2 text-xs text-adv-off-white placeholder:text-adv-gray/60 focus:border-adv-red focus:outline-none"
                  />
                  <div className="flex justify-end">
                    <button
                      onClick={submitDissent}
                      disabled={actioning || !dissentText.trim()}
                      className="rounded bg-adv-red px-3 py-1 text-[11px] font-medium text-white hover:bg-adv-red/80 disabled:opacity-50 inline-flex items-center gap-1"
                    >
                      <AlertOctagon className="h-3 w-3" />
                      Submit dissent
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* CONCLUDED state */}
      {hiveStatus === 'concluded' && (
        <div className="px-4 py-3 space-y-3">
          {loadingOutput && !output && <p className="text-xs text-adv-gray italic">Loading output…</p>}
          {output && (
            <>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-adv-teal font-semibold mb-1">Synthesis</div>
                <div className="rounded-lg border border-border bg-adv-dark p-4 max-h-[500px] overflow-y-auto prose prose-invert prose-sm max-w-none prose-headings:text-adv-off-white prose-p:text-adv-off-white prose-strong:text-adv-teal prose-a:text-adv-teal prose-code:text-adv-teal prose-li:text-adv-off-white">
                  {output.synthesis_text
                    ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{output.synthesis_text}</ReactMarkdown>
                    : <p className="text-xs text-adv-gray italic">(no synthesis text)</p>}
                </div>
              </div>

              {output.dissents.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-adv-red font-semibold mb-1">
                    Dissenting positions ({output.dissents.length})
                  </div>
                  <ul className="space-y-2">
                    {output.dissents.map((d, i) => (
                      <li key={i} className="rounded border border-adv-red/30 bg-adv-red/5 px-3 py-2">
                        <div className="text-[11px] font-medium text-adv-red mb-1">{d.contributor_display_name}</div>
                        <p className="text-xs text-adv-off-white whitespace-pre-wrap">{d.content}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <div className="text-[10px] uppercase tracking-wider text-adv-gray font-semibold mb-1">Approvals</div>
                <ul className="grid grid-cols-2 gap-1 text-[11px]">
                  {Object.entries(output.participant_approvals).map(([hash, status]) => {
                    const name = participantsByHash[hash]?.display_name ?? hash.slice(-12);
                    const cls = status === 'approved' ? 'text-adv-green' : status === 'dissented' ? 'text-adv-red' : 'text-adv-gray';
                    return (
                      <li key={hash} className={cls}>
                        <span className="text-adv-off-white">{name}</span> — {status}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
