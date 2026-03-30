import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Zap, Plus, X, RefreshCw, Search,
  ChevronDown, ChevronUp, FileText,
} from 'lucide-react';
import { fetchWithAuth } from '../../lib/api';
import MarketDisclaimer from '../../components/shared/MarketDisclaimer';
import { AtomCard } from '../../components/shared/markets';

interface Atom {
  id: string;
  atom_type: string;
  content: string;
  confidence: number;
  sentiment: string;
  category: string | null;
  source?: string | undefined;
  tags: string | null;
  is_active: number;
  created_at: string;
}

export default function MarketAtomsPage() {
  const navigate = useNavigate();
  const [atoms, setAtoms] = useState<Atom[]>([]);
  const [loading, setLoading] = useState(true);
  const [decaying, setDecaying] = useState(false);

  // Filters
  const [atomTypeFilter, setAtomTypeFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sentimentFilter, setSentimentFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newAtomType, setNewAtomType] = useState('fact');
  const [newCategory, setNewCategory] = useState('');
  const [newSentiment, setNewSentiment] = useState('neutral');
  const [newConfidence, setNewConfidence] = useState(0.5);
  const [newTags, setNewTags] = useState('');

  // Extract section
  const [showExtract, setShowExtract] = useState(false);
  const [extractText, setExtractText] = useState('');
  const [extracting, setExtracting] = useState(false);

  const fetchAtoms = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (atomTypeFilter) params.set('atom_type', atomTypeFilter);
      if (categoryFilter) params.set('category', categoryFilter);
      if (sentimentFilter) params.set('sentiment', sentimentFilter);
      if (searchQuery) params.set('q', searchQuery);
      const res = await fetchWithAuth(`/api/markets/atoms?${params}`);
      if (!res.ok) throw new Error('Failed to load atoms');
      const atomsRaw = await res.json() as Atom[];
      setAtoms(atomsRaw.map(a => ({ ...a, confidence: Number(a.confidence) || 0 })));
    } catch (err) {
      console.error('[MarketAtoms] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [atomTypeFilter, categoryFilter, sentimentFilter, searchQuery]);

  useEffect(() => { fetchAtoms(); }, [fetchAtoms]);

  const handleCreate = async () => {
    if (!newContent.trim()) return;
    try {
      await fetchWithAuth('/api/markets/atoms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: newContent,
          atomType: newAtomType,
          category: newCategory || undefined,
          sentiment: newSentiment,
          confidence: newConfidence,
          tags: newTags ? newTags.split(',').map((t) => t.trim()) : [],
        }),
      });
      setShowCreate(false);
      setNewContent('');
      setNewCategory('');
      setNewTags('');
      setNewConfidence(0.5);
      fetchAtoms();
    } catch (err) {
      console.error('[MarketAtoms] Create error:', err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetchWithAuth(`/api/markets/atoms/${id}`, { method: 'DELETE' });
      fetchAtoms();
    } catch (err) {
      console.error('[MarketAtoms] Delete error:', err);
    }
  };

  const handleDecay = async () => {
    setDecaying(true);
    try {
      await fetchWithAuth('/api/markets/atoms/decay', { method: 'POST' });
      fetchAtoms();
    } catch (err) {
      console.error('[MarketAtoms] Decay error:', err);
    } finally {
      setDecaying(false);
    }
  };

  const handleExtract = async () => {
    if (!extractText.trim()) return;
    setExtracting(true);
    try {
      await fetchWithAuth('/api/markets/extract-atoms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: extractText, sourceId: 'manual' }),
      });
      setShowExtract(false);
      setExtractText('');
      fetchAtoms();
    } catch (err) {
      console.error('[MarketAtoms] Extract error:', err);
    } finally {
      setExtracting(false);
    }
  };

  return (
    <div className="min-h-screen p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/markets')} className="rounded-lg border border-adv-card bg-adv-card p-2 text-adv-gray hover:text-adv-teal transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-adv-off-white flex items-center gap-3">
              <Zap className="h-6 w-6 text-adv-teal" />
              Market Atoms
            </h1>
            <p className="mt-0.5 text-sm text-adv-gray">Atomic units of market intelligence — facts, signals, insights, events</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={handleDecay} disabled={decaying}
            className="flex items-center gap-2 rounded-lg border border-adv-card bg-adv-card px-3 py-2 text-sm text-adv-gray hover:text-adv-teal transition-colors disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${decaying ? 'animate-spin' : ''}`} />
            Run Decay
          </button>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors">
            <Plus className="h-4 w-4" /> New Atom
          </button>
        </div>
      </div>

      <MarketDisclaimer compact />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-adv-card bg-adv-card p-4">
          <div className="text-2xl font-bold text-adv-off-white">{atoms.length}</div>
          <div className="text-xs text-adv-gray">Total Atoms</div>
        </div>
        <div className="rounded-xl border border-adv-card bg-adv-card p-4">
          <div className="text-2xl font-bold text-adv-teal">{atoms.filter((a) => a.atom_type === 'signal').length}</div>
          <div className="text-xs text-adv-gray">Signals</div>
        </div>
        <div className="rounded-xl border border-adv-card bg-adv-card p-4">
          <div className="text-2xl font-bold text-adv-gold">{atoms.filter((a) => a.atom_type === 'insight').length}</div>
          <div className="text-xs text-adv-gray">Insights</div>
        </div>
        <div className="rounded-xl border border-adv-card bg-adv-card p-4">
          <div className="text-2xl font-bold text-adv-blue">{atoms.filter((a) => a.atom_type === 'fact').length}</div>
          <div className="text-xs text-adv-gray">Facts</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select value={atomTypeFilter} onChange={(e) => setAtomTypeFilter(e.target.value)}
          className="rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white focus:outline-none focus:border-adv-teal">
          <option value="">All Types</option>
          <option value="fact">Fact</option>
          <option value="signal">Signal</option>
          <option value="insight">Insight</option>
          <option value="event">Event</option>
          <option value="outcome">Outcome</option>
        </select>
        <input type="text" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} placeholder="Category..."
          className="rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal" />
        <select value={sentimentFilter} onChange={(e) => setSentimentFilter(e.target.value)}
          className="rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white focus:outline-none focus:border-adv-teal">
          <option value="">All Sentiments</option>
          <option value="bullish">Bullish</option>
          <option value="bearish">Bearish</option>
          <option value="neutral">Neutral</option>
          <option value="mixed">Mixed</option>
        </select>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-adv-gray" />
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search atoms..."
            className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 pl-10 pr-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal" />
        </div>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="rounded-xl border border-adv-teal/30 bg-adv-card p-5 space-y-4">
          <h2 className="text-lg font-semibold text-adv-off-white">New Atom</h2>
          <textarea value={newContent} onChange={(e) => setNewContent(e.target.value)} placeholder="Atom content — a single fact, signal, insight, or event..."
            rows={3} className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <select value={newAtomType} onChange={(e) => setNewAtomType(e.target.value)}
              className="rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white focus:outline-none focus:border-adv-teal">
              <option value="fact">Fact</option>
              <option value="signal">Signal</option>
              <option value="insight">Insight</option>
              <option value="event">Event</option>
              <option value="outcome">Outcome</option>
            </select>
            <input type="text" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="Category"
              className="rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal" />
            <select value={newSentiment} onChange={(e) => setNewSentiment(e.target.value)}
              className="rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white focus:outline-none focus:border-adv-teal">
              <option value="neutral">Neutral</option>
              <option value="bullish">Bullish</option>
              <option value="bearish">Bearish</option>
              <option value="mixed">Mixed</option>
            </select>
            <div className="flex items-center gap-2">
              <label className="text-xs text-adv-gray whitespace-nowrap">Confidence: {Math.round(newConfidence * 100)}%</label>
              <input type="range" min="0" max="1" step="0.05" value={newConfidence} onChange={(e) => setNewConfidence(parseFloat(e.target.value))}
                className="flex-1 accent-adv-teal" />
            </div>
          </div>
          <input type="text" value={newTags} onChange={(e) => setNewTags(e.target.value)} placeholder="Tags (comma-separated)"
            className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal" />
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={!newContent.trim()} className="rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50">Create</button>
            <button onClick={() => setShowCreate(false)} className="rounded-lg border border-adv-dark px-4 py-2 text-sm text-adv-gray hover:text-adv-off-white">Cancel</button>
          </div>
        </div>
      )}

      {/* Extract from Text */}
      <div className="rounded-xl border border-adv-card bg-adv-card">
        <button onClick={() => setShowExtract(!showExtract)}
          className="flex w-full items-center justify-between p-4 text-sm font-medium text-adv-off-white hover:text-adv-teal transition-colors">
          <span className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Extract Atoms from Text
          </span>
          {showExtract ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {showExtract && (
          <div className="border-t border-adv-dark px-4 pb-4 pt-3 space-y-3">
            <textarea value={extractText} onChange={(e) => setExtractText(e.target.value)}
              placeholder="Paste market text here — articles, reports, notes — and ANTON will extract atomic facts, signals, and insights..."
              rows={5} className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal" />
            <button onClick={handleExtract} disabled={!extractText.trim() || extracting}
              className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50 transition-colors">
              {extracting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              {extracting ? 'Extracting...' : 'Extract Atoms'}
            </button>
          </div>
        )}
      </div>

      {/* Atoms Grid */}
      {loading ? (
        <p className="text-sm text-adv-gray">Loading atoms...</p>
      ) : atoms.length === 0 ? (
        <div className="text-center py-16">
          <Zap className="h-12 w-12 text-adv-gray mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-adv-off-white mb-1">No atoms yet</h2>
          <p className="text-sm text-adv-gray">Create atoms manually or extract them from text</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {atoms.map((atom) => (
            <div key={atom.id} className="relative group">
              <AtomCard atom={atom} />
              <button
                onClick={() => handleDelete(atom.id)}
                className="absolute top-2 right-2 rounded-full p-1 text-adv-gray opacity-0 group-hover:opacity-100 hover:text-adv-red hover:bg-adv-dark-2 transition-all"
                title="Deactivate atom"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
