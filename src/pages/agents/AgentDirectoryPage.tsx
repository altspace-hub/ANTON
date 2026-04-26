/**
 * AgentDirectoryPage — public-facing browse of specialized agents.
 *
 * The complement to AgentHubPage (which manages local agents). This
 * page browses agents the local instance has *published* + agents
 * advertised by peer instances (when Beehive is configured).
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Bot, ShieldCheck, Globe2, DollarSign } from 'lucide-react';
import { getAuthHeader } from '../../lib/api';

interface AgentListing {
  id: string;
  agent_id: string;
  listing_handle: string;
  display_name: string;
  short_description: string;
  long_description_md: string | null;
  category: string;
  topic_tags: string[];
  jurisdictions: string[];
  service_languages: string[];
  pricing_kind: 'free' | 'per_call' | 'subscription' | 'contact_for_quote';
  trust_score: number | null;
  is_published: boolean;
  published_at: string | null;
}

const PRICING_LABEL: Record<AgentListing['pricing_kind'], string> = {
  free:                'Free',
  per_call:            'Per call',
  subscription:        'Subscription',
  contact_for_quote:   'Quote',
};

export default function AgentDirectoryPage() {
  const [listings, setListings] = useState<AgentListing[]>([]);
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [filterPricing, setFilterPricing] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/agents/directory', { headers: getAuthHeader() })
      .then(r => r.json())
      .then((data: { listings?: AgentListing[] }) => setListings(data.listings ?? []))
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load directory'))
      .finally(() => setLoading(false));
  }, []);

  const categories = useMemo(() => Array.from(new Set(listings.map(l => l.category))).sort(), [listings]);
  const filtered = listings
    .filter(l => l.is_published)
    .filter(l => !filterCategory || l.category === filterCategory)
    .filter(l => !filterPricing || l.pricing_kind === filterPricing);

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/agents" className="text-adv-gray hover:text-adv-teal" aria-label="Back"><ChevronLeft size={20} /></Link>
          <Bot className="text-adv-teal" size={24} />
          <div>
            <h1 className="text-2xl font-semibold">Agent directory</h1>
            <p className="text-adv-gray text-sm">Specialized agents published locally + advertised by peer instances. Listings signed with Ed25519.</p>
          </div>
        </div>

        <div className="flex gap-2 mb-4 flex-wrap">
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
            className="bg-adv-card border border-adv-card px-3 py-2 rounded text-sm">
            <option value="">All categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filterPricing} onChange={e => setFilterPricing(e.target.value)}
            className="bg-adv-card border border-adv-card px-3 py-2 rounded text-sm">
            <option value="">All pricing</option>
            <option value="free">Free</option>
            <option value="per_call">Per call</option>
            <option value="subscription">Subscription</option>
            <option value="contact_for_quote">Quote</option>
          </select>
        </div>

        {error && <div className="bg-adv-red/10 text-adv-red p-3 rounded mb-3">{error}</div>}

        {loading ? (
          <div className="text-center text-adv-gray py-12">Loading directory…</div>
        ) : filtered.length === 0 ? (
          <div className="bg-adv-card rounded-lg p-8 text-center text-adv-gray">
            <Bot className="mx-auto mb-2 text-adv-gray/40" size={32} />
            No published agents match the filters. Publish an agent from the hub or pair with peer instances to see more.
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map(l => (
              <li key={l.id} className="bg-adv-card rounded-lg p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <code className="text-adv-teal text-xs">{l.listing_handle}</code>
                      <span className="text-xs text-adv-gray">{l.category}</span>
                      {l.trust_score != null && (
                        <span className="text-xs text-adv-gray flex items-center gap-1">
                          <ShieldCheck size={12} /> {(l.trust_score * 100).toFixed(0)}%
                        </span>
                      )}
                      <span className="text-xs text-adv-gold flex items-center gap-1">
                        <DollarSign size={12} /> {PRICING_LABEL[l.pricing_kind]}
                      </span>
                    </div>
                    <div className="font-medium">{l.display_name}</div>
                    <p className="text-sm text-adv-gray mt-1">{l.short_description}</p>
                    {l.jurisdictions.length > 0 && (
                      <div className="text-xs text-adv-gray mt-1 flex items-center gap-1">
                        <Globe2 size={12} /> {l.jurisdictions.join(', ')}
                      </div>
                    )}
                    {l.topic_tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {l.topic_tags.slice(0, 5).map(t => (
                          <code key={t} className="text-xs px-1.5 py-0.5 rounded bg-adv-dark text-adv-blue">{t}</code>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
