import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Network, Plus, Building2, Globe, BarChart2,
  RefreshCw, Search, Zap, X, ArrowRight,
} from 'lucide-react';
import { fetchWithAuth } from '../../lib/api';
import MarketDisclaimer from '../../components/shared/MarketDisclaimer';

interface Entity {
  id: string;
  name: string;
  entity_type: string;
  symbol: string | null;
  description: string | null;
  atom_count: number;
  is_active: number;
  created_at: string;
}

interface GraphStats {
  totalEntities: number;
  totalRelationships: number;
  byType: Array<{ entity_type: string; count: number }>;
  topEntities: Array<{ name: string; entity_type: string; atom_count: number }>;
}

interface EntityRelationship {
  id: string;
  source_entity_id: string;
  target_entity_id: string;
  relationship_type: string;
  strength: number;
  source_name?: string;
  target_name?: string;
}

interface EntityDetail extends Entity {
  relationships: EntityRelationship[];
}

const TYPE_COLORS: Record<string, string> = {
  company: 'text-adv-blue',
  sector: 'text-adv-teal',
  index: 'text-adv-gold',
  currency: 'text-adv-green',
  commodity: 'text-orange-400',
  etf: 'text-purple-400',
  crypto: 'text-pink-400',
  central_bank: 'text-adv-red',
};

