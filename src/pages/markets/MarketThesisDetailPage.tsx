import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Lightbulb, Save, Zap, Link2, Unlink, Search,
  CheckCircle2, XCircle, Clock, Target, Edit2, Loader2,
  List, ShieldAlert, ChevronRight,
} from 'lucide-react';
import { fetchWithAuth } from '../../lib/api';
import MarketDisclaimer from '../../components/shared/MarketDisclaimer';
import { ConfidenceMeter, AtomCard } from '../../components/shared/markets';

interface ThesisAtom {
  id: string;
  content: string;
  atom_type: string;
  confidence: number;
  sentiment: string;
}

interface ThesisDetail {
  id: string;
  title: string;
  description: string;
  thesis_type: string;
  status: string;
  confidence: number;
  time_horizon: string;
  success_criteria: string | null;
  key_assumptions: string | null;
  risk_factors: string | null;
  ai_score: number | null;
  ai_analysis: string | null;
  created_at: string;
  updated_at: string;
  atoms?: ThesisAtom[];
}

interface AtomSearchResult {
  id: string;
  content: string;
  atom_type: string;
  confidence: number;
  sentiment: string;
  source?: string;
}

const STATUS_CONFIG: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  draft: { icon: <Edit2 className="h-3.5 w-3.5" />, color: 'text-adv-gray', label: 'Draft' },
  active: { icon: <Target className="h-3.5 w-3.5" />, color: 'text-adv-teal', label: 'Active' },
  monitoring: { icon: <Clock className="h-3.5 w-3.5" />, color: 'text-adv-blue', label: 'Monitoring' },
  validated: { icon: <CheckCircle2 className="h-3.5 w-3.5" />, color: 'text-adv-green', label: 'Validated' },
  invalidated: { icon: <XCircle className="h-3.5 w-3.5" />, color: 'text-adv-red', label: 'Invalidated' },
};

function parseJsonArray(val: string | null): string[] {
  if (!val) return [];
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return val ? [val] : [];
  }
}

