/**
 * PortalsTemplateGalleryPage — /portals/build
 *
 * Dedicated template-picker for new portals. Lists the 7 v0.7.x templates
 * with their descriptions and recommended category. Click → walkthrough.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Globe, Layers, Loader2, AlertCircle, ChevronRight } from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';

interface Template {
  id: string;
  label: string;
  description: string;
  recommendedCategory: string;
  defaultCapabilities: Array<{ verb: string; title: string }>;
  seedPages: Array<{ path: string; title: string }>;
}

export default function PortalsTemplateGalleryPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithAuth('/api/portals/templates');
        if (!res.ok) throw new Error(`Failed to load templates (${res.status})`);
        const json = await res.json();
        if (!cancelled) setTemplates(json.templates ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white p-6 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-adv-teal/10"><Layers className="h-7 w-7 text-adv-teal" aria-hidden /></div>
          <div>
            <h1 className="text-2xl font-semibold">Build a new portal</h1>
            <p className="text-sm text-adv-gray mt-1 max-w-2xl">
              Pick a template. The walkthrough will guide you through 8 phases — intent, identity, pages,
              content, capabilities, aesthetics, review, publish. Most portals take under 10 minutes.
            </p>
          </div>
        </header>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-adv-gray"><Loader2 className="h-4 w-4 animate-spin" /> Loading templates…</div>
        )}
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-adv-red/40 bg-adv-red/10 p-3 text-sm">
            <AlertCircle className="h-4 w-4 text-adv-red flex-shrink-0 mt-0.5" /> {error}
          </div>
        )}

        {!loading && !error && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {templates.map((t) => (
              <Link
                key={t.id}
                to={`/portals/build/${t.id}`}
                className="group rounded-xl border border-border bg-adv-card p-5 hover:border-adv-teal transition flex flex-col"
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-adv-teal/10"><Globe className="h-5 w-5 text-adv-teal" /></div>
                  <div className="flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <h2 className="font-semibold">{t.label}</h2>
                      <span className="text-xs text-adv-gray">{t.recommendedCategory}</span>
                    </div>
                    <p className="text-sm text-adv-gray mt-1 leading-relaxed">{t.description}</p>
                  </div>
                </div>

                <div className="mt-auto pt-3 border-t border-border space-y-2 text-xs text-adv-gray">
                  <div>
                    <span className="text-adv-off-white">Pages:</span>{' '}
                    {t.seedPages.map((p) => p.path).join(' · ')}
                  </div>
                  <div>
                    <span className="text-adv-off-white">Capabilities:</span>{' '}
                    {t.defaultCapabilities.map((c) => c.verb).join(' · ')}
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-end text-sm text-adv-teal font-medium opacity-0 group-hover:opacity-100 transition">
                  Start walkthrough <ChevronRight className="h-4 w-4 ml-1" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
