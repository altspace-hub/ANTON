/**
 * ProcureRfqTemplatesPage — RFQ template catalogue.
 * Phase B.2 build-out.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, FileText } from 'lucide-react';
import { getAuthHeader } from '../../lib/api';

interface RfqTemplate {
  id: string;
  name: string;
  category: string;
  jurisdiction: string | null;
  template_body: string;
  required_sections: string[] | null;
}

export default function ProcureRfqTemplatesPage() {
  const [templates, setTemplates] = useState<RfqTemplate[]>([]);
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [selected, setSelected] = useState<RfqTemplate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/procure/rfq-templates', { headers: getAuthHeader() })
      .then(r => r.json())
      .then((data: { templates?: RfqTemplate[] }) => setTemplates(data.templates ?? []))
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load templates'))
      .finally(() => setLoading(false));
  }, []);

  const categories = useMemo(() => Array.from(new Set(templates.map(t => t.category))).sort(), [templates]);
  const filtered = templates.filter(t => !filterCategory || t.category === filterCategory);

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/procure" className="text-adv-gray hover:text-adv-teal" aria-label="Back"><ChevronLeft size={20} /></Link>
          <FileText className="text-adv-teal" size={24} />
          <div>
            <h1 className="text-2xl font-semibold">RFQ templates</h1>
            <p className="text-adv-gray text-sm">Per-category RFQ templates with required sections. Render with `{`{{variable}}`}` substitution.</p>
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
            className="bg-adv-card border border-adv-card px-3 py-2 rounded text-sm">
            <option value="">All categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {error && <div className="bg-adv-red/10 text-adv-red p-3 rounded mb-3">{error}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-1">
            {loading ? (
              <div className="text-adv-gray text-center py-12">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="bg-adv-card rounded-lg p-4 text-adv-gray text-sm">
                No templates match. Seed includes 1 generic cloud-infra RFQ.
              </div>
            ) : (
              <ul className="space-y-2">
                {filtered.map(t => (
                  <li key={t.id} onClick={() => setSelected(t)}
                    className={`bg-adv-card rounded-lg p-3 cursor-pointer hover:bg-adv-card/80 ${selected?.id === t.id ? 'ring-1 ring-adv-teal' : ''}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <code className="text-adv-teal text-xs">{t.category}</code>
                      {t.jurisdiction && <span className="text-xs text-adv-gray">{t.jurisdiction}</span>}
                    </div>
                    <div className="font-medium text-sm">{t.name}</div>
                    {t.required_sections && (
                      <div className="text-xs text-adv-gray mt-1">{t.required_sections.length} sections</div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <aside className="lg:col-span-2">
            {selected ? (
              <div className="bg-adv-card rounded-lg p-4">
                <div className="font-semibold mb-2">{selected.name}</div>
                <pre className="text-xs text-adv-off-white whitespace-pre-wrap bg-adv-dark-2 p-3 rounded overflow-auto">
                  {selected.template_body}
                </pre>
              </div>
            ) : (
              <div className="bg-adv-card rounded-lg p-4 text-sm text-adv-gray text-center">
                Select a template to preview.
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