export default function MarketThesisDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [thesis, setThesis] = useState<ThesisDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Editable fields
  const [editStatus, setEditStatus] = useState('');
  const [editConfidence, setEditConfidence] = useState(0.5);
  const [saving, setSaving] = useState(false);

  // AI Scoring
  const [scoring, setScoring] = useState(false);
  const [scoreResult, setScoreResult] = useState<{ score: number; analysis: string } | null>(null);

  // Atom linking
  const [showAtomSearch, setShowAtomSearch] = useState(false);
  const [atomSearchQuery, setAtomSearchQuery] = useState('');
  const [atomSearchResults, setAtomSearchResults] = useState<AtomSearchResult[]>([]);
  const [searchingAtoms, setSearchingAtoms] = useState(false);
  const [linkingAtomId, setLinkingAtomId] = useState<string | null>(null);
  const [unlinkingAtomId, setUnlinkingAtomId] = useState<string | null>(null);

  const fetchThesis = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetchWithAuth(`/api/markets/theses/${id}`);
      if (res.ok) {
        const raw = (await res.json()) as ThesisDetail;
        const data = {
          ...raw,
          confidence: Number(raw.confidence) || 0,
          ai_score: raw.ai_score != null ? Number(raw.ai_score) : null,
        };
        setThesis(data);
        setEditStatus(data.status);
        setEditConfidence(data.confidence);
        if (data.ai_score !== null && data.ai_analysis) {
          setScoreResult({ score: data.ai_score, analysis: data.ai_analysis });
        }
      } else {
        setThesis(null);
      }
    } catch (err) {
      console.error('[ThesisDetail] Error:', err);
      setThesis(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchThesis();
  }, [fetchThesis]);

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await fetchWithAuth(`/api/markets/theses/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: editStatus, confidence: editConfidence }),
      });
      fetchThesis();
    } catch (err) {
      console.error('[ThesisDetail] Save error:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleScoreWithAI = async () => {
    if (!id) return;
    setScoring(true);
    try {
      const res = await fetchWithAuth(`/api/markets/theses/${id}/score`, { method: 'POST' });
      if (res.ok) {
        const resultRaw = (await res.json()) as { score: number; analysis: string };
        setScoreResult({ score: Number(resultRaw.score) || 0, analysis: resultRaw.analysis });
        fetchThesis();
      }
    } catch (err) {
      console.error('[ThesisDetail] Score error:', err);
    } finally {
      setScoring(false);
    }
  };

  const handleAtomSearch = async () => {
    if (!atomSearchQuery.trim()) return;
    setSearchingAtoms(true);
    try {
      const res = await fetchWithAuth(`/api/markets/atoms?search=${encodeURIComponent(atomSearchQuery)}`);
      if (res.ok) {
        setAtomSearchResults((await res.json()) as AtomSearchResult[]);
      }
    } catch (err) {
      console.error('[ThesisDetail] Atom search error:', err);
    } finally {
      setSearchingAtoms(false);
    }
  };

  const handleLinkAtom = async (atomId: string) => {
    if (!id) return;
    setLinkingAtomId(atomId);
    try {
      await fetchWithAuth(`/api/markets/theses/${id}/atoms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ atomId }),
      });
      setAtomSearchResults((prev) => prev.filter((a) => a.id !== atomId));
      fetchThesis();
    } catch (err) {
      console.error('[ThesisDetail] Link atom error:', err);
    } finally {
      setLinkingAtomId(null);
    }
  };

  const handleUnlinkAtom = async (atomId: string) => {
    if (!id) return;
    setUnlinkingAtomId(atomId);
    try {
      await fetchWithAuth(`/api/markets/theses/${id}/atoms/${atomId}`, { method: 'DELETE' });
      fetchThesis();
    } catch (err) {
      console.error('[ThesisDetail] Unlink atom error:', err);
    } finally {
      setUnlinkingAtomId(null);
    }
  };

  if (loading) return <div className="p-6 text-adv-gray">Loading thesis...</div>;
  if (!thesis) return <div className="p-6 text-adv-red">Thesis not found</div>;

  const statusCfg = STATUS_CONFIG[thesis.status] ?? STATUS_CONFIG.draft;
  const successCriteria = parseJsonArray(thesis.success_criteria);
  const keyAssumptions = parseJsonArray(thesis.key_assumptions);
  const riskFactors = parseJsonArray(thesis.risk_factors);

  return (
    <div className="min-h-screen p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/markets/theses')}
            className="rounded-lg border border-adv-card bg-adv-card p-2 text-adv-gray hover:text-adv-teal transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-adv-off-white flex items-center gap-3">
              <Lightbulb className="h-6 w-6 text-adv-gold" />
              {thesis.title}
            </h1>
            <p className="mt-0.5 text-sm text-adv-gray">
              Created {new Date(thesis.created_at).toLocaleDateString()} &middot; Updated {new Date(thesis.updated_at).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>

      <MarketDisclaimer compact />

      {/* Status & Metadata */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <div className="rounded-xl border border-adv-card bg-adv-card p-4">
          <div className={`text-2xl font-bold flex items-center gap-2 ${statusCfg.color}`}>
            {statusCfg.icon}
            {statusCfg.label}
          </div>
          <div className="text-xs text-adv-gray">Status</div>
        </div>
        <div className="rounded-xl border border-adv-card bg-adv-card p-4">
          <div className="text-2xl font-bold text-adv-off-white capitalize">{thesis.thesis_type}</div>
          <div className="text-xs text-adv-gray">Thesis Type</div>
        </div>
        <div className="rounded-xl border border-adv-card bg-adv-card p-4">
          <div className="text-2xl font-bold text-adv-off-white capitalize">{thesis.time_horizon}</div>
          <div className="text-xs text-adv-gray">Time Horizon</div>
        </div>
        <div className="rounded-xl border border-adv-card bg-adv-card p-4">
          <div className="mb-1">
            <ConfidenceMeter value={thesis.confidence} size="md" />
          </div>
          <div className="text-xs text-adv-gray">Confidence</div>
        </div>
        {thesis.ai_score !== null && (
          <div className="rounded-xl border border-adv-card bg-adv-card p-4">
            <div className="text-2xl font-bold text-purple-400 flex items-center gap-1">
              <Zap className="h-5 w-5" />
              {Math.round(thesis.ai_score * 100)}
            </div>
            <div className="text-xs text-adv-gray">AI Score</div>
          </div>
        )}
      </div>

      {/* Description */}
      <div className="rounded-xl border border-adv-card bg-adv-card p-4">
        <h2 className="text-lg font-semibold text-adv-off-white mb-2">Description</h2>
        <p className="text-sm text-adv-off-white leading-relaxed whitespace-pre-wrap">{thesis.description}</p>
      </div>

      {/* Success Criteria, Key Assumptions, Risk Factors */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {successCriteria.length > 0 && (
          <div className="rounded-xl border border-adv-card bg-adv-card p-4">
            <h2 className="text-sm font-semibold text-adv-off-white flex items-center gap-2 mb-3">
              <CheckCircle2 className="h-4 w-4 text-adv-green" />
              Success Criteria
            </h2>
            <ul className="space-y-2">
              {successCriteria.map((item, i) => (
                <li key={i} className="rounded-lg border border-adv-dark bg-adv-dark-2 p-3 text-sm text-adv-off-white flex items-start gap-2">
                  <ChevronRight className="h-3.5 w-3.5 text-adv-green mt-0.5 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {keyAssumptions.length > 0 && (
          <div className="rounded-xl border border-adv-card bg-adv-card p-4">
            <h2 className="text-sm font-semibold text-adv-off-white flex items-center gap-2 mb-3">
              <List className="h-4 w-4 text-adv-blue" />
              Key Assumptions
            </h2>
            <ul className="space-y-2">
              {keyAssumptions.map((item, i) => (
                <li key={i} className="rounded-lg border border-adv-dark bg-adv-dark-2 p-3 text-sm text-adv-off-white flex items-start gap-2">
                  <ChevronRight className="h-3.5 w-3.5 text-adv-blue mt-0.5 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {riskFactors.length > 0 && (
          <div className="rounded-xl border border-adv-card bg-adv-card p-4">
            <h2 className="text-sm font-semibold text-adv-off-white flex items-center gap-2 mb-3">
              <ShieldAlert className="h-4 w-4 text-adv-gold" />
              Risk Factors
            </h2>
            <ul className="space-y-2">
              {riskFactors.map((item, i) => (
                <li key={i} className="rounded-lg border border-adv-dark bg-adv-dark-2 p-3 text-sm text-adv-off-white flex items-start gap-2">
                  <ChevronRight className="h-3.5 w-3.5 text-adv-gold mt-0.5 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Edit Status & Confidence */}
      <div className="rounded-xl border border-adv-card bg-adv-card p-4">
        <h2 className="text-lg font-semibold text-adv-off-white mb-4">Update Status & Confidence</h2>
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs text-adv-gray mb-1">Status</label>
            <select
              value={editStatus}
              onChange={(e) => setEditStatus(e.target.value)}
              className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white focus:outline-none focus:border-adv-teal"
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="monitoring">Monitoring</option>
              <option value="validated">Validated</option>
              <option value="invalidated">Invalidated</option>
            </select>
          </div>
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs text-adv-gray mb-1">
              Confidence: {Math.round(editConfidence * 100)}%
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={editConfidence}
              onChange={(e) => setEditConfidence(parseFloat(e.target.value))}
              className="w-full accent-adv-teal"
            />
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </button>
        </div>
      </div>

      {/* AI Scoring */}
      <div className="rounded-xl border border-adv-card bg-adv-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-adv-off-white flex items-center gap-2">
            <Zap className="h-5 w-5 text-purple-400" />
            AI Analysis
          </h2>
          <button
            onClick={handleScoreWithAI}
            disabled={scoring}
            className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 transition-colors disabled:opacity-50"
          >
            {scoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            Score with AI
          </button>
        </div>
        {scoreResult ? (
          <div className="rounded-lg border border-adv-dark bg-adv-dark-2 p-4 space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-sm text-adv-gray">AI Score:</span>
              <span className="text-xl font-bold text-purple-400">{Math.round(scoreResult.score * 100)}/100</span>
            </div>
            <p className="text-sm text-adv-off-white leading-relaxed whitespace-pre-wrap">{scoreResult.analysis}</p>
          </div>
        ) : (
          <p className="text-sm text-adv-gray">Click "Score with AI" to get an AI-powered assessment of this thesis.</p>
        )}
      </div>

      {/* Linked Atoms */}
      <div className="rounded-xl border border-adv-card bg-adv-card p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-adv-off-white flex items-center gap-2">
            <Link2 className="h-5 w-5 text-adv-teal" />
            Linked Atoms
            {thesis.atoms && thesis.atoms.length > 0 && (
              <span className="text-xs text-adv-gray font-normal">({thesis.atoms.length})</span>
            )}
          </h2>
          <button
            onClick={() => setShowAtomSearch(!showAtomSearch)}
            className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
          >
            <Link2 className="h-4 w-4" />
            Link Atom
          </button>
        </div>

        {/* Atom Search */}
        {showAtomSearch && (
          <div className="rounded-lg border border-adv-teal/30 bg-adv-dark-2 p-4 mb-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-adv-gray" />
                <input
                  type="text"
                  value={atomSearchQuery}
                  onChange={(e) => setAtomSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAtomSearch()}
                  placeholder="Search atoms by content..."
                  className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 pl-9 pr-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal"
                />
              </div>
              <button
                onClick={handleAtomSearch}
                disabled={searchingAtoms || !atomSearchQuery.trim()}
                className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50"
              >
                {searchingAtoms ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Search
              </button>
            </div>
            {atomSearchResults.length > 0 && (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {atomSearchResults.map((atom) => {
                  const alreadyLinked = thesis.atoms?.some((a) => a.id === atom.id);
                  return (
                    <div
                      key={atom.id}
                      className="flex items-center gap-3 rounded-lg border border-adv-dark bg-adv-card p-3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-adv-off-white line-clamp-2">{atom.content}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-adv-gray capitalize">{atom.atom_type}</span>
                          <span className="text-xs text-adv-gray">{atom.sentiment}</span>
                        </div>
                      </div>
                      {alreadyLinked ? (
                        <span className="text-xs text-adv-gray">Already linked</span>
                      ) : (
                        <button
                          onClick={() => handleLinkAtom(atom.id)}
                          disabled={linkingAtomId === atom.id}
                          className="shrink-0 flex items-center gap-1.5 rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50"
                        >
                          {linkingAtomId === atom.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Link2 className="h-3.5 w-3.5" />
                          )}
                          Link
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Linked Atom Cards */}
        {thesis.atoms && thesis.atoms.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {thesis.atoms.map((atom) => (
              <div key={atom.id} className="relative">
                <AtomCard atom={atom} compact />
                <button
                  onClick={() => handleUnlinkAtom(atom.id)}
                  disabled={unlinkingAtomId === atom.id}
                  className="absolute top-2 right-2 rounded-md bg-adv-dark/80 p-1 text-adv-gray hover:text-adv-red transition-colors disabled:opacity-50"
                  title="Unlink atom"
                >
                  {unlinkingAtomId === atom.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Unlink className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-adv-gray text-center py-4">
            No atoms linked yet. Use the "Link Atom" button to search and attach evidence.
          </p>
        )}
      </div>
    </div>
  );
}
