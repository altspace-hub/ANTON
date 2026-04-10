/**
 * CommunityMailPage.tsx
 *
 * 3-panel async mail client.
 * Left: folder list + compose. Center: mail list. Right: thread view.
 * Socket.io for real-time new-mail badge updates.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Mail, Send, Star, Archive, Trash2, FileText, Inbox,
  Plus, ChevronRight, Circle, Reply, X,
} from 'lucide-react';
import { getAuthHeader } from '../../lib/api';
import { connectCommunitySocket, disconnectCommunitySocket } from '../../lib/communitySocket';

// ── Types ─────────────────────────────────────────────────────────────────

interface MailItem {
  id: string;
  group_id: string | null;
  from_hash: string;
  to_hashes: string;   // JSON string
  cc_hashes: string;   // JSON string
  subject: string;
  body: string;
  thread_id: string | null;
  parent_id: string | null;
  folder: string;
  starred: number;
  draft: number;
  read_by: string;     // JSON string
  sent_at: string | null;
  created_at: string;
  thread?: MailItem[];
}

interface FolderCounts {
  inbox: number;
  drafts: number;
  starred: number;
}

type Folder = 'inbox' | 'sent' | 'drafts' | 'starred' | 'archive' | 'trash';

// ── Helpers ───────────────────────────────────────────────────────────────

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function myHash(): string {
  return localStorage.getItem('community-contact-hash') ?? '';
}

function isUnread(mail: MailItem): boolean {
  try {
    const readers: string[] = JSON.parse(mail.read_by ?? '[]');
    return !readers.includes(myHash());
  } catch { return false; }
}

// ── Compose Modal ─────────────────────────────────────────────────────────

interface ContactOption {
  contact_hash: string;
  display_name: string;
  endpoint?: string;
  x25519_public_key?: string;
}

function ComposeModal({ onClose, replyTo }: { onClose: () => void; replyTo?: MailItem }) {
  const [to, setTo] = useState(replyTo ? JSON.parse(replyTo.to_hashes ?? '[]').join(', ') : '');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState(replyTo ? `Re: ${replyTo.subject}` : '');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [showContactPicker, setShowContactPicker] = useState(false);

  useEffect(() => {
    async function loadContacts() {
      try {
        const res = await fetch('/api/community/connections', { headers: getAuthHeader() });
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data : data.connections ?? [];
          setContacts(list.filter((c: ContactOption & { status?: string }) => c.status === 'active' || c.status === 'accepted'));
        }
      } catch { /* ignore */ }
    }
    loadContacts();
  }, []);

  function addContact(hash: string) {
    const current = to.split(',').map((s: string) => s.trim()).filter(Boolean);
    if (!current.includes(hash)) {
      setTo(current.length > 0 ? `${to}, ${hash}` : hash);
    }
    setShowContactPicker(false);
  }

  function parseTo() { return to.split(',').map((s: string) => s.trim()).filter(Boolean); }
  function parseCc() { return cc.split(',').map((s: string) => s.trim()).filter(Boolean); }

  async function handleSend(draft = false) {
    if (!draft && parseTo().length === 0) { setError('At least one recipient required'); return; }
    setSending(true);
    setError(null);
    try {
      const endpoint = replyTo ? `/api/community/mail/${replyTo.id}/reply` : '/api/community/mail';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ toHashes: parseTo(), ccHashes: parseCc(), subject, body, draft }),
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error ?? 'Send failed'); }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed');
      setSending(false);
    }
  }

  // Autosave draft every 30s
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (body || subject) void handleSend(true);
    }, 30_000);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [body, subject]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-xl rounded-2xl border border-border bg-adv-card p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-bold text-adv-white">{replyTo ? 'Reply' : 'New Mail'}</h2>
          <button onClick={onClose} className="text-adv-gray hover:text-adv-white"><X className="h-4 w-4" /></button>
        </div>

        <label className="mb-1 block text-xs text-adv-gray">To</label>
        <div className="relative mb-3">
          <input
            value={to}
            onChange={e => setTo(e.target.value)}
            placeholder="Select a contact or type ANTON-XXXX-XXXX-XXXX-XXXX"
            className="w-full rounded-lg border border-border bg-adv-dark-2 px-3 py-2 pr-24 text-sm text-adv-white placeholder-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
          />
          <button
            type="button"
            onClick={() => setShowContactPicker(v => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 rounded border border-border bg-adv-dark px-2 py-1 text-xs text-adv-gray hover:text-adv-teal hover:border-adv-teal/40"
          >
            <Plus className="h-3 w-3" />
            Contacts
          </button>
          {showContactPicker && contacts.length > 0 && (
            <div className="absolute right-0 top-full z-10 mt-1 w-72 rounded-lg border border-border bg-adv-dark-2 shadow-xl max-h-48 overflow-y-auto">
              {contacts.map(c => (
                <button
                  key={c.contact_hash}
                  onClick={() => addContact(c.contact_hash)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-adv-card transition"
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-adv-teal-dim text-xs font-bold text-adv-teal">
                    {c.display_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-adv-white truncate">{c.display_name}</p>
                    <p className="font-mono text-xs text-adv-gray truncate">{c.contact_hash}</p>
                  </div>
                  {c.endpoint && <span className="text-xs text-adv-teal shrink-0">P2P</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <label className="mb-1 block text-xs text-adv-gray">CC (optional)</label>
        <input
          value={cc}
          onChange={e => setCc(e.target.value)}
          placeholder="ANTON-XXXX-XXXX-XXXX-XXXX, …"
          className="mb-3 w-full rounded-lg border border-border bg-adv-dark-2 px-3 py-2 text-sm text-adv-white placeholder-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
        />

        <label className="mb-1 block text-xs text-adv-gray">Subject</label>
        <input
          value={subject}
          onChange={e => setSubject(e.target.value)}
          placeholder="(no subject)"
          className="mb-3 w-full rounded-lg border border-border bg-adv-dark-2 px-3 py-2 text-sm text-adv-white placeholder-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
        />

        <label className="mb-1 block text-xs text-adv-gray">Message</label>
        <textarea
          autoFocus={!replyTo}
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={8}
          className="mb-4 w-full resize-none rounded-lg border border-border bg-adv-dark-2 px-3 py-2 text-sm text-adv-white placeholder-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
        />

        {error && <p className="mb-3 text-sm text-adv-red">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={() => handleSend(true)}
            disabled={sending}
            className="rounded-lg border border-border bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white transition hover:border-adv-teal/40"
          >
            Save Draft
          </button>
          <div className="flex-1" />
          <button onClick={onClose} className="rounded-lg border border-border bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white">
            Discard
          </button>
          <button
            onClick={() => handleSend(false)}
            disabled={sending || parseTo().length === 0}
            className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-semibold text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

const FOLDERS: { id: Folder; label: string; icon: React.ReactNode }[] = [
  { id: 'inbox',   label: 'Inbox',   icon: <Inbox className="h-4 w-4" /> },
  { id: 'sent',    label: 'Sent',    icon: <Send className="h-4 w-4" /> },
  { id: 'drafts',  label: 'Drafts',  icon: <FileText className="h-4 w-4" /> },
  { id: 'starred', label: 'Starred', icon: <Star className="h-4 w-4" /> },
  { id: 'archive', label: 'Archive', icon: <Archive className="h-4 w-4" /> },
  { id: 'trash',   label: 'Trash',   icon: <Trash2 className="h-4 w-4" /> },
];

export default function CommunityMailPage() {
  const [searchParams] = useSearchParams();
  const groupIdFilter = searchParams.get('groupId') ?? undefined;

  const [folder, setFolder] = useState<Folder>('inbox');
  const [mails, setMails] = useState<MailItem[]>([]);
  const [selected, setSelected] = useState<MailItem | null>(null);
  const [counts, setCounts] = useState<FolderCounts>({ inbox: 0, drafts: 0, starred: 0 });
  const [loading, setLoading] = useState(true);
  const [showCompose, setShowCompose] = useState(false);
  const [replyTo, setReplyTo] = useState<MailItem | undefined>(undefined);

  const me = myHash();

  const loadMails = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ folder });
      if (groupIdFilter) qs.set('groupId', groupIdFilter);
      const [mailRes, countRes] = await Promise.all([
        fetch(`/api/community/mail?${qs}`, { headers: getAuthHeader() }),
        fetch('/api/community/mail/folders/counts', { headers: getAuthHeader() }),
      ]);
      if (mailRes.ok) setMails(await mailRes.json());
      if (countRes.ok) setCounts(await countRes.json());
    } finally {
      setLoading(false);
    }
  }, [folder, groupIdFilter]);

  useEffect(() => { void loadMails(); }, [loadMails]);

  // Socket for real-time new mail badge
  useEffect(() => {
    if (!me) return;
    const sock = connectCommunitySocket(me);
    sock.on('mail:new', () => { void loadMails(); });
    return () => {
      sock.off('mail:new');
      disconnectCommunitySocket();
    };
  }, [me, loadMails]);

  async function selectMail(m: MailItem) {
    setSelected(m);
    // Mark as read
    if (isUnread(m)) {
      await fetch(`/api/community/mail/${m.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ markRead: true }),
      });
      void loadMails();
    }
    // Load thread
    const res = await fetch(`/api/community/mail/${m.id}`, { headers: getAuthHeader() });
    if (res.ok) { const detail = await res.json() as MailItem; setSelected(detail); }
  }

  async function toggleStar(m: MailItem) {
    await fetch(`/api/community/mail/${m.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ starred: !m.starred }),
    });
    void loadMails();
  }

  async function moveTo(m: MailItem, dest: Folder) {
    await fetch(`/api/community/mail/${m.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ folder: dest }),
    });
    setSelected(null);
    void loadMails();
  }

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden">
      {/* Panel 1: Folder list */}
      <div className="flex w-48 shrink-0 flex-col border-r border-border bg-adv-dark-2">
        <div className="p-3">
          <button
            onClick={() => { setReplyTo(undefined); setShowCompose(true); }}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-adv-teal px-3 py-2 text-sm font-semibold text-adv-dark transition hover:bg-adv-teal-dark"
          >
            <Plus className="h-4 w-4" /> Compose
          </button>
        </div>
        <nav className="flex flex-col gap-0.5 px-2 pb-2">
          {FOLDERS.map(f => {
            const badge = f.id === 'inbox' ? counts.inbox : f.id === 'drafts' ? counts.drafts : f.id === 'starred' ? counts.starred : undefined;
            return (
              <button
                key={f.id}
                onClick={() => { setFolder(f.id); setSelected(null); }}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${folder === f.id ? 'bg-adv-teal-dim text-adv-teal' : 'text-adv-gray hover:bg-adv-card hover:text-adv-off-white'}`}
              >
                {f.icon}
                <span className="flex-1 text-left">{f.label}</span>
                {badge !== undefined && badge > 0 && (
                  <span className="rounded-full bg-adv-teal px-1.5 py-0.5 text-xs font-semibold text-adv-dark">{badge}</span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Panel 2: Mail list */}
      <div className="flex w-72 shrink-0 flex-col border-r border-border overflow-y-auto">
        <div className="border-b border-border p-3">
          <p className="text-sm font-semibold text-adv-white capitalize">{folder}</p>
        </div>
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-adv-teal border-t-transparent" />
          </div>
        ) : mails.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <Mail className="h-8 w-8 text-adv-gray" />
            <p className="text-sm text-adv-gray">No mail here</p>
          </div>
        ) : (
          mails.map(m => (
            <button
              key={m.id}
              onClick={() => void selectMail(m)}
              className={`flex w-full items-start gap-3 border-b border-border/50 px-3 py-3 text-left transition hover:bg-adv-teal-soft ${selected?.id === m.id ? 'bg-adv-teal-soft' : ''}`}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-adv-teal-dim text-xs font-semibold text-adv-teal">
                {m.from_hash.slice(6, 8)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <p className={`text-sm truncate ${isUnread(m) ? 'font-semibold text-adv-white' : 'text-adv-off-white'}`}>
                    {m.from_hash === me ? 'You' : m.from_hash.slice(0, 14)}
                  </p>
                  <span className="shrink-0 text-xs text-adv-gray">{timeAgo(m.sent_at ?? m.created_at)}</span>
                </div>
                <p className="text-xs truncate text-adv-off-white">{m.subject}</p>
                <p className="text-xs truncate text-adv-gray">{m.body.slice(0, 60)}</p>
              </div>
              {isUnread(m) && <Circle className="mt-1 h-2 w-2 shrink-0 fill-adv-teal text-adv-teal" />}
            </button>
          ))
        )}
      </div>

      {/* Panel 3: Thread / mail detail */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {!selected ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <Mail className="h-12 w-12 text-adv-gray" />
            <p className="text-adv-gray">Select a message to read</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="border-b border-border p-4">
              <div className="mb-1 flex items-start justify-between gap-3">
                <h2 className="text-lg font-bold text-adv-white leading-tight">{selected.subject}</h2>
                <div className="flex shrink-0 gap-1">
                  <button onClick={() => toggleStar(selected)} className="rounded-lg p-1.5 text-adv-gray transition hover:text-adv-gold" title="Star">
                    <Star className={`h-4 w-4 ${selected.starred ? 'fill-adv-gold text-adv-gold' : ''}`} />
                  </button>
                  <button onClick={() => moveTo(selected, 'archive')} className="rounded-lg p-1.5 text-adv-gray transition hover:text-adv-off-white" title="Archive">
                    <Archive className="h-4 w-4" />
                  </button>
                  <button onClick={() => moveTo(selected, 'trash')} className="rounded-lg p-1.5 text-adv-gray transition hover:text-adv-red" title="Trash">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <p className="text-xs text-adv-gray">
                From: <span className="text-adv-off-white">{selected.from_hash}</span>
                {' · '}To: <span className="text-adv-off-white">{JSON.parse(selected.to_hashes ?? '[]').join(', ')}</span>
                {' · '}{timeAgo(selected.sent_at ?? selected.created_at)}
              </p>
            </div>

            {/* Thread */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Render thread messages if available, else just the single message */}
              {(selected.thread && selected.thread.length > 0 ? selected.thread : [selected]).map(msg => (
                <div key={msg.id} className={`rounded-xl border p-4 ${msg.from_hash === me ? 'border-adv-teal/20 bg-adv-teal-soft ml-8' : 'border-border bg-adv-card'}`}>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-adv-gray">
                      {msg.from_hash === me ? 'You' : msg.from_hash.slice(0, 20)}
                    </span>
                    <span className="text-xs text-adv-gray">{timeAgo(msg.sent_at ?? msg.created_at)}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-adv-off-white">{msg.body}</p>
                </div>
              ))}
            </div>

            {/* Reply bar */}
            <div className="border-t border-border p-3">
              <button
                onClick={() => { setReplyTo(selected); setShowCompose(true); }}
                className="flex items-center gap-2 rounded-lg border border-border bg-adv-dark-2 px-4 py-2 text-sm text-adv-off-white transition hover:border-adv-teal/40 hover:text-adv-teal"
              >
                <Reply className="h-4 w-4" />
                Reply
                <ChevronRight className="h-3 w-3 ml-auto text-adv-gray" />
              </button>
            </div>
          </>
        )}
      </div>

      {showCompose && (
        <ComposeModal
          onClose={() => { setShowCompose(false); setReplyTo(undefined); void loadMails(); }}
          replyTo={replyTo}
        />
      )}
    </div>
  );
}
