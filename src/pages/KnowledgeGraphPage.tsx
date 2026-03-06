import { useState, useEffect } from 'react';
import { Network, RefreshCw, Search, GitMerge, Clock, Download, Edit2, Trash2, MoreVertical } from 'lucide-react';
import KnowledgeGraphViewer from '../features/intelligence/KnowledgeGraphViewer';
import { EntityMergeModal } from '../features/intelligence/EntityMergeModal';
import { GraphAnalyticsPanel } from '../features/intelligence/GraphAnalyticsPanel';

interface EntityNode {
  id: string;
  entity_type: string;
  entity_id: string;
  canonical_name: string;
  interaction_count: number;
  first_seen: string;
  last_seen: string;
  source?: 'workflow' | 'pack' | 'manual';
  pack_id?: string | null;
}

interface MergeLogEntry {
  id: string;
  entity_type: string;
  merged_from: string;
  merged_into: string;
  merge_reason: string;
  merged_at: string;
  merged_by: string;
}

export default function KnowledgeGraphPage() {
  const [topEntities, setTopEntities] = useState<EntityNode[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<EntityNode | null>(null);
  const [entityDetails, setEntityDetails] = useState<any>(null);
  const [mergeLog, setMergeLog] = useState<MergeLogEntry[]>([]);
  const [maxDepth, setMaxDepth] = useState(2);
  const [building, setBuilding] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [entityMenuOpen, setEntityMenuOpen] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<'all' | 'workflow' | 'pack' | 'manual'>('all');

  useEffect(() => {
    fetchTopEntities();
    fetchMergeLog();
  }, []);

  async function fetchTopEntities() {
    try {
      const response = await fetch('/api/knowledge-graph/entities');
      const data = await response.json();
      // Ensure data is an array
      const entities = Array.isArray(data) ? data : [];
      setTopEntities(entities);
      if (entities.length > 0 && !selectedEntity) {
        selectEntity(entities[0]);
      }
    } catch (error) {
      console.error('Failed to fetch entities:', error);
      setTopEntities([]); // Set to empty array on error
    }
  }

  async function fetchMergeLog() {
    try {
      const response = await fetch('/api/knowledge-graph/merge-log?limit=10');
      const data = await response.json();
      setMergeLog(data);
    } catch (error) {
      console.error('Failed to fetch merge log:', error);
    }
  }

  async function selectEntity(entity: EntityNode) {
    setSelectedEntity(entity);
    try {
      const response = await fetch(
        `/api/knowledge-graph/entities/${encodeURIComponent(entity.entity_type)}/${encodeURIComponent(entity.entity_id)}?depth=1`
      );
      const data = await response.json();
      setEntityDetails(data);
    } catch (error) {
      console.error('Failed to fetch entity details:', error);
    }
  }

  async function buildGraph() {
    try {
      setBuilding(true);
      const response = await fetch('/api/knowledge-graph/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minAtomCount: 1, sinceDays: 365 }),
      });
      const result = await response.json();
      alert(
        `Graph rebuilt!\n\nNodes created: ${result.nodesCreated}\nRelationships created: ${result.relationshipsCreated}\nTotal nodes: ${result.totalNodes}\nTotal relationships: ${result.totalRelationships}`
      );
      fetchTopEntities();
      fetchMergeLog();
    } catch (error) {
      console.error('Failed to build graph:', error);
      alert('Failed to rebuild graph');
    } finally {
      setBuilding(false);
    }
  }

  async function handleMerge(fromId: string, intoId: string, reason: string) {
    if (!selectedEntity) return;

    const response = await fetch('/api/knowledge-graph/entities/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entityType: selectedEntity.entity_type,
        fromId,
        intoId,
        reason,
      }),
    });

    if (!response.ok) throw new Error('Merge failed');

    // Refresh data
    await fetchTopEntities();
    await fetchMergeLog();

    // Select the merged-into entity if it exists
    const newEntity = topEntities.find(
      (e) => e.entity_type === selectedEntity.entity_type && e.entity_id === intoId
    );
    if (newEntity) {
      selectEntity(newEntity);
    }
  }

  function exportGraph(format: 'json' | 'graphml' | 'csv-nodes' | 'csv-edges') {
    window.open(`/api/knowledge-graph/export?format=${format}`, '_blank');
  }

  async function handleDelete() {
    if (!selectedEntity) return;
    if (!confirm(`Delete entity "${selectedEntity.canonical_name}"? This will remove all references.`)) {
      return;
    }

    try {
      // Note: Delete endpoint would need to be implemented on backend
      // For now, just show a message
      alert('Entity deletion would be implemented here. Backend endpoint needed.');
      setEntityMenuOpen(false);
    } catch (error) {
      console.error('Delete failed:', error);
      alert('Delete failed');
    }
  }

  function handleAnalyticsEntityClick(entityType: string, entityId: string) {
    const entity = topEntities.find((e) => e.entity_type === entityType && e.entity_id === entityId);
    if (entity) {
      selectEntity(entity);
    }
  }

  const filteredEntities = (topEntities || []).filter(e => {
    const matchesSearch =
      e.canonical_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.entity_type.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSource =
      sourceFilter === 'all' ||
      (e.source ?? 'workflow') === sourceFilter;
    return matchesSearch && matchesSource;
  });

  const packEntityCount = (topEntities || []).filter((e) => e.source === 'pack').length;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-adv-teal-dim rounded-lg">
            <Network className="w-6 h-6 text-adv-teal" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-adv-white">Knowledge Graph</h1>
            <p className="text-sm text-adv-gray">Visualize entity relationships across workflows</p>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <button
              onClick={() => setEntityMenuOpen(!entityMenuOpen)}
              className="px-4 py-2 bg-adv-card hover:bg-adv-dark-2 border border-adv-gray/20 text-adv-white rounded flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
            {entityMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-adv-card border border-adv-gray/20 rounded shadow-xl z-10">
                <button
                  onClick={() => {
                    exportGraph('json');
                    setEntityMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-adv-dark-2 text-adv-white text-sm"
                >
                  Export as JSON
                </button>
                <button
                  onClick={() => {
                    exportGraph('graphml');
                    setEntityMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-adv-dark-2 text-adv-white text-sm"
                >
                  Export as GraphML
                </button>
                <button
                  onClick={() => {
                    exportGraph('csv-nodes');
                    setEntityMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-adv-dark-2 text-adv-white text-sm"
                >
                  Export Nodes (CSV)
                </button>
                <button
                  onClick={() => {
                    exportGraph('csv-edges');
                    setEntityMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-adv-dark-2 text-adv-white text-sm"
                >
                  Export Edges (CSV)
                </button>
              </div>
            )}
          </div>
          <button
            onClick={buildGraph}
            disabled={building}
            className="px-4 py-2 bg-adv-teal hover:bg-adv-teal-dark text-white rounded flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${building ? 'animate-spin' : ''}`} />
            {building ? 'Rebuilding...' : 'Rebuild Graph'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4 flex-1 min-h-0">
        {/* Left sidebar: Entity list */}
        <div className="col-span-2 flex flex-col gap-4 overflow-hidden">
          {/* Search + Source filter */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-adv-gray" />
              <input
                type="text"
                placeholder="Search entities..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-adv-card border border-adv-gray/20 rounded text-adv-white placeholder-adv-gray focus:outline-none focus:border-adv-teal"
              />
            </div>
            <div className="flex gap-1">
              {(['all', 'workflow', 'pack', 'manual'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setSourceFilter(f)}
                  className={`flex-1 px-2 py-1 text-xs rounded transition-colors ${
                    sourceFilter === f
                      ? 'bg-adv-teal text-white'
                      : 'bg-adv-card text-adv-gray hover:text-adv-off-white border border-adv-gray/20'
                  }`}
                >
                  {f === 'all' ? 'All' : f === 'workflow' ? 'Workflow' : f === 'pack' ? `Pack${packEntityCount > 0 ? ` (${packEntityCount})` : ''}` : 'Manual'}
                </button>
              ))}
            </div>
          </div>

          {/* Top entities */}
          <div className="bg-adv-card rounded-lg flex-1 overflow-hidden flex flex-col">
            <div className="p-3 border-b border-adv-gray/20">
              <h3 className="font-semibold text-adv-white text-sm">Top Entities</h3>
              <p className="text-xs text-adv-gray">By interaction count</p>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {filteredEntities.map(entity => (
                <button
                  key={entity.id}
                  onClick={() => selectEntity(entity)}
                  className={`w-full text-left p-3 rounded transition ${
                    selectedEntity?.id === entity.id
                      ? 'bg-adv-teal-dim text-adv-white'
                      : 'hover:bg-adv-dark-2 text-adv-gray'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-sm">{entity.canonical_name}</span>
                    {entity.source === 'pack' && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-adv-teal/15 text-adv-teal rounded border border-adv-teal/20 flex-shrink-0">Pack</span>
                    )}
                  </div>
                  <div className="text-xs opacity-70 flex items-center justify-between mt-1">
                    <span className="capitalize">{entity.entity_type}</span>
                    <span>{entity.interaction_count} interactions</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Merge log */}
          <div className="bg-adv-card rounded-lg max-h-64 overflow-hidden flex flex-col">
            <div className="p-3 border-b border-adv-gray/20">
              <h3 className="font-semibold text-adv-white text-sm flex items-center gap-2">
                <GitMerge className="w-4 h-4" />
                Recent Merges
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {mergeLog.length === 0 ? (
                <p className="text-xs text-adv-gray p-2">No merges yet</p>
              ) : (
                mergeLog.map(entry => (
                  <div key={entry.id} className="p-2 bg-adv-dark-2 rounded text-xs">
                    <div className="text-adv-white font-medium">{entry.merged_from}</div>
                    <div className="text-adv-gray">→ {entry.merged_into}</div>
                    <div className="text-adv-gray/70 mt-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(entry.merged_at).toLocaleDateString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Center: Graph visualization */}
        <div className="col-span-5 bg-adv-card rounded-lg p-4 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-adv-white">
                {selectedEntity?.canonical_name || 'Select an entity'}
              </h3>
              {selectedEntity && (
                <p className="text-sm text-adv-gray capitalize">{selectedEntity.entity_type}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-adv-gray">Depth:</label>
              <select
                value={maxDepth}
                onChange={e => setMaxDepth(parseInt(e.target.value))}
                className="px-3 py-1 bg-adv-dark-2 border border-adv-gray/20 rounded text-adv-white text-sm"
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
              </select>
            </div>
          </div>
          <div className="flex-1 min-h-0">
            {selectedEntity ? (
              <KnowledgeGraphViewer
                key={`${selectedEntity.entity_type}:${selectedEntity.entity_id}:${maxDepth}`}
                centerEntityType={selectedEntity.entity_type}
                centerEntityId={selectedEntity.entity_id}
                maxDepth={maxDepth}
                onNodeClick={node => {
                  const entity = topEntities.find(
                    e => e.entity_type === node.entity_type && e.entity_id === node.entity_id
                  );
                  if (entity) selectEntity(entity);
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-adv-gray">
                Select an entity from the list to visualize its network
              </div>
            )}
          </div>
        </div>

        {/* Right sidebar: Entity details */}
        <div className="col-span-2 bg-adv-card rounded-lg p-4 overflow-hidden flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-adv-white">Entity Details</h3>
            {selectedEntity && (
              <div className="flex gap-1">
                <button
                  onClick={() => setMergeModalOpen(true)}
                  className="p-1.5 bg-adv-dark-2 hover:bg-adv-teal-dim rounded text-adv-gray hover:text-adv-teal transition"
                  title="Merge entity"
                >
                  <GitMerge className="w-4 h-4" />
                </button>
                <button
                  onClick={handleDelete}
                  className="p-1.5 bg-adv-dark-2 hover:bg-red-900/30 rounded text-adv-gray hover:text-red-400 transition"
                  title="Delete entity"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
          <div>
            {selectedEntity ? (
              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-adv-gray">Type:</span>
                  <span className="text-adv-white ml-2 capitalize">{selectedEntity.entity_type}</span>
                </div>
                <div>
                  <span className="text-adv-gray">Interactions:</span>
                  <span className="text-adv-white ml-2">{selectedEntity.interaction_count}</span>
                </div>
                <div>
                  <span className="text-adv-gray">First seen:</span>
                  <span className="text-adv-white ml-2">
                    {new Date(selectedEntity.first_seen).toLocaleDateString()}
                  </span>
                </div>
                <div>
                  <span className="text-adv-gray">Last seen:</span>
                  <span className="text-adv-white ml-2">
                    {new Date(selectedEntity.last_seen).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-adv-gray">No entity selected</p>
            )}
          </div>

          {entityDetails && entityDetails.neighbors.length > 0 && (
            <div className="flex-1 overflow-hidden flex flex-col">
              <h3 className="font-semibold text-adv-white mb-3">Connected Entities</h3>
              <div className="flex-1 overflow-y-auto space-y-2">
                {entityDetails.neighbors.slice(0, 10).map((neighbor: any, i: number) => (
                  <div key={i} className="p-2 bg-adv-dark-2 rounded text-xs">
                    <div className="text-adv-white font-medium capitalize">{neighbor.type}</div>
                    <div className="text-adv-gray">{neighbor.relationship_type}</div>
                    <div className="text-adv-gray/70 mt-1">
                      Strength: {neighbor.strength.toFixed(2)} · Observations: {neighbor.observation_count}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {entityDetails && entityDetails.atoms && entityDetails.atoms.length > 0 && (
            <div className="flex-1 overflow-hidden flex flex-col">
              <h3 className="font-semibold text-adv-white mb-3">Related Knowledge</h3>
              <div className="flex-1 overflow-y-auto space-y-2">
                {entityDetails.atoms.slice(0, 5).map((atom: any) => (
                  <div key={atom.id} className="p-2 bg-adv-dark-2 rounded text-xs">
                    <div className="text-adv-white line-clamp-2">{atom.content}</div>
                    <div className="text-adv-gray/70 mt-1">
                      {atom.category} · {new Date(atom.created_at).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Analytics panel */}
        <div className="col-span-3 overflow-hidden">
          <GraphAnalyticsPanel onEntityClick={handleAnalyticsEntityClick} />
        </div>
      </div>

      {/* Merge Modal */}
      {mergeModalOpen && selectedEntity && (
        <EntityMergeModal
          fromEntity={selectedEntity}
          entities={topEntities}
          onClose={() => setMergeModalOpen(false)}
          onMerge={handleMerge}
        />
      )}
    </div>
  );
}
