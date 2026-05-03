/**
 * ChatBubble — Message rendering (Claude-style, May 3 IRE pass).
 *
 * The signature visual move of premium AI mobile apps (Claude, ChatGPT) is
 * **asymmetric bubbles**: the assistant has NO bubble — just full-width
 * prose that breathes — while the user gets a rounded right-aligned bubble.
 * Symmetric bubbles read as a generic chat clone (WhatsApp/Telegram), not
 * as a thinking partner.
 *
 * Inline timestamps are ALSO removed. Claude shows timestamps only on
 * cluster boundaries (when more than ~5 minutes pass between turns) — the
 * ChatPage handles that as date dividers between messages, not on every
 * bubble.
 */

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isError?: boolean;
}

export default function ChatBubble({ role, content, isError }: Props) {
  // Errors get their own treatment regardless of role
  if (isError) {
    return (
      <div className="flex justify-start">
        <div
          className="max-w-[88%] rounded-[14px] px-4 py-3"
          style={{
            background: 'var(--color-red-dim)',
            color: 'var(--color-red)',
          }}
        >
          <div
            className="mb-1 font-mono text-[10px] font-bold uppercase"
            style={{ letterSpacing: '0.6px' }}
          >
            Error
          </div>
          <p className="text-[14px] leading-relaxed">
            {content.replace(/^Error:\s*/i, '')}
          </p>
        </div>
      </div>
    );
  }

  // User: bubble, right-aligned, accent fill
  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div
          className="chat-user max-w-[85%] rounded-[16px] px-4 py-2.5"
          style={{
            background: 'var(--color-accent)',
            color: 'var(--color-accent-fg)',
          }}
        >
          <p className="break-words whitespace-pre-wrap text-[14.5px] leading-[1.5]">
            {content}
          </p>
        </div>
      </div>
    );
  }

  // Assistant: NO bubble. Full-width prose, breathes naturally.
  return (
    <div
      className="prose-app w-full break-words text-[15px] leading-[1.55]"
      style={{ color: 'var(--color-text)' }}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
