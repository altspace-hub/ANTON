/**
 * ChatPage — Core conversational interface.
 * Uses REST sync query, markdown rendering, proper mobile layout.
 */

import { useState, useRef, useEffect } from 'react';
import { sendQueryREST } from '../services/query';
import { getIdentity } from '../services/identity';
import { getOrgProfile } from '../services/api';
import { cacheSession, isOnline, queueMessage } from '../services/offline';
import ChatBubble from '../components/ChatBubble';
import SuggestionChips from '../components/SuggestionChips';
import VoiceInput from '../components/VoiceInput';
import ConnectionStatus from '../components/ConnectionStatus';

interface Props {
  orgId: string;
  sessionId: string | null;
  onSessionCreated: (id: string) => void;
  onBack: () => void;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isError?: boolean;
}

export default function ChatPage({ orgId, sessionId, onSessionCreated, onBack }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [orgName, setOrgName] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const identity = getIdentity();

  // Load org name and apply branding
  useEffect(() => {
    getOrgProfile(orgId)
      .then((org: Record<string, unknown>) => {
        setOrgName((org.name as string) || '');
        // Apply org branding color
        const color = org.primary_color as string;
        if (color && color !== '#2A6459') {
          document.documentElement.style.setProperty('--org-brand-color', color);
        }
      })
      .catch(() => {});
    return () => { document.documentElement.style.removeProperty('--org-brand-color'); };
  }, [orgId]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + 'px';
    }
  }, [input]);

  function handleSend() {
    const text = input.trim();
    if (!text || streaming) return;
    if (!orgId) {
      addMessage('assistant', 'No organisation selected. Go back and select one.', true);
      return;
    }

    addMessage('user', text);
    setInput('');
    setSuggestions([]);

    // Offline mode — queue message for later
    if (!isOnline()) {
      queueMessage({ id: crypto.randomUUID(), orgId, sessionId, message: text, timestamp: Date.now() });
      addMessage('assistant', 'You\'re offline. Your message has been queued and will be sent when you reconnect.', false);
      return;
    }

    setStreaming(true);

    sendQueryREST(orgId, text, {
      onStart: () => {},
      onChunk: (chunk) => {
        addMessage('assistant', chunk);
      },
      onComplete: (data) => {
        setStreaming(false);
        if (data.sessionId) onSessionCreated(data.sessionId);
        if (data.suggestions?.length) setSuggestions(data.suggestions);
        // Cache session locally for offline viewing
        if (data.sessionId) {
          cacheSession({
            id: data.sessionId,
            orgId,
            title: text.slice(0, 50),
            messages: messages.map(m => ({ id: m.id, role: m.role, content: m.content, timestamp: m.timestamp })),
            updatedAt: Date.now(),
          });
        }
      },
      onError: (err) => {
        addMessage('assistant', err || 'Something went wrong', true);
        setStreaming(false);
      },
    }, { sessionId: sessionId || undefined, outputLanguage: identity?.preferredLanguage });
  }

  function addMessage(role: 'user' | 'assistant', content: string, isError?: boolean) {
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      role,
      content,
      timestamp: Date.now(),
      isError,
    }]);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-adv-dark safe-top safe-bottom">
      <ConnectionStatus />
      {/* Header */}
      <div className="border-b border-border bg-adv-dark-2">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <button onClick={onBack} className="flex h-9 w-9 items-center justify-center rounded-lg bg-adv-card text-adv-gray transition hover:text-adv-off-white active:scale-95">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="truncate text-sm font-semibold text-adv-off-white">{orgName || 'Chat'}</h1>
            <div className="flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${streaming ? 'bg-adv-gold animate-pulse' : 'bg-adv-green'}`} />
              <span className="text-[10px] text-adv-gray">{streaming ? 'Thinking...' : 'Online'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 py-5 space-y-3">
          {messages.length === 0 && !streaming && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-adv-teal/15 to-adv-teal/5 border border-adv-teal/15">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-adv-teal">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <p className="text-base font-semibold text-adv-off-white">Ask anything</p>
              <p className="mt-2 max-w-[260px] text-xs text-adv-gray leading-relaxed">
                {orgName ? `${orgName}'s AI assistant is ready to help.` : 'Your AI assistant is ready to help.'} Type a question below.
              </p>
            </div>
          )}

          {messages.map(msg => (
            <ChatBubble
              key={msg.id}
              role={msg.role}
              content={msg.content}
              timestamp={msg.timestamp}
              isError={msg.isError}
            />
          ))}

          {/* Typing indicator */}
          {streaming && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-lg border border-border bg-adv-card px-5 py-4">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-adv-teal/60" style={{ animationDelay: '0ms' }} />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-adv-teal/60" style={{ animationDelay: '150ms' }} />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-adv-teal/60" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          {/* Follow-up suggestions */}
          {!streaming && suggestions.length > 0 && (
            <SuggestionChips
              suggestions={suggestions}
              onSelect={(s) => {
                setSuggestions([]);
                setInput(s);
              }}
            />
          )}
        </div>
      </div>

      {/* Input bar */}
      <div className="border-t border-border bg-adv-dark-2">
        <div className="mx-auto flex max-w-2xl items-end gap-2 px-4 py-3">
          <VoiceInput
            onTranscript={(text) => setInput(prev => prev ? `${prev} ${text}` : text)}
            disabled={streaming}
          />
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type or speak..."
            rows={1}
            className="flex-1 resize-none rounded-xl border border-border bg-adv-card px-4 py-3 text-sm text-adv-off-white placeholder-adv-gray/50 transition-colors focus:border-adv-teal focus:outline-none"
            style={{ minHeight: '44px', maxHeight: '120px' }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || streaming}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-adv-teal text-adv-dark transition-all hover:bg-adv-teal-dark active:scale-90 disabled:opacity-25"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
