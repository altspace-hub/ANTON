import { useState, useEffect, useCallback, useRef } from 'react';
import { Send, Loader2, MessageSquare } from 'lucide-react';
import type { DeadlineComment } from './types';
import { apiGet, apiPost } from './types';

interface CommentThreadProps {
  deadlineId: string;
}

function formatTimestamp(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

function getInitials(userId: string | null): string {
  if (!userId) return 'U';
  // If it looks like an email, take first letter of local part
  if (userId.includes('@')) {
    return userId.split('@')[0].charAt(0).toUpperCase();
  }
  // Otherwise take first two chars
  return userId.slice(0, 2).toUpperCase();
}

// Generate a consistent color from user ID
function getAvatarColor(userId: string | null): string {
  const colors = [
    'bg-adv-teal', 'bg-adv-blue', 'bg-adv-gold',
    'bg-adv-green', 'bg-purple-500', 'bg-pink-500',
  ];
  if (!userId) return colors[0];
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export default function CommentThread({ deadlineId }: CommentThreadProps) {
  const [comments, setComments] = useState<DeadlineComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadComments = useCallback(async () => {
    try {
      const data = await apiGet<DeadlineComment[]>(
        `/api/deadlines/${deadlineId}/comments`
      );
      setComments(data);
    } catch (err) {
      console.error('Failed to load comments:', err);
    } finally {
      setLoading(false);
    }
  }, [deadlineId]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  // Auto-scroll to bottom when comments change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [comments]);

  async function sendComment() {
    if (!newComment.trim()) return;
    setSending(true);
    try {
      await apiPost(`/api/deadlines/${deadlineId}/comments`, {
        content: newComment.trim(),
      });
      setNewComment('');
      await loadComments();
    } catch (err) {
      console.error('Failed to send comment:', err);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendComment();
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-adv-gray" />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Comments list */}
      <div
        ref={scrollRef}
        className="flex flex-col gap-3 overflow-y-auto"
        style={{ maxHeight: '320px' }}
      >
        {comments.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-adv-gray-med">
            <MessageSquare className="mb-2 h-8 w-8" />
            <p className="text-sm">No comments yet</p>
            <p className="text-xs">Be the first to add one.</p>
          </div>
        ) : (
          comments.map((comment) => {
            const initials = getInitials(comment.user_id);
            const avatarColor = getAvatarColor(comment.user_id);

            return (
              <div key={comment.id} className="flex gap-3">
                {/* Avatar */}
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-adv-dark ${avatarColor}`}
                >
                  {initials}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-adv-off-white">
                      {comment.user_id || 'User'}
                    </span>
                    <span className="text-xs text-adv-gray-med">
                      {formatTimestamp(comment.created_at)}
                    </span>
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm text-adv-gray leading-relaxed">
                    {comment.content}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Input area */}
      <div className="mt-4 flex items-end gap-2 border-t border-border pt-4">
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a comment..."
          rows={1}
          className="flex-1 resize-none rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
          style={{ minHeight: '38px', maxHeight: '120px' }}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement;
            target.style.height = 'auto';
            target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
          }}
        />
        <button
          onClick={sendComment}
          disabled={!newComment.trim() || sending}
          className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg bg-adv-teal text-adv-dark transition-colors hover:bg-adv-teal-dark disabled:opacity-40"
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </div>

      <p className="mt-1.5 text-[10px] text-adv-gray-med">
        Press Enter to send, Shift+Enter for new line
      </p>
    </div>
  );
}
