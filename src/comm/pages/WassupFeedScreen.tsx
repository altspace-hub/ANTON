import { useEffect, useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { listPosts, sweepExpired, type WassupPost } from '../services/wassup';
import { toggleWassupLike } from '../services/chat';
import { getIdentity } from '../services/identity';
import { Ico } from '../components/Ico';
import VoicePlayer from '../components/VoicePlayer';
import { useBlobUrl } from '../hooks/useBlobUrl';

interface Props {
  onCompose: () => void;
  onOpenPost: (id: string) => void;
  refreshKey?: number;
}

export default function WassupFeedScreen({ onCompose, onOpenPost, refreshKey }: Props) {
  const { t } = useTranslation();
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
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">{t('wassup.title')}</h1>
        <button
          onClick={onCompose}
          aria-label={t('wassup.newPost')}
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-fg)' }}
        >
          <Ico name="plus" size={20} />
        </button>
      </div>

      {!loaded ? (
        <div className="px-5 py-10 text-center text-sm text-[var(--color-text-faint)]">{t('common.loading')}</div>
      ) : posts.length === 0 ? (
        <div className="px-5 mt-2">
          <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-alt)] p-6 text-center">
            <p className="text-sm text-[var(--color-text-body)]">{t('wassup.noPosts')}</p>
            <p className="mt-1 text-xs text-[var(--color-text-faint)]">
              {t('wassup.noPostsHelp')}
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
  const { t } = useTranslation();
  const isMine = post.authorHash === myHash;
  const when = relativeTime(post.createdAt, t);
  // P4-3: feed re-renders every 3s (poll for new posts) — without this
  // every card's image was re-decoded from base64 each tick.
  const imageBlobUrl = useBlobUrl(post.image?.data, post.image?.mimeType);

  // P8-5 audit fix: the whole card body opens the post detail.
  // Previously only the image was tappable, which felt weird —
  // text-only or voice-only posts had no way in. Now author area,
  // text, image, and voice all delegate to onOpenPost. Like + comment
  // buttons keep their own onClick and stopPropagation so a like
  // doesn't accidentally open the post.
  function stopAndLike(e: MouseEvent) {
    e.stopPropagation();
    onLike();
  }
  function stopAndOpen(e: MouseEvent) {
    e.stopPropagation();
    onOpenPost();
  }

  return (
    <li>
      <button
        onClick={onOpenPost}
        className="w-full text-left px-5 py-4 active:bg-[var(--color-surface-muted)]"
        aria-label={t('wassup.openPostBy', { name: isMine ? t('wassup.you') : post.authorName })}
      >
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
                {isMine ? t('wassup.you') : post.authorName}
              </span>
              <span className="text-xs text-[var(--color-text-faint)]">·</span>
              <span className="text-xs text-[var(--color-text-faint)]">{when}</span>
            </div>

            {post.text && (
              <p className="mt-1 text-[15px] leading-snug text-[var(--color-text)] whitespace-pre-wrap break-words">
                {post.text}
              </p>
            )}

            {post.image && imageBlobUrl && (
              <div
                className="mt-2 block w-full rounded-2xl overflow-hidden border border-[var(--color-border-soft)]"
              >
                <img
                  src={imageBlobUrl}
                  alt=""
                  className="w-full block"
                  style={{
                    aspectRatio: post.image.width && post.image.height
                      ? `${post.image.width} / ${post.image.height}`
                      : '4 / 3',
                  }}
                />
              </div>
            )}

            {post.voice && (
              <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                {/* VoicePlayer has its own play button — stop propagation
                    so tapping play doesn't open the detail. */}
                <VoicePlayer payload={post.voice} mine={post.authorHash === myHash} />
              </div>
            )}

            <div className="mt-2 flex items-center gap-4">
              <button
                onClick={stopAndLike}
                className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] active:text-[var(--color-accent)]"
              >
                <span className="text-base">❤️</span>
                <span>{post.likeCount}</span>
              </button>
              <button
                onClick={stopAndOpen}
                className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] active:text-[var(--color-accent)]"
              >
                <Ico name="message" size={14} />
                <span>{post.commentCount}</span>
              </button>
            </div>
          </div>
        </div>
      </button>
    </li>
  );
}

function relativeTime(iso: string, t: TFunction): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const sec = Math.floor((now - then) / 1000);
  if (sec < 60) return t('wassup.justNow');
  if (sec < 3600) return t('wassup.minutesShort', { n: Math.floor(sec / 60) });
  if (sec < 86400) return t('wassup.hoursShort', { n: Math.floor(sec / 3600) });
  return t('wassup.daysShort', { n: Math.floor(sec / 86400) });
}
