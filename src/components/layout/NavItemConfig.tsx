/**
 * NavItemConfig.tsx
 * Configuration UI for hiding/showing navigation items in the Sidebar.
 * Shown in Settings page.
 */

import { useState, useEffect } from 'react';
import { Eye, EyeOff, RotateCcw, RefreshCw, Users } from 'lucide-react';

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

  { id: 'presentations', label: 'Presentations', category: 'interaction' },
  { id: 'markets', label: 'Markets Intelligence', category: 'intelligence' },
  { id: 'procure', label: 'Procure', category: 'intelligence' },
  { id: 'civic', label: 'Civic', category: 'intelligence' },
  { id: 'grow', label: 'Grow', category: 'intelligence' },
  { id: 'school', label: 'ANTON School', category: 'tools' },

  // Life Platform Tabs
  { id: 'news', label: 'News', category: 'tools' },
  { id: 'finance', label: 'Finance', category: 'tools' },
  { id: 'travel', label: 'Travel', category: 'tools' },
  { id: 'community', label: 'Community', category: 'tools' },
  { id: 'community-groups', label: 'Groups', category: 'tools' },
  { id: 'community-mail', label: 'Community Mail', category: 'tools' },
  { id: 'community-calendar', label: 'Community Calendar', category: 'tools' },

  // Pathfinder
  { id: 'pathfinder', label: 'Pathfinder Search', category: 'intelligence' },
  { id: 'pathfinder-history', label: 'Search History', category: 'intelligence' },

  // Tools
  { id: 'task-agent', label: 'ANTON Task Agent', category: 'intelligence' },
  { id: 'agents', label: 'Specialized Agents', category: 'intelligence' },
  { id: 'orchestrator', label: 'ANTON Orchestrator', category: 'intelligence' },
  { id: 'counsels-desk', label: "Counsel's Desk", category: 'tools' },
  { id: 'gap-assessment', label: 'Gap Assessor', category: 'tools' },
  { id: 'regulatory-feed', label: 'Regulatory Feed', category: 'tools' },
  { id: 'lore-ledger', label: 'Lore Ledger', category: 'tools' },
  { id: 'roaring', label: 'Roaring Entity Registry', category: 'tools' },
  { id: 'dj-screening', label: 'DJ Risk & Compliance', category: 'tools' },
  { id: 'entity-intelligence', label: 'Entity Intelligence', category: 'tools' },
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
  { id: 'system-cards', label: 'AI System Cards', category: 'features' },
  { id: 'compare', label: 'Compare ANTON', category: 'features' },
  { id: 'marketplace', label: 'Marketplace', category: 'features' },

  // Intelligence
  { id: 'orchestration', label: 'Orchestration', category: 'intelligence' },
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
  { id: 'compliance-posture', label: 'Compliance Posture', category: 'admin' },
  { id: 'risk-appetite', label: 'Risk Appetite Dashboard', category: 'admin' },
  { id: 'app-gateway', label: 'App Gateway', category: 'admin' },
];

// UX-01: Role-based nav presets — show only relevant items for each persona
// Items listed = shown; everything else = hidden
const ROLE_PRESETS: Record<string, { label: string; description: string; show: string[] }> = {
  'fcp-consultant': {
    label: 'FCP Consultant',
    description: 'AML/CFT, sanctions, regulatory compliance',
    show: [
      'prompt', 'brief', 'review', 'challenge', 'dual', 'sounding-board',
      'counsels-desk', 'gap-assessment', 'roaring', 'dj-screening', 'entity-intelligence',
      'my-work', 'projects', 'workflows', 'skills', 'skill-packs', 'batch',
      'deadlines', 'radar', 'innovation-radar',
      'knowledge-base', 'knowledge', 'graph', 'intelligence', 'patterns',
      'compliance', 'governance', 'analytics', 'audit', 'versions', 'quality',
      'task-agent', 'orchestrator', 'pathfinder', 'pathfinder-history',
    ],
  },
  'lawyer-gc': {
    label: 'Lawyer / GC',
    description: 'Legal research, contracts, regulatory advice',
    show: [
      'prompt', 'brief', 'guide', 'challenge', 'dual', 'review', 'sounding-board',
      'counsels-desk', 'gap-assessment',
      'my-work', 'projects', 'skills', 'versions',
      'deadlines', 'radar',
      'knowledge-base', 'knowledge', 'graph',
      'compliance', 'governance', 'audit',
      'pathfinder', 'pathfinder-history',
    ],
  },
  'compliance-officer': {
    label: 'Compliance Officer',
    description: 'Risk, governance, monitoring, reporting',
    show: [
      'prompt', 'brief', 'review', 'challenge', 'sounding-board',
      'counsels-desk', 'gap-assessment', 'roaring', 'dj-screening', 'entity-intelligence',
      'my-work', 'projects', 'workflows', 'skills',
      'deadlines', 'radar', 'innovation-radar',
      'knowledge-base', 'knowledge', 'graph', 'intelligence', 'patterns',
      'compliance', 'governance', 'analytics', 'audit', 'insights', 'versions', 'quality',
      'task-agent', 'pathfinder', 'pathfinder-history',
    ],
  },
};

export function applyRolePreset(role: string): void {
  const preset = ROLE_PRESETS[role];
  if (!preset) return;
  const showSet = new Set(preset.show);
  const allIds = ALL_NAV_ITEMS.map((i) => i.id);
  const hidden = allIds.filter((id) => !showSet.has(id));
  saveHiddenNavItems(new Set(hidden));
}

/**
 * Favorites starred for every user from the very first launch. The user
 * can unstar any of them — once they toggle anything, the localStorage
 * key `openexpert-favorite-nav-items` is written and this default no
 * longer applies. Order here is the order they were chosen, not display
 * order (the Favorites section renders by its own item order).
 */
export const DEFAULT_FAVORITE_NAV_ITEMS: string[] = [
  'home',
  'engagements',
  'discover',
  'prompt',
  'council',
  'task-agent',
  'coding',
  'my-work',
  'projects',
  'build-module',
  'exchange',
  'knowledge-base',
  'orchestration',
  'intelligence',
  'radar',
  'app-gateway',
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

  function applyPreset(role: string) {
    applyRolePreset(role);
    setHiddenItems(loadHiddenNavItems());
    setChangesMade(true);
  }

  return (
    <div className="space-y-6">
      {/* UX-01: Role-based nav presets */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Users className="h-4 w-4 text-adv-teal" />
          <h3 className="text-sm font-semibold text-adv-white">Quick Role Presets</h3>
        </div>
        <p className="text-xs text-adv-gray mb-3">Start from a role-optimised view. You can customise below.</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(ROLE_PRESETS).map(([role, preset]) => (
            <button
              key={role}
              onClick={() => applyPreset(role)}
              className="flex flex-col items-start rounded-lg border border-adv-card bg-adv-card px-3 py-2 text-left hover:border-adv-teal hover:bg-adv-teal-soft transition-colors"
            >
              <span className="text-xs font-semibold text-adv-off-white">{preset.label}</span>
              <span className="text-xs text-adv-gray">{preset.description}</span>
            </button>
          ))}
        </div>
      </div>

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
