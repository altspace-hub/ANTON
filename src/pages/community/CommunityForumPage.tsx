/**
 * CommunityForumPage.tsx — Chronological community forum, no algorithms.
 * Categories as tabs, new post modal, threaded replies inline.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, ChevronLeft, Plus, X, ChevronDown, ChevronUp, Globe } from 'lucide-react';
import { getAuthHeader } from '../../lib/api';

interface ForumPost {
  id: number;
  forum_id: string;
  parent_id: number | null;
  author_hash: string;
  author_name: string;
  title?: string;
  content: string;
  posted_at: string;
  upvotes: number;
  replies?: ForumPost[];
}

const CATEGORIES = [
  { id: 'general',        label: 'General',          description: 'Open discussion' },
  { id: 'tech-digital',   label: 'Tech & Digital',   description: 'Technology and digital tools' },
  { id: 'environment',    label: 'Environment',      description: 'Climate, sustainability, nature' },
  { id: 'culture-society',label: 'Culture & Society',description: 'People, arts, and communities' },
  { id: 'q-and-a',        label: 'Q&A',              description: 'Questions and answers' },
];

function timeAgo(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return ''; }
}

function buildTree(posts: ForumPost[]): ForumPost[] {
  const map = new Map<number, ForumPost>();
  const roots: ForumPost[] = [];
  for (const p of posts) map.set(p.id, { ...p, replies: [] });
  for (const p of map.values()) {
    if (p.parent_id == null) roots.push(p);
    else { const parent = map.get(p.parent_id); if (parent) (parent.replies ??= []).push(p); else roots.push(p); }
  }
  return roots;
}

async function submitPost(forumId: string, payload: object): Promise<void> {
  const res = await fetch(`/api/community/forum/${forumId}/posts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error ?? 'Failed to post'); }
}

function NewPostModal({ forumId, onClose, onPosted }: { forumId: string; onClose: () => void; onPosted: () => void }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) { setError('Content is required.'); return; }
    setLoading(true); setError(null);
    try {
      await submitPost(forumId, { author_hash: `anon_${Date.now()}`, author_name: authorName.trim() || 'Anonymous', title: title.trim() || undefined, content: content.trim(), parent_id: null });
      onPosted();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to submit'); }
    finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-adv-dark-2 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold text-adv-white"><Plus className="h-4 w-4 text-adv-teal" />New Post</h2>
          <button onClick={onClose} className="text-adv-gray hover:text-adv-off-white" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={handle} className="flex flex-col gap-3">
          <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Title (optional)" maxLength={120}
            className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-white placeholder-adv-gray focus:border-adv-teal focus:outline-none" />
          <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="What do you want to share?" rows={5} required
            className="w-full resize-none rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-white placeholder-adv-gray focus:border-adv-teal focus:outline-none" />
          <input type="text" value={authorName} onChange={e => setAuthorName(e.target.value)} placeholder="Your name (optional — defaults to Anonymous)" maxLength={60}
            className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-white placeholder-adv-gray focus:border-adv-teal focus:outline-none" />
          {error && <p className="text-sm text-adv-red">{error}</p>}
          <div className="flex gap-3">
            <button type="submit" disabled={loading || !content.trim()}
              className="rounded-lg bg-adv-teal px-4 py-2 text-sm font-semibold text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50">
              {loading ? 'Posting…' : 'Post'}
            </button>
            <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm text-adv-gray hover:text-adv-off-white">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ReplyForm({ forumId, parentId, onReplied, onCancel }: { forumId: string; parentId: number; onReplied: () => void; onCancel: () => void }) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setLoading(true); setError(null);
    try {
      await submitPost(forumId, { author_hash: `anon_${Date.now()}`, author_name: 'Anonymous', content: content.trim(), parent_id: parentId });
      onReplied();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setLoading(false); }
  }

  return (
    <form onSubmit={handle} className="mt-3 flex flex-col gap-2 pl-4">
      <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Write a reply…" rows={2} autoFocus
        className="w-full resize-none rounded-lg border border-border bg-adv-dark-2 px-3 py-2 text-sm text-adv-white placeholder-adv-gray focus:border-adv-teal focus:outline-none" />
      {error && <p className="text-xs text-adv-red">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={loading || !content.trim()} className="rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-semibold text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50">
          {loading ? 'Posting…' : 'Reply'}
        </button>
        <button type="button" onClick={onCancel} className="text-xs text-adv-gray hover:text-adv-off-white">Cancel</button>
      </div>
    </form>
  );
}

function PostCard({ post, forumId, depth, onRefresh }: { post: ForumPost; forumId: string; depth: number; onRefresh: () => void }) {
  const [replying, setReplying] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const hasReplies = (post.replies?.length ?? 0) > 0;

  return (
    <div className={depth > 0 ? 'ml-5 border-l border-border pl-4' : ''}>
      <div className={`rounded-xl border border-border bg-adv-card p-4 ${depth === 0 ? 'mb-3' : 'mb-2 mt-2'}`}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-adv-off-white">{post.author_name}</span>
          <span className="text-xs text-adv-gray">{timeAgo(post.posted_at)}</span>
          {post.upvotes > 0 && <span className="ml-auto text-xs text-adv-gray">{post.upvotes} upvote{post.upvotes !== 1 ? 's' : ''}</span>}
        </div>
        {post.title && <p className="mb-1 font-semibold text-adv-white">{post.title}</p>}
        <p className="whitespace-pre-wrap text-sm text-adv-off-white">{post.content}</p>
        <div className="mt-3 flex items-center gap-3">
          <button onClick={() => setReplying(v => !v)} className="flex items-center gap-1 text-xs text-adv-gray hover:text-adv-teal">
            <MessageSquare className="h-3.5 w-3.5" />Reply
          </button>
          {hasReplies && (
            <button onClick={() => setExpanded(v => !v)} className="flex items-center gap-1 text-xs text-adv-gray hover:text-adv-off-white">
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {post.replies!.length} {post.replies!.length === 1 ? 'reply' : 'replies'}
            </button>
          )}
        </div>
        {replying && (
          <ReplyForm forumId={forumId} parentId={post.id}
            onReplied={() => { setReplying(false); onRefresh(); }}
            onCancel={() => setReplying(false)} />
        )}
      </div>
      {hasReplies && expanded && post.replies!.map(r => (
        <PostCard key={r.id} post={r} forumId={forumId} depth={depth + 1} onRefresh={onRefresh} />
      ))}
    </div>
  );
}

export default function CommunityForumPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(CATEGORIES[0].id);
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewPost, setShowNewPost] = useState(false);

  const loadPosts = useCallback(async (fid: string) => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/community/forum/${fid}/posts`, { headers: getAuthHeader() });
      if (!res.ok) throw new Error('Failed to load posts');
      const data = await res.json();
      setPosts(buildTree(data.posts ?? data ?? []));
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load posts'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadPosts(activeTab); }, [activeTab, loadPosts]);

  const activeCat = CATEGORIES.find(c => c.id === activeTab)!;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <button onClick={() => navigate('/community')} className="text-adv-gray hover:text-adv-teal"><ChevronLeft className="h-4 w-4" /></button>
            <Globe className="h-5 w-5 text-adv-teal" />
            <h1 className="text-xl font-bold text-adv-white">Community Forum</h1>
          </div>
          <p className="pl-10 text-sm text-adv-gray">Chronological. No algorithms. No engagement bait.</p>
        </div>
        <button onClick={() => setShowNewPost(true)}
          className="flex shrink-0 items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-semibold text-adv-dark hover:bg-adv-teal-dark">
          <Plus className="h-4 w-4" />New Post
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {CATEGORIES.map(cat => (
          <button key={cat.id} onClick={() => { setActiveTab(cat.id); setPosts([]); }} title={cat.description}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${activeTab === cat.id ? 'bg-adv-teal text-adv-dark' : 'border border-border text-adv-gray hover:border-adv-teal/40 hover:text-adv-off-white'}`}>
            {cat.label}
          </button>
        ))}
      </div>

      <p className="mb-5 text-xs text-adv-gray">{activeCat.description}</p>

      {loading && <div className="flex h-40 items-center justify-center"><div className="h-7 w-7 animate-spin rounded-full border-2 border-adv-teal border-t-transparent" /></div>}

      {!loading && error && (
        <div className="rounded-xl border border-adv-red/20 bg-adv-red/5 px-4 py-3 text-sm text-adv-red">
          {error}
          <button onClick={() => loadPosts(activeTab)} className="ml-3 underline hover:no-underline">Retry</button>
        </div>
      )}

      {!loading && !error && posts.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-adv-card py-16 text-center">
          <MessageSquare className="mb-3 h-10 w-10 text-adv-gray/30" />
          <p className="mb-1 font-medium text-adv-off-white">No posts yet</p>
          <p className="mb-4 text-sm text-adv-gray">Be the first to post.</p>
          <button onClick={() => setShowNewPost(true)}
            className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-semibold text-adv-dark hover:bg-adv-teal-dark">
            <Plus className="h-4 w-4" />Write the first post
          </button>
        </div>
      )}

      {!loading && !error && posts.length > 0 && (
        <div>
          {posts.map(post => (
            <PostCard key={post.id} post={post} forumId={activeTab} depth={0} onRefresh={() => loadPosts(activeTab)} />
          ))}
        </div>
      )}

      {showNewPost && (
        <NewPostModal forumId={activeTab} onClose={() => setShowNewPost(false)} onPosted={() => { setShowNewPost(false); loadPosts(activeTab); }} />
      )}
    </div>
  );
}
