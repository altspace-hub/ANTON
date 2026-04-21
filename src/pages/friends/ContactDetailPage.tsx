// ── ContactDetailPage.tsx ───────────────────────────────────────────────────
// /friends/:id — 1:1 contact detail. Per Q6, the share-setting toggle lets
// the user pick among all 3 privacy modes per contact.

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Volume2, VolumeX, MessageSquare, Users as UsersIcon } from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';

interface Contact {
  id: string;
  display_name: string;
  peer_public_key: string;
  peer_portal_id: string | null;
  contact_status: string;
  activity_share_setting: 'private' | 'me' | 'friends-circle';
  muted: boolean;
}

const SHARE_OPTIONS: Array<{ id: Contact['activity_share_setting']; label: string; desc: string }> = [
  { id: 'private',        label: 'Private',         desc: 'Nothing shared with this contact.' },
  { id: 'me',             label: 'Me only',         desc: 'Events recorded for you; not pushed to this contact.' },
  { id: 'friends-circle', label: 'Friends circle',  desc: 'This contact sees your public + friends-circle activity.' },
];

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetchWithAuth('/api/friends/contacts');
    if (res.ok) {
      const json = await res.json() as { contacts: Contact[] };
      const found = json.contacts.find(c => c.id === id) ?? null;
      setContact(found);
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, [id]);

  async function updateField(patch: Partial<Contact>) {
    if (!id) return;
    await fetchWithAuth(`/api/friends/contacts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    await load();
  }

  if (loading) return <div className="p-6 text-adv-gray">Loading…</div>;
  if (!contact) return (
    <div className="p-6">
      <Link to="/friends" className="text-adv-teal">← Friends</Link>
      <div className="mt-4 text-adv-red">Contact not found.</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <Link to="/friends" className="text-sm text-adv-teal inline-flex items-center gap-1">
          <ArrowLeft size={14} /> Back
        </Link>
        <header>
          <h1 className="text-2xl font-semibold">{contact.display_name}</h1>
          <div className="text-xs text-adv-gray mt-1 break-all">pubkey: {contact.peer_public_key.slice(0, 16)}…</div>
          {contact.peer_portal_id && (
            <Link to={`/portals/p/${encodeURIComponent(contact.peer_portal_id)}`} className="text-xs text-adv-teal hover:underline">
              View portal →
            </Link>
          )}
        </header>

        <div className="flex items-center gap-2">
          <Link
            to={`/friends/${contact.id}/chat`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-adv-teal text-adv-dark rounded text-sm font-medium"
          >
            <MessageSquare size={14} /> 1:1 chat
          </Link>
          <Link
            to={`/friends/${contact.id}/beehive`}
            className="inline-flex items-center gap-2 px-4 py-2 border border-border rounded text-sm hover:bg-adv-card"
          >
            <UsersIcon size={14} /> Start Beehive
          </Link>
          <button
            onClick={() => void updateField({ muted: !contact.muted })}
            className="inline-flex items-center gap-2 px-4 py-2 border border-border rounded text-sm hover:bg-adv-card"
          >
            {contact.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            {contact.muted ? 'Unmute' : 'Mute'}
          </button>
        </div>

        {/* Q6: user picks one of the 3 share settings per contact */}
        <section className="rounded-lg border border-border bg-adv-card p-4 space-y-3">
          <div className="text-sm font-medium">Activity sharing with this contact</div>
          <div className="space-y-2">
            {SHARE_OPTIONS.map(opt => (
              <label key={opt.id} className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="share"
                  value={opt.id}
                  checked={contact.activity_share_setting === opt.id}
                  onChange={() => void updateField({ activity_share_setting: opt.id })}
                  className="mt-1 accent-adv-teal"
                />
                <div>
                  <div className="text-sm">{opt.label}</div>
                  <div className="text-xs text-adv-gray">{opt.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-adv-red/40 bg-adv-red/5 p-4 space-y-2">
          <div className="text-sm font-medium text-adv-red">Danger zone</div>
          <button
            onClick={async () => {
              if (!window.confirm('Block this contact? They will be removed from your list and cannot route messages to you.')) return;
              await updateField({ contact_status: 'blocked' });
            }}
            className="text-sm text-adv-red hover:underline"
          >
            Block contact
          </button>
        </section>
      </div>
    </div>
  );
}
