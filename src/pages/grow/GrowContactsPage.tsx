/**
 * GrowContactsPage.tsx
 *
 * Contacts list for the Grow Pillar — search, table, and inline add form.
 * Route: /grow/contacts
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Users,
  Search,
  UserPlus,
  Loader2,
  AlertCircle,
  X,
  Mail,
  Phone,
  Building2,
  Trash2,
  Tag,
  ArrowLeft,
} from 'lucide-react';
import { getAuthHeader, fetchWithAuth } from '../../lib/api';

// ── Types ────────────────────────────────────────────────────────────────────

interface Contact {
  id: string;
  first_name: string;
  last_name: string;
  title: string | null;
  organisation_name: string | null;
  organisation_id: string | null;
  email: string | null;
  phone: string | null;
  last_contact: string | null;
  tags: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Component ────────────────────────────────────────────────────────────────

export default function GrowContactsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showAddForm, setShowAddForm] = useState(searchParams.get('action') === 'add');

  // Add form state
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newOrganisation, setNewOrganisation] = useState('');
  const [newTags, setNewTags] = useState('');
  const [saving, setSaving] = useState(false);

  const loadContacts = useCallback(async (searchQuery?: string) => {
    try {
      setError(null);
      const url = searchQuery
        ? `/api/grow/contacts?search=${encodeURIComponent(searchQuery)}`
        : '/api/grow/contacts';
      const res = await fetch(url, { headers: getAuthHeader() });
      if (!res.ok) throw new Error('Failed to load contacts');
      const data = await res.json();
      setContacts(Array.isArray(data) ? data : data.contacts ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load contacts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      loadContacts(search || undefined);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, loadContacts]);

  async function handleAddContact() {
    if (!newFirstName.trim() || !newLastName.trim()) return;
    setSaving(true);
    try {
      const res = await fetchWithAuth('/api/grow/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: newFirstName.trim(),
          lastName: newLastName.trim(),
          title: newTitle.trim() || undefined,
          email: newEmail.trim() || undefined,
          phone: newPhone.trim() || undefined,
          notes: newOrganisation.trim() || undefined,
          tags: newTags.trim() ? newTags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to create contact');
      }
      // Reset form and reload
      setNewFirstName('');
      setNewLastName('');
      setNewTitle('');
      setNewEmail('');
      setNewPhone('');
      setNewOrganisation('');
      setNewTags('');
      setShowAddForm(false);
      setSearchParams({});
      await loadContacts();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create contact');
    } finally {
      setSaving(false);
    }
  }

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
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-adv-blue/10">
              <Users className="h-5 w-5 text-adv-blue" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-adv-off-white">Contacts</h1>
              <p className="text-xs text-adv-gray">
                {contacts.length} contact{contacts.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-semibold text-adv-dark transition hover:bg-adv-teal-dark"
          >
            <UserPlus className="h-4 w-4" />
            Add Contact
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
            placeholder="Search contacts by name, email, organisation..."
            className="w-full rounded-lg border border-border bg-adv-card py-2.5 pl-10 pr-4 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none"
          />
        </div>

        {/* Add Contact Modal */}
        {showAddForm && (
          <div className="rounded-xl border border-adv-teal/30 bg-adv-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-adv-off-white">New Contact</h3>
              <button
                onClick={() => { setShowAddForm(false); setSearchParams({}); }}
                className="text-adv-gray transition hover:text-adv-off-white"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-adv-gray">First Name *</label>
                <input
                  type="text"
                  value={newFirstName}
                  onChange={(e) => setNewFirstName(e.target.value)}
                  className="w-full rounded-lg border border-border bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none"
                  placeholder="John"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-adv-gray">Last Name *</label>
                <input
                  type="text"
                  value={newLastName}
                  onChange={(e) => setNewLastName(e.target.value)}
                  className="w-full rounded-lg border border-border bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none"
                  placeholder="Doe"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-adv-gray">Title</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full rounded-lg border border-border bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none"
                  placeholder="Head of Compliance"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-adv-gray">Organisation</label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-adv-gray" />
                  <input
                    type="text"
                    value={newOrganisation}
                    onChange={(e) => setNewOrganisation(e.target.value)}
                    className="w-full rounded-lg border border-border bg-adv-dark-2 py-2 pl-9 pr-3 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none"
                    placeholder="Acme Corp"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-adv-gray">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-adv-gray" />
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full rounded-lg border border-border bg-adv-dark-2 py-2 pl-9 pr-3 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none"
                    placeholder="john@example.com"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-adv-gray">Phone</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-adv-gray" />
                  <input
                    type="tel"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="w-full rounded-lg border border-border bg-adv-dark-2 py-2 pl-9 pr-3 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none"
                    placeholder="+46 70 123 4567"
                  />
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs text-adv-gray">Tags (comma-separated)</label>
                <div className="relative">
                  <Tag className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-adv-gray" />
                  <input
                    type="text"
                    value={newTags}
                    onChange={(e) => setNewTags(e.target.value)}
                    className="w-full rounded-lg border border-border bg-adv-dark-2 py-2 pl-9 pr-3 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none"
                    placeholder="compliance, board member, prospect"
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
                onClick={handleAddContact}
                disabled={saving || !newFirstName.trim() || !newLastName.trim()}
                className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-semibold text-adv-dark transition hover:bg-adv-teal-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {saving ? 'Saving...' : 'Add Contact'}
              </button>
            </div>
          </div>
        )}

        {/* Contacts table */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-adv-gray" />
          </div>
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <AlertCircle className="mb-3 h-10 w-10 text-adv-gray" />
            <p className="text-sm text-adv-gray">
              {search ? 'No contacts match your search.' : 'No contacts yet. Add your first contact to get started.'}
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
                    Title
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-adv-gray">
                    Organisation
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-adv-gray">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-adv-gray">
                    Last Contact
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-adv-gray">
                    Tags
                  </th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact) => (
                  <tr
                    key={contact.id}
                    onClick={() => navigate(`/grow/contacts/${contact.id}`)}
                    className="cursor-pointer border-b border-border bg-adv-card transition hover:bg-adv-dark-2"
                  >
                    <td className="px-4 py-3 font-medium text-adv-off-white whitespace-nowrap">
                      {contact.first_name} {contact.last_name}
                    </td>
                    <td className="px-4 py-3 text-adv-gray whitespace-nowrap">
                      {contact.title ?? '-'}
                    </td>
                    <td className="px-4 py-3 text-adv-gray whitespace-nowrap">
                      {contact.organisation_name ?? '-'}
                    </td>
                    <td className="px-4 py-3 text-adv-gray whitespace-nowrap">
                      {contact.email ?? '-'}
                    </td>
                    <td className="px-4 py-3 text-adv-gray whitespace-nowrap">
                      {formatDate(contact.last_contact)}
                    </td>
                    <td className="px-4 py-3">
                      {contact.tags ? (
                        <div className="flex flex-wrap gap-1">
                          {contact.tags.split(',').slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="inline-flex rounded-full bg-adv-teal-dim px-2 py-0.5 text-[10px] font-medium text-adv-teal"
                            >
                              {tag.trim()}
                            </span>
                          ))}
                          {contact.tags.split(',').length > 3 && (
                            <span className="text-[10px] text-adv-gray">
                              +{contact.tags.split(',').length - 3}
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
                          if (confirm('Delete this contact?')) {
                            fetchWithAuth(`/api/grow/contacts/${contact.id}`, { method: 'DELETE' }).then(() => loadContacts());
                          }
                        }}
                        className="p-1 rounded text-adv-gray/50 hover:text-adv-red transition-colors"
                        title="Delete contact"
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
