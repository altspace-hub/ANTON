import React, { useState, useEffect } from 'react';
import { Plus, Trash2, FileText, Database as DatabaseIcon, AlertCircle, RefreshCw } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { CreateCollectionModal } from '../components/knowledge/CreateCollectionModal';
import { DocumentUploader } from '../components/knowledge/DocumentUploader';

interface Collection {
  id: string;
  name: string;
  display_name: string;
  description: string;
  icon: string;
  color: string;
  documentCount: number;
  chunkCount: number;
}

interface Document {
  id: string;
  filename: string;
  file_size: number;
  chunk_count: number;
  uploaded_at: string;
  index_status: 'pending' | 'indexing' | 'indexed' | 'failed';
}

export default function KnowledgeBasePage() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    loadCollections();
  }, []);

  useEffect(() => {
    if (selectedCollection) {
      loadDocuments(selectedCollection);
    }
  }, [selectedCollection]);

  const loadCollections = async () => {
    try {
      const response = await fetch('/api/collections', {
        headers: { Authorization: `Bearer ${localStorage.getItem('openexpert-token')}` },
      });
      if (!response.ok) return;
      const data = await response.json();
      setCollections(data.collections || []);
      if (data.collections && data.collections.length > 0 && !selectedCollection) {
        setSelectedCollection(data.collections[0].id);
      }
    } catch (error) {
      console.error('Failed to load collections:', error);
    }
  };

  const loadDocuments = async (collectionId: string) => {
    try {
      const response = await fetch(`/api/documents/collection/${collectionId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('openexpert-token')}` },
      });
      if (!response.ok) return;
      const data = await response.json();
      setDocuments(data.documents || []);
    } catch (error) {
      console.error('Failed to load documents:', error);
    }
  };

  const handleDeleteDocument = async (documentId: string) => {
    if (!confirm('Delete this document? This will remove all indexed chunks.')) return;

    try {
      await fetch(`/api/documents/${documentId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('openexpert-token')}` },
      });

      if (selectedCollection) loadDocuments(selectedCollection);
    } catch (error) {
      console.error('Failed to delete document:', error);
    }
  };

  const selectedCollectionData = collections.find((c) => c.id === selectedCollection);
  const IconComponent = selectedCollectionData
    ? (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>>)[
        selectedCollectionData.icon
      ]
    : null;

  return (
    <div className="flex h-screen bg-adv-dark">
      {/* Collections Sidebar */}
      <div className="w-80 bg-adv-card border-r border-adv-gray-med p-4 overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-adv-off-white">Collections</h2>
          <button
            onClick={() => setShowCreateModal(true)}
            className="p-2 text-adv-teal hover:bg-adv-teal/10 rounded transition-colors"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-2">
          {collections.map((collection) => {
            const Icon = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>>)[
              collection.icon
            ];
            return (
              <button
                key={collection.id}
                onClick={() => setSelectedCollection(collection.id)}
                className={`w-full flex items-center gap-3 p-3 rounded transition-colors ${
                  selectedCollection === collection.id
                    ? 'bg-adv-teal/10 border border-adv-teal'
                    : 'hover:bg-adv-dark border border-transparent'
                }`}
              >
                {Icon && (
                  <div className="p-2 rounded" style={{ backgroundColor: `${collection.color}20` }}>
                    <Icon className="h-5 w-5" style={{ color: collection.color }} />
                  </div>
                )}
                <div className="flex-1 text-left">
                  <div className="text-sm font-medium text-adv-off-white">{collection.display_name}</div>
                  <div className="text-xs text-adv-gray">
                    {collection.documentCount} docs · {collection.chunkCount} chunks
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Documents Area */}
      <div className="flex-1 overflow-auto p-6">
        {selectedCollectionData ? (
          <>
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-2">
                {IconComponent && (
                  <div className="p-3 rounded-lg" style={{ backgroundColor: `${selectedCollectionData.color}20` }}>
                    <IconComponent className="h-6 w-6" style={{ color: selectedCollectionData.color }} />
                  </div>
                )}
                <div>
                  <h1 className="text-2xl font-bold text-adv-off-white">{selectedCollectionData.display_name}</h1>
                  <p className="text-sm text-adv-gray">{selectedCollectionData.description}</p>
                </div>
              </div>
            </div>

            <div className="mb-6">
              <DocumentUploader
                collectionId={selectedCollection!}
                onUploadComplete={() => {
                  loadDocuments(selectedCollection!);
                  loadCollections(); // Refresh counts
                }}
              />
            </div>

            <div>
              <h3 className="text-lg font-semibold text-adv-off-white mb-4">Documents ({documents.length})</h3>
              <div className="grid gap-3">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className={`flex items-center justify-between p-4 bg-adv-card rounded border transition-colors ${
                      doc.index_status === 'failed'
                        ? 'border-adv-red/40'
                        : doc.index_status === 'indexing'
                        ? 'border-adv-gold/40'
                        : 'border-adv-gray-med hover:border-adv-teal'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {doc.index_status === 'failed' ? (
                        <AlertCircle className="h-5 w-5 text-adv-red flex-shrink-0" />
                      ) : doc.index_status === 'indexing' ? (
                        <RefreshCw className="h-5 w-5 text-adv-gold animate-spin flex-shrink-0" />
                      ) : (
                        <FileText className="h-5 w-5 text-adv-gray flex-shrink-0" />
                      )}
                      <div>
                        <div className="text-sm font-medium text-adv-off-white">{doc.filename}</div>
                        <div className="text-xs text-adv-gray">
                          {doc.index_status === 'failed' ? (
                            <span className="text-adv-red">Indexing failed — delete and re-upload</span>
                          ) : doc.index_status === 'indexing' ? (
                            <span className="text-adv-gold">Indexing in progress...</span>
                          ) : (
                            <>
                              {doc.chunk_count} chunks · {(doc.file_size / 1024).toFixed(1)} KB · Uploaded{' '}
                              {new Date(doc.uploaded_at).toLocaleDateString()}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteDocument(doc.id)}
                      className="p-2 text-adv-gray hover:text-adv-red transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <DatabaseIcon className="h-16 w-16 text-adv-gray-med mb-4" />
            <h2 className="text-xl font-semibold text-adv-off-white mb-2">No Collection Selected</h2>
            <p className="text-sm text-adv-gray mb-6">Create a collection to get started</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-adv-teal text-white rounded hover:bg-adv-teal-dark transition-colors flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Create Collection
            </button>
          </div>
        )}
      </div>

      <CreateCollectionModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => {
          loadCollections();
          setShowCreateModal(false);
        }}
      />
    </div>
  );
}
