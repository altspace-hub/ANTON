import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ArrowLeft, Send, Presentation, Sparkles, Download, Loader2,
  RotateCcw, ChevronDown, Users, Target, MessageSquare, Layers,
  CheckCircle, AlertCircle, Edit3, Wand2, Paperclip, FileText, X,
  Info, Palette,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SlideStructure {
  slideNum: number;
  type: string;
  title: string;
  notes: string;
}

interface PresentationBrief {
  title: string;
  purpose: string;
  audience: string;
  coreMessage: string;
  keyMessages: string[];
  tone: 'formal' | 'professional' | 'conversational' | 'inspiring';
  style: 'dark-professional' | 'light-clean' | 'data-heavy' | 'storytelling';
  slideCount: number;
  timeMinutes: number;
  specificContent: string;
  suggestedStructure: SlideStructure[];
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

type Phase = 'chat' | 'generating' | 'ready' | 'failed';

// ─── Streaming helper ─────────────────────────────────────────────────────────

async function* streamConsult(
  messages: Message[],
  signal?: AbortSignal
): AsyncGenerator<{ type: string; text?: string; content?: string }> {
  const res = await fetch('/api/presentations/consult', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
    signal,
  });

  if (!res.ok) {
    yield { type: 'error', text: await res.text() };
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) { yield { type: 'error', text: 'No response body' }; return; }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') return;
          try { yield JSON.parse(data); } catch { /* skip malformed */ }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ─── Parse brief from assistant text ─────────────────────────────────────────

function extractBrief(text: string): PresentationBrief | null {
  const match = text.match(/\[BRIEF_START\]\s*([\s\S]*?)\s*\[BRIEF_END\]/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]) as PresentationBrief;
  } catch {
    return null;
  }
}

// ─── Strip brief markers from visible text ───────────────────────────────────

function stripBriefMarkers(text: string): string {
  return text.replace(/\[BRIEF_START\][\s\S]*?\[BRIEF_END\]/g, '').trim();
}

// ─── Style options ────────────────────────────────────────────────────────────

const STYLES = [
  { id: 'dark-professional', label: 'Dark / Professional', desc: 'Navy + teal — boardroom & executive' },
  { id: 'light-clean',       label: 'Light / Clean',       desc: 'White minimal — client-facing' },
  { id: 'data-heavy',        label: 'Data Heavy',          desc: 'Optimised for charts & metrics' },
  { id: 'storytelling',      label: 'Storytelling',        desc: 'Visual-first, narrative flow' },
] as const;

const TONES = ['formal', 'professional', 'conversational', 'inspiring'] as const;

// ─── Slide type reference data ────────────────────────────────────────────────

const SLIDE_TYPES = [
  {
    type: 'title',
    emoji: '🎯',
    label: 'Title',
    desc: 'Opening slide with main title and subtitle line.',
    hint: 'Always start here. One per presentation.',
  },
  {
    type: 'agenda',
    emoji: '📋',
    label: 'Agenda',
    desc: 'Bulleted list of sections or topics to be covered.',
    hint: 'Great as slide 2. Lists major sections.',
  },
  {
    type: 'content',
    emoji: '📝',
    label: 'Content',
    desc: 'Standard bullet-point slide. Maximum 6 bullets.',
    hint: 'General purpose — avoid over-using it.',
  },
  {
    type: 'section-divider',
    emoji: '🔷',
    label: 'Section Divider',
    desc: 'Bold full-slide separator between major sections.',
    hint: 'Use between each chapter or topic group.',
  },
  {
    type: 'stats',
    emoji: '📊',
    label: 'Stats / KPIs',
    desc: 'Big-number metric boxes on a dark background.',
    hint: 'Format each line as: value | label\ne.g. 87% | Satisfaction Score',
  },
  {
    type: 'numbered-cards',
    emoji: '🔢',
    label: 'Numbered Cards',
    desc: 'Ordered action steps or process items (3–6 items).',
    hint: 'Best for next steps, priorities, or processes.',
  },
  {
    type: 'callout',
    emoji: '💡',
    label: 'Callout',
    desc: 'Highlighted single key message or critical finding.',
    hint: 'Use once per major section for the key takeaway.',
  },
  {
    type: 'icon-list',
    emoji: '🔸',
    label: 'Icon List',
    desc: 'Categorised items with emoji icons on each row.',
    hint: 'Prefix each bullet with an emoji: ⚠️ 🔴 ✅ 📋 🎯',
  },
  {
    type: 'two-column',
    emoji: '⚖️',
    label: 'Two Column',
    desc: 'Side-by-side layout: before/after, pros/cons, current vs target.',
    hint: 'Put column headers in Subtitle: "Left Label | Right Label"',
  },
  {
    type: 'table',
    emoji: '🗂️',
    label: 'Table',
    desc: 'Structured rows with headers. Supports RAG status colours.',
    hint: 'Use RED / AMBER / GREEN in status columns for colour coding.',
  },
  {
    type: 'quote',
    emoji: '💬',
    label: 'Quote',
    desc: 'Impactful full-slide quote displayed prominently.',
    hint: 'Put the speaker or source name in Subtitle.',
  },
] as const;

