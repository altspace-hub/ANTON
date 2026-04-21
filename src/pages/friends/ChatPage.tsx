// ── ChatPage.tsx ────────────────────────────────────────────────────────────
// /friends/:id/chat — 1:1 E2E-encrypted chat. Rides on the existing Beehive
// transport (see community-service.ts); v1 renders messages reverse-chrono
// and uses the community messages endpoint under the hood.

import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Send, Lock } from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';

interface Contact { id: string; display_name: string; peer_public_key: string; }
interface Message {
  id: string;
  from_public_key: string;
  to_public_key: string;
  body: string;
  sent_at: string;
  direction: 'in' | 'out';
}

export default function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const [contact, setContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const endRef = useRef<HTMLDivElement | null>(null);

  async function load() {
    const cRes = await fetchWithAuth('/api/friends/contacts');
    if (cRes.ok) {
      const json = await cRes.json() as { contacts: Contact[] };
      setContact(json.contacts.find(c => c.id === id) ?? null);
    }
    if (id) {
      const mRes = await fetchWithAuth(`/api/friends/chat/${id}/messages`);
      if (mRes.ok) {
        const json = await mRes.json() as { messages: Message[] };
        setMessages(json.messages ?? []);
      }
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, [id]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  async function send() {
    if (!draft.trim() || !id || sending) return;
    setSending(true);
    const body = draft.trim();
    setDraft('');
    const res = await fetchWithAuth(`/api/friends/chat/${id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });
    if (res.ok) await load();
    setSending(false);
  }

  if (loading) return <div className="p-6 text-adv-gray">Loading…</div>;
  if (!contact) return (
    <div className="p-6">
      <Link to="/friends" className="text-adv-teal">← Friends</Link>
      <div className="mt-4 text-adv-red">Contact not found.</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white flex flex-col">
      <header className="border-b border-border bg-adv-card p-4 flex items-center gap-3">
        <Link to={`/friends/${contact.id}`} className="text-adv-teal inline-flex items-center gap-1 text-sm">
          <ArrowLeft size={14} /> Back
        </Link>
        <div className="flex-1">
          <div className="font-semibold">{contact.display_name}</div>
          <div className="text-xs text-adv-gray inline-flex items-center gap-1">
            <Lock size={11} /> End-to-end encrypted (Beehive)
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-2 max-w-3xl mx-auto w-full">
        {messages.length === 0 && (
          <div className="text-center text-adv-gray text-sm py-12">
            Nothing here yet. Say hi.
          </div>
        )}
        {messages.map(m => (
          <div
            key={m.id}
            className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
              m.direction === 'out'
                ? 'ml-auto bg-adv-teal text-adv-dark'
                : 'mr-auto bg-adv-card border border-border'
            }`}
          >
            <div>{m.body}</div>
            <div className={`text-[10px] mt-1 ${m.direction === 'out' ? 'text-adv-dark/60' : 'text-adv-gray'}`}>
              {new Date(m.sent_at).toLocaleTimeString()}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </main>

      <footer className="border-t border-border bg-adv-card p-3">
        <div className="max-w-3xl mx-auto flex items-end gap-2">
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
            placeholder="Message…"
            rows={1}
            className="flex-1 resize-none bg-adv-dark border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-adv-teal"
          />
          <button
            onClick={() => void send()}
            disabled={!draft.trim() || sending}
            className="px-4 py-2 bg-adv-teal text-adv-dark rounded text-sm font-medium disabled:opacity-50 inline-flex items-center gap-1"
          >
            <Send size={14} /> Send
          </button>
        </div>
      </footer>
    </div>
  );
}
