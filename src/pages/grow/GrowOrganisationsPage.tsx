/**
 * GrowOrganisationsPage.tsx
 *
 * Organisations list for the Grow Pillar — search, table, and inline add form.
 * Route: /grow/organisations
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Building2,
  Search,
  Plus,
  Loader2,
  AlertCircle,
  X,
  Tag,
  Users,
  Factory,
  Trash2,
  ArrowLeft,
} from 'lucide-react';
import { getAuthHeader, fetchWithAuth } from '../../lib/api';

// ── Types ────────────────────────────────────────────────────────────────────

interface Organisation {
  id: string;
  name: string;
  industry: string | null;
  size: string | null;
  contact_count: number;
  tags: string | null;
  website: string | null;
  created_at: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function GrowOrganisationsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [organisations, setOrganisations] = useState<Organisation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showAddForm, setShowAddForm] = useState(searchParams.get('action') === 'add');

  // Add form state
  const [newName, setNewName] = useState('');
  const [newIndustry, setNewIndustry] = useState('');
  const [newSize, setNewSize] = useState('');
  const [newWebsite, setNewWebsite] = useState('');
  const [newTags, setNewTags] = useState('');
  const [saving, setSaving] = useState(false);

  const loadOrganisations = useCallback(async (searchQuery?: string) => {
    try {
      setError(null);
      const url = searchQuery
        ? `/api/grow/organisations?search=${encodeURIComponent(searchQuery)}`
        : '/api/grow/organisations';
      const res = await fetch(url, { headers: getAuthHeader() });
      if (!res.ok) throw new Error('Failed to load organisations');
      const data = await res.json();
      setOrganisations(Array.isArray(data) ? data : data.organisations ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load organisations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrganisations();
  }, [loadOrganisations]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      loadOrganisations(search || undefined);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, loadOrganisations]);

  async function handleAddOrganisation() {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const res = await fetchWithAuth('/api/grow/organisations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          industry: newIndustry.trim() || undefined,
          size: newSize || undefined,
          website: newWebsite.trim() || undefined,
          tags: newTags.trim() ? newTags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to create organisation');
      }
      setNewName('');
      setNewIndustry('');
      setNewSize('');
      setNewWebsite('');
      setNewTags('');
      setShowAddForm(false);
      setSearchParams({});
      await loadOrganisations();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create organisation');
    } finally {
      setSaving(false);
    }
  }

  // Values must match backend Zod enum: startup | small | medium | large | enterprise
  const SIZE_OPTIONS = [
    { value: '', label: 'Select size...' },
    { value: 'startup', label: 'Startup (1-9)' },
    { value: 'small', label: 'Small (10-49)' },
    { value: 'medium', label: 'Medium (50-249)' },
    { value: 'large', label: 'Large (250-999)' },
    { value: 'enterprise', label: 'Enterprise (1000+)' },
  ];

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-adv-dark">
      {/* ── Page header ─────────────────────────────────────────────── */}
      <div className="border-b border-border bg-adv-dark-2 px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/grow')}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-adv-gray transition hover:bg-adv-card hover:text-adv-off-white"
              aria-label="Back to Grow"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10">
              <Building2 className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-adv-off-white">Organisations</h1>
              <p className="text-xs text-adv-gray">
                {organisations.length} organisation{organisations.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-semibold text-adv-dark transition hover:bg-adv-teal-dark"
          >
            <Plus className="h-4 w-4" />
            Add Organisation
          </button>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────── */}
      <div className="flex-1 px-6 py-6 max-w-6xl mx-auto w-full space-y-4">
        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-adv-gray" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search organisations by name, industry, tags..."
            className="w-full rounded-lg border border-border bg-adv-card py-2.5 pl-10 pr-4 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none"
          />
        </div>

        {/* Add Organisation Form */}
        {showAddForm && (
          <div className="rounded-xl border border-adv-teal/30 bg-adv-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-adv-off-white">New Organisation</h3>
              <button
                onClick={() => { setShowAddForm(false); setSearchParams({}); }}
                className="text-adv-gray transition hover:text-adv-off-white"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs text-adv-gray">Name *</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full rounded-lg border border-border bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none"
                  placeholder="Acme Corporation"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-adv-gray">Industry</label>
                <div className="relative">
                  <Factory className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-adv-gray" />
                  <input
                    type="text"
                    value={newIndustry}
                    onChange={(e) => setNewIndustry(e.target.value)}
                    className="w-full rounded-lg border border-border bg-adv-dark-2 py-2 pl-9 pr-3 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none"
                    placeholder="Financial Services"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-adv-gray">Size</label>
                <select
                  value={newSize}
                  onChange={(e) => setNewSize(e.target.value)}
                  className="w-full rounded-lg border border-border bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
                >
                  {SIZE_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-adv-gray">Website</label>
                <input
                  type="url"
                  value={newWebsite}
                  onChange={(e) => setNewWebsite(e.target.value)}
                  className="w-full rounded-lg border border-border bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none"
                  placeholder="https://example.com"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-adv-gray">Tags (comma-separated)</label>
                <div className="relative">
                  <Tag className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-adv-gray" />
                  <input
                    type="text"
                    value={newTags}
                    onChange={(e) => setNewTags(e.target.value)}
                    className="w-full rounded-lg border border-border bg-adv-dark-2 py-2 pl-9 pr-3 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none"
                    placeholder="fintech, prospect, tier-1"
                  />
                </div>
              </div>
            </div>
            {error && <p className="mt-3 text-sm text-adv-red">{error}</p>}
            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                onClick={() => { setShowAddForm(false); setSearchParams({}); }}
                className="rounded-lg px-4 py-2 text-sm text-adv-gray transition hover:text-adv-off-white"
              >
                Cancel
              </button>
              <button
                onClick={handleAddOrganisation}
                disabled={saving || !newName.trim()}
                className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-semibold text-adv-dark transition hover:bg-adv-teal-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {saving ? 'Saving...' : 'Add Organisation'}
              </button>
            </div>
          </div>
        )}

        {/* Organisations table */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-adv-gray" />
          </div>
        ) : organisations.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <AlertCircle className="mb-3 h-10 w-10 text-adv-gray" />
            <p className="text-sm text-adv-gray">
              {search
                ? 'No organisations match your search.'
                : 'No organisations yet. Add your first organisation to get started.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-adv-dark-2">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-adv-gray">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-adv-gray">
                    Industry
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-adv-gray">
                    Size
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-adv-gray">
                    Contacts
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-adv-gray">
                    Tags
                  </th>
                </tr>
              </thead>
              <tbody>
                {organisations.map((org) => (
                  <tr
                    key={org.id}
                    onClick={() => navigate(`/grow/organisations/${org.id}`)}
                    className="cursor-pointer border-b border-border bg-adv-card transition hover:bg-adv-dark-2"
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-500/10">
                          <Building2 className="h-4 w-4 text-purple-400" />
                        </div>
                        <span className="font-medium text-adv-off-white">{org.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-adv-gray whitespace-nowrap">
                      {org.industry ?? '-'}
                    </td>
                    <td className="px-4 py-3 text-adv-gray whitespace-nowrap">
                      {org.size ?? '-'}
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 text-adv-gray">
                        <Users className="h-3 w-3" />
                        {org.contact_count}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {org.tags ? (
                        <div className="flex flex-wrap gap-1">
                          {org.tags.split(',').slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="inline-flex rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-medium text-purple-400"
                            >
                              {tag.trim()}
                            </span>
                          ))}
                          {org.tags.split(',').length > 3 && (
                            <span className="text-[10px] text-adv-gray">
                              +{org.tags.split(',').length - 3}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-adv-gray">-</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm('Delete this organisation?')) {
                            fetchWithAuth(`/api/grow/organisations/${org.id}`, { method: 'DELETE' }).then(() => loadOrganisations());
                          }
                        }}
                        className="p-1 rounded text-adv-gray/50 hover:text-adv-red transition-colors"
                        title="Delete organisation"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