// ─── Component ────────────────────────────────────────────────────────────────

export default function PresentationBuilderPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [input, setInput] = useState('');
  const [phase, setPhase] = useState<Phase>('chat');
  const [brief, setBrief] = useState<PresentationBrief | null>(null);
  const [editingBrief, setEditingBrief] = useState(false);
  const [generationStatus, setGenerationStatus] = useState('');
  const [downloadFile, setDownloadFile] = useState<string | null>(null);
  const [presentationId, setPresentationId] = useState<string | null>(null);
  const [uploadedDocs, setUploadedDocs] = useState<Array<{ name: string; text: string }>>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [showTips, setShowTips] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  const sendToExpert = useCallback(
    async (msgs: Message[], isOpening = false) => {
      const toSend = isOpening && msgs.length === 0
        ? [{ role: 'user' as const, content: 'Hi, I need help creating a presentation.' }]
        : msgs;

      if (!isOpening) {
        setMessages(toSend);
      }

      setIsStreaming(true);
      setStreamingText('');

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      let accumulated = '';

      try {
        for await (const event of streamConsult(toSend, ctrl.signal)) {
          // Server sends { type: 'text_delta', content: '...' }
          const chunk = (event as any).content ?? (event as any).text ?? '';
          if ((event.type === 'text_delta' || event.type === 'text') && chunk) {
            accumulated += chunk;
            setStreamingText(accumulated);

            // Check if brief has appeared
            const parsedBrief = extractBrief(accumulated);
            if (parsedBrief && !brief) {
              setBrief(parsedBrief);
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          accumulated += '\n\n_Something went wrong. Please try again._';
        }
      } finally {
        setIsStreaming(false);
        const stripped = stripBriefMarkers(accumulated);
        const assistantMsg: Message = { role: 'assistant', content: stripped };

        if (isOpening) {
          const initialHistory = msgs.length > 0
            ? [...msgs, assistantMsg]
            : [{ role: 'user' as const, content: 'Hi, I need help creating a presentation.' }, assistantMsg];
          setMessages(initialHistory);
        } else {
          setMessages((prev) => [...prev, assistantMsg]);
        }
        setStreamingText('');
        inputRef.current?.focus();
      }
    },
    [brief]
  );

  // Upload a file, extract its text, then send it to Maya as context
  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0 || isStreaming) return;
    setIsUploading(true);
    const newDocs: Array<{ name: string; text: string }> = [];
    for (const file of Array.from(files)) {
      try {
        const form = new FormData();
        form.append('file', file);
        const res = await fetch('/api/files/upload', { method: 'POST', body: form });
        if (res.ok) {
          const data = await res.json() as { originalName: string; text: string };
          if (data.text) newDocs.push({ name: data.originalName, text: data.text });
        }
      } catch { /* skip */ }
    }
    setIsUploading(false);
    if (newDocs.length === 0) return;
    setUploadedDocs((prev) => [...prev, ...newDocs]);
    const docContext = newDocs.map((d) =>
      `[DOCUMENT: ${d.name}]\n---\n${d.text.slice(0, 8000)}${d.text.length > 8000 ? '\n... [truncated]' : ''}\n---`
    ).join('\n\n');
    const autoMsg: Message = {
      role: 'user',
      content: `${docContext}\n\nPlease review ${newDocs.length === 1 ? 'this document' : 'these documents'} and help me create a presentation from the content.`,
    };
    const nextMessages = [...messages, autoMsg];
    setMessages(nextMessages);
    await sendToExpert(nextMessages);
  }, [isStreaming, messages, sendToExpert]);

  // On mount: start with greeting, or load existing presentation, or pre-fill from template
  useEffect(() => {
    const id = searchParams.get('id');
    const templatePrompt = searchParams.get('prompt');
    const openUpload = searchParams.get('upload') === '1';
    if (id) {
      fetch('/api/presentations')
        .then((r) => r.json())
        .then((list: Array<{ id: string; conversation?: string; brief?: string; status: string; filename?: string }>) => {
          const found = list.find((p) => p.id === id);
          if (!found) return;
          setPresentationId(id);
          if (found.conversation) { try { setMessages(JSON.parse(found.conversation)); } catch {} }
          if (found.brief) { try { const b = JSON.parse(found.brief); if (b.title) setBrief(b); } catch {} }
          if (found.status === 'ready' && found.filename) { setPhase('ready'); setDownloadFile(found.filename); }
        })
        .catch(() => {});
      return;
    }
    sendToExpert(
      templatePrompt ? [{ role: 'user' as const, content: templatePrompt }] : [],
      true
    ).then(() => {
      if (openUpload) setTimeout(() => fileInputRef.current?.click(), 300);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    const userMsg: Message = { role: 'user', content: text };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');

    await sendToExpert(nextMessages);
  }, [input, isStreaming, messages, sendToExpert]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Generation ──────────────────────────────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    if (!brief) return;
    setPhase('generating');
    setGenerationError(null);
    setGenerationStatus('Saving presentation brief...');

    try {
      // Save the presentation record first (or update if we already have an id)
      let id = presentationId;
      if (!id) {
        const saveRes = await fetch('/api/presentations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: brief.title,
            purpose: brief.purpose,
            audience: brief.audience,
            style: brief.style,
            slideCount: brief.slideCount,
            brief,
            conversation: messages,
          }),
        });
        const saved = await saveRes.json() as { id: string };
        id = saved.id;
        setPresentationId(id);
      }

      setGenerationStatus('Writing slide content...');

      const genRes = await fetch('/api/presentations/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, brief }),
      });

      const genData = await genRes.json() as {
        success: boolean;
        filename?: string;
        filePath?: string;
        error?: string;
      };

      if (!genData.success || !genData.filename) {
        throw new Error(genData.error || 'Generation failed');
      }

      setDownloadFile(genData.filename);
      setPhase('ready');
    } catch (err) {
      setGenerationError(err instanceof Error ? err.message : 'Generation failed');
      setPhase('failed');
    }
  }, [brief, messages, presentationId]);

  // ── Brief editing helpers ────────────────────────────────────────────────────

  function updateBriefField<K extends keyof PresentationBrief>(key: K, value: PresentationBrief[K]) {
    setBrief((prev) => prev ? { ...prev, [key]: value } : prev);
  }

  function updateKeyMessage(index: number, value: string) {
    setBrief((prev) =>
      prev ? { ...prev, keyMessages: prev.keyMessages.map((m, i) => (i === index ? value : m)) } : prev
    );
  }

  // ── Render helpers ───────────────────────────────────────────────────────────

  const allMessages = streamingText
    ? [...messages, { role: 'assistant' as const, content: streamingText }]
    : messages;

  const canGenerate = brief && phase === 'chat' && !isStreaming;

  return (
    <div className="h-screen flex flex-col bg-adv-dark text-adv-off-white overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-adv-card shrink-0">
        <button
          onClick={() => navigate('/presentations')}
          className="p-1.5 rounded hover:bg-adv-card transition-colors text-adv-gray hover:text-adv-white"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2">
          <Presentation className="h-5 w-5 text-adv-teal" />
          <span className="font-semibold text-adv-white">
            {brief?.title || 'New Presentation'}
          </span>
        </div>
        {phase === 'chat' && brief && (
          <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-adv-teal-dim text-adv-teal">
            Brief ready
          </span>
        )}
      </div>

      {/* Main split layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── Left: Expert Chat ── */}
        <div className="flex flex-col w-1/2 border-r border-adv-card overflow-hidden">
          {/* Chat header */}
          <div className="px-4 py-3 border-b border-adv-card bg-adv-dark-2 shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-adv-teal to-adv-teal-dark flex items-center justify-center text-sm font-bold text-adv-dark shrink-0">
                M
              </div>
              <div>
                <div className="text-sm font-medium text-adv-white">Maya</div>
                <div className="text-xs text-adv-gray">Visual communications expert</div>
              </div>
              {isStreaming && (
                <div className="ml-auto flex items-center gap-1.5 text-xs text-adv-teal">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Thinking...</span>
                </div>
              )}
            </div>
          </div>

          {/* Messages — also accepts drag-and-drop */}
          <div
            className="flex-1 overflow-y-auto p-4 space-y-4"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); handleFileUpload(e.dataTransfer.files); }}
          >
            {allMessages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-adv-teal to-adv-teal-dark flex items-center justify-center text-xs font-bold text-adv-dark shrink-0 mt-0.5">
                    M
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-adv-teal text-adv-dark rounded-tr-sm font-medium'
                      : 'bg-adv-card text-adv-off-white rounded-tl-sm'
                  }`}
                >
                  {msg.role === 'assistant' ? (
                    <div className="prose prose-sm prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1 [&_li]:my-0.5">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {stripBriefMarkers(msg.content)}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    msg.content
                  )}
                  {msg.role === 'assistant' && i === allMessages.length - 1 && isStreaming && (
                    <span className="inline-block w-1.5 h-3.5 bg-adv-teal ml-0.5 animate-pulse rounded-sm" />
                  )}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-adv-card shrink-0 space-y-2">
            {/* Uploaded doc chips */}
            {uploadedDocs.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {uploadedDocs.map((doc, i) => (
                  <div key={i} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-adv-teal-dim border border-adv-teal/30 text-xs text-adv-teal">
                    <FileText className="h-3 w-3 shrink-0" />
                    <span className="max-w-[140px] truncate">{doc.name}</span>
                    <button
                      onClick={() => setUploadedDocs((prev) => prev.filter((_, idx) => idx !== i))}
                      className="ml-0.5 hover:text-adv-white transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.doc,.txt,.md,.xlsx,.csv"
              className="hidden"
              onChange={(e) => handleFileUpload(e.target.files)}
            />

            <div className="flex gap-2 items-end">
              {/* Attach files button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isStreaming || isUploading}
                title="Attach documents (PDF, Word, Markdown, Excel)"
                className="p-2.5 bg-adv-card hover:bg-adv-dark-2 border border-adv-card hover:border-adv-teal disabled:opacity-40 disabled:cursor-not-allowed text-adv-gray hover:text-adv-teal rounded-xl transition-colors shrink-0"
              >
                {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
              </button>

              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isUploading ? 'Reading document...' : isStreaming ? 'Maya is typing...' : 'Type your reply... (Enter to send)'}
                disabled={isStreaming || isUploading}
                rows={2}
                className="flex-1 resize-none bg-adv-card border border-adv-card focus:border-adv-teal outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 rounded-xl px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray-med transition-colors disabled:opacity-50"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isStreaming || isUploading}
                className="p-2.5 bg-adv-teal hover:bg-adv-teal-dark disabled:opacity-40 disabled:cursor-not-allowed text-adv-dark rounded-xl transition-colors shrink-0"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-adv-gray pl-1">
              Attach documents · Shift+Enter for new line · Enter to send
            </p>
          </div>
        </div>

        {/* ── Right: Brief Panel ── */}
        <div className="flex flex-col w-1/2 overflow-hidden">
          {phase === 'chat' && !brief && (
            /* Empty state — waiting for brief + slide type reference */
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Header */}
              <div className="flex flex-col items-center text-center pt-2 pb-1 space-y-2">
                <div className="p-3 rounded-2xl bg-adv-card">
                  <MessageSquare className="h-7 w-7 text-adv-gray" />
                </div>
                <div>
                  <div className="font-medium text-adv-white mb-1">Your brief will appear here</div>
                  <div className="text-sm text-adv-gray max-w-xs mx-auto">
                    Chat with Maya on the left. As you answer her questions, your presentation brief will take shape here.
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 justify-center text-xs text-adv-gray">
                  {[
                    { icon: <Target className="h-3 w-3" />, label: 'Purpose' },
                    { icon: <Users className="h-3 w-3" />, label: 'Audience' },
                    { icon: <Sparkles className="h-3 w-3" />, label: 'Key messages' },
                    { icon: <Layers className="h-3 w-3" />, label: 'Slide structure' },
                  ].map(({ icon, label }) => (
                    <div key={label} className="flex items-center gap-1 px-2 py-1 rounded-full bg-adv-card">
                      {icon} {label}
                    </div>
                  ))}
                </div>
                <div className="pt-1">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 mx-auto px-3 py-1.5 rounded-lg border border-dashed border-adv-gray hover:border-adv-teal text-xs text-adv-gray hover:text-adv-teal transition-colors"
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                    Attach a document — Maya will build the brief from it
                  </button>
                </div>
              </div>

              {/* Slide type reference */}
              <div className="border border-adv-card rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 bg-adv-card">
                  <Info className="h-3.5 w-3.5 text-adv-teal shrink-0" />
                  <span className="text-xs font-semibold text-adv-white uppercase tracking-wider">Available Slide Types</span>
                  <span className="ml-auto text-xs text-adv-gray">Tell Maya which types to use</span>
                </div>
                <div className="divide-y divide-adv-card">
                  {SLIDE_TYPES.map((st) => (
                    <div key={st.type} className="flex items-start gap-3 px-4 py-2.5 hover:bg-adv-card/40 transition-colors">
                      <span className="text-lg shrink-0 leading-none mt-0.5">{st.emoji}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-adv-white">{st.label}</span>
                          <code className="text-xs text-adv-teal bg-adv-teal-dim px-1.5 py-0.5 rounded font-mono">{st.type}</code>
                        </div>
                        <p className="text-xs text-adv-gray mt-0.5">{st.desc}</p>
                        <p className="text-xs text-adv-gray mt-0.5 whitespace-pre-line">{st.hint}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Branding tip */}
              <div className="flex items-start gap-3 p-3 rounded-xl bg-adv-teal-soft border border-adv-teal/20">
                <Palette className="h-4 w-4 text-adv-teal shrink-0 mt-0.5" />
                <div className="text-xs text-adv-gray leading-relaxed">
                  <span className="text-adv-teal font-medium">Brand tip: </span>
                  Set your organisation name, colours, and font in{' '}
                  <a href="/settings" className="underline text-adv-teal hover:text-adv-white transition-colors">
                    Settings → Brand Style
                  </a>
                  . Every generated presentation will use your brand automatically.
                </div>
              </div>
            </div>
          )}

          {phase === 'chat' && brief && (
            /* Brief editor */
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Brief header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-adv-teal" />
                  <span className="text-sm font-semibold text-adv-white">Presentation Brief</span>
                </div>
                <button
                  onClick={() => setEditingBrief((v) => !v)}
                  className="flex items-center gap-1 text-xs text-adv-gray hover:text-adv-teal transition-colors"
                >
                  <Edit3 className="h-3 w-3" />
                  {editingBrief ? 'Done editing' : 'Edit brief'}
                </button>
              </div>

              {/* Title */}
              <BriefField label="Title" icon={<Presentation className="h-3.5 w-3.5" />}>
                {editingBrief ? (
                  <input
                    value={brief.title}
                    onChange={(e) => updateBriefField('title', e.target.value)}
                    className="w-full bg-adv-dark border border-adv-card focus:border-adv-teal rounded-lg px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 text-adv-white transition-colors"
                  />
                ) : (
                  <span className="text-adv-white font-medium">{brief.title}</span>
                )}
              </BriefField>

              {/* Purpose */}
              <BriefField label="Purpose" icon={<Target className="h-3.5 w-3.5" />}>
                {editingBrief ? (
                  <textarea
                    value={brief.purpose}
                    onChange={(e) => updateBriefField('purpose', e.target.value)}
                    rows={2}
                    className="w-full resize-none bg-adv-dark border border-adv-card focus:border-adv-teal rounded-lg px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 text-adv-white transition-colors"
                  />
                ) : (
                  <span className="text-adv-off-white text-sm">{brief.purpose}</span>
                )}
              </BriefField>

              {/* Audience */}
              <BriefField label="Audience" icon={<Users className="h-3.5 w-3.5" />}>
                {editingBrief ? (
                  <input
                    value={brief.audience}
                    onChange={(e) => updateBriefField('audience', e.target.value)}
                    className="w-full bg-adv-dark border border-adv-card focus:border-adv-teal rounded-lg px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 text-adv-white transition-colors"
                  />
                ) : (
                  <span className="text-adv-off-white text-sm">{brief.audience}</span>
                )}
              </BriefField>

              {/* Core message */}
              <BriefField label="Core Message" icon={<Sparkles className="h-3.5 w-3.5" />}>
                {editingBrief ? (
                  <textarea
                    value={brief.coreMessage}
                    onChange={(e) => updateBriefField('coreMessage', e.target.value)}
                    rows={2}
                    className="w-full resize-none bg-adv-dark border border-adv-card focus:border-adv-teal rounded-lg px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 text-adv-white transition-colors"
                  />
                ) : (
                  <span className="text-adv-white font-medium italic text-sm">"{brief.coreMessage}"</span>
                )}
              </BriefField>

              {/* Key messages */}
              <div className="space-y-2">
                <label className="flex items-center gap-1.5 text-xs font-medium text-adv-gray uppercase tracking-wider">
                  <MessageSquare className="h-3.5 w-3.5" />
                  Key Messages
                </label>
                <div className="space-y-1.5">
                  {brief.keyMessages.map((msg, i) =>
                    editingBrief ? (
                      <input
                        key={i}
                        value={msg}
                        onChange={(e) => updateKeyMessage(i, e.target.value)}
                        className="w-full bg-adv-dark border border-adv-card focus:border-adv-teal rounded-lg px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 text-adv-white transition-colors"
                      />
                    ) : (
                      <div key={i} className="flex items-start gap-2 text-sm text-adv-off-white">
                        <span className="w-5 h-5 rounded-full bg-adv-teal-dim text-adv-teal text-xs flex items-center justify-center shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        {msg}
                      </div>
                    )
                  )}
                </div>
              </div>

              {/* Style & Tone row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-adv-gray uppercase tracking-wider">Style</label>
                  {editingBrief ? (
                    <div className="relative">
                      <select
                        value={brief.style}
                        onChange={(e) => updateBriefField('style', e.target.value as PresentationBrief['style'])}
                        className="w-full appearance-none bg-adv-dark border border-adv-card focus:border-adv-teal rounded-lg px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 text-adv-white transition-colors pr-8"
                      >
                        {STYLES.map((s) => (
                          <option key={s.id} value={s.id}>{s.label}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2 top-2 h-4 w-4 text-adv-gray pointer-events-none" />
                    </div>
                  ) : (
                    <span className="text-sm text-adv-off-white">
                      {STYLES.find((s) => s.id === brief.style)?.label ?? brief.style}
                    </span>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-adv-gray uppercase tracking-wider">Tone</label>
                  {editingBrief ? (
                    <div className="relative">
                      <select
                        value={brief.tone}
                        onChange={(e) => updateBriefField('tone', e.target.value as PresentationBrief['tone'])}
                        className="w-full appearance-none bg-adv-dark border border-adv-card focus:border-adv-teal rounded-lg px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 text-adv-white transition-colors pr-8"
                      >
                        {TONES.map((t) => (
                          <option key={t} value={t} className="capitalize">{t}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2 top-2 h-4 w-4 text-adv-gray pointer-events-none" />
                    </div>
                  ) : (
                    <span className="text-sm text-adv-off-white capitalize">{brief.tone}</span>
                  )}
                </div>
              </div>

              {/* Slides & Time row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-adv-gray uppercase tracking-wider">Slides</label>
                  {editingBrief ? (
                    <input
                      type="number"
                      min={3}
                      max={40}
                      value={brief.slideCount}
                      onChange={(e) => updateBriefField('slideCount', Number(e.target.value))}
                      className="w-full bg-adv-dark border border-adv-card focus:border-adv-teal rounded-lg px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 text-adv-white transition-colors"
                    />
                  ) : (
                    <span className="text-sm text-adv-off-white">{brief.slideCount} slides</span>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-adv-gray uppercase tracking-wider">Duration</label>
                  {editingBrief ? (
                    <input
                      type="number"
                      min={5}
                      max={120}
                      value={brief.timeMinutes}
                      onChange={(e) => updateBriefField('timeMinutes', Number(e.target.value))}
                      className="w-full bg-adv-dark border border-adv-card focus:border-adv-teal rounded-lg px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 text-adv-white transition-colors"
                    />
                  ) : (
                    <span className="text-sm text-adv-off-white">{brief.timeMinutes} minutes</span>
                  )}
                </div>
              </div>

              {/* Suggested structure */}
              {brief.suggestedStructure?.length > 0 && (
                <div className="space-y-2">
                  <label className="flex items-center gap-1.5 text-xs font-medium text-adv-gray uppercase tracking-wider">
                    <Layers className="h-3.5 w-3.5" />
                    Slide Structure
                  </label>
                  <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                    {brief.suggestedStructure.map((slide) => (
                      <div
                        key={slide.slideNum}
                        className="flex items-center gap-2 text-xs py-1 border-b border-adv-card last:border-0"
                      >
                        <span className="w-5 text-adv-gray shrink-0">{slide.slideNum}</span>
                        <span className="text-adv-teal shrink-0 capitalize">{slide.type}</span>
                        <span className="text-adv-off-white truncate">{slide.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Collapsible slide type reference */}
              <div className="border border-adv-card rounded-xl overflow-hidden">
                <button
                  onClick={() => setShowTips((v) => !v)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 bg-adv-card hover:bg-adv-card/80 transition-colors text-left"
                >
                  <Info className="h-3.5 w-3.5 text-adv-teal shrink-0" />
                  <span className="text-xs font-semibold text-adv-white flex-1">Slide Type Reference</span>
                  <ChevronDown
                    className={`h-3.5 w-3.5 text-adv-gray transition-transform duration-200 ${showTips ? 'rotate-180' : ''}`}
                  />
                </button>
                {showTips && (
                  <div className="divide-y divide-adv-card">
                    {SLIDE_TYPES.map((st) => (
                      <div key={st.type} className="flex items-start gap-3 px-4 py-2.5">
                        <span className="text-base shrink-0 leading-none mt-0.5">{st.emoji}</span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-medium text-adv-white">{st.label}</span>
                            <code className="text-xs text-adv-teal bg-adv-teal-dim px-1.5 py-0.5 rounded font-mono">{st.type}</code>
                          </div>
                          <p className="text-xs text-adv-gray mt-0.5">{st.desc}</p>
                          <p className="text-xs text-adv-gray mt-0.5 whitespace-pre-line">{st.hint}</p>
                        </div>
                      </div>
                    ))}
                    <div className="flex items-start gap-3 px-4 py-3 bg-adv-teal-soft">
                      <Palette className="h-3.5 w-3.5 text-adv-teal shrink-0 mt-0.5" />
                      <p className="text-xs text-adv-gray leading-relaxed">
                        <span className="text-adv-teal font-medium">Brand tip: </span>
                        Set your org name, colours &amp; font in{' '}
                        <a href="/settings" className="underline text-adv-teal hover:text-adv-white transition-colors">
                          Settings → Brand Style
                        </a>{' '}
                        — every presentation will pick them up automatically.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {(phase === 'generating') && (
            /* Generating state */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-6">
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-adv-teal-dim flex items-center justify-center">
                  <Presentation className="h-8 w-8 text-adv-teal" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-adv-dark flex items-center justify-center">
                  <Loader2 className="h-4 w-4 text-adv-teal animate-spin" />
                </div>
              </div>
              <div className="space-y-1">
                <div className="font-semibold text-adv-white">Generating your presentation</div>
                <div className="text-sm text-adv-teal">{generationStatus}</div>
              </div>
              <div className="text-xs text-adv-gray max-w-xs">
                Claude is writing the slide script, rendering all {brief?.slideCount} slides, and running a quality check...
              </div>
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full bg-adv-teal opacity-60"
                    style={{ animation: `pulse 1.2s ease-in-out ${i * 0.4}s infinite` }}
                  />
                ))}
              </div>
            </div>
          )}

          {phase === 'ready' && (
            /* Success state */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-6">
              <div className="w-16 h-16 rounded-2xl bg-adv-teal-dim flex items-center justify-center">
                <CheckCircle className="h-8 w-8 text-adv-teal" />
              </div>
              <div className="space-y-1">
                <div className="font-semibold text-adv-white text-lg">Presentation ready!</div>
                <div className="text-sm text-adv-gray">
                  {brief?.slideCount} slides · {brief?.style}
                </div>
              </div>
              {downloadFile && (
                <a
                  href={`/api/presentations/download/${downloadFile}`}
                  download
                  className="flex items-center gap-2 px-6 py-3 bg-adv-teal hover:bg-adv-teal-dark text-adv-dark font-semibold rounded-xl transition-colors"
                >
                  <Download className="h-4 w-4" />
                  Download .pptx
                </a>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => { setPhase('chat'); setGenerationError(null); }}
                  className="flex items-center gap-2 px-4 py-2 border border-adv-card hover:border-adv-teal text-adv-gray hover:text-adv-white rounded-xl transition-colors text-sm"
                >
                  <Edit3 className="h-4 w-4" />
                  Edit brief & regenerate
                </button>
                <button
                  onClick={() => navigate('/presentations')}
                  className="flex items-center gap-2 px-4 py-2 border border-adv-card hover:border-adv-teal text-adv-gray hover:text-adv-white rounded-xl transition-colors text-sm"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to library
                </button>
              </div>
            </div>
          )}

          {phase === 'failed' && (
            /* Error state */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-red-900/30 flex items-center justify-center">
                <AlertCircle className="h-8 w-8 text-adv-red" />
              </div>
              <div>
                <div className="font-semibold text-adv-white">Generation failed</div>
                {generationError && (
                  <div className="text-sm text-adv-red mt-1 max-w-xs">{generationError}</div>
                )}
              </div>
              <button
                onClick={() => { setPhase('chat'); setGenerationError(null); }}
                className="flex items-center gap-2 px-4 py-2 bg-adv-card hover:bg-adv-card/80 text-adv-white rounded-xl transition-colors text-sm"
              >
                <RotateCcw className="h-4 w-4" />
                Try again
              </button>
            </div>
          )}

          {/* Generate button — pinned to bottom when brief is ready */}
          {canGenerate && (
            <div className="p-4 border-t border-adv-card shrink-0">
              <button
                onClick={handleGenerate}
                className="w-full flex items-center justify-center gap-2 py-3 bg-adv-teal hover:bg-adv-teal-dark text-adv-dark font-semibold rounded-xl transition-colors"
              >
                <Wand2 className="h-4 w-4" />
                Generate Presentation
              </button>
              <p className="text-xs text-adv-gray text-center mt-2">
                Generates a .pptx file using the brief above · You can edit the brief first
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── BriefField helper component ─────────────────────────────────────────────

function BriefField({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-xs font-medium text-adv-gray uppercase tracking-wider">
        {icon}
        {label}
      </label>
      <div>{children}</div>
    </div>
  );
}
