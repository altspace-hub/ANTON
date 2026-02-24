import { useState, useEffect } from 'react';
import { Database, Search, Sparkles, Loader2 } from 'lucide-react';

interface Collection {
  id: string;
  display_name: string;
  description: string;
  color: string;
  documentCount: number;
}

interface RAGSearchPanelProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  selectedCollections: string[];
  onCollectionsChange: (collections: string[]) => void;
  topK: number;
  onTopKChange: (topK: number) => void;
  rerank: boolean;
  onRerankChange: (rerank: boolean) => void;
}

export function RAGSearchPanel({
  enabled,
  onEnabledChange,
  selectedCollections,
  onCollectionsChange,
  topK,
  onTopKChange,
  rerank,
  onRerankChange,
}: RAGSearchPanelProps) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCollections();
  }, []);

  const loadCollections = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/collections');
      if (!response.ok) throw new Error('Failed to load collections');
      const data = await response.json();

      // Fetch document counts for each collection
      const collectionsWithCounts = await Promise.all(
        (data.collections || []).map(async (col: any) => {
          try {
            const countRes = await fetch(`/api/collections/${col.id}/documents`);
            const countData = await countRes.json();
            return { ...col, documentCount: countData.documents?.length || 0 };
          } catch {
            return { ...col, documentCount: 0 };
          }
        })
      );

      setCollections(collectionsWithCounts);
    } catch (error) {
      console.error('Failed to load collections:', error);
      setCollections([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3 p-4 bg-adv-dark-2 rounded-lg border border-adv-gray-med">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className={`h-5 w-5 ${enabled ? 'text-adv-teal' : 'text-adv-gray'}`} />
          <label className="text-sm font-medium text-adv-off-white">
            📚 Knowledge Base (RAG)
          </label>
        </div>
        <button
          type="button"
          onClick={() => onEnabledChange(!enabled)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            enabled ? 'bg-adv-teal' : 'bg-adv-gray-med'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {enabled && (
        <>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-4 text-xs text-adv-gray">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading collections...
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs text-adv-gray mb-2">
                  Select Collections to Search
                </label>
                <div className="space-y-2 max-h-48 overflow-auto">
                  {collections.length === 0 ? (
                    <div className="text-xs text-adv-gray-med bg-adv-dark/50 p-3 rounded border border-border">
                      No collections available. Create collections in the Knowledge Base section first.
                    </div>
                  ) : (
                    collections.map((collection) => (
                      <label
                        key={collection.id}
                        className="flex items-center gap-2 p-2 rounded hover:bg-adv-dark cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selectedCollections.includes(collection.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              onCollectionsChange([...selectedCollections, collection.id]);
                            } else {
                              onCollectionsChange(selectedCollections.filter((id) => id !== collection.id));
                            }
                          }}
                          className="rounded border-adv-gray-med text-adv-teal focus:ring-adv-teal"
                        />
                        <div
                          className="w-3 h-3 rounded flex-shrink-0"
                          style={{ backgroundColor: collection.color }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-adv-off-white truncate">
                            {collection.display_name}
                          </div>
                          {collection.description && (
                            <div className="text-xs text-adv-gray-med truncate">
                              {collection.description}
                            </div>
                          )}
                        </div>
                        <span className="text-xs text-adv-gray flex-shrink-0">
                          {collection.documentCount} doc{collection.documentCount !== 1 ? 's' : ''}
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-adv-gray mb-1">
                    Chunks to Retrieve
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={topK}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (!isNaN(val) && val >= 1 && val <= 50) {
                        onTopKChange(val);
                      }
                    }}
                    className="w-full px-2 py-1 bg-adv-dark border border-adv-gray-med rounded text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
                  />
                  <div className="text-[10px] text-adv-gray-med mt-1">
                    {topK <= 10 ? 'Focused' : topK <= 20 ? 'Balanced' : 'Comprehensive'}
                  </div>
                </div>

                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rerank}
                      onChange={(e) => onRerankChange(e.target.checked)}
                      className="rounded border-adv-gray-med text-adv-teal focus:ring-adv-teal"
                    />
                    <span className="text-xs text-adv-off-white flex items-center gap-1">
                      <Sparkles className="h-3 w-3 text-adv-gold" />
                      Re-rank
                    </span>
                  </label>
                </div>
              </div>

              {/* Token estimation warning */}
              {topK > 20 && (
                <div className="text-xs text-adv-gold bg-adv-gold/10 p-2 rounded border border-adv-gold/20">
                  ⚠️ High chunk count may approach context limits. Consider reducing if you encounter issues.
                </div>
              )}

              <div className="text-xs text-adv-gray bg-adv-teal/10 p-2 rounded border border-adv-teal/20">
                <Search className="h-3 w-3 inline mr-1" />
                Will search selected collections using your message as the query. Retrieved chunks will be added to Claude's context.
              </div>

              {selectedCollections.length > 0 && (
                <div className="text-xs text-adv-teal">
                  ✓ {selectedCollections.length} collection{selectedCollections.length !== 1 ? 's' : ''} selected
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
