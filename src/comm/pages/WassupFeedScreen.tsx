import { useEffect, useState } from 'react';
import { listPosts, sweepExpired, type WassupPost } from '../services/wassup';
import { toggleWassupLike } from '../services/chat';
import { getIdentity } from '../services/identity';
import { Ico } from '../components/Ico';
import VoicePlayer from '../components/VoicePlayer';

interface Props {
  onCompose: () => void;
  onOpenPost: (id: string) => void;
  refreshKey?: number;
}

export default function WassupFeedScreen({ onCompose, onOpenPost, refreshKey }: Props) {
  const [posts, setPosts] = useState<WassupPost[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [tick, setTick] = useState(0);
  const me = getIdentity();

  useEffect(() => {
    let cancelled = false;
    void sweepExpired().then(() => listPosts())
      .then((rows) => { if (!cancelled) { setPosts(rows); setLoaded(true); } })
      .catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [refreshKey, tick]);

  // Periodic re-fetch — new posts from peers arrive via the relay client
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 3000);
    return () => clearInterval(t);
  }, []);

  return (
    <section className="flex flex-col">
      <div className="flex items-center justify-between px-5 pt-6 pb-3">
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">Wassup</h1>
        <button
          onClick={onCompose}
          aria-label="New post"
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-fg)' }}
        >
          <Ico name="plus" size={20} />
        </button>
      </div>

      {!loaded ? (
        <div className="px-5 py-10 text-center text-sm text-[var(--color-text-faint)]">Loading…</div>
      ) : posts.length === 0 ? (
        <div className="px-5 mt-2">
          <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-alt)] p-6 text-center">
            <p className="text-sm text-[var(--color-text-body)]">No posts yet.</p>
            <p className="mt-1 text-xs text-[var(--color-text-faint)]">
              Tap + to share something with your contacts. Posts disappear after 24 hours by default.
            </p>
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-[var(--color-border-soft)]">
          {posts.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              myHash={me?.contactHash}
              onOpenPost={() => onOpenPost(p.id)}
              onLike={() => void toggleWassupLike({ id: p.id, authorHash: p.authorHash }).then(() => setTick((v) => v + 1))}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

interface PostCardProps {
  post: WassupPost;
  myHash?: string;
  onOpenPost: () => void;
  onLike: () => void;
}

function PostCard({ post, myHash, onOpenPost, onLike }: PostCardProps) {
  const isMine = post.authorHash === myHash;
  const when = relativeTime(post.createdAt);

  return (
    <li className="px-5 py-4">
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0"
          style={{ backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-accent-dark)' }}
        >
          {post.authorName.slice(0, 1).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold text-[var(--color-text)] truncate">
              {isMine ? 'You' : post.authorName}
            </span>
            <span className="text-xs text-[var(--color-text-faint)]">·</span>
            <span className="text-xs text-[var(--color-text-faint)]">{when}</span>
          </div>

          {post.text && (
            <p className="mt-1 text-[15px] leading-snug text-[var(--color-text)] whitespace-pre-wrap break-words">
              {post.text}
            </p>
          )}

          {post.image && (
            <button
              onClick={onOpenPost}
              className="mt-2 block w-full rounded-2xl overflow-hidden border border-[var(--color-border-soft)]"
            >
              <img
                src={`data:${post.image.mimeType};base64,${post.image.data}`}
                alt=""
                className="w-full block"
                style={{
                  aspectRatio: post.image.width && post.image.height
                    ? `${post.image.width} / ${post.image.height}`
                    : '4 / 3',
                }}
              />
            </button>
          )}

          {post.voice && (
            <div className="mt-2">
              <VoicePlayer payload={post.voice} mine={post.authorHash === me?.contactHash} />
            </div>
          )}

          <div className="mt-2 flex items-center gap-4">
            <button
              onClick={onLike}
              className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] active:text-[var(--color-accent)]"
            >
              <span className="text-base">❤️</span>
              <span>{post.likeCount}</span>
            </button>
            <button
              onClick={onOpenPost}
              className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] active:text-[var(--color-accent)]"
            >
              <Ico name="message" size={14} />
              <span>{post.commentCount}</span>
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const sec = Math.floor((now - then) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  return `${Math.floor(sec / 86400)}d`;
}
