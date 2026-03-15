import { useRef, useEffect, memo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Message } from '@/lib/types';
import { User, Bot, Brain, Pencil, BookOpen, Layers } from 'lucide-react';
import { useStreamStore } from '@/stores/useStreamStore';
import QualityIndicatorBar from '@/components/shared/QualityIndicatorBar';
import MessageWithThinking from '@/components/shared/MessageWithThinking';

// PERF-03: virtualise the conversation list when it grows large (> 20 messages)
// Below that threshold, render directly to avoid virtualiser overhead.
const VIRTUALISE_THRESHOLD = 20;

// ── Memoized message row — prevents re-render when streamingText changes ──

interface MemoMessageProps {
  msg: Message;
  moduleId?: string;
  canEdit: boolean;
  onEditMessage?: (msg: Message) => void;
}

function extractCitations(content: string): string[] {
  const citations: string[] = [];
  const sourcePattern = /Source \d+: ([^\n]+)/gi;
  let match;
  while ((match = sourcePattern.exec(content)) !== null) {
    citations.push(match[1].trim());
  }
  return citations;
}

const MemoMessage = memo(function MemoMessage({ msg, moduleId, canEdit, onEditMessage }: MemoMessageProps) {
  const citations = msg.role === 'assistant' ? extractCitations(msg.content) : [];

  return (
    <div className="group flex gap-3">
      <div
        className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
          msg.role === 'user' ? 'bg-adv-blue/10 text-adv-blue' : 'bg-adv-teal/10 text-adv-teal'
        }`}
      >
        {msg.role === 'user' ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
      </div>
      <div className="relative min-w-0 flex-1">
        {msg.role === 'assistant' && msg.thinkingContent ? (
          <MessageWithThinking
            outputContent={msg.content}
            thinkingContent={msg.thinkingContent}
          />
        ) : (
          <div className="prose-output max-w-none text-adv-off-white">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
          </div>
        )}
        {msg.role === 'assistant' && (
          <QualityIndicatorBar content={msg.content} moduleId={moduleId} />
        )}
        {citations.length > 0 && (
          <div className="mt-4 pt-3 border-t border-adv-gray-med/30">
            <div className="flex items-center gap-1.5 mb-2">
              <BookOpen className="h-3.5 w-3.5 text-adv-teal" />
              <h4 className="text-xs font-semibold text-adv-off-white">Sources Referenced</h4>
            </div>
            <div className="space-y-1">
              {citations.map((citation, idx) => (
                <div key={idx} className="text-xs text-adv-gray flex items-start gap-2">
                  <span className="text-adv-teal font-mono flex-shrink-0">[{idx + 1}]</span>
                  <span className="flex-1">{citation}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {msg.role === 'user' && canEdit && onEditMessage && (
          <button
            onClick={() => onEditMessage(msg)}
            className="absolute -right-1 top-0 rounded p-1 text-adv-gray opacity-0 transition-all group-hover:opacity-100 hover:text-adv-teal"
            aria-label="Edit and resend"
          >
            <Pencil className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
});

// ── Streaming text renderer — uses plain text for large outputs ──

const MARKDOWN_THRESHOLD = 4000; // chars; above this, show plain text during streaming
const remarkPlugins = [remarkGfm];

function StreamingContent({ text }: { text: string }) {
  if (text.length > MARKDOWN_THRESHOLD) {
    // Large output: show plain text to avoid expensive markdown parsing
    return (
      <div className="prose-output max-w-none text-adv-off-white whitespace-pre-wrap leading-relaxed text-sm">
        {text}
      </div>
    );
  }
  return (
    <div className="prose-output max-w-none text-adv-off-white">
      <ReactMarkdown remarkPlugins={remarkPlugins}>{text}</ReactMarkdown>
    </div>
  );
}

// ── Compaction indicator — shown when context was auto-compacted ──

function CompactionIndicator() {
  const compactionOccurred = useStreamStore((s) => s.compactionOccurred);
  if (!compactionOccurred) return null;
  return (
    <div className="flex items-center gap-2 rounded-lg border border-adv-blue/30 bg-adv-blue/5 px-3 py-1.5">
      <Layers className="h-3.5 w-3.5 shrink-0 text-adv-blue" />
      <span className="text-xs text-adv-blue">
        Context compacted — earlier context was summarised to stay within the model&apos;s window.
      </span>
    </div>
  );
}

// ── Main component ──

interface ConversationThreadProps {
  messages: Message[];
  streamingText: string;
  streamingThinking: string;
  isStreaming: boolean;
  onEditMessage?: (msg: Message) => void;
  moduleId?: string;
}

export default function ConversationThread({
  messages,
  streamingText,
  streamingThinking,
  isStreaming,
  onEditMessage,
  moduleId,
}: ConversationThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef<number | null>(null);

  // Scroll when a completed message is added or removed
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // During streaming: gate scrollIntoView to one call per animation frame (~60fps)
  // to avoid calling it 100+ times per second as tokens arrive.
  useEffect(() => {
    if (!isStreaming || !streamingText) return;
    if (scrollRafRef.current !== null) return; // RAF already pending
    scrollRafRef.current = requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' });
      scrollRafRef.current = null;
    });
  }, [isStreaming, streamingText]);

  // Cancel any pending RAF on unmount
  useEffect(() => {
    return () => {
      if (scrollRafRef.current !== null) cancelAnimationFrame(scrollRafRef.current);
    };
  }, []);

  // PERF-03: virtualised list for large conversation histories
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualiser = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      // Heuristic: user messages ~60px, assistant messages ~300px (markdown-heavy)
      const msg = messages[index];
      if (!msg) return 200;
      if (msg.role === 'user') return Math.max(60, Math.ceil(msg.content.length / 3));
      return Math.max(150, Math.ceil(msg.content.length / 2));
    },
    overscan: 5,
    enabled: messages.length > VIRTUALISE_THRESHOLD,
  });

  if (messages.length === 0 && !isStreaming) return null;

  const useVirtual = messages.length > VIRTUALISE_THRESHOLD;

  return (
    <div
      ref={useVirtual ? parentRef : undefined}
      className={useVirtual ? 'overflow-auto' : 'space-y-4'}
      style={useVirtual ? { maxHeight: '70vh' } : undefined}
    >
      {useVirtual ? (
        <div style={{ height: virtualiser.getTotalSize(), position: 'relative' }}>
          {virtualiser.getVirtualItems().map((vItem) => {
            const msg = messages[vItem.index];
            return (
              <div
                key={vItem.key}
                data-index={vItem.index}
                ref={virtualiser.measureElement}
                style={{ position: 'absolute', top: vItem.start, left: 0, width: '100%', paddingBottom: '1rem' }}
              >
                <MemoMessage
                  msg={msg}
                  moduleId={moduleId}
                  canEdit={!isStreaming}
                  onEditMessage={onEditMessage}
                />
              </div>
            );
          })}
        </div>
      ) : (
        messages.map((msg) => (
          <MemoMessage
            key={msg.id}
            msg={msg}
            moduleId={moduleId}
            canEdit={!isStreaming}
            onEditMessage={onEditMessage}
          />
        ))
      )}

      {/* Compaction indicator */}
      <CompactionIndicator />

      {/* Streaming indicator */}
      {isStreaming && (
        <div className="flex gap-3">
          <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-adv-teal/10 text-adv-teal">
            <Bot className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            {streamingThinking && (
              <div className="mb-2 flex items-center gap-1.5 text-xs text-adv-gray">
                <Brain className="h-3 w-3 animate-pulse" />
                <span className="italic">Thinking...</span>
              </div>
            )}
            {streamingText ? (
              <StreamingContent text={streamingText} />
            ) : (
              <div className="flex items-center gap-1.5 text-sm text-adv-gray">
                <div className="flex gap-1">
                  <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-adv-teal [animation-delay:0ms]" />
                  <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-adv-teal [animation-delay:150ms]" />
                  <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-adv-teal [animation-delay:300ms]" />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
