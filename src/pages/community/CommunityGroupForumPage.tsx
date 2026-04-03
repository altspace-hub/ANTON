import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Pin, Lock, MessageSquare, Trash2 } from 'lucide-react';
import { getAuthHeader, fetchWithAuth } from '@/lib/api';

interface Topic {
  id: string;
  group_id: string;
  title: string;
  description: string | null;
  author_hash: string;
  author_name: string;
  pinned: number;
  locked: number;
  post_count: number;
  last_post_at: string | null;
  created_at: string;
}

interface Post {
  id: string;
  topic_id: string;
  group_id: string;
  parent_id: string | null;
  author_hash: string;
  author_name: string;
  content: string;
  upvotes: number;
  posted_at: string;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function CommunityGroupForumPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewTopic, setShowNewTopic] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [replyContent, setReplyContent] = useState('');

  const loadTopics = useCallback(async () => {
    if (!id) return;
    const res = await fetch(`/api/community/groups/${id}/topics`, { headers: getAuthHeader() });
    if (res.ok) {
      const data = await res.json();
      setTopics(data.topics || []);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { loadTopics(); }, [loadTopics]);

  const loadTopic = async (topicId: string) => {
    const res = await fetch(`/api/community/groups/${id}/topics/${topicId}`, { headers: getAuthHeader() });
    if (res.ok) {
      const data = await res.json();
      setSelectedTopic(data.topic);
      setPosts(data.posts || []);
    }
  };

  const createTopic = async () => {
    if (!newTitle.trim()) return;
    await fetchWithAuth(`/api/community/groups/${id}/topics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle, description: newDesc }),
    });
    setNewTitle('');
    setNewDesc('');
    setShowNewTopic(false);
    loadTopics();
  };

  const addPost = async () => {
    if (!replyContent.trim() || !selectedTopic) return;
    await fetchWithAuth(`/api/community/groups/${id}/topics/${selectedTopic.id}/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: replyContent }),
    });
    setReplyContent('');
    loadTopic(selectedTopic.id);
  };

  const deleteTopic = async (topicId: string) => {
    if (!confirm('Delete this topic and all its posts?')) return;
    await fetchWithAuth(`/api/community/groups/${id}/topics/${topicId}`, { method: 'DELETE' });
    setSelectedTopic(null);
    loadTopics();
  };

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-adv-teal border-t-transparent" /></div>;

  // Topic detail view
  if (selectedTopic) {
    return (
      <div className="min-h-screen p-6 max-w-4xl mx-auto">
        <button onClick={() => setSelectedTopic(null)} className="mb-4 flex items-center gap-2 text-sm text-adv-gray hover:text-adv-teal">
          <ArrowLeft className="h-4 w-4" /> Back to topics
        </button>
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            {selectedTopic.pinned ? <Pin className="h-3.5 w-3.5 text-adv-gold" /> : null}
            {selectedTopic.locked ? <Lock className="h-3.5 w-3.5 text-adv-gray" /> : null}
            <h1 className="text-xl font-bold text-adv-off-white">{selectedTopic.title}</h1>
          </div>
          {selectedTopic.description && <p className="text-sm text-adv-gray">{selectedTopic.description}</p>}
          <p className="text-xs text-adv-gray mt-1">by {selectedTopic.author_name} - {timeAgo(selectedTopic.created_at)}</p>
        </div>

        <div className="space-y-3 mb-6">
          {posts.map(post => (
            <div key={post.id} className="rounded-lg border border-border bg-adv-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-medium text-adv-off-white">{post.author_name}</span>
                <span className="text-xs text-adv-gray">{timeAgo(post.posted_at)}</span>
              </div>
              <p className="text-sm text-adv-off-white whitespace-pre-wrap">{post.content}</p>
            </div>
          ))}
          {posts.length === 0 && <p className="text-sm text-adv-gray text-center py-8">No posts yet. Be the first to respond.</p>}
        </div>

        {!selectedTopic.locked && (
          <div className="flex gap-2">
            <textarea
              value={replyContent}
              onChange={e => setReplyContent(e.target.value)}
              placeholder="Write a reply..."
              rows={3}
              className="flex-1 rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray/50 focus:border-adv-teal focus:outline-none resize-none"
            />
            <button onClick={addPost} disabled={!replyContent.trim()} className="self-end rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50">Reply</button>
          </div>
        )}
        {selectedTopic.locked && <p className="text-xs text-adv-gray text-center mt-4">This topic is locked.</p>}
      </div>
    );
  }

  // Topic list view
  return (
    <div className="min-h-screen p-6 max-w-4xl mx-auto">
      <button onClick={() => navigate(`/community/groups/${id}`)} className="mb-4 flex items-center gap-2 text-sm text-adv-gray hover:text-adv-teal">
        <ArrowLeft className="h-4 w-4" /> Back to group
      </button>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-adv-off-white">Group Forum</h1>
        <button onClick={() => setShowNewTopic(true)} className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark">
          <Plus className="h-4 w-4" /> New Topic
        </button>
      </div>

      {showNewTopic && (
        <div className="mb-6 rounded-xl border border-border bg-adv-card p-4 space-y-3">
          <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Topic title" className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray/50 focus:border-adv-teal focus:outline-none" />
          <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Description (optional)" rows={2} className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray/50 focus:border-adv-teal focus:outline-none resize-none" />
          <div className="flex gap-2">
            <button onClick={createTopic} disabled={!newTitle.trim()} className="rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50">Create</button>
            <button onClick={() => setShowNewTopic(false)} className="rounded-lg border border-border px-4 py-2 text-sm text-adv-gray hover:text-adv-off-white">Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {topics.map(topic => (
          <button key={topic.id} onClick={() => loadTopic(topic.id)} className="w-full text-left rounded-xl border border-border bg-adv-card p-4 hover:border-adv-teal/40 transition-colors">
            <div className="flex items-center gap-2 mb-1">
              {topic.pinned ? <Pin className="h-3 w-3 text-adv-gold" /> : null}
              {topic.locked ? <Lock className="h-3 w-3 text-adv-gray" /> : null}
              <span className="text-sm font-medium text-adv-off-white">{topic.title}</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-adv-gray">
              <span>{topic.author_name}</span>
              <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" /> {topic.post_count}</span>
              <span>{topic.last_post_at ? timeAgo(topic.last_post_at) : timeAgo(topic.created_at)}</span>
            </div>
          </button>
        ))}
        {topics.length === 0 && <p className="text-sm text-adv-gray text-center py-12">No topics yet. Start a discussion.</p>}
      </div>
    </div>
  );
}
