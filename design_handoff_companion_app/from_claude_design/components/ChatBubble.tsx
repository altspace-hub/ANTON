/**
 * ChatBubble.tsx — Message bubble with markdown rendering.
 * Supports user (teal, right-aligned) and assistant (card, left-aligned) messages.
 * Error messages get a red-tinted style.
 */

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isError?: boolean;
}

export default function ChatBubble({ role, content, timestamp, isError }: Props) {
  const isUser = role === 'user';
  const time = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (isError) {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-2xl rounded-bl-lg border border-adv-red/30 bg-adv-red/5 px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-adv-red text-xs font-medium">Error</span>
          </div>
          <p className="text-sm text-adv-red/80">{content.replace(/^Error:\s*/i, '')}</p>
          <div className="mt-1.5 text-[10px] text-adv-red/40">{time}</div>
        </div>
      </div>
    );
  }

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-lg bg-adv-teal px-4 py-3 chat-user">
          <p className="text-sm font-medium text-adv-dark leading-relaxed break-words">{content}</p>
          <div className="mt-1 text-[10px] text-adv-dark/40">{time}</div>
        </div>
      </div>
    );
  }

  // Assistant bubble with markdown
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-2xl rounded-bl-lg border border-border bg-adv-card px-4 py-3">
        <div className="prose-app text-sm leading-relaxed text-adv-off-white break-words">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
        <div className="mt-1.5 text-[10px] text-adv-gray/40">{time}</div>
      </div>
    </div>
  );
}
