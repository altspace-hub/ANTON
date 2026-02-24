import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Terminal, FileCode, AppWindow, Building2, GitBranch, Clock, ArrowRight, FileText, Target } from 'lucide-react';
import CodingBreadcrumb from '@/components/coding/CodingBreadcrumb';
import QualityScore from '@/components/coding/QualityScore';

interface RecentItem {
  id: string;
  type: string;
  title: string;
  status: string;
  timestamp: string;
  quality_score?: number;
}

export default function CodingLandingPage() {
  const navigate = useNavigate();
  const [recentActivity, setRecentActivity] = useState<RecentItem[]>([]);

  useEffect(() => {
    const headers: Record<string, string> = {};
    const token = localStorage.getItem('openexpert-token');
    if (token) headers.Authorization = `Bearer ${token}`;

    fetch('/api/coding/activity?limit=10', { headers })
      .then((r) => r.ok ? r.json() : [])
      .then(setRecentActivity)
      .catch(() => {});
  }, []);

  const tiers = [
    {
      id: 'instruction-builder',
      label: 'AI Code Instruction Builder',
      tier: 'Planning',
      icon: FileText,
      color: 'border-purple-400',
      bgColor: 'bg-purple-400/10',
      textColor: 'text-purple-400',
      description: 'Plan a project with expert guidance, then export professional instruction files for Claude Code, Codex, or Mistral Code.',
      features: ['Guided discovery', 'Expert panel review', 'Tool-specific exports', 'Multi-file instructions'],
      route: '/coding/instruction-builder',
    },
    {
      id: 'alignment-reviewer',
      label: 'Project Alignment Reviewer',
      tier: 'Governance',
      icon: Target,
      color: 'border-cyan-400',
      bgColor: 'bg-cyan-400/10',
      textColor: 'text-cyan-400',
      description: 'Review an existing project against its original goals. Get traffic-light assessment and steering instructions.',
      features: ['Codebase ingestion', '6-dimension analysis', 'Expert review', 'Steering instructions'],
      route: '/coding/alignment-reviewer',
    },
    {
      id: 'review',
      label: 'Code Review & Explain',
      tier: 'Tier 1',
      icon: GitBranch,
      color: 'border-adv-teal',
      bgColor: 'bg-adv-teal-dim',
      textColor: 'text-adv-teal',
      description: 'Review code through expert lenses: security, compliance, architecture, product alignment. Diff-aware re-review and dependency auditing.',
      features: ['Multi-lens review', 'Security analysis', 'Dependency audit', 'Diff comparison'],
      route: '/coding/review',
    },
    {
      id: 'script-lite',
      label: 'Script Lite',
      tier: 'Tier 2',
      icon: FileCode,
      color: 'border-adv-green',
      bgColor: 'bg-adv-green/10',
      textColor: 'text-adv-green',
      description: 'Generate single Python scripts from natural language with guided questioning and sandbox preview.',
      features: ['Python scripts', 'Guided questions', 'Sandbox preview', 'Copy & download'],
      route: '/coding/script-lite',
    },
    {
      id: 'script-medium',
      label: 'Script Medium',
      tier: 'Tier 3',
      icon: AppWindow,
      color: 'border-adv-blue',
      bgColor: 'bg-adv-blue/10',
      textColor: 'text-adv-blue',
      description: 'Build complete applications (React, HTML, Python, Node.js) with live preview and iterative refinement.',
      features: ['Multi-file apps', 'Live preview', 'React/HTML/Python/Node', 'Iterative refinement'],
      route: '/coding/script-medium',
    },
    {
      id: 'coding-large',
      label: 'Coding Large',
      tier: 'Tier 4',
      icon: Building2,
      color: 'border-adv-gold',
      bgColor: 'bg-adv-gold/10',
      textColor: 'text-adv-gold',
      description: 'Professional AI-led software development with 7-phase lifecycle, expert panel reviews, release planning, and governance.',
      features: ['7-phase lifecycle', 'Expert panels', 'Release planning', 'Cost tracking', 'Goal alignment'],
      route: '/coding/large',
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <CodingBreadcrumb items={[]} />

      <div>
        <h1 className="flex items-center gap-3 text-2xl font-bold text-adv-white">
          <Terminal className="h-7 w-7 text-adv-teal" />
          Coding
        </h1>
        <p className="mt-1 text-sm text-adv-gray">
          AI-powered software development — from code review to full project delivery
        </p>
      </div>

      {/* Tier Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {tiers.map((tier) => {
          const Icon = tier.icon;
          return (
            <button
              key={tier.id}
              onClick={() => navigate(tier.route)}
              className={`group rounded-xl border-2 ${tier.color} bg-adv-card p-5 text-left transition-all hover:shadow-lg hover:shadow-adv-teal/5`}
            >
              <div className="flex items-start justify-between">
                <div className={`rounded-lg ${tier.bgColor} p-2.5`}>
                  <Icon className={`h-6 w-6 ${tier.textColor}`} />
                </div>
                <span className={`rounded-full ${tier.bgColor} px-2.5 py-0.5 text-xs font-semibold ${tier.textColor}`}>
                  {tier.tier}
                </span>
              </div>
              <h3 className="mt-3 text-lg font-semibold text-adv-white">{tier.label}</h3>
              <p className="mt-1 text-sm text-adv-gray">{tier.description}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {tier.features.map((f) => (
                  <span key={f} className="rounded-full bg-adv-dark px-2 py-0.5 text-[10px] text-adv-off-white">
                    {f}
                  </span>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-1 text-xs text-adv-gray group-hover:text-adv-teal transition-colors">
                Get started <ArrowRight className="h-3 w-3" />
              </div>
            </button>
          );
        })}
      </div>

      {/* Recent Activity */}
      {recentActivity.length > 0 && (
        <div className="rounded-xl border border-border bg-adv-card p-5">
          <h2 className="mb-3 text-sm font-semibold text-adv-white">Recent Activity</h2>
          <div className="space-y-2">
            {recentActivity.map((item) => (
              <div key={item.id} className="flex items-center gap-3 rounded-lg bg-adv-dark px-3 py-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  item.type === 'project' ? 'bg-adv-gold/10 text-adv-gold' :
                  item.type === 'review' ? 'bg-adv-teal-dim text-adv-teal' :
                  'bg-adv-blue/10 text-adv-blue'
                }`}>
                  {item.type}
                </span>
                <span className="flex-1 truncate text-sm text-adv-off-white">{item.title || 'Untitled'}</span>
                {item.quality_score !== undefined && item.quality_score > 0 && (
                  <QualityScore score={item.quality_score} compact />
                )}
                <span className="text-xs text-adv-gray">{item.status}</span>
                <span className="flex items-center gap-1 text-[10px] text-adv-gray-med">
                  <Clock className="h-2.5 w-2.5" />
                  {new Date(item.timestamp).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
