import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchWithAuth } from '@/lib/api';
import {
  Presentation, Plus, Clock, Trash2, Download, ChevronRight,
  Users, Target, LayoutTemplate, FileUp,
} from 'lucide-react';

interface PresentationRecord {
  id: string;
  title: string;
  purpose: string;
  audience: string;
  style: string;
  slide_count: number;
  status: 'draft' | 'generating' | 'ready' | 'failed';
  filename: string | null;
  created_at: string;
}

const QUICK_TEMPLATES = [
  {
    id: 'board-update',
    label: 'Board Update',
    icon: '🏛️',
    description: 'Executive summary of key metrics, risks, and decisions needed',
    prompt: 'I need to create a board update presentation covering key metrics, risks, and decisions needed from the board.',
    style: 'dark-professional',
    slides: 10,
  },
  {
    id: 'client-pitch',
    label: 'Client Pitch',
    icon: '🤝',
    description: 'Problem we solve, our approach, proof points, and next steps',
    prompt: 'I need to create a client pitch presentation showing how we solve their problem and why they should work with us.',
    style: 'light-clean',
    slides: 12,
  },
  {
    id: 'regulatory-briefing',
    label: 'Regulatory Briefing',
    icon: '📋',
    description: 'Context, requirements, impact analysis, and compliance roadmap',
    prompt: 'I need to create a regulatory briefing presentation covering new requirements, their impact, and our compliance plan.',
    style: 'dark-professional',
    slides: 14,
  },
  {
    id: 'training-session',
    label: 'Training Session',
    icon: '🎓',
    description: 'Learning objectives, core modules, examples, and knowledge checks',
    prompt: 'I need to create a training session presentation with clear learning objectives, content modules, and knowledge checks.',
    style: 'light-clean',
    slides: 16,
  },
  {
    id: 'gap-analysis',
    label: 'Gap Analysis Results',
    icon: '🔍',
    description: 'Current state, gaps identified, priority actions, implementation plan',
    prompt: 'I need to present gap analysis results showing the current state, identified gaps, and a prioritised action plan.',
    style: 'dark-professional',
    slides: 12,
  },
  {
    id: 'project-status',
    label: 'Project Status',
    icon: '📊',
    description: 'Progress, risks, decisions needed, next milestones',
    prompt: 'I need to create a project status update covering progress, risks, decisions needed, and upcoming milestones.',
    style: 'dark-professional',
    slides: 8,
  },
];

const STYLE_LABELS: Record<string, string> = {
  'dark-professional': 'Dark / Professional',
  'light-clean': 'Light / Clean',
  'data-heavy': 'Data Heavy',
  'storytelling': 'Storytelling',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'text-adv-gray bg-adv-card',
  generating: 'text-adv-gold bg-adv-card',
  ready: 'text-adv-green bg-adv-teal-dim',
  failed: 'text-adv-red bg-adv-card',
};