export default function MarketEntitiesPage() {
  const navigate = useNavigate();
  const [entities, setEntities] = useState<Entity[]>([]);
  const [stats, setStats] = useState<GraphStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('company');
  const [newSymbol, setNewSymbol] = useState('');
  const [selectedEntity, setSelectedEntity] = useState<EntityDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (typeFilter) params.set('type', typeFilter);
      const [entRes, statsRes] = await Promise.all([
        fetchWithAuth(`/api/markets/entities?${params}`),
        fetchWithAuth('/api/markets/entities/stats'),
      ]);
      if (entRes.ok) {
        const entRaw = await entRes.json() as Entity[];
        setEntities(entRaw.map(e => ({ ...e, atom_count: Number(e.atom_count) || 0 })));
      }
      if (statsRes.ok) {
        const statsRaw = await statsRes.json() as GraphStats;
        setStats({
          ...statsRaw,
          topEntities: (statsRaw.topEntities || []).map(e => ({ ...e, atom_count: Number(e.atom_count) || 0 })),
        });
      }
    } catch (err) {
      console.error('[MarketEntities] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [query, typeFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleBuildGraph = async () => {
    setBuilding(true);
    try {
      await fetchWithAuth('/api/markets/entities/build-graph', { method: 'POST' });
      fetchData();
    } catch (err) {
      console.error('[MarketEntities] Build error:', err);
    } finally {
      setBuilding(false);
    }
  };

  const handleEntityClick = async (entity: Entity) => {
    if (selectedEntity?.id === entity.id) {
      setSelectedEntity(null);
      return;
    }
    setLoadingDetail(true);
    try {
      const res = await fetchWithAuth(`/api/markets/entities/${entity.id}`);
      if (res.ok) {
        const detailRaw = await res.json() as EntityDetail;
        setSelectedEntity({
          ...detailRaw,
          atom_count: Number(detailRaw.atom_count) || 0,
          relationships: (detailRaw.relationships || []).map(r => ({ ...r, strength: Number(r.strength) || 0 })),
        });
      }
    } catch (err) {
      console.error('[MarketEntities] Detail error:', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim() || !newType) return;
    try {
      await fetchWithAuth('/api/markets/entities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, entityType: newType, symbol: newSymbol || undefined }),
      });
      setShowCreate(false);
      setNewName(''); setNewSymbol('');
      fetchData();
    } catch (err) {
      console.error('[MarketEntities] Create error:', err);
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
              <Network className="h-6 w-6 text-purple-400" />
              Market Entity Graph
            </h1>
            <p className="mt-0.5 text-sm text-adv-gray">Companies, sectors, indices, and their relationships</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={handleBuildGraph} disabled={building}
            className="flex items-center gap-2 rounded-lg border border-adv-card bg-adv-card px-3 py-2 text-sm text-adv-gray hover:text-adv-teal transition-colors disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${building ? 'animate-spin' : ''}`} />
            Build Graph
          </button>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors">
            <Plus className="h-4 w-4" /> Add Entity
          </button>
        </div>
      </div>

      <MarketDisclaimer compact />

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-xl border border-adv-card bg-adv-card p-4">
            <div className="text-2xl font-bold text-adv-off-white">{stats.totalEntities}</div>
            <div className="text-xs text-adv-gray">Entities</div>
          </div>
          <div className="rounded-xl border border-adv-card bg-adv-card p-4">
            <div className="text-2xl font-bold text-adv-off-white">{stats.totalRelationships}</div>
            <div className="text-xs text-adv-gray">Relationships</div>
          </div>
          <div className="rounded-xl border border-adv-card bg-adv-card p-4">
            <div className="text-2xl font-bold text-adv-off-white">{stats.byType.length}</div>
            <div className="text-xs text-adv-gray">Entity Types</div>
          </div>
          <div className="rounded-xl border border-adv-card bg-adv-card p-4">
            <div className="text-2xl font-bold text-adv-teal">{stats.topEntities[0]?.atom_count ?? 0}</div>
            <div className="text-xs text-adv-gray">Max Atoms</div>
          </div>
        </div>
      )}

      {/* Search & Filter */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-adv-gray" />
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search entities..."
            className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 pl-10 pr-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal" />
        </div>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white focus:outline-none focus:border-adv-teal">
          <option value="">All Types</option>
          <option value="company">Company</option>
          <option value="sector">Sector</option>
          <option value="index">Index</option>
          <option value="currency">Currency</option>
          <option value="commodity">Commodity</option>
          <option value="etf">ETF</option>
          <option value="crypto">Crypto</option>
          <option value="central_bank">Central Bank</option>
        </select>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="rounded-xl border border-adv-teal/30 bg-adv-card p-5 space-y-4">
          <h2 className="text-lg font-semibold text-adv-off-white">Add Entity</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Entity name"
              className="rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal" />
            <select value={newType} onChange={(e) => setNewType(e.target.value)} className="rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white focus:outline-none focus:border-adv-teal">
              <option value="company">Company</option>
              <option value="sector">Sector</option>
              <option value="index">Index</option>
              <option value="currency">Currency</option>
              <option value="commodity">Commodity</option>
              <option value="etf">ETF</option>
              <option value="crypto">Crypto</option>
              <option value="central_bank">Central Bank</option>
            </select>
            <input type="text" value={newSymbol} onChange={(e) => setNewSymbol(e.target.value)} placeholder="Symbol (optional)"
              className="rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={!newName.trim()} className="rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50">Add</button>
            <button onClick={() => setShowCreate(false)} className="rounded-lg border border-adv-dark px-4 py-2 text-sm text-adv-gray">Cancel</button>
          </div>
        </div>
      )}

      {/* Entities List */}
      {loading ? (
        <p className="text-sm text-adv-gray">Loading entities...</p>
      ) : entities.length === 0 ? (
        <div className="text-center py-16">
          <Network className="h-12 w-12 text-adv-gray mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-adv-off-white mb-1">No entities yet</h2>
          <p className="text-sm text-adv-gray">Entities are extracted from market atoms or can be added manually</p>
          <button onClick={handleBuildGraph} disabled={building}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${building ? 'animate-spin' : ''}`} />
            Build from Atoms
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {entities.map((entity) => (
            <div key={entity.id}>
              <div
                onClick={() => handleEntityClick(entity)}
                className={`rounded-xl border bg-adv-card p-4 hover:border-adv-teal/30 transition-colors cursor-pointer ${
                  selectedEntity?.id === entity.id ? 'border-adv-teal' : 'border-adv-card'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs font-medium uppercase ${TYPE_COLORS[entity.entity_type] ?? 'text-adv-gray'}`}>
                    {entity.entity_type.replace('_', ' ')}
                  </span>
                  {entity.symbol && (
                    <span className="text-xs font-medium text-adv-off-white bg-adv-dark rounded px-1.5 py-0.5">{entity.symbol}</span>
                  )}
                </div>
                <h3 className="text-sm font-semibold text-adv-off-white">{entity.name}</h3>
                {entity.description && (
                  <p className="mt-1 text-xs text-adv-gray line-clamp-2">{entity.description}</p>
                )}
                <div className="mt-2 flex items-center gap-1 text-xs text-adv-gray">
                  <Zap className="h-3 w-3" />
                  {entity.atom_count} atoms
                </div>
              </div>
              {/* Entity Detail Panel */}
              {selectedEntity?.id === entity.id && (
                <div className="mt-2 rounded-xl border border-adv-teal/30 bg-adv-dark-2 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-adv-off-white">{selectedEntity.name} - Relationships</h3>
                    <button onClick={() => setSelectedEntity(null)} className="text-adv-gray hover:text-adv-off-white">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  {selectedEntity.description && (
                    <p className="text-xs text-adv-gray">{selectedEntity.description}</p>
                  )}
                  {loadingDetail ? (
                    <p className="text-xs text-adv-gray">Loading relationships...</p>
                  ) : selectedEntity.relationships.length === 0 ? (
                    <p className="text-xs text-adv-gray">No relationships found for this entity</p>
                  ) : (
                    <div className="space-y-2">
                      {selectedEntity.relationships.map((rel) => {
                        const isOutgoing = rel.source_entity_id === selectedEntity.id;
                        return (
                          <div key={rel.id} className="flex items-center gap-2 rounded-lg border border-adv-dark bg-adv-dark px-3 py-2 text-xs">
                            <span className="text-adv-off-white font-medium">
                              {isOutgoing ? (rel.target_name || rel.target_entity_id) : (rel.source_name || rel.source_entity_id)}
                            </span>
                            <ArrowRight className={`h-3 w-3 text-adv-teal ${isOutgoing ? '' : 'rotate-180'}`} />
                            <span className="text-adv-teal capitalize">{rel.relationship_type.replace(/_/g, ' ')}</span>
                            <span className="ml-auto text-adv-gray">
                              strength: {(rel.strength * 100).toFixed(0)}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
