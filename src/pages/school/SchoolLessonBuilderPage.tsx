/**
 * SchoolLessonBuilderPage.tsx
 * Drag-and-drop lesson builder for teachers.
 * Located at /school/lesson-builder (new) or /school/teacher/lessons/new (existing route)
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus, Trash2, ChevronUp, ChevronDown, Save, Eye, Loader2,
  Type, Play, Brain, Lightbulb, Link, Layers, MessageCircle, CheckSquare
} from 'lucide-react';
import SchoolLayout from '../../components/school/SchoolLayout';

interface ContentBlock {
  type: string;
  content?: string;
  title?: string;
  video_id?: string;
  channel?: string;
  start_time?: number;
  question?: string;
  options?: string[];
  correct?: number;
  explanation?: string;
  url?: string;
  height?: number;
  concepts?: { term: string; definition: string }[];
  solution?: string;
  check_question?: string;
}

interface LessonForm {
  subject_id: string;
  title: string;
  description: string;
  estimated_minutes: number;
  bloom_level: string;
  tier: string;
  content_blocks: ContentBlock[];
}

const BLOCK_TYPES = [
  { type: 'text', label: 'Text', icon: Type, color: 'text-adv-off-white' },
  { type: 'video', label: 'Video', icon: Play, color: 'text-adv-red' },
  { type: 'quiz', label: 'Quiz', icon: Brain, color: 'text-adv-gold' },
  { type: 'exercise', label: 'Exercise', icon: Lightbulb, color: 'text-adv-gold' },
  { type: 'key_concepts', label: 'Key Concepts', icon: Layers, color: 'text-adv-blue' },
  { type: 'ai_discussion', label: 'Ask Alma', icon: MessageCircle, color: 'text-adv-teal' },
  { type: 'checkpoint', label: 'Checkpoint', icon: CheckSquare, color: 'text-adv-green' },
  { type: 'link', label: 'Link', icon: Link, color: 'text-adv-blue' },
  { type: 'embed', label: 'Embed', icon: Layers, color: 'text-adv-gray' },
  { type: 'divider', label: 'Divider', icon: Type, color: 'text-adv-gray' },
];

function defaultBlock(type: string): ContentBlock {
  switch (type) {
    case 'text': return { type, content: '' };
    case 'video': return { type, title: '', video_id: '', channel: '', start_time: 0 };
    case 'quiz': return { type, question: '', options: ['', '', '', ''], correct: 0, explanation: '' };
    case 'exercise': return { type, content: '', solution: '' };
    case 'key_concepts': return { type, concepts: [{ term: '', definition: '' }] };
    case 'ai_discussion': return { type, content: '' };
    case 'checkpoint': return { type, content: '', check_question: '' };
    case 'link': return { type, url: '', title: '', content: '' };
    case 'embed': return { type, url: '', title: '', height: 400 };
    default: return { type };
  }
}

export default function SchoolLessonBuilderPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const lessonId = searchParams.get('id');
  const [saving, setSaving] = useState(false);
  const isDirtyRef = useRef(false);
  const formChangeCountRef = useRef(0);
  const [form, setForm] = useState<LessonForm>({
    subject_id: '',
    title: '',
    description: '',
    estimated_minutes: 30,
    bloom_level: 'understand',
    tier: 'T2',
    content_blocks: [],
  });

  useEffect(() => {
    if (!lessonId) return;
    fetch(`/api/school/lessons/${lessonId}`)
      .then(r => r.ok ? r.json() as Promise<Record<string, unknown>> : null)
      .then(data => {
        if (!data) return;
        setForm({
          subject_id: (data.subject_id as string) || '',
          title: (data.title as string) || '',
          description: (data.description as string) || '',
          estimated_minutes: (data.estimated_minutes as number) || 30,
          bloom_level: (data.bloom_level as string) || 'understand',
          tier: (data.tier as string) || 'T2',
          content_blocks: (data.content_blocks as ContentBlock[]) || [],
        });
      })
      .catch(() => {});
  }, [lessonId]);

  // Track dirty state: skip initial render + one server-load update
  useEffect(() => {
    formChangeCountRef.current += 1;
    const skipsNeeded = lessonId ? 2 : 1;
    if (formChangeCountRef.current <= skipsNeeded) return;
    isDirtyRef.current = true;
  }, [form]); // eslint-disable-line react-hooks/exhaustive-deps

  // Warn before navigating away with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!isDirtyRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  function addBlock(type: string) {
    setForm(prev => ({ ...prev, content_blocks: [...prev.content_blocks, defaultBlock(type)] }));
  }

  function removeBlock(index: number) {
    setForm(prev => ({ ...prev, content_blocks: prev.content_blocks.filter((_, i) => i !== index) }));
  }

  function moveBlock(index: number, direction: 'up' | 'down') {
    setForm(prev => {
      const blocks = [...prev.content_blocks];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= blocks.length) return prev;
      [blocks[index], blocks[targetIndex]] = [blocks[targetIndex], blocks[index]];
      return { ...prev, content_blocks: blocks };
    });
  }

  function updateBlock(index: number, updates: Partial<ContentBlock>) {
    setForm(prev => {
      const blocks = [...prev.content_blocks];
      blocks[index] = { ...blocks[index], ...updates };
      return { ...prev, content_blocks: blocks };
    });
  }

  async function handleSave(publish = false) {
    setSaving(true);
    const payload = { ...form, published: publish };

    if (lessonId) {
      await fetch(`/api/school/lessons/${lessonId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } else {
      const r = await fetch('/api/school/lessons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await r.json() as { id?: string };
      if (data.id) {
        navigate(`/school/lesson-builder?id=${data.id}`, { replace: true });
      }
    }
    isDirtyRef.current = false;
    setSaving(false);
  }

  function renderBlockEditor(block: ContentBlock, index: number) {
    return (
      <div key={index} className="rounded-xl border border-border bg-adv-card p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-adv-gray uppercase tracking-wider">{block.type}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => moveBlock(index, 'up')} disabled={index === 0} className="p-1 text-adv-gray hover:text-adv-off-white disabled:opacity-30">
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => moveBlock(index, 'down')} disabled={index === form.content_blocks.length - 1} className="p-1 text-adv-gray hover:text-adv-off-white disabled:opacity-30">
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => removeBlock(index)} className="p-1 text-adv-gray hover:text-adv-red transition-colors">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {block.type === 'text' && (
          <textarea
            value={block.content || ''}
            onChange={e => updateBlock(index, { content: e.target.value })}
            placeholder="Write your lesson text here... (Markdown supported)"
            rows={5}
            className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 resize-none"
          />
        )}

        {block.type === 'video' && (
          <div className="space-y-2">
            <input
              value={block.video_id || ''}
              onChange={e => updateBlock(index, { video_id: e.target.value })}
              placeholder="YouTube Video ID (e.g. dQw4w9WgXcQ)"
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                value={block.title || ''}
                onChange={e => updateBlock(index, { title: e.target.value })}
                placeholder="Video title"
                className="rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
              />
              <input
                value={block.channel || ''}
                onChange={e => updateBlock(index, { channel: e.target.value })}
                placeholder="Channel name (e.g. CrashCourse)"
                className="rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
              />
            </div>
          </div>
        )}

        {block.type === 'quiz' && (
          <div className="space-y-2">
            <input
              value={block.question || ''}
              onChange={e => updateBlock(index, { question: e.target.value })}
              placeholder="Quiz question"
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            />
            {(block.options || ['', '', '', '']).map((opt, oi) => (
              <div key={oi} className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={block.correct === oi}
                  onChange={() => updateBlock(index, { correct: oi })}
                  className="accent-adv-teal"
                  title="Mark as correct answer"
                />
                <input
                  value={opt}
                  onChange={e => {
                    const opts = [...(block.options || ['','','',''])];
                    opts[oi] = e.target.value;
                    updateBlock(index, { options: opts });
                  }}
                  placeholder={`Option ${String.fromCharCode(65 + oi)}`}
                  className="flex-1 rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                />
              </div>
            ))}
            <input
              value={block.explanation || ''}
              onChange={e => updateBlock(index, { explanation: e.target.value })}
              placeholder="Explanation (shown after answering)"
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            />
          </div>
        )}

        {(block.type === 'exercise' || block.type === 'ai_discussion' || block.type === 'checkpoint') && (
          <div className="space-y-2">
            <textarea
              value={block.content || ''}
              onChange={e => updateBlock(index, { content: e.target.value })}
              placeholder={block.type === 'exercise' ? 'Exercise instructions...' : block.type === 'ai_discussion' ? 'Discussion prompt (optional)...' : 'Checkpoint description...'}
              rows={3}
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 resize-none"
            />
            {block.type === 'exercise' && (
              <textarea
                value={block.solution || ''}
                onChange={e => updateBlock(index, { solution: e.target.value })}
                placeholder="Solution hint (shown on demand)..."
                rows={2}
                className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 resize-none"
              />
            )}
          </div>
        )}

        {(block.type === 'link' || block.type === 'embed') && (
          <div className="space-y-2">
            <input
              value={block.url || ''}
              onChange={e => updateBlock(index, { url: e.target.value })}
              placeholder="URL"
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            />
            <input
              value={block.title || ''}
              onChange={e => updateBlock(index, { title: e.target.value })}
              placeholder="Title"
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            />
          </div>
        )}

        {block.type === 'divider' && (
          <p className="text-xs text-adv-gray text-center">— section divider —</p>
        )}
      </div>
    );
  }

  return (
    <SchoolLayout>
      <div className="p-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg font-semibold text-adv-white">{lessonId ? 'Edit Lesson' : 'New Lesson'}</h1>
          <div className="flex gap-2">
            <button
              onClick={() => lessonId && navigate(`/school/lesson/${lessonId}`)}
              disabled={!lessonId}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-adv-gray hover:text-adv-off-white transition-colors disabled:opacity-40"
            >
              <Eye className="h-4 w-4" /> Preview
            </button>
            <button
              onClick={() => handleSave(false)}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg border border-adv-teal/40 px-3 py-2 text-sm text-adv-teal hover:bg-adv-teal/10 transition-colors"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Draft
            </button>
            <button
              onClick={() => handleSave(true)}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-adv-teal px-3 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50"
            >
              Publish
            </button>
          </div>
        </div>

        {/* Metadata */}
        <div className="rounded-xl border border-border bg-adv-card p-5 mb-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-adv-gray mb-1 block">Title *</label>
              <input
                value={form.title}
                onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Lesson title"
                className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
              />
            </div>
            <div>
              <label className="text-xs text-adv-gray mb-1 block">Subject ID</label>
              <input
                value={form.subject_id}
                onChange={e => setForm(prev => ({ ...prev, subject_id: e.target.value }))}
                placeholder="e.g. mathematics, history"
                className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-adv-gray mb-1 block">Description</label>
            <input
              value={form.description}
              onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Brief description"
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-adv-gray mb-1 block">Duration (min)</label>
              <input
                type="number"
                value={form.estimated_minutes}
                onChange={e => setForm(prev => ({ ...prev, estimated_minutes: Number(e.target.value) }))}
                className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
              />
            </div>
            <div>
              <label className="text-xs text-adv-gray mb-1 block">Bloom's Level</label>
              <select
                value={form.bloom_level}
                onChange={e => setForm(prev => ({ ...prev, bloom_level: e.target.value }))}
                className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
              >
                {['remember','understand','apply','analyze','evaluate','create'].map(l => (
                  <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-adv-gray mb-1 block">Tier</label>
              <select
                value={form.tier}
                onChange={e => setForm(prev => ({ ...prev, tier: e.target.value }))}
                className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
              >
                <option value="T1">T1 — Primary</option>
                <option value="T2">T2 — Secondary</option>
                <option value="T3">T3 — Gymnasiet</option>
                <option value="T4">T4 — University</option>
              </select>
            </div>
          </div>
        </div>

        {/* Content blocks */}
        <div className="space-y-3 mb-6">
          {form.content_blocks.map((block, i) => renderBlockEditor(block, i))}
        </div>

        {/* Add Block */}
        <div className="rounded-xl border border-dashed border-border p-4">
          <p className="text-xs text-adv-gray mb-3 text-center">Add a content block</p>
          <div className="flex flex-wrap gap-2 justify-center">
            {BLOCK_TYPES.map(bt => {
              const Icon = bt.icon;
              return (
                <button
                  key={bt.type}
                  onClick={() => addBlock(bt.type)}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-adv-card px-3 py-1.5 text-xs hover:border-adv-teal/40 transition-colors"
                >
                  <Icon className={`h-3.5 w-3.5 ${bt.color}`} />
                  <span className="text-adv-off-white">{bt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {form.content_blocks.length === 0 && (
          <p className="text-center text-xs text-adv-gray mt-4">No blocks yet. Add your first content block above.</p>
        )}
      </div>
    </SchoolLayout>
  );
}
