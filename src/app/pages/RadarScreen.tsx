/**
 * RadarScreen — Horizon Radar compliance/news signal feed.
 */

import { useState, useEffect } from 'react';
import { getAuthHeader } from '../services/api';

interface Props { orgId: string; }

interface RadarItem { id: string; title: string; summary: string; source_name: string; relevance_score: number; status: string; published_at: string; }

export default function RadarScreen({ orgId }: Props) {
  const [items, setItems] = useState<RadarItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/radar/items?limit=20', { headers: getAuthHeader() })
      .then(r => r.ok ? r.json() : [])
      .then(d => setItems(Array.isArray(d) ? d : d.items || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orgId]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl px-4 py-5 space-y-5">
        <div>
          <h1 className="text-lg font-bold text-adv-off-white">Horizon Radar</h1>
          <p className="text-xs text-adv-gray">Regulatory signals & compliance intelligence</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-adv-teal border-t-transparent" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16">
            <span className="text-3xl mb-3 block">📡</span>
            <p className="text-sm text-adv-gray">No signals detected</p>
            <p className="text-xs text-adv-gray/60 mt-1">Configure radar sources in ANTON main to see intelligence here</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map(item => (
              <div key={item.id} className="rounded-xl border border-border bg-adv-card px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                    item.relevance_score > 0.8 ? 'bg-adv-red' :
                    item.relevance_score > 0.5 ? 'bg-adv-gold' : 'bg-adv-gray'
                  }`} />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-medium text-adv-off-white leading-snug">{item.title}</h3>
                    {item.summary && <p className="mt-1 text-xs text-adv-gray line-clamp-2">{item.summary}</p>}
                    <div className="mt-1.5 flex items-center gap-2 text-[10px] text-adv-gray/60">
                      <span>{item.source_name}</span>
                      <span>&middot;</span>
                      <span>{new Date(item.published_at).toLocaleDateString()}</span>
                      <span>&middot;</span>
                      <span className={item.relevance_score > 0.7 ? 'text-adv-teal' : ''}>{Math.round(item.relevance_score * 100)}% relevant</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
