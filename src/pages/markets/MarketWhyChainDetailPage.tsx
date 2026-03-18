import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, GitBranch, Plus, CheckCircle2, Clock, ChevronDown, ChevronUp,
} from 'lucide-react';
import { fetchWithAuth } from '../../lib/api';
import MarketDisclaimer from '../../components/shared/MarketDisclaimer';

interface WhyLevel {
  id: string;
  level_number: number;
  question: string;
  answer: string;
  level_type: string;
  evidence_atoms: string | null;
  created_at: string;
}

interface WhyChainDetail {
  id: string;
  title: string;
  direction: string;
  status: string;
  trigger_event: string | null;
  root_cause_type: string | null;
  root_cause_description: string | null;
  impact_assessment: string | null;
  blind_spots: string | null;
  process_improvements: string | null;
  created_at: string;
  updated_at: string;
  levels: WhyLevel[];
}

const LEVEL_TYPE_COLORS: Record<string, string> = {
  systemic: 'text-adv-red bg-adv-red/10',
  human_error: 'text-adv-gold bg-adv-gold/10',
  process_failure: 'text-orange-400 bg-orange-400/10',
  external: 'text-adv-blue bg-adv-blue/10',
  information_gap: 'text-purple-400 bg-purple-400/10',
};

export default function MarketWhyChainDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [chain, setChain] = useState<WhyChainDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Add Level form
  const [showAddLevel, setShowAddLevel] = useState(false);
  const [newQuestion, setNewQuestion] = useState('');
  const [newAnswer, setNewAnswer] = useState('');
  const [newLevelType, setNewLevelType] = useState('systemic');

  // Complete form
  const [showComplete, setShowComplete] = useState(false);
  const [rootCauseType, setRootCauseType] = useState('systemic');
  const [rootCauseDescription, setRootCauseDescription] = useState('');
  const [impactAssessment, setImpactAssessment] = useState('');
  const [blindSpots, setBlindSpots] = useState('');
  const [processImprovements, setProcessImprovements] = useState('');

  const fetchChain = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetchWithAuth(`/api/markets/why-chains/${id}`);
      if (!res.ok) throw new Error('Failed to load chain');
      setChain(await res.json() as WhyChainDetail);
    } catch (err) {
      console.error('[MarketWhyChainDetail] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchChain(); }, [fetchChain]);

  const handleAddLevel = async () => {
    if (!id || !newQuestion.trim() || !newAnswer.trim()) return;
    try {
      await fetchWithAuth(`/api/markets/why-chains/${id}/levels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: newQuestion,
          answer: newAnswer,
          levelType: newLevelType,
        }),
      });
      setShowAddLevel(false);
      setNewQuestion('');
      setNewAnswer('');
      fetchChain();
    } catch (err) {
      console.error('[MarketWhyChainDetail] Add level error:', err);
    }
  };

  const handleComplete = async () => {
    if (!id || !rootCauseDescription.trim()) return;
    try {
      await fetchWithAuth(`/api/markets/why-chains/${id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rootCauseType,
          rootCauseDescription,
          impactAssessment: impactAssessment || undefined,
          blindSpots: blindSpots || undefined,
          processImprovements: processImprovements || undefined,
        }),
      });
      setShowComplete(false);
      fetchChain();
    } catch (err) {
      console.error('[MarketWhyChainDetail] Complete error:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen p-6">
        <p className="text-sm text-adv-gray">Loading chain...</p>
      </div>
    );
  }

  if (!chain) {
    return (
      <div className="min-h-screen p-6 space-y-6">
        <button onClick={() => navigate('/markets/why-chains')} className="rounded-lg border border-adv-card bg-adv-card p-2 text-adv-gray hover:text-adv-teal transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="text-center py-16">
          <GitBranch className="h-12 w-12 text-adv-gray mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-adv-off-white mb-1">Chain not found</h2>
          <p className="text-sm text-adv-gray">This why chain may have been deleted</p>
        </div>
      </div>
    );
  }

  const isInProgress = chain.status === 'in_progress';

  return (
    <div className="min-h-screen p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/markets/why-chains')} className="rounded-lg border border-adv-card bg-adv-card p-2 text-adv-gray hover:text-adv-teal transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-adv-off-white flex items-center gap-3">
              <GitBranch className="h-6 w-6 text-orange-400" />
              {chain.title}
            </h1>
            <p className="mt-0.5 text-sm text-adv-gray">Why chain root cause analysis</p>
          </div>
        </div>
        {isInProgress && (
          <div className="flex gap-2">
            <button onClick={() => setShowAddLevel(true)}
              className="flex items-center gap-2 rounded-lg border border-adv-card bg-adv-card px-3 py-2 text-sm text-adv-gray hover:text-adv-teal transition-colors">
              <Plus className="h-4 w-4" /> Add Level
            </button>
            <button onClick={() => setShowComplete(true)}
              className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors">
              <CheckCircle2 className="h-4 w-4" /> Complete Chain
            </button>
          </div>
        )}
      </div>

      <MarketDisclaimer compact />

      {/* Chain Metadata */}
      <div className="rounded-xl border border-adv-card bg-adv-card p-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-adv-gray mb-1">Direction</div>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
              chain.direction === 'failure_analysis' ? 'text-adv-red bg-adv-red/10' : 'text-adv-green bg-adv-green/10'
            }`}>
              {chain.direction.replace('_', ' ')}
            </span>
          </div>
          <div>
            <div className="text-xs text-adv-gray mb-1">Status</div>
            <span className={`flex items-center gap-1 text-sm font-medium ${isInProgress ? 'text-adv-gold' : 'text-adv-green'}`}>
              {isInProgress ? <Clock className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              {isInProgress ? 'In Progress' : 'Completed'}
            </span>
          </div>
          <div>
            <div className="text-xs text-adv-gray mb-1">Levels</div>
            <div className="text-sm font-medium text-adv-off-white">{chain.levels?.length ?? 0}</div>
          </div>
          <div>
            <div className="text-xs text-adv-gray mb-1">Created</div>
            <div className="text-sm text-adv-off-white">{new Date(chain.created_at).toLocaleDateString()}</div>
          </div>
        </div>
        {chain.trigger_event && (
          <div className="mt-4 pt-4 border-t border-adv-dark">
            <div className="text-xs text-adv-gray mb-1">Trigger Event</div>
            <p className="text-sm text-adv-off-white">{chain.trigger_event}</p>
          </div>
        )}
      </div>

      {/* Levels Timeline */}
      <div>
        <h2 className="text-lg font-semibold text-adv-off-white mb-4">Analysis Levels</h2>
        {(!chain.levels || chain.levels.length === 0) ? (
          <div className="text-center py-8">
            <p className="text-sm text-adv-gray">No levels added yet. Start by asking "Why?"</p>
          </div>
        ) : (
          <div className="space-y-0">
            {chain.levels.map((level, idx) => {
              const typeColor = LEVEL_TYPE_COLORS[level.level_type] ?? 'text-adv-gray bg-adv-gray/10';
              const isLast = idx === chain.levels.length - 1;
              return (
                <div key={level.id} className="flex gap-4">
                  {/* Timeline connector */}
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 rounded-full border-2 border-adv-teal bg-adv-dark-2 flex items-center justify-center text-xs font-bold text-adv-teal shrink-0">
                      {level.level_number}
                    </div>
                    {!isLast && <div className="w-0.5 flex-1 bg-adv-card min-h-[20px]" />}
                  </div>
                  {/* Level card */}
                  <div className="rounded-xl border border-adv-card bg-adv-card p-4 mb-3 flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${typeColor}`}>
                        {level.level_type.replace(/_/g, ' ')}
                      </span>
                      <span className="text-xs text-adv-gray">{new Date(level.created_at).toLocaleDateString()}</span>
                    </div>
                    <div className="mb-2">
                      <div className="text-xs text-adv-gray mb-0.5">Question</div>
                      <p className="text-sm font-medium text-adv-off-white">{level.question}</p>
                    </div>
                    <div>
                      <div className="text-xs text-adv-gray mb-0.5">Answer</div>
                      <p className="text-sm text-adv-off-white">{level.answer}</p>
                    </div>
                    {level.evidence_atoms && (
                      <div className="mt-2 pt-2 border-t border-adv-dark">
                        <div className="text-xs text-adv-gray">Evidence atoms: {level.evidence_atoms}</div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Level Form */}
      {showAddLevel && (
        <div className="rounded-xl border border-adv-teal/30 bg-adv-card p-5 space-y-4">
          <h2 className="text-lg font-semibold text-adv-off-white">Add Level</h2>
          <input type="text" value={newQuestion} onChange={(e) => setNewQuestion(e.target.value)} placeholder="Why did this happen? (question)"
            className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal" />
          <textarea value={newAnswer} onChange={(e) => setNewAnswer(e.target.value)} placeholder="Because... (answer)"
            rows={3} className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal" />
          <select value={newLevelType} onChange={(e) => setNewLevelType(e.target.value)}
            className="rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white focus:outline-none focus:border-adv-teal">
            <option value="systemic">Systemic</option>
            <option value="human_error">Human Error</option>
            <option value="process_failure">Process Failure</option>
            <option value="external">External</option>
            <option value="information_gap">Information Gap</option>
          </select>
          <div className="flex gap-2">
            <button onClick={handleAddLevel} disabled={!newQuestion.trim() || !newAnswer.trim()} className="rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50">Add Level</button>
            <button onClick={() => setShowAddLevel(false)} className="rounded-lg border border-adv-dark px-4 py-2 text-sm text-adv-gray hover:text-adv-off-white">Cancel</button>
          </div>
        </div>
      )}

      {/* Complete Chain Form */}
      {showComplete && isInProgress && (
        <div className="rounded-xl border border-adv-teal/30 bg-adv-card p-5 space-y-4">
          <h2 className="text-lg font-semibold text-adv-off-white">Complete Chain</h2>
          <select value={rootCauseType} onChange={(e) => setRootCauseType(e.target.value)}
            className="rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white focus:outline-none focus:border-adv-teal">
            <option value="systemic">Systemic</option>
            <option value="human_error">Human Error</option>
            <option value="process_failure">Process Failure</option>
            <option value="external">External</option>
            <option value="information_gap">Information Gap</option>
          </select>
          <textarea value={rootCauseDescription} onChange={(e) => setRootCauseDescription(e.target.value)} placeholder="Root cause description — what is the fundamental reason?"
            rows={3} className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal" />
          <textarea value={impactAssessment} onChange={(e) => setImpactAssessment(e.target.value)} placeholder="Impact assessment — what was the impact of this root cause?"
            rows={2} className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal" />
          <textarea value={blindSpots} onChange={(e) => setBlindSpots(e.target.value)} placeholder="Blind spots — what did we miss or fail to anticipate?"
            rows={2} className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal" />
          <textarea value={processImprovements} onChange={(e) => setProcessImprovements(e.target.value)} placeholder="Process improvements — what should we change going forward?"
            rows={2} className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal" />
          <div className="flex gap-2">
            <button onClick={handleComplete} disabled={!rootCauseDescription.trim()} className="rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50">Complete Chain</button>
            <button onClick={() => setShowComplete(false)} className="rounded-lg border border-adv-dark px-4 py-2 text-sm text-adv-gray hover:text-adv-off-white">Cancel</button>
          </div>
        </div>
      )}

      {/* Completed Root Cause Summary */}
      {!isInProgress && chain.root_cause_description && (
        <div className="rounded-xl border border-adv-green/30 bg-adv-green/5 p-5 space-y-3">
          <h2 className="text-lg font-semibold text-adv-green flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" /> Root Cause Conclusion
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-adv-gray mb-1">Root Cause Type</div>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                LEVEL_TYPE_COLORS[chain.root_cause_type ?? ''] ?? 'text-adv-gray bg-adv-gray/10'
              }`}>
                {(chain.root_cause_type ?? '').replace(/_/g, ' ')}
              </span>
            </div>
            <div>
              <div className="text-xs text-adv-gray mb-1">Root Cause</div>
              <p className="text-sm text-adv-off-white">{chain.root_cause_description}</p>
            </div>
          </div>
          {chain.impact_assessment && (
            <div>
              <div className="text-xs text-adv-gray mb-1">Impact Assessment</div>
              <p className="text-sm text-adv-off-white">{chain.impact_assessment}</p>
            </div>
          )}
          {chain.blind_spots && (
            <div>
              <div className="text-xs text-adv-gray mb-1">Blind Spots</div>
              <p className="text-sm text-adv-off-white">{chain.blind_spots}</p>
            </div>
          )}
          {chain.process_improvements && (
            <div>
              <div className="text-xs text-adv-gray mb-1">Process Improvements</div>
              <p className="text-sm text-adv-off-white">{chain.process_improvements}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
