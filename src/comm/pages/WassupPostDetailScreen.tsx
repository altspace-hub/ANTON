import { useEffect, useState } from 'react';
import { getPost, listInteractions, type WassupPost, type WassupInteraction } from '../services/wassup';
import { toggleWassupLike, postWassupComment } from '../services/chat';
import { getIdentity } from '../services/identity';
import { Ico } from '../components/Ico';

interface Props {
  postId: string;
  onBack: () => void;
}

export default function WassupPostDetailScreen({ postId, onBack }: Props) {
  const [post, setPost] = useState<WassupPost | null>(null);
  const [interactions, setInteractions] = useState<WassupInteraction[]>([]);
  const [commentDraft, setCommentDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const me = getIdentity();

  useEffect(() => {
    let cancelled = false;
    Promise.all([getPost(postId), listInteractions(postId)])
      .then(([p, ints]) => { if (!cancelled) { setPost(p); setInteractions(ints); } })
      .catch(() => { /* swallow */ });
    return () => { cancelled = true; };
  }, [postId, tick]);

  // Poll for new interactions
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 2000);
    return () => clearInterval(t);
  }, []);

  async function handleLike() {
    if (!post) return;
    setBusy(true);
    try {
      await toggleWassupLike({ id: post.id, authorHash: post.authorHash });
      setTick((v) => v + 1);
    } finally {
      setBusy(false);
    }
  }

  async function handleComment() {
    if (!post) return;
    const text = commentDraft.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      await postWassupComment({ id: post.id, authorHash: post.authorHash }, text);
      setCommentDraft('');
      setTick((v) => v + 1);
    } finally {
      setBusy(false);
    }
  }

  if (!post) {
    return (
      <section className="flex flex-col min-h-dvh safe-top safe-bottom bg-[var(--color-bg)]">
        <header className="flex items-center gap-3 h-12 px-4 border-b border-[var(--color-border-soft)] bg-[var(--color-surface)]">
          <button onClick={onBack} className="text-[var(--color-text-muted)]" aria-label="Back">
            <Ico name="arrowLeft" size={22} />
          </button>
        </header>
        <div className="flex-1 flex items-center justify-center text-sm text-[var(--color-text-faint)]">
          Post not found.
        </div>
      </section>
    );
  }

  const isMine = post.authorHash === me?.contactHash;
  const iLiked = interactions.some((i) => i.kind === 'like' && i.fromHash === me?.contactHash);
  const comments = interactions.filter((i) => i.kind === 'comment');

  return (
    <section className="flex flex-col min-h-dvh max-h-dvh safe-top safe-bottom bg-[var(--color-bg)]">
      <header className="flex items-center gap-3 h-12 px-4 border-b border-[var(--color-border-soft)] bg-[var(--color-surface)]">
        <button onClick={onBack} className="text-[var(--color-text-muted)]" aria-label="Back">
          <Ico name="arrowLeft" size={22} />
        </button>
        <h1 className="text-base font-semibold text-[var(--color-text)]">Post</h1>
      </header>

      <div className="flex-1 overflow-y-auto">
        <article className="px-5 pt-5 pb-3 border-b border-[var(--color-border-soft)]">
          <div className="flex items-start gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0"
              style={{ backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-accent-dark)' }}
            >
              {post.authorName.slice(0, 1).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-[var(--color-text)]">
                {isMine ? 'You' : post.authorName}
              </div>
              <div className="text-xs text-[var(--color-text-faint)]">
                {new Date(post.createdAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
              </div>
            </div>
          </div>

          {post.text && (
            <p className="mt-3 text-[17px] leading-snug text-[var(--color-text)] whitespace-pre-wrap break-words">
              {post.text}
            </p>
          )}

          {post.image && (
            <img
              src={`data:${post.image.mimeType};base64,${post.image.data}`}
              alt=""
              className="mt-3 w-full block rounded-2xl border border-[var(--color-border-soft)]"
              style={{
                aspectRatio: post.image.width && post.image.height
                  ? `${post.image.width} / ${post.image.height}`
                  : '4 / 3',
              }}
            />
          )}

          <div className="mt-3 flex items-center gap-5">
            <button
              onClick={() => void handleLike()}
              disabled={busy}
              className="flex items-center gap-1.5 text-sm text-[var(--color-text-muted)] disabled:opacity-40"
              style={{ color: iLiked ? 'var(--color-red)' : undefined }}
            >
              <span className="text-lg">{iLiked ? '❤️' : '🤍'}</span>
              <span>{post.likeCount}</span>
            </button>
            <span className="flex items-center gap-1.5 text-sm text-[var(--color-text-muted)]">
              <Ico name="message" size={16} />
              <span>{comments.length}</span>
            </span>
          </div>
        </article>

        <div className="px-5 pt-3">
          {comments.length === 0 ? (
            <p className="text-xs text-[var(--color-text-faint)] py-4">
              No comments yet. Be the first.
            </p>
          ) : (
            <ul className="space-y-3 py-3">
              {comments.map((c) => (
                <li key={c.id} className="flex items-start gap-2">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0"
                    style={{ backgroundColor: 'var(--color-surface-muted)', color: 'var(--color-text)' }}
                  >
                    {c.fromName.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border-soft)] px-3 py-2">
                    <div className="text-xs font-medium text-[var(--color-text)]">
                      {c.fromHash === me?.contactHash ? 'You' : c.fromName}
                    </div>
                    <div className="text-sm text-[var(--color-text-body)] whitespace-pre-wrap break-words">
                      {c.text}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="flex items-end gap-2 p-3 border-t border-[var(--color-border-soft)] bg-[var(--color-surface)]">
        <textarea
          value={commentDraft}
          onChange={(e) => setCommentDraft(e.target.value)}
          placeholder="Add a comment"
          rows={1}
          className="flex-1 px-3 py-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] text-base text-[var(--color-text)] placeholder-[var(--color-text-faint)] resize-none max-h-32 focus:outline-none focus:ring-2"
          style={{ outlineColor: 'var(--color-accent)' }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleComment(); }
          }}
        />
        <button
          onClick={() => void handleComment()}
          disabled={busy || commentDraft.trim().length === 0}
          aria-label="Send comment"
          className="w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-40"
          style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-fg)' }}
        >
          <Ico name="arrowUp" size={20} />
        </button>
      </div>
    </section>
  );
}
