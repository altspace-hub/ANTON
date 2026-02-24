import React, { useState, useEffect } from 'react';
import { TrendingUp, Users, BarChart3, GitBranch, Loader2 } from 'lucide-react';

interface AnalyticsProps {
  onEntityClick?: (entityType: string, entityId: string) => void;
}

interface DegreeCentrality {
  entity_type: string;
  entity_id: string;
  degree: number;
  normalized: number;
}

interface PageRank {
  entity_type: string;
  entity_id: string;
  pagerank: number;
}

interface Community {
  id: number;
  size: number;
  members: Array<{ entity_type: string; entity_id: string }>;
}

interface GraphStats {
  nodeCount: number;
  edgeCount: number;
  avgDegree: number;
  nodesByType: Record<string, number>;
}

export function GraphAnalyticsPanel({ onEntityClick }: AnalyticsProps) {
  const [activeTab, setActiveTab] = useState<'centrality' | 'pagerank' | 'communities' | 'stats'>('centrality');
  const [loading, setLoading] = useState(false);

  const [degreeCentrality, setDegreeCentrality] = useState<DegreeCentrality[]>([]);
  const [pagerank, setPagerank] = useState<PageRank[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [stats, setStats] = useState<GraphStats | null>(null);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  async function loadData() {
    try {
      setLoading(true);

      if (activeTab === 'centrality') {
        const res = await fetch('/api/knowledge-graph/analytics/degree-centrality?limit=15');
        const data = await res.json();
        setDegreeCentrality(data);
      } else if (activeTab === 'pagerank') {
        const res = await fetch('/api/knowledge-graph/analytics/pagerank?limit=15');
        const data = await res.json();
        setPagerank(data);
      } else if (activeTab === 'communities') {
        const res = await fetch('/api/knowledge-graph/analytics/communities?iterations=10');
        const data = await res.json();
        setCommunities(data);
      } else if (activeTab === 'stats') {
        const res = await fetch('/api/knowledge-graph/analytics/stats');
        const data = await res.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-adv-card rounded-lg p-4 h-full flex flex-col">
      <h3 className="font-semibold text-adv-white mb-3 flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-adv-teal" />
        Graph Analytics
      </h3>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-adv-gray/20">
        <button
          onClick={() => setActiveTab('centrality')}
          className={`px-3 py-2 text-sm transition ${
            activeTab === 'centrality'
              ? 'text-adv-teal border-b-2 border-adv-teal'
              : 'text-adv-gray hover:text-adv-white'
          }`}
        >
          <TrendingUp className="w-4 h-4 inline mr-1" />
          Centrality
        </button>
        <button
          onClick={() => setActiveTab('pagerank')}
          className={`px-3 py-2 text-sm transition ${
            activeTab === 'pagerank'
              ? 'text-adv-teal border-b-2 border-adv-teal'
              : 'text-adv-gray hover:text-adv-white'
          }`}
        >
          <TrendingUp className="w-4 h-4 inline mr-1" />
          PageRank
        </button>
        <button
          onClick={() => setActiveTab('communities')}
          className={`px-3 py-2 text-sm transition ${
            activeTab === 'communities'
              ? 'text-adv-teal border-b-2 border-adv-teal'
              : 'text-adv-gray hover:text-adv-white'
          }`}
        >
          <Users className="w-4 h-4 inline mr-1" />
          Communities
        </button>
        <button
          onClick={() => setActiveTab('stats')}
          className={`px-3 py-2 text-sm transition ${
            activeTab === 'stats'
              ? 'text-adv-teal border-b-2 border-adv-teal'
              : 'text-adv-gray hover:text-adv-white'
          }`}
        >
          <GitBranch className="w-4 h-4 inline mr-1" />
          Stats
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-adv-teal" />
          </div>
        ) : (
          <>
            {activeTab === 'centrality' && (
              <div className="space-y-2">
                <p className="text-xs text-adv-gray mb-3">Most connected entities (by degree)</p>
                {degreeCentrality.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => onEntityClick?.(item.entity_type, item.entity_id)}
                    className="w-full text-left p-2 bg-adv-dark-2 hover:bg-adv-teal-dim rounded text-xs transition"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-adv-white font-medium">#{idx + 1}</span>
                      <span className="text-adv-gray capitalize">{item.entity_type}</span>
                    </div>
                    <div className="text-adv-gray">{item.degree} connections</div>
                    <div className="mt-1 bg-adv-dark rounded-full h-1">
                      <div
                        className="bg-adv-teal h-1 rounded-full"
                        style={{ width: `${item.normalized * 100}%` }}
                      />
                    </div>
                  </button>
                ))}
              </div>
            )}

            {activeTab === 'pagerank' && (
              <div className="space-y-2">
                <p className="text-xs text-adv-gray mb-3">Most influential entities (by PageRank)</p>
                {pagerank.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => onEntityClick?.(item.entity_type, item.entity_id)}
                    className="w-full text-left p-2 bg-adv-dark-2 hover:bg-adv-teal-dim rounded text-xs transition"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-adv-white font-medium">#{idx + 1}</span>
                      <span className="text-adv-gray capitalize">{item.entity_type}</span>
                    </div>
                    <div className="text-adv-gray">Score: {item.pagerank.toFixed(6)}</div>
                    <div className="mt-1 bg-adv-dark rounded-full h-1">
                      <div
                        className="bg-adv-teal h-1 rounded-full"
                        style={{ width: `${(item.pagerank / (pagerank[0]?.pagerank || 1)) * 100}%` }}
                      />
                    </div>
                  </button>
                ))}
              </div>
            )}

            {activeTab === 'communities' && (
              <div className="space-y-3">
                <p className="text-xs text-adv-gray mb-3">Detected communities (label propagation)</p>
                {communities.length === 0 ? (
                  <p className="text-xs text-adv-gray py-4">No communities detected</p>
                ) : (
                  communities.slice(0, 10).map((community, idx) => (
                    <div key={community.id} className="p-3 bg-adv-dark-2 rounded">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-adv-white font-medium text-sm">
                          Community {idx + 1}
                        </span>
                        <span className="text-xs text-adv-gray">{community.size} members</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {community.members.slice(0, 8).map((member, i) => (
                          <span
                            key={i}
                            className="text-xs px-2 py-0.5 bg-adv-teal-dim text-adv-teal rounded capitalize"
                          >
                            {member.entity_type}
                          </span>
                        ))}
                        {community.size > 8 && (
                          <span className="text-xs px-2 py-0.5 bg-adv-gray/20 text-adv-gray rounded">
                            +{community.size - 8} more
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'stats' && stats && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-adv-dark-2 rounded">
                    <div className="text-xs text-adv-gray">Total Nodes</div>
                    <div className="text-2xl font-bold text-adv-white">{stats.nodeCount}</div>
                  </div>
                  <div className="p-3 bg-adv-dark-2 rounded">
                    <div className="text-xs text-adv-gray">Total Edges</div>
                    <div className="text-2xl font-bold text-adv-white">{stats.edgeCount}</div>
                  </div>
                </div>

                <div className="p-3 bg-adv-dark-2 rounded">
                  <div className="text-xs text-adv-gray mb-1">Average Degree</div>
                  <div className="text-xl font-bold text-adv-white">{stats.avgDegree.toFixed(2)}</div>
                </div>

                <div>
                  <div className="text-sm text-adv-white font-medium mb-2">Nodes by Type</div>
                  <div className="space-y-2">
                    {Object.entries(stats.nodesByType).map(([type, count]) => (
                      <div key={type}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-adv-gray capitalize">{type}</span>
                          <span className="text-adv-white">{count}</span>
                        </div>
                        <div className="bg-adv-dark rounded-full h-1.5">
                          <div
                            className="bg-adv-teal h-1.5 rounded-full"
                            style={{ width: `${(count / stats.nodeCount) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
