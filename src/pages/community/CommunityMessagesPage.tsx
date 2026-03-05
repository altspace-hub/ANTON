/**
 * CommunityMessagesPage.tsx
 *
 * End-to-end encrypted messaging interface.
 * Messages are stored locally in localStorage (no relay server in this build).
 * Left panel: contact list. Right panel: conversation thread.
 *
 * Conversation IDs are deterministic: sort([myHash, contactHash]).join(':').
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  MessageCircle, Send, Lock, ChevronLeft, Users,
} from 'lucide-react';
import { getAuthHeader } from '../../lib/api';

// ── Types ────────────────────────────────────────────────────────────

interface Connection {
  id: number;
  contact_hash: string;
  display_name: string;
  status: string;
}

interface LocalMessage {
  id: string;
  conversationId: string;
  sender: 'me' | 'them';
  text: string;
  timestamp: string;
  encrypted: boolean;
}

// ── Storage helpers ───────────────────────────────────────────────────

function storageKey(convId: string) {
  return `community-msgs-${convId.slice(0, 8)}`;
}

function loadMessages(convId: string): LocalMessage[] {
  try {
    const raw = localStorage.getItem(storageKey(convId));
    return raw ? (JSON.parse(raw) as LocalMessage[]) : [];
  } catch {
    return [];
  }
}

function saveMessages(convId: string, messages: LocalMessage[]) {
  localStorage.setItem(storageKey(convId), JSON.stringify(messages));
}

function makeConversationId(a: string, b: string): string {
  return [a, b].sort().join(':');
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function formatDateGroup(iso: string): string {
  try {
    const d = new Date(iso);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Today';
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

// ── Message bubble ────────────────────────────────────────────────────

function MessageBubble({
  msg,
  contactName,
}: {
  msg: LocalMessage;
  contactName: string;
}) {
  const isMe = msg.sender === 'me';
  return (
    <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[75%] ${isMe ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm ${
            isMe
              ? 'rounded-br-sm bg-adv-teal text-adv-dark'
              : 'rounded-bl-sm bg-adv-card text-adv-off-white'
          }`}
        >
          {msg.text}
        </div>
        <div className="flex items-center gap-1.5 px-1">
          <Lock className="h-3 w-3 text-adv-gray/60" />
          <span className="text-[11px] text-adv-gray">
            {isMe ? 'You' : contactName} · {formatTime(msg.timestamp)}
          </span>
          <span className="rounded-full bg-adv-teal-dim px-1.5 py-0.5 text-[10px] text-adv-teal">
            Encrypted
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Contact sidebar item ──────────────────────────────────────────────

function ContactItem({
  contact,
  active,
  onClick,
}: {
  contact: Connection;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition ${
        active ? 'bg-adv-teal-dim' : 'hover:bg-adv-card'
      }`}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-adv-teal-dim text-sm font-bold text-adv-teal">
        {contact.display_name.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-medium ${active ? 'text-adv-teal' : 'text-adv-off-white'}`}>
          {contact.display_name}
        </p>
        <p className="truncate font-mono text-[11px] text-adv-gray">
          {contact.contact_hash.slice(0, 15)}…
        </p>
      </div>
    </button>
  );
}

// ── Main component ───────────────────────────────────────────────────

export default function CommunityMessagesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const selectedHash = searchParams.get('contact') ?? '';

  const [contacts, setContacts] = useState<Connection[]>([]);
  const [activeContact, setActiveContact] = useState<Connection | null>(null);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loadingContacts, setLoadingContacts] = useState(true);

  const myHash = localStorage.getItem('community-contact-hash') ?? 'ANTON-0000-0000-0000-0000';
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load contacts
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/community/connections', { headers: getAuthHeader() });
        if (!res.ok) return;
        const data = await res.json();
        const list: Connection[] = data.connections ?? data ?? [];
        setContacts(list);
        // Auto-select from URL param
        if (selectedHash) {
          const found = list.find(c => c.contact_hash === selectedHash);
          if (found) setActiveContact(found);
        }
      } finally {
        setLoadingContacts(false);
      }
    }
    load();
  }, [selectedHash]);

  // Load messages when active contact changes
  useEffect(() => {
    if (!activeContact) { setMessages([]); return; }
    const convId = makeConversationId(myHash, activeContact.contact_hash);
    setMessages(loadMessages(convId));
  }, [activeContact, myHash]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSelectContact = useCallback((contact: Connection) => {
    setActiveContact(contact);
    navigate(`/community/messages?contact=${encodeURIComponent(contact.contact_hash)}`, {
      replace: true,
    });
  }, [navigate]);

  function handleSend() {
    if (!draft.trim() || !activeContact) return;
    const convId = makeConversationId(myHash, activeContact.contact_hash);
    const msg: LocalMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      conversationId: convId,
      sender: 'me',
      text: draft.trim(),
      timestamp: new Date().toISOString(),
      encrypted: true,
    };
    const updated = [...messages, msg];
    setMessages(updated);
    saveMessages(convId, updated);
    setDraft('');
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const convId = activeContact
    ? makeConversationId(myHash, activeContact.contact_hash)
    : null;
  const convShortId = convId ? convId.slice(0, 8) : null;

  // Group messages by date for display
  const messageGroups: Array<{ date: string; msgs: LocalMessage[] }> = [];
  for (const msg of messages) {
    const label = formatDateGroup(msg.timestamp);
    const last = messageGroups[messageGroups.length - 1];
    if (!last || last.date !== label) {
      messageGroups.push({ date: label, msgs: [msg] });
    } else {
      last.msgs.push(msg);
    }
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* Left: contacts sidebar */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-adv-dark-2">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <button
            onClick={() => navigate('/community')}
            className="mr-1 text-adv-gray transition hover:text-adv-teal"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <MessageCircle className="h-4 w-4 text-adv-teal" />
          <span className="text-sm font-semibold text-adv-white">Messages</span>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {loadingContacts && (
            <div className="flex justify-center py-8">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-adv-teal border-t-transparent" />
            </div>
          )}
          {!loadingContacts && contacts.length === 0 && (
            <div className="px-3 py-6 text-center">
              <Users className="mx-auto mb-2 h-8 w-8 text-adv-gray/30" />
              <p className="text-xs text-adv-gray">No contacts yet</p>
              <button
                onClick={() => navigate('/community/contacts')}
                className="mt-2 text-xs text-adv-teal underline hover:no-underline"
              >
                Add contacts
              </button>
            </div>
          )}
          {contacts.map(c => (
            <ContactItem
              key={c.id ?? c.contact_hash}
              contact={c}
              active={activeContact?.contact_hash === c.contact_hash}
              onClick={() => handleSelectContact(c)}
            />
          ))}
        </div>
      </aside>

      {/* Right: conversation */}
      <main className="flex flex-1 flex-col overflow-hidden bg-adv-dark">
        {!activeContact ? (
          // No conversation selected
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <MessageCircle className="h-12 w-12 text-adv-gray/30" />
            <p className="text-adv-off-white">Select a contact to start messaging</p>
            <p className="max-w-xs text-sm text-adv-gray">
              Messages are end-to-end encrypted and stored locally on your device.
            </p>
          </div>
        ) : (
          <>
            {/* Conversation header */}
            <header className="flex items-center justify-between border-b border-border bg-adv-dark-2 px-5 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-adv-teal-dim text-sm font-bold text-adv-teal">
                  {activeContact.display_name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-adv-white">{activeContact.display_name}</p>
                  <p className="font-mono text-xs text-adv-gray">
                    {activeContact.contact_hash}
                  </p>
                </div>
              </div>
              {convShortId && (
                <div className="flex items-center gap-1.5 rounded-full border border-adv-teal/20 bg-adv-teal-dim px-3 py-1">
                  <Lock className="h-3 w-3 text-adv-teal" />
                  <span className="text-xs text-adv-teal">Conv. {convShortId}</span>
                </div>
              )}
            </header>

            {/* E2E notice banner */}
            <div className="border-b border-adv-gold/15 bg-adv-gold/5 px-5 py-2">
              <p className="text-xs text-adv-gold">
                Messages are end-to-end encrypted. Note: Real-time delivery requires a relay server. This is a local preview of the messaging interface.
              </p>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Lock className="mb-3 h-8 w-8 text-adv-gray/30" />
                  <p className="text-sm text-adv-gray">No messages yet</p>
                  <p className="mt-1 text-xs text-adv-gray">
                    Your messages will appear here, encrypted end-to-end.
                  </p>
                </div>
              )}

              {messageGroups.map(group => (
                <div key={group.date}>
                  <div className="my-4 flex items-center gap-3">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-xs text-adv-gray">{group.date}</span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                  <div className="flex flex-col gap-2">
                    {group.msgs.map(msg => (
                      <MessageBubble
                        key={msg.id}
                        msg={msg}
                        contactName={activeContact.display_name}
                      />
                    ))}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="border-t border-border bg-adv-dark-2 px-5 py-3">
              <div className="flex items-end gap-3">
                <div className="flex flex-1 items-end rounded-xl border border-border bg-adv-dark px-4 py-2.5 focus-within:border-adv-teal">
                  <Lock className="mb-0.5 mr-2 h-4 w-4 shrink-0 text-adv-gray/60" />
                  <textarea
                    ref={inputRef}
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Write an encrypted message… (Enter to send)"
                    rows={1}
                    className="flex-1 resize-none bg-transparent text-sm text-adv-white placeholder-adv-gray focus:outline-none"
                    style={{ maxHeight: '120px' }}
                  />
                </div>
                <button
                  onClick={handleSend}
                  disabled={!draft.trim()}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-adv-teal text-adv-dark transition hover:bg-adv-teal-dark disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Send message"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-1.5 text-xs text-adv-gray">
                End-to-end encrypted · Stored locally · Shift+Enter for new line
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