export default function PresentationsLandingPage() {
  const navigate = useNavigate();
  const [history, setHistory] = useState<PresentationRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    fetch('/api/presentations')
      .then((r) => r.json())
      .then((data) => setHistory(Array.isArray(data) ? data : []))
      .catch(() => setHistory([]))
      .finally(() => setLoadingHistory(false));
  }, []);

  function handleNew(templatePrompt?: string) {
    const params = templatePrompt
      ? `?prompt=${encodeURIComponent(templatePrompt)}`
      : '';
    navigate(`/presentations/builder${params}`);
  }

  function handleResume(id: string) {
    navigate(`/presentations/builder?id=${id}`);
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('Delete this presentation?')) return;
    await fetchWithAuth(`/api/presentations/${id}`, { method: 'DELETE' });
    setHistory((prev) => prev.filter((p) => p.id !== id));
  }

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white p-6 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-adv-teal-dim">
              <Presentation className="h-6 w-6 text-adv-teal" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-adv-white">Presentations</h1>
              <p className="text-sm text-adv-gray">
                AI-guided presentation builder with a visual communications expert
              </p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/presentations/builder?upload=1')}
            className="flex items-center gap-2 px-4 py-2 bg-adv-card hover:bg-adv-dark-2 border border-adv-card hover:border-adv-teal text-adv-off-white rounded-lg transition-colors text-sm"
          >
            <FileUp className="h-4 w-4 text-adv-teal" />
            From Document
          </button>
          <button
            onClick={() => handleNew()}
            className="flex items-center gap-2 px-4 py-2 bg-adv-teal hover:bg-adv-teal-dark text-adv-dark font-semibold rounded-lg transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Presentation
          </button>
        </div>
      </div>

      {/* Quick Templates */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <LayoutTemplate className="h-4 w-4 text-adv-gray" />
          <h2 className="text-sm font-medium text-adv-gray uppercase tracking-wider">Quick Start</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {QUICK_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              onClick={() => handleNew(tpl.prompt)}
              className="text-left p-4 rounded-xl bg-adv-card border border-adv-card hover:border-adv-teal hover:shadow-lg transition-all group"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xl">{tpl.icon}</span>
                <ChevronRight className="h-4 w-4 text-adv-gray opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="font-medium text-adv-white text-sm mb-1">{tpl.label}</div>
              <div className="text-xs text-adv-gray leading-relaxed">{tpl.description}</div>
              <div className="flex items-center gap-3 mt-3 text-xs text-adv-gray">
                <span>{tpl.slides} slides</span>
                <span>·</span>
                <span>{STYLE_LABELS[tpl.style]}</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Recent Presentations */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-adv-gray" />
          <h2 className="text-sm font-medium text-adv-gray uppercase tracking-wider">Recent</h2>
        </div>

        {loadingHistory ? (
          <div className="text-sm text-adv-gray py-4">Loading...</div>
        ) : history.length === 0 ? (
          <div className="py-12 rounded-xl border border-dashed border-adv-card text-center space-y-2">
            <Presentation className="h-8 w-8 text-adv-gray mx-auto" />
            <p className="text-sm text-adv-gray">No presentations yet — click Quick Start or New Presentation above</p>
          </div>
        ) : (
          <div className="space-y-2">
            {history.map((p) => (
              <div
                key={p.id}
                onClick={() => handleResume(p.id)}
                className="flex items-center justify-between p-4 rounded-xl bg-adv-card border border-transparent hover:border-adv-teal cursor-pointer transition-all group"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="p-2 rounded-lg bg-adv-dark-2 shrink-0">
                    <Presentation className="h-4 w-4 text-adv-teal" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-adv-white text-sm truncate">{p.title}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {p.audience && (
                        <span className="flex items-center gap-1 text-xs text-adv-gray">
                          <Users className="h-3 w-3" />
                          {p.audience.length > 40 ? p.audience.slice(0, 40) + '…' : p.audience}
                        </span>
                      )}
                      {p.purpose && !p.audience && (
                        <span className="flex items-center gap-1 text-xs text-adv-gray">
                          <Target className="h-3 w-3" />
                          {p.purpose.length > 50 ? p.purpose.slice(0, 50) + '…' : p.purpose}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-4">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[p.status] || STATUS_COLORS.draft}`}>
                    {p.status}
                  </span>
                  {p.slide_count && (
                    <span className="text-xs text-adv-gray hidden sm:block">{p.slide_count} slides</span>
                  )}
                  <span className="text-xs text-adv-gray hidden md:block">
                    {new Date(p.created_at).toLocaleDateString()}
                  </span>
                  {p.status === 'ready' && p.filename && (
                    <a
                      href={`/api/presentations/download/${p.filename}`}
                      download
                      onClick={(e) => e.stopPropagation()}
                      className="p-1 rounded hover:text-adv-teal text-adv-gray transition-colors"
                      title="Download .pptx"
                    >
                      <Download className="h-4 w-4" />
                    </a>
                  )}
                  <button
                    onClick={(e) => handleDelete(p.id, e)}
                    className="p-1 rounded hover:text-adv-red text-adv-gray opacity-0 group-hover:opacity-100 transition-all"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
