/**
 * NavItemConfig.tsx
 * Configuration UI for hiding/showing navigation items in the Sidebar.
 * Shown in Settings page.
 */

import { useState, useEffect } from 'react';
import { Eye, EyeOff, RotateCcw, RefreshCw } from 'lucide-react';

export const NAV_ITEMS_HIDDEN_KEY = 'openexpert-hidden-nav-items';

interface NavItem {
  id: string;
  label: string;
  category: 'interaction' | 'tools' | 'features' | 'intelligence' | 'admin';
}

// All navigation items that can be hidden
export const ALL_NAV_ITEMS: NavItem[] = [
  // Interaction Modes
  { id: 'engagements', label: 'Engagement Tasks', category: 'interaction' },
  { id: 'discover', label: 'Discover', category: 'interaction' },
  { id: 'brief', label: 'Brief Me', category: 'interaction' },
  { id: 'guide', label: 'Guide Me', category: 'interaction' },
  { id: 'fill', label: 'Fill Form', category: 'interaction' },
  { id: 'challenge', label: 'Challenge This', category: 'interaction' },
  { id: 'dual', label: 'Dual Interpretation', category: 'interaction' },
  { id: 'review', label: 'Review Engine', category: 'interaction' },
  { id: 'prompt', label: 'Open Chat', category: 'interaction' },
  { id: 'sounding-board', label: 'Sounding Board', category: 'interaction' },
  { id: 'ab-test', label: 'A/B Prompt Testing', category: 'interaction' },
  { id: 'council', label: 'AI Council', category: 'interaction' },

  // Tools
  { id: 'ngo', label: 'NGO & Social Impact', category: 'tools' },
  { id: 'trades', label: 'Trades & Service Workers', category: 'tools' },
  { id: 'pe-vc', label: 'PE/VC Hub', category: 'tools' },
  { id: 'coding', label: 'Coding', category: 'tools' },
  { id: 'my-work', label: 'My Work', category: 'tools' },
  { id: 'workflows', label: 'Workflows', category: 'tools' },
  { id: 'datasets', label: 'Saved Datasets', category: 'tools' },
  { id: 'coworkers', label: 'Coworkers', category: 'tools' },
  { id: 'projects', label: 'Projects', category: 'tools' },
  { id: 'build-module', label: 'Build Module', category: 'tools' },
  { id: 'skills', label: 'Skills Library', category: 'tools' },
  { id: 'skill-packs', label: 'Skill Packs', category: 'tools' },
  { id: 'batch', label: 'Batch Create', category: 'tools' },

  // Features
  { id: 'exchange', label: 'Exchange', category: 'features' },
  { id: 'versions', label: 'Version History', category: 'features' },
  { id: 'quality', label: 'Quality Ratchet', category: 'features' },
  { id: 'apprentice', label: 'Apprentice Model', category: 'features' },
  { id: 'knowledge-base', label: 'Knowledge Base', category: 'features' },
  { id: 'governance', label: 'Governance Dashboard', category: 'features' },
  { id: 'compare', label: 'Compare ANTON', category: 'features' },
  { id: 'marketplace', label: 'Marketplace', category: 'features' },

  // Intelligence
  { id: 'knowledge', label: 'Knowledge Atoms', category: 'intelligence' },
  { id: 'graph', label: 'Knowledge Graph', category: 'intelligence' },
  { id: 'intelligence', label: 'Intelligence Dashboard', category: 'intelligence' },
  { id: 'patterns', label: 'Pattern Detection', category: 'intelligence' },
  { id: 'deadlines', label: 'Time Intelligence', category: 'intelligence' },
  { id: 'radar', label: 'Horizon Radar', category: 'intelligence' },
  { id: 'innovation-radar', label: 'Innovation Radar', category: 'intelligence' },

  // Admin
  { id: 'analytics', label: 'Analytics', category: 'admin' },
  { id: 'insights', label: 'Data Insights', category: 'admin' },
  { id: 'audit', label: 'Audit Log', category: 'admin' },
  { id: 'compliance', label: 'Compliance', category: 'admin' },
];

export function loadHiddenNavItems(): Set<string> {
  try {
    const raw = localStorage.getItem(NAV_ITEMS_HIDDEN_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

export function saveHiddenNavItems(hidden: Set<string>) {
  localStorage.setItem(NAV_ITEMS_HIDDEN_KEY, JSON.stringify([...hidden]));
}

export default function NavItemConfig() {
  const [hiddenItems, setHiddenItems] = useState<Set<string>>(loadHiddenNavItems);
  const [changesMade, setChangesMade] = useState(false);

  useEffect(() => {
    saveHiddenNavItems(hiddenItems);
  }, [hiddenItems]);

  function toggleItem(id: string) {
    setHiddenItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setChangesMade(true);
  }

  function showAll() {
    setHiddenItems(new Set());
    setChangesMade(true);
  }

  function applyChanges() {
    window.location.reload();
  }

  const categories = {
    interaction: 'Interaction Modes',
    tools: 'Tools & Workflows',
    features: 'Features',
    intelligence: 'Intelligence & Insights',
    admin: 'Admin & Analytics',
  };

  const itemsByCategory = Object.entries(categories).map(([catId, catLabel]) => ({
    id: catId,
    label: catLabel,
    items: ALL_NAV_ITEMS.filter((item) => item.category === catId),
  }));

  const hiddenCount = hiddenItems.size;
  const totalCount = ALL_NAV_ITEMS.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-adv-white">Navigation Items</h3>
          <p className="mt-1 text-xs text-adv-gray">
            Hide items you don't use to simplify your sidebar.{' '}
            <span className="font-medium text-adv-off-white">
              {totalCount - hiddenCount} of {totalCount} visible
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {changesMade && (
            <button
              onClick={applyChanges}
              className="flex items-center gap-2 rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh to Apply
            </button>
          )}
          {hiddenCount > 0 && (
            <button
              onClick={showAll}
              className="flex items-center gap-2 rounded-lg bg-adv-dark px-3 py-1.5 text-xs text-adv-gray hover:text-adv-teal transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Show All
            </button>
          )}
        </div>
      </div>

      <div className="space-y-6">
        {itemsByCategory.map((category) => (
          <div key={category.id}>
            <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-adv-gray">
              {category.label}
            </h4>
            <div className="space-y-1">
              {category.items.map((item) => {
                const isHidden = hiddenItems.has(item.id);
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-adv-card px-3 py-2 transition-all hover:border-adv-gray-med"
                  >
                    <span className={`text-sm ${isHidden ? 'text-adv-gray line-through' : 'text-adv-off-white'}`}>
                      {item.label}
                    </span>
                    <button
                      onClick={() => toggleItem(item.id)}
                      className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors ${
                        isHidden
                          ? 'bg-adv-green/10 text-adv-green hover:bg-adv-green/20'
                          : 'bg-adv-gray/10 text-adv-gray hover:bg-adv-gray/20'
                      }`}
                    >
                      {isHidden ? (
                        <>
                          <Eye className="h-3 w-3" />
                          Show
                        </>
                      ) : (
                        <>
                          <EyeOff className="h-3 w-3" />
                          Hide
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
