import React, { useState } from 'react';
import { X, FolderPlus, Palette } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';

interface CreateCollectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (collectionId: string) => void;
}

export function CreateCollectionModal({ isOpen, onClose, onSuccess }: CreateCollectionModalProps) {
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('FolderOpen');
  const [color, setColor] = useState('#2DD4A8');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetchWithAuth('/api/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name || displayName.toLowerCase().replace(/\s+/g, '-'),
          displayName,
          description,
          icon,
          color,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        onSuccess(data.collectionId);
        onClose();
        resetForm();
      }
    } catch (error) {
      console.error('Failed to create collection:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setName('');
    setDisplayName('');
    setDescription('');
    setIcon('FolderOpen');
    setColor('#2DD4A8');
  };

  if (!isOpen) return null;

  const iconOptions = ['FolderOpen', 'Scale', 'Briefcase', 'FileText', 'BookOpen', 'Shield', 'Calculator', 'Globe'];
  const colorOptions = ['#2DD4A8', '#3498DB', '#F5A623', '#E74C3C', '#9B59B6', '#1ABC9C'];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-adv-card rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between p-6 border-b border-adv-gray-med">
          <h2 className="text-xl font-semibold text-adv-off-white flex items-center gap-2">
            <FolderPlus className="h-5 w-5 text-adv-teal" />
            Create Knowledge Collection
          </h2>
          <button onClick={onClose} className="text-adv-gray hover:text-adv-off-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-adv-off-white mb-2">
              Collection Name *
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g., Tax Codes 2024, Legal Precedents, Industry Standards"
              className="w-full px-3 py-2 bg-adv-dark border border-adv-gray-med rounded text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-adv-off-white mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What kind of documents will this collection contain?"
              rows={3}
              className="w-full px-3 py-2 bg-adv-dark border border-adv-gray-med rounded text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-adv-off-white mb-2">
                Icon
              </label>
              <div className="grid grid-cols-4 gap-2">
                {iconOptions.map((iconName) => {
                  const IconComponent = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[iconName];
                  return (
                    <button
                      key={iconName}
                      type="button"
                      onClick={() => setIcon(iconName)}
                      className={`p-3 rounded border ${
                        icon === iconName
                          ? 'border-adv-teal bg-adv-teal/10'
                          : 'border-adv-gray-med hover:border-adv-teal'
                      }`}
                    >
                      {IconComponent && <IconComponent className="h-5 w-5 text-adv-off-white mx-auto" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-adv-off-white mb-2">
                Color
              </label>
              <div className="grid grid-cols-3 gap-2">
                {colorOptions.map((colorOption) => (
                  <button
                    key={colorOption}
                    type="button"
                    onClick={() => setColor(colorOption)}
                    className={`h-10 rounded border-2 ${
                      color === colorOption ? 'border-white' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: colorOption }}
                  />
                ))}
              </div>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-full mt-2 h-10 rounded cursor-pointer"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-adv-gray hover:text-adv-off-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !displayName}
              className="px-4 py-2 bg-adv-teal text-white rounded hover:bg-adv-teal-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Creating...' : 'Create Collection'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
