/**
 * ConnectorTemplatesBrowser.tsx
 * Grid component for browsing available connector templates.
 *
 * Fetches from GET /api/connector-templates and renders each template
 * as a card with icon, name, category badge, description, and a
 * "Configure" button that opens a detail modal.
 */

import { useState, useEffect } from 'react';
import { X, ExternalLink, Info } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface ConnectorTemplate {
  id: string;
  name: string;
  type: 'api' | 'rss' | 'email' | 'channel_bridge' | 'webhook';
  description: string;
  category: 'communication' | 'storage' | 'task-management' | 'regulatory' | 'generic';
  icon: string;
  configTemplate: Record<string, unknown>;
  permissionsRequired: string[];
  setupInstructions: string;
  isRegulatory: boolean;
}

// ── Category display config ───────────────────────────────────────────────────

const CATEGORY_LABELS: Record<ConnectorTemplate['category'], string> = {
  communication: 'Communication',
  storage: 'Storage',
  'task-management': 'Task Management',
  regulatory: 'Regulatory Feed',
  generic: 'Generic',
};

const CATEGORY_COLORS: Record<ConnectorTemplate['category'], string> = {
  communication: 'bg-adv-blue/20 text-adv-blue',
  storage: 'bg-purple-900/40 text-purple-300',
  'task-management': 'bg-adv-gold/20 text-adv-gold',
  regulatory: 'bg-adv-teal-dim text-adv-teal',
  generic: 'bg-adv-card text-adv-gray',
};

const TYPE_LABELS: Record<ConnectorTemplate['type'], string> = {
  api: 'REST API',
  rss: 'RSS Feed',
  email: 'Email / SMTP',
  channel_bridge: 'Channel Bridge',
  webhook: 'Webhook',
};

// ── Config key renderer ───────────────────────────────────────────────────────

