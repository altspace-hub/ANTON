import React, { useState } from 'react';
import { X, GitMerge, AlertTriangle } from 'lucide-react';

interface EntityMergeModalProps {
  fromEntity: { entity_type: string; entity_id: string; canonical_name: string };
  entities: Array<{ entity_type: string; entity_id: string; canonical_name: string }>;
  onClose: () => void;
  onMerge: (fromId: string, intoId: string, reason: string) => Promise<void>;
}

export function EntityMergeModal({ fromEntity, entities, onClose, onMerge }: EntityMergeModalProps) {
  const [selectedTarget, setSelectedTarget] = useState('');
  const [reason, setReason] = useState('');
  const [merging, setMerging] = useState(false);

  const sameTypeEntities = entities.filter(
    e => e.entity_type === fromEntity.entity_type && e.entity_id !== fromEntity.entity_id
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTarget) return;

    try {
      setMerging(true);
      await onMerge(fromEntity.entity_id, selectedTarget, reason || 'manual merge');
      onClose();
    } catch (error) {
      console.error('Merge failed:', error);
      alert('Merge failed. See console for details.');
    } finally {
      setMerging(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-adv-card rounded-lg shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <GitMerge className="w-5 h-5 text-adv-teal" />
            <h3 className="text-lg font-bold text-adv-white">Merge Entity</h3>
          </div>
          <button onClick={onClose} className="text-adv-gray hover:text-adv-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-4 p-3 bg-yellow-900/20 border border-yellow-500/30 rounded flex items-start gap-2">
          <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-yellow-200">
            This will merge <strong>{fromEntity.canonical_name}</strong> into another entity. All references will be updated. This cannot be undone.
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-adv-gray mb-2">Merge into:</label>
            <select
              value={selectedTarget}
              onChange={(e) => setSelectedTarget(e.target.value)}
              className="w-full px-3 py-2 bg-adv-dark-2 border border-adv-gray/20 rounded text-adv-white focus:outline-none focus:border-adv-teal"
              required
            >
              <option value="">Select target entity...</option>
              {sameTypeEntities.map((entity) => (
                <option key={entity.entity_id} value={entity.entity_id}>
                  {entity.canonical_name}
                </option>
              ))}
            </select>
            {sameTypeEntities.length === 0 && (
              <p className="text-xs text-adv-gray mt-2">No other entities of type "{fromEntity.entity_type}" found.</p>
            )}
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-adv-gray mb-2">Reason (optional):</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Duplicate, alternate spelling, etc."
              rows={3}
              className="w-full px-3 py-2 bg-adv-dark-2 border border-adv-gray/20 rounded text-adv-white placeholder-adv-gray focus:outline-none focus:border-adv-teal"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-adv-dark-2 hover:bg-adv-gray/10 text-adv-gray rounded transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!selectedTarget || merging || sameTypeEntities.length === 0}
              className="flex-1 px-4 py-2 bg-adv-teal hover:bg-adv-teal-dark text-white rounded transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {merging ? 'Merging...' : 'Merge Entities'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