function renderConfigValue(value: unknown, depth = 0): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value === '' ? '(fill in)' : value;
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return `[${value.join(', ')}]`;
  }
  if (typeof value === 'object' && depth < 2) {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${renderConfigValue(v, depth + 1)}`)
      .join(', ');
  }
  return JSON.stringify(value);
}

// ── Modal ────────────────────────────────────────────────────────────────────

interface TemplateModalProps {
  template: ConnectorTemplate;
  onClose: () => void;
}

function TemplateModal({ template, onClose }: TemplateModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-adv-dark-2 border border-adv-card rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-adv-card">
          <div className="flex items-center gap-3">
            <span className="text-3xl" role="img" aria-label={template.name}>{template.icon}</span>
            <div>
              <h2 className="text-adv-white font-semibold text-lg">{template.name}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[template.category]}`}>
                  {CATEGORY_LABELS[template.category]}
                </span>
                <span className="text-xs text-adv-gray-med">
                  {TYPE_LABELS[template.type]}
                </span>
                {template.isRegulatory && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-adv-teal-dim text-adv-teal font-medium">
                    Regulatory
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-adv-gray hover:text-adv-white hover:bg-adv-card transition-colors"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {/* Description */}
          <p className="text-adv-off-white text-sm leading-relaxed">{template.description}</p>

          {/* Setup instructions */}
          <div>
            <h3 className="text-adv-white font-medium text-sm mb-2 flex items-center gap-1.5">
              <Info size={14} className="text-adv-teal" />
              Setup Instructions
            </h3>
            <div className="bg-adv-card rounded-lg p-4">
              <pre className="text-adv-off-white text-xs leading-relaxed whitespace-pre-wrap font-sans">
                {template.setupInstructions}
              </pre>
            </div>
          </div>

          {/* Permissions required */}
          {template.permissionsRequired.length > 0 && (
            <div>
              <h3 className="text-adv-white font-medium text-sm mb-2">
                Permissions Required
              </h3>
              <div className="flex flex-wrap gap-2">
                {template.permissionsRequired.map((perm) => (
                  <span
                    key={perm}
                    className="text-xs px-2.5 py-1 bg-adv-gold/20 text-adv-gold rounded-full font-mono"
                  >
                    {perm}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Config template fields */}
          <div>
            <h3 className="text-adv-white font-medium text-sm mb-2">
              Configuration Fields
            </h3>
            <div className="bg-adv-card rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-adv-dark-2">
                    <th className="text-left text-adv-gray text-xs font-medium px-4 py-2.5">Field</th>
                    <th className="text-left text-adv-gray text-xs font-medium px-4 py-2.5">Default / Example</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(template.configTemplate).map(([key, value], idx) => (
                    <tr
                      key={key}
                      className={idx % 2 === 0 ? 'bg-transparent' : 'bg-adv-dark/30'}
                    >
                      <td className="px-4 py-2 font-mono text-adv-teal text-xs align-top">{key}</td>
                      <td className="px-4 py-2 text-adv-off-white text-xs align-top break-all">
                        {renderConfigValue(value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-adv-card flex items-center justify-between gap-3">
          <p className="text-adv-gray text-xs">
            To create a connection from this template, go to{' '}
            <span className="text-adv-teal font-medium">Settings &rarr; Connections</span>.
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-adv-teal text-adv-dark rounded-lg text-sm font-semibold hover:bg-adv-teal-dark transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ConnectorTemplatesBrowser() {
  const [templates, setTemplates] = useState<ConnectorTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ConnectorTemplate | null>(null);
  const [filterCategory, setFilterCategory] = useState<ConnectorTemplate['category'] | 'all'>('all');

  useEffect(() => {
    fetch('/api/connector-templates')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ConnectorTemplate[]>;
      })
      .then((data) => {
        setTemplates(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load templates');
        setLoading(false);
      });
  }, []);

  const categories: Array<ConnectorTemplate['category'] | 'all'> = [
    'all',
    'communication',
    'storage',
    'task-management',
    'regulatory',
    'generic',
  ];

  const filtered =
    filterCategory === 'all'
      ? templates
      : templates.filter((t) => t.category === filterCategory);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-adv-white text-xl font-semibold">Connector Templates</h2>
        <p className="text-adv-gray text-sm mt-1">
          Pre-configured starting points for connecting ANTON to external tools and regulatory feeds.
        </p>
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setFilterCategory(cat)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filterCategory === cat
                ? 'bg-adv-teal text-adv-dark'
                : 'bg-adv-card text-adv-gray hover:text-adv-off-white hover:bg-adv-card/80'
            }`}
          >
            {cat === 'all' ? 'All' : CATEGORY_LABELS[cat as ConnectorTemplate['category']]}
          </button>
        ))}
      </div>

      {/* States */}
      {loading && (
        <div className="flex items-center justify-center py-12 text-adv-gray">
          <div className="w-5 h-5 border-2 border-adv-teal border-t-transparent rounded-full animate-spin mr-3" />
          Loading templates...
        </div>
      )}

      {error && (
        <div className="bg-adv-red/10 border border-adv-red/30 rounded-lg p-4 text-adv-red text-sm">
          Failed to load connector templates: {error}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="text-center py-10 text-adv-gray text-sm">
          No templates found for this category.
        </div>
      )}

      {/* Template grid */}
      {!loading && !error && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((template) => (
            <div
              key={template.id}
              className="bg-adv-card border border-adv-card/50 rounded-xl p-4 flex flex-col gap-3 hover:border-adv-teal/30 transition-colors shadow-lg"
            >
              {/* Icon + name row */}
              <div className="flex items-start gap-3">
                <span className="text-2xl mt-0.5 flex-shrink-0" role="img" aria-label={template.name}>
                  {template.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-adv-white font-semibold text-sm leading-tight">
                    {template.name}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[template.category]}`}
                    >
                      {CATEGORY_LABELS[template.category]}
                    </span>
                    {template.isRegulatory && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-adv-teal-dim text-adv-teal font-medium">
                        Regulatory
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Description */}
              <p className="text-adv-gray text-xs leading-relaxed line-clamp-3 flex-1">
                {template.description}
              </p>

              {/* Type indicator */}
              <div className="flex items-center justify-between text-xs text-adv-gray-med">
                <span>{TYPE_LABELS[template.type]}</span>
                {template.permissionsRequired.length > 0 && (
                  <span>{template.permissionsRequired.length} permission{template.permissionsRequired.length !== 1 ? 's' : ''} needed</span>
                )}
              </div>

              {/* Configure button */}
              <button
                onClick={() => setSelected(template)}
                className="w-full mt-1 flex items-center justify-center gap-2 px-3 py-2 bg-adv-teal/10 text-adv-teal border border-adv-teal/30 rounded-lg text-xs font-medium hover:bg-adv-teal hover:text-adv-dark transition-colors"
              >
                <ExternalLink size={13} />
                Configure
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <TemplateModal template={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
